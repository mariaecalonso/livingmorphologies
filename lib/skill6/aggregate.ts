import {
  SKILL6_ALGORITHM,
  SKILL6_CONTRACT,
  SKILL6_PARAMETERS,
  SKILL6_PLANAR_ALGORITHM,
  type ClusterRecord,
  type ClusterTile,
  type ContactRelation,
  type Mat3,
  type Quarter,
  type RejectedAttachment,
  type Skill6Pose,
  type Vec3,
} from "./contract";
import { acceptedVerdict, measureCoherent, type CoherentReading } from "./contact";
import {
  add,
  applyBasis,
  applyPose,
  cross,
  dot,
  IDENTITY,
  invertPose,
  length,
  multiplyBasis,
  normalize,
  pointInsideMesh,
  poseBounds,
  poseOf,
  poseWithBasis,
  queryHash,
  QUARTERS,
  readTriangle,
  crossingPenetration,
  rotationAbout,
  rotationFromTo,
  scale,
  sub,
  boundsRelation,
  type Bounds,
} from "./geometry";
import { connectedGroups, measureCluster } from "./metrics";
import type { ArchetypeMesh, SurfacePatch } from "./source";
import { composePose, measureEnvelope, poseBlocked, studyDirection, type EnvelopeReading } from "./envelope";
import type { CompatibilityTable, KnownAttachment } from "./compatibility";

const MIRRORS = [false, true];
const GAPS = [0.08, 0.14, 0.18];
const RETREATS = [0.1, 0.2, 0.32];

export type AggregateOptions = {
  seed: number;
  tiles: number;
  id: string;
  attemptsPerTile?: number;
};

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function tangents(normal: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(normal[0]) < 0.85 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(normal, helper));
  const v = normalize(cross(normal, u));
  return [u, v];
}

function intersectionsBetween(
  host: ArchetypeMesh,
  guest: ArchetypeMesh,
  hostPose: Skill6Pose,
  guestPose: Skill6Pose,
  hostBox: Bounds,
): number {
  let hits = 0;
  for (let triangle = 0; triangle < guest.triangles; triangle += 1) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const worldA = applyPose(guestPose, a);
    const worldB = applyPose(guestPose, b);
    const worldC = applyPose(guestPose, c);
    const minX = Math.min(worldA[0], worldB[0], worldC[0]);
    const minY = Math.min(worldA[1], worldB[1], worldC[1]);
    const minZ = Math.min(worldA[2], worldB[2], worldC[2]);
    const maxX = Math.max(worldA[0], worldB[0], worldC[0]);
    const maxY = Math.max(worldA[1], worldB[1], worldC[1]);
    const maxZ = Math.max(worldA[2], worldB[2], worldC[2]);
    if (maxX < hostBox.min[0] || minX > hostBox.max[0] || maxY < hostBox.min[1] || minY > hostBox.max[1] || maxZ < hostBox.min[2] || minZ > hostBox.max[2]) {
      continue;
    }
    const localA = invertPose(hostPose, worldA);
    const localB = invertPose(hostPose, worldB);
    const localC = invertPose(hostPose, worldC);
    const center: Vec3 = [
      (localA[0] + localB[0] + localC[0]) / 3,
      (localA[1] + localB[1] + localC[1]) / 3,
      (localA[2] + localB[2] + localC[2]) / 3,
    ];
    for (const other of queryHash(host.hash, center, 0.7)) {
      const [d, e, f] = readTriangle(host.positions, host.indices, other);
      if (crossingPenetration(localA, localB, localC, d, e, f) <= SKILL6_PARAMETERS.maxPenetration) continue;
      hits += 1;
      if (hits > SKILL6_PARAMETERS.maxIntersectingTriangles) return hits;
    }
  }
  return hits;
}

