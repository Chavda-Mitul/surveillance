import * as Cesium from "cesium"
import { getOrbitSegments } from "../../satellites/orbit"
import type { SatelliteRefs } from "./types"

export function setupHoverHandler(
  viewer: Cesium.Viewer,
  handler: Cesium.ScreenSpaceEventHandler
) {
  let lastHovered: Cesium.Entity | null = null

  handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.endPosition)

    if (lastHovered?.label) {
      ;(lastHovered.label as any).show = false
    }

    if (Cesium.defined(picked) && picked.id?.label) {
      ;(picked.id.label as any).show = true
      lastHovered = picked.id
    } else {
      lastHovered = null
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
}

export function setupClickHandler(
  viewer: Cesium.Viewer,
  handler: Cesium.ScreenSpaceEventHandler
) {
  handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
    const picked = viewer.scene.pick(click.position)

    if (Cesium.defined(picked) && picked.id) {
      const entity = picked.id as Cesium.Entity
      
      // Show the label when clicked
      if (entity.label) {
        ;(entity.label as any).show = true
      }
      
      viewer.flyTo(entity, {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 500000),
        duration: 1.5,
      })
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
}

export function setupDoubleClickHandler(
  viewer: Cesium.Viewer,
  handler: Cesium.ScreenSpaceEventHandler,
  refs: SatelliteRefs
) {
  handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
    const picked = viewer.scene.pick(click.position)

    if (!Cesium.defined(picked) || !picked.id) return

    const entity = picked.id as Cesium.Entity
    viewer.trackedEntity = entity

    const satrec = refs.satrecs[entity.id]
    if (!satrec) return

    refs.orbitPaths.forEach((e) => viewer.entities.remove(e))
    refs.orbitPaths = []

    const { positions } = getOrbitSegments(satrec)

    // Draw a single clean orbital loop
    if (positions.length > 1) {
      const orbitEntity = viewer.entities.add({
        polyline: {
          positions: positions,
          width: 2,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: Cesium.Color.YELLOW.withAlpha(0.7),
          }),
          arcType: Cesium.ArcType.NONE,
        },
      })
      refs.orbitPaths.push(orbitEntity)
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
}
