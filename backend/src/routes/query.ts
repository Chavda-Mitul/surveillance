import type { FastifyInstance } from "fastify"
import { config } from "../config"

/**
 * Tool definitions for LLM function calling
 * These define what the LLM can ask the frontend to do
 */
const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "flyTo",
      description: "Fly the camera to a specific geographic coordinate at a given altitude",
      parameters: {
        type: "object",
        properties: {
          latitude: {
            type: "number",
            description: "Latitude in decimal degrees (-90 to 90)",
          },
          longitude: {
            type: "number",
            description: "Longitude in decimal degrees (-180 to 180)",
          },
          altitude: {
            type: "number",
            description: "Altitude in metres above ground (default: 1000000 for regional, 500000 for coastline, 50000 for close-up)",
          },
          name: {
            type: "string",
            description: "Optional label for the location (e.g. 'Gujarat coastline')",
          },
        },
        required: ["latitude", "longitude"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "filterLayer",
      description: "Apply a filter to the currently active visualization layer (satellite or vessel)",
      parameters: {
        type: "object",
        properties: {
          layer: {
            type: "string",
            enum: ["satellite", "vessel"],
            description: "Which layer to filter",
          },
          filter: {
            type: "string",
            enum: ["all", "cargo", "tanker", "passenger", "fishing", "gps", "iss", "communications", "debris"],
            description: "Filter value: vessel types (cargo/tanker/passenger/fishing) or satellite types (gps/iss/communications/debris)",
          },
        },
        required: ["layer", "filter"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "switchMode",
      description: "Switch the active visualization mode between satellite and vessel tracking",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["satellite", "vessel", "flight", "cctv", "military", "traffic"],
            description: "The mode to switch to",
          },
        },
        required: ["mode"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "trackEntity",
      description: "Track a specific satellite or vessel by name/identifier. The camera will follow this entity.",
      parameters: {
        type: "object",
        properties: {
          layer: {
            type: "string",
            enum: ["satellite", "vessel"],
            description: "Which layer the entity belongs to",
          },
          identifier: {
            type: "string",
            description: "Name of satellite or MMSI of vessel to track (e.g. 'ISS', 'GPS BIIR-2', '311040700')",
          },
        },
        required: ["layer", "identifier"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "showInfo",
      description: "Show an informational message to the user in the query panel",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message to display",
          },
        },
        required: ["message"],
      },
    },
  },
]

/** System prompt defining the assistant's role */
const SYSTEM_PROMPT = `You are God's Eye - a spatial intelligence assistant for a global surveillance dashboard.
You control a 3D globe with satellite tracking and vessel (ship) tracking layers.

AVAILABLE DATA:
- Satellites: Active satellites tracked via TLE data (ISS, GPS, communications, debris)
- Vessels: Ships with AIS transponders (cargo, tanker, passenger, fishing)

CAPABILITIES:
- Fly the camera to any location on Earth
- Filter vessels by type (cargo, tanker, passenger, fishing)
- Filter satellites by category (gps, iss, communications, debris)
- Switch between satellite and vessel visualization modes
- Track specific entities by name
- Show information to the user

RULES:
1. Use flyTo() to navigate to locations mentioned in queries
2. Use filterLayer() when users ask to see specific types of vessels or satellites
3. Use switchMode() to toggle between satellite and vessel modes
4. Use trackEntity() when users want to follow a specific satellite or vessel
5. Use showInfo() to explain what you're doing or display results
6. For queries about a region (e.g. "near Gujarat coastline"), first flyTo that area, then apply relevant filters
7. If the user doesn't specify a layer but asks about ships/vessels, use "vessel" mode; if they ask about satellites/space, use "satellite" mode
8. Be concise and helpful - respond in 1-2 sentences via showInfo()
9. When a user asks to "show X", combine flyTo with the appropriate filterLayer call

Example: User says "Show cargo vessels near Gujarat coastline"
→ Call flyTo(22.3, 72.6, 500000, "Gujarat coastline") + switchMode("vessel") + filterLayer("vessel", "cargo")

Example: User says "Track satellites passing over western India"
→ Call flyTo(21.0, 75.0, 2000000, "Western India") + switchMode("satellite") + showInfo("Showing satellites over western India...")`

