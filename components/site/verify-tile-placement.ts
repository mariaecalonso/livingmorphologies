import assert from "node:assert/strict";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT, placementWarnings } from "../../lib/skill5/placement";
import { footprintOverlapSqFt, reportTiles } from "../../lib/skill5/tile-placement";
import type { PlacedModule } from "../../lib/skill5/placement";
import type { ZoningRegion } from "../../lib/skill5/zoning";

const square = (x: number, z: number, size = 40): ZoningRegion["points"] => [
  { x, z },
  { x: x + size, z },
  { x: x + size, z: z + size },
  { x, z: z + size },
];

const tile = (id: string, x: number, z: number, y: number, program: PlacedModule["program"]): PlacedModule => ({
  instanceId: id,
  kind: "archetype",
  name: id,
  status: "Validated",
  geometryState: "available",
  program,
  programSource: "suggested",
  provenance: { moduleId: "m", archetypeId: "a", source: "skill3", candidateId: 1, continuationId: "c" },
  transform: { position: { x, y, z }, rotationY: 0 },
});

const zone: ZoningRegion = {
  id: "z1",
  name: "Gathering",
  kind: "gathering",
  points: square(0, 0, 80),
  baseFt: 0,
  heightFt: 20,
  visible: true,
  networkId: "net",
  pocketId: "p1",
};

const overlap = footprintOverlapSqFt(
  [{ x: 10, z: 10 }, { x: 30, z: 10 }, { x: 30, z: 30 }, { x: 10, z: 30 }],
  zone.points,
);
assert.ok(overlap >= 300 && overlap <= 400, `overlap ${overlap}`);

const gathering = tile("g", 20, 20, MODULE_GROUND_Y, "gathering");
const workspace = tile("w", 20, 20, MODULE_GROUND_Y, "workspace");
const stacked = tile("s", 20, 20, MODULE_GROUND_Y + MODULE_HEIGHT_FT, "gathering");
const offset = tile("o", 30, 20, MODULE_GROUND_Y + MODULE_HEIGHT_FT, "gathering");
const beside = tile("b", 40, 20, MODULE_GROUND_Y, "gathering");

const matched = reportTiles([gathering], [zone]).g;
assert.deepEqual(matched.zoneIds, ["z1"]);
assert.equal(matched.mismatch, false);
assert.equal(matched.level, 0);

const wrong = reportTiles([workspace], [zone]).w;
assert.equal(wrong.mismatch, true);

const upperZone: ZoningRegion = { ...zone, id: "z2", name: "Gathering upper", baseFt: 20, heightFt: 20 };
const above = reportTiles([gathering, stacked], [zone, upperZone]);
assert.equal(above.s.level, 1);
assert.equal(above.s.unsupported, false);
assert.equal(above.s.stackHeightFt, 40);
assert.deepEqual(above.s.zoneIds, ["z2"]);
assert.deepEqual(above.g.zoneIds, ["z1"]);

const cantilever = reportTiles([gathering, offset], [zone]).o;
assert.equal(cantilever.unsupported, false);

const warnings = placementWarnings([gathering, stacked, beside], [[-100, -100], [200, -100], [200, 200], [-100, 200]]);
assert.equal(warnings.g.overlap, false);
assert.equal(warnings.s.overlap, false);
assert.equal(warnings.g.adjacent, true);

const collided = placementWarnings([gathering, tile("c", 30, 20, MODULE_GROUND_Y, "gathering")], [[-100, -100], [200, -100], [200, 200], [-100, 200]]);
assert.equal(collided.g.overlap, true);

console.log("tile placement checks passed");
