import axios from "axios"
import type { FlightRoute } from "./types"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ""

/**
 * Fetch route information for a specific flight by ICAO24 code
 * Returns origin/destination airports and trajectory path if available
 */
export async function fetchFlightRoute(icao24: string, callsign: string): Promise<FlightRoute> {
  const response = await axios.get<FlightRoute>(
    `${BACKEND_URL}/api/flights/${icao24}/route`,
    {
      params: { callsign },
      timeout: 15000,
    }
  )
  return response.data
}