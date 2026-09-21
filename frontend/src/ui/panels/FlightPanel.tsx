import type { CSSProperties } from "react"
import type { FlightFilter } from "../../flights/types"
import { Dropdown } from "../../components/globe/Dropdown"
import { FLIGHT_FILTERS } from "../../app/layers/flight/constants"

interface FlightPanelProps {
  currentFilter: FlightFilter
  onFilterChange: (filter: FlightFilter) => void
}

export function FlightPanel({ currentFilter, onFilterChange }: FlightPanelProps) {
  const filterOptions = FLIGHT_FILTERS.map((f) => ({ value: f, label: f }))

  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.header}>
        <h2 style={panelStyles.title}>Flight Filters</h2>
      </div>
      <div style={panelStyles.content}>
        <Dropdown
          options={filterOptions}
          value={currentFilter}
          onChange={onFilterChange}
          label="Aircraft Type"
          style={panelStyles.dropdown}
        />
        <div style={panelStyles.infoBox}>
          <div style={panelStyles.legend}>
            <span style={{ ...panelStyles.dot, backgroundColor: "#3b82f6" }} />
            <span style={panelStyles.legendLabel}>Commercial</span>
          </div>
          <div style={panelStyles.legend}>
            <span style={{ ...panelStyles.dot, backgroundColor: "#f59e0b" }} />
            <span style={panelStyles.legendLabel}>Cargo</span>
          </div>
          <div style={panelStyles.legend}>
            <span style={{ ...panelStyles.dot, backgroundColor: "#10b981" }} />
            <span style={panelStyles.legendLabel}>Private</span>
          </div>
          <div style={panelStyles.legend}>
            <span style={{ ...panelStyles.dot, backgroundColor: "#ef4444" }} />
            <span style={panelStyles.legendLabel}>Military</span>
          </div>
        </div>
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
    minWidth: 220,
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #374151",
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
  infoBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 8,
    borderRadius: 4,
    backgroundColor: "rgba(55, 65, 81, 0.3)",
  },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    display: "inline-block",
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: 12,
    color: "#d1d5db",
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
}