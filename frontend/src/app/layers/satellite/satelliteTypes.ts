import type * as Cesium from "cesium"
import { createSatrec } from "../../../satellites/orbit"

/**
 * Satellite data from API
 */
export interface SatelliteData {
  name: string
  line1: string
  line2: string
}

/**
 * Satellite filter types
 */
export type SatelliteFilter = "all" | "iss" | "communications" | "gps" | "debris" | "other"

/**
 * Satellite references for managing Cesium entities
 */
export interface SatelliteRefs {
  entities: Record<string, Cesium.Entity>
  satrecs: Record<string, ReturnType<typeof createSatrec>>
  orbitPaths: Cesium.Entity[]
}

/**
 * Satellite layer configuration
 */
export interface SatelliteLayerConfig {
  /** Initial filter to apply */
  defaultFilter?: SatelliteFilter
  /** Update interval in milliseconds */
  updateInterval?: number
}
