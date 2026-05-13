import type { FastifyInstance, FastifyReply } from "fastify"
import { AppError } from "./errors"

export async function handleRoute<T>(
  fastify: FastifyInstance,
  reply: FastifyReply,
  fn: () => Promise<T>
): Promise<void> {
  try {
    const result = await fn()
    reply.send(result)
  } catch (error) {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
        code: error.code,
      })
      return
    }
    fastify.log.error(error)
    reply.status(500).send({
      error: "InternalServerError",
      message: "An unexpected error occurred",
    })
  }
}
