import * as Cesium from "cesium"
import type { Flight } from "./flightTypes"
import { classifyFlight } from "./flightTypes"
import {
  FLIGHT_POINT_SIZE,
  FLIGHT_OUTLINE_WIDTH,
  FLIGHT_LABEL_FONT,
  FLIGHT_LABEL_OFFSET_Y,
  FLIGHT_SCALE_BY_DISTANCE,
  FLIGHT_LABEL_DISTANCE_CONDITION,
  FLIGHT_COLORS,
  FLIGHT_TRAIL_WIDTH,
  FLIGHT_TRAIL_OPACITY,
} from "./constants"

export interface FlightEntityResult {
  entity: Cesium.Entity
  trail: Cesium.Entity | null
}

/**
 * Factory for creating and updating Cesium flight entities
 */
export class FlightEntityFactory {
  /**
   * Create a Cesium entity for a flight, plus a trailing path polyline
   */
  static createEntity(
    flight: Flight,
    entityCollection: Cesium.EntityCollection
  ): FlightEntityResult {
    const type = classifyFlight(flight.callsign)
    const color = FLIGHT_COLORS[type] ?? FLIGHT_COLORS.all
    const position = Cesium.Cartesian3.fromDegrees(
      flight.longitude,
      flight.latitude,
      flight.baroAltitude || flight.geoAltitude || 10000
    )

    const labelText = flight.callsign || flight.icao24
    const altitudeKm = ((flight.baroAltitude || flight.geoAltitude || 0) / 1000).toFixed(1)
    const speedKnots = (flight.velocity * 1.94384).toFixed(0)

    const entity = new Cesium.Entity({
      id: `flight-${flight.icao24}`,
      name: labelText,
      position: new Cesium.ConstantPositionProperty(position),
      point: new Cesium.PointGraphics({
        pixelSize: FLIGHT_POINT_SIZE,
        color: color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: FLIGHT_OUTLINE_WIDTH,
        scaleByDistance: FLIGHT_SCALE_BY_DISTANCE,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50_000_000),
      }),
      label: new Cesium.LabelGraphics({
        text: `${labelText}\n${altitudeKm}km ${speedKnots}kt`,
        font: FLIGHT_LABEL_FONT,
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: new Cesium.Color(0, 0, 0, 0.6),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
        pixelOffset: new Cesium.Cartesian2(0, FLIGHT_LABEL_OFFSET_Y),
        scaleByDistance: new Cesium.NearFarScalar(
          1.0e5,
          1.0,
          2.0e6,
          0.2
        ),
        distanceDisplayCondition: FLIGHT_LABEL_DISTANCE_CONDITION,
        show: false, // Hidden by default, shown on hover
      }),
      properties: {
        icao24: flight.icao24,
        callsign: flight.callsign,
        originCountry: flight.originCountry,
        type: type,
        baroAltitude: flight.baroAltitude,
        velocity: flight.velocity,
        heading: flight.heading,
      },
    })

    entityCollection.add(entity)

    // Create the trail polyline (starts with just the current position)
    const trailPositions: Cesium.Cartesian3[] = [position, position]
    const trail = new Cesium.Entity({
      id: `flight-trail-${flight.icao24}`,
      polyline: new Cesium.PolylineGraphics({
        positions: trailPositions,
        width: FLIGHT_TRAIL_WIDTH,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.15,
          color: color.withAlpha(FLIGHT_TRAIL_OPACITY),
        }),
        arcType: Cesium.ArcType.GEODESIC,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50_000_000),
        clampToGround: false,
      }),
      properties: {
        parentFlightId: flight.icao24,
      },
    })

    entityCollection.add(trail)

    return { entity, trail }
  }

  /**
   * Update an existing flight entity's position, properties, and trail
   */
  static updatePosition(
    entity: Cesium.Entity,
    flight: Flight,
    trailEntity?: Cesium.Entity,
    positionHistory?: Cesium.Cartesian3[]
  ): void {
    const position = Cesium.Cartesian3.fromDegrees(
      flight.longitude,
      flight.latitude,
      flight.baroAltitude || flight.geoAltitude || 10000
    )

    // Update main position
    const posProp = entity.position as Cesium.ConstantPositionProperty
    if (posProp) {
      posProp.setValue(position)
    }

    // Update label text
    const altitudeKm = ((flight.baroAltitude || flight.geoAltitude || 0) / 1000).toFixed(1)
    const speedKnots = (flight.velocity * 1.94384).toFixed(0)
    const labelText = flight.callsign || flight.icao24
    const label = entity.label as Cesium.LabelGraphics
    if (label) {
      label.text = `${labelText}\n${altitudeKm}km ${speedKnots}kt`
    }

    // Update properties
    if (entity.properties) {
      entity.properties.baroAltitude?.setValue(flight.baroAltitude)
      entity.properties.velocity?.setValue(flight.velocity)
      entity.properties.heading?.setValue(flight.heading)
    }

    // Update trail if we have history
    if (trailEntity && positionHistory && positionHistory.length >= 2) {
      const trailPolyline = trailEntity.polyline as Cesium.PolylineGraphics
      if (trailPolyline) {
        trailPolyline.positions = new Cesium.ConstantProperty([...positionHistory])
      }
    }
  }
}