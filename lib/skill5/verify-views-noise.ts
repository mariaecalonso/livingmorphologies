import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STUDY_LIMIT, inStudy } from "../../components/site/site-geometry";
import { pointInRing } from "./placement";
import { analysisTowers, keepRuns } from "./sun-analysis";
import type { SiteBuilding, SiteContext, SiteRoad, XZ } from "./site-model";
import {
  NOISE_LIMITS,
  VIEW_LIMITS,
  bearingVector,
  noiseReading,
  noiseRunRecord,
  noiseSegments,
  observationPoints,
  programNotes,
  sightHeight,
  viewReading,
  viewRunRecord,
  viewSegments,
  type ViewPoint,
} from "./views-noise";

const site = JSON.parse(readFileSync(new URL("../../data/skill5/herald-site.json", import.meta.url), "utf8")) as SiteContext;
const towers = analysisTowers(site.buildings);
const points = observationPoints(site.site.ring, site.coastline.path, site.water.ring);

function auditInside(x: number, z: number, ring: readonly XZ[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, zi] = ring[index];
    const [xj, zj] = ring[previous];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Due-east coastline hit by crossing a constant northing, not the study's general ray solver. */
function auditEastShore(x: number, z: number, path: readonly XZ[]) {
  let best: number | null = null;
  for (let index = 1; index < path.length; index += 1) {
    const [ax, az] = path[index - 1];
    const [bx, bz] = path[index];
    if ((az > z) === (bz > z) || az === bz) continue;
    const along = (z - az) / (bz - az);
    if (along < -1e-6 || along > 1 + 1e-6) continue;
    const hitX = ax + (bx - ax) * along;
    const feet = hitX - x;
    if (feet <= 0.05) continue;
    if (best === null || feet < best) best = feet;
  }
  return best;
}

function auditSegmentFeet(x: number, z: number, a: XZ, b: XZ) {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const length = abx * abx + abz * abz;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((x - a[0]) * abx + (z - a[1]) * abz) / length));
  return Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t));
}

function auditRoadFeet(x: number, z: number, roads: readonly SiteRoad[]) {
  let best = Infinity;
  for (const road of roads) {
    for (let index = 1; index < road.path.length; index += 1) {
      best = Math.min(best, auditSegmentFeet(x, z, road.path[index - 1], road.path[index]));
    }
  }
  return best;
}

function auditRoadFeetSampled(x: number, z: number, roads: readonly SiteRoad[]) {
  let best = Infinity;
  for (const road of roads) {
    for (let index = 1; index < road.path.length; index += 1) {
      const [ax, az] = road.path[index - 1];
      const [bx, bz] = road.path[index];
      const length = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(length / 2));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        best = Math.min(best, Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)));
      }
    }
  }
  return best;
}

assert.equal(bearingVector(0).east, 1);
assert.equal(bearingVector(0).north, 0);
assert.ok(Math.abs(bearingVector(90).north - 1) < 1e-12);
assert.ok(bearingVector(-60).north < 0);
assert.ok(bearingVector(60).north > 0);
assert.equal(sightHeight(5.5, 0, 100), 5.5);
assert.equal(sightHeight(5.5, 100, 100), 0);
assert.equal(sightHeight(5.5, 50, 100), 2.75);

assert.equal(points.length, 5);
for (const point of points) {
  assert.equal(pointInRing(point.x, point.z, site.site.ring), true, `${point.id} parcel`);
  assert.equal(auditInside(point.x, point.z, site.site.ring), true, `${point.id} audit parcel`);
  assert.equal(auditInside(point.x, point.z, site.water.ring), false, `${point.id} is on the water side`);
  const ahead = auditEastShore(point.x, point.z, site.coastline.path);
  assert.ok(ahead !== null && ahead > 1, `${point.id} coastline is not ahead`);
}
const waterfront = points.find((point) => point.id === "waterfront");
const west = points.find((point) => point.id === "west");
const north = points.find((point) => point.id === "north");
const south = points.find((point) => point.id === "south");
const center = points.find((point) => point.id === "center");
assert.ok(waterfront && west && north && south && center);
assert.ok(waterfront.x > center.x);
assert.ok(points.every((point) => point.x >= west.x));
assert.ok(points.every((point) => point.z <= north.z));
assert.ok(points.every((point) => point.z >= south.z));

const read = (point: ViewPoint, eye = 5.5) => viewReading(point, eye, site.buildings, site.coastline.path, inStudy, towers);
const southView = read(south);
const northView = read(north);
const centerView = read(center);
const waterfrontView = read(waterfront);
const westView = read(west);
const high = read(waterfront, 80);

