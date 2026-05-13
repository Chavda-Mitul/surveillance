import axios from "axios"
import type { Vessel } from "./types"

export async function fetchVessels(): Promise<Vessel[]> {
  const res = await axios.get("http://localhost:3000/api/vessels")
  return res.data
}
