import { z } from "zod"

/**
 * Zod schema for a single flight state
 */
export const FlightStateSchema = z.object({
  icao24: z.string(),
  callsign: z.string(),
  originCountry: z.string(),
  timePosition: z.number(),
  lastContact: z.number(),
  longitude: z.number(),
  latitude: z.number(),
  baroAltitude: z.number(),
  velocity: z.number(),
  heading: z.number(),
  verticalRate: z.number(),
  onGround: z.boolean(),
  geoAltitude: z.number(),
  squawk: z.string(),
  spi: z.boolean(),
  positionSource: z.number(),
})

/**
 * Zod schema for the flight list response
 */
export const FlightResponseSchema = z.object({
  flights: z.array(FlightStateSchema),
  timestamp: z.number(),
})

export type FlightResponse = z.infer<typeof FlightResponseSchema>

/**
 * Zod schema for a single route waypoint
 */
export const RouteWaypointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  altitude: z.number(),
  time: z.number(),
})

/**
 * Zod schema for a flight route response
 */
export const FlightRouteSchema = z.object({
  icao24: z.string(),
  callsign: z.string(),
  estDepartureAirport: z.string().nullable(),
  estArrivalAirport: z.string().nullable(),
  departureCoords: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).nullable(),
  arrivalCoords: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).nullable(),
  path: z.array(RouteWaypointSchema),
  hasRoute: z.boolean(),
})

export type FlightRouteResponse = z.infer<typeof FlightRouteSchema>