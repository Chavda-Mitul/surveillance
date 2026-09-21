import { useQuery } from "@tanstack/react-query"
import { fetchFlights } from "./fetchFlights"
import type { Flight } from "./types"

/**
 * React Query hook for flight data
 * Polls every 30 seconds (OpenSky rate limit: ~4000/day for authenticated)
 */
export function useFlights(enabled: boolean = true) {
  return useQuery<Flight[]>({
    queryKey: ["flights"],
    queryFn: fetchFlights,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 15_000,
    retry: 2,
    refetchOnWindowFocus: false,
    enabled,
  })
}