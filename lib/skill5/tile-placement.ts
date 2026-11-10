import {
  MODULE_GROUND_Y,
  MODULE_HEIGHT_FT,
  NOMINAL_PLAN_EXTENT,
  boundsOf,
  extentCorners,
  pointInRing,
  type PlacedModule,
} from "./placement";
import type { ZoningRegion } from "./zoning";

export type TileZoneLink = {
  zoneId: string;
  overlapSqFt: number;
  kind: ZoningRegion["kind"];
};

export type TilePlacementReport = {
  zoneIds: string[];
  links: TileZoneLink[];
  mismatch: boolean;
  unsupported: boolean;
  level: number;
  stackHeightFt: number;
};

function inside(x: number, z: number, points: readonly { x: number; z: number }[]) {
  return pointInRing(x, z, points.map((point) => [point.x, point.z] as [number, number]));
}

/** Area of one polygon that sits inside another. The sample uses the actual corners. */
export function footprintOverlapSqFt(corners: readonly { x: number; z: number }[], zone: readonly { x: number; z: number }[]) {
  if (corners.length < 3 || zone.length < 3) return 0;
  const box = boundsOf(corners);
  const step = 2;
  let area = 0;
  for (let x = box.minX + step / 2; x < box.maxX; x += step) {
    for (let z = box.minZ + step / 2; z < box.maxZ; z += step) {
      if (!inside(x, z, corners) || !inside(x, z, zone)) continue;
      area += step * step;
    }
  }
  return area;
}

function tileCorners(instance: PlacedModule) {
  return extentCorners(NOMINAL_PLAN_EXTENT, instance.transform.position, instance.transform.rotationY, instance.mirror);
}

function elevationsMeet(tileY: number, zone: ZoningRegion) {
  const zoneBase = MODULE_GROUND_Y + zone.baseFt;
  const zoneTop = zoneBase + zone.heightFt;
  return tileY < zoneTop - 0.05 && tileY + MODULE_HEIGHT_FT > zoneBase + 0.05;
}

export function reportTiles(instances: readonly PlacedModule[], zones: readonly ZoningRegion[]): Record<string, TilePlacementReport> {
  const corners = new Map(instances.map((instance) => [instance.instanceId, tileCorners(instance)]));
  const reports: Record<string, TilePlacementReport> = {};
  for (const instance of instances) {
    const own = corners.get(instance.instanceId) ?? [];
    const links: TileZoneLink[] = [];
    for (const zone of zones) {
      if (!zone.visible) continue;
      const overlapSqFt = footprintOverlapSqFt(own, zone.points);
      if (overlapSqFt < 8 || !elevationsMeet(instance.transform.position.y, zone)) continue;
      links.push({ zoneId: zone.id, overlapSqFt, kind: zone.kind });
    }
    const planNeighbors = instances.filter((other) => {
      if (other.instanceId === instance.instanceId) return false;
      return footprintOverlapSqFt(own, corners.get(other.instanceId) ?? []) > 8;
    });
    const supporters = planNeighbors.filter((other) => Math.abs(instance.transform.position.y - (other.transform.position.y + MODULE_HEIGHT_FT)) <= 1.5);
    const bases = [instance, ...planNeighbors].map((item) => item.transform.position.y);
    const program = instance.program;
    reports[instance.instanceId] = {
      zoneIds: links.map((link) => link.zoneId),
      links,
      mismatch: links.some((link) => program == null || program === "unassigned" || link.kind !== program),
      unsupported: instance.transform.position.y > MODULE_GROUND_Y + 1 && supporters.length === 0,
      level: Math.round((instance.transform.position.y - MODULE_GROUND_Y) / MODULE_HEIGHT_FT),
      stackHeightFt: Math.max(...bases) + MODULE_HEIGHT_FT - Math.min(...bases),
    };
  }
  return reports;
}
