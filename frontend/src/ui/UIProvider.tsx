import { type ReactNode } from "react"
import type { CSSProperties } from "react"
import { Sidebar } from "./sidebar"
import { SatellitePanel, VesselPanel, FlightPanel, EarthquakePanel, QueryPanel } from "./panels"
import type { AppMode } from "./modes"
import type { SatelliteFilter } from "../components/globe/types"
import type { VesselFilter } from "../vessels/types"
import type { FlightFilter } from "../flights/types"
import type { EarthquakeFilter } from "../app/layers/earthquake/earthquakeTypes"
import type { QueryResult } from "../spatial/tools"
import { useMediaQuery } from "../hooks/useMediaQuery"

const SIDEBAR_WIDTH = 200
const SIDEBAR_HEIGHT_MOBILE = 60

interface UIProviderProps {
  children: ReactNode
  activeMode: AppMode
  onModeChange: (mode: AppMode) => void
  satelliteFilter: SatelliteFilter
  onFilterChange: (filter: SatelliteFilter) => void
  onStopTracking: () => void
  vesselFilter: VesselFilter
  onVesselFilterChange: (filter: VesselFilter) => void
  flightFilter: FlightFilter
  onFlightFilterChange: (filter: FlightFilter) => void
  // Earthquake props
  earthquakeFilter: EarthquakeFilter
  onEarthquakeFilterChange: (filter: EarthquakeFilter) => void
  // Spatial query props
  query: string
  onQueryChange: (query: string) => void
  onQuerySubmit: () => void
  isQueryProcessing: boolean
  queryResponse: string
  queryError: string | null
  queryLastResult: QueryResult | null
  onQueryClear: () => void
  onQuerySuggestionClick: (suggestion: string) => void
}

export function UIProvider({
  children,
  activeMode,
  onModeChange,
  satelliteFilter,
  onFilterChange,
  onStopTracking,
  vesselFilter,
  onVesselFilterChange,
  flightFilter,
  onFlightFilterChange,
  earthquakeFilter,
  onEarthquakeFilterChange,
  query,
  onQueryChange,
  onQuerySubmit,
  isQueryProcessing,
  queryResponse,
  queryError,
  queryLastResult,
  onQueryClear,
  onQuerySuggestionClick,
}: UIProviderProps) {
  const isMobile = useMediaQuery()
  const sidebarWidth = isMobile ? 0 : SIDEBAR_WIDTH

  return (
    <div style={layoutStyles.container}>
      <Sidebar activeMode={activeMode} onModeChange={onModeChange} isMobile={isMobile} />
      {activeMode === "satellite" && (
        <SatellitePanel
          currentFilter={satelliteFilter}
          onFilterChange={onFilterChange}
          onStopTracking={onStopTracking}
          isMobile={isMobile}
        />
      )}
      {activeMode === "vessel" && (
        <VesselPanel
          currentFilter={vesselFilter}
          onFilterChange={onVesselFilterChange}
          isMobile={isMobile}
        />
      )}
      {activeMode === "flight" && (
        <FlightPanel
          currentFilter={flightFilter}
          onFilterChange={onFlightFilterChange}
          onStopTracking={onStopTracking}
          isMobile={isMobile}
        />
      )}
      {activeMode === "earthquake" && (
        <EarthquakePanel
          currentFilter={earthquakeFilter}
          onFilterChange={onEarthquakeFilterChange}
          isMobile={isMobile}
        />
      )}
      {activeMode === "query" && (
        <QueryPanel
          query={query}
          onQueryChange={onQueryChange}
          onSubmit={onQuerySubmit}
          isProcessing={isQueryProcessing}
          response={queryResponse}
          error={queryError}
          lastResult={queryLastResult}
          onClear={onQueryClear}
          onSuggestionClick={onQuerySuggestionClick}
          isMobile={isMobile}
        />
      )}
      <div style={{
        ...layoutStyles.main,
        marginLeft: sidebarWidth,
        width: `calc(100vw - ${sidebarWidth}px)`,
        height: isMobile ? `calc(100vh - ${SIDEBAR_HEIGHT_MOBILE}px)` : "100vh",
      }}>{children}</div>
    </div>
  )
}

const layoutStyles: Record<string, CSSProperties> = {
  container: {
    position: "relative",
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
  },
  main: {
    transition: "margin-left 0.3s ease, width 0.3s ease",
  },
}