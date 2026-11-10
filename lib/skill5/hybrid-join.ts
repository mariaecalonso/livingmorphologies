import type { ModuleHandoff } from "@/lib/skill4/adapt";
import { placedFaceFrame, resolveAssemblyHybrid } from "@/lib/skill4/assembly-hybrid";
import { validateMeshes } from "@/lib/skill4/assembly-validation";
import { generateCandidateField } from "@/lib/skill4/candidate-field";
import { connectionInputSignature, generateConnectionHybridField, type TileConnection } from "@/lib/skill4/connections";
import { MODULE_SIZE, type FaceId, type Vec3 } from "@/lib/skill4/contract";
import { rotateByBasis, type Mat3 } from "@/lib/skill4/tile-basis";
import { resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { PlacedModule } from "./placement";

/** Site faces use the rendered module: X east, Y up, Z north. */
export type SiteFace = "E" | "W" | "N" | "S" | "T" | "B";

export const SITE_FACES: readonly SiteFace[] = ["E", "W", "N", "S", "T", "B"];

const SITE_TO_SKILL: Record<SiteFace, FaceId> = {
  E: "E",
  W: "W",
  N: "T",
  S: "B",
  T: "N",
  B: "S",
};

const SKILL_TO_SITE: Record<FaceId, SiteFace> = {
  E: "E",
  W: "W",
  T: "N",
  B: "S",
  N: "T",
  S: "B",
};

export type HybridPassage = { positions: number[]; indices: number[] };

export type HybridCandidateChoice = {
  id: string;
  status: string;
  reason: string;
  correspondence: "YES" | "NO" | null;
};

export type HybridOffer = {
  tiles: TileInstance[];
  loaded: ReadonlyMap<string, ModuleHandoff>;
  connection: TileConnection;
  siteFaceA: SiteFace;
  siteFaceB: SiteFace;
  candidates: HybridCandidateChoice[];
};

export type HybridPlacement = {
  candidateId: string;
  passage: HybridPassage;
  faceA: SiteFace;
  faceB: SiteFace;
  joinType: "side" | "stack";
  alignment: number;
  floorDelta: number;
  integrity: "closed" | "open";
  note: string;
};

export type StoredHybridJoin = {
  id: string;
  tileA: string;
  tileB: string;
  faceA: string;
  faceB: string;
  joinType: "side" | "stack";
  alignment: number;
  floorDelta: number;
  integrity: "closed" | "open";
  candidateId: string;
  note: string;
  passage: HybridPassage;
};

type Bounds = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };

function boundsOf(positions: ArrayLike<number>): Bounds | null {
  if (positions.length < 9) return null;
  const box: Bounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    if (x < box.minX) box.minX = x;
    if (y < box.minY) box.minY = y;
    if (z < box.minZ) box.minZ = z;
    if (x > box.maxX) box.maxX = x;
    if (y > box.maxY) box.maxY = y;
    if (z > box.maxZ) box.maxZ = z;
  }
  if (![box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ].every(Number.isFinite)) return null;
  return box;
}

/** Same seating Skill 04 uses: plan centered, lowest vertex on the cell floor. */
export function registrationShift(positions: ArrayLike<number>) {
  const box = boundsOf(positions);
  if (!box) return null;
  const half = MODULE_SIZE / 2;
  return {
    x: -((box.minX + box.maxX) / 2),
    y: -half - box.minY,
    z: -((box.minZ + box.maxZ) / 2),
    minZ: box.minZ,
  };
}

function pose(vector: Vec3, mirror: "x" | "z" | null, rotationY: number): Vec3 {
  let x = vector.x;
  let z = vector.z;
  if (mirror === "x") x = -x;
  if (mirror === "z") z = -z;
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return { x: x * cosine - z * sine, y: vector.y, z: x * sine + z * cosine };
}

function basisFor(mirror: "x" | "z" | null, rotationY: number): Mat3 {
  const east = pose({ x: 1, y: 0, z: 0 }, mirror, rotationY);
  const north = pose({ x: 0, y: 0, z: 1 }, mirror, rotationY);
  const up = pose({ x: 0, y: 1, z: 0 }, mirror, rotationY);
  return [east.x, east.y, east.z, north.x, north.y, north.z, up.x, up.y, up.z];
}

