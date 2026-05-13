import { type ReactNode } from "react"
import type { CSSProperties } from "react"
import { Sidebar } from "./sidebar"
import { SatellitePanel, VesselPanel } from "./panels"
import type { AppMode } from "./modes"
import type { SatelliteFilter } from "../components/globe/types"
import type { VesselFilter } from "../vessels/types"

interface UIProviderProps {
  children: ReactNode
  activeMode: AppMode
  onModeChange: (mode: AppMode) => void
  satelliteFilter: SatelliteFilter
  onFilterChange: (filter: SatelliteFilter) => void
  onStopTracking: () => void
  vesselFilter: VesselFilter
  onVesselFilterChange: (filter: VesselFilter) => void
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
