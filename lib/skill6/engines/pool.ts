/**
 * Discrete docking candidates shared by every Initial Clustering Lab engine.
 * Atlas poses and the compatibility library are inputs. They are not revalidated here.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ClusterMorphology, GrowthDirection, Skill6Pose, Vec3 } from "../contract";
import { candidatePoses, readAtlas, sourceRevision } from "../atlas";
import type { KnownAttachment } from "../compatibility";
import { reseatPose } from "../envelope";
import { loadTranslatedTable } from "../shifts";
import type { ArchetypeMesh } from "../source";
import { pairValid } from "./board";

export type DockCandidate = {
  id: number;
  host: string;
  guest: string;
  pose: Skill6Pose;
  area: number;
  direction: GrowthDirection | "other";
  up: number;
  note: string;
  source: "atlas" | "compatibility" | "reseat";
};

export type DockPool = {
  revision: string;
  candidates: DockCandidate[];
  forHost(host: string): DockCandidate[];
  forPair(host: string, guest: string): DockCandidate[];
  /** Capped atlas, compatibility, and reseated poses, in the shape the rule solver already reads. */
  knownFor(hostId: string, guestId: string): KnownAttachment[];
  ruleAtlas: { poses(hostId: string, guestId: string): KnownAttachment[] };
  ruleTable: ReturnType<typeof loadTranslatedTable>;
};

const PER_DIRECTION = 2;
const RESEAT_BASES = 2;
const RESEAT_AXES: { name: GrowthDirection; axis: Vec3 }[] = [
  { name: "+X", axis: [1, 0, 0] },
  { name: "-X", axis: [-1, 0, 0] },
  { name: "+Y", axis: [0, 1, 0] },
  { name: "-Y", axis: [0, -1, 0] },
  { name: "+Z", axis: [0, 0, 1] },
];

function directionOf(note: string, stored: string | null): GrowthDirection | "other" {
  const token = stored ?? note.split(" ")[0] ?? "";
  if (token === "+X" || token === "-X" || token === "+Y" || token === "-Y" || token === "+Z" || token === "-Z") return token;
  return "other";
}

function poseToken(pose: Skill6Pose): string {
  return `${pose.basis.map((value) => value.toFixed(3)).join(",")}|${pose.translation.map((value) => value.toFixed(2)).join(",")}`;
}

export type PoolOptions = {
  /** Drop candidates whose pair contact or host crossing fails at identity, before the per-direction cap. */
  checked?: boolean;
  /** Valid poses kept per directed pair and direction. Undefined keeps 2. */
  perDirection?: number;
  /** JSON cache of pair checks keyed by revision and pose. Read and extended, never required. */
  cachePath?: string;
};

