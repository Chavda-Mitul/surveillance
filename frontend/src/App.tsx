import { useState, useCallback, useRef, useEffect } from "react"
import { UIProvider } from "./ui/UIProvider"
import Globe, { type GlobeRef } from "./components/Globe"
import { useSatellites } from "./satellites/useSatellites"
import { useVessels } from "./vessels/useVessels"
import type { AppMode } from "./ui/modes"
import type { SatelliteFilter } from "./components/globe/types"
import type { VesselFilter, Vessel } from "./vessels/types"
import type { SatelliteData } from "./app/layers/satellite/satelliteTypes"
import { hasLoadData, hasStopTracking } from "./app/layers/satellite/types.guard"

/**
 * Main application component
 * Manages top-level state and coordinates between UI and visualization layers
 */
function App() {
  const [activeMode, setActiveMode] = useState<AppMode>("satellite")
  const [satelliteFilter, setSatelliteFilter] = useState<SatelliteFilter>("gps")
  const [vesselFilter, setVesselFilter] = useState<VesselFilter>("all")
  const globeRef = useRef<GlobeRef>(null)

  const { data: satellites } = useSatellites()
  const { data: vessels } = useVessels()

  /**
   * Load satellite data when layer is enabled
   */
  useEffect(() => {
    if (activeMode !== "satellite" || !satellites || !globeRef.current) {
      return
    }

    const layerManager = globeRef.current.layerManager
    layerManager.enable("satellite")

    const satelliteLayer = layerManager.getLayer("satellite")
    if (satelliteLayer && hasLoadData(satelliteLayer)) {
      satelliteLayer.loadData(satellites as SatelliteData[])
    }
  }, [activeMode, satellites])

  /**
   * Load vessel data when vessel mode is active
   */
  useEffect(() => {
    if (activeMode !== "vessel" || !vessels || !globeRef.current) return

    const layerManager = globeRef.current.layerManager
    layerManager.enable("vessel")

    const vesselLayer = layerManager.getLayer("vessel")
    if (vesselLayer && hasLoadData(vesselLayer)) {
      vesselLayer.loadData(vessels as Vessel[])
    }
  }, [activeMode, vessels])

  /**
   * Handle mode switching
   */
  const handleModeChange = useCallback((mode: AppMode) => {
    setActiveMode(mode)

    if (!globeRef.current) return

    const layerManager = globeRef.current.layerManager

    if (mode === "satellite") {
      layerManager.enable("satellite")
      layerManager.disable("vessel")
    } else if (mode === "vessel") {
      layerManager.enable("vessel")
      layerManager.disable("satellite")
    } else {
      layerManager.disable("satellite")
      layerManager.disable("vessel")
    }
  }, [])

  /**
   * Stop tracking current satellite
   */
  const handleStopTracking = useCallback(() => {
    if (!globeRef.current) return

    const layerManager = globeRef.current.layerManager
    const satelliteLayer = layerManager.getLayer("satellite")

    if (satelliteLayer && hasStopTracking(satelliteLayer)) {
      satelliteLayer.stopTracking()
    }
  }, [])

  return (
    <UIProvider
      activeMode={activeMode}
      onModeChange={handleModeChange}
      satelliteFilter={satelliteFilter}
      onFilterChange={setSatelliteFilter}
      onStopTracking={handleStopTracking}
      vesselFilter={vesselFilter}
      onVesselFilterChange={setVesselFilter}
    >
      <Globe
        ref={globeRef}
        filter={satelliteFilter}
        vesselFilter={vesselFilter}
        onFilterChange={setSatelliteFilter}
        onStopTracking={handleStopTracking}
      />
    </UIProvider>
  )
}

export default App
