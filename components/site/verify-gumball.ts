import assert from "node:assert/strict";
import { CONFIGURATION_CONTRACT, parseConfigurationDocument } from "../../lib/skill5/configurations";
import { JOIN_REVIEW, poseOf, readAxes, reviewJoins, tileAabb, tileDistorted, tilePoint } from "../../lib/skill5/gumball";
import type { PlacedModule } from "../../lib/skill5/placement";

function tile(id: string, x = 0, y = 0.7, z = 0): PlacedModule {
  return {
    instanceId: id,
    kind: "archetype",
    name: id,
    status: "Validated",
    geometryState: "available",
    program: "lobby",
    programSource: "suggested",
    provenance: { moduleId: id, archetypeId: id, source: "skill3", candidateId: 1, continuationId: "c" },
    transform: { position: { x, y, z }, rotationY: 0 },
  };
}

const yaw = tile("yaw");
yaw.transform.rotationY = Math.PI / 2;
const turned = tilePoint({ x: 10, y: 0, z: 0 }, poseOf(yaw));
assert.ok(Math.abs(turned.x) < 1e-6, "a quarter turn sends local east toward north");
assert.ok(Math.abs(turned.z - 10) < 1e-6, "local east lands on north");

const wide = tile("wide");
wide.axes = { rotationX: 0, rotationZ: 0, scaleX: 2, scaleY: 1, scaleZ: 1 };
const wideBox = tileAabb(wide);
assert.ok(Math.abs(wideBox.maxX - wideBox.minX - 40) < 1e-6, "scale X doubles the east extent");
assert.ok(Math.abs(wideBox.height - 20) < 1e-6, "the other axes stay at the module height");
assert.equal(tileDistorted(wide), true);

const tall = tile("tall");
tall.axes = { rotationX: 0, rotationZ: 0, scaleX: 2, scaleY: 2, scaleZ: 2 };
const tallBox = tileAabb(tall);
assert.ok(Math.abs(tallBox.height - 40) < 1e-6, "uniform scale doubles the height");
assert.equal(tileDistorted(tall), false);

assert.equal(readAxes(undefined), undefined);
assert.deepEqual(readAxes({ scaleX: 1.5 }), { rotationX: 0, rotationZ: 0, scaleX: 1.5, scaleY: 1, scaleZ: 1 });

const parsed = parseConfigurationDocument({
  contract: CONFIGURATION_CONTRACT,
  siteId: "herald",
  configurations: [{
    id: "c",
    name: "Scaled",
    modules: [{ ...wide, name: "Lobby" }],
    assemblies: [],
  }],
  priorities: [],
});
assert.equal(parsed.configurations[0]?.modules[0]?.axes?.scaleX, 2);

const joins = reviewJoins([
  { id: "a", tileA: "wide", tileB: "other", review: undefined },
  { id: "b", tileA: "left", tileB: "right" },
], "wide");
assert.equal(joins[0]?.review, JOIN_REVIEW);
assert.equal(joins[1]?.review, undefined);

console.log("gumball checks passed");
