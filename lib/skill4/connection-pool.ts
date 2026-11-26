import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compatibilityTable, readCompatibility, type KnownAttachment } from "@/lib/skill6/compatibility";
import { acceptedPoses, readAtlas } from "@/lib/skill6/atlas";
import { ENVELOPE_GRID } from "@/lib/skill6/envelope";
import { CONNECTION_SPAN_MAX, CONNECTION_SPAN_MIN } from "./connection-span";
import { facesFromApproach } from "./cluster-face-pair";
import type { FaceId, Vec3 } from "./contract";
import { readHybridConnectable } from "./hybrid-connectable";
import { envelopeWidth } from "./tiles";
import { IDENTITY_BASIS, type Mat3 } from "./tile-basis";

/**
 * Production Final Clusters use hybrid transitions only.
 * Skill 6 compatibility and atlas entries are research hints: faces, poses, and separation.
 */

export type PoolOffer = {
  kind: "hybrid";
  hostFace: FaceId;
  guestFace: FaceId;
  /** Guest origin in the host's local frame, skill4 axes. */
  localOffset: Vec3;
  localRotation: Mat3;
  /** Center-to-center distance in model units. */
  distance: number;
  strength: number;
  poseNote: string;
  /** Where the face pose hint came from. */
  hintSource: "compatibility" | "atlas" | "hybrid-cache" | "attempt";
};

type AttemptRecord = {
  archetypeA: string;
  archetypeB: string;
  faceA: FaceId;
  faceB: FaceId;
  ok: boolean;
  distance: number;
  candidateId: string;
};

type AttemptFile = { version: 1; attempts: AttemptRecord[] };

const ATTEMPT_PATH = path.join(process.cwd(), "data", "skill4", "hybrid-attempt-cache.json");
const AXIS_NAMES = new Set<string>(ENVELOPE_GRID.axes.map((axis) => axis.name));

let productionCache: Map<string, PoolOffer[]> | null = null;
let attempts: AttemptRecord[] | null = null;

function swapToDisplay(x: number, y: number, z: number): Vec3 {
  return { x, y: z, z: y };
}

function applyBasis(basis: readonly number[], x: number, y: number, z: number): [number, number, number] {
  return [
    basis[0] * x + basis[3] * y + basis[6] * z,
    basis[1] * x + basis[4] * y + basis[7] * z,
    basis[2] * x + basis[5] * y + basis[8] * z,
  ];
}

function displayBasis(skill6: readonly number[]): Mat3 {
  const columns = [0, 1, 2].map((column) => {
    const local = column === 0 ? { x: 1, y: 0, z: 0 } : column === 1 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    const skill = applyBasis(skill6, local.x, local.z, local.y);
    return swapToDisplay(skill[0], skill[1], skill[2]);
  });
  return [
    columns[0].x, columns[0].y, columns[0].z,
    columns[1].x, columns[1].y, columns[1].z,
    columns[2].x, columns[2].y, columns[2].z,
  ];
}

function strengthOf(pose: KnownAttachment) {
  const area = Math.max(0, Math.min(1, pose.contactArea / 60));
  const contact = pose.verdict === "surface-contact" ? 1 : 0.7;
  return area * contact;
}

function separationForStrength(strength: number, tightCenter?: number) {
  const span = CONNECTION_SPAN_MIN + (1 - Math.max(0, Math.min(1, strength))) * (CONNECTION_SPAN_MAX - CONNECTION_SPAN_MIN);
  if (tightCenter != null && tightCenter > 8) {
    return Math.max(tightCenter, envelopeWidth() + span);
  }
  return envelopeWidth() + span;
}

function loadAttempts(): AttemptRecord[] {
  if (attempts) return attempts;
  try {
    const parsed = JSON.parse(readFileSync(ATTEMPT_PATH, "utf8")) as AttemptFile;
    attempts = Array.isArray(parsed.attempts) ? parsed.attempts : [];
  } catch {
    attempts = [];
  }
  return attempts;
}

function saveAttempts() {
  mkdirSync(path.dirname(ATTEMPT_PATH), { recursive: true });
  const body: AttemptFile = { version: 1, attempts: attempts ?? [] };
  writeFileSync(ATTEMPT_PATH, JSON.stringify(body));
}

type Hint = {
  hostFace: FaceId;
  guestFace: FaceId;
  localOffset: Vec3;
  localRotation: Mat3;
  strength: number;
  poseNote: string;
  hintSource: PoolOffer["hintSource"];
  tightCenter?: number;
};

