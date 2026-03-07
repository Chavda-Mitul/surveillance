import * as Cesium from "cesium"
import { createSatrec } from "../../satellites/orbit"

export type SatelliteFilter = "all" | "communications" | "gps" | "debris" | "other" | "iss"

export interface SatelliteRefs {
  entities: Record<string, Cesium.Entity>
  satrecs: Record<string, ReturnType<typeof createSatrec>>
  orbitPaths: Cesium.Entity[]
}
