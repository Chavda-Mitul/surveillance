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
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },
  cache: {
    satelliteKey: "satellites",
    satelliteTTL: 60 * 60 * 12, // 12 hours in seconds
    vesselHash: "vessels",
    vesselStaleTTLSeconds: 1800, // 30 minutes
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
  jobs: {
    satelliteUpdateCron: "0 */6 * * *", // Every 6 hours
    vesselStaleCleanupCron: "*/15 * * * *", // Every 15 minutes
  },
} as const

export type Config = typeof config
