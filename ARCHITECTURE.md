# Satellite Visualization Dashboard - Architecture Documentation

## 1. Project Overview

### What the Project Does

This is a **real-time satellite visualization dashboard** that renders live satellites on a 3D Earth globe. Users can view different satellite categories (ISS, Communications, GPS, Debris), track individual satellites, and see their orbital paths.

### Main Goal

Provide an interactive 3D visualization of Earth's orbiting satellites with:
- Real-time position updates
- Multiple satellite categories
- Orbital path visualization
- Smooth tracking and fly-to functionality

### Key Technologies

| Technology | Purpose |
|------------|---------|
| **React** | UI framework |
| **TypeScript** | Type safety |
| **CesiumJS** | 3D globe rendering |
| **satellite.js** | Satellite orbit calculation (SGP4) |
| **Vite** | Build tool |

---

## 2. High-Level Architecture

### Architecture Flow

```
┌─────────────┐     ┌───────────────┐     ┌──────────┐     ┌────────────────┐
│   UI Layer  │────▶│ LayerManager  │────▶│  Layers  │────▶│ Cesium Viewer  │
│  (Sidebar)  │     │  (Registry)   │     │ (Logic)  │     │ (3D Globe)     │
└─────────────┘     └───────────────┘     └──────────┘     └────────────────┘
```

### Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **UI (Sidebar/Panels)** | User interaction, mode switching, filter controls |
| **LayerManager** | Register/enable/disable layers, coordinate updates |
| **Layers** | Load data, create entities, update positions |
| **Cesium Viewer** | Render 3D globe, entities, and animations |

---

## 3. Folder Structure

```
src/
├── app/                          # Core application logic
│   ├── Layer.ts                  # Base Layer interface
│   ├── LayerManager.ts           # Layer registry and coordinator
│   └── layers/
│       └── satellite/
│           ├── SatelliteLayer.ts # Satellite visualization
│           └── satelliteTypes.ts# Type definitions
│
├── ui/                           # User interface components
│   ├── modes.ts                  # Application mode definitions
│   ├── UIProvider.tsx            # UI layout and state
│   ├── sidebar/                  # Left navigation sidebar
│   │   ├── Sidebar.tsx
│   │   └── ModeButton.tsx
│   └── panels/                   # Context panels
│       └── SatellitePanel.tsx
│
├── components/                   # React components
│   └── Globe.tsx                 # Cesium globe wrapper
│
└── satellites/                   # Satellite utilities
    ├── orbit.ts                  # Orbit calculations
    ├── useSatellites.ts          # Data fetching hook
    └── fetchSatellites.ts        # API calls
```

---

## 4. File-by-File Explanation

### LayerManager.ts

**Purpose:** Central registry for all visualization layers

**Key Responsibilities:**
- Register layers with unique IDs
- Enable/disable layers
- Coordinate update loop via Cesium clock

**Key Methods:**
```typescript
register(id: string, layer: Layer)  // Add a new layer
enable(layerId)                     // Activate a layer
disable(layerId)                    // Deactivate a layer
getDataSource(layerId)              // Get layer's entity collection
```

---

### Layer.ts

**Purpose:** Base interface that all layers must implement

**Key Methods:**
```typescript
interface Layer {
  id: string           // Unique identifier
  name: string         // Display name
  enable(): void       // Activate layer
  disable(): void      // Deactivate layer
  update(): void       // Called every clock tick
  isEnabled(): boolean // Check status
  getEntities(): Cesium.Entity[] // Get entities
}
```

---

### SatelliteLayer.ts

**Purpose:** Implements satellite visualization

**Key Responsibilities:**
- Fetch satellite TLE data
- Create Cesium entities (points, billboards)
- Calculate orbital positions using satellite.js
- Render orbit paths on double-click
- Handle mouse interactions (hover, click, tracking)

**Key Methods:**
```typescript
loadData(data)     // Load satellite TLE data
setFilter(filter)  // Change satellite category
stopTracking()     // Stop following a satellite
setDataSource(ds)  // Set CustomDataSource for entities
```

---

### Globe.tsx

