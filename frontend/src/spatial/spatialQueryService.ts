import axios from "axios"
import type { QueryResult } from "./tools"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"

/**
 * Send a natural language query to the backend LLM proxy
 */
export async function sendSpatialQuery(
  query: string,
  conversationId?: string
): Promise<QueryResult> {
  const response = await axios.post<QueryResult>(
    `${BACKEND_URL}/api/query`,
    {
      query,
      conversationId,
    },
    {
      timeout: 30000,
    }
  )
  return response.data
}