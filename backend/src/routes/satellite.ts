import type { FastifyInstance } from "fastify"
import { getSatellites } from "../services/satelliteService"
import { handleRoute } from "../utils/routeHandler"

async function satelliteRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/satellites", async (_request, reply) => {
    await handleRoute(fastify, reply, getSatellites)
  })
}

export default satelliteRoutes