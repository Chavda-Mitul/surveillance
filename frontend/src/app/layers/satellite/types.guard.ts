import type { Layer } from "../../Layer"
import type { SatelliteLayer } from "./SatelliteLayer"

/**
 * Type guards for safe type checking
 */

export interface LayerWithLoadData extends Layer {
  loadData(data: unknown): void
}

export interface LayerWithStopTracking extends Layer {
  stopTracking(): void
}

export function hasLoadData(layer: Layer): layer is LayerWithLoadData {
  return "loadData" in layer && typeof (layer as any).loadData === "function"
}

export function hasStopTracking(layer: Layer): layer is LayerWithStopTracking {
  return "stopTracking" in layer && typeof (layer as any).stopTracking === "function"
}

export function isSatelliteLayer(layer: Layer): layer is SatelliteLayer {
  return layer.id === "satellite" && hasLoadData(layer) && hasStopTracking(layer)
}
