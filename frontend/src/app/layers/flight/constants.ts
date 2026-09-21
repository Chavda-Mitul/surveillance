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

/**
 * Billboard scale-by-distance for airplane icons
 * Stays visible a bit larger than the point to keep icon readable
 */
export const FLIGHT_BILLBOARD_SCALE_BY_DISTANCE = new Cesium.NearFarScalar(
  1.0e4,  // Near distance (10 km)
  1.0,    // Full scale at near
  5.0e7,  // Far distance (50,000 km)
  0.15    // Small but visible at far
)

export const FLIGHT_LABEL_DISTANCE_CONDITION = new Cesium.DistanceDisplayCondition(
  0,
  5_000_000
)

/**
 * Airplane SVG icon as a data URI
 * Clean silhouette pointing upward — Cesium tints it via billboard.color
 */
export const FLIGHT_ICON_SVG: string = (() => {
  // Simple airplane silhouette pointing up
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white">
    <path d="M12 1.5 L14.5 9 L21.5 11 L23 13 L21.5 15 L14.5 17 L12 22.5 L9.5 17 L2.5 15 L1 13 L2.5 11 L9.5 9 Z"/>
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
})()

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

// ─── Smooth position animation ───────────────────────────────────

/** Interval between SampledPositionProperty samples (seconds) */
export const FLIGHT_SAMPLE_INTERVAL_SECONDS = 15
/** Number of extrapolated position samples to add ahead of the current time */
export const FLIGHT_NUM_POSITION_SAMPLES = 4

// ─── Route display constants ────────────────────────────────────

/** Color for the route polyline (origin → destination) */
export const FLIGHT_ROUTE_COLOR = Cesium.Color.fromCssColorString("#f59e0b") // Amber
/** Width of the route polyline */
export const FLIGHT_ROUTE_WIDTH = 2.5
/** Glow power for the route path */
export const FLIGHT_ROUTE_GLOW_POWER = 0.25
/** Color for the departure airport marker */
export const FLIGHT_DEPARTURE_COLOR = Cesium.Color.fromCssColorString("#10b981") // Emerald green
/** Color for the arrival airport marker */
export const FLIGHT_ARRIVAL_COLOR = Cesium.Color.fromCssColorString("#ef4444") // Red
/** Pixel size for airport markers */
export const FLIGHT_AIRPORT_MARKER_SIZE = 12
/** Color for the trajectory trail (actual flown path from OpenSky) */
export const FLIGHT_TRAJECTORY_COLOR = Cesium.Color.fromCssColorString("#8b5cf6") // Purple
/** Width for the trajectory trail */
export const FLIGHT_TRAJECTORY_WIDTH = 1.5