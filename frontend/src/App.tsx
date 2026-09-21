import { useState, useCallback, useRef, useEffect } from "react"
import * as Cesium from "cesium"
import { UIProvider } from "./ui/UIProvider"
import Globe, { type GlobeRef } from "./components/Globe"
import { useSatellites } from "./satellites/useSatellites"
import { useVessels } from "./vessels/useVessels"
import { useFlights } from "./flights/useFlights"
import { useSpatialQuery } from "./spatial/useSpatialQuery"
import type { AppMode } from "./ui/modes"
import type { SatelliteFilter } from "./components/globe/types"
import type { VesselFilter, Vessel } from "./vessels/types"
import type { FlightFilter, Flight } from "./flights/types"
import type { SatelliteData } from "./app/layers/satellite/satelliteTypes"
import { hasLoadData, hasStopTracking } from "./app/layers/satellite/types.guard"
import type { SpatialAction } from "./spatial/tools"
import { FLIGHT_INFO_EVENT } from "./app/layers/flight/FlightLayer"
import { FlightInfoPanel } from "./ui/FlightInfoPanel"
import { VESSEL_INFO_EVENT } from "./app/layers/vessel/VesselLayer"
import { VesselInfoPanel } from "./ui/VesselInfoPanel"

/**
 * Main application component
 * Manages top-level state and coordinates between UI and visualization layers
 */
