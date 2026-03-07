import type { SatelliteFilter } from "./types"
import { SATELLITE_FILTERS } from "./constants"
import { styles } from "./styles"

interface FilterButtonsProps {
  currentFilter: SatelliteFilter
  onFilterChange: (filter: SatelliteFilter) => void
  onStopTracking: () => void
}

export function FilterButtons({ currentFilter, onFilterChange, onStopTracking }: FilterButtonsProps) {
  return (
    <div style={styles.controlsPanel}>
      {SATELLITE_FILTERS.map((f) => (
        <button
          key={f}
          onClick={() => onFilterChange(f)}
          style={styles.filterButton(currentFilter === f)}
        >
          {f}
        </button>
      ))}
      <button onClick={onStopTracking} style={styles.stopButton}>
        Stop Tracking
      </button>
    </div>
  )
}
