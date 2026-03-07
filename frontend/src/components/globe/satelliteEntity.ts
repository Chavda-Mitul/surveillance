import * as Cesium from "cesium"
import { createSatrec, getPosition, classifySatellite } from "../../satellites/orbit"
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
  const position = getPosition(satrec)

  if (!position) return

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

  const entity = viewer.entities.add({
    id,
    position: Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt),
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
            // Scale by distance for points
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

export function updateSatellitePositions(refs: SatelliteRefs) {
  Object.keys(refs.satrecs).forEach((id) => {
    const satrec = refs.satrecs[id]
    const position = getPosition(satrec)
    const entity = refs.entities[id]

    if (!position || !entity) return

    entity.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt)
    )
  })
}
