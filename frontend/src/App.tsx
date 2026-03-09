import { useState, useCallback, useRef, useEffect } from "react"
import { UIProvider } from "./ui/UIProvider"
import Globe, { type GlobeRef } from "./components/Globe"
import { useSatellites } from "./satellites/useSatellites"
import type { AppMode } from "./ui/modes"
import type { SatelliteFilter } from "./components/globe/types"
import type { SatelliteData } from "./app/layers/satellite/satelliteTypes"
import { hasLoadData, hasStopTracking } from "./app/layers/satellite/types.guard"

/**
 * Main application component
 * Manages top-level state and coordinates between UI and visualization layers
 */
function App() {
  const [activeMode, setActiveMode] = useState<AppMode>("satellite")
  const [satelliteFilter, setSatelliteFilter] = useState<SatelliteFilter>("gps")
  const globeRef = useRef<GlobeRef>(null)

  const { data: satellites } = useSatellites()

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
   * Handle mode switching
   */
  const handleModeChange = useCallback((mode: AppMode) => {
    setActiveMode(mode)

    if (!globeRef.current) return

    const layerManager = globeRef.current.layerManager

    if (mode === "satellite") {
      layerManager.enable("satellite")
    } else {
      layerManager.disable("satellite")
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
    >
      <Globe
        ref={globeRef}
        filter={satelliteFilter}
        onFilterChange={setSatelliteFilter}
        onStopTracking={handleStopTracking}
      />
    </UIProvider>
  )
}

export default App