function containedSample(host: ArchetypeMesh, guest: ArchetypeMesh, hostPose: Skill6Pose, guestPose: Skill6Pose): boolean {
  let x = 0;
  let y = 0;
  let z = 0;
  const count = guest.positions.length / 3 || 1;
  for (let index = 0; index < guest.positions.length; index += 3) {
    x += guest.positions[index];
    y += guest.positions[index + 1];
    z += guest.positions[index + 2];
  }
  const world = applyPose(guestPose, [x / count, y / count, z / count]);
  const local = invertPose(hostPose, world);
  const box = host.tight;
  if (local[0] < box.min[0] || local[0] > box.max[0] || local[1] < box.min[1] || local[1] > box.max[1] || local[2] < box.min[2] || local[2] > box.max[2]) {
    return false;
  }
  return pointInsideMesh(local, host.positions, host.indices, host.triangles);
}

type Placement = {
  pose: Skill6Pose;
  hostPatch: string;
  guestPatch: string;
  reading: CoherentReading;
  score: number;
  hostNormal: Vec3;
  guestNormal: Vec3;
};

const MIRROR_X: Mat3 = [-1, 0, 0, 0, 1, 0, 0, 0, 1];

function orientations(hostNormal: Vec3, guestNormal: Vec3): { basis: Mat3; quarter: Quarter; mirrorX: boolean }[] {
  const found: { basis: Mat3; quarter: Quarter; mirrorX: boolean }[] = [];
  const seen = new Set<string>();
  const push = (basis: Mat3, quarter: Quarter, mirrorX: boolean) => {
    const key = basis.map((value) => value.toFixed(3)).join(",");
    if (seen.has(key)) return;
    const turned = applyBasis(basis, guestNormal);
    if (dot(turned, hostNormal) > -SKILL6_PARAMETERS.normalOpposition) return;
    seen.add(key);
    found.push({ basis, quarter, mirrorX });
  };
  for (const mirrorX of MIRRORS) {
    for (const quarter of QUARTERS) push(poseOf(quarter, mirrorX, [0, 0, 0]).basis, quarter, mirrorX);
    const mirror = mirrorX ? MIRROR_X : IDENTITY;
    const mirrored = applyBasis(mirror, guestNormal);
    const aligned = multiplyBasis(rotationFromTo(mirrored, scale(hostNormal, -1)), mirror);
    for (const twist of QUARTERS) {
      const spun = multiplyBasis(rotationAbout(scale(hostNormal, -1), twist * Math.PI / 2), aligned);
      push(spun, twist, mirrorX);
    }
  }
  return found;
}

function seat(
  hostNormal: Vec3,
  hostCentroid: Vec3,
  tangent: Vec3,
  gap: number,
  basis: Mat3,
  guestCentroid: Vec3,
): Vec3 {
  return add(add(add(hostCentroid, scale(hostNormal, gap)), tangent), scale(applyBasis(basis, guestCentroid), -1));
}

function scoreOf(reading: CoherentReading, hostNormal: Vec3, prefer: Vec3 | null): number {
  if (!acceptedVerdict(reading.normalAlignment <= -SKILL6_PARAMETERS.normalOpposition
    && reading.coherentRegions === 1
    && reading.contactArea >= SKILL6_PARAMETERS.minContactArea
    && reading.residualGap != null
    && reading.residualGap <= SKILL6_PARAMETERS.contactTolerance
    ? (reading.residualGap <= SKILL6_PARAMETERS.targetGap ? "surface-contact" : "near-contact")
    : "gap")) return -1;
  const areaTerm = Math.min(reading.contactArea, 16);
  const gapTerm = 1 - (reading.residualGap ?? SKILL6_PARAMETERS.contactTolerance) / SKILL6_PARAMETERS.contactTolerance;
  let score = areaTerm * (0.35 + gapTerm);
  if (prefer && Math.abs(dot(hostNormal, prefer)) < 0.45 && score > 0) score += 1.1;
  return score;
}

