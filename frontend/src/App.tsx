import { useState, useCallback, useRef, useEffect } from "react"
import { UIProvider } from "./ui/UIProvider"
import Globe, { type GlobeRef } from "./components/Globe"
import { useSatellites } from "./satellites/useSatellites"
import { useVessels } from "./vessels/useVessels"
import { useSpatialQuery } from "./spatial/useSpatialQuery"
import type { AppMode } from "./ui/modes"
import type { SatelliteFilter } from "./components/globe/types"
import type { VesselFilter, Vessel } from "./vessels/types"
import type { SatelliteData } from "./app/layers/satellite/satelliteTypes"
import { hasLoadData, hasStopTracking } from "./app/layers/satellite/types.guard"
import type { SpatialAction } from "./spatial/tools"

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
   * Handle spatial query actions from the LLM
   */
  const handleSpatialActions = useCallback((actions: SpatialAction[]) => {
    const globe = globeRef.current
    if (!globe) return

    for (const action of actions) {
      switch (action.type) {
        case "flyTo": {
          const { latitude, longitude, altitude, name } = action.payload
          globe.flyTo(latitude, longitude, altitude, name)
          break
        }

        case "filterLayer": {
          const { layer, filter } = action.payload
          if (layer === "satellite") {
            globe.layerManager.enable("satellite")
            globe.layerManager.disable("vessel")
            setActiveMode("satellite")
            setSatelliteFilter(filter as SatelliteFilter)
          } else if (layer === "vessel") {
            globe.layerManager.enable("vessel")
            globe.layerManager.disable("satellite")
            setActiveMode("vessel")
            setVesselFilter(filter as VesselFilter)
          }
          break
        }

        case "switchMode": {
          const { mode } = action.payload
          setActiveMode(mode as AppMode)
          // Also manage layers like handleModeChange
          const lm = globe.layerManager
          if (mode === "satellite") {
            lm.enable("satellite")
            lm.disable("vessel")
          } else if (mode === "vessel") {
            lm.enable("vessel")
            lm.disable("satellite")
          }
          break
        }

        case "trackEntity": {
          const { layer, identifier } = action.payload
          const lm = globe.layerManager
          if (layer === "satellite") {
            lm.enable("satellite")
            lm.disable("vessel")
            setActiveMode("satellite")
            globe.trackSatellite(identifier)
          } else if (layer === "vessel") {
            lm.enable("vessel")
            lm.disable("satellite")
            setActiveMode("vessel")
            globe.trackVessel(identifier)
          }
          break
        }

        case "showInfo": {
          // Just log it; the info appears in the response box already
          console.info("[God's Eye]", action.payload.message)
          break
        }
      }
    }
  }, [])

  /**
   * Spatial query hook
   */
  const spatialQuery = useSpatialQuery({
    onActions: handleSpatialActions,
  })

  /**
   * Load satellite data when satellite or query mode
   */
  useEffect(() => {
    if ((activeMode !== "satellite" && activeMode !== "query") || !satellites || !globeRef.current) {
      return
    }

    const layerManager = globeRef.current.layerManager
    
    // Only enable if explicitly in satellite mode
    if (activeMode === "satellite") {
      layerManager.enable("satellite")
    }

    const satelliteLayer = layerManager.getLayer("satellite")
    if (satelliteLayer && hasLoadData(satelliteLayer)) {
      satelliteLayer.loadData(satellites as SatelliteData[])
    }
  }, [activeMode, satellites])

  /**
   * Load vessel data when vessel or query mode
   */
  useEffect(() => {
    if ((activeMode !== "vessel" && activeMode !== "query") || !vessels || !globeRef.current) return

    const layerManager = globeRef.current.layerManager
    
    // Only enable if explicitly in vessel mode
    if (activeMode === "vessel") {
      layerManager.enable("vessel")
    }

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
    } else if (mode === "query") {
      // In query mode, keep the current layer enabled
      // but allow LLM actions to switch between them
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

  /**
   * Handle suggestion click from the query panel
   */
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      spatialQuery.setQuery(suggestion)
      // Auto-submit after a short delay so the input updates visually
      setTimeout(() => {
        spatialQuery.submitQuery(suggestion)
      }, 50)
    },
    [spatialQuery]
  )

  return (
    <UIProvider
      activeMode={activeMode}
      onModeChange={handleModeChange}
      satelliteFilter={satelliteFilter}
      onFilterChange={setSatelliteFilter}
      onStopTracking={handleStopTracking}
      vesselFilter={vesselFilter}
      onVesselFilterChange={setVesselFilter}
      // Spatial query props
      query={spatialQuery.query}
      onQueryChange={spatialQuery.setQuery}
      onQuerySubmit={() => spatialQuery.submitQuery()}
      isQueryProcessing={spatialQuery.isProcessing}
      queryResponse={spatialQuery.response}
      queryError={spatialQuery.error}
      queryLastResult={spatialQuery.lastResult}
      onQueryClear={spatialQuery.clearConversation}
      onQuerySuggestionClick={handleSuggestionClick}
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