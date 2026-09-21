import * as Cesium from "cesium"
import type { Layer } from "../../Layer"
import type { Vessel, VesselFilter } from "./vesselTypes"
import { classifyVessel } from "./vesselTypes"
import { VesselEntityFactory } from "./entityFactory"
import { VesselClusterEntityFactory } from "./clusterEntityFactory"
import { getClusteringState, getCameraAltitude, type VesselCluster } from "../../../vessels/clusterer"

/**
 * Vessel layer with H3 spatial clustering
 *
 * - At low camera altitudes (<50 km): shows every vessel as an individual point.
 * - At medium altitudes (50–200 km): aggregates into H3 res 6 hex bins (~36 km).
 * - At high altitudes (200–1000 km): H3 res 4 hex bins (~175 km).
 * - At very high altitudes (>1000 km): H3 res 2 hex bins (~870 km).
 *
 * This keeps WebGL draw calls low at zoomed-out views while retaining
 * full detail when zoomed in.
 */

export class VesselLayer implements Layer {
  readonly id = "vessel"
  readonly name = "Ships"

  private viewer: Cesium.Viewer
  private dataSource: Cesium.CustomDataSource | null = null
  private enabled = false
  private filter: VesselFilter = "all"
  private vesselData: Vessel[] = []
  private dataLoaded = false

  // Individual vessel entities (used at close zoom)
  private vesselEntities: Record<string, Cesium.Entity> = {}

  // Cluster hex-bin entities (used at far zoom)
  private clusterEntities: Record<string, Cesium.Entity> = {}

  // Track current clustering mode to avoid unnecessary re-renders
  private currentMode: "individual" | "clustered" = "individual"
  private currentResolution = -1

  // Camera change listener handle
  private removeCameraListener: (() => void) | null = null

  // Debounce timer for zoom changes
  private reclusterTimer: ReturnType<typeof setTimeout> | null = null

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true

    this.setupCameraListener()

