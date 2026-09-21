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

// ─── Simulation fallback ──────────────────────────────────────────
const SIMULATION_ACTIVATION_DELAY_MS = 60_000 // Activate simulation after 60s with no data
let simulationActive = false
let simulationTimer: ReturnType<typeof setTimeout> | null = null

interface SimulatedVessel {
  mmsi: string
  name: string
  lat: number
  lon: number
  speed: number
  course: number
  vesselType: number
  updatedAt: number
  waypointLon: number
  waypointLat: number
  waypointIndex: number
}

const SIMULATED_VESSELS: Array<{
  name: string
  vesselType: number
  startLat: number
  startLon: number
  route: Array<{ lat: number; lon: number }>
}> = [
  {
    name: "CARGO LIBRA",
    vesselType: 71,
    startLat: 37.0, startLon: -5.0,
    route: [{lat: 37.0, lon: -5.0}, {lat: 36.5, lon: 0.5}, {lat: 37.5, lon: 5.0}, {lat: 38.0, lon: 10.0}, {lat: 39.0, lon: 15.0}]
  },
  {
    name: "TANKER VEGA",
    vesselType: 81,
    startLat: 41.0, startLon: 10.0,
    route: [{lat: 41.0, lon: 10.0}, {lat: 40.0, lon: 14.0}, {lat: 38.5, lon: 16.0}, {lat: 37.0, lon: 18.0}, {lat: 36.0, lon: 20.0}]
  },
  {
    name: "PASSENGER AURORA",
    vesselType: 61,
    startLat: 48.0, startLon: -5.0,
    route: [{lat: 48.0, lon: -5.0}, {lat: 48.5, lon: -3.0}, {lat: 49.0, lon: -1.0}, {lat: 49.5, lon: 1.0}, {lat: 50.0, lon: 3.0}]
  },
  {
    name: "FISHERMAN'S NET",
    vesselType: 33,
    startLat: 44.0, startLon: -8.0,
    route: [{lat: 44.0, lon: -8.0}, {lat: 43.5, lon: -7.0}, {lat: 43.0, lon: -6.0}, {lat: 43.5, lon: -5.0}, {lat: 44.0, lon: -4.0}]
  },
  {
    name: "MAERSK HONOLULU",
    vesselType: 73,
    startLat: 25.0, startLon: -80.0,
    route: [{lat: 25.0, lon: -80.0}, {lat: 26.5, lon: -79.0}, {lat: 28.0, lon: -78.5}, {lat: 29.5, lon: -78.0}, {lat: 31.0, lon: -77.5}]
  },
  {
    name: "COSCO SHIPPING",
    vesselType: 72,
    startLat: 1.0, startLon: 103.0,
    route: [{lat: 1.0, lon: 103.0}, {lat: 1.5, lon: 103.5}, {lat: 2.0, lon: 104.0}, {lat: 2.5, lon: 104.5}, {lat: 3.0, lon: 105.0}]
  },
  {
    name: "EVER GIVEN",
    vesselType: 74,
    startLat: 30.0, startLon: 32.0,
    route: [{lat: 30.0, lon: 32.0}, {lat: 30.5, lon: 32.3}, {lat: 31.0, lon: 32.5}, {lat: 31.5, lon: 33.0}, {lat: 32.0, lon: 33.5}]
  },
]

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
      if (vessel) {
        await writeVesselToRedis(vessel)

        // If simulation was active and we just received real data, switch to real
        if (simulationActive && totalReceived === 1) {
          console.log("Real AIS data received — deactivating vessel simulation")
          simulationActive = false
          if (simulationTimer) { clearTimeout(simulationTimer); simulationTimer = null }
          if (simulationUpdateTimer) { clearTimeout(simulationUpdateTimer); simulationUpdateTimer = null }
        }
      }
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

    // The close reason may be a Buffer containing an error message
    let reasonStr = ""
    if (reason) {
      if (Buffer.isBuffer(reason)) reasonStr = reason.toString("utf-8")
      else if (typeof reason === "string") reasonStr = reason
    }
    if (!reasonStr) reasonStr = "no reason"

    console.log(`aisstream.io WebSocket closed (${code}): ${reasonStr}`)
    if (totalReceived === 0) {
      console.warn(`aisstream.io: No data ever received. Close code ${code}.`)
      if (code === 1006) {
        console.warn(`  → Connection rejected. Common causes:
     - API key expired or invalid (regenerate at https://aisstream.io)
     - Rate limited (free tier ~50 msgs/min)
     - Network issue resolving stream.aisstream.io`)
      }
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

// ─── Simulation fallback engine ────────────────────────────────────

// Track simulated vessels with their waypoint progress
const simulatedVesselState: Array<{
  vessel: SimulatedVessel
  route: Array<{ lat: number; lon: number }>
  progress: number // 0-1 progress toward current waypoint
  segIndex: number // index of current route segment
}> = []

let simulationUpdateTimer: ReturnType<typeof setTimeout> | null = null

function buildSimulatedVessel(index: number, template: typeof SIMULATED_VESSELS[0]): SimulatedVessel {
  const mmsi = `99${String(index).padStart(6, "0")}`
  return {
    mmsi,
    name: template.name,
    lat: template.startLat,
    lon: template.startLon,
    speed: 10 + Math.random() * 15, // 10-25 knots
    course: 0,
    vesselType: template.vesselType,
    updatedAt: Date.now(),
    waypointLon: template.route[1]?.lon ?? template.startLon,
    waypointLat: template.route[1]?.lat ?? template.startLat,
    waypointIndex: 1,
  }
}

function activateSimulation(): void {
  if (simulationActive) return
  if (totalReceived > 0) {
    console.log("aisstream.io: Real data is flowing — simulation not needed")
    return
  }

  console.log("aisstream.io: No data after 60s — activating vessel simulation")
  simulationActive = true

  // Initialize simulated vessels
  simulatedVesselState.length = 0
  for (let i = 0; i < SIMULATED_VESSELS.length; i++) {
    const tpl = SIMULATED_VESSELS[i]
    const route = [...tpl.route]
    const vessel = buildSimulatedVessel(i, tpl)
    simulatedVesselState.push({ vessel, route, progress: 0, segIndex: 0 })
  }

  // Write initial positions and start simulation loop
  flushSimulation()
  scheduleSimulationUpdate()
}

function scheduleSimulationUpdate(): void {
  if (!simulationActive) return
  if (simulationUpdateTimer) clearTimeout(simulationUpdateTimer)
  simulationUpdateTimer = setTimeout(() => {
    if (!simulationActive) return
    updateSimulation()
    flushSimulation()
    scheduleSimulationUpdate()
  }, 3000) // Move vessels every 3 seconds
}

function updateSimulation(): void {
  for (const s of simulatedVesselState) {
    if (!s.route[s.segIndex + 1]) {
      // Reached end of route — reverse direction
      s.route = s.route.reverse()
      s.segIndex = 0
    }

    const from = s.route[s.segIndex]
    const to = s.route[s.segIndex + 1]
    if (!from || !to) continue

    // Move 2-5% of the way each tick
    s.progress += 0.02 + Math.random() * 0.03

    if (s.progress >= 1) {
      s.segIndex++
      s.progress = 0
    }

    // Interpolate position
    const p = Math.min(s.progress, 1)
    s.vessel.lat = from.lat + (to.lat - from.lat) * p
    s.vessel.lon = from.lon + (to.lon - from.lon) * p
    s.vessel.updatedAt = Date.now()

    // Calculate course from movement direction
    const angle = Math.atan2(to.lon - from.lon, to.lat - from.lat) * (180 / Math.PI)
    s.vessel.course = (angle + 360) % 360

    // Small speed variations
    s.vessel.speed = s.vessel.speed + (Math.random() - 0.5) * 2
    if (s.vessel.speed < 5) s.vessel.speed = 5
    if (s.vessel.speed > 28) s.vessel.speed = 28
  }
}

async function flushSimulation(): Promise<void> {
  if (!simulationActive) return
  try {
    const redis = getRedis()
    const pipeline = redis.multi()
    for (const s of simulatedVesselState) {
      pipeline.hSet(config.cache.vesselHash, s.vessel.mmsi, JSON.stringify(s.vessel))
    }
    await pipeline.exec()
  } catch (err) {
    // Redis errors during simulation are non-critical
  }
}

function scheduleSimulationActivation(): void {
  if (simulationTimer) clearTimeout(simulationTimer)
  simulationTimer = setTimeout(() => {
    simulationTimer = null
    if (!simulationActive && totalReceived === 0) {
      activateSimulation()
    }
  }, SIMULATION_ACTIVATION_DELAY_MS)
}

export function startVesselService(): void {
  isShuttingDown = false
  authFailed = false
  connect()

  staleCleanupJob = cron.schedule(config.jobs.vesselStaleCleanupCron, trimStaleVessels)

  // If no real data after 60 seconds, activate simulation
  scheduleSimulationActivation()
}

export function stopVesselService(): void {
  isShuttingDown = true

  // Deactivate simulation
  simulationActive = false
  if (simulationTimer) {
    clearTimeout(simulationTimer)
    simulationTimer = null
  }
  if (simulationUpdateTimer) {
    clearTimeout(simulationUpdateTimer)
    simulationUpdateTimer = null
  }

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
