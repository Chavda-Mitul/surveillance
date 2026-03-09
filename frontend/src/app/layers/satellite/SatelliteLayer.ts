import * as Cesium from "cesium"
import type { Layer } from "../../Layer"
import type { SatelliteData, SatelliteFilter, SatelliteRefs } from "./satelliteTypes"
import { createSatrec, getPositionAtTime, classifySatellite, getOrbitSegments } from "../../../satellites/orbit"

/**
 * Satellite layer implementation
 * Manages satellite data, entities, and orbit paths on a Cesium viewer
 * Uses CustomDataSource for efficient entity management
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
  private lastHovered: Cesium.Entity | null = null
  private dataLoaded = false

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true

    // Set up Cesium clock
    this.setupClock()

    // Set up event handlers
    this.setupEventHandlers()

    // Lazy load data if not already loaded
    if (!this.dataLoaded) {
      // Data will be loaded via loadData() method
      // This prevents reloading when switching between modes
      return
    }

    // Data already loaded, render immediately
    this.renderSatellites()
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false

    // Clear all satellite entities (but keep data)
    this.clearEntities()
  }

  /**
   * Load satellite data into the layer
   * Should be called after enable()
   * Uses lazy loading - only loads once
   */
  loadData(data: SatelliteData[]): void {
    if (this.dataLoaded) {
      // Data already loaded, just update reference
      this.satelliteData = data
      return
    }

    this.satelliteData = data
    this.dataLoaded = true

    // If layer is already enabled, render immediately
    if (this.enabled) {
      this.renderSatellites()
    }
  }

  update(): void {
    if (!this.enabled || !this.dataLoaded) return

    // Update positions periodically
    this.updatePositions()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getEntities(): Cesium.Entity[] {
    return Object.values(this.refs.entities)
  }

  /**
   * Set the satellite filter
   */
  setFilter(filter: SatelliteFilter): void {
    this.filter = filter
    if (this.enabled && this.dataLoaded) {
      this.renderSatellites()
    }
  }

  /**
   * Get current filter
   */
  getFilter(): SatelliteFilter {
    return this.filter
  }

  /**
   * Stop tracking the current entity
   */
  stopTracking(): void {
    this.viewer.trackedEntity = undefined

    // Remove orbit paths
    this.refs.orbitPaths.forEach((e) => this.viewer.entities.remove(e))
    this.refs.orbitPaths = []
  }

  /**
   * Set the data source for this layer
   * Called by LayerManager after registration
   */
  setDataSource(dataSource: Cesium.CustomDataSource): void {
    this.dataSource = dataSource
  }

  /**
   * Render satellites based on current filter
   */
  private renderSatellites(): void {
    // Clear existing entities
    this.clearEntities()

    // Filter satellites
    const filtered = this.satelliteData.filter((sat) => {
      if (this.filter === "all") return true
      return classifySatellite(sat.name) === this.filter
    })

    // Create entities for each satellite
    filtered.forEach((sat) => {
      this.createSatelliteEntity(sat)
    })
  }

  /**
   * Create a single satellite entity
   */
  private createSatelliteEntity(sat: SatelliteData): void {
    const satrec = createSatrec(sat.line1, sat.line2)
    const id = `${sat.name}-${sat.line1.slice(2, 7)}`
    const type = classifySatellite(sat.name)

    if (!satrec) return

    this.refs.satrecs[id] = satrec

    const isISS = type === "iss"
    const color = this.getSatelliteColor(type)

    // Distance-based scaling
    const scaleByDistance = new Cesium.NearFarScalar(
      1.0e5,
      1.2,
      2.0e7,
      0.05
    )

    // Labels only show when close to Earth
    const labelDistanceCondition = new Cesium.DistanceDisplayCondition(0, 2000000)

    // Create sampled position property for smooth animation
    const positionProperty = new Cesium.SampledPositionProperty()
    positionProperty.setInterpolationOptions({
      interpolationDegree: 2,
      interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
    })

    // Pre-populate with position samples
    const now = Cesium.JulianDate.now()
    const updateInterval = 30
    const numSamples = 20

    for (let i = -2; i < numSamples; i++) {
      const time = Cesium.JulianDate.addSeconds(now, i * updateInterval, new Cesium.JulianDate())
      const position = getPositionAtTime(satrec, time)

      if (position) {
        const cartesian = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt)
        positionProperty.addSample(time, cartesian)
      }
    }

    // Determine which entity collection to use
    const entities = this.dataSource?.entities ?? this.viewer.entities

    // Create Cesium entity
    const entity = entities.add({
      id,
      position: positionProperty,
      availability: new Cesium.TimeIntervalCollection([
        new Cesium.TimeInterval({
          start: Cesium.JulianDate.addSeconds(now, -60, new Cesium.JulianDate()),
          stop: Cesium.JulianDate.addSeconds(now, numSamples * updateInterval, new Cesium.JulianDate()),
        }),
      ]),
      ...(isISS
        ? {
            billboard: {
              image: "/icons/international-space-station.svg",
              width: 48,
              height: 48,
              scaleByDistance: scaleByDistance,
              color: color,
            },
            label: {
              text: sat.name,
              font: "16px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -30),
              distanceDisplayCondition: labelDistanceCondition,
              show: new Cesium.ConstantProperty(true),
            },
          }
        : {
            point: {
              pixelSize: 4,
              color: color,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              scaleByDistance: scaleByDistance,
            },
            label: {
              text: sat.name,
              font: "12px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -15),
              distanceDisplayCondition: labelDistanceCondition,
              show: new Cesium.ConstantProperty(false),
            },
          }),
    })

    this.refs.entities[id] = entity
  }

  /**
   * Update satellite positions
   */
  private updatePositions(): void {
    const now = Cesium.JulianDate.now()
    const updateInterval = 30
    const numSamples = 20

    Object.keys(this.refs.satrecs).forEach((id) => {
      const satrec = this.refs.satrecs[id]
      const entity = this.refs.entities[id]

      if (!satrec || !entity) return
      if (!entity.position) return

      const positionProperty = entity.position as Cesium.SampledPositionProperty

      // Add new position samples
      for (let i = 0; i < numSamples; i++) {
        const time = Cesium.JulianDate.addSeconds(now, i * updateInterval, new Cesium.JulianDate())
        const position = getPositionAtTime(satrec, time)

        if (position) {
          const cartesian = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt)

          const existingSamples = positionProperty.getValue(time)
          if (!existingSamples) {
            positionProperty.addSample(time, cartesian)
          }
        }
      }

      // Update availability
      entity.availability = new Cesium.TimeIntervalCollection([
        new Cesium.TimeInterval({
          start: Cesium.JulianDate.addSeconds(now, -60, new Cesium.JulianDate()),
          stop: Cesium.JulianDate.addSeconds(now, numSamples * updateInterval, new Cesium.JulianDate()),
        }),
      ])
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
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Set up click handler for orbit paths
    this.viewer.screenSpaceEventHandler?.setInputAction(
      (click: { position: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(click.position)

        if (Cesium.defined(picked) && picked.id) {
          const entity = picked.id as Cesium.Entity

          // Show label on click
          if (entity.label) {
            ;(entity.label as unknown as { show: boolean }).show = true
          }

          // Fly to entity
          this.viewer.flyTo(entity, {
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 500000),
            duration: 1.5,
          })
        }
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    )

    // Set up double-click handler for orbit paths
    this.viewer.screenSpaceEventHandler?.setInputAction(
      (click: { position: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(click.position)

        if (!Cesium.defined(picked) || !picked.id) return

        const entity = picked.id as Cesium.Entity
        this.viewer.trackedEntity = entity

        const satrec = this.refs.satrecs[entity.id]
        if (!satrec) return

        // Remove existing orbit paths
        this.refs.orbitPaths.forEach((e) => this.viewer.entities.remove(e))
        this.refs.orbitPaths = []

        // Generate orbit path
        const { positions } = getOrbitSegments(satrec)

        if (positions.length > 1) {
          const orbitEntity = this.viewer.entities.add({
            polyline: {
              positions: positions,
              width: 2,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: Cesium.Color.YELLOW.withAlpha(0.7),
              }),
              arcType: Cesium.ArcType.NONE,
            },
          })
          this.refs.orbitPaths.push(orbitEntity)
        }
      },
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    )

    // Set up hover handler
    this.viewer.screenSpaceEventHandler?.setInputAction(
      (movement: { endPosition: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(movement.endPosition)

        // Hide last hovered label
        if (this.lastHovered?.label) {
          ;(this.lastHovered.label as unknown as { show: boolean }).show = false
        }

        if (Cesium.defined(picked) && picked.id?.label) {
          ;(picked.id.label as unknown as { show: boolean }).show = true
          this.lastHovered = picked.id
        } else {
          this.lastHovered = null
        }
      },
      Cesium.ScreenSpaceEventType.MOUSE_MOVE
    )
  }

  /**
   * Clear all satellite entities
   */
  private clearEntities(): void {
    // Remove orbit paths
    this.refs.orbitPaths.forEach((e) => this.viewer.entities.remove(e))
    this.refs.orbitPaths = []

    // Determine which entity collection to use
    const entities = this.dataSource?.entities ?? this.viewer.entities

    // Remove satellite entities
    Object.values(this.refs.entities).forEach((entity) => {
      entities.remove(entity)
    })
    this.refs.entities = {}
    this.refs.satrecs = {}
  }

  /**
   * Get color for satellite type
   */
  private getSatelliteColor(type: string): Cesium.Color {
    const colors: Record<string, Cesium.Color> = {
      iss: Cesium.Color.LIME,
      communications: Cesium.Color.CYAN,
      gps: Cesium.Color.GOLD,
      debris: Cesium.Color.ORANGERED,
      other: Cesium.Color.LIGHTGRAY,
    }
    return colors[type] || Cesium.Color.LIGHTGRAY
  }
}
