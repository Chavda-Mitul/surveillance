import { type ReactNode } from "react"
import type { CSSProperties } from "react"
import { Sidebar } from "./sidebar"
import { SatellitePanel } from "./panels"
import type { AppMode } from "./modes"
import type { SatelliteFilter } from "../components/globe/types"

interface UIProviderProps {
  children: ReactNode
  activeMode: AppMode
  onModeChange: (mode: AppMode) => void
  satelliteFilter: SatelliteFilter
  onFilterChange: (filter: SatelliteFilter) => void
  onStopTracking: () => void
}

/**
 * UI Layout component
 * Renders sidebar and mode-specific panels
 */
export function UIProvider({
  children,
  activeMode,
  onModeChange,
  satelliteFilter,
  onFilterChange,
  onStopTracking,
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
