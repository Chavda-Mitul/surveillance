import type { CSSProperties } from "react"
import type { VesselFilter } from "../../vessels/types"
import { Dropdown } from "../../components/globe/Dropdown"
import { VESSEL_FILTERS } from "../../app/layers/vessel/constants"

interface VesselPanelProps {
  currentFilter: VesselFilter
  onFilterChange: (filter: VesselFilter) => void
}

export function VesselPanel({ currentFilter, onFilterChange }: VesselPanelProps) {
  const filterOptions = VESSEL_FILTERS.map((f) => ({ value: f, label: f }))

  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.header}>
        <h2 style={panelStyles.title}>Ship Filters</h2>
      </div>
      <div style={panelStyles.content}>
        <Dropdown
          options={filterOptions}
          value={currentFilter}
          onChange={onFilterChange}
          label="Vessel Type"
          style={panelStyles.dropdown}
        />
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
}
