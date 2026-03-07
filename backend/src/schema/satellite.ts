import { z } from "zod";

export const TLESatelliteSchema = z.object({
  name: z.string(),
  line1: z.string(),
  line2: z.string(),
});

export const SatellitesResponseSchema = z.array(TLESatelliteSchema);
export type TLESatellite = z.infer<typeof TLESatelliteSchema>;
