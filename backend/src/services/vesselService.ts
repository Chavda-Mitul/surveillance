import WebSocket from "ws"
import cron from "node-cron"
import { getRedis } from "../lib/redis"
import { Vessel } from "../schema/vessel"
import { config } from "../config"
import { AISStreamError } from "../utils/errors"

// Track vessel types separately — ShipStaticData messages carry type, PositionReport does not
const vesselTypeCache = new Map<string, number>()

let ws: WebSocket | null = null
let reconnectTimeout: NodeJS.Timeout | null = null
let reconnectDelayMs = 1000
let staleCleanupJob: ReturnType<typeof cron.schedule> | null = null
let isShuttingDown = false
let authFailed = false
let totalReceived = 0
let pingInterval: NodeJS.Timeout | null = null
let lastPongMs = 0

interface AISMeta {
  MMSI: number
  ShipName: string
  latitude: number
  longitude: number
  time_utc: string
}

interface RawAISMessage {
  Error?: string
  MessageType?: string
  MetaData?: AISMeta
  Message?: {
    PositionReport?: {
      Sog?: number
      Cog?: number
      Latitude?: number
      Longitude?: number
    }
    ShipStaticData?: {
      Type?: number
      Name?: string
    }
  }
}

let subscriptionTimer: NodeJS.Timeout | null = null

function sendSubscription(socket: WebSocket): void {
  const msg = {
    APIKey: config.aisstream.apiKey,
    BoundingBoxes: config.aisstream.boundingBox,
    FilterMessageTypes: ["PositionReport", "ShipStaticData"],
  }
  socket.send(JSON.stringify(msg))

  // If no data received within 8 seconds, assume subscription failed
  if (subscriptionTimer) clearTimeout(subscriptionTimer)
  subscriptionTimer = setTimeout(() => {
    if (ws === socket && socket.readyState === WebSocket.OPEN) {
      console.warn("aisstream.io: no data received for 8s after subscription, terminating")
      socket.terminate()
    }
  }, 8000)
}

function handleMessage(raw: string): Vessel | null {
  let msg: RawAISMessage
  try {
    msg = JSON.parse(raw)
  } catch {
    return null
  }

  // aisstream.io sends {"Error":"..."} on auth failure
  if (msg.Error) {
    console.error(`aisstream.io error: ${msg.Error}`)
    if (msg.Error.toLowerCase().includes("api key") || msg.Error.toLowerCase().includes("auth")) {
      authFailed = true
      console.error("Invalid AISSTREAM_API_KEY — vessel tracking stopped. Update backend/.env and restart.")
    }
    return null
  }

  const meta = msg.MetaData
  if (!meta || !msg.Message) return null

  const mmsi = String(meta.MMSI)

  // Store vessel type from ShipStaticData
  if (msg.MessageType === "ShipStaticData" && msg.Message.ShipStaticData) {
    const type = msg.Message.ShipStaticData.Type
    if (type != null) vesselTypeCache.set(mmsi, type)
    return null
  }

  if (msg.MessageType !== "PositionReport") return null

  const pos = msg.Message.PositionReport
  if (!pos) return null

  // Prefer MetaData lat/lon (already decoded by aisstream), fall back to PositionReport fields
  const lat = meta.latitude ?? pos.Latitude ?? 0
  const lon = meta.longitude ?? pos.Longitude ?? 0

  if (lat === 0 && lon === 0) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null

  return {
    mmsi,
    name: (meta.ShipName || "").trim() || mmsi,
    lat,
    lon,
    speed: pos.Sog ?? 0,
    course: pos.Cog ?? 0,
    vesselType: vesselTypeCache.get(mmsi) ?? 0,
    updatedAt: Date.now(),
  }
}

async function writeVesselToRedis(vessel: Vessel): Promise<void> {
  try {
    const redis = getRedis()
    await redis.hSet(config.cache.vesselHash, vessel.mmsi, JSON.stringify(vessel))

    totalReceived++
    if (totalReceived === 1) console.log("First vessel received — aisstream.io is working!")
    if (totalReceived % 500 === 0) console.log(`Vessel cache: ${totalReceived} positions received so far`)
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    console.error(`Failed to write vessel ${vessel.mmsi} to Redis: ${message}`)
  }
}

