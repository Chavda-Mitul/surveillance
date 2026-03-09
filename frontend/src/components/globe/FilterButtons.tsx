import type { SatelliteFilter } from "./types"
import { SATELLITE_FILTERS } from "./constants"
import { styles } from "./styles"
import { Dropdown } from "./Dropdown"
import type { DropdownOption } from "./Dropdown"

interface FilterButtonsProps {
  currentFilter: SatelliteFilter
  onFilterChange: (filter: SatelliteFilter) => void
  onStopTracking: () => void
}

// Create dropdown options from SATELLITE_FILTERS
const filterOptions: DropdownOption<SatelliteFilter>[] = SATELLITE_FILTERS.map((f) => ({
  value: f,
  label: f,
}))

export function SatelliteControls({ currentFilter, onFilterChange, onStopTracking }: FilterButtonsProps) {
  return (
    <div style={styles.controlsPanel}>
      <Dropdown
        options={filterOptions}
        value={currentFilter}
        onChange={onFilterChange}
        label="Satellite Type"
        style={styles.dropdown}
      />
      <button onClick={onStopTracking} style={styles.stopButton}>
        Stop Tracking
      </button>
    </div>
  )
}
