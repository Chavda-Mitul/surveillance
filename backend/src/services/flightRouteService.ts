import { config } from "../config"
import { getRedis } from "../lib/redis"
import { CelestrakFetchError, DataParseError, CacheError } from "../utils/errors"

/**
 * Route data for a specific flight
 */
export interface FlightRoute {
  icao24: string
  callsign: string
  /** Estimated departure airport ICAO code (null if unknown) */
  estDepartureAirport: string | null
  /** Estimated arrival airport ICAO code (null if unknown) */
  estArrivalAirport: string | null
  /** Coordinates of departure airport */
  departureCoords: { latitude: number; longitude: number } | null
  /** Coordinates of arrival airport */
  arrivalCoords: { latitude: number; longitude: number } | null
  /** Full trajectory path (lat/lon pairs) from OpenSky track API */
  path: Array<{ latitude: number; longitude: number; altitude: number; time: number }>
  /** Whether route data was found */
  hasRoute: boolean
}

/**
 * Airport info from OpenSky airport endpoint
 */
interface OpenSkyAirport {
  icao: string
  name: string
  latitude: number
  longitude: number
  elevation: number
  country: string
}

/**
 * Flight record from OpenSky aircraft endpoint
 */
interface OpenSkyFlightRecord {
  icao24: string
  firstSeen: number
  estDepartureAirport: string | null
  lastSeen: number
  estArrivalAirport: string | null
  callsign: string
  estDepartureAirportHorizDistance: number
  estDepartureAirportVertDistance: number
  estArrivalAirportHorizDistance: number
  estArrivalAirportVertDistance: number
  departureAirportCandidatesCount: number
  arrivalAirportCandidatesCount: number
}

/**
 * Track waypoint from OpenSky track API
 */
interface OpenSkyTrackWaypoint {
  /** Unix timestamp (seconds since epoch) */
  time: number
  /** Latitude */
  latitude: number
  /** Longitude */
  longitude: number
  /** Barometric altitude in metres */
  baroAltitude: number
  /** True track in degrees (0-360) */
  trueTrack: number
  /** Ground speed in m/s */
  velocity: number
}

// Build OpenSky API auth header
function getAuthHeader(): string {
  const auth = Buffer.from(
    `${config.opensky.clientId}:${config.opensky.clientSecret}`
  ).toString("base64")
  return `Basic ${auth}`
}

/**
 * Fetch basic auth headers for OpenSky
 */
async function openSkyFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
    },
    signal: AbortSignal.timeout(config.opensky.timeout),
  })
}

/**
 * Look up a flight's route from OpenSky.
 *
 * Uses two OpenSky endpoints:
 * 1. /api/flights/aircraft — gets departure/arrival airport ICAO codes
 * 2. /api/airports — gets airport coordinates (lat/lon)
 * 3. /api/tracks/all — gets the full trajectory path
 *
 * Results are cached in Redis for 6 hours.
 */
export async function getFlightRoute(icao24: string, callsign: string): Promise<FlightRoute> {
  const cacheKey = `flight-route:${icao24}`

  try {
    const redis = await getRedis()
    const cached = await redis.get(cacheKey)
    if (cached) {
      return JSON.parse(cached) as FlightRoute
    }
  } catch {
    // Redis unavailable — proceed without cache
  }

  try {
    // 1. Query OpenSky aircraft flights endpoint
    const now = Math.floor(Date.now() / 1000)
    const begin = now - 24 * 60 * 60 // 24 hours ago

    const flightUrl = `https://opensky-network.org/api/flights/aircraft?icao24=${icao24}&begin=${begin}&end=${now}`
    const flightResponse = await openSkyFetch(flightUrl)

    let estDepartureAirport: string | null = null
    let estArrivalAirport: string | null = null

    if (flightResponse.ok) {
      const flights = await flightResponse.json() as OpenSkyFlightRecord[]

      // Find the most recent flight matching our callsign
      const matchedFlight = flights.find(
        (f) => f.callsign.trim() === callsign
      ) || flights[0] // Fall back to first flight if no exact callsign match

      if (matchedFlight) {
        estDepartureAirport = matchedFlight.estDepartureAirport
        estArrivalAirport = matchedFlight.estArrivalAirport
      }
    }

    // 2. Get airport coordinates
    let departureCoords: { latitude: number; longitude: number } | null = null
    let arrivalCoords: { latitude: number; longitude: number } | null = null

    if (estDepartureAirport) {
      departureCoords = await getAirportCoordinates(estDepartureAirport)
    }
    if (estArrivalAirport) {
      arrivalCoords = await getAirportCoordinates(estArrivalAirport)
    }

    // 3. Get trajectory path from track API
    const path = await getFlightTrajectory(icao24, callsign)

    const hasRoute = !!(
      (estDepartureAirport && estArrivalAirport) ||
      path.length > 0
    )

    const route: FlightRoute = {
      icao24,
      callsign,
      estDepartureAirport,
      estArrivalAirport,
      departureCoords,
      arrivalCoords,
      path,
      hasRoute,
    }

    // Cache in Redis for 6 hours
    try {
      const redis = await getRedis()
      await redis.set(cacheKey, JSON.stringify(route), { EX: 60 * 60 * 6 })
    } catch {
      // Non-critical
    }

    return route
  } catch (error) {
    // Return empty route on any error
    return {
      icao24,
      callsign,
      estDepartureAirport: null,
      estArrivalAirport: null,
      departureCoords: null,
      arrivalCoords: null,
      path: [],
      hasRoute: false,
    }
  }
}

