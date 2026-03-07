import cron from "node-cron";
import { updateSatelliteCache } from "../services/satelliteService";

export function startSatelliteJob() {

  // run immediately when server starts
  updateSatelliteCache();

  // run every 12 hours
  cron.schedule("0 */12 * * *", async () => {
    console.log("Running satellite cache update...");
    await updateSatelliteCache();
  });

}