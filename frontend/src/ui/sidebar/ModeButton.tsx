import type { CSSProperties } from "react"
import type { AppMode } from "../modes"

interface ModeButtonProps {
  mode: AppMode
  label: string
  icon: string
  isActive: boolean
  onClick: () => void
  isMobile?: boolean
}

/**
 * Reusable button component for sidebar mode navigation
 * Compact on mobile (icon-only, smaller)
 */
export function ModeButton({ label, icon, isActive, onClick, isMobile }: ModeButtonProps) {
  if (isMobile) {
    return (
      <button
        onClick={onClick}
        style={{
          ...mobileStyles.base,
          ...(isActive ? mobileStyles.active : mobileStyles.inactive),
        }}
        aria-pressed={isActive}
        title={label}
      >
        <span style={mobileStyles.icon}>{icon}</span>
        <span style={mobileStyles.label}>{label}</span>
      </button>
    )
  }

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

const mobileStyles: Record<string, CSSProperties> = {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    padding: "6px 4px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 500,
    flex: 1,
    maxWidth: 64,
    transition: "all 0.2s ease",
  },
  inactive: {
    backgroundColor: "transparent",
    color: "#6b7280",
  },
  active: {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    color: "#60a5fa",
  },
  icon: {
    fontSize: 20,
    lineHeight: 1.2,
  },
  label: {
    fontSize: 9,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 60,
    textAlign: "center" as const,
  },
}