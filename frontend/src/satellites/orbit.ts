import * as satellite from "satellite.js"
import * as Cesium from "cesium"

export function createSatrec(line1: string, line2: string) {
  return satellite.twoline2satrec(line1, line2)
}

export function getPosition(satrec: satellite.SatRec) {

  const now = new Date()

  const pv = satellite.propagate(satrec, now)

  if (!pv?.position) return null

  const gmst = satellite.gstime(now)

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
  past: Cesium.Cartesian3[]
  future: Cesium.Cartesian3[]
}

// Returns past and future orbit segments for professional visualization
export function getOrbitSegments(satrec: satellite.SatRec): OrbitSegments {
  const past: Cesium.Cartesian3[] = []
  const future: Cesium.Cartesian3[] = []

  const now = new Date()

  // Period in minutes = 2π / meanMotion (satrec.no is in radians/minute)
  const periodMinutes = (2 * Math.PI) / satrec.no

  const step = 2 // minutes

  // Calculate from -period to +period (full orbit behind and ahead)
  for (let t = -periodMinutes; t <= periodMinutes; t += step) {
    const time = new Date(now.getTime() + t * 60000)

    const pv = satellite.propagate(satrec, time)

    if (!pv || typeof pv.position === "boolean" || !pv.position) continue

    const gmst = satellite.gstime(time)
    const geo = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gmst)

    const lat = satellite.degreesLat(geo.latitude)
    const lon = satellite.degreesLong(geo.longitude)
    const alt = geo.height * 1000

    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt)

    if (t < 0) {
      past.push(pos)
    } else {
      future.push(pos)
    }
  }

  return { past, future }
}
