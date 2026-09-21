/**
 * Flight data types matching the OpenSky API response
 */
export interface Flight {
  /** ICAO 24-bit transponder ID (hex string) */
  icao24: string
  /** Flight callsign (airline + flight number) */
  callsign: string
  /** Country of origin */
  originCountry: string
  /** Last position update timestamp (epoch seconds) */
  timePosition: number
  /** Last contact timestamp (epoch seconds) */
  lastContact: number
  /** Longitude in decimal degrees */
  longitude: number
  /** Latitude in decimal degrees */
  latitude: number
  /** Barometric altitude in metres */
  baroAltitude: number
  /** Velocity in m/s */
  velocity: number
  /** Heading/true track in degrees (0-360) */
  heading: number
  /** Vertical rate in m/s */
  verticalRate: number
  /** Whether the aircraft is on the ground */
  onGround: boolean
  /** Geometric altitude in metres */
  geoAltitude: number
  /** Mode A squawk code */
  squawk: string
}

/**
 * Flight filter types
 */
export type FlightFilter = "all" | "commercial" | "cargo" | "private" | "military"

/**
 * Route data for a specific flight
 */
export interface FlightRoute {
  icao24: string
  callsign: string
  /** Estimated departure airport ICAO code */
  estDepartureAirport: string | null
  /** Estimated arrival airport ICAO code */
  estArrivalAirport: string | null
  /** Coordinates of departure airport */
  departureCoords: { latitude: number; longitude: number } | null
  /** Coordinates of arrival airport */
  arrivalCoords: { latitude: number; longitude: number } | null
  /** Full trajectory path (lat/lon/alt/time) */
  path: Array<{ latitude: number; longitude: number; altitude: number; time: number }>
  /** Whether any route data was found */
  hasRoute: boolean
}

/**
 * Categorize a flight based on callsign patterns
 */
export function classifyFlight(callsign: string): FlightFilter {
  if (!callsign) return "private"

  const upper = callsign.toUpperCase()

  // Military callsign patterns
  if (
    /^(RCH|REACH|OIE|NAVY|ARMY|AIR\s*FORCE|GUARD|GAF|BAF|FAB|CFC|HRZ|HYDRA|TOPAZ|VIPER|HAWK|RAVEN)/.test(upper) ||
    /^\d{4,}$/.test(upper) // Pure numeric often = military
  ) {
    return "military"
  }

  // Cargo airlines
  const cargoPatterns = [
    /^UPS/, /^FEDEX?/, /^DHL/, /^FDX/, /^CLX/, /^CKS/, /^GTI/, /^ABX/,
    /^Cargo/, /^BOX/, /^GEC/, /^SVA/, /^ETH/, /^KAL/,
  ]
  for (const pattern of cargoPatterns) {
    if (pattern.test(upper)) return "cargo"
  }

  // Major commercial airlines
  const commercialPatterns = [
    /^AAL/, /^UAL/, /^DAL/, /^SWA/, /^JBU/, /^RYR/, /^EZY/, /^BAW/,
    /^AFR/, /^DLH/, /^THY/, /^SIA/, /^CPA/, /^QTR/, /^ETD/, /^EVA/,
    /^CES/, /^CSN/, /^CCA/, /^ANA/, /^JAL/, /^KLM/, /^VIR/, /^FIN/,
    /^ICE/, /^WJA/, /^ROU/, /^ACA/, /^TAP/, /^AZA/, /^IBE/, /^LAN/,
    /^AVA/, /^KQA/, /^MAS/, /^UAL/, /^AAR/, /^GLO/, /^TAM/, /^ONE/,
  ]
  for (const pattern of commercialPatterns) {
    if (pattern.test(upper)) return "commercial"
  }

  return "private"
}

/**
 * Get altitude category for colour-coding
 */
export function getAltitudeCategory(altitude: number): "low" | "cruise" | "high" {
  if (altitude < 3000) return "low"       // Below 10,000 ft
  if (altitude < 9000) return "cruise"    // 10,000-30,000 ft
  return "high"                            // Above 30,000 ft
}

/**
 * Get speed category
 */
export function getSpeedCategory(velocity: number): "slow" | "normal" | "fast" {
  if (velocity < 100) return "slow"       // < 360 km/h
  if (velocity < 240) return "normal"     // 360-864 km/h
  return "fast"                           // > 864 km/h
}