/** Geo lookup for common Indian/global locations */
const GEO_LOOKUP: Record<string, { lat: number; lon: number; description: string }> = {
  "gujarat": { lat: 22.3, lon: 72.6, description: "Gujarat, India" },
  "gujarat coastline": { lat: 22.3, lon: 72.6, description: "Gujarat coastline" },
  "western india": { lat: 21.0, lon: 75.0, description: "Western India" },
  "india": { lat: 20.5937, lon: 78.9629, description: "India" },
  "mumbai": { lat: 19.0760, lon: 72.8777, description: "Mumbai, India" },
  "delhi": { lat: 28.7041, lon: 77.1025, description: "Delhi, India" },
  "kolkata": { lat: 22.5726, lon: 88.3639, description: "Kolkata, India" },
  "chennai": { lat: 13.0827, lon: 80.2707, description: "Chennai, India" },
  "bangalore": { lat: 12.9716, lon: 77.5946, description: "Bangalore, India" },
  "arabian sea": { lat: 18.0, lon: 68.0, description: "Arabian Sea" },
  "bay of bengal": { lat: 15.0, lon: 88.0, description: "Bay of Bengal" },
  "indian ocean": { lat: -10.0, lon: 75.0, description: "Indian Ocean" },
  "pacific ocean": { lat: 0.0, lon: -160.0, description: "Pacific Ocean" },
  "atlantic ocean": { lat: 25.0, lon: -40.0, description: "Atlantic Ocean" },
  "suez canal": { lat: 30.5, lon: 32.5, description: "Suez Canal" },
  "strait of malacca": { lat: 3.0, lon: 101.0, description: "Strait of Malacca" },
  "persian gulf": { lat: 27.0, lon: 52.0, description: "Persian Gulf" },
  "china": { lat: 35.8617, lon: 104.1954, description: "China" },
  "russia": { lat: 61.5240, lon: 105.3188, description: "Russia" },
  "usa": { lat: 37.0902, lon: -95.7129, description: "United States of America" },
  "europe": { lat: 51.1657, lon: 10.4515, description: "Europe" },
}

interface QueryRequest {
  query: string
  conversationId?: string
}

interface QueryResponse {
  response: string
  actions: Action[]
  conversationId: string
}

export interface Action {
  type: "flyTo" | "filterLayer" | "switchMode" | "trackEntity" | "showInfo"
  payload: Record<string, unknown>
}

async function queryRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/query - Send a natural language query to the LLM
   * Returns structured actions for the frontend to execute
   */
  fastify.post<{ Body: QueryRequest; Reply: QueryResponse }>(
    "/query",
    async (request, reply) => {
      const { query, conversationId } = request.body
      const messages: Array<{ role: string; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(conversationId
          ? []
          : [
              {
                role: "user",
                content: query,
              },
            ]),
      ]

      if (conversationId) {
        // In a production app, you'd retrieve conversation history and append the new query
        messages.push({ role: "user", content: query })
      }

      try {
        const response = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.openrouter.apiKey}`,
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "God's Eye Surveillance",
          },
          body: JSON.stringify({
            model: config.openrouter.model,
            messages,
            tools: TOOLS,
            tool_choice: "auto",
            max_tokens: 1024,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(config.openrouter.timeout),
        })

        if (!response.ok) {
          const errorText = await response.text()
          fastify.log.error(`OpenRouter API error: ${response.status} ${errorText}`)
          reply.status(502).send({
            response: "Sorry, the spatial query service is temporarily unavailable.",
            actions: [
              {
                type: "showInfo" as const,
                payload: { message: "Spatial query service unavailable. Please try again later." },
              },
            ],
            conversationId: conversationId || crypto.randomUUID(),
          })
          return
        }

        const data = await response.json()
        const choice = data.choices?.[0]
        const assistantMessage = choice?.message

        // Parse tool calls from the response
        const actions: Action[] = []
        let textResponse = ""

        if (assistantMessage?.content) {
          textResponse = assistantMessage.content
        }

        if (assistantMessage?.tool_calls) {
          for (const toolCall of assistantMessage.tool_calls) {
            const fnName = toolCall.function.name
            const args = JSON.parse(toolCall.function.arguments)

            switch (fnName) {
              case "flyTo":
                actions.push({ type: "flyTo", payload: args })
                break
              case "filterLayer":
                actions.push({ type: "filterLayer", payload: args })
                break
              case "switchMode":
                actions.push({ type: "switchMode", payload: args })
                break
              case "trackEntity":
                actions.push({ type: "trackEntity", payload: args })
                break
              case "showInfo":
                actions.push({ type: "showInfo", payload: args })
                if (!textResponse) textResponse = args.message as string
                break
            }
          }
        }

        // If no tool calls were made, treat the text response as a showInfo
        if (actions.length === 0 && textResponse) {
          actions.push({ type: "showInfo", payload: { message: textResponse } })
        }

        // If no actions at all, provide a fallback
        if (actions.length === 0) {
          actions.push({
            type: "showInfo",
            payload: {
              message:
                "I understood your query but couldn't generate specific actions. Please try rephrasing.",
            },
          })
        }

        reply.send({
          response: textResponse,
          actions,
          conversationId: conversationId || crypto.randomUUID(),
        })
      } catch (error) {
        fastify.log.error(error)
        reply.status(502).send({
          response: "Sorry, an error occurred processing your query.",
          actions: [
            {
              type: "showInfo" as const,
              payload: { message: "Query processing error. Please try again." },
            },
          ],
          conversationId: conversationId || crypto.randomUUID(),
        })
      }
    }
  )
}

export default queryRoutes