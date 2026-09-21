/**
 * Earthquake event from the backend API
 */
export interface EarthquakeEvent {
  id: string
  magnitude: number
  place: string
  time: number
  longitude: number
  latitude: number
  depthKm: number
}

/**
 * Earthquake filter by minimum magnitude
 */
export type EarthquakeFilter = "all" | "2.5" | "4.5" | "6.0"