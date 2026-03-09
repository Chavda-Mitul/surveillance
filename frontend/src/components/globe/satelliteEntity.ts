import * as Cesium from "cesium"
import { createSatrec, getPositionAtTime, classifySatellite } from "../../satellites/orbit"
import type { SatelliteRefs } from "./types"
import { SATELLITE_ICONS, SATELLITE_COLORS } from "./constants"

export function createSatelliteEntity(
  viewer: Cesium.Viewer,
  sat: { name: string; line1: string; line2: string },
  refs: SatelliteRefs
) {
  const satrec = createSatrec(sat.line1, sat.line2)
  const id = `${sat.name}-${sat.line1.slice(2, 7)}`
  const type = classifySatellite(sat.name)

  if (!satrec) return

  refs.satrecs[id] = satrec

  const isISS = type === "iss"
  const color = SATELLITE_COLORS[type] || SATELLITE_COLORS.other

  // Distance-based scaling: satellites shrink when zoomed out
  const scaleByDistance = new Cesium.NearFarScalar(
    1.0e5, 1.2,   // Close up: slightly larger
    2.0e7, 0.05   // Far away: very small (5% of original size)
  )

  // Labels only show when close to Earth (within 2,000km)
  const labelDistanceCondition = new Cesium.DistanceDisplayCondition(0, 2000000)

  // Create a sampled position property for smooth animation
  const positionProperty = new Cesium.SampledPositionProperty()
  positionProperty.setInterpolationOptions({
    interpolationDegree: 2,
    interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
  })

  // Pre-populate with position samples for smooth interpolation
  const now = Cesium.JulianDate.now()
  const updateInterval = 30 // seconds between samples
  const numSamples = 20 // number of future samples

  for (let i = -2; i < numSamples; i++) {
    const time = Cesium.JulianDate.addSeconds(now, i * updateInterval, new Cesium.JulianDate())
    const position = getPositionAtTime(satrec, time)
    
    if (position) {
      const cartesian = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt)
      positionProperty.addSample(time, cartesian)
    }
  }

  // Set the entity to use the sampled position property
  // This enables Cesium to interpolate positions smoothly
  const entity = viewer.entities.add({
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
          // ISS: Use billboard with SVG icon
          billboard: {
            image: SATELLITE_ICONS.iss,
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
          // Other satellites: Use point (smaller size, distance-based scaling handled differently)
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

  refs.entities[id] = entity
}

// Export function to update positions periodically
export function updateSatellitePositions(refs: SatelliteRefs) {
  const now = Cesium.JulianDate.now()
  const updateInterval = 30
  const numSamples = 20

  Object.keys(refs.satrecs).forEach((id) => {
    const satrec = refs.satrecs[id]
    const entity = refs.entities[id]

    if (!satrec || !entity) return
    if (!entity.position) return

    const positionProperty = entity.position as Cesium.SampledPositionProperty

    // Add new position samples
    for (let i = 0; i < numSamples; i++) {
      const time = Cesium.JulianDate.addSeconds(now, i * updateInterval, new Cesium.JulianDate())
      const position = getPositionAtTime(satrec, time)

      if (position) {
        const cartesian = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt)
        
        // Only add if we don't already have a sample close to this time
        const existingSamples = positionProperty.getValue(time)
        if (!existingSamples) {
          positionProperty.addSample(time, cartesian)
        }
      }
    }

    // Update availability to extend the time range
    entity.availability = new Cesium.TimeIntervalCollection([
      new Cesium.TimeInterval({
        start: Cesium.JulianDate.addSeconds(now, -60, new Cesium.JulianDate()),
        stop: Cesium.JulianDate.addSeconds(now, numSamples * updateInterval, new Cesium.JulianDate()),
      }),
    ])
  })
}
