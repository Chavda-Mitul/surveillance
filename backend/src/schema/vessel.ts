import { z } from "zod"

export const VesselSchema = z.object({
  mmsi: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  speed: z.number(),
  course: z.number(),
  vesselType: z.number(),
  updatedAt: z.number(),
})

export type Vessel = z.infer<typeof VesselSchema>
