import { FACE_IDS, faceFrames, type FaceId, type Vec3 } from "./contract";
import type { CompatibleFacePair } from "./face-pair";
import { compatibilityTable, readCompatibility, type KnownAttachment } from "@/lib/skill6/compatibility";
import { sourcePointToSkill6, type Vec3 as Skill6Vec } from "@/lib/skill6/contract";
import { ENVELOPE_GRID } from "@/lib/skill6/envelope";
import { readHybridConnectable } from "./hybrid-connectable";

const FRAMES = faceFrames({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } });
const AXES = new Map(ENVELOPE_GRID.axes.map((axis) => [axis.name, axis.direction]));

let table: ReturnType<typeof compatibilityTable> | null = null;

function cache() {
  table ??= compatibilityTable(readCompatibility());
  return table;
}

/** Skill 6 direction, stored on the compatibility pose, back into the isomesh face frame. */
function hostFace(direction: Skill6Vec): FaceId | null {
  const towardGuest: Vec3 = { x: direction[0], y: direction[2], z: direction[1] };
  const check = sourcePointToSkill6(towardGuest.x, towardGuest.y, towardGuest.z);
  if (check[0] !== direction[0] || check[1] !== direction[1] || check[2] !== direction[2]) return null;
  return faceAlong(towardGuest);
}

function faceAlong(normal: Vec3): FaceId | null {
  let best: FaceId | null = null;
  let score = 0.5;
  for (const id of FACE_IDS) {
    const frame = FRAMES[id].normal;
    const dot = frame.x * normal.x + frame.y * normal.y + frame.z * normal.z;
    if (dot > score) {
      score = dot;
      best = id;
    }
  }
  return best;
}

function opposite(face: FaceId): FaceId | null {
  const normal = FRAMES[face].normal;
  return faceAlong({ x: -normal.x, y: -normal.y, z: -normal.z });
}

/** Skill 6 approach axis, such as "-X", as the host face and the opposing guest face. */
export function facesFromApproach(axisName: string): { host: FaceId; guest: FaceId } | null {
  const direction = AXES.get(axisName);
  if (!direction) return null;
  const host = hostFace(direction);
  if (!host) return null;
  const guest = opposite(host);
  if (!guest) return null;
  return { host, guest };
}

function consider(pairs: Map<string, CompatibleFacePair>, faceA: FaceId, faceB: FaceId, score: number) {
  const key = `${faceA}:${faceB}`;
  const prior = pairs.get(key);
  if (!prior || score > prior.score) pairs.set(key, { faceA, faceB, score });
}

function addPoses(pairs: Map<string, CompatibleFacePair>, poses: readonly KnownAttachment[], hostIsA: boolean) {
  for (const pose of poses) {
    const name = pose.note.split(" ")[0] ?? "";
    const direction = AXES.get(name);
    if (!direction) continue;
    const host = hostFace(direction);
    if (!host) continue;
    const guest = opposite(host);
    if (!guest) continue;
    if (hostIsA) consider(pairs, host, guest, pose.contactArea);
    else consider(pairs, guest, host, pose.contactArea);
  }
}

/** Direct Skill 6 seating first. A verified hybrid bridge is used only when that seating has no pose. */
export function rankCompatibleFaces(archetypeA: string, archetypeB: string): CompatibleFacePair[] {
  if (!archetypeA || !archetypeB) return [];
  const known = cache();
  const pairs = new Map<string, CompatibleFacePair>();
  addPoses(pairs, known.poses(archetypeA, archetypeB), true);
  addPoses(pairs, known.poses(archetypeB, archetypeA), false);
  if (pairs.size === 0) addHybridPoses(pairs, archetypeA, archetypeB);
  return [...pairs.values()].sort((left, right) => right.score - left.score);
}

function addHybridPoses(pairs: Map<string, CompatibleFacePair>, archetypeA: string, archetypeB: string) {
  for (const pair of readHybridConnectable().pairs) {
    const forward = pair.archetypeA === archetypeA && pair.archetypeB === archetypeB;
    const reverse = pair.archetypeA === archetypeB && pair.archetypeB === archetypeA;
    if (!forward && !reverse) continue;
    if (!pair.validation || !pair.shrinkwrap || pair.triangles <= 4) continue;
    if (forward) consider(pairs, pair.faceA, pair.faceB, pair.triangles);
    else consider(pairs, pair.faceB, pair.faceA, pair.triangles);
  }
}
