import cron from "node-cron"
import { updateSatelliteCache } from "../services/satelliteService"
import { config } from "../config"

/**
 * Start background job to refresh satellite cache
 */
export function startSatelliteJob(): void {
  console.log("Starting satellite cache update job...")

  // Run immediately when server starts (fire and forget)
  updateSatelliteCache().catch((error) => {
    console.error("Initial satellite cache update failed:", error)
    console.log("Will retry on next scheduled run")
  })

  // Schedule periodic updates
  cron.schedule(config.jobs.satelliteUpdateCron, async () => {
    console.log("Running scheduled satellite cache update...")
    try {
      await updateSatelliteCache()
      console.log("Scheduled satellite cache update completed")
    } catch (error) {
      console.error("Scheduled satellite cache update failed:", error)
    }
  })

  console.log(`Satellite cache update scheduled: ${config.jobs.satelliteUpdateCron}`)
}