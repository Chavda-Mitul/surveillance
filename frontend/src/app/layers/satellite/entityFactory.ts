import * as Cesium from "cesium"
import type { SatelliteData } from "./satelliteTypes"
import { createSatrec, classifySatellite } from "../../../satellites/orbit"
import type { PositionResult } from "../../../satellites/workerPool"
import {
  SCALE_BY_DISTANCE,
  LABEL_DISTANCE_CONDITION,
  ISS_BILLBOARD_SIZE,
  ISS_LABEL_OFFSET_Y,
  ISS_LABEL_FONT,
  SATELLITE_POINT_SIZE,
  SATELLITE_OUTLINE_WIDTH,
  SATELLITE_LABEL_OFFSET_Y,
  SATELLITE_LABEL_FONT,
  UPDATE_INTERVAL_SECONDS,
  NUM_POSITION_SAMPLES,
  AVAILABILITY_BUFFER_SECONDS,
  SATELLITE_COLORS,
} from "./constants"

/**
 * Factory for creating satellite entities
 * Handles entity configuration and deferred position sampling.
 *
 * SGP4 propagation runs entirely in the Web Worker — no main-thread math.
 * Entities are created with an empty SampledPositionProperty; the worker
 * populates the samples asynchronously so the first frame is never blocked.
 */

export interface SatelliteEntityConfig {
  id: string
  satelliteData: SatelliteData
  entityCollection: Cesium.EntityCollection
}

export interface CreatedEntity {
  entity: Cesium.Entity
  satrec: any
  positionProperty: Cesium.SampledPositionProperty
}

export class SatelliteEntityFactory {
  /**
   * Create a satellite entity WITHOUT position samples.
   *
   * The caller is responsible for populating the SampledPositionProperty
   * via the Web Worker (see applyBatchResults).
   *
   * Only satrec creation and string-based classification happen here —
   * both are cheap and never block the render loop.
   */
  static createEntity(config: SatelliteEntityConfig): CreatedEntity | null {
    const { id, satelliteData, entityCollection } = config

    let satrec
    try {
      satrec = createSatrec(satelliteData.line1, satelliteData.line2)
    } catch {
      // Malformed TLE — skip this satellite
      return null
    }
    if (!satrec) return null

    const type = classifySatellite(satelliteData.name)
    const isISS = type === "iss"

    // Empty position property — no SGP4 math on the main thread.
    // Samples are added asynchronously by the Web Worker.
    const positionProperty = new Cesium.SampledPositionProperty()
    positionProperty.setInterpolationOptions({
      interpolationDegree: 2,
      interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
    })

    // Create entity (no position samples yet — will appear once worker responds)
    const entity = entityCollection.add({
      id,
      position: positionProperty,
      availability: this.createAvailability(),
      ...(isISS ? this.createISSVisualization(satelliteData.name, type) : this.createSatelliteVisualization(satelliteData.name, type))
    })

    return { entity, satrec, positionProperty }
  }

  /**
   * Create availability interval
   */
  static createAvailability(): Cesium.TimeIntervalCollection {
    const now = Cesium.JulianDate.now()

    return new Cesium.TimeIntervalCollection([
      new Cesium.TimeInterval({
        start: Cesium.JulianDate.addSeconds(
          now,
          -AVAILABILITY_BUFFER_SECONDS,
          new Cesium.JulianDate()
        ),
        stop: Cesium.JulianDate.addSeconds(
          now,
          NUM_POSITION_SAMPLES * UPDATE_INTERVAL_SECONDS,
          new Cesium.JulianDate()
        ),
      }),
    ])
  }

  /**
   * Create ISS-specific visualization (billboard)
   */
  private static createISSVisualization(name: string, type: string) {
    return {
      billboard: {
        image: "/icons/international-space-station.svg",
        width: ISS_BILLBOARD_SIZE,
        height: ISS_BILLBOARD_SIZE,
        scaleByDistance: SCALE_BY_DISTANCE,
        color: this.getColor(type),
      },
      label: {
        text: name,
        font: ISS_LABEL_FONT,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, ISS_LABEL_OFFSET_Y),
        distanceDisplayCondition: LABEL_DISTANCE_CONDITION,
        show: new Cesium.ConstantProperty(true),
      },
    }
  }

  /**
   * Create regular satellite visualization (point)
   */
  private static createSatelliteVisualization(name: string, type: string) {
    return {
      point: {
        pixelSize: SATELLITE_POINT_SIZE,
        color: this.getColor(type),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: SATELLITE_OUTLINE_WIDTH,
        scaleByDistance: SCALE_BY_DISTANCE,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          0,
          50_000_000
        ),
      },
      label: {
        text: name,
        font: SATELLITE_LABEL_FONT,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, SATELLITE_LABEL_OFFSET_Y),
        distanceDisplayCondition: LABEL_DISTANCE_CONDITION,
        show: new Cesium.ConstantProperty(false),
      },
    }
  }

  /**
   * Get color for satellite type
   */
  private static getColor(type: string): Cesium.Color {
    return SATELLITE_COLORS[type] || SATELLITE_COLORS.other
  }

  /**
   * Generate the timestamps (as JS ms-since-epoch) for the next batch of samples
   */
  static getSampleTimestamps(): number[] {
    const now = Date.now()
    const timestamps: number[] = []
    for (let i = 0; i < NUM_POSITION_SAMPLES; i++) {
      timestamps.push(now + i * UPDATE_INTERVAL_SECONDS * 1000)
    }
    return timestamps
  }

  /**
   * Apply worker-computed positions to a batch of entities
   *
   * Called asynchronously when the worker returns results — both for
   * the initial sample batch (right after entity creation) and for
   * periodic position updates.
   *
   * Updates each entity's SampledPositionProperty with new samples.
   */
  static applyBatchResults(
    entities: Record<string, Cesium.Entity>,
    results: Record<string, Array<PositionResult | null>>,
    timestamps: number[]
  ): void {
    for (const [id, positions] of Object.entries(results)) {
      try {
        const entity = entities[id]
        if (!entity || !entity.position) continue

        const positionProperty = entity.position as Cesium.SampledPositionProperty

        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i]
          const ts = timestamps[i]
          if (!pos) continue

          const time = Cesium.JulianDate.fromDate(new Date(ts))
          const cartesian = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt)

          // Replace existing sample or add new one
          const existing = positionProperty.getValue(time)
          if (existing) {
            // Remove then re-add to update
            positionProperty.removeSample(time)
          }
          positionProperty.addSample(time, cartesian)
        }

        // Update availability
        if (entity.availability) {
          entity.availability = SatelliteEntityFactory.createAvailability()
        }
      } catch (err) {
        console.warn(`[EntityFactory] applyBatchResults failed for entity ${id}:`, err)
      }
    }
  }
}