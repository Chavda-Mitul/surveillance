import axios from "axios"
import type { EarthquakeEvent } from "./types"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ""

/**
 * Fetch earthquake events from the backend (which proxies USGS via Redis cache)
 */
export async function fetchEarthquakes(): Promise<EarthquakeEvent[]> {
  const response = await axios.get<EarthquakeEvent[]>(`${BACKEND_URL}/api/earthquakes`, {
    timeout: 15000,
  })
  return response.data
}