function seek(
  host: ArchetypeMesh,
  guest: ArchetypeMesh,
  hostPose: Skill6Pose,
  hostPatches: SurfacePatch[],
  preferNormal: Vec3 | null,
): { placement: Placement | null; rejected: RejectedAttachment[] } {
  const rejected: RejectedAttachment[] = [];
  const remember = (reason: string, point: Vec3, normal: Vec3, area: number, residualGap: number | null) => {
    if (rejected.length >= 4 && area < (rejected[rejected.length - 1]?.area ?? 0)) return;
    rejected.push({ reason, point, normal, area, residualGap });
    rejected.sort((left, right) => right.area - left.area);
    rejected.splice(4);
  };
  let best: Placement | null = null;
  let scans = 0;
  const hostBox = poseBounds(host.tight, hostPose);
  const hosts = hostPatches;
  const guests = guest.patches;
  for (const hostPatch of hosts) {
    const hostNormal = applyBasis(hostPose.basis, hostPatch.normal);
    const hostCentroid = applyPose(hostPose, hostPatch.centroid);
    const [tangentU, tangentV] = tangents(hostNormal);
    const shifts = [0];
    for (const guestPatch of guests) {
      for (const oriented of orientations(hostNormal, guestPatch.normal).slice(0, 4)) {
        for (const shiftU of shifts) {
          for (const shiftV of shifts) {
            if (shiftU !== 0 && shiftV !== 0) continue;
            const tangent = add(scale(tangentU, shiftU), scale(tangentV, shiftV));
            for (const gap of GAPS) {
              const translation = seat(hostNormal, hostCentroid, tangent, gap, oriented.basis, guestPatch.centroid);
              const pose = poseWithBasis(oriented.quarter, oriented.mirrorX, oriented.basis, translation);
              const reading = measureCoherent(host, hostPose, pose, guestPatch, hostNormal);
              const score = scoreOf(reading, hostNormal, preferNormal);
              if (score < 0) {
                const reason = reading.coherentRegions > 1
                  ? "scattered"
                  : reading.contactArea > 0 && reading.contactArea < SKILL6_PARAMETERS.minContactArea
                    ? "point"
                    : reading.normalAlignment > -SKILL6_PARAMETERS.normalOpposition
                      ? "normal"
                      : "gap";
                if (reading.contactArea > 0.4) remember(reason, hostCentroid, hostNormal, reading.contactArea, reading.residualGap);
                continue;
              }
              if (best && score <= best.score) continue;
              if (scans >= 10) continue;
              scans += 1;
              let seated = pose;
              let seatedReading = reading;
              let crossings = intersectionsBetween(host, guest, hostPose, seated, hostBox);
              let inside = containedSample(host, guest, hostPose, seated);
              if (crossings > SKILL6_PARAMETERS.maxIntersectingTriangles || inside) {
                let cleared = false;
                for (const extra of RETREATS) {
                  const backed = poseWithBasis(oriented.quarter, oriented.mirrorX, oriented.basis, add(translation, scale(hostNormal, extra)));
                  const again = measureCoherent(host, hostPose, backed, guestPatch, hostNormal);
                  if (scoreOf(again, hostNormal, preferNormal) < 0) continue;
                  if (intersectionsBetween(host, guest, hostPose, backed, hostBox) > SKILL6_PARAMETERS.maxIntersectingTriangles) continue;
                  if (containedSample(host, guest, hostPose, backed)) continue;
                  seated = backed;
                  seatedReading = again;
                  cleared = true;
                  break;
                }
                if (!cleared) {
                  remember(inside ? "containment" : "intersection", hostCentroid, hostNormal, reading.contactArea, reading.residualGap);
                  continue;
                }
              } else if (reading.minSurfaceDistance != null && reading.minSurfaceDistance > SKILL6_PARAMETERS.targetGap + 0.01) {
                const nudged = poseWithBasis(
                  oriented.quarter,
                  oriented.mirrorX,
                  oriented.basis,
                  add(translation, scale(hostNormal, -(reading.minSurfaceDistance - SKILL6_PARAMETERS.targetGap))),
                );
                const again = measureCoherent(host, hostPose, nudged, guestPatch, hostNormal);
                if (scoreOf(again, hostNormal, preferNormal) >= 0
                  && intersectionsBetween(host, guest, hostPose, nudged, hostBox) <= SKILL6_PARAMETERS.maxIntersectingTriangles
                  && !containedSample(host, guest, hostPose, nudged)) {
                  seated = nudged;
                  seatedReading = again;
                }
              }
              best = {
                pose: seated,
                hostPatch: hostPatch.id,
                guestPatch: guestPatch.id,
                reading: seatedReading,
                score: scoreOf(seatedReading, hostNormal, preferNormal),
                hostNormal,
                guestNormal: applyBasis(seated.basis, guestPatch.normal),
              };
            }
          }
        }
      }
    }
  }
  return { placement: best, rejected };
}

