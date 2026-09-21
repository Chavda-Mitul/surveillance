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
  VESSEL_TRAIL_WIDTH,
  VESSEL_TRAIL_OPACITY,
} from "./constants"

export interface VesselEntityResult {
  entity: Cesium.Entity
  trail: Cesium.Entity | null
}

export class VesselEntityFactory {
  static createEntity(
    vessel: Vessel,
    entityCollection: Cesium.EntityCollection
  ): VesselEntityResult {
    const type = classifyVessel(vessel.vesselType)
    const color = VESSEL_COLORS[type] ?? VESSEL_COLORS.other
    const position = Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 0)

    const entity = entityCollection.add({
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
      properties: {
        mmsi: vessel.mmsi,
        name: vessel.name,
        speed: vessel.speed,
        course: vessel.course,
        vesselType: vessel.vesselType,
        type: type,
      },
    })

    // Create trail polyline (starts as a single point segment)
    const trailPositions: Cesium.Cartesian3[] = [position, position]
    const trail = entityCollection.add({
      id: `vessel-trail-${vessel.mmsi}`,
      polyline: new Cesium.PolylineGraphics({
        positions: trailPositions,
        width: VESSEL_TRAIL_WIDTH,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.12,
          color: color.withAlpha(VESSEL_TRAIL_OPACITY),
        }),
        arcType: Cesium.ArcType.RHUMB,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 30_000_000),
        clampToGround: true,
      }),
      properties: {
        parentVesselId: vessel.mmsi,
      },
    })

    return { entity, trail }
  }

  static updatePosition(
    entity: Cesium.Entity,
    vessel: Vessel,
    trailEntity?: Cesium.Entity | null,
    positionHistory?: Cesium.Cartesian3[]
  ): void {
    const position = Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 0)

    const posProp = entity.position as Cesium.ConstantPositionProperty
    if (posProp) {
      posProp.setValue(position)
    }

    // Update properties
    if (entity.properties) {
      entity.properties.speed?.setValue(vessel.speed)
      entity.properties.course?.setValue(vessel.course)
    }

    // Update trail if we have history
    if (trailEntity && positionHistory && positionHistory.length >= 2) {
      const polyline = trailEntity.polyline as Cesium.PolylineGraphics
      if (polyline) {
        polyline.positions = new Cesium.ConstantProperty([...positionHistory])
      }
    }
  }
}