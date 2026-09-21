import * as Cesium from "cesium"
import type { Layer } from "../../Layer"
import type { SatelliteData, SatelliteFilter, SatelliteRefs } from "./satelliteTypes"
import { classifySatellite } from "../../../satellites/orbit"
import { propagationWorker } from "../../../satellites/workerPool"
import { SatelliteEventHandlers } from "./eventHandlers"
import { SatelliteEntityFactory } from "./entityFactory"

/**
 * Satellite layer implementation
 * Manages satellite data, entities, and orbit paths on a Cesium viewer.
 *
 * ALL SGP4 propagation (initial + periodic) runs in a Web Worker so
 * CPU-heavy math never blocks the main UI thread or stutters Cesium's
 * render loop.
 *
 * Entities are created with an empty SampledPositionProperty. The first
 * batch of position samples arrives asynchronously from the worker,
 * typically within one animation frame. Periodic updates follow the
 * same pattern — fire-and-forget with zero main-thread math.
 */

export class SatelliteLayer implements Layer {
  readonly id = "satellite"
  readonly name = "Satellites"

  private viewer: Cesium.Viewer
  private dataSource: Cesium.CustomDataSource | null = null
  private enabled = false
  private refs: SatelliteRefs = {
    entities: {},
    satrecs: {},
    orbitPaths: [],
    positionProperties: {},
  }
  private filter: SatelliteFilter = "gps"
  private satelliteData: SatelliteData[] = []
  private dataLoaded = false
  private eventHandlers: SatelliteEventHandlers | null = null
  /** Ensures only one worker request is in flight at any time */
  private workerUpdatePending = false

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true

    this.setupClock()
    this.setupEventHandlers()

