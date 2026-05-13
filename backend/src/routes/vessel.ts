import type { FastifyInstance } from "fastify"
import { getVessels } from "../services/vesselService"
import { handleRoute } from "../utils/routeHandler"

async function vesselRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/vessels", async (_request, reply) => {
    await handleRoute(fastify, reply, getVessels)
  })
}

export default vesselRoutes
