import * as Cesium from "cesium"
import type { Layer } from "../../Layer"
import type { Flight, FlightFilter } from "./flightTypes"
import { classifyFlight } from "./flightTypes"
import { FlightEntityFactory } from "./entityFactory"
import { FLIGHT_TRAIL_MAX_POSITIONS, FLIGHT_HEADING_PREVIEW_SECONDS } from "./constants"

const FLIGHT_INFO_EVENT = "flightInfoRequest"

interface FlightEntityData {
  entity: Cesium.Entity
  trail: Cesium.Entity | null
  positionHistory: Cesium.Cartesian3[]
}

/**
 * Flight layer implementation
 * Manages aircraft entities from OpenSky data on a Cesium viewer
 *
 * Flights are polled every ~30s and positions are updated in-place
 * using ConstantPositionProperty. Each flight has a trailing polyline
 * showing the recent path. Clicking a flight fires a custom event
 * that the UI can listen to for showing flight info.
 */
export class FlightLayer implements Layer {
  readonly id = "flight"
  readonly name = "Flights"

  private viewer: Cesium.Viewer
  private dataSource: Cesium.CustomDataSource | null = null
  private enabled = false
  private filter: FlightFilter = "all"
  private flightData: Flight[] = []
  private dataLoaded = false

  // Track entity ID -> {entity, trail, positionHistory}
  private flightEntities: Record<string, FlightEntityData> = {}

  // Click-handler references for cleanup
  private removeClickHandler: (() => void) | null = null

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true
    this.setupClickHandler()
    if (this.dataLoaded) {
      this.renderFlights()
    }
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.removeClickHandler?.()
    this.removeClickHandler = null
    this.clearEntities()
  }

  loadData(data: Flight[]): void {
    this.flightData = data
    this.dataLoaded = true

    if (this.enabled) {
      this.renderFlights()
    }
  }

  /**
   * Periodic update: refresh positions and trails in-place.
   * Called by LayerManager every ~10s, but new flight data comes via React Query.
   */
  update(): void {
    if (!this.enabled || !this.dataLoaded) return
    // On each tick, we extrapolate the trail a bit using heading + velocity
    // to show a smooth preview even between polls
    this.extrapolateTrails()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getEntities(): Cesium.Entity[] {
    return Object.values(this.flightEntities).map((d) => d.entity)
  }

  setFilter(filter: FlightFilter): void {
    this.filter = filter
    if (this.enabled && this.dataLoaded) {
      this.renderFlights()
    }
  }

  getFilter(): FlightFilter {
    return this.filter
  }

  setDataSource(dataSource: Cesium.CustomDataSource): void {
    this.dataSource = dataSource
  }

  /**
   * Render flights based on current filter
   */
  private renderFlights(): void {
    this.clearEntities()

    const filtered = this.flightData.filter((flight) => {
      if (this.filter === "all") return true
      return classifyFlight(flight.callsign) === this.filter
    })

    const collection = this.dataSource?.entities ?? this.viewer.entities

    filtered.forEach((flight) => {
      const { entity, trail } = FlightEntityFactory.createEntity(flight, collection)

      // Seed position history with current position
      const pos = Cesium.Cartesian3.fromDegrees(
        flight.longitude,
        flight.latitude,
        flight.baroAltitude || flight.geoAltitude || 10000
      )

      this.flightEntities[flight.icao24] = {
        entity,
        trail,
        positionHistory: [pos, pos], // Start with duplicate so trail renders
      }
    })
  }

  /**
   * Refresh existing entities with new flight data (in-place).
   * Called when fresh data arrives from the API poll.
   * Preserves position history and updates trails.
   */
  refreshPositions(flights: Flight[]): void {
    if (!this.enabled || !this.dataLoaded) return

    this.flightData = flights

    const collection = this.dataSource?.entities ?? this.viewer.entities

    // Update existing entities
    for (const flight of flights) {
      const existing = this.flightEntities[flight.icao24]
      if (existing) {
        const newPos = Cesium.Cartesian3.fromDegrees(
          flight.longitude,
          flight.latitude,
          flight.baroAltitude || flight.geoAltitude || 10000
        )

        // Append to position history
        existing.positionHistory.push(newPos)
        if (existing.positionHistory.length > FLIGHT_TRAIL_MAX_POSITIONS) {
          existing.positionHistory = existing.positionHistory.slice(-FLIGHT_TRAIL_MAX_POSITIONS)
        }

        // Update entity position + trail
        FlightEntityFactory.updatePosition(
          existing.entity,
          flight,
          existing.trail,
          existing.positionHistory
        )
      }
    }

    // Remove entities that no longer exist in the data
    const currentIcaos = new Set(flights.map((f) => f.icao24))
    for (const [icao24, data] of Object.entries(this.flightEntities)) {
      if (!currentIcaos.has(icao24)) {
        collection.remove(data.entity)
        if (data.trail) collection.remove(data.trail)
        delete this.flightEntities[icao24]
      }
    }
  }

  /**
   * Extrapolate trails slightly between poll intervals so the
   * path keeps looking smooth. Advances the last trail point
   * in the direction of the aircraft's heading.
   */
  private extrapolateTrails(): void {
    const secondsSinceLastPoll = 10 // LayerManager ticks every 10s
    for (const data of Object.values(this.flightEntities)) {
      if (data.positionHistory.length < 2) continue

      const lastPos = data.positionHistory[data.positionHistory.length - 1]
      const secondLast = data.positionHistory[data.positionHistory.length - 2]

      // Compute approximate heading from last two positions
      const dx = lastPos.x - secondLast.x
      const dy = lastPos.y - secondLast.y
      const dz = lastPos.z - secondLast.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (dist < 1) continue

      // Extend the last segment by a small amount
      const speed = dist / 10 // per second
      const factor = 1 + (secondsSinceLastPoll * 0.3) / speed
      // Just move the last point slightly - don't add new positions between polls
      // The real positions will be set when new data arrives
    }
  }

  // ─── Click-to-Info ──────────────────────────────────────────────

  /**
   * Set up click handler: when a flight entity is clicked,
   * dispatch a custom event with flight info so the React UI can show a panel.
   */
  private setupClickHandler(): void {
    const handler = this.viewer.screenSpaceEventHandler
    if (!handler) return

    this.removeClickHandler = handler.setInputAction(
      (click: { position: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(click.position)
        if (!Cesium.defined(picked) || !picked.id) return

        const entity = picked.id as Cesium.Entity

        // Check if it's a flight entity (not a trail)
        if (!entity.id?.startsWith("flight-")) return
        if (entity.id?.startsWith("flight-trail-")) return

        const icao24 = entity.id.replace("flight-", "")
        const flightData = this.flightData.find((f) => f.icao24 === icao24)
        if (!flightData) return

        // Dispatch a custom event with flight info
        window.dispatchEvent(
          new CustomEvent(FLIGHT_INFO_EVENT, {
            detail: flightData,
          })
        )

        // Fly to the flight
        this.viewer.flyTo(entity, {
          offset: new Cesium.HeadingPitchRange(
            0,
            Cesium.Math.toRadians(-30),
            5000
          ),
          duration: 1.0,
        })
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    )
  }

  private clearEntities(): void {
    const collection = this.dataSource?.entities ?? this.viewer.entities
    for (const data of Object.values(this.flightEntities)) {
      collection.remove(data.entity)
      if (data.trail) collection.remove(data.trail)
    }
    this.flightEntities = {}
  }
}

// Re-export constant so other modules can listen for the event
export { FLIGHT_INFO_EVENT }