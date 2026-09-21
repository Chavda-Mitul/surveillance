import * as Cesium from "cesium"
import type { Layer } from "../../Layer"
import type { SatelliteData, SatelliteFilter, SatelliteRefs } from "./satelliteTypes"
import { classifySatellite } from "../../../satellites/orbit"
import { propagationWorker } from "../../../satellites/workerPool"
import { SatelliteEventHandlers } from "./eventHandlers"
import { SatelliteEntityFactory } from "./entityFactory"

/**
 * Satellite layer implementation
 * Manages satellite data, entities, and orbit paths on a Cesium viewer
 *
 * SGP4 propagation is offloaded to a Web Worker so CPU-heavy math
 * never blocks the main UI thread or stutters Cesium's render loop.
 */

// Internal flag to check if a worker update is already in flight
let workerUpdatePending = false

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
  }
  private filter: SatelliteFilter = "gps"
  private satelliteData: SatelliteData[] = []
  private dataLoaded = false
  private eventHandlers: SatelliteEventHandlers | null = null

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
    if (this.dataLoaded) {
      this.satelliteData = data
      return
    }

    this.satelliteData = data
    this.dataLoaded = true

    // Initialize the worker in background — never blocks rendering
    this.initWorker(data)

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
      console.error("[SatelliteLayer] Worker init failed, falling back to main thread:", err)
    }
  }

  update(): void {
    if (!this.enabled || !this.dataLoaded) return

    // Use worker for position updates if ready, otherwise fall back to main thread
    if (propagationWorker.isReady() && !workerUpdatePending) {
      this.updatePositionsViaWorker()
    } else if (!propagationWorker.isReady()) {
      this.updatePositionsMainThread()
    }
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
   * Render satellites based on current filter
   */
  private renderSatellites(): void {
    this.clearEntities()

    const filtered = this.satelliteData.filter((sat) => {
      if (this.filter === "all") return true
      return classifySatellite(sat.name) === this.filter
    })

    filtered.forEach((sat, index) => {
      this.createSatelliteEntity(sat, index)
    })
  }

  /**
   * Create a single satellite entity
   */
  private createSatelliteEntity(sat: SatelliteData, index: number): void {
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
   * Update positions via Web Worker (non-blocking)
   * Fire-and-forget: results arrive asynchronously and update entities
   */
  private updatePositionsViaWorker(): void {
    workerUpdatePending = true

    const timestamps = SatelliteEntityFactory.getSampleTimestamps()
    const jobs: Array<{ id: string; timestamps: number[] }> = []

    for (const id of Object.keys(this.refs.entities)) {
      jobs.push({ id, timestamps })
    }

    if (jobs.length === 0) {
      workerUpdatePending = false
      return
    }

    propagationWorker
      .propagate(jobs)
      .then((results) => {
        SatelliteEntityFactory.applyBatchResults(
          this.refs.entities,
          results,
          timestamps
        )
        workerUpdatePending = false
      })
      .catch((err) => {
        console.warn("[SatelliteLayer] Worker update failed:", err)
        workerUpdatePending = false
      })
  }

  /**
   * Fallback: update positions on the main thread (when worker is unavailable)
   */
  private updatePositionsMainThread(): void {
    Object.keys(this.refs.satrecs).forEach((id) => {
      const satrec = this.refs.satrecs[id]
      const entity = this.refs.entities[id]

      if (satrec && entity) {
        SatelliteEntityFactory.updatePositionSamples(entity, satrec)
      }
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
  }

  hasLoadData(): boolean {
    return this.dataLoaded
  }
}