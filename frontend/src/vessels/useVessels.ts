import { useQuery } from "@tanstack/react-query"
import { fetchVessels } from "./fetchVessels"

/**
 * React Query hook for vessel AIS data
 * Only fetches when enabled (i.e., vessel tab is active)
 * Polls every 30 seconds to match AIS data refresh rate
 */
export function useVessels(enabled: boolean = true) {
  return useQuery({
    queryKey: ["vessels"],
    queryFn: fetchVessels,
    staleTime: 1000 * 30,
    refetchInterval: enabled ? 30_000 : false,
    enabled,
  })
}
