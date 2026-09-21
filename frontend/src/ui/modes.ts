/**
 * Application mode types
 * Each mode represents a different visualization layer
 */
export type AppMode = "satellite" | "vessel" | "flight" | "cctv" | "military" | "traffic" | "query"

export interface ModeConfig {
  id: AppMode
  label: string
  icon: string
  description: string
}

/**
 * Available application modes
 * Satellite is the only active mode for now; others are placeholders
 */
export const APP_MODES: ModeConfig[] = [
  {
    id: "satellite",
    label: "Satellite",
    icon: "🛰️",
    description: "View satellite orbits and positions",
  },
  // Commented out: vessel mode (Ship traffic)
  // {
  //   id: "vessel",
  //   label: "Ships",
  //   icon: "🚢",
  //   description: "View real-time AIS vessel positions",
  // },
  // Commented out: flight mode (Flight traffic)
  {
    id: "flight",
    label: "Flights",
    icon: "✈️",
    description: "View real-time flight data",
  },
  // Commented out: cctv mode
  // {
  //   id: "cctv",
  //   label: "CCTV",
  //   icon: "📹",
  //   description: "View CCTV camera locations",
  // },
  // Commented out: military mode
  // {
  //   id: "military",
  //   label: "Military",
  //   icon: "🎯",
  //   description: "View military installations",
  // },
  // Commented out: traffic mode
  // {
  //   id: "traffic",
  //   label: "Traffic",
  //   icon: "🚗",
  //   description: "View traffic data",
  // },
  {
    id: "query",
    label: "God's Eye",
    icon: "🎯",
    description: "Natural language spatial querying",
  },
]

/**
 * Get mode config by ID
 */
export function getModeConfig(modeId: AppMode): ModeConfig | undefined {
  return APP_MODES.find((mode) => mode.id === modeId)
}