**Purpose:** React wrapper for Cesium viewer

**Key Responsibilities:**
- Initialize Cesium viewer
- Create and configure LayerManager
- Register all layers
- Expose LayerManager to parent via ref

**Usage:**
```typescript
<Globe 
  ref={globeRef}
  filter={currentFilter}
  onFilterChange={setFilter}
  onStopTracking={stopTracking}
/>
```

---

### Sidebar.tsx

**Purpose:** Left navigation panel

**Key Responsibilities:**
- Render mode buttons (Satellite, Flights, CCTV, etc.)
- Handle mode switching
- Visual indication of active mode

---

### SatellitePanel.tsx

**Purpose:** Satellite-specific controls

**Key Responsibilities:**
- Dropdown for satellite category filter
- Stop tracking button
- Appears only when Satellite mode is active

---

### orbit.ts

**Purpose:** Satellite orbit mathematics

**Key Functions:**
```typescript
createSatrec(line1, line2)    // Parse TLE data
getPositionAtTime(satrec, time)  // Calculate position
getOrbitSegments(satrec)     // Generate orbit path points
classifySatellite(name)      // Categorize satellite
```

---

## 5. Complex Logic Explained

### Satellite Position Calculation

1. **TLE Parsing:** `twoline2satrec()` converts TLE strings to satellite record
2. **Position Propagation:** `satellite.propagate()` calculates ECI (Earth-Centered Inertial) coordinates
3. **Coordinate Conversion:** `eciToGeodetic()` converts ECI to lat/lon/altitude
4. **Cesium Conversion:** `Cesium.Cartesian3.fromDegrees()` creates 3D positions

```
TLE → satrec → ECI position → Geodetic → Cartesian3 → Cesium Entity
```

### Orbit Path Generation

```typescript
// 1. Calculate orbital period from mean motion
periodMinutes = 2π / satrec.no

// 2. Sample points around the orbit
for (t = 0; t <= periodMinutes; t += step) {
  position = propagate(satrec, now + t)
  points.push(position)
}

// 3. Create polyline from points
viewer.entities.add({
  polyline: { positions: points }
})
```

### Layer Enable/Disable Logic

```typescript
// Enable layer
enable(layerId):
  1. Call layer.enable()
  2. Set up event handlers
  3. Render entities
  4. Layer starts receiving clock tick updates

// Disable layer
disable(layerId):
  1. Call layer.disable()
  2. Clear entities
  3. Stop receiving updates
  4. (Data source remains in memory for quick re-enable)
```

---

## 6. Data Flow

### Satellite Rendering Flow

```
API Request
    ↓
useSatellites() hook
    ↓
App.tsx (passes to layer)
    ↓
SatelliteLayer.loadData()
    ↓
For each satellite:
  - Parse TLE → satrec
  - Calculate positions
  - Create Cesium Entity
    ↓
Cesium Viewer renders
```

### Mode Switching Flow

```
User clicks "Satellite" in Sidebar
    ↓
activeMode state changes
    ↓
App.tsx calls layerManager.enable("satellite")
    ↓
SatelliteLayer.enable()
    ↓
Set up handlers, render entities
    ↓
User sees satellites on globe
```

---

## 7. How Layers Work

### What is a Layer?

A **Layer** is a self-contained module that:
- Loads its own data
- Creates its own Cesium entities
- Handles its own interactions
- Can be enabled/disabled independently

### Adding a New Layer (Example: FlightLayer)

**Step 1:** Create the layer class

```typescript
// src/app/layers/flight/FlightLayer.ts
export class FlightLayer implements Layer {
  readonly id = "flight"
  readonly name = "Flights"
  
  private viewer: Cesium.Viewer
  
  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }
  
  enable(): void {
    // Load flight data
    // Create entities
  }
  
  disable(): void {
    // Clear entities
  }
  
  update(): void {
    // Update positions on clock tick
  }
  
  isEnabled(): boolean { return this.enabled }
  getEntities(): Cesium.Entity[] { return [] }
}
```

**Step 2:** Register in Globe.tsx

