import cron from "node-cron"
import { refreshFlights } from "../services/flightService"
import { config } from "../config"

/**
 * Start background job to keep flight cache warm
 * Runs every 30 seconds so user-facing requests never wait for OpenSky
 */
export function startFlightJob(): void {
  console.log("Starting flight cache refresh job...")

  // Run immediately when server starts (fire and forget)
  refreshFlights().catch((error) => {
    console.error("Initial flight cache refresh failed:", error)
    console.log("Will retry on next scheduled run")
  })

  // Schedule periodic refresh
  cron.schedule(config.jobs.flightUpdateCron, async () => {
    console.log("Running scheduled flight cache refresh...")
    try {
      await refreshFlights()
      console.log("Scheduled flight cache refresh completed")
    } catch (error) {
      console.error("Scheduled flight cache refresh failed:", error)
    }
  })

  console.log(`Flight cache refresh scheduled: ${config.jobs.flightUpdateCron}`)
}