import type { FastifyInstance } from "fastify";
import { config } from "../config";
import { getFlights } from "../services/flightService";
import { getVessels } from "../services/vesselService";
import { getRedis } from "../lib/redis";

/**
 * Haversine distance (km) between two lat/lon points
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Query Redis for nearby entities (flights, vessels) and return a LLM-friendly summary
 */
async function queryNearbyEntitiesData(
  lat: number,
  lon: number,
  radiusKm: number = 100,
  includeFlights: boolean = true,
  includeVessels: boolean = true
): Promise<{
  flights: Array<{ callsign: string; distanceKm: number; altitude: number; heading: number; velocity: number; lat: number; lon: number }>;
  vessels: Array<{ name: string; mmsi: string; distanceKm: number; speed: number; course: number; type: string; lat: number; lon: number }>;
}> {
  const flightsNearby: Array<any> = [];
  const vesselsNearby: Array<any> = [];

  try {
    const redis = await getRedis();

    // Query flights from Redis cache
    if (includeFlights) {
      const cachedFlights = await redis.get(config.cache.flightKey);
      if (cachedFlights) {
        const flights = JSON.parse(cachedFlights) as Array<{
          callsign: string;
          latitude: number;
          longitude: number;
          baroAltitude: number;
          heading: number;
          velocity: number;
        }>;
        for (const f of flights) {
          if (!f.callsign || !f.latitude || !f.longitude) continue;
          const d = haversineKm(lat, lon, f.latitude, f.longitude);
          if (d <= radiusKm) {
            flightsNearby.push({
              callsign: f.callsign,
              distanceKm: Math.round(d * 10) / 10,
              altitude: Math.round(f.baroAltitude || 0),
              heading: Math.round(f.heading || 0),
              velocity: Math.round((f.velocity || 0) * 3.6),
              lat: f.latitude,
              lon: f.longitude,
            });
          }
        }
      }
    }

    // Query vessels from Redis hash
    if (includeVessels) {
      const allVessels = await redis.hGetAll(config.cache.vesselHash);
      const vesselTypeLabels: Record<number, string> = {
        0: "Unknown", 20: "Wing in ground", 30: "Fishing", 31: "Towing",
        32: "Towing large", 33: "Dredging", 34: "Diving", 35: "Military",
        36: "Sailing", 37: "Pleasure", 40: "High-speed", 50: "Pilot",
        51: "SAR", 52: "Tug", 53: "Port tender", 54: "Pollution",
        55: "Law enforcement", 60: "Passenger", 61: "Passenger high-speed",
        70: "Cargo", 71: "Cargo hazardous", 72: "Cargo", 73: "Cargo",
        74: "Cargo", 80: "Tanker", 81: "Tanker hazardous", 82: "Tanker",
        83: "Tanker", 84: "Tanker", 90: "Other",
      };
      for (const json of Object.values(allVessels)) {
        try {
          const v = JSON.parse(json) as { name: string; mmsi: string; lat: number; lon: number; speed: number; course: number; vesselType: number };
          if (!v.lat || !v.lon) continue;
          const d = haversineKm(lat, lon, v.lat, v.lon);
          if (d <= radiusKm) {
            vesselsNearby.push({
              name: v.name || v.mmsi,
              mmsi: v.mmsi,
              distanceKm: Math.round(d * 10) / 10,
              speed: Math.round(v.speed || 0),
              course: Math.round(v.course || 0),
              type: vesselTypeLabels[v.vesselType] || "Unknown",
              lat: v.lat,
              lon: v.lon,
            });
          }
        } catch {
          // skip malformed
        }
      }
    }
  } catch {
    // Redis unavailable — return whatever we have
  }

  return { flights: flightsNearby, vessels: vesselsNearby };
}

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
      description: "Apply a filter to the currently active visualization layer (satellite, vessel, or flight)",
      parameters: {
        type: "object",
        properties: {
          layer: {
            type: "string",
            enum: ["satellite", "vessel", "flight"],
            description: "Which layer to filter",
          },
          filter: {
            type: "string",
            enum: ["all", "cargo", "tanker", "passenger", "fishing", "gps", "iss", "communications", "debris", "commercial", "private", "military"],
            description: "Filter value: vessel types (cargo/tanker/passenger/fishing) or satellite types (gps/iss/communications/debris) or flight types (commercial/private/military/cargo)",
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
      description: "Switch the active visualization mode between satellite, vessel, and flight tracking",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["satellite", "vessel", "flight"],
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
      description: "Track a specific satellite, vessel, or flight by name/identifier. The camera will follow this entity.",
      parameters: {
        type: "object",
        properties: {
          layer: {
            type: "string",
            enum: ["satellite", "vessel", "flight"],
            description: "Which layer the entity belongs to",
          },
          identifier: {
            type: "string",
            description: "Name of satellite, MMSI of vessel, or callsign/ICAO24 of flight to track (e.g. 'ISS', 'AAL123', 'UPS2789')",
          },
        },
        required: ["layer", "identifier"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "queryNearbyEntities",
      description: "Query the live database for flights (aircraft/planes), vessels (ships) near a geographic location. Returns counts and details of entities within a given radius. Use this to answer questions like 'what planes are near me?', 'are there any ships nearby?', or 'when will a plane pass over my location?'",
      parameters: {
        type: "object",
        properties: {
          latitude: {
            type: "number",
            description: "Latitude of the center point in decimal degrees",
          },
          longitude: {
            type: "number",
            description: "Longitude of the center point in decimal degrees",
          },
          radiusKm: {
            type: "number",
            description: "Search radius in kilometres (default: 100)",
          },
          includeFlights: {
            type: "boolean",
            description: "Whether to include flights/aircraft in the results (default: true)",
          },
          includeVessels: {
            type: "boolean",
            description: "Whether to include vessels/ships in the results (default: true)",
          },
        },
        required: ["latitude", "longitude"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "answerQuery",
      description: "Use this when you have gathered real data via queryNearbyEntities and need to present the answer directly to the user. The message should be a complete, helpful natural-language answer to their question.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The complete answer to display to the user",
          },
        },
        required: ["message"],
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
];

/** System prompt defining the assistant's role */
const SYSTEM_PROMPT = [
  "You are God's Eye - a spatial intelligence assistant for a global surveillance dashboard.",
  "You control a 3D globe with satellite tracking, vessel (ship), and flight (aircraft) tracking layers.",
  "",
  "AVAILABLE DATA:",
  "- Satellites: Active satellites tracked via TLE data (ISS, GPS, communications, debris)",
  "- Vessels: Ships with AIS transponders (cargo, tanker, passenger, fishing)",
  "- Flights: Aircraft tracked via OpenSky ADSB data (commercial, cargo, private, military)",
  "",
  "CAPABILITIES:",
  "- Fly the camera to any location on Earth",
  "- Filter vessels by type (cargo, tanker, passenger, fishing)",
  "- Filter satellites by category (gps, iss, communications, debris)",
  "- Filter flights by type (commercial, cargo, private, military)",
  "- Switch between satellite and vessel visualization modes",
  "- Track specific entities by name",
  "- Show information to the user",
  "",
  "RULES:",
  "1. CLASSIFY every query as either a QUESTION or a COMMAND:",
  "   - QUESTION: User asks about real-time data (e.g. 'when will I get a plane above my head?', 'are there ships near X?', 'what flights are over Y?'). For these, FIRST call queryNearbyEntities() to get real data, THEN synthesize an answer and call answerQuery() to display it.",
  "   - COMMAND: User tells you to do something in the UI (e.g. 'show me', 'navigate to', 'filter by', 'switch to', 'track'). For these, directly use flyTo(), filterLayer(), switchMode(), trackEntity().",
  "",
  "2. Use flyTo() to navigate to locations mentioned in queries",
  "3. Use filterLayer() when users ask to see specific types of vessels, satellites, or flights",
  "4. Use switchMode() to toggle between satellite, vessel, and flight modes",
  "5. Use trackEntity() when users want to follow a specific satellite, vessel, or flight",
  "6. Use showInfo() to explain what you are doing or display action confirmations",
  "7. Use answerQuery() to display a complete data-driven answer (only after calling queryNearbyEntities)",
  "8. For region queries (e.g. 'near Gujarat coastline'): if COMMAND, flyTo + filter. If QUESTION, queryNearbyEntities first, then answer.",
  "9. If the user doesn't specify a layer but asks about ships/vessels, use 'vessel' mode; if they ask about satellites/space, use 'satellite'; if they ask about planes/flights/aircraft, use 'flight'",
  "10. Be concise - 1-2 sentences for commands, a short paragraph for data answers",
  "",
  "EXAMPLES:",
  "",
  "User (COMMAND): 'Show cargo vessels near Gujarat coastline'",
  "-> flyTo(22.3, 72.6, 500000, 'Gujarat coastline') + switchMode('vessel') + filterLayer('vessel', 'cargo') + showInfo('Showing cargo vessels near Gujarat coastline')",
  "",
  "User (COMMAND): 'Show commercial flights over Mumbai'",
  "-> flyTo(19.0760, 72.8777, 1000000, 'Mumbai') + switchMode('flight') + filterLayer('flight', 'commercial') + showInfo('Showing commercial flights over Mumbai')",
  "",
  "User (QUESTION): 'when will I get a plane above my head, I am in Dindoli, Surat'",
  "-> First call queryNearbyEntities(latitude:21.1702, longitude:72.8311, radiusKm:100, includeFlights:true, includeVessels:false)",
  "-> LLM examines the returned flight data, computes which ones are approaching Surat and at what speed",
  "-> Call answerQuery() with a friendly answer. Also call flyTo(21.1702, 72.8311, 50000, 'Surat')",
  "",
  "User (QUESTION): 'Are there any ships near Mumbai right now?'",
  "-> Call queryNearbyEntities(latitude:19.0760, longitude:72.8777, radiusKm:100, includeFlights:false, includeVessels:true)",
  "-> Call answerQuery() with a summary of nearby vessels",
  "",
  "User (QUESTION): 'What flights are over India?'",
  "-> Call queryNearbyEntities(latitude:20.5937, longitude:78.9629, radiusKm:500, includeFlights:true, includeVessels:false)",
  "-> Call answerQuery() with count and highlights",
  "",
  "User (COMMAND): 'show me the plane region of India'",
  "-> flyTo(20.5937, 78.9629, 2000000, 'India') + switchMode('flight') + showInfo('Showing flights over India')",
].join("\n");

/** Geo lookup for common Indian/global locations */
const GEO_LOOKUP: Record<string, { lat: number; lon: number; description: string }> = {
  "gujarat": { lat: 22.3, lon: 72.6, description: "Gujarat, India" },
  "gujarat coastline": { lat: 22.3, lon: 72.6, description: "Gujarat coastline" },
  "dindoli": { lat: 21.1702, lon: 72.8311, description: "Dindoli, Surat, Gujarat, India" },
  "surat": { lat: 21.1702, lon: 72.8311, description: "Surat, Gujarat, India" },
  "ahmedabad": { lat: 23.0225, lon: 72.5714, description: "Ahmedabad, Gujarat, India" },
  "vadodara": { lat: 22.3072, lon: 73.1812, description: "Vadodara, Gujarat, India" },
  "rajkot": { lat: 22.3039, lon: 70.8022, description: "Rajkot, Gujarat, India" },
  "jamnagar": { lat: 22.4707, lon: 70.0577, description: "Jamnagar, Gujarat, India" },
  "bhavnagar": { lat: 21.7649, lon: 72.1519, description: "Bhavnagar, Gujarat, India" },
  "porbandar": { lat: 21.6417, lon: 69.6293, description: "Porbandar, Gujarat, India" },
  "navsari": { lat: 20.9467, lon: 72.9520, description: "Navsari, Gujarat, India" },
  "valsad": { lat: 20.6093, lon: 72.9198, description: "Valsad, Gujarat, India" },
  "anand": { lat: 22.5645, lon: 72.9289, description: "Anand, Gujarat, India" },
  "gandhinagar": { lat: 23.2156, lon: 72.6369, description: "Gandhinagar, Gujarat, India" },
  "dwarka": { lat: 22.2442, lon: 68.9670, description: "Dwarka, Gujarat, India" },
  "somnath": { lat: 20.8820, lon: 70.3719, description: "Somnath, Gujarat, India" },
  "western india": { lat: 21.0, lon: 75.0, description: "Western India" },
  "india": { lat: 20.5937, lon: 78.9629, description: "India" },
  "mumbai": { lat: 19.0760, lon: 72.8777, description: "Mumbai, India" },
  "delhi": { lat: 28.7041, lon: 77.1025, description: "Delhi, India" },
  "kolkata": { lat: 22.5726, lon: 88.3639, description: "Kolkata, India" },
  "chennai": { lat: 13.0827, lon: 80.2707, description: "Chennai, India" },
  "bangalore": { lat: 12.9716, lon: 77.5946, description: "Bangalore, India" },
  "hyderabad": { lat: 17.3850, lon: 78.4867, description: "Hyderabad, Telangana, India" },
  "pune": { lat: 18.5204, lon: 73.8567, description: "Pune, Maharashtra, India" },
  "jaipur": { lat: 26.9124, lon: 75.7873, description: "Jaipur, Rajasthan, India" },
  "lucknow": { lat: 26.8467, lon: 80.9462, description: "Lucknow, Uttar Pradesh, India" },
  "indore": { lat: 22.7196, lon: 75.8577, description: "Indore, Madhya Pradesh, India" },
  "goa": { lat: 15.4909, lon: 73.8278, description: "Goa, India" },
  "kerala": { lat: 10.8505, lon: 76.2711, description: "Kerala, India" },
  "tamil nadu": { lat: 11.1271, lon: 78.6569, description: "Tamil Nadu, India" },
  "karnataka": { lat: 15.3173, lon: 75.7139, description: "Karnataka, India" },
  "andhra pradesh": { lat: 15.9129, lon: 79.7399, description: "Andhra Pradesh, India" },
  "nagpur": { lat: 21.1458, lon: 79.0882, description: "Nagpur, Maharashtra, India" },
  "arabian sea": { lat: 18.0, lon: 68.0, description: "Arabian Sea" },
  "bay of bengal": { lat: 15.0, lon: 88.0, description: "Bay of Bengal" },
  "indian ocean": { lat: -10.0, lon: 75.0, description: "Indian Ocean" },
  "pacific ocean": { lat: 0.0, lon: -160.0, description: "Pacific Ocean" },
  "atlantic ocean": { lat: 25.0, lon: -40.0, description: "Atlantic Ocean" },
  "suez canal": { lat: 30.5, lon: 32.5, description: "Suez Canal" },
  "strait of malacca": { lat: 3.0, lon: 101.0, description: "Strait of Malacca" },
  "persian gulf": { lat: 27.0, lon: 52.0, description: "Persian Gulf" },
  "mediterranean sea": { lat: 35.0, lon: 18.0, description: "Mediterranean Sea" },
  "red sea": { lat: 22.0, lon: 38.0, description: "Red Sea" },
  "black sea": { lat: 43.0, lon: 34.0, description: "Black Sea" },
  "china": { lat: 35.8617, lon: 104.1954, description: "China" },
  "russia": { lat: 61.5240, lon: 105.3188, description: "Russia" },
  "usa": { lat: 37.0902, lon: -95.7129, description: "United States of America" },
  "europe": { lat: 51.1657, lon: 10.4515, description: "Europe" },
  "sri lanka": { lat: 7.8731, lon: 80.7718, description: "Sri Lanka" },
  "bangladesh": { lat: 23.6850, lon: 90.3563, description: "Bangladesh" },
  "nepal": { lat: 28.3949, lon: 84.1240, description: "Nepal" },
  "pakistan": { lat: 30.3753, lon: 69.3451, description: "Pakistan" },
  "myanmar": { lat: 21.9162, lon: 95.9560, description: "Myanmar" },
  "thailand": { lat: 15.8700, lon: 100.9925, description: "Thailand" },
  "vietnam": { lat: 14.0583, lon: 108.2772, description: "Vietnam" },
  "philippines": { lat: 12.8797, lon: 121.7740, description: "Philippines" },
  "indonesia": { lat: -0.7893, lon: 113.9213, description: "Indonesia" },
  "malaysia": { lat: 4.2105, lon: 101.9758, description: "Malaysia" },
  "singapore": { lat: 1.3521, lon: 103.8198, description: "Singapore" },
  "japan": { lat: 36.2048, lon: 138.2529, description: "Japan" },
  "south korea": { lat: 35.9078, lon: 127.7669, description: "South Korea" },
  "australia": { lat: -25.2744, lon: 133.7751, description: "Australia" },
  "new zealand": { lat: -40.9006, lon: 174.8860, description: "New Zealand" },
  "south africa": { lat: -30.5595, lon: 22.9375, description: "South Africa" },
  "egypt": { lat: 26.8206, lon: 30.8025, description: "Egypt" },
  "nigeria": { lat: 9.0820, lon: 8.6753, description: "Nigeria" },
  "kenya": { lat: -0.0236, lon: 37.9062, description: "Kenya" },
  "dubai": { lat: 25.2048, lon: 55.2708, description: "Dubai, UAE" },
  "abu dhabi": { lat: 24.4539, lon: 54.3773, description: "Abu Dhabi, UAE" },
  "doha": { lat: 25.2854, lon: 51.5310, description: "Doha, Qatar" },
  "kuwait": { lat: 29.3117, lon: 47.4818, description: "Kuwait City, Kuwait" },
  "oman": { lat: 21.4735, lon: 55.9754, description: "Oman" },
  "iran": { lat: 32.4279, lon: 53.6880, description: "Iran" },
  "iraq": { lat: 33.3152, lon: 44.3661, description: "Iraq" },
  "saudi arabia": { lat: 23.8859, lon: 45.0792, description: "Saudi Arabia" },
  "yemen": { lat: 15.5527, lon: 48.5164, description: "Yemen" },
  "turkey": { lat: 38.9637, lon: 35.2433, description: "Turkey" },
  "london heathrow": { lat: 51.4700, lon: -0.4543, description: "London Heathrow Airport" },
  "dubai international": { lat: 25.2532, lon: 55.3657, description: "Dubai International Airport" },
  "changi airport": { lat: 1.3644, lon: 103.9915, description: "Singapore Changi Airport" },
  "doha airport": { lat: 25.2731, lon: 51.6082, description: "Hamad International Airport, Doha" },
  "jfk airport": { lat: 40.6413, lon: -73.7781, description: "New York JFK Airport" },
};

interface QueryRequest {
  query: string;
  conversationId?: string;
}

interface QueryResponse {
  response: string;
  actions: Action[];
  conversationId: string;
}

export interface Action {
  type: "flyTo" | "filterLayer" | "switchMode" | "trackEntity" | "showInfo" | "answerQuery";
  payload: Record<string, unknown>;
}

async function queryRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/query - Send a natural language query to the LLM
   * Returns structured actions for the frontend to execute
   */
  fastify.post<{ Body: QueryRequest; Reply: QueryResponse }>(
    "/query",
    async (request, reply) => {
      const { query, conversationId } = request.body;
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
      ];

      if (conversationId) {
        // In a production app, you'd retrieve conversation history and append the new query
        messages.push({ role: "user", content: query });
      }

      try {
        const response = await fetch(config.openrouter.baseUrl + "/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + config.openrouter.apiKey,
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
        });

        if (!response.ok) {
          const errorText = await response.text();
          fastify.log.error("OpenRouter API error: " + response.status + " " + errorText);
          reply.status(502).send({
            response: "Sorry, the spatial query service is temporarily unavailable.",
            actions: [
              {
                type: "showInfo" as const,
                payload: { message: "Spatial query service unavailable. Please try again later." },
              },
            ],
            conversationId: conversationId || crypto.randomUUID(),
          });
          return;
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        const assistantMessage = choice?.message;

        // Parse tool calls from the response
        const actions: Action[] = [];
        let textResponse = "";

        // Check if the LLM wants to query nearby entities (needs backend execution)
        const queryNearbyToolCall = assistantMessage?.tool_calls?.find(
          (tc: any) => tc.function.name === "queryNearbyEntities"
        );

        if (queryNearbyToolCall) {
          // --- MULTI-TURN: execute queryNearbyEntities, feed results back to LLM ---
          const args = JSON.parse(queryNearbyToolCall.function.arguments);
          const nearbyData = await queryNearbyEntitiesData(
            args.latitude,
            args.longitude,
            args.radiusKm || 100,
            args.includeFlights !== false,
            args.includeVessels !== false
          );

          // Build a summary for the LLM
          let dataSummary = "queryNearbyEntities result for (" + args.latitude + ", " + args.longitude + ") within " + (args.radiusKm || 100) + "km:\n";

          if (nearbyData.flights.length > 0) {
            dataSummary += "\nFlights nearby (" + nearbyData.flights.length + "):\n";
            for (const f of nearbyData.flights) {
              dataSummary += "- " + f.callsign + ": " + f.distanceKm + "km away, altitude " + f.altitude + "m, heading " + f.heading + " deg, speed " + f.velocity + "km/h\n";
            }
          } else {
            dataSummary += "\nNo flights found within " + (args.radiusKm || 100) + "km.\n";
          }

          if (nearbyData.vessels.length > 0) {
            dataSummary += "\nVessels nearby (" + nearbyData.vessels.length + "):\n";
            for (const v of nearbyData.vessels) {
              dataSummary += "- " + v.name + " (" + v.type + "): " + v.distanceKm + "km away, speed " + v.speed + "kts, course " + v.course + " deg\n";
            }
          } else {
            dataSummary += "\nNo vessels found within " + (args.radiusKm || 100) + "km.\n";
          }

          // Make second LLM call with tool result injected
          const secondMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...(conversationId ? [] : [{ role: "user", content: query }]),
            ...(conversationId ? [{ role: "user", content: query }] : []),
            assistantMessage,
            { role: "tool", tool_call_id: queryNearbyToolCall.id, content: dataSummary },
          ];

          const response2 = await fetch(config.openrouter.baseUrl + "/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + config.openrouter.apiKey,
              "HTTP-Referer": "http://localhost:5173",
              "X-Title": "God's Eye Surveillance",
            },
            body: JSON.stringify({
              model: config.openrouter.model,
              messages: secondMessages,
              tools: TOOLS,
              tool_choice: "auto",
              max_tokens: 1024,
              temperature: 0.3,
            }),
            signal: AbortSignal.timeout(config.openrouter.timeout),
          });

          if (response2.ok) {
            const data2 = await response2.json();
            const choice2 = data2.choices?.[0];
            const msg2 = choice2?.message;

            if (msg2?.content) textResponse = msg2.content;

            if (msg2?.tool_calls) {
              for (const tc of msg2.tool_calls) {
                const fname = tc.function.name;
                const fargs = JSON.parse(tc.function.arguments);

                switch (fname) {
                  case "flyTo":
                    actions.push({ type: "flyTo", payload: fargs });
                    break;
                  case "filterLayer":
                    actions.push({ type: "filterLayer", payload: fargs });
                    break;
                  case "switchMode":
                    actions.push({ type: "switchMode", payload: fargs });
                    break;
                  case "trackEntity":
                    actions.push({ type: "trackEntity", payload: fargs });
                    break;
                  case "answerQuery":
                    actions.push({ type: "answerQuery", payload: fargs });
                    if (!textResponse) textResponse = fargs.message as string;
                    break;
                  case "showInfo":
                    actions.push({ type: "showInfo", payload: fargs });
                    if (!textResponse) textResponse = fargs.message as string;
                    break;
                }
              }
            }

            // Fallback: if no actions from second call, use text as answer
            if (actions.length === 0 && textResponse) {
              actions.push({ type: "answerQuery", payload: { message: textResponse } });
            }
          } else {
            // Second call failed - use the data summary directly
            textResponse = "Based on live data near this location: " + dataSummary;
            actions.push({ type: "answerQuery", payload: { message: textResponse } });
          }
        } else {
          // --- SINGLE-TURN: normal tool parsing without data query ---
          if (assistantMessage?.content) {
            textResponse = assistantMessage.content;
          }

          if (assistantMessage?.tool_calls) {
            for (const toolCall of assistantMessage.tool_calls) {
              const fnName = toolCall.function.name;
              const args = JSON.parse(toolCall.function.arguments);

              switch (fnName) {
                case "flyTo":
                  actions.push({ type: "flyTo", payload: args });
                  break;
                case "filterLayer":
                  actions.push({ type: "filterLayer", payload: args });
                  break;
                case "switchMode":
                  actions.push({ type: "switchMode", payload: args });
                  break;
                case "trackEntity":
                  actions.push({ type: "trackEntity", payload: args });
                  break;
                case "answerQuery":
                  actions.push({ type: "answerQuery", payload: args });
                  if (!textResponse) textResponse = args.message as string;
                  break;
                case "showInfo":
                  actions.push({ type: "showInfo", payload: args });
                  if (!textResponse) textResponse = args.message as string;
                  break;
              }
            }
          }

          // If no tool calls were made, treat the text response as a showInfo
          if (actions.length === 0 && textResponse) {
            actions.push({ type: "showInfo", payload: { message: textResponse } });
          }

          // If no actions at all, provide a fallback
          if (actions.length === 0) {
            actions.push({
              type: "showInfo",
              payload: {
                message:
                  "I understood your query but couldn't generate specific actions. Please try rephrasing.",
              },
            });
          }
        }

        reply.send({
          response: textResponse,
          actions,
          conversationId: conversationId || crypto.randomUUID(),
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(502).send({
          response: "Sorry, an error occurred processing your query.",
          actions: [
            {
              type: "showInfo" as const,
              payload: { message: "Query processing error. Please try again." },
            },
          ],
          conversationId: conversationId || crypto.randomUUID(),
        });
      }
    }
  );
}

export default queryRoutes;