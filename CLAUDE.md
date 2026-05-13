# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`backend/`)
```bash
npm run dev      # Start dev server with hot reload (ts-node-dev)
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled output
```

### Frontend (`frontend/`)
```bash
npm run dev      # Start Vite dev server (port 5173)
npm run build    # Type-check + Vite production build
npm run lint     # ESLint
npm run preview  # Preview production build
```

### Prerequisites
Redis must be running locally on port 6379 before starting the backend. The backend crashes on startup if Redis is unavailable.

## Environment

`backend/.env` is required. Key variables:
- `AISSTREAM_API_KEY` — free key from aisstream.io for ship vessel tracking (WebSocket AIS data). Without it, vessel tracking is silently disabled with a console warning.
- `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` — OpenSky credentials (present in .env but not yet wired to a UI mode).

## Architecture

Dual-process app: a Node.js/Fastify backend that fetches and caches external data, and a React/Cesium.js frontend that renders a 3D globe.

### Backend (`backend/src/`)

**Data flow**: External API → Service → Redis → Fastify route → Frontend

- `config/index.ts` — single source of truth for all config values and env vars. Add new external APIs here first.
- `services/` — one service per data source. `satelliteService.ts` polls CelesTrak every 6 hours via cron and caches in Redis as a JSON string. `vesselService.ts` maintains a persistent WebSocket to aisstream.io and writes each AIS position update to a Redis hash keyed by MMSI; it also subscribes to `ShipStaticData` messages to populate vessel type.
- `routes/` — thin Fastify route handlers: `fastify.get("/x", (_req, reply) => handleRoute(fastify, reply, getX))`. All error mapping lives in `utils/routeHandler.ts`.
- `utils/routeHandler.ts` — shared `handleRoute()` used by all routes. Checks `instanceof AppError` for typed status codes, falls back to 500.
- `utils/errors.ts` — `AppError` base class + subclasses: `RedisConnectionError`, `CelestrakFetchError`, `DataParseError`, `CacheError`, `AISStreamError`.
- `job/` — cron jobs for background cache refresh (satellite only; vessels are push-driven via WebSocket).
- `lib/redis.ts` — Redis singleton via `getRedis()`.
- `schema/` — Zod schemas defining the wire format for each route's response.

### Frontend (`frontend/src/`)

**Data flow**: React Query hook → Axios → Backend REST → Layer class → Cesium entities on globe

#### Layer system (`app/`)
The core abstraction is the `Layer` interface (`app/Layer.ts`): `enable()`, `disable()`, `update()`, `isEnabled()`, `getEntities()`. `LayerManager` (`app/LayerManager.ts`) registers layers by string ID, creates a `Cesium.CustomDataSource` per layer, and drives periodic `update()` calls via a throttled Cesium clock tick (every 10 seconds).

Each data type lives under `app/layers/<type>/` with four files:
- `<Type>Layer.ts` — implements `Layer`, owns entity lifecycle
- `entityFactory.ts` — static `createEntity()` / `updatePosition()` methods
- `constants.ts` — colors, sizes, distance conditions, filter list (`VESSEL_FILTERS` / satellite constants)
- `<type>Types.ts` — local types and classification helpers (e.g. `classifyVessel()`)

Layer differences:
- `satellite/` — `SampledPositionProperty` for smooth orbital interpolation via `satellite.js` TLE propagation (`satellites/orbit.ts`). Click/hover/double-click handled by `SatelliteEventHandlers`. Double-click tracks the entity and draws the orbit path.
- `vessel/` — `ConstantPositionProperty` at altitude 0. `updatePosition()` replaces the value in-place on each 30-second poll. No event handlers yet.

**To add a new data source**: create `app/layers/<type>/`, implement `Layer`, register in `Globe.tsx`, add `useX` hook call and `useEffect` in `App.tsx`, add mode entry to `ui/modes.ts`, add panel to `ui/panels/`.

#### UI (`ui/`)
- `modes.ts` — `AppMode` union type + `APP_MODES` array drives the sidebar. Add new modes here.
- `UIProvider.tsx` — renders the sidebar and the active mode's panel. Add a new `{activeMode === "x" && <XPanel />}` block here when adding a mode.
- `panels/` — one panel component per active mode.

#### Data fetching (`satellites/`, `vessels/`)
Each data type has a `fetchX.ts` (Axios call) and `useX.ts` (React Query wrapper). Satellite `staleTime` is 12 hours; vessel `staleTime` + `refetchInterval` are both 30 seconds.

#### Globe (`components/Globe.tsx`)
Initializes the Cesium viewer, registers all layers with `LayerManager`, and wires per-layer filter `useEffect` hooks. Exposes `layerManager` to `App.tsx` via `useImperativeHandle`.

#### Type locations
- `SatelliteFilter` / `SatelliteRefs` — canonical definition in `app/layers/satellite/satelliteTypes.ts`. `components/globe/types.ts` re-exports them so existing UI imports keep working.
- `VesselFilter` / `Vessel` — defined in `vessels/types.ts`, re-exported by `app/layers/vessel/vesselTypes.ts` alongside `classifyVessel()`.

### Cesium entity patterns
- **Satellites**: `SampledPositionProperty` with 20 samples × 30-second intervals, updated by `LayerManager` tick.
- **Vessels**: `ConstantPositionProperty` at altitude 0; position replaced in-place on each data refresh.
- Labels: hidden by default (`show: false`), revealed on hover. `DistanceDisplayCondition` hides them beyond 2–3 million metres. `NearFarScalar` scales point size with camera distance.
- All entities go into the layer's `CustomDataSource`, not `viewer.entities` directly.

### Type guards (`app/layers/satellite/types.guard.ts`)
`hasLoadData(layer)` and `hasStopTracking(layer)` are used in `App.tsx` to safely call optional layer methods on the generic `Layer` interface without casting.
