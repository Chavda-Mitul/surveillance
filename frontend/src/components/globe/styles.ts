import type { CSSProperties } from "react"

export const styles = {
  container: {
    position: "relative",
    width: "100vw",
    height: "100vh",
  } as CSSProperties,

  controlsPanel: {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 1000,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    maxWidth: 400,
  } as CSSProperties,

  filterButton: (isActive: boolean): CSSProperties => ({
    padding: "8px 16px",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontWeight: isActive ? "bold" : "normal",
    backgroundColor: isActive ? "#4CAF50" : "#333",
    color: "white",
    textTransform: "capitalize",
  }),

  stopButton: {
    padding: "8px 16px",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    backgroundColor: "#f44336",
    color: "white",
  } as CSSProperties,

  helpPanel: {
    position: "absolute",
    bottom: 10,
    left: 10,
    zIndex: 1000,
    backgroundColor: "rgba(0,0,0,0.7)",
    color: "white",
    padding: 10,
    borderRadius: 4,
    fontSize: 12,
  } as CSSProperties,

  globe: {
    width: "100%",
    height: "100%",
  } as CSSProperties,
}
