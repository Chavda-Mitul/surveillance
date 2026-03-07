import * as Cesium from "cesium"
import type { SatelliteFilter } from "./types"

export const SATELLITE_FILTERS: SatelliteFilter[] = [
  "all",
  "iss",
  "communications",
  "gps",
  "debris",
  "other"
]

export const SATELLITE_ICONS: Record<string, string> = {
  communications: "/icons/satellite-communication.svg",
  gps: "/icons/satellite-gps.svg",
  debris: "/icons/satellite-debris.svg",
  other: "/icons/satellite-others.svg",
  iss: "/icons/international-space-station.svg",
}

// Distinct, visually clear colors for each satellite type
export const SATELLITE_COLORS: Record<string, Cesium.Color> = {
  // ISS - Bright green (easy to spot)
  iss: Cesium.Color.LIME,
  
  // Communications - Cyan/blue (Starlink, Iridium, etc.)
  communications: Cesium.Color.CYAN,
  
  // GPS/Navigation - Gold/Yellow (GPS, Galileo, GLONASS)
  gps: Cesium.Color.GOLD,
  
  // Debris - Red (danger/attention)
  debris: Cesium.Color.ORANGERED,
  
  // Other - White/Light gray
  other: Cesium.Color.LIGHTGRAY,
}

// Color names for UI display
export const SATELLITE_COLOR_NAMES: Record<string, string> = {
  iss: "Green",
  communications: "Cyan",
  gps: "Gold",
  debris: "Red",
  other: "Gray",
}
