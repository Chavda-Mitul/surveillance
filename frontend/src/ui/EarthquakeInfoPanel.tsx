import type { CSSProperties } from "react"
import type { EarthquakeEvent } from "../earthquakes/types"

interface EarthquakeInfoPanelProps {
  event: EarthquakeEvent
  onClose: () => void
}

/**
 * Info overlay panel for an earthquake event, shown on click.
 */
export function EarthquakeInfoPanel({ event, onClose }: EarthquakeInfoPanelProps) {
  const date = new Date(event.time)
  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  })
  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  })

  const severityColor =
    event.magnitude >= 5.0 ? "#ef4444" :
    event.magnitude >= 3.0 ? "#f97316" :
    "#facc15"

  return (
    <div style={panelStyles.overlay}>
      <div style={panelStyles.container}>
        <div style={panelStyles.header}>
          <h3 style={panelStyles.title}>
            <span style={{ ...panelStyles.badge, backgroundColor: severityColor }}>
              M{event.magnitude.toFixed(1)}
            </span>
            Earthquake Event
          </h3>
          <button style={panelStyles.closeBtn} onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div style={panelStyles.body}>
          <InfoRow label="Location" value={event.place} />
          <InfoRow label="Depth" value={`${event.depthKm.toFixed(1)} km`} />
          <InfoRow label="Coordinates" value={`${event.latitude.toFixed(4)}°N, ${event.longitude.toFixed(4)}°E`} />
          <InfoRow label="Date" value={formattedDate} />
          <InfoRow label="Time (UTC)" value={formattedTime} />
          <InfoRow label="Event ID" value={event.id} mono />
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={panelStyles.row}>
      <span style={panelStyles.label}>{label}</span>
      <span style={{ ...panelStyles.value, ...(mono ? { fontFamily: "monospace", fontSize: 11 } : {}) }}>
        {value}
      </span>
    </div>
  )
}

const panelStyles: Record<string, CSSProperties> = {
  overlay: {
    position: "absolute",
    bottom: 24,
    right: 24,
    zIndex: 2000,
    pointerEvents: "auto",
  },
  container: {
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    border: "1px solid #374151",
    borderRadius: 8,
    minWidth: 300,
    maxWidth: 400,
    boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #374151",
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "#f9fafb",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    color: "#000",
    fontSize: 12,
    fontWeight: 700,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: 16,
    padding: "4px 8px",
    borderRadius: 4,
  },
  body: {
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  label: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: 500,
    flexShrink: 0,
  },
  value: {
    fontSize: 12,
    color: "#f9fafb",
    textAlign: "right" as const,
    wordBreak: "break-word" as const,
  },
}