import * as Cesium from "cesium"
import type { SatelliteRefs } from "./satelliteTypes"
import { getOrbitSegments } from "../../../satellites/orbit"
import { ORBIT_PATH_COLOR, ORBIT_PATH_WIDTH, ORBIT_PATH_GLOW_POWER, FLYTO_HEADING_PITCH_RANGE, FLYTO_DURATION_SECONDS } from "./constants"

/**
 * Event handlers for satellite interactions
 * Separated from SatelliteLayer to improve modularity
 */

export class SatelliteEventHandlers {
  private viewer: Cesium.Viewer
  private refs: SatelliteRefs
  private lastHovered: Cesium.Entity | null = null

  constructor(viewer: Cesium.Viewer, refs: SatelliteRefs) {
    this.viewer = viewer
    this.refs = refs
  }

  /**
   * Set up all event handlers
   */
  setupHandlers(): void {
    this.setupClickHandler()
    this.setupDoubleClickHandler()
    this.setupHoverHandler()
  }

  /**
   * Handle single click - show label and fly to satellite
   */
  private setupClickHandler(): void {
    this.viewer.screenSpaceEventHandler?.setInputAction(
      (click: { position: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(click.position)

        if (!Cesium.defined(picked) || !picked.id) return

        const entity = picked.id as Cesium.Entity
        this.showEntityLabel(entity)
        this.flyToEntity(entity)
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    )
  }

  /**
   * Handle double click - track satellite and show orbit
   */
  private setupDoubleClickHandler(): void {
    this.viewer.screenSpaceEventHandler?.setInputAction(
      (click: { position: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(click.position)

        if (!Cesium.defined(picked) || !picked.id) return

        const entity = picked.id as Cesium.Entity
        this.trackEntity(entity)
        this.showOrbitPath(entity)
      },
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    )
  }

  /**
   * Handle hover - show/hide labels
   */
  private setupHoverHandler(): void {
    this.viewer.screenSpaceEventHandler?.setInputAction(
      (movement: { endPosition: Cesium.Cartesian2 }) => {
        const picked = this.viewer.scene.pick(movement.endPosition)

        // Hide last hovered label
        if (this.lastHovered) {
          this.hideEntityLabel(this.lastHovered)
        }

        if (Cesium.defined(picked) && picked.id) {
          const entity = picked.id as Cesium.Entity
          this.showEntityLabel(entity)
          this.lastHovered = entity
        } else {
          this.lastHovered = null
        }
      },
      Cesium.ScreenSpaceEventType.MOUSE_MOVE
    )
  }

  /**
   * Show entity label
   */
  private showEntityLabel(entity: Cesium.Entity): void {
    if (entity.label) {
      entity.label.show = new Cesium.ConstantProperty(true)
    }
  }

  /**
   * Hide entity label
   */
  private hideEntityLabel(entity: Cesium.Entity): void {
    if (entity.label) {
      entity.label.show = new Cesium.ConstantProperty(false)
    }
  }

  /**
   * Fly camera to entity
   */
  private flyToEntity(entity: Cesium.Entity): void {
    this.viewer.flyTo(entity, {
      offset: FLYTO_HEADING_PITCH_RANGE,
      duration: FLYTO_DURATION_SECONDS,
    })
  }

  /**
   * Track entity with camera
   */
  private trackEntity(entity: Cesium.Entity): void {
    this.viewer.trackedEntity = entity
  }

  /**
   * Show orbit path for entity
   */
  private showOrbitPath(entity: Cesium.Entity): void {
    const satrec = this.refs.satrecs[entity.id]
    if (!satrec) return

    // Remove existing orbit paths
    this.clearOrbitPaths()

    // Generate orbit path
    const { positions } = getOrbitSegments(satrec)

    if (positions.length > 1) {
      const orbitEntity = this.viewer.entities.add({
        polyline: {
          positions: positions,
          width: ORBIT_PATH_WIDTH,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: ORBIT_PATH_GLOW_POWER,
            color: ORBIT_PATH_COLOR,
          }),
          arcType: Cesium.ArcType.NONE,
        },
      })
      this.refs.orbitPaths.push(orbitEntity)
    }
  }

  /**
   * Clear all orbit paths
   */
  clearOrbitPaths(): void {
    this.refs.orbitPaths.forEach((entity) => this.viewer.entities.remove(entity))
    this.refs.orbitPaths = []
  }

  /**
   * Clean up event handlers
   */
  dispose(): void {
    this.lastHovered = null
    this.clearOrbitPaths()
  }
}
