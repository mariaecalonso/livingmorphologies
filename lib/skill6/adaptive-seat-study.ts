/**
 * Fixed clearance against adaptive seating, on the orientations already recorded
 * in the compatibility library. The library is read only.
 *
 * Run: npx tsx lib/skill6/adaptive-seat-study.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "./assembly";
import { betterContact, poseAtGap, searchAdaptiveSeat, searchReseatedSlides, type SeatCandidate } from "./adaptive-seat";
import { readCompatibility } from "./compatibility";
import {
  SKILL6_CONTRACT,
  SKILL6_COVERAGE_ALGORITHM,
  SKILL6_PARAMETERS,
  type ClusterRecord,
  type ContactRelation,
  type SearchStats,
  type Skill6Pose,
  type Vec3,
} from "./contract";
import { ENVELOPE_GRID, type EnvelopeSpec } from "./envelope";
import { IDENTITY, poseWithBasis, sub } from "./geometry";
import { connectedGroups, measureCluster } from "./metrics";
import { measurePreservation } from "./preservation";
import { loadArchetypeMeshes, type ArchetypeMesh } from "./source";

const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", "adaptive-seating-v1");
const AXIS: Record<string, Vec3> = {
  "+X": [1, 0, 0],
  "-X": [-1, 0, 0],
  "+Y": [0, 1, 0],
  "-Y": [0, -1, 0],
  "+Z": [0, 0, 1],
  "-Z": [0, 0, -1],
};

type DirectionJob = {
  key: string;
  hostId: string;
  guestId: string;
  libraryCompatible: boolean;
  libraryReason: string | null;
  spec: EnvelopeSpec;
};

function specOf(pose: { yaw: number; pitch: number; roll: number; axis: string; mirrorX: boolean }): EnvelopeSpec {
  const axis = AXIS[pose.axis];
  if (!axis) throw new Error(`Unknown axis ${pose.axis}`);
  return { yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll, axis, axisName: pose.axis, gap: ENVELOPE_GRID.gap, mirrorX: pose.mirrorX };
}

function specFromText(text: string): EnvelopeSpec {
  const match = text.match(/^(\S+) yaw (\S+) pitch (\S+) roll (\S+) gap (\S+)( mirror)?/);
  if (!match) throw new Error(`Unreadable near miss: ${text}`);
  return specOf({ axis: match[1], yaw: Number(match[2]), pitch: Number(match[3]), roll: Number(match[4]), mirrorX: Boolean(match[6]) });
}

function jobs(): DirectionJob[] {
  const file = readCompatibility();
  if (!file) throw new Error("compatibility.json is missing. Adaptive seating does not rebuild it.");
  const found: DirectionJob[] = [];
  for (const pair of file.pairs) {
    for (const direction of pair.directions) {
      const stored = direction.poses[0];
      const spec = stored ? specOf(stored) : direction.nearMiss ? specFromText(direction.nearMiss.pose) : null;
      if (!spec) continue;
      found.push({
        key: `${direction.host}|${direction.guest}|${spec.axisName}|${spec.yaw}|${spec.pitch}|${spec.roll}|${spec.mirrorX ? 1 : 0}`,
        hostId: direction.host,
        guestId: direction.guest,
        libraryCompatible: direction.compatible,
        libraryReason: direction.rejection,
        spec,
      });
    }
  }
  return found;
}

function roundPose(pose: Skill6Pose) {
  return { quarterZ: pose.quarterZ, mirrorX: pose.mirrorX, basis: [...pose.basis], translation: [...pose.translation] };
}

function recordCandidate(candidate: SeatCandidate | null) {
  if (!candidate) return null;
  return {
    gap: candidate.gap,
    shift: candidate.shift,
    accepted: candidate.accepted,
    pose: roundPose(candidate.pose),
    contactArea: candidate.contactArea,
    coherentRegions: candidate.coherentRegions,
    residualGap: candidate.residualGap,
    minSurfaceDistance: candidate.minSurfaceDistance,
    normalAlignment: candidate.normalAlignment,
    deepestCrossing: candidate.deepestCrossing,
    overlapVolume: candidate.overlapVolume,
    reason: candidate.reason,
    contactNormal: candidate.relation.contactNormal,
    displacement: candidate.relation.displacement,
    elevation: candidate.relation.elevation,
    growthDirection: candidate.relation.growthDirection,
    growthAllowed: candidate.relation.growthAllowed,
  };
}

function pairRecord(id: string, host: ArchetypeMesh, guest: ArchetypeMesh, candidate: SeatCandidate): ClusterRecord {
  const home = poseWithBasis(0, false, IDENTITY, [0, 0, 0]);
  const normal = candidate.relation.contactNormal ?? [0, 0, 1];
  const contact: ContactRelation = {
    hostId: "t00",
    guestId: "t01",
    hostPatch: "envelope",
    guestPatch: "envelope",
    verdict: candidate.residualGap != null && candidate.residualGap <= SKILL6_PARAMETERS.targetGap ? "surface-contact" : "near-contact",
    minSurfaceDistance: candidate.minSurfaceDistance,
    residualGap: candidate.residualGap,
    contactArea: candidate.contactArea,
    coherentRegions: candidate.coherentRegions,
    normalAlignment: candidate.normalAlignment ?? 0,
    hostNormal: normal,
    guestNormal: [-normal[0], -normal[1], -normal[2]],
    samples: [],
    rejected: [],
    intersectingTriangles: 0,
    deepestCrossing: candidate.deepestCrossing,
    overlapVolume: candidate.overlapVolume,
    attachment: "envelope",
    searchNote: `${candidate.relation.growthDirection} seating gap ${candidate.gap} shift ${candidate.shift.map((value) => value.toFixed(1)).join(",")}`,
    registrationOverlap: false,
    tightBox: "touch",
    tolerance: SKILL6_PARAMETERS.contactTolerance,
  };
  const tiles = [host, guest].map((mesh, index) => ({
    instanceId: `t0${index}`,
    archetypeId: mesh.archetypeId,
    moduleId: mesh.moduleId,
    typologyId: mesh.typologyId,
    name: mesh.name,
    pose: index === 0 ? home : candidate.pose,
  }));
  const byId = new Map([host, guest].map((mesh) => [mesh.archetypeId, mesh]));
  const search: SearchStats = {
    evaluations: 1,
    acceptedPoses: 1,
    backtracks: 0,
    milliseconds: 0,
    exhausted: false,
    truncated: false,
    untried: 0,
    geometricRejections: 0,
    rejectionCounts: { intersection: 0, containment: 0, contact: 0 },
    depthLimit: null,
    stop: "reached",
  };
  return {
    contract: SKILL6_CONTRACT,
    id,
    status: "accepted",
    reason: "Two-tile adaptive seating check. Not a catalog cluster.",
    algorithm: SKILL6_COVERAGE_ALGORITHM,
    seed: 0,
    parameters: SKILL6_PARAMETERS,
    tiles,
    contacts: [contact],
    components: connectedGroups(tiles, [contact]),
    metrics: measureCluster(tiles, [contact], byId),
    search,
  };
}

type StoredDirection = ReturnType<typeof recordDirection>;

function recordDirection(job: DirectionJob, centered: Awaited<ReturnType<typeof searchAdaptiveSeat>>, slides: Awaited<ReturnType<typeof searchReseatedSlides>> | null) {
  const fixed = centered.tested.find((item) => item.gap === ENVELOPE_GRID.gap) ?? null;
  const slide = slides?.chosen ?? null;
  const slideWins = Boolean(slide && centered.chosen && betterContact(slide, centered.chosen) < 0);
  const method = slideWins ? slide : centered.chosen;
  return {
    key: job.key,
    host: job.hostId,
    guest: job.guestId,
    orientation: { axis: job.spec.axisName, yaw: job.spec.yaw, pitch: job.spec.pitch, roll: job.spec.roll, mirrorX: job.spec.mirrorX },
    libraryCompatible: job.libraryCompatible,
    libraryReason: job.libraryReason,
    fixed: recordCandidate(fixed),
    adaptive: recordCandidate(centered.chosen),
    method: recordCandidate(method),
    methodUsesSlide: slideWins,
    distances: centered.tested.map(recordCandidate),
    slides: slides ? {
      offsets: slides.offsets,
      accepted: slides.attempts.filter((item) => item.chosen).length,
      milliseconds: slides.milliseconds,
      attempts: slides.attempts.map((item) => ({
        shift: item.shift,
        chosen: recordCandidate(item.chosen),
        nearMiss: recordCandidate(item.nearMiss),
      })),
    } : null,
    milliseconds: centered.milliseconds + (slides?.milliseconds ?? 0),
  };
}

function pickRepresentatives(directions: StoredDirection[]) {
  const allowed = directions.filter((item) => item.method?.accepted && item.method.growthAllowed);
  const gained = allowed.filter((item) => !item.fixed?.accepted);
  const byArea = (left: StoredDirection, right: StoredDirection) => (right.method?.contactArea ?? 0) - (left.method?.contactArea ?? 0);
  gained.sort(byArea);
  const crossing = gained.filter((item) => /crossing/i.test(item.libraryReason ?? ""));
  const changed = allowed.filter((item) => item.fixed?.accepted && item.adaptive && item.fixed.gap !== item.adaptive.gap && item.adaptive.contactArea > item.fixed.contactArea + 0.5);
  const weak = gained.slice().sort((left, right) => (left.method?.contactArea ?? 0) - (right.method?.contactArea ?? 0));
  const chosen: StoredDirection[] = [];
  const take = (item: StoredDirection | undefined) => {
    if (item && !chosen.some((other) => other.key === item.key)) chosen.push(item);
  };
  take(gained[0]);
  take(crossing[0]);
  take(changed[0]);
  take(weak[0]);
  for (const item of gained) {
    if (chosen.length >= 4) break;
    take(item);
  }
  return chosen.slice(0, 4);
}

async function main() {
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  mkdirSync(DIRECTORY, { recursive: true });
  const target = path.join(DIRECTORY, "index.json");
  const existing = (() => {
    try {
      return JSON.parse(readFileSync(target, "utf8")) as { directions?: StoredDirection[]; assemblies?: unknown[] };
    } catch {
      return null;
    }
  })();
  const done = new Map((existing?.directions ?? []).map((item) => [item.key, item]));
  const queue = jobs();
  const header = {
    version: 1,
    note: "Experimental candidate seating. compatibility.json was not rewritten. The seating parameter is the clearance past the host 90th-percentile plane and the guest 10th-percentile plane. It is not the measured surface gap. The ladder is the fixed 0.1 clearance plus 0.14 to 0.50 by 0.04. A passing tangent slide is seated again on that ladder. The kept pose is the largest coherent contact that passes the unchanged tests, including boolean overlap at or under 0.05. Growth direction is the bounds label and is not applied as a filter here.",
    convention: {
      parameter: "envelopeTranslation gap",
      percentiles: { host: 0.9, guest: 0.1 },
      fixed: ENVELOPE_GRID.gap,
      addedRange: [0.14, 0.5],
      step: 0.04,
    },
    tests: ["validatePose", "poseOverlap"],
    thresholds: SKILL6_PARAMETERS,
    overlapLimit: 0.05,
  };
  const directions: StoredDirection[] = [];
  const started = Date.now();
  for (const job of queue) {
    const prior = done.get(job.key);
    if (prior) {
      directions.push(prior);
      continue;
    }
    const host = byId.get(job.hostId);
    const guest = byId.get(job.guestId);
    if (!host || !guest) throw new Error(`Missing mesh for ${job.key}`);
    const centered = await searchAdaptiveSeat(host, guest, job.spec, [0, 0, 0], "regions");
    const slides = centered.chosen ? await searchReseatedSlides(host, guest, job.spec) : null;
    const record = recordDirection(job, centered, slides);
    const rebuilt = record.adaptive ? poseCheck(host, guest, job.spec, record.adaptive.gap, record.adaptive.shift as Vec3, record.adaptive.pose.translation as Vec3) : null;
    if (rebuilt) throw new Error(`${job.key} pose did not rebuild: ${rebuilt}`);
    directions.push(record);
    writeFileSync(target, JSON.stringify({ ...header, seconds: Math.round((Date.now() - started) / 1000), directions }, null, 1));
    const mark = record.fixed?.accepted ? "fixed" : record.adaptive?.accepted ? "gained" : "rejected";
    console.log(`${directions.length}/${queue.length} ${job.hostId} → ${job.guestId} ${job.spec.axisName} ${mark} area ${record.adaptive?.contactArea.toFixed(1) ?? "-"} ${record.milliseconds} ms`);
  }
  const fixedAccepted = directions.filter((item) => item.fixed?.accepted).length;
  const adaptiveAccepted = directions.filter((item) => item.adaptive?.accepted).length;
  const gained = directions.filter((item) => !item.fixed?.accepted && item.adaptive?.accepted);
  const lost = directions.filter((item) => item.fixed?.accepted && !item.adaptive?.accepted);
  const slideImproved = directions.filter((item) => item.methodUsesSlide);
  const summary = {
    directed: directions.length,
    fixedAccepted,
    adaptiveAccepted,
    gained: gained.length,
    gainedAllowed: gained.filter((item) => item.adaptive?.growthAllowed).length,
    lost: lost.length,
    slideImproved: slideImproved.length,
    milliseconds: directions.reduce((sum, item) => sum + item.milliseconds, 0),
  };
  console.log(JSON.stringify(summary));
  const sample = directions.find((item) => item.fixed?.accepted);
  if (sample?.fixed) {
    console.log(`convention ${sample.host} ${sample.orientation.axis} parameter ${sample.fixed.gap} minSurface ${sample.fixed.minSurfaceDistance} residual ${sample.fixed.residualGap}`);
  }

  const assemblies: { key?: string }[] = Array.isArray(existing?.assemblies) ? existing.assemblies : [];
  const seenAssembly = new Set(assemblies.map((item) => item.key));
  const representatives = pickRepresentatives(directions).filter((item) => !seenAssembly.has(item.key));
  for (const item of representatives) {
    const host = byId.get(item.host)!;
    const guest = byId.get(item.guest)!;
    const method = [item.method].map((entry) => {
      const candidate = directions.find((direction) => direction.key === item.key);
      return candidate;
    })[0];
    if (!method?.method) continue;
    const pose = method.method;
    const candidate: SeatCandidate = {
      gap: pose.gap,
      shift: pose.shift as Vec3,
      accepted: true,
      pose: pose.pose as Skill6Pose,
      contactArea: pose.contactArea,
      coherentRegions: pose.coherentRegions,
      residualGap: pose.residualGap,
      minSurfaceDistance: pose.minSurfaceDistance,
      normalAlignment: pose.normalAlignment,
      deepestCrossing: pose.deepestCrossing,
      overlapVolume: pose.overlapVolume,
      reason: pose.reason,
      relation: {
        contactNormal: pose.contactNormal as Vec3 | null,
        displacement: pose.displacement as Vec3,
        elevation: pose.elevation,
        growthDirection: pose.growthDirection,
        growthAllowed: pose.growthAllowed,
      },
    };
    const id = `seat-${item.host}-${item.guest}-${item.orientation.axis}`.replace(/[^a-z0-9+-]+/gi, "-");
    const record = pairRecord(id, host, guest, candidate);
    const meshFile = `data/skill6/experiments/adaptive-seating-v1/${id}.mesh.json`;
    const built = await assembleCluster(record, meshes, meshFile);
    if (!built.meshes.raw || !built.meshes.refined) {
      assemblies.push({ id, key: item.key, assembled: false, joint: built.assembly.joints[0]?.classification ?? null });
      continue;
    }
    const seated = new Map(built.assembly.seatedTiles.map((tile) => [tile.instanceId, tile.pose]));
    const preservation = await measurePreservation({
      tiles: record.tiles.map((tile) => ({
        instanceId: tile.instanceId,
        archetypeId: tile.archetypeId,
        mesh: byId.get(tile.archetypeId)!,
        pose: seated.get(tile.instanceId)!,
      })),
      raw: built.meshes.raw,
      refined: built.meshes.refined,
      patches: built.meshes.patches,
      patchStats: built.assembly.joints.map((joint) => ({
        volume: joint.patch?.volume ?? null,
        hostOverlap: joint.patch?.hostOverlap ?? null,
        guestOverlap: joint.patch?.guestOverlap ?? null,
      })),
      refinerFilled: built.assembly.refined.cavitiesFilled,
    });
    writeFileSync(path.join(process.cwd(), meshFile), JSON.stringify({
      id,
      raw: encodeMesh(built.meshes.raw),
      refined: encodeMesh(built.meshes.refined),
      patches: built.meshes.patches.map((mesh) => encodeMesh(mesh)),
    }));
    assemblies.push({
      id,
      key: item.key,
      host: item.host,
      guest: item.guest,
      fixedAccepted: item.fixed?.accepted ?? false,
      gap: pose.gap,
      shift: pose.shift,
      contactArea: pose.contactArea,
      residualGap: pose.residualGap,
      contactNormal: pose.contactNormal,
      displacement: pose.displacement,
      elevation: pose.elevation,
      growthDirection: pose.growthDirection,
      joint: built.assembly.joints.map((joint) => ({
        classification: joint.classification,
        direction: joint.direction,
        area: joint.contact.contactArea,
        residual: joint.contact.residualGap,
      })),
      union: built.assembly.union,
      refined: {
        status: built.assembly.refined.status,
        components: built.assembly.refined.components,
        cavities: built.assembly.refined.cavities,
        cavitiesFilled: built.assembly.refined.cavitiesFilled,
        maxShift: built.assembly.refined.maxShift,
        meanShift: built.assembly.refined.meanShift,
        volume: built.assembly.refined.volume,
      },
      milliseconds: built.assembly.milliseconds,
      preservation,
    });
    writeFileSync(target, JSON.stringify({ ...header, summary, directions, assemblies }, null, 1));
    console.log(`assembled ${id} ${built.assembly.joints[0]?.classification} ${built.assembly.milliseconds.total} ms`);
  }
  writeFileSync(target, JSON.stringify({ ...header, summary, directions, assemblies }, null, 1));
  console.log("adaptive seating study stored");
}

function poseCheck(host: ArchetypeMesh, guest: ArchetypeMesh, spec: EnvelopeSpec, gap: number, shift: Vec3, translation: Vec3): string | null {
  const rebuilt = poseAtGap(host, guest, spec, gap, shift);
  const delta = sub(rebuilt.translation, translation);
  const span = Math.hypot(delta[0], delta[1], delta[2]);
  return span < 1e-4 ? null : span.toFixed(4);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("lib/skill6/adaptive-seat-study.ts")) {
  void main();
}