/** Skill 04 local point to the site frame, before the tile pose. */
export function skillLocalToSite(point: Vec3, shift: { x: number; y: number; z: number; minZ: number }): Vec3 {
  return {
    x: point.x - shift.x,
    y: point.z - shift.z - shift.minZ,
    z: point.y - shift.y,
  };
}

export function siteTile(instance: PlacedModule, raw: ArrayLike<number> | null): TileInstance | null {
  if (!raw) return null;
  const shift = registrationShift(raw);
  if (!shift) return null;
  const mirror = instance.mirror === "x" || instance.mirror === "z" ? instance.mirror : null;
  const rotationY = instance.transform.rotationY;
  const offset = pose({ x: -shift.x, y: -shift.z - shift.minZ, z: -shift.y }, mirror, rotationY);
  return {
    instanceId: instance.instanceId,
    archetypeId: instance.provenance.archetypeId,
    moduleId: instance.provenance.moduleId,
    transform: {
      x: instance.transform.position.x + offset.x,
      y: instance.transform.position.y + offset.y,
      z: instance.transform.position.z + offset.z,
    },
    rotationQuarter: 0,
    mirror: null,
    rotation: basisFor(mirror, rotationY),
  };
}

export function suggestedSiteFaces(first: PlacedModule, second: PlacedModule): [SiteFace, SiteFace] {
  const dx = second.transform.position.x - first.transform.position.x;
  const dy = second.transform.position.y - first.transform.position.y;
  const dz = second.transform.position.z - first.transform.position.z;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);
  if (ay >= ax && ay >= az) return dy >= 0 ? ["T", "B"] : ["B", "T"];
  if (ax >= az) return dx >= 0 ? ["E", "W"] : ["W", "E"];
  return dz >= 0 ? ["N", "S"] : ["S", "N"];
}

export function siteFaceLabel(face: SiteFace) {
  return { E: "East", W: "West", N: "North", S: "South", T: "Top", B: "Bottom" }[face];
}

export function buildHybridOffer(input: {
  tileA: PlacedModule;
  tileB: PlacedModule;
  faceA: SiteFace;
  faceB: SiteFace;
  rawA: ArrayLike<number> | null;
  rawB: ArrayLike<number> | null;
  loaded: ReadonlyMap<string, ModuleHandoff>;
}): { ok: true; offer: HybridOffer } | { ok: false; reason: string } {
  if (input.tileA.instanceId === input.tileB.instanceId) return { ok: false, reason: "Choose two different tiles." };
  const tileA = siteTile(input.tileA, input.rawA);
  const tileB = siteTile(input.tileB, input.rawB);
  if (!tileA || !tileB) return { ok: false, reason: "A selected tile has no mesh, so its face cannot be read." };
  const moduleA = resolveTileModule(tileA.archetypeId, input.loaded);
  const moduleB = resolveTileModule(tileB.archetypeId, input.loaded);
  const skillA = SITE_TO_SKILL[input.faceA];
  const skillB = SITE_TO_SKILL[input.faceB];
  const draft: TileConnection = {
    id: `site:${tileA.instanceId}:${tileB.instanceId}:${input.faceA}:${input.faceB}`,
    tileAId: tileA.instanceId,
    tileBId: tileB.instanceId,
    faceA: skillA,
    faceB: skillB,
    origin: "explicit",
    generationStatus: "not-generated",
    faceSelection: "user",
    inputsChanged: false,
    signature: "",
    candidateField: null,
    generatedHybridField: null,
    selectedMockId: "",
  };
  draft.signature = connectionInputSignature(draft, [tileA, tileB], input.loaded);
  const inputs = generateCandidateField({
    signature: draft.signature,
    faceA: skillA,
    faceB: skillB,
    moduleA,
    moduleB,
  });
  if (!inputs.ok) return { ok: false, reason: inputs.reason };
  const generated = generateConnectionHybridField({ ...draft, candidateField: inputs.field }, [tileA, tileB], input.loaded);
  if (!generated.ok) return { ok: false, reason: generated.reason };
  const field = generated.connection.generatedHybridField;
  if (!field || field.candidates.length === 0) return { ok: false, reason: "Skill 04 returned no hybrid candidates." };
  return {
    ok: true,
    offer: {
      tiles: [tileA, tileB],
      loaded: input.loaded,
      connection: generated.connection,
      siteFaceA: input.faceA,
      siteFaceB: input.faceB,
      candidates: field.candidates.map((candidate) => ({
        id: candidate.candidateId,
        status: candidate.status,
        reason: candidate.reason,
        correspondence: candidate.sectionReport?.correspondence ?? null,
      })),
    },
  };
}

