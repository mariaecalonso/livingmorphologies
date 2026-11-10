import towersFile from "@/data/skill5/sun-analysis-towers.json";
import { inStudy, ringCentroid } from "@/components/site/site-geometry";
import type { SunSample } from "@/lib/skill5/solar";
import type { SiteBuilding, XZ } from "@/lib/skill5/site-model";

export type AnalysisTower = {
  id: string;
  name: string;
  hostName: string;
  /** Published architectural height, in feet. */
  heightFeet: number;
  /** Stored complex height the shaft sits on, in feet. */
  baseFeet: number;
  plan: string;
  heightCitation: string;
  ring: XZ[];
};

type TowerRecord = Omit<AnalysisTower, "baseFeet">;

const towerRecords = towersFile.towers as unknown as TowerRecord[];

/** Analysis-only shafts. The stored building records are not changed. */
export function analysisTowers(buildings: readonly Pick<SiteBuilding, "name" | "heightFeet">[]): AnalysisTower[] {
  return towerRecords.map((tower) => {
    const host = buildings.find((building) => building.name === tower.hostName);
    const baseFeet = host?.heightFeet ?? 0;
    return { ...tower, ring: tower.ring.map((point) => [point[0], point[1]] as XZ), baseFeet: Math.min(baseFeet, tower.heightFeet) };
  });
}

export function heightAccount(buildings: readonly SiteBuilding[]) {
  const drawn = buildings.filter((building) => {
    const [x, z] = ringCentroid(building.ring);
    return inStudy(x, z) && building.heightFeet !== null && building.heightFeet > 0;
  });
  return {
    drawn: drawn.length,
    estimated: drawn.filter((building) => building.heightSource === "estimated").length,
    stories: drawn.filter((building) => building.heightSource === "osm-levels").length,
    tagged: drawn.filter((building) => building.heightSource === "osm-height" || building.heightSource === "county").length,
  };
}

export type StoredBox = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

export function casterBox(buildings: readonly SiteBuilding[], towers: readonly Pick<AnalysisTower, "ring" | "heightFeet">[]): StoredBox {
  const box: StoredBox = { minX: Infinity, minY: 0, minZ: Infinity, maxX: -Infinity, maxY: 1, maxZ: -Infinity };
  const include = (ring: readonly XZ[], height: number) => {
    box.maxY = Math.max(box.maxY, height);
    for (const [x, z] of ring) {
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minZ = Math.min(box.minZ, z);
      box.maxZ = Math.max(box.maxZ, z);
    }
  };
  for (const building of buildings) {
    const [x, z] = ringCentroid(building.ring);
    if (!inStudy(x, z) || building.heightFeet === null || building.heightFeet <= 0) continue;
    include(building.ring, building.heightFeet);
  }
  for (const tower of towers) include(tower.ring, tower.heightFeet);
  if (!Number.isFinite(box.minX)) return { minX: -100, minY: 0, minZ: -100, maxX: 100, maxY: 100, maxZ: 100 };
  return box;
}

/** Where a point meets flat ground at y = 0. The ray is not shortened. */
export function groundShadow(x: number, y: number, z: number, toSun: readonly [number, number, number]) {
  const up = toSun[1];
  if (up <= 0) return null;
  const travel = y / up;
  const east = toSun[0];
  const north = toSun[2];
  return {
    x: x - east * travel,
    y: 0,
    z: z - north * travel,
    rayFeet: travel,
    horizontalFeet: Math.hypot(east, north) * travel,
  };
}

/** Caster corners and their full ground projections, in stored feet. */
export function storedShadowPoints(box: StoredBox, toSun: readonly [number, number, number]) {
  const points: Array<[number, number, number]> = [];
  for (const x of [box.minX, box.maxX]) {
    for (const y of [box.minY, box.maxY]) {
      for (const z of [box.minZ, box.maxZ]) {
        points.push([x, y, z]);
        const grounded = groundShadow(x, y, z, toSun);
        if (grounded) points.push([grounded.x, grounded.y, grounded.z]);
      }
    }
  }
  return points;
}

export type SunRunRecord = {
  id: string;
  date: string;
  time: string;
  zoneName: string;
  offsetMinutes: number;
  altitude: number;
  azimuth: number;
  above: boolean;
  shadowPerFoot: number | null;
};

export function sunRunRecord(index: number, date: string, time: string, zoneName: string, offsetMinutes: number, sun: SunSample): SunRunRecord {
  return {
    id: `${date}T${time}${offsetMinutes}-${index}`,
    date,
    time,
    zoneName,
    offsetMinutes,
    altitude: sun.altitude,
    azimuth: sun.azimuth,
    above: sun.above,
    shadowPerFoot: sun.shadowPerFoot,
  };
}

export function keepRuns<T>(runs: readonly T[], next: T) {
  return [...runs, next].slice(-2);
}
