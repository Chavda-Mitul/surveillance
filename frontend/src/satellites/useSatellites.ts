import { useQuery } from "@tanstack/react-query"
import { fetchSatellites } from "./fetchSatellites"

/**
 * React Query hook for satellite TLE data
 * Only fetches when enabled (i.e., the satellite tab is active)
 * Stale time of 12 hours since TLE data changes slowly
 */
export function useSatellites(enabled: boolean = true) {
  return useQuery({
    queryKey: ["satellites"],
    queryFn: fetchSatellites,
    staleTime: 1000 * 60 * 60 * 12,
    enabled,
  })
}