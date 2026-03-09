import * as satellite from "satellite.js"
import * as Cesium from "cesium"

export function createSatrec(line1: string, line2: string) {
  return satellite.twoline2satrec(line1, line2)
}

export function getPosition(satrec: satellite.SatRec) {
  const now = new Date()
  return getPositionAtTime(satrec, Cesium.JulianDate.fromDate(now))
}

// Get position at a specific Cesium time
export function getPositionAtTime(satrec: satellite.SatRec, cesiumTime: Cesium.JulianDate): { lat: number; lon: number; alt: number } | null {
  const jsDate = Cesium.JulianDate.toDate(cesiumTime)
  
  const pv = satellite.propagate(satrec, jsDate)
  if (!pv?.position) return null

  const gmst = satellite.gstime(jsDate)
  const geo = satellite.eciToGeodetic(pv.position, gmst)
  
  return {
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    alt: geo.height * 1000
  }
}

export function classifySatellite(name: string): string {

  const n = name.toLowerCase()

  // ISS detection
  if (n.includes("iss") || n.includes("zarya") || n.includes("international space station")) return "iss"

  if (n.includes("starlink")) return "communications"
  if (n.includes("gps")) return "gps"
  if (n.includes("galileo")) return "gps"
  if (n.includes("glonass")) return "gps"
  if (n.includes("iridium")) return "communications"
  if (n.includes("deb")) return "debris"
  if (n.includes("r/b")) return "debris"

  return "other"
}


export interface OrbitSegments {
  positions: Cesium.Cartesian3[]
}

// Returns a single clean orbital loop for visualization
export function getOrbitSegments(satrec: satellite.SatRec): OrbitSegments {
  const positions: Cesium.Cartesian3[] = []

  const now = new Date()

  // Period in minutes = 2π / meanMotion (satrec.no is in radians/minute)
  const periodMinutes = (2 * Math.PI) / satrec.no

  // Use smaller step for smoother orbits (0.5 minutes = 30 seconds)
  // This gives ~240 points for a 2-hour orbit, ~180 points for a 90-minute LEO orbit
  const step = 0.5

  // Sample from 0 to periodMinutes (one full orbit starting from current position)
  // This produces a clean closed loop without twisted paths
  for (let t = 0; t <= periodMinutes; t += step) {
    const time = new Date(now.getTime() + t * 60000)

    const pv = satellite.propagate(satrec, time)

    if (!pv || typeof pv.position === "boolean" || !pv.position) continue

    const gmst = satellite.gstime(time)
    const geo = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gmst)

    const lat = satellite.degreesLat(geo.latitude)
    const lon = satellite.degreesLong(geo.longitude)
    const alt = geo.height * 1000

    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt)

    positions.push(pos)
  }

  return { positions }
}
