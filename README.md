# Satellite Surveillance System

🌐 **[surveillance-frontend-nine.vercel.app](https://surveillance-frontend-nine.vercel.app/)** — Live demo (backend must run locally for data).

A real-time satellite and vessel tracking app built with React, Cesium.js, and Node.js.

## Features

- **🛰️ Satellite Tracking** — 3D globe with thousands of active satellites from CelesTrak TLE data, color-coded by type (ISS, Starlink, GPS, debris, etc.)
- **⛵ Vessel Tracking** — Live AIS vessel positions via WebSocket (aisstream.io)
- **🔄 Orbit Propagation** — Smooth orbital interpolation using satellite.js with `SampledPositionProperty`
- **🔍 Distance-based Scaling** — Entities scale gracefully as you zoom
- **📋 Filter by Type** — Toggle satellite categories or apply vessel filters
- **🎯 Click to Track** — Click to fly, double-click to follow and show orbit path

## Architecture

```
surveillance/
├── backend/        — Node.js / Fastify + Redis + cron (satellite cache, AIS WebSocket)
├── frontend/       — React / Cesium.js / Vite + Layer system (satellite, vessel)
└── README.md
```

- **Backend**: Service per data source → Redis cache → Fastify REST routes  
- **Frontend**: React Query hooks → `Layer` interface → `Cesium.CustomDataSource` per type  
- **Layers**: Each data type (satellite, vessel) implements `enable/disable/update` with its own entity factory and constants  

## Quick Start

```bash
git clone https://github.com/Chavda-Mitul/surveillance.git
cd surveillance
cd backend && npm install && npm run dev   # requires Redis on :6379
cd ../frontend && npm install && npm run dev  # http://localhost:5173
```

## Data Sources

- **Satellites**: [CelesTrak](https://celestrak.org/) — TLE orbital data  
- **Vessels**: [AISstream.io](https://aisstream.io/) — real-time AIS positions  
- **3D Globe**: [Cesium.js](https://cesium.com/)  

## License

MIT