function relation(
  hostId: string,
  guestId: string,
  found: Placement,
  host: ArchetypeMesh,
  guest: ArchetypeMesh,
  hostPose: Skill6Pose,
  rejected: RejectedAttachment[],
): ContactRelation {
  const guestPose = found.pose;
  const hostCell = poseBounds(host.registration, hostPose);
  const guestCell = poseBounds(guest.registration, guestPose);
  const cellsOverlap = hostCell.min[0] <= guestCell.max[0] && guestCell.min[0] <= hostCell.max[0]
    && hostCell.min[1] <= guestCell.max[1] && guestCell.min[1] <= hostCell.max[1]
    && hostCell.min[2] <= guestCell.max[2] && guestCell.min[2] <= hostCell.max[2];
  const hostBox = poseBounds(host.tight, hostPose);
  const guestBox = poseBounds(guest.tight, guestPose);
  const separated = hostBox.max[0] < guestBox.min[0] - SKILL6_PARAMETERS.contactTolerance
    || guestBox.max[0] < hostBox.min[0] - SKILL6_PARAMETERS.contactTolerance
    || hostBox.max[1] < guestBox.min[1] - SKILL6_PARAMETERS.contactTolerance
    || guestBox.max[1] < hostBox.min[1] - SKILL6_PARAMETERS.contactTolerance
    || hostBox.max[2] < guestBox.min[2] - SKILL6_PARAMETERS.contactTolerance
    || guestBox.max[2] < hostBox.min[2] - SKILL6_PARAMETERS.contactTolerance;
  const overlap = hostBox.min[0] < guestBox.max[0] && guestBox.min[0] < hostBox.max[0]
    && hostBox.min[1] < guestBox.max[1] && guestBox.min[1] < hostBox.max[1]
    && hostBox.min[2] < guestBox.max[2] && guestBox.min[2] < hostBox.max[2];
  const reading = found.reading;
  const verdict = reading.residualGap != null && reading.residualGap <= SKILL6_PARAMETERS.targetGap ? "surface-contact" as const : "near-contact" as const;
  return {
    hostId,
    guestId,
    hostPatch: found.hostPatch,
    guestPatch: found.guestPatch,
    verdict,
    minSurfaceDistance: reading.minSurfaceDistance,
    residualGap: reading.residualGap,
    contactArea: reading.contactArea,
    coherentRegions: reading.coherentRegions,
    normalAlignment: reading.normalAlignment,
    hostNormal: found.hostNormal,
    guestNormal: found.guestNormal,
    samples: reading.samples,
    rejected,
    intersectingTriangles: 0,
    deepestCrossing: 0,
    overlapVolume: null,
    attachment: "planar",
    searchNote: "planar pad",
    registrationOverlap: cellsOverlap,
    tightBox: separated ? "separated" : overlap ? "overlap" : "touch",
    tolerance: SKILL6_PARAMETERS.contactTolerance,
  };
}

