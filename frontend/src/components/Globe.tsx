import { useEffect, useRef, useImperativeHandle, forwardRef } from "react"
import * as Cesium from "cesium"
import { LayerManager } from "../app/LayerManager"
import { SatelliteLayer } from "../app/layers/satellite/SatelliteLayer"
import { VesselLayer } from "../app/layers/vessel/VesselLayer"
import { FlightLayer } from "../app/layers/flight/FlightLayer"
import type { SatelliteFilter } from "./globe/types"
import type { VesselFilter } from "../vessels/types"
import type { FlightFilter } from "../flights/types"

interface GlobeProps {
  filter: SatelliteFilter
  vesselFilter: VesselFilter
  flightFilter: FlightFilter
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
  /** Track a flight by callsign or ICAO24 */
  trackFlight: (identifier: string) => void
  /** Stop tracking any entity */
  stopTracking: () => void
  /** Zoom out from current position to a high-level overview */
  zoomOut: () => void
}

/**
 * Globe component - renders Cesium viewer with layer management
 * Responsible only for Cesium visualization, not UI state
 */
function GlobeInner(
  { filter, vesselFilter, flightFilter }: GlobeProps,
  ref: React.Ref<GlobeRef>
) {
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const layerManagerRef = useRef<LayerManager | null>(null)
  const satelliteLayerRef = useRef<SatelliteLayer | null>(null)
  const vesselLayerRef = useRef<VesselLayer | null>(null)
  const flightLayerRef = useRef<FlightLayer | null>(null)

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

      const entities = satelliteLayer.getEntities()
      for (const entity of entities) {
        if (entity.name?.toLowerCase().includes(name.toLowerCase())) {
          viewer.trackedEntity = entity
          return
        }
      }
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

    trackFlight(identifier: string) {
      const viewer = viewerRef.current
      const flightLayer = flightLayerRef.current
      if (!viewer || !flightLayer) return

      const entities = flightLayer.getEntities()
      for (const entity of entities) {
        const entityName = entity.name ?? ""
        const entityId = entity.id?.toLowerCase() ?? ""
        const search = identifier.toLowerCase()
        if (entityName.toLowerCase().includes(search) || entityId.includes(search)) {
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
      flightLayerRef.current?.stopTracking()
    },

    /**
     * Zoom out from the current camera position to a high-level overview
     * while keeping the same geographic focus area.
     * Uses the camera's current cartographic position to zoom out in place.
     */
    zoomOut() {
      const viewer = viewerRef.current
      if (!viewer) return

      const cartographic = viewer.camera.positionCartographic
      if (!cartographic) return

      const lat = Cesium.Math.toDegrees(cartographic.latitude)
      const lon = Cesium.Math.toDegrees(cartographic.longitude)

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 20_000_000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 2.0,
      })
    },
  }))

  // Initialize Cesium viewer and layer manager
  useEffect(() => {
    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN
    const viewer = new Cesium.Viewer("globe", {
      timeline: false,
      animation: false,
      shouldAnimate: true,
      // Performance optimizations
      orderIndependentTranslucency: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      homeButton: false,
      geocoder: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: true,
      // Terrain
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      // Sky and atmosphere (minimal for perf)
      skyBox: false,
      skyAtmosphere: false,
    })

    // Performance: disable MSAA, reduce rasterizer samples
    viewer.scene.fxaa = true
    viewer.scene.highDynamicRange = false
    viewer.scene.logarithmicDepthBuffer = true
    viewer.scene.globe.enableLighting = false
    viewer.scene.globe.showWaterEffect = false
    viewer.scene.globe.depthTestAgainstTerrain = false

    // Fog for natural culling of distant entities
    viewer.scene.fog.enabled = true
    viewer.scene.fog.saturation = 0.2
    viewer.scene.fog.density = 0.00005
    viewer.scene.fog.minimumBrightness = 0.8

    // Set default camera to a nice overview position
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 20, 20_000_000),
    })

    viewerRef.current = viewer

    // Create layer manager
    const layerManager = new LayerManager(viewer)
    layerManagerRef.current = layerManager

    // Create and register satellite layer
    const satelliteLayer = new SatelliteLayer(viewer)
    satelliteLayerRef.current = satelliteLayer
    layerManager.register("satellite", satelliteLayer)

    const satDataSource = layerManager.getDataSource("satellite")
    if (satDataSource) {
      satelliteLayer.setDataSource(satDataSource)
    }

    // Create and register vessel layer
    const vesselLayer = new VesselLayer(viewer)
    vesselLayerRef.current = vesselLayer
    layerManager.register("vessel", vesselLayer)

    const vesselDataSource = layerManager.getDataSource("vessel")
    if (vesselDataSource) {
      vesselLayer.setDataSource(vesselDataSource)
    }

    // Create and register flight layer
    const flightLayer = new FlightLayer(viewer)
    flightLayerRef.current = flightLayer
    layerManager.register("flight", flightLayer)

    const flightDataSource = layerManager.getDataSource("flight")
    if (flightDataSource) {
      flightLayer.setDataSource(flightDataSource)
    }

    return () => {
      layerManager.dispose()
      viewer.destroy()
    }
  }, [])

  // Handle satellite filter changes
  useEffect(() => {
    satelliteLayerRef.current?.setFilter(filter)
  }, [filter])

  // Handle vessel filter changes
  useEffect(() => {
    vesselLayerRef.current?.setFilter(vesselFilter)
  }, [vesselFilter])

  // Handle flight filter changes
  useEffect(() => {
    flightLayerRef.current?.setFilter(flightFilter)
  }, [flightFilter])

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