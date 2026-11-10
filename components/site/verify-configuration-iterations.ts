import assert from "node:assert/strict";
import { CONFIGURATION_CONTRACT, parseConfigurationDocument, type SiteConfiguration } from "../../lib/skill5/configurations";
import { iterationMetrics, keptJoins } from "../../lib/skill5/metrics";
import { MODULE_GROUND_Y, type PlacedModule } from "../../lib/skill5/placement";
import { SKILL5_MODULE_ENVELOPE_FEET, SKILL5_SITE_ID } from "../../lib/skill5/contract";

function tile(id: string, program: PlacedModule["program"], x: number, y: number, z: number): PlacedModule {
  return {
    instanceId: id,
    kind: "archetype",
    name: id,
    status: "Validated",
    geometryState: "available",
    program,
    programSource: "assigned",
    provenance: { moduleId: `${program}-mesh`, archetypeId: program, source: "skill3", candidateId: 1, continuationId: "c" },
    transform: { position: { x, y, z }, rotationY: 0 },
    mirror: null,
    zoneIds: ["z1"],
  };
}

const passage = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], indices: [0, 1, 2, 2, 1, 3, 0, 2, 1, 1, 2, 3] };
const ring: [number, number][] = [[-40, -40], [80, -40], [80, 40], [-40, 40]];

const lobby = tile("m1", "lobby", 0, MODULE_GROUND_Y, 0);
const gathering = tile("m2", "gathering", 20, MODULE_GROUND_Y, 0);
const workspace = tile("m3", "workspace", 0, MODULE_GROUND_Y + SKILL5_MODULE_ENVELOPE_FEET, 0);

const parent: SiteConfiguration = {
  id: "cfg-1",
  name: "Court",
  parentConfigurationId: null,
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
  modules: [lobby, gathering, workspace],
  assemblies: [],
  annotations: [],
  zones: [{ id: "z1", name: "Lobby pocket", kind: "lobby", points: [{ x: -12, z: -12 }, { x: 12, z: -12 }, { x: 12, z: 12 }, { x: -12, z: 12 }], baseFt: 0, heightFt: 40, visible: true, networkId: "i10-21308395" }],
  networkId: "i10-21308395",
  directJoins: [{ id: "c1", tileA: "m1", tileB: "m2", faceA: "E", faceB: "W", joinType: "side", alignment: 1, floorDelta: 0, integrity: "closed", passage }],
  hybridJoins: [{ id: "c2", tileA: "m1", tileB: "m3", faceA: "T", faceB: "B", joinType: "stack", alignment: 1, floorDelta: 0, integrity: "open", passage, candidateId: "H13", note: "East stack" }],
  view: { showZones: true, showTiles: true, showConnections: false, showNetwork: true },
};

const copy = structuredClone(parent);
copy.id = "cfg-2";
copy.name = "Court copy";
copy.parentConfigurationId = parent.id;
copy.modules[0] = { ...copy.modules[0], transform: { ...copy.modules[0].transform, position: { ...copy.modules[0].transform.position, x: 40 } } };
copy.directJoins = [];
assert.equal(parent.modules[0].transform.position.x, 0);
assert.equal(parent.directJoins?.length, 1);
assert.equal(copy.parentConfigurationId, "cfg-1");

const metrics = iterationMetrics({
  modules: parent.modules,
  directJoins: [...(parent.directJoins ?? []), { tileA: "m1", tileB: "missing", passage }],
  hybridJoins: parent.hybridJoins ?? [],
}, ring);
assert.equal(metrics.tiles, 3);
assert.equal(metrics.programs.lobby, 1);
assert.equal(metrics.programs.gathering, 1);
assert.equal(metrics.programs.workspace, 1);
assert.equal(metrics.heightFt, 40);
assert.equal(metrics.occupiedSqFt, 800);
assert.equal(metrics.directJoins, 1);
assert.equal(metrics.hybridJoins, 1);
assert.equal(metrics.connectedTiles, 3);

const filtered = keptJoins(parent.modules, [{ tileA: "m1", tileB: "missing", passage }, { tileA: "m1", tileB: "m2" }]);
assert.equal(filtered.kept.length, 0);
assert.equal(filtered.missing.length, 2);

const parsed = parseConfigurationDocument({
  contract: CONFIGURATION_CONTRACT,
  siteId: SKILL5_SITE_ID,
  configurations: [{
    ...parent,
    hybridJoins: [...(parent.hybridJoins ?? []), { id: "c3", tileA: "m2", tileB: "m3", candidateId: "H01" }],
    modules: [...parent.modules, { instanceId: "broken" }],
  }],
  priorities: [],
});
const restored = parsed.configurations[0];
assert.equal(restored.networkId, "i10-21308395");
assert.equal(restored.view?.showConnections, false);
assert.equal(restored.hybridJoins?.length, 1);
assert.equal(restored.droppedHybrids, 1);
assert.equal(restored.droppedModules, 1);
assert.equal(restored.modules.length, 3);
assert.equal(restored.zones?.[0]?.networkId, "i10-21308395");

const otherNetwork = parseConfigurationDocument({
  contract: CONFIGURATION_CONTRACT,
  siteId: SKILL5_SITE_ID,
  configurations: [{ ...parent, id: "cfg-3", name: "Other", networkId: "i2-20470563" }],
  priorities: [],
});
assert.equal(otherNetwork.configurations[0]?.networkId, "i2-20470563");
assert.notEqual(otherNetwork.configurations[0]?.networkId, restored.networkId);

console.log("configuration iteration checks passed");
