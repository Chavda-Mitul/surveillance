import { type ReactNode } from "react"
import type { CSSProperties } from "react"
import { Sidebar } from "./sidebar"
import { SatellitePanel, VesselPanel, FlightPanel, QueryPanel } from "./panels"
import type { AppMode } from "./modes"
import type { SatelliteFilter } from "../components/globe/types"
import type { VesselFilter } from "../vessels/types"
import type { FlightFilter } from "../flights/types"
import type { QueryResult } from "../spatial/tools"

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
  return (
    <div style={layoutStyles.container}>
      <Sidebar activeMode={activeMode} onModeChange={onModeChange} />
      {activeMode === "satellite" && (
        <SatellitePanel
          currentFilter={satelliteFilter}
          onFilterChange={onFilterChange}
          onStopTracking={onStopTracking}
        />
      )}
      {activeMode === "vessel" && (
        <VesselPanel
          currentFilter={vesselFilter}
          onFilterChange={onVesselFilterChange}
        />
      )}
      {activeMode === "flight" && (
        <FlightPanel
          currentFilter={flightFilter}
          onFilterChange={onFlightFilterChange}
          onStopTracking={onStopTracking}
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
        />
      )}
      <div style={layoutStyles.main}>{children}</div>
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
    marginLeft: 200, // Sidebar width
    width: "calc(100vw - 200px)",
    height: "100vh",
  },
}