import axios, { AxiosError } from "axios"
import { getRedis } from "../lib/redis"
import { TLESatellite } from "../schema/satellite"
import { config } from "../config"
import { CelestrakFetchError, DataParseError, CacheError } from "../utils/errors"

interface CelestrakOrbitalJson {
  OBJECT_NAME: string
  OBJECT_ID: string
  EPOCH: string
  MEAN_MOTION: number
  ECCENTRICITY: number
  INCLINATION: number
  RA_OF_ASC_NODE: number
  ARG_OF_PERICENTER: number
  MEAN_ANOMALY: number
  EPHEMERIS_TYPE: number
  CLASSIFICATION_TYPE: string
  NORAD_CAT_ID: number
  ELEMENT_SET_NO: number
  REV_AT_EPOCH: number
  BSTAR: number
  MEAN_MOTION_DOT: number
  MEAN_MOTION_DDOT: number
  [key: string]: unknown
}

/**
 * Alpha-5 letters for catalog numbers 100000–339999 (A=10 … Z=33, skipping I and O)
 */
const ALPHA5_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"

/**
 * Format a NORAD catalog number for TLE columns 3-7.
 * Numbers above 99999 use the Alpha-5 scheme; returns null if not representable.
 */
function formatCatalogNumber(id: number): string | null {
  if (!Number.isInteger(id) || id < 0) return null
  if (id <= 99999) return String(id).padStart(5, "0")
  if (id <= 339999) {
    return ALPHA5_LETTERS[Math.floor(id / 10000) - 10] + String(id % 10000).padStart(4, "0")
  }
  return null
}

/**
 * Format a value in TLE "assumed decimal point" exponential notation (8 chars)
 * e.g. 0.00012345 → " 12345-3", -0.000034 → "-34000-4", 0 → " 00000+0"
 */
function formatExponential(value: number): string {
  if (!Number.isFinite(value) || value === 0) return " 00000+0"

  const sign = value < 0 ? "-" : " "
  const absVal = Math.abs(value)

  // value = 0.ddddd × 10^exponent
  let exponent = Math.floor(Math.log10(absVal)) + 1
  let mantissa = Math.round((absVal / Math.pow(10, exponent)) * 1e5)
  if (mantissa >= 1e5) {
    // Rounding overflowed (e.g. 0.999996 → 100000)
    mantissa = Math.round(mantissa / 10)
    exponent++
  }

  // Exponent must fit in a single digit; such values are negligible anyway
  if (exponent < -9 || exponent > 9) return " 00000+0"

  const expSign = exponent < 0 ? "-" : "+"
  return `${sign}${String(mantissa).padStart(5, "0")}${expSign}${Math.abs(exponent)}`
}

/**
 * Format first derivative of mean motion for TLE columns 34-43
 * Format: sign + .nnnnnnnn, e.g. " .00006479" or "-.00000035"
 */
function formatMeanMotionDot(value: number): string {
  const sign = value < 0 ? "-" : " "
  return sign + Math.abs(value).toFixed(8).replace(/^0/, "")
}

/**
 * Compute TLE checksum (modulo 10 sum of all digits in the line, excluding the checksum position)
 */
function computeChecksum(line: string): number {
  let sum = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch >= "0" && ch <= "9") {
      sum += parseInt(ch, 10)
    } else if (ch === "-") {
      sum += 1
    }
  }
  return sum % 10
}

/**
 * Append the checksum to a 68-column line, or return null if the line is malformed.
 * TLE parsers read fixed columns, so a line of the wrong width is corrupt.
 */
function withChecksum(line: string): string | null {
  if (line.length !== 68) return null
  return `${line}${computeChecksum(line)}`
}

/**
 * Build TLE line 1 from orbital elements
 */
