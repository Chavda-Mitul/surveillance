import { useState, type CSSProperties } from "react"
import { ModeButton } from "./ModeButton"
import { APP_MODES, type AppMode } from "../modes"

interface SidebarProps {
  activeMode: AppMode
  onModeChange: (mode: AppMode) => void
  isMobile: boolean
}

/**
 * Left sidebar navigation (desktop) or hamburger + drawer (mobile)
 */
export function Sidebar({ activeMode, onModeChange, isMobile }: SidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  if (isMobile) {
    const handleModeSelect = (mode: AppMode) => {
      onModeChange(mode)
      setDrawerOpen(false)
    }

    return (
      <>
        {/* Hamburger button */}
        <button
          style={hamburgerStyles.button}
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="Open menu"
        >
          {drawerOpen ? "✕" : "☰"}
        </button>

        {/* Overlay backdrop */}
        {drawerOpen && (
          <div
            style={hamburgerStyles.backdrop}
            onClick={() => setDrawerOpen(false)}
          />
        )}

        {/* Drawer */}
        <nav
          style={{
            ...hamburgerStyles.drawer,
            transform: drawerOpen ? "translateY(0)" : "translateY(100%)",
            opacity: drawerOpen ? 1 : 0,
          }}
        >
          <div style={hamburgerStyles.drawerHeader}>
            <h2 style={hamburgerStyles.drawerTitle}>Dashboard</h2>
            <button
              style={hamburgerStyles.closeBtn}
              onClick={() => setDrawerOpen(false)}
            >
              ✕
            </button>
          </div>
          <div style={hamburgerStyles.list}>
            {APP_MODES.map((mode) => (
              <button
                key={mode.id}
                style={{
                  ...hamburgerStyles.listItem,
                  ...(activeMode === mode.id ? hamburgerStyles.listItemActive : {}),
                }}
                onClick={() => handleModeSelect(mode.id)}
              >
                <span style={hamburgerStyles.listIcon}>{mode.icon}</span>
                <div style={hamburgerStyles.listText}>
                  <span style={hamburgerStyles.listLabel}>{mode.label}</span>
                  <span style={hamburgerStyles.listDesc}>{mode.description}</span>
                </div>
                {activeMode === mode.id && (
                  <span style={hamburgerStyles.checkmark}>✓</span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </>
    )
  }

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

const hamburgerStyles: Record<string, CSSProperties> = {
  button: {
    position: "fixed",
    top: 10,
    left: 10,
    zIndex: 1100,
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #374151",
    borderRadius: 8,
    backgroundColor: "rgba(17, 24, 39, 0.9)",
    color: "#f9fafb",
    fontSize: 20,
    cursor: "pointer",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 1099,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  drawer: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1100,
    maxHeight: "70vh",
    backgroundColor: "#111827",
    borderTop: "1px solid #374151",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    transition: "transform 0.3s ease, opacity 0.25s ease",
  },
  drawerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px 12px",
    borderBottom: "1px solid #374151",
  },
  drawerTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "#f9fafb",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#9ca3af",
    fontSize: 20,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 4,
  },
  list: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 12px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  listItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "14px 16px",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    backgroundColor: "transparent",
    color: "#9ca3af",
    fontSize: 15,
    fontWeight: 500,
    textAlign: "left" as const,
    transition: "all 0.15s ease",
  },
  listItemActive: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    color: "#60a5fa",
  },
  listIcon: {
    fontSize: 24,
    width: 32,
    textAlign: "center" as const,
    flexShrink: 0,
  },
  listText: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  listLabel: {
    fontSize: 15,
    fontWeight: 600,
  },
  listDesc: {
    fontSize: 12,
    color: "#6b7280",
  },
  checkmark: {
    color: "#3b82f6",
    fontSize: 18,
    fontWeight: 700,
  },
}