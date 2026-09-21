import * as Cesium from "cesium"

export const FLIGHT_FILTERS: string[] = ["all", "commercial", "cargo", "private", "military"]

export const FLIGHT_POINT_SIZE = 5
export const FLIGHT_OUTLINE_WIDTH = 0.5
export const FLIGHT_LABEL_FONT = "11px sans-serif"
export const FLIGHT_LABEL_OFFSET_Y = -14

export const FLIGHT_SCALE_BY_DISTANCE = new Cesium.NearFarScalar(
  1.0e4,
  2.0,
  3.0e7,
  0.08
)

export const FLIGHT_LABEL_DISTANCE_CONDITION = new Cesium.DistanceDisplayCondition(
  0,
  5_000_000
)

/**
 * Colors by flight classification
 */
export const FLIGHT_COLORS: Record<string, Cesium.Color> = {
  commercial: Cesium.Color.fromCssColorString("#3b82f6"), // Blue
  cargo:      Cesium.Color.fromCssColorString("#f59e0b"), // Amber
  private:    Cesium.Color.fromCssColorString("#10b981"), // Emerald
  military:   Cesium.Color.fromCssColorString("#ef4444"), // Red
  all:        Cesium.Color.fromCssColorString("#8b5cf6"), // Purple
}

/**
 * Colors by altitude category
 */
export const ALTITUDE_COLORS = {
  low:    Cesium.Color.fromCssColorString("#f97316"), // Orange  (< 3000m)
  cruise: Cesium.Color.fromCssColorString("#3b82f6"), // Blue    (3000-9000m)
  high:   Cesium.Color.fromCssColorString("#8b5cf6"), // Purple  (> 9000m)
}

/**
 * Color by speed category
 */
export const SPEED_COLORS = {
  slow:   Cesium.Color.fromCssColorString("#ef4444"), // Red
  normal: Cesium.Color.fromCssColorString("#f59e0b"), // Amber
  fast:   Cesium.Color.fromCssColorString("#10b981"), // Emerald
}

/**
 * Flight path trail constants
 */
/** Maximum number of historical positions kept per flight for the trail */
export const FLIGHT_TRAIL_MAX_POSITIONS = 60
/** Width of the trailing path polyline */
export const FLIGHT_TRAIL_WIDTH = 1.5
/** Opacity of the trailing path (starts opaque, fades along the trail) */
export const FLIGHT_TRAIL_OPACITY = 0.9
/** Dash length for the path preview (dashed line ahead of the aircraft) */
export const FLIGHT_PATH_PREVIEW_SECONDS = 120 // Show 2 min ahead
/** How far ahead (seconds) to extrapolate the flight direction */
export const FLIGHT_HEADING_PREVIEW_SECONDS = 60