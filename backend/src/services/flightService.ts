import { config } from "../config"
import { getRedis } from "../lib/redis"
import { CelestrakFetchError, DataParseError, CacheError } from "../utils/errors"

/**
 * OpenSky API flight state
 * The API returns states as arrays:
 * [icao24, callsign, origin_country, time_position, last_contact,
 *  longitude, latitude, baro_altitude, velocity, heading, vertical_rate,
 *  on_ground, alert, geo_altitude, squawk, spi, position_source]
 */
export interface Flight {
  /** ICAO 24-bit transponder ID (hex string) */
  icao24: string
  /** Flight callsign (usually airline + flight number) */
  callsign: string
  /** Country of origin */
  originCountry: string
  /** Last position update timestamp (epoch seconds) */
  timePosition: number
  /** Last contact timestamp (epoch seconds) */
  lastContact: number
  /** Longitude in decimal degrees */
  longitude: number
  /** Latitude in decimal degrees */
  latitude: number
  /** Barometric altitude in metres */
  baroAltitude: number
  /** Velocity in m/s */
  velocity: number
  /** Heading/true track in degrees (0-360) */
  heading: number
  /** Vertical rate in m/s */
  verticalRate: number
  /** Whether the aircraft is on the ground */
  onGround: boolean
  /** Geometric altitude in metres */
  geoAltitude: number
  /** Mode A squawk code */
  squawk: string
  /** Whether SPI (Special Position Indicator) is set */
  spi: boolean
  /** Source of position data */
  positionSource: number
}

/**
 * Classification type for flight filters
 */
export type FlightFilter = "all" | "commercial" | "cargo" | "private" | "military"

/**
 * Fetch flights from OpenSky API with caching to Redis
 */
async function fetchFlightsFromOpenSky(): Promise<Flight[]> {
  const url = `${config.opensky.apiUrl}?extended=1`

  const auth = Buffer.from(
    `${config.opensky.clientId}:${config.opensky.clientSecret}`
  ).toString("base64")

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
    signal: AbortSignal.timeout(config.opensky.timeout),
  })

  if (!response.ok) {
    throw new CelestrakFetchError(
      `OpenSky API returned status ${response.status}`
    )
  }

  const data = await response.json()

  if (!data || !Array.isArray(data.states)) {
    throw new DataParseError("Invalid OpenSky response format")
  }

  const flights: Flight[] = data.states
    .filter((state: unknown[]) => {
      // Must have valid lat/lon and not be on ground
      const lat = state[6] as number
      const lon = state[5] as number
      return (
        typeof lat === "number" &&
        typeof lon === "number" &&
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat !== null &&
        lon !== null
      )
    })
    .map((state: unknown[]) => ({
      icao24: (state[0] as string) || "",
      callsign: ((state[1] as string) || "").trim(),
      originCountry: (state[2] as string) || "",
      timePosition: (state[3] as number) || 0,
      lastContact: (state[4] as number) || 0,
      longitude: state[5] as number,
      latitude: state[6] as number,
      baroAltitude: (state[7] as number) || 0,
      velocity: (state[9] as number) || 0,
      heading: (state[10] as number) || 0,
      verticalRate: (state[11] as number) || 0,
      onGround: (state[12] as boolean) || false,
      geoAltitude: (state[13] as number) || 0,
      squawk: (state[14] as string) || "",
      spi: (state[15] as boolean) || false,
      positionSource: (state[16] as number) || 0,
    }))

  return flights
}

/**
 * Get cached flights or fetch fresh data
 */
export async function getFlights(): Promise<Flight[]> {
  try {
    const redis = await getRedis()
    const cached = await redis.get(config.cache.flightKey)

    if (cached) {
      return JSON.parse(cached) as Flight[]
    }

    const flights = await fetchFlightsFromOpenSky()

    await redis.set(
      config.cache.flightKey,
      JSON.stringify(flights),
      { EX: config.cache.flightTTL }
    )

    return flights
  } catch (error) {
    if (error instanceof CacheError || error instanceof CelestrakFetchError || error instanceof DataParseError) {
      throw error
    }
    throw new CacheError("Failed to fetch flight data")
  }
}

/**
 * Force refresh flight data (called by cron or on-demand)
 */
export async function refreshFlights(): Promise<Flight[]> {
  const flights = await fetchFlightsFromOpenSky()

  try {
    const redis = await getRedis()
    await redis.set(
      config.cache.flightKey,
      JSON.stringify(flights),
      { EX: config.cache.flightTTL }
    )
  } catch {
    // Non-critical - data is already fetched
  }

  return flights
}