for (const reading of [southView, northView, centerView, waterfrontView, westView]) {
  assert.equal(reading.destinationViews, 0);
  assert.equal(reading.rays.length, 13);
  const auditEast = auditEastShore(reading.point.x, reading.point.z, site.coastline.path);
  assert.ok(auditEast !== null);
  assert.ok(Math.abs((reading.east.shoreFeet ?? 0) - auditEast) < 0.05, reading.point.id);
  for (const ray of reading.rays) {
    assert.ok(ray.shoreFeet !== null && ray.shoreFeet > 1);
    const { east } = bearingVector(ray.bearing);
    const endX = reading.point.x + east * ray.shoreFeet;
    assert.ok(endX < 400, `${reading.point.id} ${ray.bearing} uses a far closure`);
    assert.ok(Math.abs(sightHeight(reading.eyeHeight, 0, ray.shoreFeet) - reading.eyeHeight) < 1e-9);
    assert.ok(Math.abs(sightHeight(reading.eyeHeight, ray.shoreFeet, ray.shoreFeet)) < 1e-9);
    if (!ray.open && ray.blockerFeet !== null) {
      const height = sightHeight(reading.eyeHeight, ray.blockerFeet, ray.shoreFeet);
      assert.ok(height <= (ray.blockerHeight ?? 0) + 1e-6);
      assert.ok(height >= 0);
    }
  }
  assert.equal(viewSegments(reading).some((segment) => segment.bx > 400), false);
}
assert.ok(high.openRays >= waterfrontView.openRays);
assert.equal(waterfrontView.openDegrees, waterfrontView.openRays * 10);

const quantum = site.buildings.find((building) => building.name === "Quantum on the Bay");
const hiltonHost = site.buildings.find((building) => building.name === "Hilton Miami Downtown");
assert.equal(quantum?.heightFeet, 130);
assert.equal(hiltonHost?.heightFeet, 90);
assert.equal(towers.map((tower) => tower.heightFeet).join(","), "536,554,299");
assert.ok(VIEW_LIMITS.some((line) => /536 ft/.test(line) && /554 ft/.test(line) && /299 ft/.test(line) && /not changed/.test(line)));

const hilton = towers.find((tower) => tower.id === "hilton");
assert.ok(hilton);
const hiltonWest = hilton.ring.reduce((min, point) => Math.min(min, point[0]), Infinity);
const hiltonNorth = hilton.ring.reduce((sum, point) => sum + point[1], 0) / hilton.ring.length;
const probe: ViewPoint = { id: "center", label: "Center", x: hiltonWest - 40, z: hiltonNorth };
const probeView = viewReading(probe, 5.5, [], site.coastline.path, () => true, towers);
assert.equal(probeView.east.open, false);
assert.equal(probeView.east.blockerName, hilton.name);
assert.equal(probeView.east.blockerSource, "published");
assert.equal(probeView.east.blockerHeight, 299);
assert.equal(quantum?.heightFeet, 130);

const northNoise = noiseReading(north, site.roads);
const macarthurRoads = site.roads.filter((road) => /macarthur/i.test(road.name));
const expresswayRoads = site.roads.filter((road) => (road.kind === "causeway" || road.kind === "expressway" || road.kind === "ramp") && !/macarthur/i.test(road.name));
const localRoads = site.roads.filter((road) => road.kind === "local");
const northMacarthur = auditRoadFeet(north.x, north.z, macarthurRoads);
const northExpressway = auditRoadFeet(north.x, north.z, expresswayRoads);
const northLocal = auditRoadFeet(north.x, north.z, localRoads);
assert.ok(Math.abs((northNoise.macarthur.feet ?? 0) - northMacarthur) < 0.05);
assert.ok(Math.abs((northNoise.expressway.feet ?? 0) - northExpressway) < 0.05);
assert.ok(Math.abs((northNoise.local.feet ?? 0) - northLocal) < 0.05);
assert.ok(Math.abs(northMacarthur - auditRoadFeetSampled(north.x, north.z, macarthurRoads)) < 1.5);
assert.ok(Math.abs(northExpressway - auditRoadFeetSampled(north.x, north.z, expresswayRoads)) < 1.5);
assert.ok(Math.abs(northLocal - auditRoadFeetSampled(north.x, north.z, localRoads)) < 1.5);
assert.ok(northNoise.macarthur.z !== null && northNoise.macarthur.z < north.z);
assert.equal("decibel" in northNoise, false);
assert.ok(NOISE_LIMITS.some((line) => /not a ranking of loudness/i.test(line)));
assert.ok(NOISE_LIMITS.some((line) => /no decibel value is calculated/i.test(line)));
assert.equal(site.sources.some((item) => /traffic|acoustic|aadt|decibel/i.test(`${item.title} ${item.note}`)), false);

const notes = programNotes(southView, northNoise);
assert.match(notes.quiet, /not a sound level/);
assert.match(notes.waterfront, /not a verified view/);
assert.doesNotMatch(`${notes.gathering} ${notes.quiet} ${notes.waterfront}`, /decibel|\bdB\b|louder|loudness/i);

const stand: ViewPoint = { id: "center", label: "Center", x: 0, z: 0 };
const shore: XZ[] = [[100, -80], [100, 80]];
const wall: SiteBuilding = {
  id: 1,
  name: "Wall",
  heightFeet: 40,
  heightSource: "estimated",
  ring: [[20, -10], [40, -10], [40, 10], [20, 10]],
};
const blocked = viewReading(stand, 5.5, [wall], shore, () => true, []);
assert.equal(blocked.east.open, false);
assert.equal(blocked.east.blockerName, "Wall");
assert.ok((blocked.east.blockerFeet ?? 0) > 15 && (blocked.east.blockerFeet ?? 0) < 25);
assert.ok(sightHeight(5.5, blocked.east.blockerFeet ?? 0, blocked.east.shoreFeet ?? 1) <= 40);

