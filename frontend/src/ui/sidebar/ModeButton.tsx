import type { CSSProperties } from "react"
import type { AppMode } from "../modes"

interface ModeButtonProps {
  mode: AppMode
  label: string
  icon: string
  isActive: boolean
  onClick: () => void
}

/**
 * Reusable button component for sidebar mode navigation
 */
export function ModeButton({ mode, label, icon, isActive, onClick }: ModeButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        ...buttonStyles.base,
        ...(isActive ? buttonStyles.active : buttonStyles.inactive),
      }}
      aria-pressed={isActive}
      title={label}
    >
      <span style={buttonStyles.icon}>{icon}</span>
      <span style={buttonStyles.label}>{label}</span>
    </button>
  )
}

const buttonStyles: Record<string, CSSProperties> = {
  base: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "12px 16px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    textAlign: "left" as const,
    transition: "all 0.2s ease",
  },
  inactive: {
    backgroundColor: "transparent",
    color: "#9ca3af",
  },
  active: {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    color: "#60a5fa",
    borderLeft: "3px solid #3b82f6",
  },
  icon: {
    fontSize: 18,
    width: 24,
    textAlign: "center" as const,
  },
  label: {
    flex: 1,
  },
}
