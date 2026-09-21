import * as Cesium from "cesium"
import type { Layer } from "../../Layer"
import type { Flight, FlightFilter, FlightRoute } from "./flightTypes"
import { classifyFlight } from "./flightTypes"
import { FlightEntityFactory, extrapolatePosition } from "./entityFactory"
import { FLIGHT_TRAIL_MAX_POSITIONS, FLIGHT_SAMPLE_INTERVAL_SECONDS } from "./constants"
import {
  FLIGHT_ROUTE_COLOR,
  FLIGHT_ROUTE_WIDTH,
  FLIGHT_ROUTE_GLOW_POWER,
  FLIGHT_DEPARTURE_COLOR,
  FLIGHT_ARRIVAL_COLOR,
  FLIGHT_AIRPORT_MARKER_SIZE,
  FLIGHT_TRAJECTORY_COLOR,
  FLIGHT_TRAJECTORY_WIDTH,
} from "./constants"

const FLIGHT_INFO_EVENT = "flightInfoRequest"

interface FlightEntityData {
  entity: Cesium.Entity
  trail: Cesium.Entity | null
  positionHistory: Cesium.Cartesian3[]
}

interface RouteEntities {
  /** Polyline from departure → current → arrival */
  routePath: Cesium.Entity | null
  /** The actual flown trajectory from OpenSky */
  trajectory: Cesium.Entity | null
  /** Departure airport marker (includes label) */
  departureMarker: Cesium.Entity | null
  /** Arrival airport marker (includes label) */
  arrivalMarker: Cesium.Entity | null
}

