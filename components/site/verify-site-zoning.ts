import assert from "node:assert/strict";
import { emptyEditHistory, redoEdit, rememberEdit, undoEdit } from "../../lib/skill5/history";
import {
  distanceToRing,
  elevationIssue,
  nearestDistance,
  networkSamples,
  polygonAreaSqFt,
  polygonIssue,
  polygonSelfIntersects,
  readZoningRegion,
  translatePolygon,
  zoneFacing,
  zoneSiteFlags,
  type ZoningRegion,
} from "../../lib/skill5/zoning";

const square = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
];
assert.equal(polygonAreaSqFt(square), 100);
assert.equal(polygonIssue(square), null);
assert.equal(polygonAreaSqFt(translatePolygon(square, 40, -15)), 100);

const bowtie = [
  { x: 0, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
  { x: 10, z: 0 },
];
assert.equal(polygonSelfIntersects(bowtie), true);
assert.equal(polygonIssue(bowtie), "This outline crosses itself.");
assert.equal(polygonIssue([{ x: 0, z: 0 }, { x: 4, z: 0 }]), "A region needs at least three corners.");
assert.equal(elevationIssue(0, 0), "Height has to be greater than zero.");
assert.equal(elevationIssue(12, 8), null);

const parcel: [number, number][] = [[0, 0], [100, 0], [100, 80], [0, 80]];
const water: [number, number][] = [[90, -10], [140, -10], [140, 90], [90, 90]];
const inside = zoneSiteFlags(square, parcel, water);
assert.equal(inside.outsideParcel, false);
assert.equal(inside.inWater, false);
const overWater = zoneSiteFlags([{ x: 100, z: 10 }, { x: 120, z: 10 }, { x: 120, z: 30 }], parcel, water);
assert.equal(overWater.outsideParcel, true);
assert.equal(overWater.inWater, true);
assert.equal(zoneFacing({ x: 10, z: 40 }, parcel, water), "city");
assert.equal(zoneFacing({ x: 95, z: 40 }, parcel, water), "waterfront");
assert.ok((distanceToRing({ x: 95, z: 40 }, water) ?? 0) < 10);

const trails = new Float32Array(16);
trails[0] = 0.5;
trails[1] = 0.5;
trails[4] = 0.5;
const samples = networkSamples(trails, 4, { minX: 0, minZ: 0, width: 40, depth: 40 }, 0.08);
assert.ok(samples.length > 0);
assert.ok((nearestDistance({ x: 0, z: 0 }, samples) ?? 0) > 0);

const region: ZoningRegion = {
  id: "z1",
  name: "Lobby 1",
  kind: "lobby",
  points: square,
  baseFt: 0,
  heightFt: 14,
  visible: true,
  networkId: "iteration-a",
};
const legacy = readZoningRegion({ id: "z2", kind: "gathering", x: 20, z: 20 });
assert.ok(legacy && legacy.points.length === 4);
assert.equal(readZoningRegion({ id: "bad", kind: "lobby", points: bowtie }), null);

let history = emptyEditHistory();
history = rememberEdit(history, { ...history.present, zones: [region] });
history = rememberEdit(history, { ...history.present, zones: [{ ...region, points: translatePolygon(square, 5, 0) }] });
const undone = undoEdit(history);
assert.ok(undone);
assert.equal(undone.present.zones[0].points[1].x, 10);
const redone = redoEdit(undone);
assert.ok(redone);
assert.equal(redone.present.zones[0].points[1].x, 15);
assert.equal(redone.present.instances.length, 0);

console.log("site zoning checks passed");
