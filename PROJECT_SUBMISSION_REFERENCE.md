# Project Reference Document — "Surveillance" Real-Time Global Dashboard

> **Purpose of this document:** This is a *reference* for you to write your 2-page submission in your own words.
> It contains all facts, technical depth, decisions, and framing you need. Do NOT copy this verbatim —
> use it to gather material, then rewrite in your own voice.

---

## 1. Project Facts Sheet (quick reference)

| Item | Detail |
|---|---|
| **Name** | Satellite Surveillance / Global Situational Awareness Dashboard |
| **Repository** | https://github.com/Chavda-Mitul/surveillance  |
| **What it is** | A full-stack, real-time 3D globe dashboard that visualizes **satellites, aircraft, ocean vessels, and earthquakes** live, plus a natural-language AI assistant ("God's Eye") that can fly the camera, filter layers, track entities, and answer spatial questions like *"what planes are near me in Surat?"* |
| **Frontend** | React 19, TypeScript, Cesium.js 3D globe, Vite, React Query, h3-js, Web Workers |
| **Backend** | Node.js, Fastify, TypeScript, Redis, node-cron, WebSocket client (aisstream), Zod validation |
| **AI layer** | OpenRouter LLM (Qwen) with function-calling tools executed on the frontend 3D globe |
| **Data sources** | CelesTrak (TLE satellite elements), OpenSky Network (ADS-B aircraft), VesselAPI + aisstream (AIS vessels), USGS (earthquakes) |
| **Caching** | Redis — satellite 12 h TTL, flights 30 s warm cache, vessels Redis hash keyed by MMSI, earthquake 10 min, flight routes 6 h |
| **Deployment** | Docker Compose (redis + backend + frontend/nginx); Vercel serverless (api/index.ts wrapper + Upstash Redis) |

### Live data pipeline summary

| Layer | Source | Mechanism | Update frequency |
|---|---|---|---|
| Satellite | CelesTrak | Cron job → Redis (JSON) | every 6 h (TTL 12 h) |
| Flights | OpenSky | Cron job → Redis (JSON) | every 30 s |
| Vessels | VesselAPI (REST) + aisstream.io (WebSocket) | Polling / WS → Redis hash (by MMSI) | ~15 s poll |
| Earthquakes | USGS GeoJSON feed | Cron job → Redis (JSON) | every 2 min |
| AI queries | OpenRouter (Qwen 3.7) | On demand, tool calling | per query |

### Project timeline (from git history)
- Mar 2026 — initial satellite tracking app with Cesium + TLE (orbits, click-to-track, filters)
- Mar 2026 — performance pass; LayerManager abstraction; full refactor (430-line monolith → modular)
- May 2026 — ships (AIS) + Docker deployment files
- Sep 2026 — H3 hexagonal binning for vessels; AI assistant ("God's Eye") with function calling; vessel + flight layers; flight trajectory rendering; earthquake layer; Vercel deployment

---

## 2. What the project is and the problem it solves

**One-line description:** A real-time global situational-awareness dashboard that puts four live data streams — satellites in orbit, aircraft in the sky, ships at sea, earthquakes happening right now — on one interactive 3D globe, controllable by simple typed English sentences.

**The problem it solves:**
- Real-time object tracking across air, space, and sea is normally the domain of walled-off military/government systems. This project shows a full-stack engineer can assemble the *same class of capability* from **free public data feeds** (CelesTrak, OpenSky, AIS, USGS) and modern web tech.
- Tracking ~thousands of fast-moving objects (satellites at ~7.5 km/s) in a browser requires serious performance engineering — naive rendering freezes the page. The project solves this with worker threads, interpolation sampling, viewport culling, and level-of-detail clustering.
- Data comes from heterogeneous sources (WebSocket stream, REST endpoints, cron-fed JSON) in different formats — the backend normalizes all of it into typed, validated payloads the frontend trusts.
- Asking "is there a plane near me?" or "show me GPS satellites" requires bridging natural language → spatial actions. The AI assistant solves this by **function calling** against the real data (Haversine geospatial queries over Redis) rather than guessing.

**Angle for this company (climate-risk / data-driven insurance):** The core skill here is exactly what a climate-risk platform needs:
- integrating many heterogeneous live data sources and normalizing them,
- caching and serving that data at scale,
- a GeoJSON-style spatial query engine over live data (Haversine proximity queries),
- a 3D/visual layer that makes complex spatial data comprehensible,
- and a natural-language front end that lets non-experts ask questions of geospatial data.

The earthquake/hazard layer and the general pattern of "live geospatial event monitoring" maps directly to climate-hazard monitoring (quakes, floods, storms are the same *real-time geospatial event stream* problem).

---

## 3. Why it's your best project / what makes it stand out

