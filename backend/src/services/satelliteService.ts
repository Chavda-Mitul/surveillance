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
 * Format a signed number with leading sign, no leading zeros
 * e.g., formatSigned(0.00001234, 10, 8) → "+.12340000-4" or "+12345678-4"
 */
function formatSignedExponential(value: number, totalWidth: number, mantissaDigits: number): string {
  if (value === 0) {
    // Return a proper zero exponential: e.g. " 00000-0" for (8,5) or " 00000+0"
    return " 0" + "0".repeat(mantissaDigits - 1) + "+0"
  }

  const sign = value >= 0 ? "+" : "-"
  const absVal = Math.abs(value)

  // Scientific notation: mantissa * 10^exponent
  // We want format like +12345-5 or -12345+3
  let exponent = 0
  let mantissa = absVal

  if (absVal >= 1) {
    while (mantissa >= 10 && exponent < 99) {
      mantissa /= 10
      exponent++
    }
    // For values >= 1, the mantissa is displayed without leading decimal
    const mantissaInt = Math.round(mantissa * Math.pow(10, mantissaDigits - 1))
    const mantissaStr = String(mantissaInt).padStart(mantissaDigits, "0")
    return `${sign}${mantissaStr}-${String(exponent).padStart(2, "0")}`.padEnd(totalWidth)
  } else {
    while (mantissa < 0.1 && exponent > -99) {
      mantissa *= 10
      exponent--
    }
    const mantissaInt = Math.round(mantissa * Math.pow(10, mantissaDigits - 1))
    const mantissaStr = String(mantissaInt).padStart(mantissaDigits, "0")
    const expStr = exponent < 0 ? `${exponent}` : `+${exponent}`
    return `${sign}${mantissaStr}${expStr}`
  }
}

/**
 * Format first derivative of mean motion
 * Format: ±.nnnnnnnn (8 decimal places)
 */
function formatMeanMotionDot(value: number): string {
  if (value === 0) return " .00000000"
  const sign = value >= 0 ? " " : "-"
  const absVal = Math.abs(value)
  const formatted = absVal.toFixed(8)
  return `${sign}${formatted}`
}

/**
 * Pad a number to width, right-justified
 */
