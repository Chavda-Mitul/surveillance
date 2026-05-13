import * as Cesium from "cesium"
import type { VesselFilter } from "./vesselTypes"

export const VESSEL_FILTERS: VesselFilter[] = ["all", "cargo", "tanker", "passenger", "fishing", "other"]

export const VESSEL_POINT_SIZE = 6
export const VESSEL_OUTLINE_WIDTH = 1
export const VESSEL_LABEL_FONT = "12px sans-serif"
export const VESSEL_LABEL_OFFSET_Y = -15

export const VESSEL_SCALE_BY_DISTANCE = new Cesium.NearFarScalar(
  1.0e4,
  1.5,
  2.0e7,
  0.1
)

export const VESSEL_LABEL_DISTANCE_CONDITION = new Cesium.DistanceDisplayCondition(
  0,
  3_000_000
)

export const VESSEL_COLORS: Record<string, Cesium.Color> = {
  cargo:     Cesium.Color.STEELBLUE,
  tanker:    Cesium.Color.DARKORANGE,
  passenger: Cesium.Color.GOLD,
  fishing:   Cesium.Color.LIMEGREEN,
  other:     Cesium.Color.LIGHTGRAY,
}
