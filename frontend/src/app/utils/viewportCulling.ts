import * as Cesium from "cesium"

/**
 * Viewport culling utility for Cesium
 *
 * Determines whether geographic positions are within the current
 * camera's view rectangle. This allows layers to hide entities
 * outside the visible area, drastically improving performance.
 */

/**
 * Get the camera's current view rectangle (bounding box on the globe)
 * Returns null if the camera is transitioning or the rectangle is invalid
 */
export function getViewRectangle(
  scene: Cesium.Scene
): Cesium.Rectangle | null {
  try {
    const rect = scene.camera.computeViewRectangle()
    if (!rect) return null

    // Validate rectangle (sanity check)
    if (
      isNaN(rect.west) ||
      isNaN(rect.east) ||
      isNaN(rect.south) ||
      isNaN(rect.north)
    ) {
      return null
    }

    return rect
  } catch {
    return null
  }
}

/**
 * Check if a longitude/latitude point is within a given rectangle.
 * Handles rectangle wrapping across the anti-meridian (+180° / -180°).
 */
export function isPositionInView(
  lon: number,
  lat: number,
  viewRect: Cesium.Rectangle
): boolean {
  // Latitude check (simple — no wrapping)
  if (lat < Cesium.Math.toDegrees(viewRect.south)) return false
  if (lat > Cesium.Math.toDegrees(viewRect.north)) return false

  // Longitude check with anti-meridian handling
  const lonDeg = lon
  const westDeg = Cesium.Math.toDegrees(viewRect.west)
  const eastDeg = Cesium.Math.toDegrees(viewRect.east)

  if (westDeg <= eastDeg) {
    // Normal case: rectangle doesn't cross the anti-meridian
    return lonDeg >= westDeg && lonDeg <= eastDeg
  } else {
    // Wrapping case: rectangle crosses the anti-meridian
    // e.g., west = +170°, east = -170° → visible from 170° to 180° AND -180° to -170°
    return lonDeg >= westDeg || lonDeg <= eastDeg
  }
}

/**
 * Check if a Cartesian3 position is within the camera's view rectangle
 */
export function isCartesianInView(
  position: Cesium.Cartesian3,
  viewRect: Cesium.Rectangle
): boolean {
  const cartographic = Cesium.Cartographic.fromCartesian(position)
  const lon = Cesium.Math.toDegrees(cartographic.longitude)
  const lat = Cesium.Math.toDegrees(cartographic.latitude)
  return isPositionInView(lon, lat, viewRect)
}

/**
 * Check if a Cartesian3 position is on the visible hemisphere of the globe
 * (i.e., not hidden behind the globe from the camera's perspective).
 *
 * This performs a dot product check: if the entity and camera position vectors
 * (from earth center) point in roughly opposite directions, the entity is
 * behind the globe and can be safely hidden.
 *
 * @param position - Entity ECEF position
 * @param cameraPosition - Camera ECEF position
 * @returns true if the entity is on the visible hemisphere
 */
export function isOnVisibleHemisphere(
  position: Cesium.Cartesian3,
  cameraPosition: Cesium.Cartesian3
): boolean {
  const entityNormal = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3())
  const cameraNormal = Cesium.Cartesian3.normalize(cameraPosition, new Cesium.Cartesian3())
  const dot = Cesium.Cartesian3.dot(entityNormal, cameraNormal)
  // If dot >= 0, entity is on the same hemisphere as the camera (visible side)
  // If dot < 0, entity is on the opposite hemisphere (behind the globe)
  return dot >= 0
}

/**
 * Get expanded view rectangle with padding (to show entities
 * slightly outside the immediate viewport, useful for smooth panning)
 * @param scene - Cesium scene
 * @param paddingFactor - 0 = no padding, 0.5 = 50% expansion, 1 = 100% expansion
 */
export function getExpandedViewRect(
  scene: Cesium.Scene,
  paddingFactor: number = 0.3
): Cesium.Rectangle | null {
  const rect = getViewRectangle(scene)
  if (!rect) return null

  const width = rect.east - rect.west
  // Handle wrapping
  const east = rect.west + width * (1 + paddingFactor)
  const west = rect.west - width * paddingFactor

  const height = rect.north - rect.south
  const north = Math.min(rect.north + height * paddingFactor, Cesium.Math.toRadians(90))
  const south = Math.max(rect.south - height * paddingFactor, Cesium.Math.toRadians(-90))

  return new Cesium.Rectangle(west, south, east, north)
}

/**
 * Estimate how many entities are visible in the current view.
 * Useful for adaptive level-of-detail.
 */
export function estimateVisibleCount(
  total: number,
  viewRect: Cesium.Rectangle | null
): number {
  if (!viewRect) return total

  const viewArea =
    (Cesium.Math.toDegrees(viewRect.east) - Cesium.Math.toDegrees(viewRect.west)) *
    (Cesium.Math.toDegrees(viewRect.north) - Cesium.Math.toDegrees(viewRect.south))

  const globeArea = 360 * 180 // ~64,800 sq degrees
  const ratio = Math.min(viewArea / globeArea, 1)

  return Math.max(Math.ceil(total * ratio), 1)
}