export function placeHybridCandidate(offer: HybridOffer, candidateId: string): { ok: true; placement: HybridPlacement } | { ok: false; reason: string } {
  const field = offer.connection.generatedHybridField;
  const candidate = field?.candidates.find((item) => item.candidateId === candidateId) ?? null;
  if (!candidate) return { ok: false, reason: "That hybrid candidate is not in this pair." };
  if (candidate.status !== "ready" || !candidate.geometry) {
    return { ok: false, reason: candidate.reason || "This candidate has no hybrid mesh." };
  }
  const seated = resolveAssemblyHybrid(
    { ...offer.connection, selectedMockId: candidateId },
    offer.tiles,
    offer.loaded,
    candidate.geometry,
  );
  if (seated.status !== "ready" || seated.placement !== "placed-faces" || !seated.geometry) {
    return { ok: false, reason: "Skill 04 could not seat this hybrid on the selected faces." };
  }
  const moduleA = resolveTileModule(offer.tiles[0].archetypeId, offer.loaded);
  const moduleB = resolveTileModule(offer.tiles[1].archetypeId, offer.loaded);
  if (moduleA.status !== "ready" || moduleB.status !== "ready") return { ok: false, reason: "The parent modules are not ready." };
  const frameA = placedFaceFrame(moduleA.faces[offer.connection.faceA], offer.tiles[0]);
  const frameB = placedFaceFrame(moduleB.faces[offer.connection.faceB], offer.tiles[1]);
  const gap = gapIssue(seated.geometry.positions, frameA.origin, frameB.origin);
  if (gap) return { ok: false, reason: gap };
  const validation = validateMeshes([copyMesh(seated.geometry)]);
  if (!meshIntact(seated.geometry)) return { ok: false, reason: "The hybrid mesh is not valid. Nothing was added." };
  const shell = closedShell(seated.geometry);
  const passage = copyPassage(seated.geometry);
  const stack = offer.siteFaceA === "T" || offer.siteFaceA === "B" || offer.siteFaceB === "T" || offer.siteFaceB === "B";
  const openings = (candidate.sectionReport?.nearOpeningsA ?? 0) + (candidate.sectionReport?.nearOpeningsB ?? 0);
  return {
    ok: true,
    placement: {
      candidateId,
      passage,
      faceA: SKILL_TO_SITE[offer.connection.faceA],
      faceB: SKILL_TO_SITE[offer.connection.faceB],
      joinType: stack ? "stack" : "side",
      alignment: openings,
      floorDelta: Math.abs(frameA.origin.y - frameB.origin.y) < 1.5 ? 0 : 1,
      integrity: shell ? "closed" : "open",
      note: [
        `${siteFaceLabel(offer.siteFaceA)} to ${siteFaceLabel(offer.siteFaceB)}. ${candidateId}.`,
        "The hybrid meets both faces.",
        validation ? `Mesh check: ${validation.verdict}. ${validation.note}` : "Mesh check did not return a verdict.",
        candidate.sectionReport?.correspondence === "YES" ? "Section correspondence is confirmed." : "Section correspondence was not confirmed.",
      ].filter(Boolean).join(" "),
    },
  };
}

function gapIssue(positions: ArrayLike<number>, originA: Vec3, originB: Vec3) {
  const span = { x: originB.x - originA.x, y: originB.y - originA.y, z: originB.z - originA.z };
  const length = Math.hypot(span.x, span.y, span.z);
  if (length < 0.05) return "The selected faces occupy the same place. No hybrid was added.";
  let nearA = Infinity;
  let nearB = Infinity;
  let off = 0;
  let count = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const point = { x: positions[index], y: positions[index + 1], z: positions[index + 2] };
    if (![point.x, point.y, point.z].every(Number.isFinite)) return "The hybrid mesh has invalid coordinates.";
    count += 1;
    nearA = Math.min(nearA, distance(point, originA));
    nearB = Math.min(nearB, distance(point, originB));
    const t = Math.min(1, Math.max(0, ((point.x - originA.x) * span.x + (point.y - originA.y) * span.y + (point.z - originA.z) * span.z) / (length * length)));
    const closest = { x: originA.x + span.x * t, y: originA.y + span.y * t, z: originA.z + span.z * t };
    if (distance(point, closest) > 14) off += 1;
  }
  if (count < 12) return "The hybrid mesh is empty.";
  if (nearA > 8 || nearB > 8) return "The hybrid does not meet both selected faces. Nothing was added.";
  if (off / count > 0.35) return "The hybrid leaves the space between the tiles. Nothing was added.";
  return null;
}

