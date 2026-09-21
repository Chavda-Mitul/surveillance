import type { CSSProperties } from "react"
import type { Flight } from "../flights/types"
import { useMediaQuery } from "../hooks/useMediaQuery"

interface FlightInfoPanelProps {
  flight: Flight
  onClose: () => void
}

/**
 * Floating info panel shown when a flight is clicked on the globe
 */
export function FlightInfoPanel({ flight, onClose }: FlightInfoPanelProps) {
  const isMobile = useMediaQuery()
  const altitudeKm = ((flight.baroAltitude || flight.geoAltitude || 0) / 1000).toFixed(1)
  const speedKnots = (flight.velocity * 1.94384).toFixed(0)
  const speedKmh = (flight.velocity * 3.6).toFixed(0)

  const styles = isMobile ? mobileStyles : panelStyles

  return (
    <div style={panelStyles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={(e) => e.stopPropagation()}>
        <div style={panelStyles.header}>
          <h3 style={panelStyles.callsign}>
            {flight.callsign || "Unknown"}
          </h3>
          <button style={panelStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={panelStyles.body}>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>ICAO24</span>
            <span style={panelStyles.value}>{flight.icao24}</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Country</span>
            <span style={panelStyles.value}>{flight.originCountry}</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Altitude</span>
            <span style={panelStyles.value}>{altitudeKm} km</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Speed</span>
            <span style={panelStyles.value}>{speedKnots} kt ({speedKmh} km/h)</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Heading</span>
            <span style={panelStyles.value}>{flight.heading.toFixed(1)}°</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Vert. Rate</span>
            <span style={panelStyles.value}>{flight.verticalRate.toFixed(1)} m/s</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Position</span>
            <span style={panelStyles.value}>
              {flight.latitude.toFixed(4)}°, {flight.longitude.toFixed(4)}°
            </span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>On Ground</span>
            <span style={panelStyles.value}>{flight.onGround ? "Yes" : "No"}</span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Last Contact</span>
            <span style={panelStyles.value}>
              {new Date(flight.lastContact * 1000).toLocaleTimeString()}
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
  callsign: {
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

const mobileStyles: Record<string, CSSProperties> = {
  container: {
    position: "absolute",
    top: "50%",
    left: 8,
    right: 8,
    maxHeight: "70vh",
    transform: "translateY(-50%)",
    backgroundColor: "rgba(17, 24, 39, 0.97)",
    borderRadius: 10,
    border: "1px solid #4b5563",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
    overflow: "hidden",
  },
}