/**
 * Flight layer implementation
 * Manages aircraft entities from OpenSky data on a Cesium viewer
 *
 * Flights are polled every ~30s and positions are updated in-place
 * using ConstantPositionProperty. Each flight has a trailing polyline
 * showing the recent path.
 *
 * Single-click: dispatches flight info event + flies to flight
 * Double-click: fetches route info from OpenSky, displays full origin→destination
 *   path, airport markers, and trajectory polyline.
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

  // Track route display entities per flight
  private routeEntities: Record<string, RouteEntities> = {}

  // Track which flight currently has its route displayed
  private trackedFlightId: string | null = null

  // Currently cached route data
  private routeCache: Record<string, FlightRoute> = {}

  // Handler references for cleanup
  private removeClickHandler: (() => void) | null = null
  private removeDoubleClickHandler: (() => void) | null = null

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true
    this.setupClickHandler()
    this.setupDoubleClickHandler()
    if (this.dataLoaded) {
      this.renderFlights()
    }
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.removeClickHandler?.()
    this.removeClickHandler = null
    this.removeDoubleClickHandler?.()
    this.removeDoubleClickHandler = null
    this.clearEntities()
    this.clearRouteEntities()
    this.routeCache = {}
    this.trackedFlightId = null
  }

  /**
   * Stop tracking / clear route display
   */
  stopTracking(): void {
    if (this.trackedFlightId) {
      this.clearRouteForFlight(this.trackedFlightId)
      this.trackedFlightId = null
    }
    this.viewer.trackedEntity = undefined
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
   * Called by LayerManager every ~10-15s.
   * Adds mid-cycle interpolation samples to keep SampledPositionProperty
   * smoothly animating between 30-second data polls.
   */
  update(): void {
    if (!this.enabled || !this.dataLoaded) return

    // Add fresh extrapolation samples to keep interpolation smooth between polls
    for (const flight of this.flightData) {
      const data = this.flightEntities[flight.icao24]
      if (!data || !data.entity?.position) continue

      const posProp = data.entity.position as Cesium.SampledPositionProperty
      if (!posProp) continue

      const now = Cesium.JulianDate.now()

      // Rotate the sample window forward: add a new sample at the far end
      const futureSeconds = FLIGHT_SAMPLE_INTERVAL_SECONDS * 3 // ~45s ahead
      const futureTime = Cesium.JulianDate.addSeconds(
        now,
        futureSeconds,
        new Cesium.JulianDate()
      )

      // Check if we already have a sample near this time
      if (!posProp.getValue(futureTime)) {
        const extrapolated = extrapolatePosition(flight, futureSeconds)
        const futurePos = Cesium.Cartesian3.fromDegrees(
          extrapolated.longitude,
          extrapolated.latitude,
          extrapolated.altitude
        )
        posProp.addSample(futureTime, futurePos)
      }
    }
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

  // ─── Entity rendering ──────────────────────────────────────────

  /**
   * Render flights based on current filter
   * Note: Viewport culling is handled by LayerManager via entity.show.
   * This method creates ALL filtered entities (no viewport culling here)
   * to avoid UI inconsistency where flights disappear after stop tracking.
   */
  private renderFlights(): void {
    this.clearEntities()
    this.clearRouteEntities()
    this.trackedFlightId = null

    const filtered = this.flightData.filter((flight) => {
      if (this.filter === "all") return true
      return classifyFlight(flight.callsign) === this.filter
    })

    const collection = this.dataSource?.entities ?? this.viewer.entities

    filtered.forEach((flight) => {
      const { entity, trail } = FlightEntityFactory.createEntity(flight, collection)

      const pos = Cesium.Cartesian3.fromDegrees(
        flight.longitude,
        flight.latitude,
        flight.baroAltitude || flight.geoAltitude || 10000
      )

      this.flightEntities[flight.icao24] = {
        entity,
        trail,
        positionHistory: [pos, pos],
      }
    })
  }

  /**
   * Refresh existing entities with new flight data (in-place).
   * Note: Viewport culling for new entities is handled by LayerManager via entity.show.
   * All flight entities are created here (no viewport culling) to avoid UI inconsistency.
   */
  refreshPositions(flights: Flight[]): void {
    if (!this.enabled || !this.dataLoaded) return

    this.flightData = flights

    const collection = this.dataSource?.entities ?? this.viewer.entities

    for (const flight of flights) {
      const existing = this.flightEntities[flight.icao24]
      if (existing) {
        const newPos = Cesium.Cartesian3.fromDegrees(
          flight.longitude,
          flight.latitude,
          flight.baroAltitude || flight.geoAltitude || 10000
        )

        existing.positionHistory.push(newPos)
        if (existing.positionHistory.length > FLIGHT_TRAIL_MAX_POSITIONS) {
          existing.positionHistory = existing.positionHistory.slice(-FLIGHT_TRAIL_MAX_POSITIONS)
        }

        FlightEntityFactory.updatePosition(
          existing.entity,
          flight,
          existing.trail,
          existing.positionHistory
        )

        // If this flight has a route displayed, update the route path
        // to include the updated current position
        if (this.routeEntities[flight.icao24]) {
          this.updateRoutePath(flight)
        }
      } else if (this.filter === "all" || classifyFlight(flight.callsign) === this.filter) {
        const { entity, trail } = FlightEntityFactory.createEntity(flight, collection)
        const pos = Cesium.Cartesian3.fromDegrees(
          flight.longitude,
          flight.latitude,
          flight.baroAltitude || flight.geoAltitude || 10000
        )
        this.flightEntities[flight.icao24] = {
          entity,
          trail,
          positionHistory: [pos, pos],
        }
      }
    }

    // Remove entities that no longer exist in the data
    const currentIcaos = new Set(flights.map((f) => f.icao24))
    for (const [icao24, data] of Object.entries(this.flightEntities)) {
      if (!currentIcaos.has(icao24)) {
        collection.remove(data.entity)
        if (data.trail) collection.remove(data.trail)
        this.clearRouteForFlight(icao24)
        delete this.flightEntities[icao24]
      }
    }
  }

  // ─── Click and Double-Click Handlers ──────────────────────────

  /**
   * Set up single-click handler: dispatch flight info event + fly to flight
   */
  private setupClickHandler(): void {
    const handler = this.viewer.screenSpaceEventHandler
    if (!handler) return

    this.removeClickHandler = handler.setInputAction(
      (click: { position: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(click.position)
        if (!Cesium.defined(picked) || !picked.id) return

        const entity = picked.id as Cesium.Entity

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

  /**
   * Set up double-click handler: fetch and display full route
   */
  private setupDoubleClickHandler(): void {
    const handler = this.viewer.screenSpaceEventHandler
    if (!handler) return

    this.removeDoubleClickHandler = handler.setInputAction(
      (click: { position: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(click.position)
        if (!Cesium.defined(picked) || !picked.id) return

        const entity = picked.id as Cesium.Entity

        if (!entity.id?.startsWith("flight-")) return
        if (entity.id?.startsWith("flight-trail-")) return

        const icao24 = entity.id.replace("flight-", "")
        this.displayFlightRoute(icao24, entity)
      },
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    )
  }

  // ─── Route Display ────────────────────────────────────────────

  /**
   * Fetch and display route for a flight
   */
  private async displayFlightRoute(icao24: string, entity: Cesium.Entity): Promise<void> {
    const flightData = this.flightData.find((f) => f.icao24 === icao24)
    if (!flightData) return

    // Toggle: if already showing this flight's route, clear it
    if (this.trackedFlightId === icao24) {
      this.clearRouteForFlight(icao24)
      this.viewer.trackedEntity = undefined
      this.trackedFlightId = null
      return
    }

    // Clear any previous route
    if (this.trackedFlightId) {
      this.clearRouteForFlight(this.trackedFlightId)
    }

    // Track the flight entity with camera
    this.viewer.trackedEntity = entity

    // Get route data (from cache or API)
    const route = await this.fetchRoute(icao24, flightData.callsign)

    if (!route.hasRoute) {
      // No route data available — just show the trail and projected heading
      return
    }

    this.trackedFlightId = icao24
    this.renderRoute(icao24, flightData, route)
  }

  /**
   * Fetch route from backend (with in-memory cache)
   */
  private async fetchRoute(icao24: string, callsign: string): Promise<FlightRoute> {
    // Check in-memory cache first
    if (this.routeCache[icao24]) {
      return this.routeCache[icao24]
    }

    try {
      // Dynamic import to avoid circular deps
      const { fetchFlightRoute } = await import("../../../flights/fetchFlightRoute")
      const route = await fetchFlightRoute(icao24, callsign)
      this.routeCache[icao24] = route
      return route
    } catch {
      return {
        icao24,
        callsign,
        estDepartureAirport: null,
        estArrivalAirport: null,
        departureCoords: null,
        arrivalCoords: null,
        path: [],
        hasRoute: false,
      }
    }
  }

  /**
   * Render route entities: airport markers, route polyline, trajectory path
   */
  private renderRoute(icao24: string, flight: Flight, route: FlightRoute): void {
    const collection = this.dataSource?.entities ?? this.viewer.entities
    const routeEnt: RouteEntities = {
      routePath: null,
      trajectory: null,
      departureMarker: null,
      arrivalMarker: null,
    }

    const currentPos = Cesium.Cartesian3.fromDegrees(
      flight.longitude,
      flight.latitude,
      flight.baroAltitude || flight.geoAltitude || 10000
    )

    // Build route positions: departure → current → arrival
    const routePositions: Cesium.Cartesian3[] = []

    if (route.departureCoords) {
      const depPos = Cesium.Cartesian3.fromDegrees(
        route.departureCoords.longitude,
        route.departureCoords.latitude,
        500 // Low altitude for airport
      )
      routePositions.push(depPos)
    }
    routePositions.push(currentPos)
    if (route.arrivalCoords) {
      const arrPos = Cesium.Cartesian3.fromDegrees(
        route.arrivalCoords.longitude,
        route.arrivalCoords.latitude,
        500
      )
      routePositions.push(arrPos)
    }

    // 1. Route polyline (departure → current → arrival)
    if (routePositions.length >= 2) {
      // Add route path
      const routeColors: Cesium.Color[] = []
      const startColor = FLIGHT_DEPARTURE_COLOR.clone()
      const endColor = FLIGHT_ARRIVAL_COLOR.clone()
      for (let i = 0; i < routePositions.length; i++) {
        const t = routePositions.length > 1 ? i / (routePositions.length - 1) : 0
        routeColors.push(Cesium.Color.lerp(startColor, endColor, t, new Cesium.Color()))
      }

      routeEnt.routePath = collection.add({
        id: `flight-route-${icao24}`,
        polyline: new Cesium.PolylineGraphics({
          positions: routePositions,
          width: FLIGHT_ROUTE_WIDTH,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: FLIGHT_ROUTE_GLOW_POWER,
            color: FLIGHT_ROUTE_COLOR,
          }),
          arcType: Cesium.ArcType.GEODESIC,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50_000_000),
          clampToGround: true,
        }),
        properties: { parentFlightId: icao24 },
      })
    }

    // 2. Trajectory path (actual flown path from OpenSky)
    if (route.path.length >= 2) {
      const trajPositions = route.path.map((wp) =>
        Cesium.Cartesian3.fromDegrees(wp.longitude, wp.latitude, wp.altitude || 10000)
      )

      routeEnt.trajectory = collection.add({
        id: `flight-trajectory-${icao24}`,
        polyline: new Cesium.PolylineGraphics({
          positions: trajPositions,
          width: FLIGHT_TRAJECTORY_WIDTH,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.15,
            color: FLIGHT_TRAJECTORY_COLOR,
          }),
          arcType: Cesium.ArcType.GEODESIC,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50_000_000),
          clampToGround: false,
        }),
        properties: { parentFlightId: icao24 },
      })
    }

    // 3. Airport markers
    if (route.departureCoords) {
      const depPos = Cesium.Cartesian3.fromDegrees(
        route.departureCoords.longitude,
        route.departureCoords.latitude,
        0
      )

      routeEnt.departureMarker = collection.add({
        id: `flight-departure-${icao24}`,
        position: depPos,
        point: new Cesium.PointGraphics({
          pixelSize: FLIGHT_AIRPORT_MARKER_SIZE,
          color: FLIGHT_DEPARTURE_COLOR,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10_000_000),
        }),
        label: new Cesium.LabelGraphics({
          text: `🛫 ${route.estDepartureAirport || "Departure"}`,
          font: "12px sans-serif",
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
          backgroundPadding: new Cesium.Cartesian2(4, 2),
          pixelOffset: new Cesium.Cartesian2(0, -20),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5_000_000),
          show: true,
        }),
        properties: { parentFlightId: icao24 },
      })
    }

    if (route.arrivalCoords) {
      const arrPos = Cesium.Cartesian3.fromDegrees(
        route.arrivalCoords.longitude,
        route.arrivalCoords.latitude,
        0
      )

      routeEnt.arrivalMarker = collection.add({
        id: `flight-arrival-${icao24}`,
        position: arrPos,
        point: new Cesium.PointGraphics({
          pixelSize: FLIGHT_AIRPORT_MARKER_SIZE,
          color: FLIGHT_ARRIVAL_COLOR,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10_000_000),
        }),
        label: new Cesium.LabelGraphics({
          text: `🛬 ${route.estArrivalAirport || "Arrival"}`,
          font: "12px sans-serif",
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
          backgroundPadding: new Cesium.Cartesian2(4, 2),
          pixelOffset: new Cesium.Cartesian2(0, 20),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5_000_000),
          show: true,
        }),
        properties: { parentFlightId: icao24 },
      })
    }

    this.routeEntities[icao24] = routeEnt
  }

  /**
   * Update route path with the latest flight position
   * Called on each poll to keep the route up to date
   */
  private updateRoutePath(flight: Flight): void {
    const route = this.routeCache[flight.icao24]
    const routeEnt = this.routeEntities[flight.icao24]
    if (!route || !routeEnt || !routeEnt.routePath) return

    const currentPos = Cesium.Cartesian3.fromDegrees(
      flight.longitude,
      flight.latitude,
      flight.baroAltitude || flight.geoAltitude || 10000
    )

    const positions: Cesium.Cartesian3[] = []
    if (route.departureCoords) {
      positions.push(
        Cesium.Cartesian3.fromDegrees(
          route.departureCoords.longitude,
          route.departureCoords.latitude,
          500
        )
      )
    }
    positions.push(currentPos)
    if (route.arrivalCoords) {
      positions.push(
        Cesium.Cartesian3.fromDegrees(
          route.arrivalCoords.longitude,
          route.arrivalCoords.latitude,
          500
        )
      )
    }

    if (positions.length >= 2) {
      const polyline = routeEnt.routePath.polyline as Cesium.PolylineGraphics
      if (polyline) {
        polyline.positions = new Cesium.ConstantProperty(positions)
      }
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────

  /**
   * Clear route display entities for a specific flight
   */
  private clearRouteForFlight(icao24: string): void {
    const routeEnt = this.routeEntities[icao24]
    if (!routeEnt) return

    const collection = this.dataSource?.entities ?? this.viewer.entities

    if (routeEnt.routePath) collection.remove(routeEnt.routePath)
    if (routeEnt.trajectory) collection.remove(routeEnt.trajectory)
    if (routeEnt.departureMarker) collection.remove(routeEnt.departureMarker)
    if (routeEnt.arrivalMarker) collection.remove(routeEnt.arrivalMarker)

    delete this.routeEntities[icao24]
  }

  /**
   * Clear all route display entities
   */
  private clearRouteEntities(): void {
    for (const icao24 of Object.keys(this.routeEntities)) {
      this.clearRouteForFlight(icao24)
    }
    this.routeEntities = {}
  }

  /**
   * Clear flight entities
   */
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