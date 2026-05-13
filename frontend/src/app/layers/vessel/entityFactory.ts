import * as Cesium from "cesium"
import type { Vessel } from "./vesselTypes"
import { classifyVessel } from "./vesselTypes"
import {
  VESSEL_COLORS,
  VESSEL_POINT_SIZE,
  VESSEL_OUTLINE_WIDTH,
  VESSEL_SCALE_BY_DISTANCE,
  VESSEL_LABEL_FONT,
  VESSEL_LABEL_OFFSET_Y,
  VESSEL_LABEL_DISTANCE_CONDITION,
} from "./constants"

export class VesselEntityFactory {
  static createEntity(
    vessel: Vessel,
    entityCollection: Cesium.EntityCollection
  ): Cesium.Entity {
    const type = classifyVessel(vessel.vesselType)
    const color = VESSEL_COLORS[type] ?? VESSEL_COLORS.other
    const position = Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 0)

    return entityCollection.add({
      id: vessel.mmsi,
      position: new Cesium.ConstantPositionProperty(position),
      point: {
        pixelSize: VESSEL_POINT_SIZE,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: VESSEL_OUTLINE_WIDTH,
        scaleByDistance: VESSEL_SCALE_BY_DISTANCE,
      },
      label: {
        text: vessel.name || vessel.mmsi,
        font: VESSEL_LABEL_FONT,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, VESSEL_LABEL_OFFSET_Y),
        distanceDisplayCondition: VESSEL_LABEL_DISTANCE_CONDITION,
        show: false,
      },
    })
  }

  static updatePosition(entity: Cesium.Entity, vessel: Vessel): void {
    const position = Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 0)
    ;(entity.position as Cesium.ConstantPositionProperty).setValue(position)
  }
}
