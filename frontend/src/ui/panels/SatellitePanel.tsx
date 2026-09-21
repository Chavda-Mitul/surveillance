import type { CSSProperties } from "react"
import type { SatelliteFilter } from "../../components/globe/types"
import { Dropdown } from "../../components/globe/Dropdown"
import { SATELLITE_FILTERS } from "../../components/globe/constants"

interface DropdownOption<T> {
  value: T
  label: string
}

interface SatellitePanelProps {
  currentFilter: SatelliteFilter
  onFilterChange: (filter: SatelliteFilter) => void
  onStopTracking: () => void
  isMobile?: boolean
  onClose?: () => void
}

/**
 * Satellite mode panel
 * Contains filter dropdown and tracking controls
 * Shown when satellite mode is active
 */
export function SatellitePanel({
  currentFilter,
  onFilterChange,
  onStopTracking,
  isMobile,
  onClose,
}: SatellitePanelProps) {
  const filterOptions: DropdownOption<SatelliteFilter>[] = SATELLITE_FILTERS.map((f) => ({
    value: f,
    label: f,
  }))

  return (
    <div style={isMobile ? mobileStyles.container : panelStyles.container}>
      <div style={panelStyles.header}>
        <h2 style={panelStyles.title}>Satellite Filters</h2>
        {isMobile && onClose && (
          <button onClick={onClose} style={panelStyles.closeBtn}>✕</button>
        )}
      </div>
      <div style={panelStyles.content}>
        <Dropdown
          options={filterOptions}
          value={currentFilter}
          onChange={onFilterChange}
          label="Satellite Type"
          style={panelStyles.dropdown}
        />
        <button onClick={onStopTracking} style={panelStyles.stopButton}>
          Stop Tracking
        </button>
      </div>
    </div>
  )
}

const panelStyles: Record<string, CSSProperties> = {
  container: {
    position: "absolute",
    top: 10,
    left: 220,
    zIndex: 1000,
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    borderRadius: 8,
    border: "1px solid #374151",
    minWidth: 250,
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #374151",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "#f9fafb",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  content: {
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  dropdown: {
    display: "flex",
    flexDirection: "column",
  },
  stopButton: {
    padding: "10px 16px",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    backgroundColor: "#ef4444",
    color: "white",
    fontSize: 14,
    fontWeight: 500,
    transition: "background-color 0.2s ease",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#9ca3af",
    fontSize: 16,
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: 4,
  },
}

const mobileStyles: Record<string, CSSProperties> = {
  container: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    zIndex: 1000,
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    borderRadius: 8,
    border: "1px solid #374151",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
  },
}