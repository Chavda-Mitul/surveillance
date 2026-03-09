import { useState, useCallback, useRef, useEffect } from "react"
import { UIProvider } from "./ui/UIProvider"
import Globe, { type GlobeRef } from "./components/Globe"
import { useSatellites } from "./satellites/useSatellites"
import type { AppMode } from "./ui/modes"
import type { SatelliteFilter } from "./components/globe/types"
import type { SatelliteData } from "./app/layers/satellite/satelliteTypes"

function App() {
  // Centralized state managed at App level
  const [activeMode, setActiveMode] = useState<AppMode>("satellite")
  const [satelliteFilter, setSatelliteFilter] = useState<SatelliteFilter>("gps")

  // Ref to access layer manager
  const globeRef = useRef<GlobeRef>(null)

  // Fetch satellite data
  const { data: satellites } = useSatellites()

  // Load satellite data when layer is enabled
  useEffect(() => {
    if (activeMode === "satellite" && satellites && globeRef.current) {
      const layerManager = globeRef.current.layerManager
      layerManager.enable("satellite")

      // Load data into satellite layer
      const satelliteLayer = layerManager.getLayer("satellite")
      if (satelliteLayer && "loadData" in satelliteLayer) {
        (satelliteLayer as any).loadData(satellites as SatelliteData[])
      }
    }
  }, [activeMode, satellites])

  // Handle mode change
  const handleModeChange = useCallback((mode: AppMode) => {
    setActiveMode(mode)

    // Enable/disable layers based on mode
    if (globeRef.current) {
      const layerManager = globeRef.current.layerManager

      if (mode === "satellite") {
        layerManager.enable("satellite")
      } else {
        layerManager.disable("satellite")
      }
    }
  }, [])

  // Handle for stop tracking
  const handleStopTracking = useCallback(() => {
    if (globeRef.current) {
      const layerManager = globeRef.current.layerManager
      const satelliteLayer = layerManager.getLayer("satellite")
      if (satelliteLayer && "stopTracking" in satelliteLayer) {
        (satelliteLayer as any).stopTracking()
      }
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
