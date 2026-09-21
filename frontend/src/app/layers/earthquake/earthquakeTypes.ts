export type { EarthquakeEvent } from "../../../earthquakes/types"

/**
 * Earthquake filter by minimum magnitude threshold
 * Converted from UI string back to number for API query
 */
export type EarthquakeFilter = "all" | "2.5" | "4.5" | "6.0"

/**
 * Convert a UI filter value to a numeric minimum magnitude for the API
 * Returns undefined for "all" (no filter)
 */
export function filterToMinMag(filter: EarthquakeFilter): number | undefined {
  switch (filter) {
    case "all": return undefined
    case "2.5": return 2.5
    case "4.5": return 4.5
    case "6.0": return 6.0
  }
}

/**
 * Classify magnitude into a severity label
 */
export function classifyMagnitude(mag: number): "minor" | "moderate" | "strong" {
  if (mag < 3.0) return "minor"
  if (mag < 5.0) return "moderate"
  return "strong"
}