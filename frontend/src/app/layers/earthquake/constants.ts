import * as Cesium from "cesium"

/**
 * List of available magnitude filters for the earthquake panel
 */
export const EARTHQUAKE_FILTERS = ["all", "2.5", "4.5", "6.0"] as const

/**
 * Colors by magnitude severity
 */
export const EARTHQUAKE_COLORS: Record<string, Cesium.Color> = {
  minor: Cesium.Color.YELLOW.withAlpha(0.7),
  moderate: Cesium.Color.ORANGE.withAlpha(0.8),
  strong: Cesium.Color.RED.withAlpha(0.9),
}

/**
 * Base point size; actual size = max(6, magnitude * 4)
 */
export const EARTHQUAKE_MIN_POINT_SIZE = 6
export const EARTHQUAKE_POINT_SCALE = 4
export const EARTHQUAKE_OUTLINE_WIDTH = 1

/**
 * Label configuration
 */
export const EARTHQUAKE_LABEL_FONT = "11px sans-serif"
export const EARTHQUAKE_LABEL_OFFSET_Y = -20

export const EARTHQUAKE_LABEL_DISTANCE_CONDITION = new Cesium.DistanceDisplayCondition(
  0,
  3_000_000
)

export const EARTHQUAKE_SCALE_BY_DISTANCE = new Cesium.NearFarScalar(
  1.0e4,
  1.5,
  2.0e7,
  0.3
)