function buildLine1(sat: CelestrakOrbitalJson, catalog: string, epochYear: number, epochDay: number): string | null {
  // International designator: OBJECT_ID "YYYY-NNNPPP" → "YYNNNPPP" (columns 10-17)
  const designatorMatch = /^\d{2}(\d{2})-(\d{3})([A-Z]{1,3})$/.exec(sat.OBJECT_ID || "")
  const designator = designatorMatch
    ? `${designatorMatch[1]}${designatorMatch[2]}${designatorMatch[3].padEnd(3)}`
    : " ".repeat(8)

  const classification = (sat.CLASSIFICATION_TYPE || "U")[0]
  const epoch = `${String(epochYear).padStart(2, "0")}${epochDay.toFixed(8).padStart(12, "0")}`
  const ephemerisType = String(sat.EPHEMERIS_TYPE ?? 0)[0]
  const elementSet = String((sat.ELEMENT_SET_NO ?? 0) % 10000).padStart(4)

  return withChecksum(
    `1 ${catalog}${classification} ${designator} ${epoch} ` +
      `${formatMeanMotionDot(sat.MEAN_MOTION_DOT)} ${formatExponential(sat.MEAN_MOTION_DDOT)} ` +
      `${formatExponential(sat.BSTAR)} ${ephemerisType} ${elementSet}`
  )
}

/**
 * Build TLE line 2 from orbital elements
 */
function buildLine2(sat: CelestrakOrbitalJson, catalog: string): string | null {
  const inclination = sat.INCLINATION.toFixed(4).padStart(8)
  const raan = sat.RA_OF_ASC_NODE.toFixed(4).padStart(8)
  // Truncate like CelesTrak's own TLEs (epsilon guards against 0.0006775 * 1e7 = 6774.999…)
  const eccentricity = String(Math.floor(sat.ECCENTRICITY * 1e7 + 1e-6)).padStart(7, "0")
  const argPerigee = sat.ARG_OF_PERICENTER.toFixed(4).padStart(8)
  const meanAnomaly = sat.MEAN_ANOMALY.toFixed(4).padStart(8)
  const meanMotion = sat.MEAN_MOTION.toFixed(8).padStart(11)
  const revNum = String((sat.REV_AT_EPOCH ?? 0) % 100000).padStart(5)

  return withChecksum(
    `2 ${catalog} ${inclination} ${raan} ${eccentricity} ${argPerigee} ${meanAnomaly} ${meanMotion}${revNum}`
  )
}

/**
 * Convert epoch string to 2-digit year and fractional day of year (Jan 1 00:00 = day 1.0)
 * Format: "YYYY-MM-DDTHH:mm:ss.ssssss" (UTC)
 */
function epochToYearDay(epochStr: string): [number, number] | null {
  // CelesTrak epochs are UTC but carry no offset — without "Z", JS parses them as local time
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(epochStr)
  const date = new Date(hasOffset ? epochStr : `${epochStr}Z`)
  if (Number.isNaN(date.getTime())) return null

  const year = date.getUTCFullYear()
  const msPerDay = 1000 * 60 * 60 * 24

  // JS Dates keep milliseconds only; add back the microseconds CelesTrak provides
  const fraction = /\.(\d+)/.exec(epochStr)?.[1] ?? ""
  const subMs = fraction.length > 3 ? Number(`0.${fraction.slice(3)}`) : 0

  const dayOfYear = (date.getTime() + subMs - Date.UTC(year, 0, 1)) / msPerDay + 1

  return [year % 100, dayOfYear]
}

/**
 * Construct TLESatellite from Celestrak orbital JSON
 */
