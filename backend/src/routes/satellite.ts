import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { getSatellites } from "../services/satelliteService"
import { AppError } from "../utils/errors"

/**
 * Satellite routes
 */
async function satelliteRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/satellites
   * Returns all active satellites with TLE data
   * Cached for 12 hours
   */
  fastify.get(
    "/satellites",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const satellites = await getSatellites()
        return reply.send(satellites)
      } catch (error) {
        // Handle custom errors
        if (error instanceof AppError) {
          return reply.status(error.statusCode).send({
            error: error.name,
            message: error.message,
            code: error.code,
          })
        }

        // Handle unexpected errors
        fastify.log.error(error)
        return reply.status(500).send({
          error: "InternalServerError",
          message: "An unexpected error occurred",
        })
      }
    }
  )
}

export default satelliteRoutes