/**
 * VesselAPI REST service
 *
 * Polls https://vesselapi.com bounding-box endpoint for live vessel positions
 * and caches them in Redis. Runs alongside the existing aisstream.io WebSocket
 * service (both write to the same Redis hash).
 */
import { getRedis } from "../lib/redis"
import { config } from "../config"
import { Vessel } from "../schema/vessel"
import { VesselAPIError } from "../utils/errors"

// ── Types ──────────────────────────────────────────────────────────

interface VesselAPIPosition {
  mmsi: number
  imo?: number
  vessel_name: string
  latitude: number
  longitude: number
  timestamp: string
  processed_timestamp: string
  cog?: number
  sog?: number
  heading?: number
  nav_status?: number
  suspected_glitch?: boolean
}

interface BoundingBoxResponse {
  vessels: VesselAPIPosition[]
  nextToken?: string
}

interface BoundingBoxParams {
  latBottom: number
  latTop: number
  lonLeft: number
  lonRight: number
}

// ── State ──────────────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null
let isRunning = false
let totalVesselsReceived = 0
let pollCount = 0

// ── Mapper ─────────────────────────────────────────────────────────

function toVessel(pos: VesselAPIPosition): Vessel {
  const mmsi = String(pos.mmsi)
  return {
    mmsi,
    name: (pos.vessel_name || "").trim() || mmsi,
    lat: pos.latitude,
    lon: pos.longitude,
    speed: pos.sog ?? 0,
    course: pos.cog ?? 0,
    vesselType: 0, // VesselAPI position endpoint does not include type
    updatedAt: Date.now(),
  }
}

// ── HTTP helper ────────────────────────────────────────────────────

async function fetchBoundingBox(
  box: BoundingBoxParams,
  signal: AbortSignal
): Promise<VesselAPIPosition[]> {
  const url =
    `${config.vesselapi.baseUrl}/location/vessels/bounding-box` +
    `?filter.latBottom=${box.latBottom}` +
    `&filter.latTop=${box.latTop}` +
    `&filter.lonLeft=${box.lonLeft}` +
    `&filter.lonRight=${box.lonRight}` +
    `&pagination.limit=50`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.vesselapi.apiKey}` },
    signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new VesselAPIError(
      `HTTP ${res.status} for bbox [${box.latBottom},${box.latTop},${box.lonLeft},${box.lonRight}]: ${body.slice(0, 200)}`
    )
  }

  const data: BoundingBoxResponse = await res.json()
  return data.vessels ?? []
}

// ── Poll cycle ─────────────────────────────────────────────────────

async function pollOnce(): Promise<void> {
  if (!config.vesselapi.apiKey) return

  const allPositions: VesselAPIPosition[] = []

  // Fetch each bounding box sequentially with its own timeout
  for (const box of config.vesselapi.boundingBoxes) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.vesselapi.timeout)
    try {
      const vessels = await fetchBoundingBox(box, controller.signal)
      allPositions.push(...vessels)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown"
      if (err instanceof Error && err.name === "AbortError") {
        console.warn(`VesselAPI bbox [${box.latBottom},${box.latTop},${box.lonLeft},${box.lonRight}]: timeout after ${config.vesselapi.timeout}ms`)
      } else {
        console.warn(`VesselAPI bbox [${box.latBottom},${box.latTop},${box.lonLeft},${box.lonRight}]: ${msg}`)
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  // Deduplicate by MMSI (last writer wins)
  const seen = new Set<string>()
  const unique: Vessel[] = []
  for (const pos of allPositions) {
    const mmsi = String(pos.mmsi)
    if (seen.has(mmsi)) continue
    seen.add(mmsi)
    unique.push(toVessel(pos))
  }

  // Batch-write to Redis
  if (unique.length > 0) {
    const redis = getRedis()
    const pipeline = redis.multi()
    for (const vessel of unique) {
      pipeline.hSet(config.cache.vesselHash, vessel.mmsi, JSON.stringify(vessel))
    }
    await pipeline.exec()
  }

  totalVesselsReceived += unique.length
  pollCount++
  console.log(
    `VesselAPI poll #${pollCount}: ${unique.length} unique vessels (total: ${totalVesselsReceived})`
  )
}

// ── Lifecycle ──────────────────────────────────────────────────────

export function startVesselAPIService(): void {
  if (pollTimer) return
  if (!config.vesselapi.apiKey) {
    console.warn("VESSEL_API key not set in backend/.env — VesselAPI polling disabled.")
    console.warn("Get a free key at https://dashboard.vesselapi.com then add VESSEL_API=<key> to backend/.env")
    return
  }

  isRunning = true
  console.log(`Starting VesselAPI polling (${config.vesselapi.boundingBoxes.length} boxes, every ${config.vesselapi.pollIntervalMs}ms)`)

  // Fire immediately, then repeat
  pollOnce()
  pollTimer = setInterval(pollOnce, config.vesselapi.pollIntervalMs)
}

export function stopVesselAPIService(): void {
  isRunning = false
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  console.log("VesselAPI service stopped")
}