```typescript
const flightLayer = new FlightLayer(viewer)
layerManager.register("flight", flightLayer)
```

**Step 3:** Add UI mode (modes.ts)

```typescript
{
  id: "flight",
  label: "Flights",
  icon: "✈️",
  description: "View real-time flight data"
}
```

**Step 4:** Enable on mode change (App.tsx)

```typescript
if (mode === "flight") {
  layerManager.enable("flight")
}
```

---

## 8. Key Design Decisions

### Why Layer Manager?

- **Separation of Concerns:** UI doesn't know about rendering details
- **Testability:** Layers can be tested independently
- **Extensibility:** Add new visualization types without modifying existing code
- **Performance:** Enable/disable layers without page reloads

### Why CustomDataSource?

```typescript
// Instead of adding directly to viewer.entities
this.dataSource = new Cesium.CustomDataSource("satellites")
viewer.dataSources.add(this.dataSource)
this.dataSource.entities.add(entity)

// Disable entire layer instantly
viewer.dataSources.remove(this.dataSource)
```

Benefits:
- Instant removal of thousands of entities
- Clean separation per layer
- Easier entity management

### Why Cesium Clock Tick?

```typescript
// Instead of setInterval
viewer.clock.onTick.addEventListener(() => {
  layer.update()  // Synchronized with render loop
})
```

Benefits:
- Updates synced with 3D render loop
- No desync between visual and data
- Better performance

### Why Modular UI?

- **Single Responsibility:** Each component does one thing
- **Reusability:** ModeButton works for any mode
- **Maintainability:** Small files are easier to understand
- **Extensibility:** Add panels without breaking existing code

---

## 9. How to Extend the System

### Add New Satellite Filter

1. Edit `src/components/globe/types.ts`:
```typescript
export type SatelliteFilter = "all" | "iss" | "communications" | "gps" | "debris" | "other" | "newFilter"
```

2. Update `src/components/globe/constants.ts`:
```typescript
export const SATELLITE_FILTERS: SatelliteFilter[] = ["all", "iss", "communications", "gps", "debris", "other", "newFilter"]
```

3. Update `classifySatellite()` in `orbit.ts`:
```typescript
if (n.includes("newkeyword")) return "newFilter"
```

### Add New Visualization Feature

1. Create a new layer in `src/app/layers/`
2. Implement the `Layer` interface
3. Register in `Globe.tsx`
4. Add mode in `modes.ts`
5. Handle activation in `App.tsx`

### Add New UI Panel

1. Create component in `src/ui/panels/`
2. Update `UIProvider.tsx` to conditionally render:
```typescript
{activeMode === "satellite" && <SatellitePanel ... />}
{activeMode === "flight" && <FlightPanel ... />}
```

---

## 10. Quick Mental Model

### How to Think About This System (2 minutes)

**Think of it like a TV with channels:**

1. **Cesium Viewer** = The TV screen
2. **LayerManager** = The remote control
3. **Layers** = TV channels (Satellite, Flight, CCTV)
4. **UI** = Your hand pressing remote buttons

**To watch satellites:**
- Press "Satellite" button (UI)
- Remote tells TV to switch to Satellite channel (LayerManager enables SatelliteLayer)
- Satellite channel shows satellites (Cesium renders entities)

**To switch to flights:**
- Press "Flights" button (UI)
- Remote switches from Satellite to Flight channel
- Old channel stops showing, new channel starts

**Key insight:** The TV (Cesium) doesn't care which channel is playing. Each channel (Layer) handles its own content. The remote (LayerManager) just switches between them.

---

## Quick Reference

| Task | Where to Look |
|------|---------------|
| Add new satellite type | `orbit.ts`, `types.ts`, `constants.ts` |
| Add new layer | Create in `layers/`, register in `Globe.tsx` |
| Modify UI | Edit files in `ui/` folder |
| Fix satellite rendering | `SatelliteLayer.ts` |
| Fix orbit paths | `orbit.ts` (`getOrbitSegments`) |
| Modify Cesium globe | `Globe.tsx` |

---

*Last updated: 2026-03-09*
