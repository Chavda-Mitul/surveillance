import axios from "axios"
import type { Vessel } from "./types"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ""

export async function fetchVessels(): Promise<Vessel[]> {
  const res = await axios.get(`${BACKEND_URL}/api/vessels`)
  return res.data
}