function blank(
  id: string,
  seed: number,
  reason: string,
  tiles: ClusterTile[] = [],
  contacts: ContactRelation[] = [],
  algorithm: ClusterRecord["algorithm"] = SKILL6_PLANAR_ALGORITHM,
): ClusterRecord {
  return {
    contract: SKILL6_CONTRACT,
    id,
    status: "unsuccessful",
    reason,
    algorithm,
    seed,
    parameters: SKILL6_PARAMETERS,
    tiles,
    contacts,
    components: [],
    metrics: null,
  };
}

/** Planar-pad comparison. The catalog uses outer-envelope seating instead. */
export function aggregatePlanar(meshes: readonly ArchetypeMesh[], options: AggregateOptions): ClusterRecord {
  if (meshes.length === 0 || options.tiles < 2) return blank(options.id, options.seed, "A cluster needs two tiles.");
  const random = mulberry32(options.seed);
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const rootMesh = meshes[Math.floor(random() * meshes.length)];
  const tiles: ClusterTile[] = [{
    instanceId: "t00",
    archetypeId: rootMesh.archetypeId,
    moduleId: rootMesh.moduleId,
    typologyId: rootMesh.typologyId,
    name: rootMesh.name,
    pose: poseOf(0, false, [0, 0, 0]),
  }];
  const contacts: ContactRelation[] = [];
  const used = new Set<string>();
  const attemptsPerTile = options.attemptsPerTile ?? 8;
  let nearest = "";
  while (tiles.length < options.tiles) {
    let placed = false;
    for (let attempt = 0; attempt < attemptsPerTile && !placed; attempt += 1) {
      const host = tiles[Math.floor(random() * tiles.length)];
      const hostMesh = byId.get(host.archetypeId);
      if (!hostMesh) continue;
      const openHost = hostMesh.patches.filter((patch) => !used.has(`${host.instanceId}:${patch.id}`));
      if (openHost.length === 0) continue;
      const guestMesh = meshes[Math.floor(random() * meshes.length)];
      const prefer = contacts.length > 0 ? contacts[contacts.length - 1].hostNormal : null;
      const { placement, rejected } = seek(hostMesh, guestMesh, host.pose, openHost, prefer);
      if (rejected.length > 0) {
        nearest = rejected.map((item) => `${item.reason} ${item.area.toFixed(1)}`).join(", ");
      }
      if (!placement) continue;
      const instanceId = `t${String(tiles.length).padStart(2, "0")}`;
      const contact = relation(host.instanceId, instanceId, placement, hostMesh, guestMesh, host.pose, rejected);
      if (!acceptedVerdict(contact.verdict)) continue;
      tiles.push({
        instanceId,
        archetypeId: guestMesh.archetypeId,
        moduleId: guestMesh.moduleId,
        typologyId: guestMesh.typologyId,
        name: guestMesh.name,
        pose: placement.pose,
      });
      contacts.push(contact);
      used.add(`${host.instanceId}:${placement.hostPatch}`);
      used.add(`${instanceId}:${placement.guestPatch}`);
      placed = true;
    }
    if (!placed) {
      const detail = nearest ? ` Nearest rejected tries: ${nearest}.` : "";
      return blank(options.id, options.seed, `No surface attachment was found for tile ${tiles.length + 1}.${detail}`, tiles, contacts);
    }
  }
  const groups = connectedGroups(tiles, contacts);
  const metrics = measureCluster(tiles, contacts, byId);
  if (!metrics.connected || groups.length !== 1) {
    return { ...blank(options.id, options.seed, "The arrangement is not one connected component.", tiles, contacts), components: groups, metrics };
  }
  return {
    contract: SKILL6_CONTRACT,
    id: options.id,
    status: "accepted",
    reason: null,
    algorithm: SKILL6_PLANAR_ALGORITHM,
    seed: options.seed,
    parameters: SKILL6_PARAMETERS,
    tiles,
    contacts,
    components: groups,
    metrics,
  };
}

