export interface Vessel {
  mmsi: string
  name: string
  lat: number
  lon: number
  speed: number
  course: number
  vesselType: number
  updatedAt: number
}

export type VesselFilter = "all" | "cargo" | "tanker" | "passenger" | "fishing" | "other"
