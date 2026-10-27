/** Local tangent plane at a geographic origin. X is east, Z is north, unit is the international foot. */

const METERS_PER_FOOT = 0.3048;

export type GeoOrigin = { lat: number; lon: number };

export function feetPerDegree(latDeg: number) {
  const phi = (latDeg * Math.PI) / 180;
  const metersLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi) - 0.0023 * Math.cos(6 * phi);
  const metersLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi);
  return {
    east: metersLon / METERS_PER_FOOT,
    north: metersLat / METERS_PER_FOOT,
  };
}

export function projectLocal(lon: number, lat: number, origin: GeoOrigin) {
  const scale = feetPerDegree(origin.lat);
  return {
    x: (lon - origin.lon) * scale.east,
    z: (lat - origin.lat) * scale.north,
  };
}

export const METERS_TO_FEET = 1 / METERS_PER_FOOT;
