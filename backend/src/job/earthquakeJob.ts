import { updateEarthquakeCache } from "../services/earthquakeService"
import { config } from "../config"

let intervalHandle: ReturnType<typeof setInterval> | null = null

/**
 * Start periodic earthquake cache refresh
 * Runs every 2 minutes (matching USGS feed update cadence)
 */
export function startEarthquakeJob(): void {
  if (intervalHandle) {
    console.warn("Earthquake job is already running")
    return
  }

  console.log("Starting earthquake cache refresh job...")

  // Immediately fetch on start
  updateEarthquakeCache().catch((err) => {
    console.error("Initial earthquake fetch failed:", err instanceof Error ? err.message : "unknown")
  })

  // Then refresh every 2 minutes
  intervalHandle = setInterval(async () => {
    try {
      await updateEarthquakeCache()
    } catch (error) {
      console.error("Earthquake cache refresh failed:", error instanceof Error ? error.message : "unknown")
    }
  }, config.jobs.earthquakeUpdateIntervalMs)
}

/**
 * Stop the earthquake cache refresh job
 */
export function stopEarthquakeJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    console.log("Earthquake job stopped")
  }
}