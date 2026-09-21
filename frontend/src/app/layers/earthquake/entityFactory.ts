import * as Cesium from "cesium"
import type { EarthquakeEvent } from "./earthquakeTypes"
import { classifyMagnitude } from "./earthquakeTypes"
import {
  EARTHQUAKE_COLORS,
  EARTHQUAKE_MIN_POINT_SIZE,
  EARTHQUAKE_POINT_SCALE,
  EARTHQUAKE_OUTLINE_WIDTH,
  EARTHQUAKE_LABEL_FONT,
  EARTHQUAKE_LABEL_OFFSET_Y,
  EARTHQUAKE_LABEL_DISTANCE_CONDITION,
  EARTHQUAKE_SCALE_BY_DISTANCE,
} from "./constants"

/**
 * Stateless factory for creating/updating Cesium earthquake entities.
 */
export class EarthquakeEntityFactory {
  /**
   * Create a Cesium entity for an earthquake event.
   * Returns the entity — it's already added to the provided collection.
   */
  static createEntity(
    event: EarthquakeEvent,
    collection: Cesium.EntityCollection
  ): Cesium.Entity {
    const severity = classifyMagnitude(event.magnitude)
    const color = EARTHQUAKE_COLORS[severity] ?? EARTHQUAKE_COLORS.minor
    const pixelSize = Math.max(EARTHQUAKE_MIN_POINT_SIZE, event.magnitude * EARTHQUAKE_POINT_SCALE)
    const position = Cesium.Cartesian3.fromDegrees(event.longitude, event.latitude, 0)

    const entity = collection.add({
      id: `earthquake-${event.id}`,
      position: new Cesium.ConstantPositionProperty(position),
      point: {
        pixelSize,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: EARTHQUAKE_OUTLINE_WIDTH,
        scaleByDistance: EARTHQUAKE_SCALE_BY_DISTANCE,
      },
      label: {
        text: `M${event.magnitude.toFixed(1)}`,
        font: EARTHQUAKE_LABEL_FONT,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, EARTHQUAKE_LABEL_OFFSET_Y),
        distanceDisplayCondition: EARTHQUAKE_LABEL_DISTANCE_CONDITION,
        show: false,
      },
      properties: {
        eqId: event.id,
        magnitude: event.magnitude,
        place: event.place,
        time: event.time,
        depthKm: event.depthKm,
        severity,
      },
    })

    return entity
  }

  /**
   * Update an existing entity's position and properties in-place.
   * Since earthquakes are static, this mainly updates magnitude/color if changed.
   */
  static updateEntity(
    entity: Cesium.Entity,
    event: EarthquakeEvent
  ): void {
    const severity = classifyMagnitude(event.magnitude)
    const color = EARTHQUAKE_COLORS[severity] ?? EARTHQUAKE_COLORS.minor
    const pixelSize = Math.max(EARTHQUAKE_MIN_POINT_SIZE, event.magnitude * EARTHQUAKE_POINT_SCALE)

    const position = Cesium.Cartesian3.fromDegrees(event.longitude, event.latitude, 0)
    const posProp = entity.position as Cesium.ConstantPositionProperty
    if (posProp) {
      posProp.setValue(position)
    }

    if (entity.point) {
      entity.point.pixelSize = new Cesium.ConstantProperty(pixelSize)
      entity.point.color = new Cesium.ConstantProperty(color)
    }

    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(`M${event.magnitude.toFixed(1)}`)
    }

    if (entity.properties) {
      entity.properties.magnitude?.setValue(event.magnitude)
      entity.properties.place?.setValue(event.place)
      entity.properties.depthKm?.setValue(event.depthKm)
      entity.properties.severity?.setValue(severity)
    }
  }
}