const under: SiteBuilding = { ...wall, heightFeet: 3, heightSource: "county" };
assert.equal(viewReading(stand, 5.5, [under], shore, () => true, []).east.open, true);
assert.equal(viewReading(stand, 5.5, [wall], shore, () => false, []).east.open, true);
const beyond: SiteBuilding = { ...wall, ring: [[150, -10], [170, -10], [170, 10], [150, 10]] };
assert.equal(viewReading(stand, 5.5, [beyond], shore, () => true, []).east.open, true);

const afloat: ViewPoint = { id: "waterfront", label: "Waterfront", x: 150, z: 0 };
const afloatView = viewReading(afloat, 5.5, [], shore, () => true, []);
assert.equal(afloatView.east.shoreFeet, null);
assert.equal(afloatView.east.open, false);
assert.equal(afloatView.destinationViews, 0);

const road: SiteRoad = {
  name: "MacArthur Causeway",
  kind: "causeway",
  displayHalfWidthFeet: 24,
  path: [[-10, -200], [10, -200]],
};
const other: SiteRoad = {
  name: "I-395",
  kind: "expressway",
  displayHalfWidthFeet: 24,
  path: [[0, 300], [20, 300]],
};
const local: SiteRoad = {
  name: "Northeast 18th Street",
  kind: "local",
  displayHalfWidthFeet: 18,
  path: [[-40, 0], [40, 0]],
};
const near = noiseReading(stand, [road, other, local]);
assert.equal(Math.round(near.macarthur.feet ?? 0), 200);
assert.equal(Math.round(near.expressway.feet ?? 0), 300);
assert.equal(Math.round(near.local.feet ?? 0), 0);
assert.ok(noiseSegments(near).some((segment) => segment.open));

const kept = keepRuns([viewRunRecord(0, blocked)], viewRunRecord(1, viewReading(stand, 80, [under], shore, () => true, [])));
assert.equal(kept.length, 2);
assert.equal(kept[0].eastOpen, false);
assert.equal(keepRuns([], noiseRunRecord(0, near))[0].macarthurFeet, 200);
assert.ok(STUDY_LIMIT.maxZ < 1200);
assert.ok(towers.some((tower) => tower.ring.some((point) => point[1] > STUDY_LIMIT.maxZ)));

assert.equal(southView.openRays, 12);
assert.equal(southView.shoreRays, 13);
assert.ok(Math.abs((southView.east.shoreFeet ?? 0) - 285.2) < 0.05);
assert.equal(southView.east.open, true);
assert.equal(southView.towerBlocks, 0);
assert.equal(southView.estimatedBlocks, 1);
assert.ok(Math.abs(northMacarthur - 859.6) < 0.05);
assert.ok(Math.abs(northExpressway - 113.7) < 0.05);
assert.ok(Math.abs(northLocal - 48.9) < 0.05);
assert.equal(northNoise.expressway.name, "Venetian Way");
assert.equal(northNoise.local.name, "Northeast 15th Street");
const southNoise = noiseReading(south, site.roads);
const southMacarthur = auditRoadFeet(south.x, south.z, macarthurRoads);
assert.ok(Math.abs((southNoise.macarthur.feet ?? 0) - southMacarthur) < 0.05);
assert.ok(Math.abs(southMacarthur - 111.7) < 0.05);
const southAudit = auditEastShore(south.x, south.z, site.coastline.path);
console.log("views and road-proximity checks passed");
console.log(`points ${points.map((point) => `${point.id} ${point.x.toFixed(1)},${point.z.toFixed(1)}`).join(" | ")}`);
console.log(`south eye 5.5 open ${southView.openRays}/${southView.shoreRays}; east ${southView.east.open ? "open" : southView.east.blockerName} shore ${southView.east.shoreFeet?.toFixed(1)} audit ${southAudit?.toFixed(1)}; towers ${southView.towerBlocks}; estimated ${southView.estimatedBlocks}; MacArthur ${southNoise.macarthur.feet?.toFixed(1)} audit ${southMacarthur.toFixed(1)}`);
console.log(`north roads MacArthur ${northNoise.macarthur.feet?.toFixed(1)} ft audit ${northMacarthur.toFixed(1)}; ${northNoise.expressway.name} ${northNoise.expressway.feet?.toFixed(1)} audit ${northExpressway.toFixed(1)}; ${northNoise.local.name} ${northNoise.local.feet?.toFixed(1)} audit ${northLocal.toFixed(1)}`);
console.log(`center east ${centerView.east.shoreFeet?.toFixed(1)} open ${centerView.openRays}; waterfront east ${waterfrontView.east.shoreFeet?.toFixed(1)} open ${waterfrontView.openRays}; west open ${westView.openRays}`);
