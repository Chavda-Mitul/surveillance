/**
 * Application mode types
 * Each mode represents a different visualization layer
 */
export type AppMode = "satellite" | "flight" | "cctv" | "military" | "traffic"

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
  {
    id: "flight",
    label: "Flights",
    icon: "✈️",
    description: "View real-time flight data",
  },
  {
    id: "cctv",
    label: "CCTV",
    icon: "📹",
    description: "View CCTV camera locations",
  },
  {
    id: "military",
    label: "Military",
    icon: "🎯",
    description: "View military installations",
  },
  {
    id: "traffic",
    label: "Traffic",
    icon: "🚗",
    description: "View traffic data",
  },
]

/**
 * Get mode config by ID
 */
export function getModeConfig(modeId: AppMode): ModeConfig | undefined {
  return APP_MODES.find((mode) => mode.id === modeId)
}