function App() {
  const [activeMode, setActiveMode] = useState<AppMode>("satellite")
  const [satelliteFilter, setSatelliteFilter] = useState<SatelliteFilter>("gps")
  const [vesselFilter, setVesselFilter] = useState<VesselFilter>("all")
  const [flightFilter, setFlightFilter] = useState<FlightFilter>("all")
  const globeRef = useRef<GlobeRef>(null)

  const { data: satellites } = useSatellites(
    activeMode === "satellite" || activeMode === "query"
  )
  const { data: vessels } = useVessels(
    activeMode === "vessel"
  )
  const { data: flights } = useFlights(
    activeMode === "flight" || activeMode === "query"
  )

  /** Selected flight for info popup */
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null)

  /** Selected vessel for info popup */
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null)

  /** Listen for flight info requests from the Cesium layer */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Flight
      setSelectedFlight(detail)
    }
    window.addEventListener(FLIGHT_INFO_EVENT, handler)
    return () => window.removeEventListener(FLIGHT_INFO_EVENT, handler)
  }, [])

  /** Listen for vessel info requests from the Cesium layer */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Vessel
      setSelectedVessel(detail)
    }
    window.addEventListener(VESSEL_INFO_EVENT, handler)
    return () => window.removeEventListener(VESSEL_INFO_EVENT, handler)
  }, [])

  /** Track whether flights have been initially loaded */
  const flightsLoadedRef = useRef(false)
  /** Track whether vessels have been initially loaded */
  const vesselsLoadedRef = useRef(false)

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
            globe.layerManager.disable("flight")
            setActiveMode("satellite")
            setSatelliteFilter(filter as SatelliteFilter)
          } else if (layer === "flight") {
            globe.layerManager.enable("flight")
            globe.layerManager.disable("satellite")
            globe.layerManager.disable("vessel")
            setActiveMode("flight")
            setFlightFilter(filter as FlightFilter)
          }
          break
        }

        case "switchMode": {
          const { mode } = action.payload
          setActiveMode(mode as AppMode)
          const lm = globe.layerManager
          if (mode === "satellite") {
            lm.enable("satellite")
            lm.disable("vessel")
            lm.disable("flight")
          } else if (mode === "flight") {
            lm.enable("flight")
            lm.disable("satellite")
            lm.disable("vessel")
          }
          break
        }

        case "trackEntity": {
          const { layer, identifier } = action.payload
          const lm = globe.layerManager
          if (layer === "satellite") {
            lm.enable("satellite")
            lm.disable("vessel")
            lm.disable("flight")
            setActiveMode("satellite")
            globe.trackSatellite(identifier)
          } else if (layer === "flight") {
            lm.enable("flight")
            lm.disable("satellite")
            lm.disable("vessel")
            setActiveMode("flight")
            globe.trackFlight(identifier)
          }
          break
        }

        case "showInfo": {
          console.info("[God's Eye]", action.payload.message)
          break
        }

        case "answerQuery": {
          console.info("[God's Eye Answer]", action.payload.message)
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
   * Load satellite data
   */
  useEffect(() => {
    if ((activeMode !== "satellite" && activeMode !== "query") || !satellites || !globeRef.current) {
      return
    }

    const layerManager = globeRef.current.layerManager

    if (activeMode === "satellite") {
      layerManager.enable("satellite")
    }

    const satelliteLayer = layerManager.getLayer("satellite")
    if (satelliteLayer && hasLoadData(satelliteLayer)) {
      satelliteLayer.loadData(satellites as SatelliteData[])
    }
  }, [activeMode, satellites])

  /**
   * Load / refresh vessel data
   * First call uses loadData() to render entities;
   * subsequent calls use refreshPositions() for in-place updates (preserves trails)
   */
  useEffect(() => {
    if ((activeMode !== "vessel" && activeMode !== "query") || !vessels || !globeRef.current) return

    const layerManager = globeRef.current.layerManager

    if (activeMode === "vessel") {
      layerManager.enable("vessel")
    }

    const vesselLayer = layerManager.getLayer("vessel")
    if (!vesselLayer) return

    if (!vesselsLoadedRef.current) {
      // First load: render all entities
      if (hasLoadData(vesselLayer)) {
        vesselLayer.loadData(vessels as Vessel[])
      }
      vesselsLoadedRef.current = true
    } else {
      // Subsequent updates: refresh positions in-place (preserves trails)
      const vl = vesselLayer as any
      if (typeof vl.refreshPositions === "function") {
        vl.refreshPositions(vessels as Vessel[])
      }
    }
  }, [activeMode, vessels])

  /**
   * Load / refresh flight data
   * First call uses loadData() to render entities;
   * subsequent calls use refreshPositions() for in-place updates (preserves trails)
   */
  useEffect(() => {
    if ((activeMode !== "flight" && activeMode !== "query") || !flights || !globeRef.current) return

    const layerManager = globeRef.current.layerManager

    if (activeMode === "flight") {
      layerManager.enable("flight")
    }

    const flightLayer = layerManager.getLayer("flight")
    if (!flightLayer) return

    if (!flightsLoadedRef.current) {
      // First load: render all entities
      if (hasLoadData(flightLayer)) {
        flightLayer.loadData(flights as Flight[])
      }
      flightsLoadedRef.current = true
    } else {
      // Subsequent updates: refresh positions in-place (preserves trails)
      const fl = flightLayer as any
      if (typeof fl.refreshPositions === "function") {
        fl.refreshPositions(flights as Flight[])
      }
    }
  }, [activeMode, flights])

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
      layerManager.disable("flight")
    } else if (mode === "vessel") {
      layerManager.enable("vessel")
      layerManager.disable("satellite")
      layerManager.disable("flight")
    } else if (mode === "flight") {
      layerManager.enable("flight")
      layerManager.disable("satellite")
      layerManager.disable("vessel")
    } else if (mode === "query") {
      // In query mode, keep current layer enabled
    } else {
      layerManager.disable("satellite")
      layerManager.disable("vessel")
      layerManager.disable("flight")
    }
  }, [])

  /**
   * Stop tracking current satellite or flight
   */
  const handleStopTracking = useCallback(() => {
    if (!globeRef.current) return

    const layerManager = globeRef.current.layerManager
    const satelliteLayer = layerManager.getLayer("satellite")

    if (satelliteLayer && hasStopTracking(satelliteLayer)) {
      satelliteLayer.stopTracking()
    }

    const flightLayer = layerManager.getLayer("flight")
    if (flightLayer && hasStopTracking(flightLayer)) {
      flightLayer.stopTracking()
    }

    // Zoom out from the current position so the user can navigate to other entities
    globeRef.current?.zoomOut()
  }, [])

  /**
   * Handle suggestion click from the query panel
   */
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      spatialQuery.setQuery(suggestion)
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
      flightFilter={flightFilter}
      onFlightFilterChange={setFlightFilter}
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
        flightFilter={flightFilter}
        onFilterChange={setSatelliteFilter}
        onStopTracking={handleStopTracking}
      />
      {selectedFlight && (
        <FlightInfoPanel
          flight={selectedFlight}
          onClose={() => {
            setSelectedFlight(null)
            handleStopTracking()
          }}
        />
      )}
      {selectedVessel && (
        <VesselInfoPanel
          vessel={selectedVessel}
          onClose={() => {
            setSelectedVessel(null)
            handleStopTracking()
          }}
        />
      )}
    </UIProvider>
  )
}

export default App