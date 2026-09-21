import * as Cesium from "cesium"
import type { Layer } from "../../Layer"
import type { EarthquakeEvent, EarthquakeFilter } from "./earthquakeTypes"
import { filterToMinMag } from "./earthquakeTypes"
import { EarthquakeEntityFactory } from "./entityFactory"

/**
 * Custom event name dispatched on click so App.tsx can show an info overlay
 */
const EARTHQUAKE_INFO_EVENT = "earthquakeInfoRequest"

/**
 * Earthquake / Natural Hazard Layer
 *
 * Renders live USGS earthquake events on the Cesium globe.
 * Each event is a colour-coded point scaled by magnitude.
 * Clicking an event flies the camera to it and dispatches an info event.
 */
export class EarthquakeLayer implements Layer {
  readonly id = "earthquake"
  readonly name = "Earthquakes"

  private viewer: Cesium.Viewer
  private dataSource: Cesium.CustomDataSource | null = null
  private enabled = false
  private filter: EarthquakeFilter = "all"
  private earthquakeData: EarthquakeEvent[] = []
  private dataLoaded = false

  /** id -> Cesium.Entity map */
  private entities: Map<string, Cesium.Entity> = new Map()

  private removeClickHandler: (() => void) | null = null

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true
    this.setupClickHandler()
    if (this.dataLoaded) {
      this.renderEntities()
    }
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.removeClickHandler?.()
    this.removeClickHandler = null
    this.clearEntities()
  }

  update(): void {
    // Earthquakes are static — no per-frame update needed.
    // Data refresh happens via React Query polling + loadData().
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getEntities(): Cesium.Entity[] {
    return Array.from(this.entities.values())
  }

  setFilter(filter: EarthquakeFilter): void {
    this.filter = filter
    if (this.enabled && this.dataLoaded) {
      this.renderEntities()
    }
  }

  getFilter(): EarthquakeFilter {
    return this.filter
  }

  setDataSource(dataSource: Cesium.CustomDataSource): void {
    this.dataSource = dataSource
  }

  /**
   * Load new data from React Query / API.
   * Called by App.tsx when earthquake data arrives.
   */
  loadData(data: EarthquakeEvent[]): void {
    this.earthquakeData = data
    this.dataLoaded = true

    if (this.enabled) {
      this.renderEntities()
    }
  }

  // ─── Private helpers ──────────────────────────────────────────

  private get entityCollection(): Cesium.EntityCollection {
    return this.dataSource?.entities ?? this.viewer.entities
  }

  /**
   * Render earthquake entities based on current filter.
   * Removes stale entities and creates new ones.
   */
  private renderEntities(): void {
    this.clearEntities()

    const minMag = filterToMinMag(this.filter)
    const filtered = minMag !== undefined
      ? this.earthquakeData.filter((e) => e.magnitude >= minMag)
      : this.earthquakeData

    const collection = this.entityCollection

    for (const event of filtered) {
      const entity = EarthquakeEntityFactory.createEntity(event, collection)
      this.entities.set(event.id, entity)
    }
  }

  /**
   * Set up click handler: fly to the earthquake and dispatch info event.
   */
  private setupClickHandler(): void {
    const handler = this.viewer.screenSpaceEventHandler
    if (!handler) return

    this.removeClickHandler = handler.setInputAction(
      (click: { position: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(click.position)
        if (!Cesium.defined(picked) || !picked.id) return

        const entity = picked.id as Cesium.Entity
        if (!entity.id?.startsWith("earthquake-")) return

        const eqId = entity.id.replace("earthquake-", "")
        const event = this.earthquakeData.find((e) => e.id === eqId)
        if (!event) return

        // Dispatch info event for UI overlay
        window.dispatchEvent(
          new CustomEvent(EARTHQUAKE_INFO_EVENT, {
            detail: event,
          })
        )

        // Fly to the earthquake location
        this.viewer.flyTo(entity, {
          offset: new Cesium.HeadingPitchRange(
            0,
            Cesium.Math.toRadians(-60),
            this.getFlyAltitude(event.magnitude)
          ),
          duration: 1.5,
        })
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    )
  }

  /**
   * Determine a good fly-to altitude based on magnitude.
   * Stronger quakes = further out for context.
   */
  private getFlyAltitude(magnitude: number): number {
    if (magnitude >= 6.0) return 500_000
    if (magnitude >= 4.5) return 200_000
    return 100_000
  }

  /**
   * Remove all earthquake entities from the collection.
   */
  private clearEntities(): void {
    const collection = this.entityCollection
    for (const entity of this.entities.values()) {
      collection.remove(entity)
    }
    this.entities.clear()
  }
}

export { EARTHQUAKE_INFO_EVENT }