import type * as Cesium from "cesium"

/**
 * Base interface for all layers
 * Each layer manages its own data, entities, and rendering
 */
export interface Layer {
  /** Unique identifier for the layer */
  readonly id: string

  /** Human-readable name */
  readonly name: string

  /**
   * Enable the layer
   * Called when the layer is activated
   */
  enable(): void

  /**
   * Disable the layer
   * Called when the layer is deactivated
   * Should clean up entities and stop any running updates
   */
  disable(): void

  /**
   * Update layer state
   * Called periodically when layer is active
   */
  update(): void

  /**
   * Check if layer is currently active
   */
  isEnabled(): boolean

  /**
   * Get the Cesium entities created by this layer
   */
  getEntities(): Cesium.Entity[]
}

/**
 * Layer configuration options
 */
export interface LayerOptions {
  /** Whether the layer is enabled by default */
  defaultEnabled?: boolean
}

/**
 * Event emitted when layer state changes
 */
export interface LayerEvent {
  layerId: string
  enabled: boolean
}
