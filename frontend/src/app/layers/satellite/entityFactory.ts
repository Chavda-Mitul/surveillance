import * as Cesium from "cesium"
import type { SatelliteData } from "./satelliteTypes"
import { createSatrec, getPositionAtTime, classifySatellite } from "../../../satellites/orbit"
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
 * Handles entity configuration and position sampling
 */

export interface SatelliteEntityConfig {
  id: string
  satelliteData: SatelliteData
  entityCollection: Cesium.EntityCollection
}

export interface CreatedEntity {
  entity: Cesium.Entity
  satrec: any
}

export class SatelliteEntityFactory {
  /**
   * Create a satellite entity with position samples
   */
  static createEntity(config: SatelliteEntityConfig): CreatedEntity | null {
    const { id, satelliteData, entityCollection } = config

    const satrec = createSatrec(satelliteData.line1, satelliteData.line2)
    if (!satrec) return null

    const type = classifySatellite(satelliteData.name)
    const isISS = type === "iss"

    // Create position property with samples
    const positionProperty = this.createPositionProperty(satrec)

    // Create entity
    const entity = entityCollection.add({
      id,
      position: positionProperty,
      availability: this.createAvailability(),
      ...(isISS ? this.createISSVisualization(satelliteData.name, type) : this.createSatelliteVisualization(satelliteData.name, type))
    })

    return { entity, satrec }
  }

  /**
   * Create sampled position property with interpolation
   */
  private static createPositionProperty(satrec: any): Cesium.SampledPositionProperty {
    const positionProperty = new Cesium.SampledPositionProperty()
    positionProperty.setInterpolationOptions({
      interpolationDegree: 2,
      interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
    })

    // Pre-populate with position samples
    const now = Cesium.JulianDate.now()

    for (let i = -2; i < NUM_POSITION_SAMPLES; i++) {
      const time = Cesium.JulianDate.addSeconds(
        now,
        i * UPDATE_INTERVAL_SECONDS,
        new Cesium.JulianDate()
      )
      const position = getPositionAtTime(satrec, time)

      if (position) {
        const cartesian = Cesium.Cartesian3.fromDegrees(
          position.lon,
          position.lat,
          position.alt
        )
        positionProperty.addSample(time, cartesian)
      }
    }

    return positionProperty
  }

  /**
   * Create availability interval
   */
  private static createAvailability(): Cesium.TimeIntervalCollection {
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
   * Update position samples for an existing entity
   */
  static updatePositionSamples(
    entity: Cesium.Entity,
    satrec: any
  ): void {
    if (!entity.position) return

    const positionProperty = entity.position as Cesium.SampledPositionProperty
    const now = Cesium.JulianDate.now()

    // Add new position samples
    for (let i = 0; i < NUM_POSITION_SAMPLES; i++) {
      const time = Cesium.JulianDate.addSeconds(
        now,
        i * UPDATE_INTERVAL_SECONDS,
        new Cesium.JulianDate()
      )
      const position = getPositionAtTime(satrec, time)

      if (position) {
        const cartesian = Cesium.Cartesian3.fromDegrees(
          position.lon,
          position.lat,
          position.alt
        )

        // Only add if sample doesn't exist
        const existingSample = positionProperty.getValue(time)
        if (!existingSample) {
          positionProperty.addSample(time, cartesian)
        }
      }
    }

    // Update availability
    entity.availability = this.createAvailability()
  }
}
