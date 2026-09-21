import axios from "axios"
import type { Flight } from "./types"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ""

/**
 * Fetch flights from the backend (which proxies OpenSky)
 */
export async function fetchFlights(): Promise<Flight[]> {
  const response = await axios.get<Flight[]>(`${BACKEND_URL}/api/flights`, {
    timeout: 15000,
  })
  return response.data
}