function distance(left: Vec3, right: Vec3) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function meshIntact(mesh: IsoMesh) {
  const count = mesh.positions.length / 3;
  if (mesh.indices.length < 12 || mesh.indices.length % 3 !== 0) return false;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const tri = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    if (tri.some((vertex) => vertex < 0 || vertex >= count)) return false;
    const area = triangleArea(mesh.positions, tri[0], tri[1], tri[2]);
    if (area < 1e-6) return false;
  }
  return true;
}

function triangleArea(positions: ArrayLike<number>, a: number, b: number, c: number) {
  const ax = positions[b * 3] - positions[a * 3];
  const ay = positions[b * 3 + 1] - positions[a * 3 + 1];
  const az = positions[b * 3 + 2] - positions[a * 3 + 2];
  const bx = positions[c * 3] - positions[a * 3];
  const by = positions[c * 3 + 1] - positions[a * 3 + 1];
  const bz = positions[c * 3 + 2] - positions[a * 3 + 2];
  const crossX = ay * bz - az * by;
  const crossY = az * bx - ax * bz;
  const crossZ = ax * by - ay * bx;
  return Math.hypot(crossX, crossY, crossZ) * 0.5;
}

function closedShell(mesh: IsoMesh) {
  if (mesh.indices.length < 12 || mesh.indices.length % 3 !== 0) return false;
  const edges = new Map<string, number>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const tri = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[2] === tri[0]) return false;
    for (const [from, to] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const count of edges.values()) if (count !== 2) return false;
  return true;
}

function copyMesh(mesh: IsoMesh): IsoMesh {
  return {
    positions: Float32Array.from(mesh.positions),
    normals: Float32Array.from(mesh.normals),
    indices: Uint32Array.from(mesh.indices),
    triangles: mesh.triangles,
  };
}

function copyPassage(mesh: IsoMesh): HybridPassage {
  return { positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) };
}

export function readStoredHybrids(value: unknown): StoredHybridJoin[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const link = item as Record<string, unknown>;
    const passage = link.passage;
    if (!passage || typeof passage !== "object") return [];
    const body = passage as { positions?: unknown; indices?: unknown };
    if (!Array.isArray(body.positions) || !Array.isArray(body.indices)) return [];
    const positions = body.positions.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
    const indices = body.indices.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry) && entry >= 0);
    if (typeof link.id !== "string" || typeof link.tileA !== "string" || typeof link.tileB !== "string") return [];
    if (typeof link.faceA !== "string" || typeof link.faceB !== "string" || typeof link.candidateId !== "string") return [];
    if (link.joinType !== "side" && link.joinType !== "stack") return [];
    if (positions.length < 9 || indices.length < 12) return [];
    return [{
      id: link.id,
      tileA: link.tileA,
      tileB: link.tileB,
      faceA: link.faceA,
      faceB: link.faceB,
      joinType: link.joinType,
      alignment: typeof link.alignment === "number" ? link.alignment : 0,
      floorDelta: typeof link.floorDelta === "number" ? link.floorDelta : 0,
      integrity: link.integrity === "open" ? "open" as const : "closed" as const,
      candidateId: link.candidateId,
      note: typeof link.note === "string" ? link.note : "",
      passage: { positions, indices },
    }];
  });
}

/** Maps one raw vertex through the same transform the seated hybrid uses. */
export function placedRawVertex(raw: ArrayLike<number>, index: number, instance: PlacedModule) {
  const tile = siteTile(instance, raw);
  const shift = registrationShift(raw);
  if (!tile?.rotation || !shift) return null;
  const local = {
    x: raw[index] + shift.x,
    y: raw[index + 1] + shift.y,
    z: raw[index + 2] + shift.z,
  };
  const turned = rotateByBasis(tile.rotation, local);
  return { x: turned.x + tile.transform.x, y: turned.y + tile.transform.y, z: turned.z + tile.transform.z };
}
