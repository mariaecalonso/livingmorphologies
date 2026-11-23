import assert from "node:assert/strict";
import context from "@/data/skill5/herald-site.json";
import { readNetworkNode, runNetworkIteration, type NetworkNode } from "@/components/site/site-network";
import { COMPARISON_SEEDS, buildArrivalArrangement, buildArrivalFamily, readArchitecturalRecord } from "@/lib/skill5/architectural-strategy";
import { evaluateNetwork, openNetworkField } from "@/lib/skill5/strategy-evaluation";
import type { SiteContext } from "@/lib/skill5/site-model";

const site = context as SiteContext;
const family = buildArrivalFamily(site);
assert.equal(family.length, 10, family.map((item) => item.arrangementId).join(", "));
const seedKey = COMPARISON_SEEDS.join(",");
assert.ok(family.every((item) => item.seeds.join(",") === seedKey));
assert.equal(new Set(family.map((item) => item.arrangementId)).size, family.length);
const northeast = family.find((item) => item.arrangementId === "arrival-northeast-v1");
assert.equal(northeast?.northLobby, "northeast-measured");
assert.equal(northeast?.nodes.filter((node) => /northeast/i.test(node.strategy?.note ?? "")).length, 1);
assert.equal(family.filter((item) => item.arrangementId !== "arrival-northeast-v1").some((item) => item.nodes.some((node) => /northeast/i.test(node.strategy?.note ?? ""))), false);
const absent = family.find((item) => item.arrangementId === "arrival-no-experimental-v1");
assert.equal(absent?.nodes.some((node) => node.architecture?.role === "north-lobby"), false);
const continuous = family.find((item) => item.arrangementId === "arrival-continuous-v1");
assert.equal(continuous?.parameters?.gathering, "continuous");
assert.equal(continuous?.nodes.some((node) => node.architecture?.role === "north-gathering"), false);
assert.equal(continuous?.nodes.some((node) => node.architecture?.role === "central-gathering"), true);

const arrangement = buildArrivalArrangement(site);
assert.ok(arrangement, "The arrival arrangement could not be built.");
assert.equal(arrangement.strategyId, "herald-arrival-v1");
assert.equal(arrangement.arrangementId, "arrival-city-north-v1");
assert.equal(arrangement.northLobby, "city-side-measured");
assert.equal(arrangement.relationships.length, 5);
assert.equal(arrangement.seeds.length, 2);

const sources = arrangement.nodes.filter((node) => node.kind === "source");
assert.equal(sources.length, 3);
const north = sources.find((node) => node.architecture?.role === "north-lobby");
const primary = sources.find((node) => node.architecture?.role === "primary-lobby");
const privateLobby = sources.find((node) => node.architecture?.role === "private-lobby");
assert.ok(north && primary && privateLobby);
assert.equal(north.architecture?.provenance.class, "measured");
assert.equal(north.architecture?.provenance.unverified, true);
assert.equal(primary.architecture?.provenance.class, "proposed");
assert.equal(primary.architecture?.provenance.unverified, false);
assert.equal(privateLobby.architecture?.provenance.class, "proposed");
assert.ok(privateLobby.z < primary.z, "The private lobby is the more southern west-edge proposal.");
assert.equal(arrangement.nodes.some((node) => /northeast/i.test(node.strategy?.note ?? "") || /northeast/i.test(node.recordId ?? "")), false);

for (const role of ["central-gathering", "private-gathering", "north-gathering", "workspace"] as const) {
  const node: NetworkNode | undefined = arrangement.nodes.find((item) => item.architecture?.role === role);
  assert.ok(node, role);
  assert.equal(node.architecture?.provenance.class, "proposed");
}

const restored = readNetworkNode(JSON.parse(JSON.stringify(north)));
assert.equal(restored?.architecture?.role, "north-lobby");
assert.equal(restored?.architecture?.provenance.class, "measured");
assert.equal(restored?.architecture?.provenance.unverified, true);
const record = readArchitecturalRecord({
  strategyId: arrangement.strategyId,
  arrangementId: arrangement.arrangementId,
  relationships: arrangement.relationships,
  northLobby: arrangement.northLobby,
});
assert.equal(record?.relationships[0].from, "primary-lobby");
assert.equal(record?.relationships[0].to, "central-gathering");

void runNetworkIteration(site.site.ring, site.water.ring, arrangement.nodes, arrangement.seeds[0], undefined, site.buildings).then((iteration) => {
iteration.architectureRecord = record;
assert.equal(iteration.nodes.find((node) => node.architecture?.role === "north-lobby")?.architecture?.provenance.class, "measured");
assert.equal(iteration.nodes.some((node) => node.architecture?.role === "central-gathering"), true);
const evaluation = evaluateNetwork(iteration, openNetworkField(site));
assert.notEqual(evaluation.occupation.enclosedShare, evaluation.reachShare);
assert.ok(evaluation.occupation.parcelSqFt > 0);
assert.ok(evaluation.occupation.enclosedShare >= 0 && evaluation.occupation.enclosedShare <= 1);
assert.ok(evaluation.occupation.usableShare >= 0 && evaluation.occupation.usableShare <= evaluation.occupation.enclosedShare);

console.log(JSON.stringify({
  arrangement: arrangement.arrangementId,
  north: { role: north.architecture?.role, class: north.architecture?.provenance.class, unverified: north.architecture?.provenance.unverified, x: Math.round(north.x), z: Math.round(north.z) },
  primary: { class: primary.architecture?.provenance.class, x: Math.round(primary.x), z: Math.round(primary.z) },
  private: { class: privateLobby.architecture?.provenance.class, x: Math.round(privateLobby.x), z: Math.round(privateLobby.z) },
  roles: arrangement.nodes.map((node) => node.architecture?.role),
  seed: iteration.seed,
  connected: `${iteration.reached}/${iteration.total}`,
  reachShare: evaluation.reachShare,
  enclosedShare: evaluation.occupation.enclosedShare,
  usableShare: evaluation.occupation.usableShare,
  strategyKept: iteration.architectureRecord?.strategyId ?? null,
}, null, 2));
});
