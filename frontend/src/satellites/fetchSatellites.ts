import axios from "axios"
import type { TLESatellite } from "./types"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ""

export async function fetchSatellites(): Promise<TLESatellite[]> {
  const res = await axios.get(`${BACKEND_URL}/api/satellites`)

  return res.data
}