import { useEffect, useRef, useState, useCallback } from "react"
import * as Cesium from "cesium"
import { useSatellites } from "../satellites/useSatellites"
import { classifySatellite } from "../satellites/orbit"

import type  { SatelliteFilter, SatelliteRefs } from "./globe/types"
import { styles } from "./globe/styles"
import { FilterButtons } from "./globe/FilterButtons"
import { HelpPanel } from "./globe/HelpPanel"
import { setupHoverHandler, setupClickHandler, setupDoubleClickHandler } from "./globe/handlers"
import { createSatelliteEntity, updateSatellitePositions } from "./globe/satelliteEntity"

export default function Globe() {
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const refsRef = useRef<SatelliteRefs>({
    entities: {},
    satrecs: {},
    orbitPaths: [],
  })

  const [filter, setFilter] = useState<SatelliteFilter>("gps")
  const { data: satellites } = useSatellites()

  // Initialize Cesium viewer
  useEffect(() => {
    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN

    const viewer = new Cesium.Viewer("globe", {
      timeline: false,
      animation: false,
    })
    viewerRef.current = viewer

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    setupHoverHandler(viewer, handler)
    setupClickHandler(viewer, handler)
    setupDoubleClickHandler(viewer, handler, refsRef.current)

    return () => {
      handler.destroy()
      viewer.destroy()
    }
  }, [])

  // Populate satellites
  useEffect(() => {
    if (!satellites || !viewerRef.current) return

    const viewer = viewerRef.current
    const refs = refsRef.current

    viewer.entities.removeAll()
    refs.orbitPaths = []
    refs.entities = {}
    refs.satrecs = {}

    const filtered = satellites.filter((sat) => {
      if (filter === "all") return true
      return classifySatellite(sat.name) === filter
    })

    filtered.forEach((sat) => createSatelliteEntity(viewer, sat, refs))
  }, [filter, satellites])

  // Update positions every second
  useEffect(() => {
    if (!viewerRef.current || !satellites) return

    const interval = setInterval(() => {
      updateSatellitePositions(refsRef.current)
    }, 1000)

    return () => clearInterval(interval)
  }, [satellites, filter])

  const stopTracking = useCallback(() => {
    if (!viewerRef.current) return

    viewerRef.current.trackedEntity = undefined
    refsRef.current.orbitPaths.forEach((e) => viewerRef.current?.entities.remove(e))
    refsRef.current.orbitPaths = []
  }, [])

  return (
    <div style={styles.container}>
      <FilterButtons
        currentFilter={filter}
        onFilterChange={setFilter}
        onStopTracking={stopTracking}
      />
      <HelpPanel />
      <div id="globe" style={styles.globe} />
    </div>
  )
}
