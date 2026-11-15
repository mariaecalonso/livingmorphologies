import assert from "node:assert/strict";
import { consolidatePockets, MAX_ZONE_SPAN_FT, MIN_ZONE_SQFT } from "../../lib/skill5/zone-consolidation";
import { readZoningRegion } from "../../lib/skill5/zoning";
import type { NetworkPocket } from "../../lib/skill5/pockets";
import { chooseSiteCoverage } from "./strategy-coverage";

function square(id: string, x: number, z: number, size = 20): NetworkPocket {
  return {
    id,
    touchesParcel: false,
    points: [
      { x, z },
      { x: x + size, z },
      { x: x + size, z: z + size },
      { x, z: z + size },
    ],
  };
}

const row = [0, 1, 2, 3].map((index) => square(`a${index}`, index * 20, 0));
const joined = consolidatePockets(row);
assert.equal(joined.zones.length, 1, "four adjacent tiles fit one 80 ft zone");
assert.equal(joined.zones[0].pocketIds.length, 4);
assert.ok(joined.zones[0].areaSqFt >= MIN_ZONE_SQFT);
assert.ok(joined.zones[0].spanFt <= MAX_ZONE_SPAN_FT + 1e-6);
assert.equal(joined.fragments.length, 0);

const longer = [0, 1, 2, 3, 4].map((index) => square(`b${index}`, index * 20, 0));
const split = consolidatePockets(longer);
assert.equal(split.zones.length, 1);
assert.equal(split.fragments.length, 1);
assert.equal(split.fragments[0].reason, "under-two-tiles");

const mixed = consolidatePockets(
  [square("lobby", 0, 0, 40), square("work", 40, 0, 40)],
  [{ pocketId: "lobby", kind: "lobby" }, { pocketId: "work", kind: "workspace" }],
);
assert.equal(mixed.zones.length, 2, "different typologies do not join");
assert.equal(mixed.fragments.length, 0);
assert.deepEqual(mixed.zones.map((zone) => zone.kind).sort(), ["lobby", "workspace"]);

const kept = readZoningRegion({
  id: "z1",
  kind: "lobby",
  points: [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 40 }, { x: 0, z: 40 }],
  sourcePocketIds: ["a0", "a1"],
  pocketId: null,
});
assert.ok(kept);
assert.deepEqual(kept?.sourcePocketIds, ["a0", "a1"]);
assert.equal(kept?.pocketId, null);

const land = [
  { x: 0, z: 0 },
  { x: 0, z: 300 },
  { x: 200, z: 40 },
  { x: 200, z: 180 },
  { x: 200, z: 320 },
];
const water = [{ x: 240, z: 10 }];
const coverage = chooseSiteCoverage(land, water);
const sources = coverage.filter((item) => item.kind === "source");
const attractors = coverage.filter((item) => item.kind === "attractor" && item.surface === "land");
assert.equal(sources.length, 2);
assert.ok(sources.some((item) => item.z >= 200));
assert.ok(sources.some((item) => item.z <= 100));
assert.equal(attractors.length, 2);
assert.ok(Math.min(...attractors.map((item) => item.z)) < 200);
assert.ok(Math.max(...attractors.map((item) => item.z)) > 200);
assert.ok(coverage.some((item) => item.surface === "water"));
for (let index = 0; index < coverage.length; index += 1) {
  for (let other = index + 1; other < coverage.length; other += 1) {
    const gap = Math.hypot(coverage[index].x - coverage[other].x, coverage[index].z - coverage[other].z);
    if (coverage[index].surface === "water" || coverage[other].surface === "water") continue;
    assert.ok(gap >= 100, `nodes are ${gap} ft apart`);
  }
}

console.log("zone consolidation ok");