**Talking points (pick 3–4, expand honestly):**

1. **It is genuinely full-stack and end-to-end shipped.**
   - Backend: API services, cron jobs, Redis caching, WebSocket client, typed error handling, graceful shutdown.
   - Frontend: 3D visualization, modular layer architecture, data hooks, UI panels, info popups.
   - Deployment: Docker Compose for self-hosted, plus a real Vercel serverless deployment (api/index.ts wraps Fastify, Upstash Redis, vercel.json rewrites).
   - You owned it from data source → cache → API → 3D render → user interaction.

2. **It ingests four real, heterogeneous live data streams and makes them coexist smoothly.**
   - CelesTrak (cron + JSON cache), OpenSky (cron, JSON), VesselAPI (REST polling) + aisstream (persistent WebSocket), USGS (GeoJSON).
   - Each is a different protocol/timing; the system normalizes them behind one typed schema and one layer interface.

3. **Performance engineering at the level of a production system.**
   - SGP4 satellite propagation runs in a **Web Worker** (off the main thread) with cached satellite records.
   - `SampledPositionProperty` + Lagrange interpolation: 20 position samples per satellite, smoothed between clock ticks — no per-frame physics math on the UI thread.
   - **Throttled clock-tick updates** (15 s), **viewport culling** (entities outside the camera rect are hidden), **max-entity cap (5000)**.
   - Vessels use **H3 hexagonal binning with distance LOD**: single points when zoomed in (<50 km altitude), hex clusters (res 2/4/6) when zoomed out — tens of thousands of points become a handful of polygons.
   - Per-layer `CustomDataSource` means switching modes removes 1,000+ entities in under a millisecond.

4. **Clean architecture and an honest refactor story.**
   - The project was refactored from a monolithic 430-line `SatelliteLayer.ts` into a modular design: `LayerManager` registry, per-type layers, `EntityFactory`, `EventHandlers`, centralized `constants.ts`, and type guards.
   - Removed all `as any` casts using TypeScript type guards; centralized magic numbers; typed `AppError` hierarchy with proper HTTP status codes; centralized config.
   - Metrics you can mention: 430→~200 lines, 0 `as any` casts, all constants centralized, zero breaking changes to the public API.

5. **A unique differentiator: natural-language control of a 3D globe.**
   - "God's Eye" mode: LLM + function calling. Tools: `flyTo`, `filterLayer`, `switchMode`, `trackEntity`, `queryNearbyEntities`, `answerQuery`, `showInfo`.
   - The LLM runs real **Haversine proximity queries** over live Redis data before answering — e.g., "what planes are near me" returns actual aircraft within a radius, with distances and speeds.
   - Typed `SpatialAction[]` results are executed directly on the Cesium globe and React state — the AI actually *drives the UI*, not just chit-chat.

6. **Hard technical domains covered:**
   - Orbital mechanics (SGP4/TLE, ECI→geodetic conversions, orbital period, orbit path sampling).
   - Real-time streaming (AIS WebSocket, reconnect/backoff, subscription watchdogs, stale cleanup, simulation fallback).
   - Geospatial indexing (H3 hexes, Haversine, anti-meridian-aware viewport checks).
   - Serverless adaptation (lazy Fastify singleton, ensureRedis reconnection across cold starts).

---

## 4. Key technical decisions and why they made the solution better

**Use these in question 3. Format: Decision → Why it made it better.**

### A. Layer architecture (LayerManager + Layer interface + per-layer CustomDataSource)
- **Decision:** Every data type is a `Layer` implementing `enable()/disable()/update()/isEnabled()/getEntities()`, registered in a `LayerManager`, each with its own `Cesium.CustomDataSource`.
- **Why better:** Complete separation of concerns — the UI never touches Cesium rendering; new data types plug in without touching existing code (Open/Closed principle). Disabling a mode removes all its entities instantly at the WebGL level (not `entity.show=false` one-by-one). The 10–15 s throttled clock tick syncs updates with the render loop instead of a desynced `setInterval`.

### B. Web Worker + satrec caching for SGP4 propagation
- **Decision:** Satellite position math (satellite.js propagate) runs in a dedicated Web Worker; satrec objects cached once at init; batch propagate requests.
- **Why better:** SGP4 is CPU-heavy and would jank the 60 fps render loop for ~8,000+ active satellites. Off-thread + caching + batch job protocol keeps the UI thread free, and the main thread just consumes `{lat, lon, alt}` results.

### C. SampledPositionProperty + Lagrange interpolation instead of per-frame propagation
- **Decision:** Each satellite gets 20 samples at 30 s intervals into a `SampledPositionProperty`; the worker refreshes the window each update; Cesium interpolates between samples (Lagrange polynomial degree 2).
- **Why better:** Smooth orbital motion without physics per frame; the cost is amortized into batch worker calls — visually identical to continuous propagation for a fraction of the CPU.

