import type { FastifyInstance } from "fastify"
import { getEarthquakes, filterByMinMagnitude } from "../services/earthquakeService"
import { handleRoute } from "../utils/routeHandler"
import { z } from "zod"

/**
 * Query parameter schema for earthquake filtering
 */
const EarthquakeQuerySchema = z.object({
  minMag: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : undefined))
    .pipe(z.number().min(0).max(10).optional()),
})

async function earthquakeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/earthquakes", async (request, reply) => {
    await handleRoute(fastify, reply, async () => {
      const { minMag } = EarthquakeQuerySchema.parse(request.query)

      const events = await getEarthquakes()

      if (minMag !== undefined) {
        return filterByMinMagnitude(events, minMag)
      }

      return events
    })
  })
}

export default earthquakeRoutes