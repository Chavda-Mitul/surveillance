import { type CSSProperties, useState, useRef, useEffect } from "react"
import type { SpatialAction, QueryResult } from "../../spatial/tools"

interface QueryPanelProps {
  query: string
  onQueryChange: (query: string) => void
  onSubmit: () => void
  isProcessing: boolean
  response: string
  error: string | null
  lastResult: QueryResult | null
  onClear: () => void
  onSuggestionClick: (suggestion: string) => void
}

const SUGGESTIONS = [
  "Show cargo vessels near Gujarat coastline",
  "Track satellites passing over western India",
  "Show me tankers in the Arabian Sea",
  "Fly to Mumbai and show all vessels",
  "Switch to satellite view and filter by GPS",
  "Where is the ISS right now?",
  "When will I get a plane above my head? I am in Dindoli, Surat",
  "Are there any ships near Mumbai right now?",
  "What flights are over India?",
  "Show me the plane region of India",
]

export function QueryPanel({
  query,
  onQueryChange,
  onSubmit,
  isProcessing,
  response,
  error,
  lastResult,
  onClear,
  onSuggestionClick,
}: QueryPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showSuggestions, setShowSuggestions] = useState(true)

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
      setShowSuggestions(false)
    }
  }

  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.header}>
        <div style={panelStyles.headerLeft}>
          <span style={panelStyles.headerIcon}>🎯</span>
          <h2 style={panelStyles.title}>God's Eye Query</h2>
        </div>
        {(response || error) && (
          <button onClick={onClear} style={panelStyles.clearBtn} title="Clear conversation">
            ✕
          </button>
        )}
      </div>

      <div style={panelStyles.content}>
        {/* Input area */}
        <div style={panelStyles.inputGroup}>
          <input
            ref={inputRef}
            type="text"
            placeholder='Ask anything… e.g. "Show cargo ships near Gujarat"'
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value)
              setShowSuggestions(true)
            }}
            onKeyDown={handleKeyDown}
            style={panelStyles.input}
            disabled={isProcessing}
          />
          <button
            onClick={() => {
              onSubmit()
              setShowSuggestions(false)
            }}
            style={{
              ...panelStyles.submitBtn,
              ...(isProcessing || !query.trim() ? panelStyles.submitBtnDisabled : {}),
            }}
            disabled={isProcessing || !query.trim()}
          >
            {isProcessing ? (
              <span style={panelStyles.spinner}>⟳</span>
            ) : (
              "↵"
            )}
          </button>
        </div>

        {/* Suggestions */}
        {showSuggestions && !query && !response && !error && (
          <div style={panelStyles.suggestions}>
            <p style={panelStyles.suggestionsTitle}>Try asking:</p>
            {SUGGESTIONS.map((suggestion, i) => (
              <button
                key={i}
                style={panelStyles.suggestionChip}
                onClick={() => onSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Actions result indicator */}
        {lastResult && lastResult.actions.length > 0 && (
          <div style={panelStyles.actionsIndicator}>
            {lastResult.actions.map((action, i) => (
              <span key={i} style={panelStyles.actionBadge}>
                {actionIcon(action)} {actionLabel(action)}
              </span>
            ))}
          </div>
        )}

        {/* Response / Error */}
        {(response || error) && (
          <div
            style={{
              ...panelStyles.responseBox,
              ...(error ? panelStyles.responseError : {}),
            }}
          >
            <p style={panelStyles.responseText}>
              {error || response}
            </p>
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div style={panelStyles.processing}>
            <div style={panelStyles.waveLoader}>
              <span style={panelStyles.waveDot(0)} />
              <span style={panelStyles.waveDot(1)} />
              <span style={panelStyles.waveDot(2)} />
            </div>
            <span style={panelStyles.processingText}>Processing query…</span>
          </div>
        )}
      </div>
    </div>
  )
}

function actionIcon(action: SpatialAction): string {
  switch (action.type) {
    case "flyTo": return "📍"
    case "filterLayer": return "🔍"
    case "switchMode": return "🔄"
    case "trackEntity": return "🎯"
    case "showInfo": return "💬"
    case "answerQuery": return "📊"
  }
}

function actionLabel(action: SpatialAction): string {
  switch (action.type) {
    case "flyTo":
      return `Navigate to ${action.payload.name ?? `${action.payload.latitude.toFixed(2)}°, ${action.payload.longitude.toFixed(2)}°`}`
    case "filterLayer":
      return `Filter ${action.payload.layer}: ${action.payload.filter}`
    case "switchMode":
      return `Switch to ${action.payload.mode}`
    case "trackEntity":
      return `Track ${action.payload.identifier}`
    case "showInfo":
      return "Info"
    case "answerQuery":
      return "Answer"
  }
}

const panelStyles: Record<string, CSSProperties | ((...args: unknown[]) => CSSProperties)> = {
  container: {
    position: "absolute",
    top: 10,
    left: 220,
    zIndex: 1000,
    backgroundColor: "rgba(17, 24, 39, 0.96)",
    borderRadius: 8,
    border: "1px solid #374151",
    minWidth: 380,
    maxWidth: 480,
    maxHeight: "calc(100vh - 60px)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 20px rgba(0, 0, 0, 0.5)",
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #374151",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  headerIcon: {
    fontSize: 18,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "#f9fafb",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  clearBtn: {
    background: "none",
    border: "none",
    color: "#6b7280",
    cursor: "pointer",
    fontSize: 16,
    padding: "2px 6px",
    borderRadius: 4,
  },
  content: {
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflowY: "auto" as const,
  },
  inputGroup: {
    display: "flex",
    gap: 8,
    position: "relative" as const,
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #4b5563",
    backgroundColor: "#1f2937",
    color: "#f9fafb",
    outline: "none",
  },
  submitBtn: {
    padding: "10px 16px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 600,
    backgroundColor: "#3b82f6",
    color: "white",
    transition: "all 0.2s ease",
  },
  submitBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  spinner: {
    display: "inline-block",
    animation: "spin 1s linear infinite",
    fontSize: 18,
  },
  suggestions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  suggestionsTitle: {
    margin: 0,
    fontSize: 11,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: 2,
  },
  suggestionChip: {
    padding: "8px 12px",
    fontSize: 13,
    borderRadius: 6,
    border: "1px solid #374151",
    backgroundColor: "#1f2937",
    color: "#9ca3af",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.15s ease",
  },
  actionsIndicator: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  actionBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    fontSize: 12,
    borderRadius: 12,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    border: "1px solid rgba(59, 130, 246, 0.3)",
    color: "#93c5fd",
  },
  responseBox: {
    padding: 12,
    borderRadius: 6,
    backgroundColor: "rgba(55, 65, 81, 0.5)",
    border: "1px solid #4b5563",
  },
  responseError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
  },
  responseText: {
    margin: 0,
    fontSize: 13,
    color: "#d1d5db",
    lineHeight: 1.5,
  },
  processing: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
  },
  waveLoader: {
    display: "flex",
    gap: 3,
    alignItems: "center",
  },
  waveDot(index: number): CSSProperties {
    const animationDelay = `${index * 0.15}s`
    return {
      width: 6,
      height: 6,
      borderRadius: "50%",
      backgroundColor: "#3b82f6",
      display: "inline-block",
      animation: `wave 0.9s ${animationDelay} infinite ease-in-out`,
    }
  },
  processingText: {
    fontSize: 12,
    color: "#6b7280",
  },
}