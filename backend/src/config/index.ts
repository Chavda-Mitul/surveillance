/**
 * Centralized configuration management
 */

export const config = {
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
  redis: {
    url: process.env.REDIS_URL || undefined,
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },
  cache: {
    satelliteKey: "satellites",
    satelliteTTL: 60 * 60 * 12, // 12 hours in seconds
    vesselHash: "vessels",
    vesselStaleTTLSeconds: 1800, // 30 minutes
    flightKey: "flights",
    flightTTL: 60, // 60 seconds — background cron keeps cache warm
  },
  celestrak: {
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
    timeout: 30000, // 30 seconds
  },
  aisstream: {
    apiKey: process.env.AISSTREAM_API_KEY || "",
    wsUrl: "wss://stream.aisstream.io/v0/stream",
    boundingBox: JSON.parse(
      process.env.AISSTREAM_BOUNDING_BOX || "[[-90,-180,90,180]]"
    ) as number[][],
    reconnectMaxMs: 60000,
  },
  vesselapi: {
    apiKey: process.env.VESSEL_API || "",
    baseUrl: "https://api.vesselapi.com/v1",
    timeout: 10000,
    pollIntervalMs: 15_000,
    boundingBoxes: [
      { latBottom: 35.5, latTop: 36.5, lonLeft: -6, lonRight: -4 },       // Gibraltar/Med entrance
      { latBottom: 31, latTop: 32.5, lonLeft: 32, lonRight: 33.5 },        // Suez approach
      { latBottom: 49.5, latTop: 51, lonLeft: -1, lonRight: 1 },           // English Channel
      { latBottom: 25, latTop: 26.5, lonLeft: 53, lonRight: 55 },          // Persian Gulf
      { latBottom: 1, latTop: 2.5, lonLeft: 103.5, lonRight: 105 },        // Singapore Strait
      { latBottom: 10, latTop: 11.5, lonLeft: 79.5, lonRight: 81 },        // Sri Lanka / Indian Ocean
      { latBottom: 37, latTop: 38.5, lonLeft: 23.5, lonRight: 25 },        // Aegean Sea
      { latBottom: 51.5, latTop: 53, lonLeft: 3, lonRight: 4.5 },          // Rotterdam/North Sea
      { latBottom: 24, latTop: 25.5, lonLeft: -80, lonRight: -78.5 },      // Florida Strait
      { latBottom: 31, latTop: 32.5, lonLeft: 122, lonRight: 123.5 },      // Shanghai/East China Sea
    ],
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    baseUrl: "https://openrouter.ai/api/v1",
    model: process.env.OPENROUTER_MODEL || "qwen/qwen3.7-flash",
    timeout: 30000, // 30 seconds
  },
  earthquake: {
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    timeout: 15000,
    cacheKey: "earthquakes:all_day",
    cacheTTL: 120, // 2 minutes
  },
  opensky: {
    clientId: process.env.OPENSKY_CLIENT_ID || "",
    clientSecret: process.env.OPENSKY_CLIENT_SECRET || "",
    apiUrl: "https://opensky-network.org/api/states/all",
    timeout: 10000, // 10 seconds - OpenSky can be slow
  },
  jobs: {
    satelliteUpdateCron: "0 */6 * * *", // Every 6 hours
    flightUpdateCron: "*/30 * * * * *", // Every 30 seconds
    vesselStaleCleanupCron: "*/15 * * * *", // Every 15 minutes
    earthquakeUpdateIntervalMs: 120_000, // Every 2 minutes
  },
} as const

export type Config = typeof config