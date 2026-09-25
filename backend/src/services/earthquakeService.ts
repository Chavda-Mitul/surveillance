import axios, { AxiosError } from "axios"
import { getRedis } from "../lib/redis"
import { EarthquakeEvent, validateEarthquakeEvents } from "../schema/earthquake"
import { config } from "../config"
import { CacheError, DataParseError, USGSFetchError } from "../utils/errors"

/**
 * Raw USGS GeoJSON Feature geometry coordinates
 * [longitude, latitude, depth_in_km]
 */
type USGSGeometry = [number, number, number]

/**
 * Raw USGS GeoJSON Feature properties
 */
interface USGSProperties {
  mag: number
  place: string
  time: number
  [key: string]: unknown
}

/**
 * Raw USGS GeoJSON Feature
 */
interface USGSFeature {
  id: string
  properties: USGSProperties
  geometry: {
    coordinates: USGSGeometry
  }
}

/**
 * Raw USGS GeoJSON response envelope
 */
interface USGSResponse {
  features: USGSFeature[]
}

/**
 * Parse raw USGS GeoJSON features into normalized EarthquakeEvent[]
 */
function parseUSGSResponse(data: unknown): EarthquakeEvent[] {
  if (!data || typeof data !== "object") {
    throw new DataParseError("USGS response is not an object")
  }

  const envelope = data as USGSResponse

  if (!Array.isArray(envelope.features)) {
    throw new DataParseError("USGS response missing 'features' array")
  }

  const events: EarthquakeEvent[] = []

  for (const feature of envelope.features) {
    if (!feature.id || !feature.properties || !feature.geometry?.coordinates) {
      continue
    }

    const [longitude, latitude, depthKm] = feature.geometry.coordinates
    const { mag, place, time } = feature.properties

    if (
      typeof mag !== "number" ||
      typeof place !== "string" ||
      typeof time !== "number" ||
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      typeof depthKm !== "number"
    ) {
      continue
    }

    if (!Number.isFinite(mag) || !Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue
    }

    // Skip events with negative magnitudes — USGS assigns negative values
    // to tiny tremors below detection threshold; they clutter the globe.
    if (mag < 0) {
      continue
    }

    events.push({
      id: feature.id,
      magnitude: mag,
      place,
      time,
      longitude,
      latitude,
      depthKm,
    })
  }

  if (events.length === 0) {
    throw new DataParseError("No valid earthquake events could be parsed from USGS response")
  }

  // Validate through Zod
  return validateEarthquakeEvents(events)
}

/**
 * Fetch earthquake data from USGS GeoJSON feed
 */
export async function fetchEarthquakesFromUSGS(): Promise<EarthquakeEvent[]> {
  try {
    console.log("Fetching earthquake data from USGS...")

    const response = await axios.get(config.earthquake.url, {
      timeout: config.earthquake.timeout,
      headers: {
        "User-Agent": "SurveillanceApp/1.0",
        Accept: "application/json",
      },
    })

    const events = parseUSGSResponse(response.data)
    console.log(`Parsed ${events.length} earthquake events from USGS`)
    return events
  } catch (error) {
    if (error instanceof DataParseError) throw error

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError
      const message = axiosError.response?.statusText || axiosError.message
      throw new USGSFetchError(`USGS API error: ${message}`)
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    throw new USGSFetchError(`Failed to fetch earthquake data: ${message}`)
  }
}

/**
 * Update the earthquake cache in Redis
 */
export async function updateEarthquakeCache(): Promise<EarthquakeEvent[]> {
  const events = await fetchEarthquakesFromUSGS()

  try {
    const redis = getRedis()
    await redis.set(config.earthquake.cacheKey, JSON.stringify(events), {
      EX: config.earthquake.cacheTTL,
    })
    console.log("Earthquake cache updated successfully")
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    throw new CacheError(`Failed to update earthquake cache: ${message}`)
  }

  return events
}

/**
 * Get earthquake events from cache (or fetch fresh on cache miss)
 */
export async function getEarthquakes(): Promise<EarthquakeEvent[]> {
  try {
    const redis = getRedis()
    const cached = await redis.get(config.earthquake.cacheKey)

    if (cached) {
      const events = JSON.parse(cached) as EarthquakeEvent[]
      return events
    }

    // Cache miss - fetch fresh
    console.log("Earthquake cache miss — fetching fresh data from USGS")
    return await updateEarthquakeCache()
  } catch (error) {
    if (error instanceof CacheError || error instanceof USGSFetchError || error instanceof DataParseError) {
      throw error
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    throw new CacheError(`Failed to get earthquakes from cache: ${message}`)
  }
}

/**
 * Filter earthquake events by minimum magnitude
 */
export function filterByMinMagnitude(events: EarthquakeEvent[], minMag: number): EarthquakeEvent[] {
  return events.filter((e) => e.magnitude >= minMag)
}