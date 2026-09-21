import type { FastifyInstance } from "fastify"
import { getFlights } from "../services/flightService"
import { handleRoute } from "../utils/routeHandler"

async function flightRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/flights", async (_request, reply) => {
    await handleRoute(fastify, reply, getFlights)
  })
}

export default flightRoutes