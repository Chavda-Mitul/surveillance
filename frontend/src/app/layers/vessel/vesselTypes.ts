import type { Vessel, VesselFilter } from "../../../vessels/types"

export type { Vessel, VesselFilter }

export function classifyVessel(typeCode: number): VesselFilter {
  if (typeCode >= 70 && typeCode <= 79) return "cargo"
  if (typeCode >= 80 && typeCode <= 89) return "tanker"
  if (typeCode >= 60 && typeCode <= 69) return "passenger"
  if (typeCode >= 30 && typeCode <= 35) return "fishing"
  return "other"
}
