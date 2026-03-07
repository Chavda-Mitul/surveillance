import { useQuery } from "@tanstack/react-query"
import { fetchSatellites } from "./fetchSatellites"

export function useSatellites() {
    return useQuery({
        queryKey: ["satellites"],
        queryFn: fetchSatellites,
        staleTime: 1000 * 60 * 60 * 12
  })
}