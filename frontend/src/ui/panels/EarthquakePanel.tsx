import type { CSSProperties } from "react"
import { useIsFetching, useQuery } from "@tanstack/react-query"
import type { EarthquakeFilter } from "../../app/layers/earthquake/earthquakeTypes"
import { Dropdown } from "../../components/globe/Dropdown"
import { fetchEarthquakes } from "../../earthquakes/fetchEarthquakes"

interface EarthquakePanelProps {
  currentFilter: EarthquakeFilter
  onFilterChange: (filter: EarthquakeFilter) => void
  isMobile?: boolean
  onClose?: () => void
}

const FILTER_OPTIONS = [
  { value: "all" as EarthquakeFilter, label: "All M1.0+" },
  { value: "2.5" as EarthquakeFilter, label: "M2.5+" },
  { value: "4.5" as EarthquakeFilter, label: "M4.5+" },
  { value: "6.0" as EarthquakeFilter, label: "M6.0+" },
]

export function EarthquakePanel({ currentFilter, onFilterChange, isMobile, onClose }: EarthquakePanelProps) {
  // Track the earthquake query status so we can show loading/error feedback
  const isFetching = useIsFetching({ queryKey: ["earthquakes"] }) > 0
  const { error } = useQuery({ queryKey: ["earthquakes"], queryFn: fetchEarthquakes, enabled: false })

  return (
    <div style={isMobile ? mobileStyles.container : panelStyles.container}>
      <div style={panelStyles.header}>
        <h2 style={panelStyles.title}>
          <span style={panelStyles.icon}>🌋</span> Hazard Filters
        </h2>
        {isMobile && onClose && (
          <button onClick={onClose} style={panelStyles.closeBtn}>✕</button>
        )}
      </div>
      <div style={panelStyles.content}>
        <Dropdown
          options={FILTER_OPTIONS}
          value={currentFilter}
          onChange={onFilterChange}
          label="Min. Magnitude"
          style={panelStyles.dropdown}
        />
        <div style={panelStyles.infoBox}>
          <div style={panelStyles.legendRow}>
            <span style={{ ...panelStyles.dot, backgroundColor: "#facc15" }} />
            <span style={panelStyles.legendLabel}>M &lt; 3.0 (Minor)</span>
          </div>
          <div style={panelStyles.legendRow}>
            <span style={{ ...panelStyles.dot, backgroundColor: "#f97316" }} />
            <span style={panelStyles.legendLabel}>M 3.0–5.0 (Moderate)</span>
          </div>
          <div style={panelStyles.legendRow}>
            <span style={{ ...panelStyles.dot, backgroundColor: "#ef4444" }} />
            <span style={panelStyles.legendLabel}>M ≥ 5.0 (Strong)</span>
          </div>
        </div>
        <div style={panelStyles.statusRow}>
          {isFetching ? (
            <span style={panelStyles.loading}>⏳ Loading earthquake data…</span>
          ) : error ? (
            <span style={panelStyles.error}>⚠️ Failed to load data</span>
          ) : (
            <span style={panelStyles.ok}>✓ Data refreshing every 60s</span>
          )}
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
  icon: {
    marginRight: 6,
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
  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: 12,
    color: "#9ca3af",
  },
  statusRow: {
    fontSize: 11,
    textAlign: "center" as const,
    padding: "4px 0",
  },
  loading: {
    color: "#fbbf24",
  },
  error: {
    color: "#ef4444",
  },
  ok: {
    color: "#34d399",
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