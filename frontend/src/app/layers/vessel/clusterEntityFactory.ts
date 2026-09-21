/**
 * Entity factory for H3 clustered vessel hex bins
 * Renders a semi-transparent hex circle with a count label.
 * Uses a canvas-drawn billboard to avoid external assets.
 */

import * as Cesium from "cesium"
import type { VesselCluster } from "../../../vessels/clusterer"
import { VESSEL_COLORS } from "./constants"

// ─── Canvas hex icon cache ────────────────────────────────────────

const ICON_CACHE = new Map<string, string>()

/**
 * Generate a data URL for a hexagon billboard icon with the given colour and size.
 * The result is cached so identical icons don't get redrawn.
 */
function getHexIcon(colorHex: string, size: number): string {
  const key = `${colorHex}-${size}`
  if (ICON_CACHE.has(key)) return ICON_CACHE.get(key)!

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 4

  // Draw filled hexagon
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()

  // Fill with semi-transparent colour
  ctx.fillStyle = colorHex
  ctx.globalAlpha = 0.7
  ctx.fill()

  // White outline
  ctx.globalAlpha = 1
  ctx.strokeStyle = "rgba(255,255,255,0.6)"
  ctx.lineWidth = 1.5
  ctx.stroke()

  const dataUrl = canvas.toDataURL()
  ICON_CACHE.set(key, dataUrl)
  return dataUrl
}

// ─── Scale thresholds for cluster billboards ──────────────────────

const CLUSTER_SCALE_BY_DISTANCE = new Cesium.NearFarScalar(
  5.0e4,  // near distance (50 km)
  1.5,    // near scale
  5.0e6,  // far distance (5000 km)
  0.3     // far scale
)

const CLUSTER_LABEL_DISTANCE = new Cesium.DistanceDisplayCondition(
  0,
  5_000_000 // Hide labels beyond 5000 km
)

// ─── Factory ──────────────────────────────────────────────────────

export class VesselClusterEntityFactory {
  /**
   * Create a hex-bin cluster billboard entity for one cluster
   */
  static createClusterEntity(
    cluster: VesselCluster,
    entityCollection: Cesium.EntityCollection
  ): Cesium.Entity {
    const color = VESSEL_COLORS[cluster.dominantType] ?? VESSEL_COLORS.other
    const colorHex = color.toCssColorString()
    const iconSize = Math.min(64 + cluster.count * 2, 120)
    const imageUrl = getHexIcon(colorHex, iconSize)

    const position = Cesium.Cartesian3.fromDegrees(cluster.lon, cluster.lat, 0)

    return entityCollection.add({
      id: `cluster-${cluster.h3Index || `${cluster.lat.toFixed(4)}-${cluster.lon.toFixed(4)}`}`,
      position: new Cesium.ConstantPositionProperty(position),
      billboard: {
        image: imageUrl,
        scaleByDistance: CLUSTER_SCALE_BY_DISTANCE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: cluster.count > 1 ? `${cluster.count}` : "",
        font: "bold 14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, 20),
        distanceDisplayCondition: CLUSTER_LABEL_DISTANCE,
        show: cluster.count > 1,
      },
      // Store metadata for tooltip / debugging
      properties: {
        clusterCount: cluster.count,
        dominantType: cluster.dominantType,
        sampleMmsi: cluster.sampleVessel.mmsi,
      },
    })
  }

  /**
   * Update or create a set of cluster entities for the given clusters.
   * Removes entities for clusters that no longer exist.
   */
  static syncClusters(
    clusters: VesselCluster[],
    entityCollection: Cesium.EntityCollection,
    existingEntities: Record<string, Cesium.Entity>
  ): Record<string, Cesium.Entity> {
    const newEntities: Record<string, Cesium.Entity> = {}

    // Add / update clusters
    for (const cluster of clusters) {
      const id = `cluster-${cluster.h3Index || `${cluster.lat.toFixed(4)}-${cluster.lon.toFixed(4)}`}`

      if (existingEntities[id]) {
        // Entity already exists — keep it
        newEntities[id] = existingEntities[id]
        delete existingEntities[id]
      } else {
        // New cluster — create entity
        const entity = VesselClusterEntityFactory.createClusterEntity(cluster, entityCollection)
        newEntities[id] = entity
      }
    }

    // Remove stale cluster entities
    for (const stale of Object.values(existingEntities)) {
      entityCollection.remove(stale)
    }

    return newEntities
  }
}