### D. H3 hexagonal clustering LOD for vessels
- **Decision:** Zoom-dependent rendering: altitude < 50 km → individual ships; 50–200 km → H3 res 6; 200–1000 km → res 4; > 1000 km → res 2. Clusters show count + dominant type; clicking a cluster re-renders individual ships.
- **Why better:** Enables global scale with 10,000+ tracked vessels without dropping frames; the same pattern is how Google Maps/Earth handle massive point datasets — it demonstrates production-grade LOD thinking.

### E. Redis as the shared cache/source of truth
- **Decision:** External APIs never hit the frontend directly. Backend services poll/cron into Redis (satellite JSON 12 h TTL, flight JSON 30 s, vessel Redis hash keyed by MMSI, earthquake JSON 10 min); frontend reads only from our API.
- **Why better:** Resilient to provider outages (cron retries re-warm the cache), consistent schema via Zod validation, and — key bonus — the LLM's `queryNearbyEntities` tool performs **Haversine proximity search directly against the Redis cache**, so AI answers reflect near-real-time data without extra provider calls.

### F. Typed error hierarchy + centralized route handling
- **Decision:** `AppError` base + subclasses with HTTP status codes and machine-readable codes (`RedisConnectionError` 503, `CelestrakFetchError` 502, `DataParseError` 500…); one `handleRoute()` used by all routes; centralized `config/index.ts`.
- **Why better:** Consistent API error contracts, easy client troubleshooting, no repeated try/catch boilerplate per route, and everything configurable via env with defaults.

### G. LLM function calling with typed spatial actions
- **Decision:** Backend `/api/query` sends user intent + geospatial tool definitions to OpenRouter; the LLM returns structured tool calls; backend resolves them (including live `queryNearbyEntities` over Redis) and returns a typed `SpatialAction[]`; the frontend executes them on the globe.
- **Why better:** This is the difference between an "AI chatbot" and an AI that *operates the application* — the model's answers are grounded in real live data, and its commands are executed by real map controls (flyTo, layer filters, entity tracking).

### H. Real streaming resilience (vessel layer)
- **Decision:** Persistent AIS WebSocket with reconnect/backoff (1 s→60 s), subscription watchdogs (terminate if no data in 8 s), `ShipStaticData` type caching, stale-vessel cleanup cron, and a **simulation fallback** (realistic routes) if the feed dies.
- **Why better:** The system degrades gracefully — the UI stays populated and functional even when an external provider fails. This kind of resilience engineering is exactly what production data platforms need.

### I. Serverless + self-hosted dual deployment
- **Decision:** Docker Compose for local/full deployment (redis, backend, nginx frontend); Vercel serverless via `api/index.ts` (lazy Fastify singleton, `ensureRedis` reconnection, memory/duration tuned in `vercel.json`).
- **Why better:** Demonstrates understanding of both deployment models — and that serverless constraints (no persistent cron/WebSocket) were explicitly understood and handled.

---

## 5. What you learned / what you're most proud of

**Talking points (connect to growth, choose the 3 most honest for you):**

1. **Three disciplines required to make "impossible-in-browser" actually work:** orbital mechanics (TLE/SGP4/ECI), large-scale WebGL entity management, and data engineering (heterogeneous feeds → one cache). This project taught me to read primary sources (CelesTrak/OpenSky docs) and turn them into working code.
2. **Performance is an architecture decision, not an optimization at the end.** Worker-threading the physics, sampling/interpolating positions, culling by viewport, and LOD-clustering were structural choices that made thousands of moving entities fluid from day one.
3. **Refactoring is worth the risk when done carefully.** Cutting `SatelliteLayer.ts` by half, adding type guards, and centralizing constants had zero breaking changes because the interface (`Layer`) and API contracts were kept stable — that lesson (design for extensibility) applies to any codebase.
4. **LLM + product integration:** the biggest payoff wasn't the model itself but the *tool design* — giving the LLM typed, grounded geospatial tools (live Haversine queries, camera commands) turned it from a chatbot into an operator. I'm proud of making an AI feature that actually does something real.
5. **Shipping beats polishing:** getting a Docker Compose stack and a Vercel serverless deploy live taught me the deployment side — env config, CORS, health endpoints, graceful shutdown, serverless constraints — that tutorials rarely cover.
6. **What I'm most proud of overall:** a single demo that unifies satellites, flights, ships, earthquakes, and an AI copilot on a 3D globe — with real data, real-time updates, and a clean codebase — built almost entirely from free public data sources and open-source libraries.

---

## 6. Mapping to the job ("climate-risk / insurance / Python-Go-React-Tailwind / cloud")

