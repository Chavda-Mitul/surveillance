import type { CSSProperties } from "react"
import { ModeButton } from "./ModeButton"
import { APP_MODES, type AppMode } from "../modes"

interface SidebarProps {
  activeMode: AppMode
  onModeChange: (mode: AppMode) => void
}

/**
 * Left sidebar navigation component
 * Displays mode buttons for switching between visualization types
 */
export function Sidebar({ activeMode, onModeChange }: SidebarProps) {
  return (
    <aside style={sidebarStyles.container}>
      <div style={sidebarStyles.header}>
        <h1 style={sidebarStyles.title}>Dashboard</h1>
      </div>
      <nav style={sidebarStyles.nav}>
        {APP_MODES.map((mode) => (
          <ModeButton
            key={mode.id}
            mode={mode.id}
            label={mode.label}
            icon={mode.icon}
            isActive={activeMode === mode.id}
            onClick={() => onModeChange(mode.id)}
          />
        ))}
      </nav>
    </aside>
  )
}

const sidebarStyles: Record<string, CSSProperties> = {
  container: {
    position: "fixed",
    left: 0,
    top: 0,
    bottom: 0,
    width: 200,
    backgroundColor: "#111827",
    borderRight: "1px solid #374151",
    display: "flex",
    flexDirection: "column",
    zIndex: 1000,
  },
  header: {
    padding: "20px 16px",
    borderBottom: "1px solid #374151",
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "#f9fafb",
  },
  nav: {
    flex: 1,
    padding: "12px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    overflowY: "auto" as const,
  },
}