function compatibilityHints(): Map<string, Hint[]> {
  const table = compatibilityTable(readCompatibility());
  const map = new Map<string, Hint[]>();
  const file = readCompatibility();
  const ids = new Set<string>();
  for (const pair of file?.pairs ?? []) {
    for (const direction of pair.directions) {
      ids.add(direction.host);
      ids.add(direction.guest);
    }
  }
  for (const host of ids) {
    for (const guest of ids) {
      if (host === guest) continue;
      const poses = table.poses(host, guest);
      const list: Hint[] = [];
      const best = new Map<string, Hint>();
      for (const pose of poses) {
        const axis = pose.note.split(" ")[0] ?? "";
        if (!AXIS_NAMES.has(axis)) continue;
        const faces = facesFromApproach(axis);
        if (!faces) continue;
        const translation = pose.pose.translation;
        const offset = swapToDisplay(translation[0], translation[1], translation[2]);
        const center = Math.hypot(offset.x, offset.y, offset.z);
        if (!(center > 8)) continue;
        const hint: Hint = {
          hostFace: faces.host,
          guestFace: faces.guest,
          localOffset: offset,
          localRotation: displayBasis(pose.pose.basis),
          strength: strengthOf(pose),
          poseNote: pose.note,
          hintSource: "compatibility",
          tightCenter: center,
        };
        const key = `${faces.host}:${faces.guest}`;
        const prior = best.get(key);
        if (!prior || hint.strength > prior.strength) best.set(key, hint);
      }
      for (const hint of best.values()) list.push(hint);
      if (list.length > 0) map.set(`${host}|${guest}`, list);
    }
  }
  return map;
}

function atlasHints(): Map<string, Hint[]> {
  const atlas = readAtlas();
  if (!atlas) return new Map();
  const map = new Map<string, Hint[]>();
  const ids = new Set(atlas.entries.flatMap((entry) => [entry.host, entry.guest]));
  for (const host of ids) {
    for (const guest of ids) {
      if (host === guest) continue;
      const list: Hint[] = [];
      const best = new Map<string, Hint>();
      for (const entry of acceptedPoses(atlas, host, guest)) {
        const axis = entry.parameters.axis ?? entry.region.growthDirection?.split(" ")[0] ?? "";
        const faces = facesFromApproach(axis);
        if (!faces) continue;
        const translation = entry.pose.translation;
        const offset = swapToDisplay(translation[0], translation[1], translation[2]);
        const center = Math.hypot(offset.x, offset.y, offset.z);
        if (!(center > 8)) continue;
        const strength = Math.max(0.35, Math.min(1, entry.contact.area / 60));
        const hint: Hint = {
          hostFace: faces.host,
          guestFace: faces.guest,
          localOffset: offset,
          localRotation: displayBasis(entry.pose.basis),
          strength,
          poseNote: `atlas ${entry.experiment} ${axis}`,
          hintSource: "atlas",
          tightCenter: center,
        };
        const key = `${faces.host}:${faces.guest}`;
        const prior = best.get(key);
        if (!prior || hint.strength > prior.strength) best.set(key, hint);
      }
      for (const hint of best.values()) list.push(hint);
      if (list.length > 0) map.set(`${host}|${guest}`, list);
    }
  }
  return map;
}

function mergeHints(host: string, guest: string): Hint[] {
  const compat = compatibilityHints().get(`${host}|${guest}`) ?? [];
  const atlas = atlasHints().get(`${host}|${guest}`) ?? [];
  const best = new Map<string, Hint>();
  for (const hint of [...compat, ...atlas]) {
    const key = `${hint.hostFace}:${hint.guestFace}`;
    const prior = best.get(key);
    if (!prior || hint.strength > prior.strength) best.set(key, hint);
  }
  return [...best.values()];
}

function hintToOffer(hint: Hint): PoolOffer {
  return {
    kind: "hybrid",
    hostFace: hint.hostFace,
    guestFace: hint.guestFace,
    localOffset: hint.localOffset,
    localRotation: hint.localRotation,
    distance: separationForStrength(hint.strength, hint.tightCenter),
    strength: 0.6 + hint.strength * 0.9,
    poseNote: hint.poseNote,
    hintSource: hint.hintSource,
  };
}

