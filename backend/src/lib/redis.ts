import { createClient, RedisClientType } from "redis"
import { config } from "../config"
import { RedisConnectionError } from "../utils/errors"

let redis: RedisClientType | null = null

/**
 * Get Redis client instance (singleton pattern)
 */
export function getRedis(): RedisClientType {
  if (!redis) {
    throw new RedisConnectionError("Redis client not initialized. Call connectRedis() first.")
  }
  return redis
}

/**
 * Connect to Redis with error handling
 */
export async function connectRedis(): Promise<void> {
  try {
    redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
    })

    redis.on("error", (err) => {
      console.error("Redis Client Error:", err)
    })

    redis.on("connect", () => {
      console.log("Redis client connecting...")
    })

    redis.on("ready", () => {
      console.log("Redis client ready")
    })

    await redis.connect()
    console.log(`Redis connected to ${config.redis.host}:${config.redis.port}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    throw new RedisConnectionError(`Failed to connect to Redis: ${message}`)
  }
}

/**
 * Disconnect from Redis gracefully
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit()
    redis = null
    console.log("Redis disconnected")
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redis?.isReady ?? false
}