/**
 * Get airport coordinates from OpenSky airport API
 */
async function getAirportCoordinates(icao: string): Promise<{ latitude: number; longitude: number } | null> {
  // Normalize ICAO code — OpenSky expects uppercase
  const normalized = icao.toUpperCase()

  try {
    const response = await openSkyFetch(
      `https://opensky-network.org/api/airports?icao=${normalized}`
    )

    if (response.ok) {
      const airports = await response.json() as OpenSkyAirport[]
      if (airports.length > 0) {
        const airport = airports[0]
        return {
          latitude: airport.latitude,
          longitude: airport.longitude,
        }
      }
    }
  } catch {
    // Non-critical — can proceed without coordinates
  }

  // Fallback: use a built-in map of common airport ICAO codes
  return getFallbackAirportCoords(icao)
}

/**
 * Get a flight's trajectory from OpenSky track API.
 * The track API returns the aircraft's path for a specific time frame.
 */
async function getFlightTrajectory(
  icao24: string,
  callsign: string
): Promise<Array<{ latitude: number; longitude: number; altitude: number; time: number }>> {
  const now = Math.floor(Date.now() / 1000)
  // Try to fetch trajectory from around the current time (past hour)
  const trackTime = now - 30 * 60 // 30 minutes ago

  try {
    const response = await openSkyFetch(
      `https://opensky-network.org/api/tracks/all?icao24=${icao24}&time=${trackTime}`
    )

    if (response.ok) {
      const data = await response.json()
      // The response has a "path" array of waypoints
      if (data && Array.isArray(data.path) && data.path.length > 0) {
        return data.path.map((wp: OpenSkyTrackWaypoint) => ({
          latitude: wp.latitude,
          longitude: wp.longitude,
          altitude: wp.baroAltitude || 0,
          time: wp.time,
        }))
      }
    }
  } catch {
    // Non-critical
  }

  return []
}

/**
 * Fallback coordinates for common airports worldwide
 * Used when the OpenSky airport API is unavailable
 */
