import * as Cesium from "cesium"
import type { Flight } from "./flightTypes"
import { classifyFlight } from "./flightTypes"
import {
  FLIGHT_LABEL_FONT,
  FLIGHT_LABEL_OFFSET_Y,
  FLIGHT_SCALE_BY_DISTANCE,
  FLIGHT_LABEL_DISTANCE_CONDITION,
  FLIGHT_BILLBOARD_SCALE_BY_DISTANCE,
  FLIGHT_COLORS,
  FLIGHT_TRAIL_WIDTH,
  FLIGHT_TRAIL_OPACITY,
  FLIGHT_ICON_SVG,
  FLIGHT_SAMPLE_INTERVAL_SECONDS,
  FLIGHT_NUM_POSITION_SAMPLES,
} from "./constants"

/** Billboard pixel size for the icon */
const FLIGHT_ICON_SIZE = 28

/** Earth radius in meters */
const EARTH_RADIUS_M = 6_371_000

export interface FlightEntityResult {
  entity: Cesium.Entity
  trail: Cesium.Entity | null
}

/**
 * Extrapolate a flight's position forward in time using heading, velocity, and vertical rate.
 * Uses a simple rhumb-line approximation (accurate over short distances < 10 km).
 */
export function extrapolatePosition(
  flight: Flight,
  deltaSeconds: number
): { latitude: number; longitude: number; altitude: number } {
  const speed = flight.velocity // m/s
  const headingRad = Cesium.Math.toRadians(flight.heading) // 0 = North
  const distance = speed * deltaSeconds // meters

  const latRad = Cesium.Math.toRadians(flight.latitude)
  const lonRad = Cesium.Math.toRadians(flight.longitude)

  // Meridional distance (North-South)
  const dLat = (distance * Math.cos(headingRad)) / EARTH_RADIUS_M // radians
  // Parallel distance (East-West), adjusted for latitude
  const dLon = (distance * Math.sin(headingRad)) / (EARTH_RADIUS_M * Math.cos(latRad)) // radians

  const newLat = Cesium.Math.toDegrees(latRad + dLat)
  const newLon = Cesium.Math.toDegrees(lonRad + dLon)
  const newAlt = (flight.baroAltitude || flight.geoAltitude || 10000) + flight.verticalRate * deltaSeconds

  return {
    latitude: newLat,
    longitude: newLon,
    altitude: Math.max(newAlt, 0), // Don't go below ground
  }
}

/**
 * Create a SampledPositionProperty with extrapolated samples for smooth animation.
 * Adds samples at current time + future times based on heading/velocity.
 */
function createSampledPosition(flight: Flight): Cesium.SampledPositionProperty {
  const positionProperty = new Cesium.SampledPositionProperty()
  positionProperty.setInterpolationOptions({
    interpolationDegree: 2,
    interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
  })

  const now = Cesium.JulianDate.now()

  // Add current position sample
  const currentPos = Cesium.Cartesian3.fromDegrees(
    flight.longitude,
    flight.latitude,
    flight.baroAltitude || flight.geoAltitude || 10000
  )
  positionProperty.addSample(now, currentPos)

  // Add extrapolated future samples for smooth interpolation between polls
  for (let i = 1; i <= FLIGHT_NUM_POSITION_SAMPLES; i++) {
    const futureTime = Cesium.JulianDate.addSeconds(
      now,
      i * FLIGHT_SAMPLE_INTERVAL_SECONDS,
      new Cesium.JulianDate()
    )
    const extrapolated = extrapolatePosition(flight, i * FLIGHT_SAMPLE_INTERVAL_SECONDS)
    const futurePos = Cesium.Cartesian3.fromDegrees(
      extrapolated.longitude,
      extrapolated.latitude,
      extrapolated.altitude
    )
    positionProperty.addSample(futureTime, futurePos)
  }

  return positionProperty
}

/**
 * Update an existing SampledPositionProperty with new live data + re-extrapolation.
 */
