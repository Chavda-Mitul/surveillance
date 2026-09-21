import type { CSSProperties } from "react"
import type { Vessel } from "../vessels/types"
import { classifyVessel } from "../app/layers/vessel/vesselTypes"

interface VesselInfoPanelProps {
  vessel: Vessel
  onClose: () => void
}

/**
 * Floating info panel shown when a vessel is clicked on the globe
 */
export function VesselInfoPanel({ vessel, onClose }: VesselInfoPanelProps) {
  const speedKnots = (vessel.speed * 1.94384).toFixed(1)
  const speedKmh = (vessel.speed * 1.852).toFixed(0)
  const vesselCategory = classifyVessel(vessel.vesselType)

  const typeLabels: Record<string, string> = {
    cargo: "Cargo",
    tanker: "Tanker",
    passenger: "Passenger",
    fishing: "Fishing Vessel",
    other: "Other",
  }

  return (
    <div style={panelStyles.overlay} onClick={onClose}>
      <div style={panelStyles.container} onClick={(e) => e.stopPropagation()}>
        <div style={panelStyles.header}>
          <h3 style={panelStyles.name}>
            {vessel.name || "Unknown Vessel"}
          </h3>
          <button style={panelStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={panelStyles.body}>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>MMSI</span>
            <span style={panelStyles.value}>{vessel.mmsi}</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Type</span>
            <span style={panelStyles.value}>{typeLabels[vesselCategory] || "Unknown"} ({vessel.vesselType})</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Speed</span>
            <span style={panelStyles.value}>{speedKnots} kt ({speedKmh} km/h)</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Course</span>
            <span style={panelStyles.value}>{vessel.course.toFixed(1)}°</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Position</span>
            <span style={panelStyles.value}>
              {vessel.lat.toFixed(4)}°, {vessel.lon.toFixed(4)}°
            </span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Last Updated</span>
            <span style={panelStyles.value}>
              {new Date(vessel.updatedAt * 1000).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

const panelStyles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    cursor: "default",
  },
  container: {
    position: "absolute",
    top: 60,
    right: 24,
    width: 320,
    backgroundColor: "rgba(17, 24, 39, 0.97)",
    borderRadius: 10,
    border: "1px solid #4b5563",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 18px",
    borderBottom: "1px solid #374151",
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  name: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "#f9fafb",
    letterSpacing: "0.5px",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#9ca3af",
    fontSize: 20,
    cursor: "pointer",
    padding: "0 4px",
    lineHeight: 1,
  },
  body: {
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 0",
  },
  label: {
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: 500,
    textTransform: "uppercase" as const,
    letterSpacing: "0.3px",
  },
  value: {
    color: "#f3f4f6",
    fontSize: 13,
    fontWeight: 400,
    fontFamily: "monospace",
  },
}