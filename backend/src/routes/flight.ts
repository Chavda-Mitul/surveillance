import type { FastifyInstance } from "fastify"
import { getFlights } from "../services/flightService"
import { getFlightRoute } from "../services/flightRouteService"
import { handleRoute } from "../utils/routeHandler"

async function flightRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/flights", async (_request, reply) => {
    await handleRoute(fastify, reply, getFlights)
  })

  /**
   * Get route information for a specific flight by ICAO24 code
   * Returns origin/destination airports and trajectory path
   */
  fastify.get<{ Params: { icao24: string }; Querystring: { callsign?: string } }>(
    "/flights/:icao24/route",
    async (request, reply) => {
      const { icao24 } = request.params
      const callsign = request.query.callsign || ""

      await handleRoute(fastify, reply, () => getFlightRoute(icao24, callsign))
    }
  )
}

export default flightRoutes