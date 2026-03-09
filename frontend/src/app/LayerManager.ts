import * as Cesium from "cesium"
import type { Layer, LayerEvent } from "./Layer"

/**
 * Update interval in milliseconds
 * Updates every 10 seconds to avoid performance issues
 */
const UPDATE_INTERVAL_MS = 10000

/**
 * Manages multiple layers on a Cesium viewer
 * Handles layer registration, enabling, disabling, and throttled updates
 * Uses Cesium's clock tick with throttling for synchronized updates
 */
export class LayerManager {
  private viewer: Cesium.Viewer
  private layers: Map<string, Layer> = new Map()
  private dataSources: Map<string, Cesium.CustomDataSource> = new Map()
  private removeTickListener: (() => void) | null = null
  private lastUpdateTime = 0

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
    this.setupTickListener()
  }

  /**
   * Register a layer with explicit ID
   * Creates a CustomDataSource for the layer's entities
   */
  register(layerId: string, layer: Layer): void {
    if (this.layers.has(layerId)) {
      console.warn(`Layer "${layerId}" is already registered. Replacing...`)
    }

    // Create a data source for this layer
    const dataSource = new Cesium.CustomDataSource(layerId)
    this.dataSources.set(layerId, dataSource)
    this.viewer.dataSources.add(dataSource)

    this.layers.set(layerId, layer)
  }

  /**
   * Unregister a layer and clean up its data source
   */
  unregister(layerId: string): void {
    const layer = this.layers.get(layerId)
    if (layer) {
      if (layer.isEnabled()) {
        layer.disable()
      }
      this.layers.delete(layerId)
    }

    // Remove data source
    const dataSource = this.dataSources.get(layerId)
    if (dataSource) {
      this.viewer.dataSources.remove(dataSource)
      this.dataSources.delete(layerId)
    }
  }

  /**
   * Enable a layer by ID
   */
  enable(layerId: string): void {
    const layer = this.layers.get(layerId)
    if (!layer) {
      console.warn(`Layer "${layerId}" not found`)
      return
    }

    if (!layer.isEnabled()) {
      layer.enable()
      this.emitEvent({ layerId, enabled: true })
    }
  }

  /**
   * Disable a layer by ID
   */
  disable(layerId: string): void {
    const layer = this.layers.get(layerId)
    if (!layer) {
      console.warn(`Layer "${layerId}" not found`)
      return
    }

    if (layer.isEnabled()) {
      layer.disable()
      this.emitEvent({ layerId, enabled: false })
    }
  }

  /**
   * Toggle a layer by ID
   */
  toggle(layerId: string): void {
    const layer = this.layers.get(layerId)
    if (layer) {
      if (layer.isEnabled()) {
        this.disable(layerId)
      } else {
        this.enable(layerId)
      }
    }
  }

  /**
   * Check if a layer is enabled
   */
  isEnabled(layerId: string): boolean {
    const layer = this.layers.get(layerId)
    return layer?.isEnabled() ?? false
  }

  /**
   * Get a layer by ID
   */
  getLayer(layerId: string): Layer | undefined {
    return this.layers.get(layerId)
  }

  /**
   * Get the data source for a layer
   */
  getDataSource(layerId: string): Cesium.CustomDataSource | undefined {
    return this.dataSources.get(layerId)
  }

  /**
   * Get all registered layers
   */
  getAllLayers(): Layer[] {
    return Array.from(this.layers.values())
  }

  /**
   * Enable only the specified layer (disable all others)
   */
  enableOnly(layerId: string): void {
    this.layers.forEach((layer, id) => {
      if (id !== layerId && layer.isEnabled()) {
        this.disable(id)
      }
    })
    this.enable(layerId)
  }

  /**
   * Disable all layers
   */
  disableAll(): void {
    this.layers.forEach((layer) => {
      if (layer.isEnabled()) {
        layer.disable()
      }
    })
  }

  /**
   * Subscribe to layer state changes
   */
  subscribe(listener: (event: LayerEvent) => void): () => void {
    const wrappedListener = (event: LayerEvent) => {
      // Wrap in try-catch to prevent one listener from breaking others
      try {
        listener(event)
      } catch (error) {
        console.error("Layer event listener error:", error)
      }
    }
    
    this.listeners.add(wrappedListener)
    return () => this.listeners.delete(wrappedListener)
  }

  private listeners: Set<(event: LayerEvent) => void> = new Set()

  /**
   * Emit event to all listeners
   */
  private emitEvent(event: LayerEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }

  /**
   * Set up Cesium clock tick listener with throttling
   * Only updates layers every UPDATE_INTERVAL_MS (10 seconds)
   */
  private setupTickListener(): void {
    this.removeTickListener = this.viewer.clock.onTick.addEventListener(() => {
      const now = Date.now()
      
      // Throttle updates to avoid performance issues
      // Calling update() every frame (60fps) would be too heavy
      if (now - this.lastUpdateTime < UPDATE_INTERVAL_MS) {
        return
      }
      
      this.lastUpdateTime = now
      
      this.layers.forEach((layer) => {
        if (layer.isEnabled()) {
          layer.update()
        }
      })
    })
  }

  /**
   * Clean up all layers and stop the update loop
   */
  dispose(): void {
    // Remove tick listener
    if (this.removeTickListener) {
      this.removeTickListener()
      this.removeTickListener = null
    }

    // Disable and clean up all layers
    this.layers.forEach((layer) => {
      if (layer.isEnabled()) {
        layer.disable()
      }
    })

    // Remove all data sources
    this.dataSources.forEach((dataSource) => {
      this.viewer.dataSources.remove(dataSource)
    })

    this.layers.clear()
    this.dataSources.clear()
    this.listeners.clear()
  }
}
