import * as Cesium from "cesium"
import type { Layer } from "../../Layer"
import type { SatelliteData, SatelliteFilter, SatelliteRefs } from "./satelliteTypes"
import { classifySatellite } from "../../../satellites/orbit"
import { SatelliteEventHandlers } from "./eventHandlers"
import { SatelliteEntityFactory } from "./entityFactory"

/**
 * Satellite layer implementation
 * Manages satellite data, entities, and orbit paths on a Cesium viewer
 * Uses CustomDataSource for efficient entity management
 *
 * Refactored to separate concerns:
 * - Event handling -> eventHandlers.ts
 * - Entity creation -> entityFactory.ts
 * - Constants -> constants.ts
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

    // Lazy load data - only render if data already loaded
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
   * Load satellite data into the layer
   * Uses lazy loading - only loads once
   */
  loadData(data: SatelliteData[]): void {
    if (this.dataLoaded) {
      this.satelliteData = data
      return
    }

    this.satelliteData = data
    this.dataLoaded = true

    // Render immediately if layer is already enabled
    if (this.enabled) {
      this.renderSatellites()
    }
  }

  update(): void {
    if (!this.enabled || !this.dataLoaded) return
    this.updatePositions()
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

    filtered.forEach((sat) => {
      this.createSatelliteEntity(sat)
    })
  }

  /**
   * Create a single satellite entity using the factory
   */
  private createSatelliteEntity(sat: SatelliteData): void {
    const id = `${sat.name}-${sat.line1.slice(2, 7)}`
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
   * Update satellite positions using the factory
   */
  private updatePositions(): void {
    Object.keys(this.refs.satrecs).forEach((id) => {
      const satrec = this.refs.satrecs[id]
      const entity = this.refs.entities[id]

      if (satrec && entity) {
        SatelliteEntityFactory.updatePositionSamples(entity, satrec)
      }
    })
  }

  /**
   * Set up Cesium clock
   */
  private setupClock(): void {
    this.viewer.clock.shouldAnimate = true
    this.viewer.clock.multiplier = 1
    this.viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP
    this.viewer.clock.currentTime = Cesium.JulianDate.now()
  }

  /**
   * Set up event handlers using the dedicated handler class
   */
  private setupEventHandlers(): void {
    this.eventHandlers = new SatelliteEventHandlers(this.viewer, this.refs)
    this.eventHandlers.setupHandlers()
  }

  /**
   * Clear all satellite entities
   */
  private clearEntities(): void {
    this.eventHandlers?.clearOrbitPaths()

    const entities = this.dataSource?.entities ?? this.viewer.entities

    Object.values(this.refs.entities).forEach((entity) => {
      entities.remove(entity)
    })

    this.refs.entities = {}
    this.refs.satrecs = {}
  }
}