    if (this.dataLoaded) {
      this.renderSatellites()
    }
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.clearEntities()
  }

  /**
   * Load satellite data and initialize the Web Worker
   */
  loadData(data: SatelliteData[]): void {
    this.satelliteData = data

    if (!this.dataLoaded) {
      this.dataLoaded = true
      // Start worker init — the Promise is not awaited because entities
      // are created immediately (without SGP4 math). The worker's
      // results arrive asynchronously to fill in positions.
      this.initWorker(data)
    }

    // Always re-render if enabled (handles mode switching)
    if (this.enabled) {
      this.renderSatellites()
    }
  }

  /**
   * Initialize the propagation worker with TLE data
   */
  private async initWorker(data: SatelliteData[]): Promise<void> {
    if (propagationWorker.isReady()) return

    const satellites = data.map((sat, index) => ({
      id: this.makeEntityId(sat, index),
      tle1: sat.line1,
      tle2: sat.line2,
    }))

    try {
      await propagationWorker.initialize(satellites)
    } catch (err) {
      console.error("[SatelliteLayer] Worker init failed:", err)
    }
  }

  /**
   * Periodic update tick — called by LayerManager every ~15s.
   * Offloads all SGP4 math to the Web Worker.
   */
  update(): void {
    if (!this.enabled || !this.dataLoaded) return
    if (!propagationWorker.isReady()) return
    if (this.workerUpdatePending) return

    this.updatePositionsViaWorker()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getEntities(): Cesium.Entity[] {
    return Object.values(this.refs.entities)
  }

  setFilter(filter: SatelliteFilter): void {
    this.filter = filter
    if (this.enabled && this.dataLoaded) {
      this.renderSatellites()
    }
  }

  getFilter(): SatelliteFilter {
    return this.filter
  }

  stopTracking(): void {
    this.viewer.trackedEntity = undefined
    this.eventHandlers?.clearOrbitPaths()
  }

  setDataSource(dataSource: Cesium.CustomDataSource): void {
    this.dataSource = dataSource
  }

  /**
   * Render satellites based on current filter.
   *
   * Entities are created WITHOUT position samples — no SGP4 on the
   * main thread. After all entities exist, the Web Worker is asked to
   * compute the initial batch of positions.
   */
  private renderSatellites(): void {
    try {
      this.clearEntities()

      const filtered = this.satelliteData.filter((sat) => {
        if (this.filter === "all") return true
        return classifySatellite(sat.name) === this.filter
      })

      filtered.forEach((sat, index) => {
        this.createSatelliteEntity(sat, index)
      })

      // Entities are ready (but invisible — no position samples yet).
      // Ask the worker to compute the first batch.
      this.scheduleInitialSamples()
    } catch (err) {
      console.error("[SatelliteLayer] renderSatellites failed:", err)
    }
  }

  /**
   * Fire the initial batch of position propagation via the Web Worker.
   *
   * If the worker is still loading satrecs, retry once after a brief
   * delay (200ms covers the common init window). If the worker never
   * becomes ready, positions will be resolved on the next periodic
   * update() tick from LayerManager (~15s).
   */
  private scheduleInitialSamples(): void {
    if (propagationWorker.isReady()) {
      this.fireWorkerBatch()
      return
    }

    // Worker still loading satrecs — give it one short retry
    setTimeout(() => {
      if (propagationWorker.isReady()) {
        this.fireWorkerBatch()
      }
      // If still not ready, the next update() tick will catch up.
    }, 200)
  }

  /**
   * Send a batch propagation request to the worker and apply the
   * results to all entities.
   */
  private fireWorkerBatch(): void {
    const timestamps = SatelliteEntityFactory.getSampleTimestamps()
    const jobs: Array<{ id: string; timestamps: number[] }> = []

    for (const id of Object.keys(this.refs.entities)) {
      jobs.push({ id, timestamps })
    }

    if (jobs.length === 0) return

    propagationWorker
      .propagate(jobs)
      .then((results) => {
        SatelliteEntityFactory.applyBatchResults(
          this.refs.entities,
          results,
          timestamps
        )
      })
      .catch((err) => {
        console.warn("[SatelliteLayer] Worker batch failed:", err)
      })
  }

  /**
   * Create a single satellite entity, wrapped in try-catch.
   *
   * The entity is created WITHOUT position samples — the position
   * property is empty until the Web Worker responds.
   */
  private createSatelliteEntity(sat: SatelliteData, index: number): void {
    try {
      const id = this.makeEntityId(sat, index)
      const entities = this.dataSource?.entities ?? this.viewer.entities

      const result = SatelliteEntityFactory.createEntity({
        id,
        satelliteData: sat,
        entityCollection: entities,
      })

      if (result) {
        this.refs.entities[id] = result.entity
        this.refs.satrecs[id] = result.satrec
        this.refs.positionProperties[id] = result.positionProperty
      }
    } catch (err) {
      console.warn(`[SatelliteLayer] Failed to create entity for ${sat.name}:`, err)
    }
  }

  /**
   * Build a stable entity ID from satellite data
   */
  private makeEntityId(sat: SatelliteData, index: number): string {
    // Try to use NORAD catalog number from line1 (columns 3-7)
    const noradId = sat.line1.slice(2, 7).trim()
    if (noradId) return `sat-${noradId}`
    return `sat-${index}`
  }

  // ─── Position Updates ───────────────────────────────────────────

  /**
   * Update positions via Web Worker (non-blocking).
   * Fire-and-forget: results arrive asynchronously and update entities.
   */
  private updatePositionsViaWorker(): void {
    this.workerUpdatePending = true

    const timestamps = SatelliteEntityFactory.getSampleTimestamps()
    const jobs: Array<{ id: string; timestamps: number[] }> = []

    for (const id of Object.keys(this.refs.entities)) {
      jobs.push({ id, timestamps })
    }

    if (jobs.length === 0) {
      this.workerUpdatePending = false
      return
    }

    propagationWorker
      .propagate(jobs)
      .then((results) => {
        try {
          SatelliteEntityFactory.applyBatchResults(
            this.refs.entities,
            results,
            timestamps
          )
        } catch (err) {
          console.warn("[SatelliteLayer] applyBatchResults threw:", err)
        }
        this.workerUpdatePending = false
      })
      .catch((err) => {
        console.warn("[SatelliteLayer] Worker update failed:", err)
        this.workerUpdatePending = false
      })
  }

  // ─── Setup ──────────────────────────────────────────────────────

  private setupClock(): void {
    this.viewer.clock.shouldAnimate = true
    this.viewer.clock.multiplier = 1
    this.viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP
    this.viewer.clock.currentTime = Cesium.JulianDate.now()
  }

  private setupEventHandlers(): void {
    this.eventHandlers = new SatelliteEventHandlers(this.viewer, this.refs)
    this.eventHandlers.setupHandlers()
  }

  private clearEntities(): void {
    this.eventHandlers?.clearOrbitPaths()

    const entities = this.dataSource?.entities ?? this.viewer.entities

    Object.values(this.refs.entities).forEach((entity) => {
      entities.remove(entity)
    })

    this.refs.entities = {}
    this.refs.satrecs = {}
    this.refs.positionProperties = {}
  }

  hasLoadData(): boolean {
    return this.dataLoaded
  }
}