function buildProductionPool(): Map<string, PoolOffer[]> {
  const map = new Map<string, PoolOffer[]>();
  const file = readHybridConnectable();
  const hinted = new Set<string>();

  const addOffer = (host: string, guest: string, offer: PoolOffer) => {
    hinted.add(`${host}|${guest}`);
    const key = `${host}|${guest}`;
    const list = map.get(key) ?? [];
    const dup = list.some((item) => item.hostFace === offer.hostFace && item.guestFace === offer.guestFace && Math.abs(item.distance - offer.distance) < 0.5);
    if (!dup) list.push(offer);
    map.set(key, list);
  };

  const compatKeys = new Set([...compatibilityHints().keys(), ...atlasHints().keys()]);
  for (const key of compatKeys) {
    const [host, guest] = key.split("|") as [string, string];
    for (const hint of mergeHints(host, guest)) addOffer(host, guest, hintToOffer(hint));
  }

  for (const pair of [...file.pairs, ...file.workspaceVertical]) {
    if (!pair.validation || !pair.shrinkwrap || pair.triangles <= 4) continue;
    const strength = Math.min(1, pair.triangles / 80000);
    const distance = envelopeWidth() + (pair.spacing ?? (CONNECTION_SPAN_MIN + CONNECTION_SPAN_MAX) / 2);
    const base = {
      kind: "hybrid" as const,
      localOffset: { x: 0, y: 0, z: 0 },
      localRotation: IDENTITY_BASIS,
      distance,
      strength: 0.75 + strength * 0.25,
      poseNote: `hybrid-cache ${pair.approach}`,
      hintSource: "hybrid-cache" as const,
    };
    addOffer(pair.archetypeA, pair.archetypeB, { ...base, hostFace: pair.faceA, guestFace: pair.faceB });
    addOffer(pair.archetypeB, pair.archetypeA, { ...base, hostFace: pair.faceB, guestFace: pair.faceA });
  }

  for (const attempt of loadAttempts()) {
    if (!attempt.ok) continue;
    addOffer(attempt.archetypeA, attempt.archetypeB, {
      kind: "hybrid",
      hostFace: attempt.faceA,
      guestFace: attempt.faceB,
      localOffset: { x: 0, y: 0, z: 0 },
      localRotation: IDENTITY_BASIS,
      distance: attempt.distance,
      strength: 0.72,
      poseNote: `hybrid attempt ${attempt.candidateId}`,
      hintSource: "attempt",
    });
  }

  for (const list of map.values()) list.sort((left, right) => right.strength - left.strength);
  return map;
}

export function offersBetween(hostId: string, guestId: string): PoolOffer[] {
  if (!hostId || !guestId || hostId === guestId) return [];
  productionCache ??= buildProductionPool();
  return productionCache.get(`${hostId}|${guestId}`) ?? [];
}

export function hasAnyOffer(archetypeId: string, pool: readonly string[]) {
  productionCache ??= buildProductionPool();
  return pool.some((other) => other !== archetypeId && (
    (productionCache.get(`${archetypeId}|${other}`)?.length ?? 0) > 0
    || (productionCache.get(`${other}|${archetypeId}`)?.length ?? 0) > 0
  ));
}

export function recordHybridAttempt(record: AttemptRecord) {
  const list = loadAttempts();
  const index = list.findIndex((item) =>
    item.archetypeA === record.archetypeA
    && item.archetypeB === record.archetypeB
    && item.faceA === record.faceA
    && item.faceB === record.faceB);
  if (index >= 0) list[index] = record;
  else list.push(record);
  attempts = list;
  saveAttempts();
  productionCache = null;
}

export function attemptWasRecorded(archetypeA: string, archetypeB: string, faceA: FaceId, faceB: FaceId) {
  return loadAttempts().some((item) =>
    item.archetypeA === archetypeA && item.archetypeB === archetypeB && item.faceA === faceA && item.faceB === faceB);
}

export function poolStats() {
  productionCache ??= buildProductionPool();
  let hybridCount = 0;
  let fromCompat = 0;
  let fromAtlas = 0;
  for (const list of productionCache.values()) {
    hybridCount += list.length;
    for (const offer of list) {
      if (offer.hintSource === "compatibility") fromCompat += 1;
      if (offer.hintSource === "atlas") fromAtlas += 1;
    }
  }
  return {
    hybridEdges: hybridCount,
    compatibilityInformed: fromCompat,
    atlasInformed: fromAtlas,
    attempted: loadAttempts().length,
    attemptFile: existsSync(ATTEMPT_PATH),
  };
}