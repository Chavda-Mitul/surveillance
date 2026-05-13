import axios, { AxiosError } from "axios"
import { getRedis } from "../lib/redis"
import { TLESatellite } from "../schema/satellite"
import { config } from "../config"
import { CelestrakFetchError, DataParseError, CacheError } from "../utils/errors"

interface CelestrakGPJson {
  OBJECT_NAME: string
  TLE_LINE1: string
  TLE_LINE2: string
  [key: string]: unknown
}

/**
 * Parse JSON GP data from Celestrak response
 */
function parseGPJson(data: CelestrakGPJson[]): TLESatellite[] {
  const satellites: TLESatellite[] = []

  for (const entry of data) {
    if (!entry.OBJECT_NAME || !entry.TLE_LINE1 || !entry.TLE_LINE2) {
      continue
    }

    const line1 = entry.TLE_LINE1.trim()
    const line2 = entry.TLE_LINE2.trim()

    if (line1.length < 69 || line2.length < 69) {
      console.warn(`Invalid TLE format for satellite: ${entry.OBJECT_NAME}`)
      continue
    }

    satellites.push({
      name: entry.OBJECT_NAME.trim(),
      line1,
      line2,
    })
  }

  if (satellites.length === 0) {
    throw new DataParseError("No valid satellites found in GP data")
  }

  return satellites
}

/**
 * Fetch satellite data from Celestrak and update cache
 */
export async function updateSatelliteCache(): Promise<TLESatellite[]> {
  try {
    console.log("Fetching satellite data from Celestrak...")

    const response = await axios.get(config.celestrak.url, {
      timeout: config.celestrak.timeout,
      headers: {
        "User-Agent": "SatelliteSurveillanceApp/1.0",
      },
    })

    const responseData = response.data

    // Celestrak returns a string message when data hasn't changed
    if (typeof responseData === "string" && responseData.includes("has not updated since")) {
      console.log("Celestrak data not updated since last fetch, using cache")
      const cached = await getSatelliteFromCache()
      if (cached) return cached
      throw new CelestrakFetchError("No new data from Celestrak and no cached data available")
    }

    if (!Array.isArray(responseData)) {
      throw new DataParseError("Unexpected response format from Celestrak")
    }

    const satellites = parseGPJson(responseData)
    console.log(`Parsed ${satellites.length} satellites`)

    // Update cache
    const redis = getRedis()
    await redis.set(
      config.cache.satelliteKey,
      JSON.stringify(satellites),
      {
        EX: config.cache.satelliteTTL,
      }
    )

    console.log("Satellite cache updated successfully")
    return satellites
  } catch (error) {
    if (error instanceof DataParseError) throw error

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError
      const message = axiosError.response?.statusText || axiosError.message
      throw new CelestrakFetchError(`Celestrak API error: ${message}`)
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    throw new CelestrakFetchError(`Failed to fetch satellite data: ${message}`)
  }
}

/**
 * Get satellite data from cache
 */
async function getSatelliteFromCache(): Promise<TLESatellite[] | null> {
  try {
    const redis = getRedis()
    const cached = await redis.get(config.cache.satelliteKey)

    if (!cached) return null

    const satellites = JSON.parse(cached) as TLESatellite[]
    console.log(`Retrieved ${satellites.length} satellites from cache`)

    return satellites
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    throw new CacheError(`Failed to get satellites from cache: ${message}`)
  }
}

/**
 * Get satellite data (from cache or fetch fresh)
 */
export async function getSatellites(): Promise<TLESatellite[]> {
  try {
    // Try cache first
    const cached = await getSatelliteFromCache()
    if (cached) {
      return cached
    }

    // Cache miss - fetch fresh data
    console.log("Cache miss - fetching fresh satellite data")
    return await updateSatelliteCache()
  } catch (error) {
    console.error("Error getting satellites:", error)
    throw error
  }
}
