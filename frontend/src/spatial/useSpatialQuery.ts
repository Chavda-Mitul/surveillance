import { useState, useCallback } from "react"
import { sendSpatialQuery } from "./spatialQueryService"
import type { SpatialAction, QueryResult } from "./tools"

interface UseSpatialQueryOptions {
  onActions?: (actions: SpatialAction[]) => void
}

interface UseSpatialQueryReturn {
  query: string
  setQuery: (query: string) => void
  response: string
  isProcessing: boolean
  conversationId: string | null
  lastResult: QueryResult | null
  error: string | null
  submitQuery: (q?: string) => Promise<void>
  clearConversation: () => void
}

export function useSpatialQuery(options?: UseSpatialQueryOptions): UseSpatialQueryReturn {
  const [query, setQuery] = useState("")
  const [response, setResponse] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submitQuery = useCallback(
    async (q?: string) => {
      const queryText = q ?? query
      if (!queryText.trim()) return

      setIsProcessing(true)
      setError(null)

      try {
        const result = await sendSpatialQuery(queryText, conversationId ?? undefined)
        setLastResult(result)
        setConversationId(result.conversationId)

        if (result.response) {
          setResponse(result.response)
        }

        if (result.actions.length > 0 && options?.onActions) {
          options.onActions(result.actions)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to process query"
        setError(msg)
        setResponse(msg)
      } finally {
        setIsProcessing(false)
      }
    },
    [query, conversationId, options?.onActions]
  )

  const clearConversation = useCallback(() => {
    setQuery("")
    setResponse("")
    setConversationId(null)
    setLastResult(null)
    setError(null)
  }, [])

  return {
    query,
    setQuery,
    response,
    isProcessing,
    conversationId,
    lastResult,
    error,
    submitQuery,
    clearConversation,
  }
}