    if (this.dataLoaded) {
      this.refreshView()
    }
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.teardownCameraListener()
    this.clearAll()
  }

  loadData(data: Vessel[]): void {
    this.vesselData = data
    this.dataLoaded = true

    if (this.enabled) {
      this.refreshView()
    }
  }

  update(): void {
    if (!this.enabled || !this.dataLoaded) return

    if (this.currentMode === "individual") {
      this.updateIndividualVessels()
    }
    // Clusters are refreshed via the camera listener, not on every tick
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getEntities(): Cesium.Entity[] {
    if (this.currentMode === "clustered") {
      return Object.values(this.clusterEntities)
    }
    return Object.values(this.vesselEntities)
  }

  setFilter(filter: VesselFilter): void {
    this.filter = filter
    if (this.enabled && this.dataLoaded) {
      this.refreshView()
    }
  }

  getFilter(): VesselFilter {
    return this.filter
  }

  setDataSource(dataSource: Cesium.CustomDataSource): void {
    this.dataSource = dataSource
  }

  private get entityCollection(): Cesium.EntityCollection {
    return this.dataSource?.entities ?? this.viewer.entities
  }

  // ─── Camera listener ────────────────────────────────────────────

  private setupCameraListener(): void {
    // Listen to Cesium's postRender event for camera position changes
    // This fires every frame after the scene renders
    const remove = this.viewer.scene.postRender.addEventListener(() => {
      if (!this.enabled || !this.dataLoaded) return

      const altitude = getCameraAltitude(this.viewer)
      const newResolution = this.getResolutionForAltitude(altitude)

      if (newResolution !== this.currentResolution) {
        // Debounce zoom changes — only re-cluster after 200ms of stability
        if (this.reclusterTimer) clearTimeout(this.reclusterTimer)
        this.reclusterTimer = setTimeout(() => {
          this.reclusterTimer = null
          this.refreshView()
        }, 200)
      }
    })
    this.removeCameraListener = remove
  }

  private teardownCameraListener(): void {
    if (this.removeCameraListener) {
      this.removeCameraListener()
      this.removeCameraListener = null
    }
    if (this.reclusterTimer) {
      clearTimeout(this.reclusterTimer)
      this.reclusterTimer = null
    }
  }

  /**
   * Get the H3 resolution (or -1 for individual) from altitude
   */
  private getResolutionForAltitude(altitudeMeters: number): number {
    if (altitudeMeters < 50_000) return -1
    if (altitudeMeters < 200_000) return 6
    if (altitudeMeters < 1_000_000) return 4
    return 2
  }

  // ─── View refresh ───────────────────────────────────────────────

  /**
   * Recalculate the clustering state and swap entities
   */
  private refreshView(): void {
    const altitude = getCameraAltitude(this.viewer)
    const resolution = this.getResolutionForAltitude(altitude)
    this.currentResolution = resolution

    const state = getClusteringState(this.vesselData, altitude, this.filter)

    if (state.mode === "clustered") {
      this.showClusters(state.clusters)
    } else {
      this.showIndividuals()
    }

    this.currentMode = state.mode
  }

  // ─── Individual vessel rendering ────────────────────────────────

  private showIndividuals(): void {
    // Remove all cluster entities
    this.clearClusters()

    // Build individual vessel entities
    const filtered = this.vesselData.filter((v) => {
      if (this.filter === "all") return true
      return classifyVessel(v.vesselType) === this.filter
    })

    const newEntities: Record<string, Cesium.Entity> = {}

    for (const vessel of filtered) {
      if (this.vesselEntities[vessel.mmsi]) {
        // Already exists — keep it
        newEntities[vessel.mmsi] = this.vesselEntities[vessel.mmsi]
        delete this.vesselEntities[vessel.mmsi]
      } else {
        // New vessel
        const entity = VesselEntityFactory.createEntity(vessel, this.entityCollection)
        newEntities[vessel.mmsi] = entity
      }
    }

    // Remove stale vessel entities
    for (const stale of Object.values(this.vesselEntities)) {
      this.entityCollection.remove(stale)
    }

    this.vesselEntities = newEntities
  }

  private updateIndividualVessels(): void {
    const latestByMMSI = new Map(this.vesselData.map((v) => [v.mmsi, v]))

    // Update positions of existing entities
    for (const mmsi of Object.keys(this.vesselEntities)) {
      const vessel = latestByMMSI.get(mmsi)
      if (vessel) {
        VesselEntityFactory.updatePosition(this.vesselEntities[mmsi], vessel)
      } else {
        this.entityCollection.remove(this.vesselEntities[mmsi])
        delete this.vesselEntities[mmsi]
      }
    }

    // Add new vessels that pass the filter
    for (const vessel of this.vesselData) {
      if (this.vesselEntities[vessel.mmsi]) continue
      if (this.filter !== "all" && classifyVessel(vessel.vesselType) !== this.filter) continue
      const entity = VesselEntityFactory.createEntity(vessel, this.entityCollection)
      this.vesselEntities[vessel.mmsi] = entity
    }
  }

  // ─── Cluster hex-bin rendering ──────────────────────────────────

  private showClusters(clusters: VesselCluster[]): void {
    // Remove all individual vessel entities
    this.clearIndividuals()

    // Sync cluster entities
    this.clusterEntities = VesselClusterEntityFactory.syncClusters(
      clusters,
      this.entityCollection,
      this.clusterEntities
    )
  }

  // ─── Cleanup ────────────────────────────────────────────────────

  private clearAll(): void {
    this.clearIndividuals()
    this.clearClusters()
  }

  private clearIndividuals(): void {
    for (const entity of Object.values(this.vesselEntities)) {
      this.entityCollection.remove(entity)
    }
    this.vesselEntities = {}
  }

  private clearClusters(): void {
    for (const entity of Object.values(this.clusterEntities)) {
      this.entityCollection.remove(entity)
    }
    this.clusterEntities = {}
  }
}