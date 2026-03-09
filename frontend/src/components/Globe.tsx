import { useEffect, useRef, useImperativeHandle, forwardRef } from "react"
import * as Cesium from "cesium"
import { LayerManager } from "../app/LayerManager"
import { SatelliteLayer } from "../app/layers/satellite/SatelliteLayer"
import type { SatelliteFilter } from "./globe/types"
import type { SatelliteData } from "../app/layers/satellite/satelliteTypes"

interface GlobeProps {
  filter: SatelliteFilter
  onFilterChange: (filter: SatelliteFilter) => void
  onStopTracking: () => void
}

export interface GlobeRef {
  layerManager: LayerManager
}

/**
 * Globe component - renders Cesium viewer with layer management
 * Responsible only for Cesium visualization, not UI state
 */
function GlobeInner({ filter, onFilterChange, onStopTracking }: GlobeProps, ref: React.Ref<GlobeRef>) {
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const layerManagerRef = useRef<LayerManager | null>(null)
  const satelliteLayerRef = useRef<SatelliteLayer | null>(null)

  // Expose layer manager to parent
  useImperativeHandle(ref, () => ({
    get layerManager() {
      return layerManagerRef.current!
    },
  }))

  // Initialize Cesium viewer and layer manager
  useEffect(() => {
    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN
    const viewer = new Cesium.Viewer("globe", {
      timeline: true,
      animation: true,
      shouldAnimate: true,
    })

    viewerRef.current = viewer

    // Create layer manager
    const layerManager = new LayerManager(viewer)
    layerManagerRef.current = layerManager

    // Create and register satellite layer
    const satelliteLayer = new SatelliteLayer(viewer)
    satelliteLayerRef.current = satelliteLayer
    layerManager.register("satellite", satelliteLayer)

    // Pass data source to layer for entity management
    const dataSource = layerManager.getDataSource("satellite")
    if (dataSource) {
      satelliteLayer.setDataSource(dataSource)
    }

    return () => {
      layerManager.dispose()
      viewer.destroy()
    }
  }, [])

  // Handle filter changes
  useEffect(() => {
    const satelliteLayer = satelliteLayerRef.current
    if (satelliteLayer) {
      satelliteLayer.setFilter(filter)
    }
  }, [filter])

  // Handle stop tracking
  useEffect(() => {
    const handleStopTrackingEvent = () => {
      satelliteLayerRef.current?.stopTracking()
    }

    window.addEventListener("stopTracking", handleStopTrackingEvent)
    return () => {
      window.removeEventListener("stopTracking", handleStopTrackingEvent)
    }
  }, [])

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div id="globe" style={{ width: "100%", height: "100%" }} />
    </div>
  )
}

// Wrap with forwardRef to expose layer manager
export const Globe = forwardRef<GlobeRef, GlobeProps>(GlobeInner)
export default Globe
