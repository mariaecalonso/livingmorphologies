/**
 * Seats hybrid candidates for the saved autonomous scenario.
 * Does not rerun Physarum and does not write the live configuration store.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
import { readSolidifiedMesh } from "@/lib/skill3/solidified-catalogue";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { buildHybridOffer, placeHybridCandidate, suggestedSiteFaces } from "@/lib/skill5/hybrid-join";
import { loadSkill3HandoffRecords } from "@/lib/skill4/skill3-handoff";
import { loadModuleMap } from "@/lib/skill4/tiles";
import type { PlacedModule } from "@/lib/skill5/placement";

const OUT = join(process.cwd(), "data", "skill5", "autonomous-test");
const scenario = JSON.parse(readFileSync(join(OUT, "scenario.json"), "utf8")) as {
  instances: PlacedModule[];
};
const report = JSON.parse(readFileSync(join(OUT, "report.json"), "utf8")) as {
  joins: { a: string; b: string; mode: string; valid: boolean; issues: string[] }[];
};

const meshes = new Map<string, Float32Array>();
function rawOf(instance: PlacedModule) {
  const known = meshes.get(instance.provenance.archetypeId);
  if (known) return known;
  const entry = SITE_ARCHETYPES.find((item) => item.archetypeId === instance.provenance.archetypeId);
  if (!entry) return null;
  const stored = readSolidifiedMesh(entry.archetypeId, entry.candidateId, entry.continuationId);
  if (!stored) return null;
  const positions = decodeSolidifiedMesh(stored.geometry).positions;
  meshes.set(instance.provenance.archetypeId, positions);
  return positions;
}

const byId = new Map(scenario.instances.map((item) => [item.instanceId, item]));
console.log("loading skill 04 modules");
const loaded = loadModuleMap(loadSkill3HandoffRecords());
console.log("modules loaded");
const pairs = report.joins.filter((item) => item.mode === "direct" && !item.valid);
const adjacent = pairs.filter((item) => !item.issues.some((issue) => issue.includes("do not share")));
const vertical = adjacent.filter((item) => item.issues.some((issue) => issue.includes("Top and Bottom"))).slice(0, 8);
const horizontal = adjacent.filter((item) => !item.issues.some((issue) => issue.includes("Top and Bottom"))).slice(0, 8);
const separated = pairs.filter((item) => item.issues.some((issue) => issue.includes("do not share"))).slice(0, 8);
console.log(`sample vertical ${vertical.length}, horizontal ${horizontal.length}, separated ${separated.length}, adjacent available ${adjacent.length}`);

type Seat = {
  a: string;
  b: string;
  adjacent: boolean;
  offer: string;
  seated: boolean;
  candidate: string | null;
  joinType: string | null;
  integrity: string | null;
  floorDelta: number | null;
  note: string | null;
  reason: string | null;
};

function seat(pair: { a: string; b: string }, adjacentFace: boolean): Seat {
  const a = byId.get(pair.a);
  const b = byId.get(pair.b);
  if (!a || !b) return { a: pair.a, b: pair.b, adjacent: adjacentFace, offer: "missing tile", seated: false, candidate: null, joinType: null, integrity: null, floorDelta: null, note: null, reason: "A tile was not in the saved scenario." };
  const [faceA, faceB] = suggestedSiteFaces(a, b);
  const offer = buildHybridOffer({ tileA: a, tileB: b, faceA, faceB, rawA: rawOf(a), rawB: rawOf(b), loaded });
  if (!offer.ok) return { a: pair.a, b: pair.b, adjacent: adjacentFace, offer: "rejected", seated: false, candidate: null, joinType: null, integrity: null, floorDelta: null, note: null, reason: offer.reason };
  const ready = offer.offer.candidates.find((item) => item.status === "ready");
  const chosen = ready ?? offer.offer.candidates[0];
  if (!chosen) return { a: pair.a, b: pair.b, adjacent: adjacentFace, offer: "no candidate", seated: false, candidate: null, joinType: null, integrity: null, floorDelta: null, note: null, reason: "Skill 04 returned an empty candidate list." };
  const placed = placeHybridCandidate(offer.offer, chosen.id);
  if (!placed.ok) return { a: pair.a, b: pair.b, adjacent: adjacentFace, offer: `${offer.offer.candidates.length} candidates, first status ${chosen.status}`, seated: false, candidate: chosen.id, joinType: null, integrity: null, floorDelta: null, note: null, reason: placed.reason };
  return {
    a: pair.a,
    b: pair.b,
    adjacent: adjacentFace,
    offer: `${offer.offer.candidates.length} candidates`,
    seated: true,
    candidate: placed.placement.candidateId,
    joinType: placed.placement.joinType,
    integrity: placed.placement.integrity,
    floorDelta: placed.placement.floorDelta,
    note: placed.placement.note,
    reason: null,
  };
}

const seated: Seat[] = [];
for (const pair of [...vertical, ...horizontal]) {
  const started = Date.now();
  console.log(`seat ${pair.a} ${pair.b}`);
  seated.push(seat(pair, true));
  console.log(`done ${Date.now() - started}ms`);
}
for (const pair of separated) {
  const started = Date.now();
  console.log(`seat separated ${pair.a} ${pair.b}`);
  seated.push(seat(pair, false));
  console.log(`done ${Date.now() - started}ms`);
}

const count = (items: Seat[], key: (item: Seat) => string) => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};
const summary = {
  directAttempts: pairs.length,
  directValid: 0,
  adjacentAttempts: vertical.length + horizontal.length,
  adjacentAvailable: adjacent.length,
  separatedSample: separated.length,
  separatedAvailable: pairs.length - adjacent.length,
  seated: seated.filter((item) => item.seated).length,
  seatedAdjacent: seated.filter((item) => item.seated && item.adjacent).length,
  seatedSeparated: seated.filter((item) => item.seated && !item.adjacent).length,
  joinType: count(seated.filter((item) => item.seated), (item) => item.joinType ?? "none"),
  integrity: count(seated.filter((item) => item.seated), (item) => item.integrity ?? "none"),
  floorDelta: count(seated.filter((item) => item.seated), (item) => String(item.floorDelta)),
  failures: count(seated.filter((item) => !item.seated), (item) => item.reason ?? "unknown"),
};
writeFileSync(join(OUT, "assembly-seating.json"), JSON.stringify({ summary, seated }, null, 2));
console.log(JSON.stringify(summary, null, 2));
