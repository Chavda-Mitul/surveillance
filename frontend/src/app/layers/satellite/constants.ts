import * as Cesium from "cesium"

/**
 * Satellite rendering and animation constants
 */

// Update intervals
export const UPDATE_INTERVAL_SECONDS = 30
export const NUM_POSITION_SAMPLES = 20
export const AVAILABILITY_BUFFER_SECONDS = 60

// Scaling and distance settings
export const SCALE_BY_DISTANCE = new Cesium.NearFarScalar(
  1.0e5,  // Near distance
  1.2,    // Near scale
  2.0e7,  // Far distance
  0.05    // Far scale
)

export const LABEL_DISTANCE_CONDITION = new Cesium.DistanceDisplayCondition(
  0,
  2000000 // Only show labels within 2M meters
)

// ISS Billboard settings
export const ISS_BILLBOARD_SIZE = 48
export const ISS_LABEL_OFFSET_Y = -30
export const ISS_LABEL_FONT = "16px sans-serif"

// Regular satellite settings
export const SATELLITE_POINT_SIZE = 4
export const SATELLITE_OUTLINE_WIDTH = 1
export const SATELLITE_LABEL_OFFSET_Y = -15
export const SATELLITE_LABEL_FONT = "12px sans-serif"

// Orbit path settings
export const ORBIT_PATH_WIDTH = 2
export const ORBIT_PATH_GLOW_POWER = 0.2
export const ORBIT_PATH_STEP_MINUTES = 0.5

// Satellite type colors
export const SATELLITE_COLORS: Record<string, Cesium.Color> = {
  iss: Cesium.Color.LIME,
  communications: Cesium.Color.CYAN,
  gps: Cesium.Color.GOLD,
  debris: Cesium.Color.ORANGERED,
  other: Cesium.Color.LIGHTGRAY,
} as const

// Orbit path color
export const ORBIT_PATH_COLOR = Cesium.Color.YELLOW.withAlpha(0.7)

// Camera settings
export const FLYTO_HEADING_PITCH_RANGE = new Cesium.HeadingPitchRange(
  0,
  Cesium.Math.toRadians(-45),
  500000
)
export const FLYTO_DURATION_SECONDS = 1.5
