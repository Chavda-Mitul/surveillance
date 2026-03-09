import Fastify from "fastify"
import cors from "@fastify/cors"
import satelliteRoutes from "./routes/satellite"
import { connectRedis, disconnectRedis } from "./lib/redis"
import { startSatelliteJob } from "./job/satelliteJob"
import { config } from "./config"

/**
 * Create and configure Fastify server
 */
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
  },
})

/**
 * Register CORS plugin
 */
fastify.register(cors, {
  origin: config.cors.origin,
})

/**
 * Register routes
 */
fastify.register(satelliteRoutes, { prefix: "/api" })

/**
 * Health check endpoint
 */
fastify.get("/health", async () => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
  }
})

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    // Connect to Redis
    await connectRedis()

    // Start background jobs
    startSatelliteJob()

    // Start server
    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
    })

    console.log(`Server running at http://${config.server.host}:${config.server.port}`)
  } catch (error) {
    fastify.log.error(error)
    process.exit(1)
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, shutting down gracefully...`)

  try {
    await fastify.close()
    await disconnectRedis()
    console.log("Shutdown complete")
    process.exit(0)
  } catch (error) {
    console.error("Error during shutdown:", error)
    process.exit(1)
  }
}

// Handle shutdown signals
process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

// Start the server
start()