import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { footprintCorners } from "./placement";
import { projectLocal } from "./geo";
import { snapSitePlan } from "./grid";
import { northDegrees, placePlan, placeWaterfront, storedToWorld, worldToStored } from "./render-frame";

const site = JSON.parse(readFileSync(new URL("../../data/skill5/herald-site.json", import.meta.url), "utf8"));
const configurations = JSON.parse(readFileSync(new URL("../../data/skill5/configurations.json", import.meta.url), "utf8"));

const roundTrip = worldToStored(12, 4, -30);
assert.deepEqual(roundTrip, { x: 12, y: 4, z: 30 });
assert.deepEqual(storedToWorld(roundTrip.x, roundTrip.y, roundTrip.z), { x: 12, y: 4, z: -30 });

const east = projectLocal(site.origin.lon + 0.001, site.origin.lat, site.origin);
const north = projectLocal(site.origin.lon, site.origin.lat + 0.001, site.origin);
assert.ok(east.x > 100 && Math.abs(east.z) < 1, "a point east of the origin stores +X");
assert.ok(north.z > 100 && Math.abs(north.x) < 1, "a point north of the origin stores +Z");

assert.deepEqual(site.site.ring[0], [255.89, -552.91]);
assert.equal(site.axes.z, "north");

const saved = configurations.configurations.find((item: { id: string }) => item.id === "C01");
assert.equal(saved.name, "Spatial check");
assert.equal(saved.modules[0].transform.position.x, 80);
assert.equal(saved.modules[0].transform.position.z, -120);
assert.equal(saved.modules[0].transform.rotationY, 0);
assert.equal(Math.hypot(80, -120), Math.hypot(saved.modules[0].transform.position.x, saved.modules[0].transform.position.z));

const snapped = snapSitePlan(14, -16);
assert.deepEqual(snapped, { x: 10, z: -20 });
const turned = footprintCorners({ x: 0, z: 0 }, Math.PI / 2);
assert.equal(turned.filter((corner) => corner.x < -9).length, 2, "positive yaw carries the north edge onto the west");

function mean(paths: number[][]) {
  let x = 0;
  let z = 0;
  for (const [px, pz] of paths) {
    x += px;
    z += pz;
  }
  return { x: x / paths.length, z: z / paths.length };
}
function roads(name: string) {
  return site.roads.filter((road: { name: string }) => road.name === name).flatMap((road: { path: number[][] }) => road.path);
}
const macarthur = mean(roads("MacArthur Causeway"));
const herald = mean(roads("Herald Plaza"));
const fifteenth = mean(roads("Northeast 15th Street"));
assert.ok(macarthur.z < -200, "MacArthur Causeway is south of the parcel origin");
assert.ok(herald.x < 0, "Herald Plaza is west of the parcel origin");
assert.ok(fifteenth.z > 0, "NE 15th Street is north of the parcel origin");

const named = (name: string) => site.buildings.find((building: { name?: string }) => building.name === name);
function centroid(ring: number[][]) {
  return mean(ring);
}
const arsht = centroid(named("Adrienne Arsht Center for the Performing Arts").ring);
const hilton = centroid(named("Hilton Miami Downtown").ring);
assert.ok(arsht.x < -400, "the Arsht Center is inland, west of the parcel");
assert.ok(hilton.z > 200, "the Hilton is north of the parcel");
assert.ok(site.water.ring.some(([x]: number[]) => x > 400), "Biscayne Bay extends east of the parcel");

const frame = { cx: 0, cz: 0, width: 900, depth: 900, span: 900 };
const plan = new OrthographicCamera();
placePlan(plan, { width: 1280, height: 720 }, frame, 1.08);
assert.ok(plan.left < plan.right, "plan uses a normal frustum; the reflection is in the render frame");
assert.ok(Math.abs(northDegrees(plan)) < 1, "plan north is up");
const eastScreen = new Vector3(300, 0, 0).project(plan);
const northScreen = new Vector3(...Object.values(storedToWorld(0, 0, 300)) as [number, number, number]).project(plan);
assert.ok(eastScreen.x > 0.1, "plan east is screen-right");
assert.ok(northScreen.y > 0.1, "plan north is screen-up");

const waterfront = new PerspectiveCamera();
placeWaterfront(waterfront, frame);
const southScreen = new Vector3(...Object.values(storedToWorld(0, 20, -500)) as [number, number, number]).project(waterfront);
const northShore = new Vector3(...Object.values(storedToWorld(0, 20, 500)) as [number, number, number]).project(waterfront);
assert.ok(southScreen.x < northShore.x, "from the bay looking west, south is left of north");
assert.ok(southScreen.x < -0.02, "the causeway side falls left of the parcel");
assert.ok(northShore.x > 0.02, "the northern waterfront falls right of the parcel");

console.log("skill5 orientation checks passed");