function updateSamplePositions(
  positionProperty: Cesium.SampledPositionProperty,
  flight: Flight
): void {
  const now = Cesium.JulianDate.now()

  // Replace the "now" sample with the real position
  const currentPos = Cesium.Cartesian3.fromDegrees(
    flight.longitude,
    flight.latitude,
    flight.baroAltitude || flight.geoAltitude || 10000
  )

  // Remove old samples at these times (if any) and add fresh ones
  // First remove current and future samples, then re-add
  for (let i = 0; i <= FLIGHT_NUM_POSITION_SAMPLES; i++) {
    const time = Cesium.JulianDate.addSeconds(
      now,
      i * FLIGHT_SAMPLE_INTERVAL_SECONDS,
      new Cesium.JulianDate()
    )
    const existing = positionProperty.getValue(time)
    if (existing) {
      positionProperty.removeSample(time)
    }
  }

  // Add current real position
  positionProperty.addSample(now, currentPos)

  // Re-extrapolate future positions
  for (let i = 1; i <= FLIGHT_NUM_POSITION_SAMPLES; i++) {
    const futureTime = Cesium.JulianDate.addSeconds(
      now,
      i * FLIGHT_SAMPLE_INTERVAL_SECONDS,
      new Cesium.JulianDate()
    )
    const extrapolated = extrapolatePosition(flight, i * FLIGHT_SAMPLE_INTERVAL_SECONDS)
    const futurePos = Cesium.Cartesian3.fromDegrees(
      extrapolated.longitude,
      extrapolated.latitude,
      extrapolated.altitude
    )
    positionProperty.addSample(futureTime, futurePos)
  }
}

/**
 * Factory for creating and updating Cesium flight entities
 * Uses SampledPositionProperty with dead-reckoning extrapolation
 * for smooth movement between 30-second data polls.
 */
export class FlightEntityFactory {
  /**
   * Create a Cesium entity for a flight with SampledPositionProperty for smooth movement,
   * plus a trailing path polyline.
   */
  static createEntity(
    flight: Flight,
    entityCollection: Cesium.EntityCollection
  ): FlightEntityResult {
    const type = classifyFlight(flight.callsign)
    const color = FLIGHT_COLORS[type] ?? FLIGHT_COLORS.all

    // Use SampledPositionProperty with extrapolated samples for smooth animation
    const positionProperty = createSampledPosition(flight)

    const currentPos = Cesium.Cartesian3.fromDegrees(
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
      position: positionProperty,
      // Availability: span from now through all extrapolated samples
      availability: new Cesium.TimeIntervalCollection([
        new Cesium.TimeInterval({
          start: Cesium.JulianDate.now(),
          stop: Cesium.JulianDate.addSeconds(
            Cesium.JulianDate.now(),
            FLIGHT_NUM_POSITION_SAMPLES * FLIGHT_SAMPLE_INTERVAL_SECONDS,
            new Cesium.JulianDate()
          ),
        }),
      ]),
      // Use billboard with airplane SVG icon for type-specific visuals
      billboard: new Cesium.BillboardGraphics({
        image: FLIGHT_ICON_SVG,
        color: color,
        width: FLIGHT_ICON_SIZE,
        height: FLIGHT_ICON_SIZE,
        rotation: Cesium.Math.toRadians(-flight.heading),
        scaleByDistance: FLIGHT_BILLBOARD_SCALE_BY_DISTANCE,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50_000_000),
        alignedAxis: Cesium.Cartesian3.UNIT_Z,
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
    const trailPositions: Cesium.Cartesian3[] = [currentPos, currentPos]
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
   * Update an existing flight entity's position, properties, trail, and
   * re-extrapolate SampledPositionProperty for smooth animation.
   */
  static updatePosition(
    entity: Cesium.Entity,
    flight: Flight,
    trailEntity?: Cesium.Entity,
    positionHistory?: Cesium.Cartesian3[]
  ): void {
    // Update the SampledPositionProperty with new live data + re-extrapolation
    const posProp = entity.position as Cesium.SampledPositionProperty
    if (posProp) {
      updateSamplePositions(posProp, flight)
    }

    // Update availability
    if (entity.availability) {
      entity.availability = new Cesium.TimeIntervalCollection([
        new Cesium.TimeInterval({
          start: Cesium.JulianDate.now(),
          stop: Cesium.JulianDate.addSeconds(
            Cesium.JulianDate.now(),
            FLIGHT_NUM_POSITION_SAMPLES * FLIGHT_SAMPLE_INTERVAL_SECONDS,
            new Cesium.JulianDate()
          ),
        }),
      ])
    }

    // Update label text
    const altitudeKm = ((flight.baroAltitude || flight.geoAltitude || 0) / 1000).toFixed(1)
    const speedKnots = (flight.velocity * 1.94384).toFixed(0)
    const labelText = flight.callsign || flight.icao24
    const label = entity.label as Cesium.LabelGraphics
    if (label) {
      label.text = `${labelText}\n${altitudeKm}km ${speedKnots}kt`
    }

    // Update billboard rotation to match heading
    const billboard = entity.billboard as Cesium.BillboardGraphics
    if (billboard) {
      billboard.rotation = Cesium.Math.toRadians(-flight.heading)
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