/** Highest-area poses per directed pair. The engines choose among these. Geometry is still measured on the cluster. */
export function loadDockPool(meshes: readonly ArchetypeMesh[], options: PoolOptions = {}): DockPool {
  const atlas = readAtlas();
  if (!atlas) throw new Error("Compatibility atlas is missing.");
  const revision = sourceRevision(meshes);
  if (atlas.sourceRevision !== revision) throw new Error(`Atlas revision ${atlas.sourceRevision} does not match the source meshes ${revision}.`);
  const table = loadTranslatedTable();
  const grouped = new Map<string, DockCandidate[]>();
  const seen = new Set<string>();
  let next = 0;
  const push = (candidate: Omit<DockCandidate, "id">) => {
    const key = `${candidate.host}|${candidate.guest}|${poseToken(candidate.pose)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const list = grouped.get(`${candidate.host}|${candidate.guest}`) ?? [];
    list.push({ ...candidate, id: next });
    next += 1;
    grouped.set(`${candidate.host}|${candidate.guest}`, list);
  };
  for (const entry of atlas.entries) {
    if (entry.outcome !== "accepted" || entry.sourceRevision !== revision) continue;
    push({
      host: entry.host,
      guest: entry.guest,
      pose: {
        quarterZ: entry.pose.quarterZ,
        mirrorX: entry.pose.mirrorX,
        basis: entry.pose.basis as unknown as Skill6Pose["basis"],
        translation: entry.pose.translation as unknown as Skill6Pose["translation"],
      },
      area: entry.contact.area,
      direction: directionOf(entry.region.growthDirection ?? "", entry.region.growthDirection),
      up: entry.pose.basis[8] ?? 0,
      note: labeled(directionOf(entry.region.growthDirection ?? "", entry.region.growthDirection), `atlas ${entry.method} ${entry.region.growthDirection ?? "unlabeled"}`),
      source: "atlas",
    });
  }
  for (const mesh of meshes) {
    for (const guest of meshes) {
      for (const known of table.poses(mesh.archetypeId, guest.archetypeId)) {
        push({
          host: mesh.archetypeId,
          guest: guest.archetypeId,
          pose: known.pose,
          area: known.contactArea,
          direction: directionOf(known.note, null),
          up: known.pose.basis[8],
          note: known.note,
          source: "compatibility",
        });
      }
    }
  }
  const byMesh = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const bases = [...grouped.entries()];
  for (const [key, list] of bases) {
    const [hostId, guestId] = key.split("|");
    const host = hostId ? byMesh.get(hostId) : undefined;
    const guest = guestId ? byMesh.get(guestId) : undefined;
    if (!host || !guest) continue;
    const ranked = list.slice().sort((left, right) => right.area - left.area).slice(0, RESEAT_BASES);
    for (const base of ranked) {
      for (const aim of RESEAT_AXES) {
        if (base.direction === aim.name) continue;
        push({
          host: base.host,
          guest: base.guest,
          pose: reseatPose(host, guest, base.pose, aim.axis),
          area: base.area,
          direction: aim.name,
          up: base.up,
          note: labeled(aim.name, `reseat ${base.note}`),
          source: "reseat",
        });
      }
    }
  }
  if (options.checked) {
    const cache: Record<string, boolean> = options.cachePath && existsSync(options.cachePath) ? JSON.parse(readFileSync(options.cachePath, "utf8")) : {};
    let added = 0;
    for (const [key, list] of grouped.entries()) {
      const kept = list.filter((candidate) => {
        const token = `${revision}|${candidate.host}|${candidate.guest}|${poseToken(candidate.pose)}`;
        if (cache[token] == null) {
          const host = byMesh.get(candidate.host);
          const guest = byMesh.get(candidate.guest);
          cache[token] = Boolean(host && guest && pairValid(host, guest, candidate.pose));
          added += 1;
        }
        return cache[token];
      });
      grouped.set(key, kept);
    }
    if (options.cachePath && added > 0) writeFileSync(options.cachePath, JSON.stringify(cache));
  }
  const cap = options.perDirection ?? PER_DIRECTION;
  const candidates: DockCandidate[] = [];
  for (const list of grouped.values()) {
    list.sort((left, right) => Number(left.source === "reseat") - Number(right.source === "reseat") || right.area - left.area);
    const kept = new Map<string, number>();
    for (const candidate of list) {
      const count = kept.get(candidate.direction) ?? 0;
      if (count >= cap) continue;
      kept.set(candidate.direction, count + 1);
      candidates.push(candidate);
    }
  }
  const byHost = new Map<string, DockCandidate[]>();
  const byPair = new Map<string, DockCandidate[]>();
  for (const candidate of candidates) {
    byHost.set(candidate.host, [...(byHost.get(candidate.host) ?? []), candidate]);
    byPair.set(`${candidate.host}|${candidate.guest}`, [...(byPair.get(`${candidate.host}|${candidate.guest}`) ?? []), candidate]);
  }
  const atlasKnown = new Map<string, KnownAttachment[]>();
  for (const mesh of meshes) {
    for (const guest of meshes) {
      const poses = candidatePoses(atlas, mesh.archetypeId, guest.archetypeId, revision).map((pose): KnownAttachment => ({
        pose: pose.pose,
        contactArea: pose.contactArea,
        coherentRegions: 1,
        residualGap: null,
        minSurfaceDistance: null,
        normalAlignment: -1,
        deepestCrossing: 0,
        overlapVolume: null,
        verdict: "near-contact",
        note: `atlas ${pose.method}`,
      }));
      if (poses.length > 0) atlasKnown.set(`${mesh.archetypeId}|${guest.archetypeId}`, poses);
    }
  }
  const known = new Map<string, KnownAttachment[]>();
  for (const candidate of candidates) {
    const key = `${candidate.host}|${candidate.guest}`;
    const list = known.get(key) ?? [];
    list.push({
      pose: candidate.pose,
      contactArea: candidate.area,
      coherentRegions: 1,
      residualGap: null,
      minSurfaceDistance: null,
      normalAlignment: -1,
      deepestCrossing: 0,
      overlapVolume: null,
      verdict: "near-contact",
      note: candidate.note,
    });
    known.set(key, list);
  }
  return {
    revision,
    candidates,
    forHost: (host) => byHost.get(host) ?? [],
    forPair: (host, guest) => byPair.get(`${host}|${guest}`) ?? [],
    knownFor: (hostId, guestId) => known.get(`${hostId}|${guestId}`) ?? [],
    ruleAtlas: { poses: (hostId, guestId) => atlasKnown.get(`${hostId}|${guestId}`) ?? [] },
    ruleTable: table,
  };
}

function labeled(direction: GrowthDirection | "other", note: string): string {
  if (direction === "other" || note.startsWith(`${direction} `) || note.startsWith(direction)) return note;
  return `${direction} ${note}`;
}

/** Highest score first inside each direction, then one direction at a time. A long −X list does not hide +Z. */
export function spreadByDirection<T>(items: readonly T[], directionOf: (item: T) => string): T[] {
  const lanes = new Map<string, T[]>();
  for (const item of items) {
    const key = directionOf(item);
    const lane = lanes.get(key) ?? [];
    lane.push(item);
    lanes.set(key, lane);
  }
  const keys = ["+Z", "+Y", "-Y", "+X", "-X", "-Z", "other"].filter((key) => lanes.has(key));
  const ordered: T[] = [];
  let pending = true;
  while (pending) {
    pending = false;
    for (const key of keys) {
      const next = lanes.get(key)?.shift();
      if (!next) continue;
      ordered.push(next);
      pending = true;
    }
  }
  return ordered;
}

/** Preference used before a pose is measured. It does not accept a contact. */
export function preference(morphology: ClusterMorphology, candidate: DockCandidate, usedDirections: ReadonlySet<string>, hostChildren: number): number {
  const fresh = candidate.direction !== "other" && !usedDirections.has(candidate.direction);
  const span = Math.hypot(candidate.pose.translation[0], candidate.pose.translation[1], candidate.pose.translation[2]);
  const compact = Math.min(candidate.area, 40) * 0.15 - span * 0.04;
  const branching = (fresh ? 8 : 0) + (hostChildren >= 1 ? 6 : 2) + (candidate.direction === "+Z" ? 0 : 1);
  const vertical = (candidate.direction === "+Z" ? 12 : 0) + candidate.up * 4 + Math.max(0, candidate.pose.translation[2]) * 0.2;
  if (morphology === "compact") return compact;
  if (morphology === "branching") return branching;
  if (morphology === "vertical") return vertical;
  return compact + branching + vertical;
}
