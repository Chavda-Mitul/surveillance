import { useEffect, useRef, useImperativeHandle, forwardRef } from "react"
import * as Cesium from "cesium"
import { LayerManager } from "../app/LayerManager"
import { SatelliteLayer } from "../app/layers/satellite/SatelliteLayer"
import { VesselLayer } from "../app/layers/vessel/VesselLayer"
import type { SatelliteFilter } from "./globe/types"
import type { VesselFilter } from "../vessels/types"

interface GlobeProps {
  filter: SatelliteFilter
  vesselFilter: VesselFilter
  onFilterChange: (filter: SatelliteFilter) => void
  onStopTracking: () => void
}

export interface GlobeRef {
  layerManager: LayerManager
  /** Fly the Cesium camera to a specific geographic location */
  flyTo: (latitude: number, longitude: number, altitude?: number, name?: string) => void
  /** Track a satellite by name */
  trackSatellite: (name: string) => void
  /** Track a vessel by MMSI */
  trackVessel: (identifier: string) => void
  /** Stop tracking any entity */
  stopTracking: () => void
}

/**
 * Globe component - renders Cesium viewer with layer management
 * Responsible only for Cesium visualization, not UI state
 */
function GlobeInner(
  { filter, vesselFilter, onFilterChange, onStopTracking: onStopTrackingProp }: GlobeProps,
  ref: React.Ref<GlobeRef>
) {
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const layerManagerRef = useRef<LayerManager | null>(null)
  const satelliteLayerRef = useRef<SatelliteLayer | null>(null)
  const vesselLayerRef = useRef<VesselLayer | null>(null)

  // Expose layer manager + spatial query methods to parent
  useImperativeHandle(ref, () => ({
    get layerManager() {
      return layerManagerRef.current!
    },

    flyTo(latitude: number, longitude: number, altitude = 1000000, name?: string) {
      const viewer = viewerRef.current
      if (!viewer) return

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 2.5,
      })

      if (name) {
        viewer.scene.screenSpaceCameraController.enableTilt = true
      }
    },

    trackSatellite(name: string) {
      const viewer = viewerRef.current
      const satelliteLayer = satelliteLayerRef.current
      if (!viewer || !satelliteLayer) return

      // Find matching satellite entity
      const entities = satelliteLayer.getEntities()
      for (const entity of entities) {
        if (entity.name?.toLowerCase().includes(name.toLowerCase())) {
          viewer.trackedEntity = entity
          return
        }
      }

      // If not found by name, try the id field
      for (const entity of entities) {
        const id = entity.id?.toLowerCase() ?? ""
        if (id.includes(name.toLowerCase())) {
          viewer.trackedEntity = entity
          return
        }
      }
    },

    trackVessel(identifier: string) {
      const viewer = viewerRef.current
      const vesselLayer = vesselLayerRef.current
      if (!viewer || !vesselLayer) return

      const entities = vesselLayer.getEntities()
      for (const entity of entities) {
        const entityName = entity.name ?? ""
        if (entityName.includes(identifier) || entity.id?.includes(identifier)) {
          viewer.trackedEntity = entity
          return
        }
      }
    },

    stopTracking() {
      if (viewerRef.current) {
        viewerRef.current.trackedEntity = undefined
      }
      satelliteLayerRef.current?.stopTracking()
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

    const dataSource = layerManager.getDataSource("satellite")
    if (dataSource) {
      satelliteLayer.setDataSource(dataSource)
    }

    // Create and register vessel layer
    const vesselLayer = new VesselLayer(viewer)
    vesselLayerRef.current = vesselLayer
    layerManager.register("vessel", vesselLayer)

    const vesselDataSource = layerManager.getDataSource("vessel")
    if (vesselDataSource) {
      vesselLayer.setDataSource(vesselDataSource)
    }

    return () => {
      layerManager.dispose()
      viewer.destroy()
    }
  }, [])

  // Handle satellite filter changes
  useEffect(() => {
    const satelliteLayer = satelliteLayerRef.current
    if (satelliteLayer) {
      satelliteLayer.setFilter(filter)
    }
  }, [filter])

  // Handle vessel filter changes
  useEffect(() => {
    const vesselLayer = vesselLayerRef.current
    if (vesselLayer) {
      vesselLayer.setFilter(vesselFilter)
    }
  }, [vesselFilter])

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