import { useQuery } from "@tanstack/react-query"
import { fetchVessels } from "./fetchVessels"

export function useVessels() {
  return useQuery({
    queryKey: ["vessels"],
    queryFn: fetchVessels,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
  })
}
