import axios from "axios"
import type { TLESatellite } from "./types"

export async function fetchSatellites(): Promise<TLESatellite[]> {

  const res = await axios.get("http://localhost:3000/api/satellites")

  return res.data
}