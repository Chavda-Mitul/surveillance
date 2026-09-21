import { useQuery } from "@tanstack/react-query"
import { fetchEarthquakes } from "./fetchEarthquakes"
import type { EarthquakeEvent } from "./types"

/**
 * React Query hook for earthquake data
 * Polls every 60 seconds — backend refreshes from USGS every 2 minutes via cron
 */
export function useEarthquakes(enabled: boolean = true) {
  return useQuery<EarthquakeEvent[]>({
    queryKey: ["earthquakes"],
    queryFn: fetchEarthquakes,
    refetchInterval: enabled ? 60_000 : false,
    staleTime: 120_000, // 2 minutes — backend cache lives for 10 min, poll safely within that
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    refetchOnWindowFocus: false,
    enabled,
  })
}