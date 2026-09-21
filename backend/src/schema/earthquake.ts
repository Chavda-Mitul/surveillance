import { z } from "zod"

/**
 * Zod schema for an earthquake event from the USGS GeoJSON feed
 */
export const EarthquakeEventSchema = z.object({
  id: z.string().min(1, "Earthquake ID cannot be empty"),
  magnitude: z.number().min(0, "Magnitude must be non-negative"),
  place: z.string().min(1, "Place description cannot be empty"),
  time: z.number().min(0, "Time must be a valid epoch ms"),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  depthKm: z.number(),
})

export type EarthquakeEvent = z.infer<typeof EarthquakeEventSchema>

/**
 * Validate a single earthquake event
 */
export function validateEarthquakeEvent(data: unknown): EarthquakeEvent {
  return EarthquakeEventSchema.parse(data)
}

/**
 * Validate an array of earthquake events
 */
export function validateEarthquakeEvents(data: unknown): EarthquakeEvent[] {
  return z.array(EarthquakeEventSchema).min(0).parse(data)
}