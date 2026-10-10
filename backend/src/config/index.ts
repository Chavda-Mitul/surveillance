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
    // v2: TLE line 1 columns fixed. Data under the old "satellites" key has a
    // misaligned epoch (parsed as 1962) and must not be served again.
    satelliteKey: "satellites:v2",
    satelliteTTL: 60 * 60 * 12, // 12 hours in seconds
    // Last-known-good copies served when the upstream API fails, e.g. CelesTrak
    // rate-limiting Vercel's shared IPs or OpenSky being down / out of credits.
    satelliteFallbackKey: "satellites:v2:last-good",
    satelliteRetryTTL: 60 * 60 * 2, // CelesTrak publishes new data every 2 hours
    vesselHash: "vessels",
    vesselStaleTTLSeconds: 1800, // 30 minutes
    flightKey: "flights",
    flightTTL: 120, // 2 minutes — keeps OpenSky usage inside the 4000 credits/day quota
    flightFallbackKey: "flights:last-good",
    flightFallbackTTL: 60 * 30, // never show aircraft positions older than 30 minutes
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
    cacheTTL: 600, // 10 minutes — USGS feed updates every 2-5 min, no need to re-fetch every time
  },
  opensky: {
    clientId: process.env.OPENSKY_CLIENT_ID || "",
    clientSecret: process.env.OPENSKY_CLIENT_SECRET || "",
    apiUrl: "https://opensky-network.org/api/states/all",
    // OAuth2 client-credentials endpoint. OpenSky API clients must use a
    // bearer token — basic auth is ignored and treated as anonymous.
    tokenUrl: "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    timeout: 20000, // 20 seconds - the global /states/all payload is large
  },
  jobs: {
    satelliteUpdateCron: "0 */6 * * *", // Every 6 hours
    // Every 2 minutes. A global /states/all call costs 4 OpenSky credits, so
    // 720 calls/day = 2880 credits, under the 4000/day authenticated quota.
    flightUpdateCron: "*/2 * * * *",
    vesselStaleCleanupCron: "*/15 * * * *", // Every 15 minutes
    earthquakeUpdateIntervalMs: 120_000, // Every 2 minutes
  },
} as const

export type Config = typeof config