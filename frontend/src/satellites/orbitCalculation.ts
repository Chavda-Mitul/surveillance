import * as satellite from "satellite.js";

export function getSatellitePosition(satrec: satellite.SatRec) {

  const now = new Date();

  const positionAndVelocity = satellite.propagate(satrec, now);

  const position = positionAndVelocity?.position;

  if (!position) return null;

  const gmst = satellite.gstime(now);

  const geo = satellite.eciToGeodetic(position, gmst);

  const lat = satellite.degreesLat(geo.latitude);
  const lon = satellite.degreesLong(geo.longitude);
  const height = geo.height * 1000; // meters

  return {
    lat,
    lon,
    height
  };
}