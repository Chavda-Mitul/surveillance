/**
 * H3 spatial clustering for vessel data
 * Aggregates vessel points into hexagonal bins at low zoom levels
 * and expands into individual points as the camera zooms in.
 */

import * as h3 from "h3-js"
import * as Cesium from "cesium"
import type { Vessel, VesselFilter } from "../app/layers/vessel/vesselTypes"
import { classifyVessel } from "../app/layers/vessel/vesselTypes"

// ─── Types ────────────────────────────────────────────────────────

export interface VesselCluster {
  /** H3 cell index */
  h3Index: string
  /** Geographic center of the hex */
  lat: number
  lon: number
  /** Number of vessels in this cluster */
  count: number
  /** Breakdown by vessel type */
  typeCounts: Record<string, number>
  /** Dominant vessel type for coloring */
  dominantType: string
  /** Sample vessel for label/speed info (the most recent one) */
  sampleVessel: Vessel
}

// ─── Altitude thresholds (meters above ground) ────────────────────

export const ALTITUDE_THRESHOLDS = {
  /** Below this, show individual vessels */
  INDIVIDUAL: 50_000,
  /** Between INDIVIDUAL and MEDIUM, use res 6 */
  MEDIUM: 200_000,
  /** Between MEDIUM and HIGH, use res 4 */
  HIGH: 1_000_000,
  /** Above HIGH, use res 2 */
  /** Above this, all clusters collapsed to a single res */
} as const

export const H3_RESOLUTIONS = {
  LOW: 2 as number,    // ~870 km² per hex
  MEDIUM: 4 as number, // ~175 km² per hex
  HIGH: 6 as number,   // ~36 km² per hex
} as const

// ─── Altitude → resolution mapping ───────────────────────────────

/**
 * Get the appropriate H3 resolution for a given camera altitude
 */
export function getResolutionForAltitude(altitudeMeters: number): number {
  if (altitudeMeters < ALTITUDE_THRESHOLDS.INDIVIDUAL) return -1 // Show individual points
  if (altitudeMeters < ALTITUDE_THRESHOLDS.MEDIUM) return H3_RESOLUTIONS.HIGH    // res 6
  if (altitudeMeters < ALTITUDE_THRESHOLDS.HIGH) return H3_RESOLUTIONS.MEDIUM   // res 4
  return H3_RESOLUTIONS.LOW                                                     // res 2
}

/**
 * Get the current camera altitude from a Cesium viewer
 */
export function getCameraAltitude(viewer: Cesium.Viewer): number {
  const cartographic = viewer.camera.positionCartographic
  if (!cartographic) return 0
  return cartographic.height
}

// ─── Clustering logic ─────────────────────────────────────────────

/**
 * Cluster vessels into H3 hex bins at the given resolution.
 * Filters vessels by the provided filter before clustering.
 */
export function clusterVessels(
  vessels: Vessel[],
  resolution: number,
  filter: VesselFilter = "all"
): VesselCluster[] {
  // Filter first
  const filtered = vessels.filter((v) => {
    if (filter === "all") return true
    return classifyVessel(v.vesselType) === filter
  })

  if (filtered.length === 0) return []
  if (resolution < 0) {
    // Resolution < 0 means show individual points
    // Return each vessel as a "cluster" of 1
    return filtered.map((v) => vesselToSingletonCluster(v))
  }

  // Group vessels by H3 cell
  const cellMap = new Map<string, Vessel[]>()

  for (const vessel of filtered) {
    const cell = h3.latLngToCell(vessel.lat, vessel.lon, resolution)
    const list = cellMap.get(cell) || []
    list.push(vessel)
    cellMap.set(cell, list)
  }

  // Build clusters
  const clusters: VesselCluster[] = []
  for (const [h3Index, group] of cellMap.entries()) {
    const center = h3.cellToLatLng(h3Index)
    const typeCounts: Record<string, number> = {}
    let bestType = "other"
    let bestCount = 0

    // Pick the most recent vessel as the sample
    let sample = group[0]
    for (const v of group) {
      const type = classifyVessel(v.vesselType)
      typeCounts[type] = (typeCounts[type] || 0) + 1
      if (typeCounts[type] > bestCount) {
        bestCount = typeCounts[type]
        bestType = type
      }
      if (v.updatedAt > sample.updatedAt) sample = v
    }

    clusters.push({
      h3Index,
      lat: center[0],
      lon: center[1],
      count: group.length,
      typeCounts,
      dominantType: bestType,
      sampleVessel: sample,
    })
  }

  return clusters
}

/**
 * Create a singleton cluster for a single vessel (used at individual zoom level)
 */
function vesselToSingletonCluster(vessel: Vessel): VesselCluster {
  const type = classifyVessel(vessel.vesselType)
  return {
    h3Index: "",
    lat: vessel.lat,
    lon: vessel.lon,
    count: 1,
    typeCounts: { [type]: 1 },
    dominantType: type,
    sampleVessel: vessel,
  }
}

// ─── Z-level transition helpers ───────────────────────────────────

export interface ClusteringState {
  resolution: number
  clusters: VesselCluster[]
  mode: "individual" | "clustered"
}

/**
 * Determine the appropriate clustering state for a given altitude and data
 */
export function getClusteringState(
  vessels: Vessel[],
  altitudeMeters: number,
  filter: VesselFilter = "all"
): ClusteringState {
  const resolution = getResolutionForAltitude(altitudeMeters)
  const mode = resolution < 0 ? "individual" : "clustered"

  return {
    resolution,
    clusters: clusterVessels(vessels, resolution, filter),
    mode,
  }
}