function padNum(value: number, width: number): string {
  return String(value).padStart(width)
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
 * Build TLE line 1 from orbital elements
 */
function buildLine1(sat: CelestrakOrbitalJson, epochYear: number, epochDay: number): string {
  const { NORAD_CAT_ID, CLASSIFICATION_TYPE, OBJECT_ID, MEAN_MOTION_DOT, MEAN_MOTION_DDOT, BSTAR, EPHEMERIS_TYPE, ELEMENT_SET_NO } = sat

  // Parse international designator from OBJECT_ID: "YYYY-NNNP"
  let intlYear = "00"
  let intlLaunchNum = "000"
  let intlPiece = "  "
  if (OBJECT_ID) {
    const parts = OBJECT_ID.split("-")
    if (parts.length >= 2) {
      intlYear = parts[0].slice(-2)
      const rest = parts[1]
      intlLaunchNum = (rest.slice(0, 3) || "000").padStart(3, "0")
      intlPiece = (rest.slice(3) || " ").padEnd(2, " ")
    }
  }

  const catId = String(NORAD_CAT_ID).padStart(5)
  const classification = (CLASSIFICATION_TYPE || "U")[0] || "U"
  const epochYearStr = String(epochYear).slice(-2).padStart(2, "0")
  const epochDayStr = epochDay.toFixed(8).padStart(12, "0")

  // First derivative of mean motion: +.nnnnnnnn or -.nnnnnnnn (spaceship for positive)
  const bstarExp = formatSignedExponential(BSTAR, 8, 5)
  const mmDotStr = formatMeanMotionDot(MEAN_MOTION_DOT).padStart(10)

  // Second derivative of mean motion: exponential format
  const mmDdotStr = formatSignedExponential(MEAN_MOTION_DDOT, 8, 5)

  // Build line without checksum
  let line = `1 ${catId}${classification} ${intlYear}${intlLaunchNum}${intlPiece} ${epochYearStr}${epochDayStr} ${mmDotStr} ${mmDdotStr} ${bstarExp} ${EPHEMERIS_TYPE}${String(ELEMENT_SET_NO).padStart(4)}`

  // Ensure line is exactly 68 chars before checksum
  line = line.slice(0, 68).padEnd(68)

  // Compute and append checksum
  const checksum = computeChecksum(line)
  return `${line}${checksum}`
}

/**
 * Build TLE line 2 from orbital elements
 */
function buildLine2(sat: CelestrakOrbitalJson): string {
  const { NORAD_CAT_ID, INCLINATION, RA_OF_ASC_NODE, ECCENTRICITY, ARG_OF_PERICENTER, MEAN_ANOMALY, MEAN_MOTION, REV_AT_EPOCH } = sat

  const catId = String(NORAD_CAT_ID).padStart(5)
  const inclination = INCLINATION.toFixed(4).padStart(8)
  const raan = RA_OF_ASC_NODE.toFixed(4).padStart(8)
  const eccentricity = String(Math.round(ECCENTRICITY * 1e7)).padStart(7, "0")
  const argPerigee = ARG_OF_PERICENTER.toFixed(4).padStart(8)
  const meanAnomaly = MEAN_ANOMALY.toFixed(4).padStart(8)
  const meanMotion = MEAN_MOTION.toFixed(8).padStart(11)
  const revNum = String(REV_AT_EPOCH).padStart(5)

  // Build line without checksum
  let line = `2 ${catId} ${inclination} ${raan} ${eccentricity} ${argPerigee} ${meanAnomaly} ${meanMotion}${revNum}`

  // Ensure line is exactly 68 chars before checksum
  line = line.slice(0, 68).padEnd(68)

  // Compute and append checksum
  const checksum = computeChecksum(line)
  return `${line}${checksum}`
}

/**
 * Convert epoch string to year and fractional day
 * Format: "YYYY-MM-DDTHH:mm:ss.ssssss"
 */
function epochToYearDay(epochStr: string): [number, number] {
  const date = new Date(epochStr)
  const year = date.getUTCFullYear()

  // Calculate day of year
  const startOfYear = Date.UTC(year, 0, 0)
  const diff = date.getTime() - startOfYear
  const dayOfYear = diff / (1000 * 60 * 60 * 24)

  return [year % 100, dayOfYear]
}

/**
 * Construct TLESatellite from Celestrak orbital JSON
 */
function orbitalToTLESatellite(entry: CelestrakOrbitalJson): TLESatellite | null {
  if (!entry.OBJECT_NAME || !entry.NORAD_CAT_ID) return null

  try {
    const [epochYear, epochDay] = epochToYearDay(entry.EPOCH || "2024-01-01T00:00:00.000000")

    const line1 = buildLine1(entry, epochYear, epochDay)
    const line2 = buildLine2(entry)

    // Validate length
    if (line1.length !== 69 || line2.length !== 69) {
      console.warn(`Invalid constructed TLE for ${entry.OBJECT_NAME}: line1=${line1.length}, line2=${line2.length}`)
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
    })

    const responseData = response.data

    // CelesTrak returns a text message when data hasn't changed
    if (typeof responseData === "string") {
      if (responseData.includes("has not updated since")) {
        console.log("CelesTrak data not updated since last fetch, using cache")
        const cached = await getSatelliteFromCache()
        if (cached) return cached
        throw new CelestrakFetchError("No new data from CelesTrak and no cached data available")
      }

      throw new DataParseError("Unexpected text response from CelesTrak")
    }

    if (!Array.isArray(responseData)) {
      throw new DataParseError("Unexpected response format from CelesTrak")
    }

    const satellites = parseOrbitalJson(responseData)
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
    throw error
  }
}