function orbitalToTLESatellite(entry: CelestrakOrbitalJson): TLESatellite | null {
  if (!entry.OBJECT_NAME || !entry.NORAD_CAT_ID || !entry.EPOCH) return null

  const catalog = formatCatalogNumber(entry.NORAD_CAT_ID)
  const epoch = epochToYearDay(entry.EPOCH)
  if (!catalog || !epoch) return null

  try {
    const line1 = buildLine1(entry, catalog, epoch[0], epoch[1])
    const line2 = buildLine2(entry, catalog)

    if (!line1 || !line2) {
      console.warn(`Invalid constructed TLE for ${entry.OBJECT_NAME}`)
      return null
    }

    return {
      name: entry.OBJECT_NAME.trim(),
      line1,
      line2,
    }
  } catch (err) {
    console.warn(`Failed to construct TLE for ${entry.OBJECT_NAME}: ${err instanceof Error ? err.message : "unknown"}`)
    return null
  }
}

/**
 * Parse JSON orbital data from Celestrak response
 */
function parseOrbitalJson(data: CelestrakOrbitalJson[]): TLESatellite[] {
  const satellites: TLESatellite[] = []

  for (const entry of data) {
    const sat = orbitalToTLESatellite(entry)
    if (sat) {
      satellites.push(sat)
    }
  }

  if (satellites.length === 0) {
    throw new DataParseError("No valid satellites could be constructed from orbital data")
  }

  console.log(`Constructed TLE for ${satellites.length}/${data.length} satellites`)
  return satellites
}

/**
 * Fetch satellite data from CelesTrak and update cache
 */
export async function updateSatelliteCache(): Promise<TLESatellite[]> {
  try {
    console.log("Fetching satellite data from CelesTrak...")

    const response = await axios.get(config.celestrak.url, {
      timeout: config.celestrak.timeout,
      headers: {
        "User-Agent": "SatelliteSurveillanceApp/1.0",
      },
      // CelesTrak explains refusals in a plain-text body (with HTTP 403),
      // so read the body instead of letting axios throw on the status
      validateStatus: () => true,
    })

    const responseData = response.data

    // CelesTrak returns a text message when data hasn't changed
    if (typeof responseData === "string") {
      if (responseData.includes("has not updated since")) {
        console.log("CelesTrak data not updated since last fetch, using cache")
        const cached = await getSatelliteFromCache()
        if (cached) return cached
        throw new CelestrakFetchError(
          "CelesTrak allows one download per 2 hours per IP and no cached data is available"
        )
      }

      throw new CelestrakFetchError(
        `CelesTrak returned HTTP ${response.status}: ${responseData.trim().slice(0, 200)}`
      )
    }

    if (response.status !== 200) {
      throw new CelestrakFetchError(`CelesTrak returned HTTP ${response.status}`)
    }

    if (!Array.isArray(responseData)) {
      throw new DataParseError("Unexpected response format from CelesTrak")
    }

    const satellites = parseOrbitalJson(responseData)
    console.log(`Parsed ${satellites.length} satellites`)

    // Update cache, plus a non-expiring copy used when CelesTrak is unreachable
    const redis = getRedis()
    const json = JSON.stringify(satellites)
    await redis.set(config.cache.satelliteKey, json, { EX: config.cache.satelliteTTL })
    await redis.set(config.cache.satelliteFallbackKey, json)

    console.log("Satellite cache updated successfully")
    return satellites
  } catch (error) {
    if (error instanceof DataParseError || error instanceof CelestrakFetchError) throw error

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError
      const message = axiosError.response?.statusText || axiosError.message
      throw new CelestrakFetchError(`CelesTrak API error: ${message}`)
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

    // CelesTrak often returns 403 to shared cloud IPs (e.g. Vercel), so
    // serve the last-known-good copy instead of failing the whole layer.
    try {
      const redis = getRedis()
      const stale = await redis.get(config.cache.satelliteFallbackKey)
      if (stale) {
        console.warn("Serving last-known-good satellite data")
        // Serve this copy for a while rather than retrying CelesTrak on every request
        await redis.set(config.cache.satelliteKey, stale, { EX: config.cache.satelliteRetryTTL }).catch(() => {})
        return JSON.parse(stale) as TLESatellite[]
      }
    } catch {
      // No fallback available
    }

    throw error
  }
}