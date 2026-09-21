import * as Cesium from "cesium"
import type { Layer } from "../../Layer"
import type { Vessel, VesselFilter } from "./vesselTypes"
import { classifyVessel } from "./vesselTypes"
import { VesselEntityFactory } from "./entityFactory"
import { VesselClusterEntityFactory } from "./clusterEntityFactory"
import { getClusteringState, getCameraAltitude, type VesselCluster } from "../../../vessels/clusterer"
import { VESSEL_TRAIL_MAX_POSITIONS } from "./constants"

const VESSEL_INFO_EVENT = "vesselInfoRequest"

interface VesselEntityData {
  entity: Cesium.Entity
  trail: Cesium.Entity | null
  positionHistory: Cesium.Cartesian3[]
}

/**
 * Vessel layer with H3 spatial clustering + trailing paths
 *
 * - At low camera altitudes (<50 km): shows every vessel as an individual point with trail.
 * - At medium altitudes (50–200 km): aggregates into H3 res 6 hex bins (~36 km).
 * - At high altitudes (200–1000 km): H3 res 4 hex bins (~175 km).
 * - At very high altitudes (>1000 km): H3 res 2 hex bins (~870 km).
 *
 * Trails are only shown in individual (close zoom) mode.
 * Clicking a vessel dispatches a VESSEL_INFO_EVENT with vessel data.
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

  // Individual vessel entities + trail data
  private vesselEntityData: Record<string, VesselEntityData> = {}

  // Cluster hex-bin entities (used at far zoom)
  private clusterEntities: Record<string, Cesium.Entity> = {}

  // Track current clustering mode
  private currentMode: "individual" | "clustered" = "individual"
  private currentResolution = -1

  // Camera change listener handle
  private removeCameraListener: (() => void) | null = null

  // Click-handler reference
  private removeClickHandler: (() => void) | null = null

  // Debounce timer for zoom changes
  private reclusterTimer: ReturnType<typeof setTimeout> | null = null

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true

    this.setupCameraListener()
    this.setupClickHandler()

    if (this.dataLoaded) {
      this.refreshView()
    }
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.teardownCameraListener()
    this.removeClickHandler?.()
    this.removeClickHandler = null
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
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getEntities(): Cesium.Entity[] {
    if (this.currentMode === "clustered") {
      return Object.values(this.clusterEntities)
    }
    return Object.values(this.vesselEntityData).map((d) => d.entity)
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

  /**
   * Refresh positions in-place (called on each 30-second data poll).
   * Preserves position history and trails.
   */
  refreshPositions(data: Vessel[]): void {
    if (!this.enabled || !this.dataLoaded) return
    this.vesselData = data

    if (this.currentMode === "individual") {
      this.updateIndividualVesselPositions(data)
    }
    // Clusters are rebuilt only when zoom changes, not on every poll
  }

  private get entityCollection(): Cesium.EntityCollection {
    return this.dataSource?.entities ?? this.viewer.entities
  }

  // ─── Camera listener ────────────────────────────────────────────

  private setupCameraListener(): void {
    const remove = this.viewer.scene.postRender.addEventListener(() => {
      if (!this.enabled || !this.dataLoaded) return

      const altitude = getCameraAltitude(this.viewer)
      const newResolution = this.getResolutionForAltitude(altitude)

      if (newResolution !== this.currentResolution) {
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

  private getResolutionForAltitude(altitudeMeters: number): number {
    if (altitudeMeters < 50_000) return -1
    if (altitudeMeters < 200_000) return 6
    if (altitudeMeters < 1_000_000) return 4
    return 2
  }

  // ─── View refresh ───────────────────────────────────────────────

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

  // ─── Individual vessel rendering (with trails) ──────────────────

  private showIndividuals(): void {
    this.clearClusters()

    const filtered = this.vesselData.filter((v) => {
      if (this.filter === "all") return true
      return classifyVessel(v.vesselType) === this.filter
    })

    const newData: Record<string, VesselEntityData> = {}

    for (const vessel of filtered) {
      const existing = this.vesselEntityData[vessel.mmsi]

      if (existing) {
        // Already exists — preserve entity, trail, and history
        newData[vessel.mmsi] = existing
        delete this.vesselEntityData[vessel.mmsi]

        // Update position and trail
        VesselEntityFactory.updatePosition(
          existing.entity,
          vessel,
          existing.trail,
          existing.positionHistory
        )
      } else {
        // New vessel — create entity + trail
        const { entity, trail } = VesselEntityFactory.createEntity(vessel, this.entityCollection)

        const pos = Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 0)
        newData[vessel.mmsi] = {
          entity,
          trail,
          positionHistory: [pos, pos],
        }
      }
    }

    // Remove stale vessels (and their trails)
    for (const stale of Object.values(this.vesselEntityData)) {
      this.entityCollection.remove(stale.entity)
      if (stale.trail) this.entityCollection.remove(stale.trail)
    }

    this.vesselEntityData = newData
  }

  /**
   * Update individual vessel positions + trails in-place (called on 30s polls).
   * Does NOT re-run clustering logic.
   */
  private updateIndividualVesselPositions(data: Vessel[]): void {
    const latestByMMSI = new Map(data.map((v) => [v.mmsi, v]))

    for (const mmsi of Object.keys(this.vesselEntityData)) {
      const vessel = latestByMMSI.get(mmsi)
      const data = this.vesselEntityData[mmsi]

      if (vessel && data) {
        // Update position
        const newPos = Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 0)

        // Append to position history
        data.positionHistory.push(newPos)
        if (data.positionHistory.length > VESSEL_TRAIL_MAX_POSITIONS) {
          data.positionHistory = data.positionHistory.slice(-VESSEL_TRAIL_MAX_POSITIONS)
        }

        VesselEntityFactory.updatePosition(
          data.entity,
          vessel,
          data.trail,
          data.positionHistory
        )
        latestByMMSI.delete(mmsi)
      }
    }

    // Add new vessels
    for (const [mmsi, vessel] of latestByMMSI) {
      if (this.filter !== "all" && classifyVessel(vessel.vesselType) !== this.filter) continue
      const { entity, trail } = VesselEntityFactory.createEntity(vessel, this.entityCollection)
      const pos = Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 0)
      this.vesselEntityData[mmsi] = {
        entity,
        trail,
        positionHistory: [pos, pos],
      }
    }
  }

  // ─── Tick update (keeps old entities up-to-date between polls) ──

  private updateIndividualVessels(): void {
    const latestByMMSI = new Map(this.vesselData.map((v) => [v.mmsi, v]))

    for (const mmsi of Object.keys(this.vesselEntityData)) {
      const vessel = latestByMMSI.get(mmsi)
      if (vessel) {
        VesselEntityFactory.updatePosition(
          this.vesselEntityData[mmsi].entity,
          vessel,
          this.vesselEntityData[mmsi].trail,
          this.vesselEntityData[mmsi].positionHistory
        )
      }
    }
  }

  // ─── Cluster hex-bin rendering ──────────────────────────────────

  private showClusters(clusters: VesselCluster[]): void {
    this.clearIndividuals()

    this.clusterEntities = VesselClusterEntityFactory.syncClusters(
      clusters,
      this.entityCollection,
      this.clusterEntities
    )
  }

  // ─── Click-to-Info ──────────────────────────────────────────────

  private setupClickHandler(): void {
    const handler = this.viewer.screenSpaceEventHandler
    if (!handler) return

    this.removeClickHandler = handler.setInputAction(
      (click: { position: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(click.position)
        if (!Cesium.defined(picked) || !picked.id) return

        const entity = picked.id as Cesium.Entity
        if (!entity.id?.startsWith("vessel-trail-") && !entity.properties?.mmsi) return

        // Extract MMSI
        const mmsi = entity.properties?.mmsi?.getValue?.(Cesium.JulianDate.now()) as string ?? ""
        if (!mmsi) return

        const vessel = this.vesselData.find((v) => v.mmsi === mmsi)
        if (!vessel) return

        // Dispatch custom event with vessel data
        window.dispatchEvent(
          new CustomEvent(VESSEL_INFO_EVENT, {
            detail: vessel,
          })
        )

        // Fly to vessel
        this.viewer.flyTo(entity, {
          offset: new Cesium.HeadingPitchRange(
            0,
            Cesium.Math.toRadians(-45),
            5000
          ),
          duration: 1.0,
        })
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    )
  }

  // ─── Cleanup ────────────────────────────────────────────────────

  private clearAll(): void {
    this.clearIndividuals()
    this.clearClusters()
  }

  private clearIndividuals(): void {
    for (const data of Object.values(this.vesselEntityData)) {
      this.entityCollection.remove(data.entity)
      if (data.trail) this.entityCollection.remove(data.trail)
    }
    this.vesselEntityData = {}
  }

  private clearClusters(): void {
    for (const entity of Object.values(this.clusterEntities)) {
      this.entityCollection.remove(entity)
    }
    this.clusterEntities = {}
  }
}

export { VESSEL_INFO_EVENT }