/**
 * Web Worker for satellite SGP4 propagation
 * Offloads CPU-heavy satellite.js math from the main thread
 * 
 * Caches satrec objects internally to avoid recreating them on every request.
 * Accepts batch propagation requests and returns position results.
 */

import * as satellite from "satellite.js"

// Cached satellite records keyed by entity ID
const satrecCache = new Map<string, satellite.SatRec>()

// Message types from main thread
interface InitMessage {
  type: "init"
  satellites: Array<{ id: string; tle1: string; tle2: string }>
}

interface PropagateMessage {
  type: "propagate"
  jobs: Array<{
    id: string
    timestamps: number[] // JS timestamps (ms since epoch)
  }>
}

type WorkerMessage = InitMessage | PropagateMessage

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data

  if (msg.type === "init") {
    let successCount = 0
    for (const sat of msg.satellites) {
      try {
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2)
        satrecCache.set(sat.id, satrec)
        successCount++
      } catch {
        // Skip invalid TLE
      }
    }
    self.postMessage({
      type: "initialized",
      count: successCount,
      total: msg.satellites.length,
    })
    return
  }

  if (msg.type === "propagate") {
    const results: Record<string, Array<{ lat: number; lon: number; alt: number } | null>> = {}

    for (const job of msg.jobs) {
      const satrec = satrecCache.get(job.id)
      if (!satrec) {
        results[job.id] = job.timestamps.map(() => null)
        continue
      }

      const positions = job.timestamps.map((ts) => {
        try {
          const date = new Date(ts)
          const pv = satellite.propagate(satrec, date)
          if (!pv || typeof pv.position === "boolean" || !pv.position) return null

          const gmst = satellite.gstime(date)
          const geo = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gmst)

          return {
            lat: satellite.degreesLat(geo.latitude),
            lon: satellite.degreesLong(geo.longitude),
            alt: geo.height * 1000,
          }
        } catch {
          return null
        }
      })

      results[job.id] = positions
    }

    self.postMessage({ type: "result", results })
    return
  }
}

// Signal that the worker is ready
self.postMessage({ type: "ready" })