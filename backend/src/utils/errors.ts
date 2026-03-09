/**
 * Custom error classes for better error handling
 */

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class RedisConnectionError extends AppError {
  constructor(message: string = "Failed to connect to Redis") {
    super(message, 503, "REDIS_CONNECTION_ERROR")
  }
}

export class CelestrakFetchError extends AppError {
  constructor(message: string = "Failed to fetch satellite data from Celestrak") {
    super(message, 502, "CELESTRAK_FETCH_ERROR")
  }
}

export class DataParseError extends AppError {
  constructor(message: string = "Failed to parse satellite data") {
    super(message, 500, "DATA_PARSE_ERROR")
  }
}

export class CacheError extends AppError {
  constructor(message: string = "Cache operation failed") {
    super(message, 500, "CACHE_ERROR")
  }
}