function knownFrom(reading: EnvelopeReading): KnownAttachment {
  if (reading.verdict === "rejected") {
    throw new Error("A rejected envelope pose cannot be stored as an attachment.");
  }
  return {
    pose: reading.pose,
    contactArea: reading.contactArea,
    coherentRegions: reading.coherentRegions,
    residualGap: reading.residualGap,
    minSurfaceDistance: reading.minSurfaceDistance,
    normalAlignment: reading.normalAlignment ?? 0,
    deepestCrossing: reading.deepestCrossing,
    overlapVolume: reading.overlapVolume,
    verdict: reading.verdict,
    note: `${reading.spec.axisName} yaw ${reading.spec.yaw} pitch ${reading.spec.pitch} roll ${reading.spec.roll} gap ${reading.spec.gap}${reading.spec.mirrorX ? " mirror" : ""}`,
  };
}

type EnvelopeOptions = AggregateOptions & { compatibility?: CompatibilityTable | null };

function passesMeasured(reading: { contactArea: number; coherentRegions: number; residualGap: number | null; normalAlignment: number | null }) {
  return reading.coherentRegions === 1
    && reading.contactArea >= SKILL6_PARAMETERS.minContactArea
    && reading.residualGap != null
    && reading.residualGap <= SKILL6_PARAMETERS.contactTolerance
    && reading.normalAlignment != null
    && reading.normalAlignment <= -SKILL6_PARAMETERS.normalOpposition;
}

