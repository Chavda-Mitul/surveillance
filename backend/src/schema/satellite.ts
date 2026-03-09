import { z } from "zod"

/**
 * TLE (Two-Line Element) Satellite Schema
 * Validates satellite orbital data format
 */
export const TLESatelliteSchema = z.object({
  name: z.string().min(1, "Satellite name cannot be empty"),
  line1: z.string().length(69, "TLE Line 1 must be exactly 69 characters"),
  line2: z.string().length(69, "TLE Line 2 must be exactly 69 characters"),
})

export type TLESatellite = z.infer<typeof TLESatelliteSchema>

/**
 * Array of satellites schema
 */
export const SatellitesResponseSchema = z.array(TLESatelliteSchema).min(1, "At least one satellite required")

/**
 * Validate TLE satellite data
 */
export function validateTLESatellite(data: unknown): TLESatellite {
  return TLESatelliteSchema.parse(data)
}

/**
 * Validate array of TLE satellites
 */
export function validateTLESatellites(data: unknown): TLESatellite[] {
  return SatellitesResponseSchema.parse(data)
}
