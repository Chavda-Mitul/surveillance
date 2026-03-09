import axios, { AxiosError } from "axios"
import { getRedis } from "../lib/redis"
import { TLESatellite } from "../schema/satellite"
import { config } from "../config"
import { CelestrakFetchError, DataParseError, CacheError } from "../utils/errors"

/**
 * Parse TLE data from Celestrak response
 * TLE format: 3 lines per satellite (name, line1, line2)
 */
function parseTLE(data: string): TLESatellite[] {
  try {
    const lines = data.trim().split("\n")
    const satellites: TLESatellite[] = []

    for (let i = 0; i < lines.length; i += 3) {
      if (i + 2 >= lines.length) break

      const name = lines[i].trim()
      const line1 = lines[i + 1].trim()
      const line2 = lines[i + 2].trim()

      // Validate TLE format
      if (line1.length < 69 || line2.length < 69) {
        console.warn(`Invalid TLE format for satellite: ${name}`)
        continue
      }

      satellites.push({ name, line1, line2 })
    }

    if (satellites.length === 0) {
      throw new DataParseError("No valid satellites found in TLE data")
    }

    return satellites
  } catch (error) {
    if (error instanceof DataParseError) throw error
    const message = error instanceof Error ? error.message : "Unknown error"
    throw new DataParseError(`Failed to parse TLE data: ${message}`)
  }
}

/**
 * Fetch satellite data from Celestrak and update cache
 */
export async function updateSatelliteCache(): Promise<TLESatellite[]> {
  try {
    console.log("Fetching satellite data from Celestrak...")

    const response = await axios.get(config.celestrak.url, {
      responseType: "text",
      timeout: config.celestrak.timeout,
    })

    const satellites = parseTLE(response.data)
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