**Helpful honest framing (do not oversell):**

- **Why it fits the company:** The company builds **data-driven climate-risk solutions** — i.e., ingesting many live geospatial feeds (weather, hazards, exposures), normalizing, caching, serving, and visualizing them so decisions can be made. This project is the *exact same pipeline* class: live multi-source ingest → validation → cache → API → interactive visualization → natural-language analytics over the data. The earthquake/hazard layer is literally a real-time hazard event stream.
- **Stack note (be prepared):** This project's stack is Node.js/Fastify + React/Cesium + TypeScript + Redis — **not** Python/Go/Tailwind. In the document, be honest: "built in TypeScript/Node; the architecture and decisions (cache layers, typed APIs, LOD rendering, streaming resilience, serverless + container deployment) are stack-agnostic and translate directly to Python/Go services." If you have separate Python or Tailwind experience, mention it briefly outside the project story with a concrete example (e.g., a script, another small project) — do not claim this project uses them.
- **Keywords the company will respond to (weave a few in naturally):** real-time data pipelines, caching (Redis), geospatial analytics, visualisation, resilience/failover, cloud deployment (Docker, serverless), typed APIs, performance at scale, natural-language interfaces, hazard/event monitoring.

---

## 7. Suggested structure for your 2-page submission

> Formatting that MUST be met: A4, normal margins, **Aptos font size 11**, line spacing **1.15**, **8 pt** space after paragraph, max 2 pages, GitHub link included. Write in first person, concrete, no generic claims.

**Page 1**
1. **Title + one-paragraph elevator pitch** (what it is, one line on the problem).
2. **The problem it solves** (2–4 sentences, concrete: real-time air/space/sea/earth monitoring from public data; performance challenge of thousands of moving entities in a browser; making data queryable in plain English).
3. **What makes it stand out** (pick 2–3: full-stack end-to-end, four live data streams, worker-threaded orbital physics, H3 LOD clustering, AI assistant with real geospatial tool calls, clean refactor).
4. **Architecture in ~5 lines** (React 19 + Cesium 3D frontend; Node/Fastify + Redis backend; cron/WS ingestion; Docker + Vercel). Optionally a tiny diagram.

**Page 2**
5. **Key technical decisions** (pick 2–4 from Section 4 with a "Decision → why it was better" structure).
6. **What I learned / most proud of** (2–4 honest points from Section 5).
7. **GitHub link** + one line: *Repository: github.com/Chavda-Mitul/surveillance* (with a screenshot if allowed and you can fit it).
8. **One closing line** connecting to why you're applying (e.g., interest in data-driven hazard/risk platforms that demand the same ingestion→cache→visualize→analyze discipline).

**Do:** keep it to 2 pages; use concrete numbers (e.g., 12 h cache TTLs, 30 s polls, 5000 entity cap, 430→200 line refactor, 4 data sources); mention failures that taught you something (e.g., naive rendering was janky → worker + sampling).
**Don't:** claim technologies the repo doesn't use; use AI-sounding filler ("In today's fast-paced world…", "leveraging cutting-edge…"); pad with generic full-stack buzzwords.

---

## 8. Likely technical-discussion questions to prepare for

Given the job spec, expect the reviewer to probe after reading your doc:

1. How does the backend handle an external API being down? (→ cached copies, cron re-warm, HTTP status mapping, graceful degradation, simulation fallback).
2. Why Redis — why not just query providers directly? (→ rate limits, latency, shared cache for search/LLM, resilience).
3. How did you keep 8,000 satellites smooth in a browser? (→ worker, sampling+interpolation, culling, throttled ticks).
4. Explain the H3 clustering — why three resolutions and those thresholds? (→ LOD tradeoff, hex sizes ~36–870 km²).
5. How does the AI assistant actually answer "anything near me?" (→ tool calling → Haversine over Redis cache → typed actions executed by the frontend).
6. How would you add a fifth layer (e.g., weather or flood data)? (→ new Layer class, register in Globe.tsx, hook + panel — the extension path is designed).
7. Serverless: why can't cron/WebSocket code run on Vercel, and what did you do? (→ lazy singleton, ensureRedis reconnection, poll-on-request).
8. TypeScript: how did you remove `as any` and why does it matter? (→ type guards, narrowing; compile-time safety).
9. Would you do anything differently? (Good answer: tests were the biggest gap — unit tests for the layer modules, integration tests; see REFACTORING checklist's "recommended next steps").
10. How is this relevant to climate risk / insurance? (→ same real-time hazard feed → cache → spatial analytics → visualization pipeline; natural-language querying of hazard data).

---

*Compiled from the repository's README, ARCHITECTURE.md, REFACTORING.md/CHECKLIST, and source inspection (backend src + frontend src).*