/** Envelope growth. A new tile must meet one member and stay clear of every member. */
export function aggregateRule(meshes: readonly ArchetypeMesh[], options: EnvelopeOptions): ClusterRecord {
  if (meshes.length === 0 || options.tiles < 2) return blank(options.id, options.seed, "A cluster needs two tiles.", [], [], SKILL6_ALGORITHM);
  const random = mulberry32(options.seed);
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const memory = new Map<string, KnownAttachment[]>();
  const liveAllowed = meshes.every((mesh) => mesh.triangles < 2000) || (meshes.length <= 2 && options.tiles <= 4);
  const candidates = (hostId: string, guestId: string): KnownAttachment[] => {
    if (options.compatibility) return options.compatibility.poses(hostId, guestId);
    const key = `${hostId}|${guestId}`;
    const stored = memory.get(key);
    if (stored) return stored;
    const host = byId.get(hostId);
    const guest = byId.get(guestId);
    if (!host || !guest || !liveAllowed) {
      memory.set(key, []);
      return [];
    }
    const found = studyDirection(host, guest).poses.map(knownFrom);
    memory.set(key, found);
    return found;
  };
  const guestsFor = (hostId: string) => meshes.filter((mesh) => candidates(hostId, mesh.archetypeId).length > 0);
  const roots = meshes.filter((mesh) => guestsFor(mesh.archetypeId).length > 0);
  if (roots.length === 0) {
    const coverage = options.compatibility
      ? ` Compatibility cache covers ${options.compatibility.testedPairs} of ${options.compatibility.totalPairs} pairs, ${options.compatibility.compatiblePairs} compatible.`
      : liveAllowed
        ? " The envelope grid did not validate a pair in this set."
        : " No compatibility cache was loaded, and this set is too large for a live search.";
    return blank(options.id, options.seed, `No verified compatible archetype pair is available.${coverage}`, [], [], SKILL6_ALGORITHM);
  }
  const rootMesh = roots[Math.floor(random() * roots.length)];
  const tiles: ClusterTile[] = [{
    instanceId: "t00",
    archetypeId: rootMesh.archetypeId,
    moduleId: rootMesh.moduleId,
    typologyId: rootMesh.typologyId,
    name: rootMesh.name,
    pose: poseOf(0, false, [0, 0, 0]),
  }];
  const contacts: ContactRelation[] = [];
  const attemptsPerTile = options.attemptsPerTile ?? 8;
  let nearest = "";
  while (tiles.length < options.tiles) {
    let placed = false;
    for (let attempt = 0; attempt < attemptsPerTile && !placed; attempt += 1) {
      const hosts = tiles.filter((tile) => guestsFor(tile.archetypeId).length > 0);
      if (hosts.length === 0) break;
      const host = hosts[Math.floor(random() * hosts.length)];
      const hostMesh = byId.get(host.archetypeId);
      if (!hostMesh) continue;
      const choices = guestsFor(host.archetypeId);
      const guestMesh = choices[Math.floor(random() * choices.length)];
      const members = tiles.flatMap((tile) => {
        const mesh = byId.get(tile.archetypeId);
        return mesh ? [{ mesh, pose: tile.pose }] : [];
      });
      for (const known of candidates(host.archetypeId, guestMesh.archetypeId)) {
        const world = composePose(host.pose, known.pose);
        const block = poseBlocked(members, guestMesh, world);
        if (block.blocked) {
          nearest = `intersection with an existing tile, depth ${block.deepest.toFixed(3)}`;
          continue;
        }
        const measured = measureEnvelope(hostMesh, guestMesh, host.pose, world);
        if (!passesMeasured(measured)) {
          nearest = `composed contact area ${measured.contactArea.toFixed(1)}`;
          continue;
        }
        const instanceId = `t${String(tiles.length).padStart(2, "0")}`;
        const verdict = measured.residualGap != null && measured.residualGap <= SKILL6_PARAMETERS.targetGap ? "surface-contact" as const : "near-contact" as const;
        const origin = measured.samples[0];
        const offset = origin ? sub(origin.host, origin.guest) : [0, 0, 1] as Vec3;
        const span = length(offset) || 1;
        const hostNormal = scale(offset, 1 / span);
        tiles.push({
          instanceId,
          archetypeId: guestMesh.archetypeId,
          moduleId: guestMesh.moduleId,
          typologyId: guestMesh.typologyId,
          name: guestMesh.name,
          pose: world,
        });
        contacts.push({
          hostId: host.instanceId,
          guestId: instanceId,
          hostPatch: "envelope",
          guestPatch: "envelope",
          verdict,
          minSurfaceDistance: measured.minSurfaceDistance,
          residualGap: measured.residualGap,
          contactArea: measured.contactArea,
          coherentRegions: measured.coherentRegions,
          normalAlignment: measured.normalAlignment ?? known.normalAlignment,
          hostNormal,
          guestNormal: scale(hostNormal, -1),
          samples: measured.samples,
          rejected: [],
          intersectingTriangles: block.count,
          deepestCrossing: block.deepest,
          overlapVolume: known.overlapVolume,
          attachment: "envelope",
          searchNote: known.note,
          registrationOverlap: false,
          tightBox: boundsRelation(poseBounds(hostMesh.tight, host.pose), poseBounds(guestMesh.tight, world), SKILL6_PARAMETERS.contactTolerance),
          tolerance: SKILL6_PARAMETERS.contactTolerance,
        });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const detail = nearest ? ` Nearest rejected try: ${nearest}.` : "";
      return blank(options.id, options.seed, `No envelope attachment was found for tile ${tiles.length + 1}.${detail}`, tiles, contacts, SKILL6_ALGORITHM);
    }
  }
  const groups = connectedGroups(tiles, contacts);
  const metrics = measureCluster(tiles, contacts, byId);
  if (!metrics.connected || groups.length !== 1) {
    return { ...blank(options.id, options.seed, "The arrangement is not one connected component.", tiles, contacts, SKILL6_ALGORITHM), components: groups, metrics };
  }
  return {
    contract: SKILL6_CONTRACT,
    id: options.id,
    status: "accepted",
    reason: null,
    algorithm: SKILL6_ALGORITHM,
    seed: options.seed,
    parameters: SKILL6_PARAMETERS,
    tiles,
    contacts,
    components: groups,
    metrics,
  };
}