function getFallbackAirportCoords(icao: string): { latitude: number; longitude: number } | null {
  const airportDb: Record<string, { latitude: number; longitude: number }> = {
    // Major US airports
    "KJFK": { latitude: 40.6413, longitude: -73.7781 },
    "KLAX": { latitude: 33.9416, longitude: -118.4085 },
    "KORD": { latitude: 41.9742, longitude: -87.9073 },
    "KDFW": { latitude: 32.8998, longitude: -97.0403 },
    "KATL": { latitude: 33.6407, longitude: -84.4277 },
    "KSFO": { latitude: 37.6213, longitude: -122.3790 },
    "KDEN": { latitude: 39.8561, longitude: -104.6737 },
    "KSEA": { latitude: 47.4502, longitude: -122.3088 },
    "KMIA": { latitude: 25.7932, longitude: -80.2906 },
    "KBOS": { latitude: 42.3656, longitude: -71.0096 },
    "KPHL": { latitude: 39.8742, longitude: -75.2422 },
    "KLGA": { latitude: 40.7769, longitude: -73.8740 },
    "KDCA": { latitude: 38.8532, longitude: -77.0438 },
    "KIAD": { latitude: 38.9531, longitude: -77.4565 },
    "KEWR": { latitude: 40.6895, longitude: -74.1745 },
    "KIAH": { latitude: 29.9841, longitude: -95.3414 },
    "KMCO": { latitude: 28.4289, longitude: -81.3082 },
    "KPHX": { latitude: 33.4352, longitude: -112.0101 },
    "KLAS": { latitude: 36.0840, longitude: -115.1537 },
    "KMSP": { latitude: 44.8834, longitude: -93.2162 },

    // Major European airports
    "EGLL": { latitude: 51.4700, longitude: -0.4543 },  // London Heathrow
    "EGKK": { latitude: 51.1539, longitude: -0.1785 },  // London Gatwick
    "LFPG": { latitude: 49.0097, longitude: 2.5478 },   // Paris CDG
    "LFPO": { latitude: 48.7233, longitude: 2.3594 },   // Paris Orly
    "EDDF": { latitude: 50.0379, longitude: 8.5622 },   // Frankfurt
    "EDDM": { latitude: 48.3538, longitude: 11.7759 },  // Munich
    "EHAM": { latitude: 52.3105, longitude: 4.7683 },   // Amsterdam Schiphol
    "LEMD": { latitude: 40.4722, longitude: -3.5624 },  // Madrid Barajas
    "LEBL": { latitude: 41.2971, longitude: 2.0785 },   // Barcelona
    "LIRF": { latitude: 41.8002, longitude: 12.2502 },  // Rome Fiumicino
    "LSZH": { latitude: 47.4584, longitude: 8.5480 },   // Zurich
    "LOWW": { latitude: 48.1197, longitude: 16.5697 },  // Vienna
    "EKCH": { latitude: 55.6303, longitude: 12.6360 },  // Copenhagen
    "ESSA": { latitude: 59.6498, longitude: 17.9293 },  // Stockholm Arlanda
    "EFHK": { latitude: 60.3200, longitude: 24.9558 },  // Helsinki
    "ENGM": { latitude: 60.1939, longitude: 11.1004 },  // Oslo
    "EBBR": { latitude: 50.9000, longitude: 4.4833 },   // Brussels
    "EIDW": { latitude: 53.4264, longitude: -6.2499 },  // Dublin

    // Major Asian airports
    "RJTT": { latitude: 35.5494, longitude: 139.7798 }, // Tokyo Haneda
    "RJAA": { latitude: 35.7647, longitude: 140.3864 }, // Tokyo Narita
    "ZSPD": { latitude: 31.1434, longitude: 121.8053 }, // Shanghai Pudong
    "ZSSS": { latitude: 31.1979, longitude: 121.3388 }, // Shanghai Hongqiao
    "ZBAA": { latitude: 40.0801, longitude: 116.5846 }, // Beijing Capital
    "ZGGG": { latitude: 23.3925, longitude: 113.2988 }, // Guangzhou
    "VHHH": { latitude: 22.3080, longitude: 113.9185 }, // Hong Kong
    "RKSI": { latitude: 37.4639, longitude: 126.4397 }, // Seoul Incheon
    "WSSS": { latitude: 1.3642, longitude: 103.9915 },  // Singapore Changi
    "VTBS": { latitude: 13.6976, longitude: 100.7508 }, // Bangkok Suvarnabhumi
    "WMKK": { latitude: 2.7465, longitude: 101.7088 },  // Kuala Lumpur
    "VIDP": { latitude: 28.5562, longitude: 77.1000 },  // Delhi
    "VABB": { latitude: 19.0896, longitude: 72.8670 },  // Mumbai
    "OMDB": { latitude: 25.2582, longitude: 55.3030 },  // Dubai
    "OTHH": { latitude: 25.2609, longitude: 51.5735 },  // Doha
    "BIKF": { latitude: 63.9850, longitude: -22.6056 }, // Reykjavik Keflavik

    // Major Middle East / African airports
    "HECA": { latitude: 30.1127, longitude: 31.4123 },  // Cairo
    "FAOR": { latitude: -26.1348, longitude: 28.2425 }, // Johannesburg O.R. Tambo
    "DNMM": { latitude: 6.5775, longitude: 3.3211 },    // Lagos

    // Australia / Oceania
    "YSSY": { latitude: -33.9399, longitude: 151.1753 },// Sydney
    "YMML": { latitude: -37.6692, longitude: 144.8430 },// Melbourne
    "YBBN": { latitude: -27.3942, longitude: 153.1171 },// Brisbane
    "NZAA": { latitude: -37.0081, longitude: 174.7919 },// Auckland
  }

  return airportDb[icao] ?? null
}