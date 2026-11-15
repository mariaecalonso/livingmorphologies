import { tileAabb, tileFootprint } from "./gumball";
import {
  MODULE_GROUND_Y,
  boundsOf,
  pointInRing,
  type PlacedModule,
} from "./placement";
import type { ZoningRegion } from "./zoning";

export type TileZoneLink = {
  zoneId: string;
  overlapSqFt: number;
  kind: ZoningRegion["kind"];
  /** The tile sits in the stored volume. A footprint link is an upper floor over the same plan. */
  aboveVolume: boolean;
};

export type TilePlacementReport = {
  zoneIds: string[];
  links: TileZoneLink[];
  /** volume shares the stored height. footprint is an upper floor over that plan. none has no plan overlap. */
  coverage: "volume" | "footprint" | "none";
  mismatch: boolean;
  /** No tile below meets this footprint. This is a geometric check, not a structural one. */
  unsupported: boolean;
  level: number;
  stackHeightFt: number;
};

function ringOf(points: readonly { x: number; z: number }[]) {
  return points.map((point) => [point.x, point.z] as [number, number]);
}

/** Area of one polygon that sits inside another. The sample uses the actual corners. */
export function footprintOverlapSqFt(corners: readonly { x: number; z: number }[], zone: readonly { x: number; z: number }[]) {
  if (corners.length < 3 || zone.length < 3) return 0;
  const box = boundsOf(corners);
  const other = boundsOf(zone);
  if (box.maxX <= other.minX || box.minX >= other.maxX || box.maxZ <= other.minZ || box.minZ >= other.maxZ) return 0;
  const cornerRing = ringOf(corners);
  const zoneRing = ringOf(zone);
  const step = 2;
  let area = 0;
  for (let x = box.minX + step / 2; x < box.maxX; x += step) {
    for (let z = box.minZ + step / 2; z < box.maxZ; z += step) {
      if (!pointInRing(x, z, cornerRing) || !pointInRing(x, z, zoneRing)) continue;
      area += step * step;
    }
  }
  return area;
}

function tileCorners(instance: PlacedModule) {
  return tileFootprint(instance);
}

function elevationsMeet(instance: PlacedModule, zone: ZoningRegion) {
  const box = tileAabb(instance);
  const zoneBase = MODULE_GROUND_Y + zone.baseFt;
  const zoneTop = zoneBase + zone.heightFt;
  return box.minY < zoneTop - 0.05 && box.maxY > zoneBase + 0.05;
}

export function reportTiles(instances: readonly PlacedModule[], zones: readonly ZoningRegion[]): Record<string, TilePlacementReport> {
  const corners = new Map(instances.map((instance) => [instance.instanceId, tileCorners(instance)]));
  const reports: Record<string, TilePlacementReport> = {};
  for (const instance of instances) {
    const own = corners.get(instance.instanceId) ?? [];
    const links: TileZoneLink[] = [];
    const footprintMatches: TileZoneLink[] = [];
    for (const zone of zones) {
      if (!zone.visible) continue;
      const overlapSqFt = footprintOverlapSqFt(own, zone.points);
      if (overlapSqFt < 8) continue;
      const zoneBase = MODULE_GROUND_Y + zone.baseFt;
      const inVolume = elevationsMeet(instance, zone);
      const overPlan = tileAabb(instance).minY >= zoneBase - 0.5;
      if (inVolume) links.push({ zoneId: zone.id, overlapSqFt, kind: zone.kind, aboveVolume: false });
      else if (overPlan) footprintMatches.push({ zoneId: zone.id, overlapSqFt, kind: zone.kind, aboveVolume: true });
    }
    if (links.length === 0) links.push(...footprintMatches);
    const planNeighbors = instances.filter((other) => {
      if (other.instanceId === instance.instanceId) return false;
      return footprintOverlapSqFt(own, corners.get(other.instanceId) ?? []) > 8;
    });
    const ownBox = tileAabb(instance);
    const supporters = planNeighbors.filter((other) => Math.abs(ownBox.minY - tileAabb(other).maxY) <= 1.5);
    const boxes = [instance, ...planNeighbors].map((item) => tileAabb(item));
    const program = instance.program;
    reports[instance.instanceId] = {
      zoneIds: links.map((link) => link.zoneId),
      links,
      coverage: links.some((link) => !link.aboveVolume) ? "volume" : links.length > 0 ? "footprint" : "none",
      mismatch: links.some((link) => program == null || program === "unassigned" || link.kind !== program),
      unsupported: ownBox.minY > MODULE_GROUND_Y + 1 && supporters.length === 0,
      level: Math.round((ownBox.minY - MODULE_GROUND_Y) / 20),
      stackHeightFt: Math.max(...boxes.map((box) => box.maxY)) - Math.min(...boxes.map((box) => box.minY)),
    };
  }
  return reports;
}