function connect(): void {
  if (isShuttingDown || authFailed) return

  if (!config.aisstream.apiKey) {
    console.warn("AISSTREAM_API_KEY is not set in backend/.env — vessel tracking disabled.")
    console.warn("Get a free key at https://aisstream.io then add AISSTREAM_API_KEY=<key> to backend/.env")
    return
  }

  console.log("Connecting to aisstream.io...")

  ws = new WebSocket(config.aisstream.wsUrl)

  ws.on("open", () => {
    console.log("aisstream.io WebSocket connected — sending subscription")
    reconnectDelayMs = 1000
    lastPongMs = Date.now()

    // Subscribe after a brief delay to ensure connection is fully established
    setTimeout(() => sendSubscription(ws!), 500)

    // Send periodic pings to keep connection alive (every 25 seconds)
    pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.ping()
        // If no pong received in 60 seconds, assume dead
        if (lastPongMs > 0 && Date.now() - lastPongMs > 60000) {
          console.warn("No pong from server in 60s, terminating connection")
          ws.terminate()
        }
      }
    }, 25000)
  })

  ws.on("ping", () => {
    // Respond to server pings automatically (ws library handles this)
  })

  ws.on("pong", () => {
    lastPongMs = Date.now()
  })

  ws.on("message", async (data: WebSocket.RawData) => {
    const raw = data.toString()
    // Clear subscription timer once we receive any data
    if (subscriptionTimer) {
      clearTimeout(subscriptionTimer)
      subscriptionTimer = null
    }
    if (raw.startsWith("{")) {
      const vessel = handleMessage(raw)
      if (vessel) await writeVesselToRedis(vessel)
    } else {
      console.log(`aisstream.io non-JSON message: ${raw.slice(0, 200)}`)
    }
  })

  ws.on("close", (code, reason) => {
    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }
    if (subscriptionTimer) {
      clearTimeout(subscriptionTimer)
      subscriptionTimer = null
    }
    const reasonStr = reason?.toString() || "no reason"
    console.log(`aisstream.io WebSocket closed (${code}): ${reasonStr}`)
    console.log(`aisstream.io: last data received ${Date.now() - lastPongMs}ms ago`)
    if (code === 1006 && pingInterval === null) {
      console.log("aisstream.io: Connection rejected before first ping — possible auth or rate-limit issue")
    }
    scheduleReconnect()
  })

  ws.on("error", (err) => {
    console.error(`aisstream.io WebSocket error: ${err.message}`)
  })

  // Listen for HTTP-level response when WebSocket upgrade fails
  ws.on("unexpected-response", (_req: any, res: any) => {
    console.error(`aisstream.io unexpected response: HTTP ${res.statusCode}`)
    let body = ""
    res.on("data", (chunk: Buffer) => { body += chunk.toString() })
    res.on("end", () => {
      console.error(`aisstream.io response body: ${body.slice(0, 500)}`)
    })
  })
}

function scheduleReconnect(): void {
  if (isShuttingDown || authFailed) return

  reconnectDelayMs = Math.min(reconnectDelayMs * 2, config.aisstream.reconnectMaxMs)
  // Add jitter (±20%) to avoid reconnection storms
  const jitter = reconnectDelayMs * (0.8 + Math.random() * 0.4)
  console.log(`Reconnecting to aisstream.io in ${(jitter / 1000).toFixed(1)}s...`)

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null
    connect()
  }, jitter)
}

async function trimStaleVessels(): Promise<void> {
  try {
    const redis = getRedis()
    const all = await redis.hGetAll(config.cache.vesselHash)
    const cutoff = Date.now() - config.cache.vesselStaleTTLSeconds * 1000
    const staleMMSIs: string[] = []

    for (const [mmsi, json] of Object.entries(all)) {
      try {
        const vessel = JSON.parse(json) as Vessel
        if (vessel.updatedAt < cutoff) staleMMSIs.push(mmsi)
      } catch {
        staleMMSIs.push(mmsi)
      }
    }

    if (staleMMSIs.length > 0) {
      await redis.hDel(config.cache.vesselHash, staleMMSIs)
      console.log(`Trimmed ${staleMMSIs.length} stale vessel(s)`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    console.error(`Stale vessel trim failed: ${message}`)
  }
}

export function startVesselService(): void {
  isShuttingDown = false
  authFailed = false
  connect()

  staleCleanupJob = cron.schedule(config.jobs.vesselStaleCleanupCron, trimStaleVessels)
}

export function stopVesselService(): void {
  isShuttingDown = true

  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }

  if (subscriptionTimer) {
    clearTimeout(subscriptionTimer)
    subscriptionTimer = null
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }

  if (ws) {
    ws.close()
    ws = null
  }

  if (staleCleanupJob) {
    staleCleanupJob.stop()
    staleCleanupJob = null
  }

  console.log("Vessel service stopped")
}

export async function getVessels(): Promise<Vessel[]> {
  try {
    const redis = getRedis()
    const all = await redis.hGetAll(config.cache.vesselHash)

    const vessels: Vessel[] = []
    for (const json of Object.values(all)) {
      try {
        vessels.push(JSON.parse(json) as Vessel)
      } catch {
        // skip malformed entries
      }
    }

    return vessels
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    throw new AISStreamError(`Failed to read vessels from cache: ${message}`)
  }
}
