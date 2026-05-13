import * as Cesium from "cesium"
import type { Layer } from "../../Layer"
import type { Vessel, VesselFilter } from "./vesselTypes"
import { classifyVessel } from "./vesselTypes"
import { VesselEntityFactory } from "./entityFactory"

export class VesselLayer implements Layer {
  readonly id = "vessel"
  readonly name = "Ships"

  private viewer: Cesium.Viewer
  private dataSource: Cesium.CustomDataSource | null = null
  private enabled = false
  private filter: VesselFilter = "all"
  private vesselData: Vessel[] = []
  private dataLoaded = false
  private entities: Record<string, Cesium.Entity> = {}

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true

    if (this.dataLoaded) {
      this.renderVessels()
    }
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.clearEntities()
  }

  loadData(data: Vessel[]): void {
    this.vesselData = data
    this.dataLoaded = true

    if (this.enabled) {
      this.renderVessels()
    }
  }

  update(): void {
    if (!this.enabled || !this.dataLoaded) return
    this.updatePositions()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getEntities(): Cesium.Entity[] {
    return Object.values(this.entities)
  }

  setFilter(filter: VesselFilter): void {
    this.filter = filter
    if (this.enabled && this.dataLoaded) {
      this.renderVessels()
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

  private renderVessels(): void {
    this.clearEntities()

    const filtered = this.vesselData.filter((v) => {
      if (this.filter === "all") return true
      return classifyVessel(v.vesselType) === this.filter
    })

    for (const vessel of filtered) {
      const entity = VesselEntityFactory.createEntity(vessel, this.entityCollection)
      this.entities[vessel.mmsi] = entity
    }
  }

  private updatePositions(): void {
    const latestByMMSI = new Map(this.vesselData.map((v) => [v.mmsi, v]))

    // Update existing or remove gone vessels
    for (const mmsi of Object.keys(this.entities)) {
      const vessel = latestByMMSI.get(mmsi)
      if (vessel) {
        VesselEntityFactory.updatePosition(this.entities[mmsi], vessel)
      } else {
        this.entityCollection.remove(this.entities[mmsi])
        delete this.entities[mmsi]
      }
    }

    // Add newly appeared vessels that pass the current filter
    for (const vessel of this.vesselData) {
      if (this.entities[vessel.mmsi]) continue
      if (this.filter !== "all" && classifyVessel(vessel.vesselType) !== this.filter) continue
      const entity = VesselEntityFactory.createEntity(vessel, this.entityCollection)
      this.entities[vessel.mmsi] = entity
    }
  }

  private clearEntities(): void {
    for (const entity of Object.values(this.entities)) {
      this.entityCollection.remove(entity)
    }
    this.entities = {}
  }
}
