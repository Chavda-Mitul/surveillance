import { useQuery } from "@tanstack/react-query"
import { fetchFlights } from "./fetchFlights"
import type { Flight } from "./types"

/**
 * React Query hook for flight data
 * Polls every 60 seconds — background cron keeps Redis cache hot,
 * so most fetches return instantly from cache instead of hitting OpenSky.
 */
export function useFlights(enabled: boolean = true) {
  return useQuery<Flight[]>({
    queryKey: ["flights"],
    queryFn: fetchFlights,
    refetchInterval: enabled ? 60_000 : false,
    staleTime: 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
    enabled,
  })
}