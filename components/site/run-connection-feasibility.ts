/**
 * Direct-join census of the 15 stored tiles. Meshes are read, not rewritten.
 * Hybrid seating is limited to pairs whose faces already have openings.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { decodeSolidifiedMesh } from "../../lib/skill3/solidified-mesh";
import { readSolidifiedMesh } from "../../lib/skill3/solidified-catalogue";
import { SITE_ARCHETYPES } from "../../lib/skill5/catalog";
import { proposeDirectJoin } from "../../lib/skill5/direct-join";
import { faceBook, type FaceId } from "../../lib/skill5/face-match";
import { buildHybridOffer, placeHybridCandidate, suggestedSiteFaces } from "../../lib/skill5/hybrid-join";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT, type PlacedModule } from "../../lib/skill5/placement";
import { loadSkill3HandoffRecords } from "../../lib/skill4/skill3-handoff";
import { loadModuleMap } from "../../lib/skill4/tiles";

const FACES: FaceId[] = ["E", "W", "N", "S", "T", "B"];
const TURNS = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];

function tile(id: string, archetypeId: string, program: PlacedModule["program"], moduleId: string, x: number, y: number, z: number, rotationY: number): PlacedModule {
  const entry = SITE_ARCHETYPES.find((item) => item.archetypeId === archetypeId);
  return {
    instanceId: id,
    kind: "archetype",
    name: entry?.name ?? archetypeId,
    status: entry?.status ?? "Validated",
    geometryState: "available",
    program,
    programSource: "suggested",
    provenance: {
      moduleId,
      archetypeId,
      source: "skill3",
      candidateId: entry?.candidateId ?? 0,
      continuationId: entry?.continuationId ?? "",
    },
    transform: { position: { x, y, z }, rotationY },
  };
}

function meshOf(archetypeId: string) {
  const entry = SITE_ARCHETYPES.find((item) => item.archetypeId === archetypeId);
  if (!entry) return null;
  const stored = readSolidifiedMesh(entry.archetypeId, entry.candidateId, entry.continuationId);
  if (!stored) return null;
  return decodeSolidifiedMesh(stored.geometry).positions;
}

function issueClass(issues: string[]) {
  const text = issues.join(" ");
  if (text.includes("do not both have an opening")) return "no-opening";
  if (text.includes("do not overlap")) return "openings-miss";
  if (text.includes("blocks the opening")) return "obstructed";
  if (text.includes("floors differ")) return "floor-mismatch";
  if (text.includes("too small")) return "too-small";
  if (text.includes("not closed")) return "open-shell";
  if (text.includes("do not share")) return "not-adjacent";
  if (text.includes("no mesh")) return "no-mesh";
  return issues[0] ?? "other";
}

const meshes = new Map<string, Float32Array>();
const books = new Map<string, ReturnType<typeof faceBook>>();
for (const entry of SITE_ARCHETYPES) {
  const mesh = meshOf(entry.archetypeId);
  if (!mesh) continue;
  meshes.set(entry.archetypeId, mesh);
  books.set(entry.archetypeId, faceBook(mesh));
}

const faces = SITE_ARCHETYPES.map((entry) => {
  const book = books.get(entry.archetypeId);
  const counts: Record<string, number> = {};
  if (book) for (const face of FACES) counts[face] = book[face].openings;
  return { archetypeId: entry.archetypeId, program: entry.program, openings: counts };
});

type Attempt = {
  a: string;
  b: string;
  relation: "side" | "stack";
  rotation: number;
  valid: boolean;
  traversable: boolean;
  integrity: string;
  faces: string;
  alignment: number;
  floorDelta: number;
  issue: string;
};

const attempts: Attempt[] = [];
let validDirect = 0;
for (const left of SITE_ARCHETYPES) {
  for (const right of SITE_ARCHETYPES) {
    const meshA = meshes.get(left.archetypeId);
    const meshB = meshes.get(right.archetypeId);
    if (!meshA || !meshB || !left.program || !right.program) continue;
    for (const hostTurn of TURNS) {
      for (const guestTurn of TURNS) {
        const host = tile("a", left.archetypeId, left.program, left.moduleId, 0, MODULE_GROUND_Y, 0, hostTurn);
        const side = tile("b", right.archetypeId, right.program, right.moduleId, MODULE_HEIGHT_FT, MODULE_GROUND_Y, 0, guestTurn);
        const result = proposeDirectJoin(host, side, meshA, meshB);
        if (result.valid) validDirect += 1;
        attempts.push({
          a: left.archetypeId,
          b: right.archetypeId,
          relation: "side",
          rotation: Math.round((hostTurn * 180) / Math.PI) * 1000 + Math.round((guestTurn * 180) / Math.PI),
          valid: result.valid,
          traversable: result.traversable,
          integrity: result.integrity,
          faces: `${result.faceA ?? "-"}/${result.faceB ?? "-"}`,
          alignment: result.alignment,
          floorDelta: result.floorDelta,
          issue: result.valid ? "valid" : issueClass(result.issues),
        });
      }
      const host = tile("a", left.archetypeId, left.program, left.moduleId, 0, MODULE_GROUND_Y, 0, 0);
      const above = tile("c", right.archetypeId, right.program, right.moduleId, 0, MODULE_GROUND_Y + MODULE_HEIGHT_FT, 0, hostTurn);
      const stacked = proposeDirectJoin(host, above, meshA, meshB);
      if (stacked.valid) validDirect += 1;
      attempts.push({
        a: left.archetypeId,
        b: right.archetypeId,
        relation: "stack",
        rotation: Math.round((hostTurn * 180) / Math.PI),
        valid: stacked.valid,
        traversable: stacked.traversable,
        integrity: stacked.integrity,
        faces: `${stacked.faceA ?? "-"}/${stacked.faceB ?? "-"}`,
        alignment: stacked.alignment,
        floorDelta: stacked.floorDelta,
        issue: stacked.valid ? "valid" : issueClass(stacked.issues),
      });
    }
  }
}

const tally: Record<string, number> = {};
for (const attempt of attempts) {
  const key = `${attempt.relation}:${attempt.valid ? "valid" : attempt.issue}`;
  tally[key] = (tally[key] ?? 0) + 1;
}

const promising = attempts.filter((attempt) => attempt.issue === "openings-miss" || attempt.issue === "floor-mismatch" || attempt.issue === "obstructed" || attempt.issue === "too-small" || attempt.issue === "open-shell");
const hybridSample = promising.filter((attempt, index, list) => list.findIndex((item) => item.a === attempt.a && item.b === attempt.b && item.relation === attempt.relation) === index).slice(0, 8);

const loaded = hybridSample.length > 0 ? loadModuleMap(loadSkill3HandoffRecords()) : null;
const hybrids = hybridSample.map((attempt) => {
  const left = SITE_ARCHETYPES.find((item) => item.archetypeId === attempt.a);
  const right = SITE_ARCHETYPES.find((item) => item.archetypeId === attempt.b);
  if (!left?.program || !right?.program || !loaded) return null;
  const turn = (attempt.rotation * Math.PI) / 180;
  const host = tile("a", left.archetypeId, left.program, left.moduleId, 0, MODULE_GROUND_Y, 0, 0);
  const guest = attempt.relation === "side"
    ? tile("b", right.archetypeId, right.program, right.moduleId, MODULE_HEIGHT_FT, MODULE_GROUND_Y, 0, turn)
    : tile("c", right.archetypeId, right.program, right.moduleId, 0, MODULE_GROUND_Y + MODULE_HEIGHT_FT, 0, turn);
  const [faceA, faceB] = suggestedSiteFaces(host, guest);
  const offer = buildHybridOffer({ tileA: host, tileB: guest, faceA, faceB, rawA: meshes.get(left.archetypeId) ?? null, rawB: meshes.get(right.archetypeId) ?? null, loaded });
  if (!offer.ok) return { ...attempt, hybrid: "offer-rejected", reason: offer.reason, correspondence: false, mesh: null };
  const ready = offer.offer.candidates.find((item) => item.status === "ready") ?? offer.offer.candidates[0];
  if (!ready) return { ...attempt, hybrid: "no-candidate", reason: "empty", correspondence: false, mesh: null };
  const seated = placeHybridCandidate(offer.offer, ready.id);
  if (!seated.ok) return { ...attempt, hybrid: "seat-rejected", reason: seated.reason, correspondence: false, mesh: null, candidate: ready.id };
  return {
    ...attempt,
    hybrid: "seated",
    reason: seated.placement.note,
    correspondence: seated.placement.note.includes("Section correspondence is confirmed."),
    mesh: seated.placement.note.includes("Mesh check: unresolved") ? "unresolved" : seated.placement.note.includes("Mesh check: corrected") ? "corrected" : "other",
    integrity: seated.placement.integrity,
    candidate: seated.placement.candidateId,
  };
}).filter((item) => item !== null);

const out = join(process.cwd(), "data", "skill5", "autonomous-test", "repair-02");
mkdirSync(out, { recursive: true });
const report = {
  tiles: faces,
  directAttempts: attempts.length,
  validDirect,
  tally,
  promising: promising.length,
  validExamples: attempts.filter((attempt) => attempt.valid).slice(0, 20),
  hybrids,
};
writeFileSync(join(out, "feasibility.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ tiles: faces.length, directAttempts: attempts.length, validDirect, tally, promising: promising.length, hybrids: hybrids.map((item) => ({ a: item.a, b: item.b, relation: item.relation, hybrid: item.hybrid, correspondence: item.correspondence, mesh: item.mesh })) }, null, 2));
