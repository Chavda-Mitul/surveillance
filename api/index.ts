/**
 * Vercel serverless entry point
 *
 * Wraps the Fastify application so it can be deployed as a Vercel serverless
 * function. Routes are registered on-the-fly; background cron jobs / WebSocket
 * listeners are NOT started here (they don't survive serverless boundaries).
 */

import "dotenv/config"
import Fastify, { type FastifyInstance } from "fastify"
import cors from "@fastify/cors"
import { ensureRedis } from "../backend/src/lib/redis"
import satelliteRoutes from "../backend/src/routes/satellite"
import vesselRoutes from "../backend/src/routes/vessel"
import flightRoutes from "../backend/src/routes/flight"
import earthquakeRoutes from "../backend/src/routes/earthquake"
import queryRoutes from "../backend/src/routes/query"

// ── Lazy Fastify singleton ─────────────────────────────────────────
// Vercel may reuse the same module across warm invocations, so we cache
// the initialized Fastify instance across requests.

let app: FastifyInstance | null = null

async function getApp(): Promise<FastifyInstance> {
  if (app) return app

  app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "error" },
  })

  // CORS – allow all origins in production (frontend and API live on same domain)
  await app.register(cors, { origin: true })

  // Register all API routes under /api
  await app.register(satelliteRoutes, { prefix: "/api" })
  await app.register(vesselRoutes, { prefix: "/api" })
  await app.register(flightRoutes, { prefix: "/api" })
  await app.register(earthquakeRoutes, { prefix: "/api" })
  await app.register(queryRoutes, { prefix: "/api" })

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }))

  // Connect to Redis (Upstash). ensureRedis handles reconnection
  // if the socket was dropped between serverless invocations.
  try {
    await ensureRedis()
  } catch (err) {
    console.error("Redis connection failed – running without cache:", err)
  }

  await app.ready()
  return app
}

/**
 * Vercel serverless function handler.
 *
 * Vercel passes a Node.js http.IncomingMessage / ServerResponse pair.
 * Fastify can process them directly via its server.emit('request', …).
 */
export default async function handler(
  request: import("http").IncomingMessage,
  reply: import("http").ServerResponse,
): Promise<void> {
  try {
    const fastify = await getApp()
    fastify.server.emit("request", request, reply)
  } catch (err) {
    console.error("Fatal error in serverless handler:", err)
    reply.statusCode = 500
    reply.end(JSON.stringify({ error: "Internal Server Error" }))
  }
}