import { readFileSync } from "node:fs";
import path from "node:path";
import { runAssemblyShrinkwrap } from "@/lib/skill4/assembly-shrinkwrap";
import { filmWrapAssembly } from "@/lib/skill4/film-wrap";
import { rankProgramClusters } from "@/lib/skill4/cluster-placement-rank";
import type { FinishedProgram } from "@/lib/skill4/finished-catalog";
import { programForRole, ROLE_LABEL } from "@/lib/skill5/architectural-strategy";
import { assessPockets } from "@/lib/skill5/pocket-feasibility";
import { detectPockets } from "@/lib/skill5/pockets";
import type { ArchitecturalRole } from "@/components/site/site-network";
import site from "@/data/skill5/herald-site.json";
import { pointInRing } from "@/lib/skill5/placement";
import type { ClusterAssemblyReport, PackedMesh, PortalReadout } from "@/lib/skill5/cluster-assembly-report";
import type { XZ } from "@/lib/skill5/site-model";

/** The zoning network this stage is allowed to use. */
export const ZONING_NETWORK_ID = "batch-mwss0uvx-arrival-city-north-v1-20365850";

const TEST_LINK = { from: "primary-lobby", to: "central-gathering" } as const;

/**
 * Every placed cluster is in this graph.
 * Shared anchors and the stored zoning relationships come first.
 * The last edge joins the public waterfront side to the workspace side so the shrinkwrap is one mass.
 */
const MASS_LINKS: readonly [string, string][] = [
  ["waterfront-gathering", "public-restaurant"],
  ["indoor-public-gathering", "public-exhibition-gallery"],
  ["staff-dining", "interdisciplinary-collaboration-hub"],
  ["product-design-studio", "prototyping-fabrication-lab"],
  ["public-lobby", "waterfront-gathering"],
  ["private-staff-lobby", "biological-research-lab"],
  ["private-staff-lobby", "staff-dining"],
  ["indoor-public-gathering", "waterfront-gathering"],
  ["biological-research-lab", "product-design-studio"],
  ["product-design-studio", "architecture-design-studio"],
  ["architecture-design-studio", "waterfront-gathering"],
];

/** One saved cluster for every finished program, seated on the zoning anchor of its kind. */
const PROGRAM_SEATS: readonly {
  id: string;
  name: string;
  anchorId: string;
  kind: "lobby" | "gathering" | "workspace";
  towardX: number;
  towardZ: number;
  wide?: boolean;
}[] = [
  { id: "public-lobby", name: "Public Lobby", anchorId: "s4", kind: "lobby", towardX: -1, towardZ: 0 },
  { id: "private-staff-lobby", name: "Private Staff Lobby", anchorId: "s2", kind: "lobby", towardX: -1, towardZ: 0 },
  { id: "waterfront-gathering", name: "Waterfront Gathering", anchorId: "a2", kind: "gathering", towardX: 1, towardZ: 0 },
  { id: "indoor-public-gathering", name: "Indoor Public Gathering", anchorId: "a1", kind: "gathering", towardX: 1, towardZ: 0 },
  { id: "staff-dining", name: "Staff Dining", anchorId: "a3", kind: "gathering", towardX: -1, towardZ: 0 },
  { id: "public-restaurant", name: "Public Restaurant", anchorId: "a2", kind: "gathering", towardX: 1, towardZ: 0, wide: true },
  { id: "public-exhibition-gallery", name: "Public Exhibition Gallery", anchorId: "a1", kind: "gathering", towardX: 1, towardZ: 0, wide: true },
  { id: "interdisciplinary-collaboration-hub", name: "Collaboration Hub", anchorId: "a3", kind: "gathering", towardX: 0, towardZ: 0, wide: true },
  { id: "architecture-design-studio", name: "Architecture Design Studio", anchorId: "a5", kind: "workspace", towardX: -1, towardZ: 0 },
  { id: "product-design-studio", name: "Product Design Studio", anchorId: "a6", kind: "workspace", towardX: -1, towardZ: 0 },
  { id: "biological-research-lab", name: "Biological Research Lab", anchorId: "a4", kind: "workspace", towardX: -1, towardZ: 0, wide: true },
  { id: "prototyping-fabrication-lab", name: "Prototyping Lab", anchorId: "a6", kind: "workspace", towardX: -1, towardZ: 0, wide: true },
];

const YAWS = [0, 45, 90, 135, 180, 225, 270, 315];

type Vec = { x: number; y: number; z: number };
type Solid = { positions: Float32Array; indices: Uint32Array };
type Box = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
type Sample = { x: number; z: number };

type ZoneKind = "lobby" | "gathering" | "workspace";
type ZoneFace = { suggestions: ZoneKind[]; ring: XZ[] };

type Pose = {
  yaw: number;
  cos: number;
  sin: number;
  offsetX: number;
  offsetZ: number;
  lift: number;
  box: Box;
  samples: Sample[];
  orientation: number;
  zoneMatch: number;
};

function unpackF32(value: string) {
  const bytes = new Uint8Array(Buffer.from(value, "base64"));
  return new Float32Array(bytes.buffer);
}

function unpackU32(value: string) {
  const bytes = new Uint8Array(Buffer.from(value, "base64"));
  return new Uint32Array(bytes.buffer);
}

function spanOf(mesh: Solid) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
}

function sampleCloud(mesh: Solid) {
  const positions = mesh.positions;
  const vertices = positions.length / 3;
  const step = Math.max(1, Math.floor(vertices / 700));
  const points: number[] = [];
  for (let index = 0; index < vertices; index += step) {
    const offset = index * 3;
    points.push(positions[offset], positions[offset + 1], positions[offset + 2]);
  }
  return points;
}

function closestApproach(left: number[], right: number[]) {
  let best = Infinity;
  let ax = 0;
  let ay = 0;
  let az = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (let i = 0; i < left.length; i += 3) {
    for (let j = 0; j < right.length; j += 3) {
      const dx = left[i] - right[j];
      const dy = left[i + 1] - right[j + 1];
      const dz = left[i + 2] - right[j + 2];
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance >= best) continue;
      best = distance;
      ax = left[i];
      ay = left[i + 1];
      az = left[i + 2];
      bx = right[j];
      by = right[j + 1];
      bz = right[j + 2];
    }
  }
  return { gap: Math.sqrt(best), ax, ay, az, bx, by, bz };
}

function solidBall(x: number, y: number, z: number, radius: number, cell: number): Solid {
  const positions: number[] = [];
  const indices: number[] = [];
  const step = Math.max(cell * 0.65, 0.8);
  for (let iz = -radius; iz <= radius; iz += step) {
    for (let iy = -radius; iy <= radius; iy += step) {
      for (let ix = -radius; ix <= radius; ix += step) {
        if (ix * ix + iy * iy + iz * iz > radius * radius) continue;
        const vertex = positions.length / 3;
        positions.push(x + ix, y + iy, z + iz, x + ix + step * 0.35, y + iy, z + iz, x + ix, y + iy + step * 0.35, z + iz);
        indices.push(vertex, vertex + 1, vertex + 2);
      }
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

/** A short chain across each neighboring gap so the ordinary shrinkwrap can flow between clusters. */
function bridgeBeads(meshes: readonly Solid[], cell: number) {
  const clouds = meshes.map(sampleCloud);
  const approaches: { left: number; right: number; gap: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number }[] = [];
  for (let left = 0; left < clouds.length; left += 1) {
    for (let right = left + 1; right < clouds.length; right += 1) approaches.push({ left, right, ...closestApproach(clouds[left], clouds[right]) });
  }
  const joined = new Set([0]);
  const links: typeof approaches = [];
  while (joined.size < clouds.length) {
    let next = -1;
    let chosen: (typeof approaches)[number] | null = null;
    for (const edge of approaches) {
      const leftIn = joined.has(edge.left);
      const rightIn = joined.has(edge.right);
      if (leftIn === rightIn || (chosen && edge.gap >= chosen.gap)) continue;
      next = leftIn ? edge.right : edge.left;
      chosen = edge;
    }
    if (!chosen || next < 0 || !Number.isFinite(chosen.gap)) break;
    joined.add(next);
    links.push(chosen);
  }
  const radius = Math.max(cell * 4, 8);
  const touching = Math.max(cell * 2, 3);
  const beads: Solid[] = [];
  for (const link of links) {
    if (link.gap <= touching) continue;
    const steps = Math.max(1, Math.ceil(link.gap / (radius * 0.7)));
    for (let step = 0; step <= steps; step += 1) {
      const t = steps === 0 ? 0 : step / steps;
      beads.push(solidBall(
        link.ax + (link.bx - link.ax) * t,
        link.ay + (link.by - link.ay) * t,
        link.az + (link.bz - link.az) * t,
        radius,
        cell,
      ));
    }
  }
  return beads;
}

/** Drops the shrinkwrap where it lies on a cluster, so only the open gap remains. */
function gapSkin(wrap: Solid, clusters: readonly Solid[], reach: number): Solid | null {
  const samples: number[] = [];
  for (const mesh of clusters) {
    const positions = mesh.positions;
    const step = Math.max(1, Math.floor(positions.length / 3 / 5000));
    for (let index = 0; index < positions.length / 3; index += step) {
      const offset = index * 3;
      samples.push(positions[offset], positions[offset + 1], positions[offset + 2]);
    }
  }
  const bin = Math.max(reach, 1);
  const bins = new Map<string, number[]>();
  for (let index = 0; index < samples.length; index += 3) {
    const key = `${Math.floor(samples[index] / bin)},${Math.floor(samples[index + 1] / bin)},${Math.floor(samples[index + 2] / bin)}`;
    const list = bins.get(key);
    if (list) list.push(index);
    else bins.set(key, [index]);
  }
  const reachSq = reach * reach;
  const onCluster = (x: number, y: number, z: number) => {
    const ix = Math.floor(x / bin);
    const iy = Math.floor(y / bin);
    const iz = Math.floor(z / bin);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const list = bins.get(`${ix + dx},${iy + dy},${iz + dz}`);
          if (!list) continue;
          for (const index of list) {
            const dxs = x - samples[index];
            const dys = y - samples[index + 1];
            const dzs = z - samples[index + 2];
            if (dxs * dxs + dys * dys + dzs * dzs <= reachSq) return true;
          }
        }
      }
    }
    return false;
  };
  const source = wrap.positions;
  const map = new Map<number, number>();
  const positions: number[] = [];
  const indices: number[] = [];
  const take = (vertex: number) => {
    const existing = map.get(vertex);
    if (existing != null) return existing;
    const slot = positions.length / 3;
    map.set(vertex, slot);
    const offset = vertex * 3;
    positions.push(source[offset], source[offset + 1], source[offset + 2]);
    return slot;
  };
  for (let index = 0; index < wrap.indices.length; index += 3) {
    const ids = [wrap.indices[index], wrap.indices[index + 1], wrap.indices[index + 2]];
    let x = 0;
    let y = 0;
    let z = 0;
    for (const id of ids) {
      const offset = id * 3;
      x += source[offset];
      y += source[offset + 1];
      z += source[offset + 2];
    }
    if (onCluster(x / 3, y / 3, z / 3)) continue;
    indices.push(take(ids[0]), take(ids[1]), take(ids[2]));
  }
  if (indices.length < 12) return null;
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

function packMesh(mesh: Solid): PackedMesh {
  return {
    positions: Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength).toString("base64"),
    indices: Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength).toString("base64"),
  };
}

/** Catalog order for one program. The first id is the recommended cluster. */
function rankedClusterIds(programId: string, name: string) {
  const file = path.join(process.cwd(), "data", "skill4", "finished-programs", `${programId}.json`);
  const program = JSON.parse(readFileSync(file, "utf8")) as FinishedProgram;
  const rank = rankProgramClusters(programId, name, program.iterations);
  const ids = rank.clusters.map((cluster) => cluster.id);
  if (ids.length === 0) throw new Error(`The catalog has no cluster for ${name}.`);
  return ids;
}

function loadShrinkwrap(programId: string, clusterId: string): Solid {
  const file = path.join(process.cwd(), "data", "skill4", "finished", programId, `${clusterId.replaceAll(":", "__")}.json`);
  const body = JSON.parse(readFileSync(file, "utf8")) as { mesh?: { positions?: string; indices?: string } };
  if (!body.mesh?.positions || !body.mesh.indices) throw new Error(`Finished shrinkwrap ${clusterId} has no mesh.`);
  return { positions: unpackF32(body.mesh.positions), indices: unpackU32(body.mesh.indices) };
}

function dot(a: Vec, b: Vec) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec, b: Vec): Vec {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(a: Vec, amount: number): Vec {
  return { x: a.x * amount, y: a.y * amount, z: a.z * amount };
}

function length(a: Vec) {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Vec): Vec {
  const span = length(a) || 1;
  return scale(a, 1 / span);
}

function frameOf(mesh: Solid) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let west = 0;
  let east = 0;
  let south = 0;
  let north = 0;
  const count = mesh.positions.length / 3;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const x = mesh.positions[index];
    const y = mesh.positions[index + 1];
    const z = mesh.positions[index + 2];
    if (x < minX) { minX = x; west = index; }
    if (y < minY) minY = y;
    if (z < minZ) { minZ = z; south = index; }
    if (x > maxX) { maxX = x; east = index; }
    if (y > maxY) maxY = y;
    if (z > maxZ) { maxZ = z; north = index; }
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const stride = Math.max(1, Math.floor(count / 120));
  const picked = new Set([west, east, south, north]);
  for (let index = 0; index < count; index += stride) picked.add(index * 3);
  const plan: { x: number; z: number }[] = [];
  for (const index of picked) plan.push({ x: mesh.positions[index] - cx, z: mesh.positions[index + 2] - cz });
  return {
    minX, minY, minZ, maxX, maxY, maxZ,
    cx, cz,
    sizeX: maxX - minX,
    sizeZ: maxZ - minZ,
    height: maxY - minY,
    plan,
  };
}

function facingShare(yaw: number, towardX: number, towardZ: number, sizeX: number, sizeZ: number) {
  const faces = [
    { area: sizeZ, nx: Math.cos(yaw), nz: Math.sin(yaw) },
    { area: sizeZ, nx: -Math.cos(yaw), nz: -Math.sin(yaw) },
    { area: sizeX, nx: -Math.sin(yaw), nz: Math.cos(yaw) },
    { area: sizeX, nx: Math.sin(yaw), nz: -Math.cos(yaw) },
  ];
  let aimed = 0;
  let total = 0;
  for (const face of faces) {
    total += face.area;
    if (face.nx * towardX + face.nz * towardZ > 0.45) aimed += face.area;
  }
  return total === 0 ? 0 : aimed / total;
}

function makePose(
  yawDeg: number,
  offsetX: number,
  offsetZ: number,
  lift: number,
  anchorX: number,
  anchorZ: number,
  local: ReturnType<typeof frameOf>,
  towardX: number,
  towardZ: number,
): Pose {
  const yaw = (yawDeg * Math.PI) / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const samples: Sample[] = [];
  for (const point of local.plan) {
    const x = anchorX + offsetX + point.x * cos - point.z * sin;
    const z = anchorZ + offsetZ + point.x * sin + point.z * cos;
    samples.push({ x, z });
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  return {
    yaw: yawDeg,
    cos,
    sin,
    offsetX,
    offsetZ,
    lift,
    box: { minX, minY: lift, minZ, maxX, maxY: lift + local.height, maxZ },
    samples,
    orientation: facingShare(yaw, towardX, towardZ, local.sizeX, local.sizeZ),
    zoneMatch: 0,
  };
}

function ringSpan(ring: readonly XZ[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

function zoneDistance(x: number, z: number, ring: readonly XZ[]) {
  if (pointInRing(x, z, ring)) return 0;
  let best = Infinity;
  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = dx * dx + dz * dz;
    const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - from[0]) * dx + (z - from[1]) * dz) / length));
    best = Math.min(best, Math.hypot(x - (from[0] + dx * t), z - (from[1] + dz * t)));
  }
  return best;
}

/** Centroids on a grid inside one zone. The footprint has to sit wholly in that zone. */
function posesInZone(
  anchorX: number,
  anchorZ: number,
  local: ReturnType<typeof frameOf>,
  towardX: number,
  towardZ: number,
  kind: ZoneKind,
  face: ZoneFace,
  parcel: readonly XZ[],
) {
  const bounds = ringSpan(face.ring);
  const east = bounds.maxX - bounds.minX;
  const north = bounds.maxZ - bounds.minZ;
  const fits = (width: number, depth: number) => width <= east + 0.5 && depth <= north + 0.5;
  if (!face.suggestions.includes(kind)) return [];
  if (!fits(local.sizeX, local.sizeZ) && !fits(local.sizeZ, local.sizeX)) return [];
  const step = 8;
  const poses: Pose[] = [];
  for (let x = bounds.minX; x <= bounds.maxX; x += step) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += step) {
      if (!pointInRing(x, z, face.ring)) continue;
      for (const yaw of YAWS) {
        const pose = makePose(yaw, x - anchorX, z - anchorZ, 0, anchorX, anchorZ, local, towardX, towardZ);
        pose.zoneMatch = face.suggestions.includes(kind) ? 1 : 0;
        if (!enclosed(pose, parcel, 0) || !insideZone(pose, [face.ring])) continue;
        poses.push(pose);
      }
    }
  }
  return poses;
}

/** Poses inside pockets that state this program. A lobby stays out of a gathering pocket. */
function posesForSeat(
  anchorX: number,
  anchorZ: number,
  local: ReturnType<typeof frameOf>,
  towardX: number,
  towardZ: number,
  kind: ZoneKind,
  faces: readonly ZoneFace[],
  parcel: readonly XZ[],
  faceLimit = Number.POSITIVE_INFINITY,
) {
  const eligible = faces.filter((face) => face.suggestions.includes(kind));
  const ranked = [...eligible].sort((a, b) => {
    const ad = zoneDistance(anchorX, anchorZ, a.ring);
    const bd = zoneDistance(anchorX, anchorZ, b.ring);
    const aNear = ad <= 40 ? 0 : 1;
    const bNear = bd <= 40 ? 0 : 1;
    if (aNear !== bNear) return aNear - bNear;
    return ad - bd;
  });
  const poses: Pose[] = [];
  let used = 0;
  for (const face of ranked) {
    const next = posesInZone(anchorX, anchorZ, local, towardX, towardZ, kind, face, parcel);
    if (next.length === 0) continue;
    poses.push(...next);
    used += 1;
    if (used >= faceLimit) break;
  }
  return poses;
}

function enclosed(pose: Pose, ring: readonly XZ[], slack: number) {
  let outside = 0;
  for (const sample of pose.samples) {
    if (!pointInRing(sample.x, sample.z, ring)) outside += 1;
  }
  return outside <= slack;
}

function insideZone(pose: Pose, zones: readonly (readonly XZ[])[]) {
  return zones.some((zone) => pose.samples.every((sample) => pointInRing(sample.x, sample.z, zone)));
}

function pocketFor(pose: Pose, kind: ZoneKind, faces: readonly ZoneFace[]) {
  return faces.find((face) => face.suggestions.includes(kind) && pose.samples.every((sample) => pointInRing(sample.x, sample.z, face.ring))) ?? null;
}

function collides(a: Pose, b: Pose) {
  if (a.box.maxY <= b.box.minY || b.box.maxY <= a.box.minY) return false;
  if (a.box.maxX < b.box.minX - 12 || b.box.maxX < a.box.minX - 12 || a.box.maxZ < b.box.minZ - 12 || b.box.maxZ < a.box.minZ - 12) return false;
  const reach = 12 * 12;
  for (const left of a.samples) {
    for (const right of b.samples) {
      const dx = left.x - right.x;
      const dz = left.z - right.z;
      if (dx * dx + dz * dz < reach) return true;
    }
  }
  return false;
}

function boxesOverlap(a: Box, b: Box) {
  return a.maxX > b.minX + 2 && b.maxX > a.minX + 2 && a.maxZ > b.minZ + 2 && b.maxZ > a.minZ + 2;
}

/** Leave every later program at least one of its recommended poses. */
function keepsRoom(pose: Pose, later: readonly { options: readonly Pose[] }[], occupied: readonly Pose[]) {
  return later.every((other) => other.options.length === 0 || other.options.some((option) => !boxesOverlap(pose.box, option.box) && occupied.every((taken) => !boxesOverlap(option.box, taken.box))));
}

function chooseOne(poses: Pose[], occupied: readonly Pose[]) {
  let best: { pose: Pose; score: number } | null = null;
  for (const pose of poses) {
    if (occupied.some((other) => collides(pose, other))) continue;
    const proximity = 1 - Math.min(1, Math.hypot(pose.offsetX, pose.offsetZ) / 280);
    const score = proximity * 60 + pose.orientation * 30 + pose.zoneMatch * 12;
    if (!best || score > best.score) best = { pose, score };
  }
  return best ? { pose: best.pose, parcelFit: true } : null;
}

function placeMesh(mesh: Solid, pose: Pose, local: ReturnType<typeof frameOf>, anchorX: number, anchorZ: number): Solid {
  const out = new Float32Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const dx = mesh.positions[index] - local.cx;
    const dz = mesh.positions[index + 2] - local.cz;
    out[index] = anchorX + pose.offsetX + dx * pose.cos - dz * pose.sin;
    out[index + 1] = mesh.positions[index + 1] - local.minY + pose.lift;
    out[index + 2] = anchorZ + pose.offsetZ + dx * pose.sin + dz * pose.cos;
  }
  return { positions: out, indices: mesh.indices };
}

function basis(axis: Vec) {
  const helper = Math.abs(axis.y) < 0.85 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const side = normalize(cross(helper, axis));
  return { side, binormal: cross(axis, side) };
}
function extentAlong(mesh: Solid, axis: Vec) {
  let min = Infinity;
  let max = -Infinity;
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 3) {
    const station = positions[index] * axis.x + positions[index + 1] * axis.y + positions[index + 2] * axis.z;
    if (station < min) min = station;
    if (station > max) max = station;
  }
  return { min, max };
}
function centroidOf(mesh: Solid): Vec {
  const positions = mesh.positions;
  const count = positions.length / 3 || 1;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < positions.length; index += 3) {
    x += positions[index];
    y += positions[index + 1];
    z += positions[index + 2];
  }
  return { x: x / count, y: y / count, z: z / count };
}

function shiftMesh(mesh: Solid, delta: Vec): Solid {
  const positions = new Float32Array(mesh.positions);
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] += delta.x;
    positions[index + 1] += delta.y;
    positions[index + 2] += delta.z;
  }
  return { positions, indices: mesh.indices };
}

/** The part of the cluster that faces the other one. These triangles are the cluster's own surface. */
function facingCap(mesh: Solid, axis: Vec): Solid | null {
  const { min, max } = extentAlong(mesh, axis);
  const span = max - min;
  if (span < 4) return null;
  const limit = max - span * 0.62;
  const source = mesh.positions;
  const indices = mesh.indices;
  const map = new Map<number, number>();
  const positions: number[] = [];
  const kept: number[] = [];
  const take = (vertex: number) => {
    const existing = map.get(vertex);
    if (existing != null) return existing;
    const slot = positions.length / 3;
    map.set(vertex, slot);
    const offset = vertex * 3;
    positions.push(source[offset], source[offset + 1], source[offset + 2]);
    return slot;
  };
  for (let index = 0; index < indices.length; index += 3) {
    const ids = [indices[index], indices[index + 1], indices[index + 2]];
    let along = 0;
    for (const id of ids) {
      const offset = id * 3;
      along += source[offset] * axis.x + source[offset + 1] * axis.y + source[offset + 2] * axis.z;
    }
    if (along / 3 < limit) continue;
    kept.push(take(ids[0]), take(ids[1]), take(ids[2]));
  }
  if (kept.length < 24) return null;
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(kept) };
}

function portalFromMesh(mesh: Solid, axis: Vec): PortalReadout {
  const center = centroidOf(mesh);
  const { side, binormal } = basis(axis);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  let radius = 0;
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 3) {
    const point = { x: positions[index], y: positions[index + 1], z: positions[index + 2] };
    const offset = sub(point, center);
    const u = dot(offset, side);
    const v = dot(offset, binormal);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    radius = Math.max(radius, Math.hypot(u, v));
  }
  return {
    center,
    normal: axis,
    areaSqFt: Math.max(0, maxU - minU) * Math.max(0, maxV - minV),
    radiusFt: radius,
    section: "boundary",
    loop: [],
  };
}

/**
 * Carries each cluster's own surface across the gap, then shrinkwraps that run
 * with the two clusters so the skin stays at their scale.
 */
function continueSections(meshA: Solid, meshB: Solid, axis: Vec): { solid: Solid; portalA: PortalReadout; portalB: PortalReadout } | null {
  const capA = facingCap(meshA, axis);
  const capB = facingCap(meshB, scale(axis, -1));
  if (!capA || !capB) return null;
  const centerA = centroidOf(capA);
  const centerB = centroidOf(capB);
  const travel = sub(centerB, centerA);
  const distance = length(travel);
  const depthA = extentAlong(capA, axis);
  const depthB = extentAlong(capB, axis);
  const pace = Math.max(10, Math.min(depthA.max - depthA.min, depthB.max - depthB.min) * 0.5);
  const count = Math.max(1, Math.min(9, Math.round(distance / pace)));
  const stamps: Solid[] = [];
  for (let step = 0; step <= count; step += 1) {
    const t = count === 0 ? 0 : step / count;
    const source = t < 0.5 ? capA : capB;
    const origin = t < 0.5 ? centerA : centerB;
    stamps.push(shiftMesh(source, sub(add(centerA, scale(travel, t)), origin)));
  }
  const film = runAssemblyShrinkwrap(stamps);
  const solid = film ? { positions: film.mesh.positions, indices: film.mesh.indices } : mergeSolids(stamps);
  if (!solid) return null;
  return { solid, portalA: portalFromMesh(capA, axis), portalB: portalFromMesh(capB, scale(axis, -1)) };
}


function readZoning() {
  const file = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
  const archive = JSON.parse(readFileSync(file, "utf8")) as {
    iterations?: {
      id?: string;
      index?: number;
      seed?: number;
      layoutTitle?: string;
      nodes?: { id?: string; kind?: string; x?: number; z?: number; architecture?: { role?: string } }[];
      branches?: { x0?: number; z0?: number; x1?: number; z1?: number }[];
      architectureRecord?: { relationships?: { from?: string; to?: string; statement?: string }[] };
    }[];
  };
  const iteration = archive.iterations?.find((item) => item.id === ZONING_NETWORK_ID && item.index === 101 && item.seed === 20365850);
  if (!iteration) throw new Error("Zoning iteration 101 is not in the Herald archive.");
  return iteration;
}

function mergeSolids(solids: readonly Solid[]): Solid | null {
  const count = solids.reduce((sum, mesh) => sum + mesh.positions.length, 0);
  if (count < 9) return null;
  const positions = new Float32Array(count);
  const indices: number[] = [];
  let vertex = 0;
  let written = 0;
  for (const mesh of solids) {
    positions.set(mesh.positions, written);
    for (const index of mesh.indices) indices.push(vertex + index);
    vertex += mesh.positions.length / 3;
    written += mesh.positions.length;
  }
  return { positions, indices: new Uint32Array(indices) };
}

function nodeAt(iteration: ReturnType<typeof readZoning>, anchorId: string) {
  const node = iteration.nodes?.find((item) => item.id === anchorId && typeof item.x === "number" && typeof item.z === "number");
  if (!node || typeof node.x !== "number" || typeof node.z !== "number") throw new Error(`Zoning 101 has no anchor ${anchorId}.`);
  return { x: node.x, z: node.z, role: node.architecture?.role ?? "" };
}

function programZones(iteration: ReturnType<typeof readZoning>, ring: readonly XZ[]) {
  const branches = (iteration.branches ?? []).flatMap((branch) => (
    typeof branch.x0 === "number" && typeof branch.z0 === "number" && typeof branch.x1 === "number" && typeof branch.z1 === "number"
      ? [{ x0: branch.x0, z0: branch.z0, x1: branch.x1, z1: branch.z1, conductivity: 1 }]
      : []
  ));
  const nodes = (iteration.nodes ?? []).flatMap((node) => {
    const role = node.architecture?.role;
    if ((node.kind !== "source" && node.kind !== "attractor") || typeof node.x !== "number" || typeof node.z !== "number" || !role || !(role in ROLE_LABEL)) return [];
    return [{ kind: node.kind, x: node.x, z: node.z, program: programForRole(role as ArchitecturalRole) }];
  });
  const pockets = detectPockets(branches, ring).pockets;
  const readings = assessPockets(pockets, nodes, branches);
  const faces: ZoneFace[] = [];
  const drawn: { kind: ZoneKind; points: { x: number; z: number }[] }[] = [];
  pockets.forEach((pocket, index) => {
    const reading = readings[index];
    if (!reading || reading.fit === "remainder" || reading.fit === "unsuitable") return;
    const suggestions = reading.suggestions.filter((kind): kind is ZoneKind => kind === "lobby" || kind === "gathering" || kind === "workspace");
    faces.push({ suggestions, ring: pocket.points.map((point) => [point.x, point.z]) });
    if (suggestions.length === 0) return;
    const kind: ZoneKind = suggestions.includes("gathering") ? "gathering" : suggestions.includes("workspace") ? "workspace" : "lobby";
    drawn.push({ kind, points: pocket.points.map((point) => ({ x: point.x, z: point.z })) });
  });
  return { faces, drawn };
}

/** Place one catalog cluster per program inside a zoning pocket and continue their surfaces into one mass. */
export function buildPublicLobbyAssembly(): ClusterAssemblyReport {
  const iteration = readZoning();
  const ring = site.site.ring as XZ[];
  const { faces, drawn } = programZones(iteration, ring);
  const seats = PROGRAM_SEATS.map((seat) => {
    const anchor = nodeAt(iteration, seat.anchorId);
    return { ...seat, anchor, role: anchor.role, ids: rankedClusterIds(seat.id, seat.name) };
  });
  const queued = seats.map((seat) => {
    const clusterId = seat.ids[0];
    const source = loadShrinkwrap(seat.id, clusterId);
    const local = frameOf(source);
    const options = posesForSeat(seat.anchor.x, seat.anchor.z, local, seat.towardX, seat.towardZ, seat.kind, faces, ring);
    return { ...seat, clusterId, source, local, options };
  }).sort((a, b) => a.options.length - b.options.length || Math.max(b.local.sizeX, b.local.sizeZ) - Math.max(a.local.sizeX, a.local.sizeZ));
  const occupied: Pose[] = [];
  const skipped: string[] = [];
  const fitted = new Map<string, { clusterId: string; source: Solid; local: ReturnType<typeof frameOf>; pose: Pose; parcelFit: boolean; pocket: ZoneKind[] }>();
  for (const seat of queued) {
    let placedSeat: { clusterId: string; source: Solid; local: ReturnType<typeof frameOf>; pose: Pose; parcelFit: boolean; pocket: ZoneKind[] } | null = null;
    for (let rank = 0; rank < seat.ids.length; rank += 1) {
      const clusterId = seat.ids[rank];
      const source = rank === 0 ? seat.source : loadShrinkwrap(seat.id, clusterId);
      const local = rank === 0 ? seat.local : frameOf(source);
      const later = queued.filter((other) => other.id !== seat.id && !fitted.has(other.id));
      const open = posesForSeat(seat.anchor.x, seat.anchor.z, local, seat.towardX, seat.towardZ, seat.kind, faces, ring).filter((pose) => keepsRoom(pose, later, occupied) && pocketFor(pose, seat.kind, faces));
      const next = chooseOne(open, occupied);
      const pocket = next ? pocketFor(next.pose, seat.kind, faces) : null;
      if (!next || !pocket) continue;
      placedSeat = { clusterId, source, local, pose: next.pose, parcelFit: next.parcelFit, pocket: pocket.suggestions };
      break;
    }
    if (!placedSeat) {
      skipped.push(`${seat.name} has no catalog cluster that fits a ${seat.kind} pocket`);
      continue;
    }
    fitted.set(seat.id, placedSeat);
    occupied.push(placedSeat.pose);
  }
  const placed = seats.flatMap((seat) => {
    const choice = fitted.get(seat.id);
    if (!choice) return [];
    return [{ ...seat, ...choice, mesh: placeMesh(choice.source, choice.pose, choice.local, seat.anchor.x, seat.anchor.z) }];
  });
  const lobby = placed.find((seat) => seat.id === "public-lobby");
  const gathering = placed.find((seat) => seat.id === "waterfront-gathering");
  if (!gathering) throw new Error("Waterfront Gathering was not placed.");
  const lobbySeat = seats.find((seat) => seat.id === "public-lobby");
  const lobbyAnchor = lobby?.anchor ?? lobbySeat?.anchor ?? gathering.anchor;
  const gatheringAnchor = gathering.anchor;
  const lobbyId = lobby?.clusterId ?? "";
  const gatheringId = gathering.clusterId;
  const lobbyCenter = lobby
    ? { x: lobbyAnchor.x + lobby.pose.offsetX, y: lobby.pose.lift + lobby.local.height * 0.5, z: lobbyAnchor.z + lobby.pose.offsetZ }
    : { x: lobbyAnchor.x, y: 0, z: lobbyAnchor.z };
  const gatheringCenter = { x: gatheringAnchor.x + gathering.pose.offsetX, y: gathering.pose.lift + gathering.local.height * 0.5, z: gatheringAnchor.z + gathering.pose.offsetZ };
  let joinedSolid = false;
  let wrap: Solid | null = null;
  let wrapNote = "The shrinkwrap validation was not run.";
  try {
    const meshes = placed.map((seat) => seat.mesh);
    const cell = Math.max(...meshes.map((mesh) => spanOf(mesh))) / 80;
    const film = filmWrapAssembly([...meshes, ...bridgeBeads(meshes, cell)], cell);
    if (film && film.mesh.triangles > 4) {
      const skin = gapSkin(
        { positions: film.mesh.positions, indices: film.mesh.indices },
        meshes,
        cell * 3,
      );
      wrap = skin;
      joinedSolid = film.check.adopted && film.check.continuous && film.check.pieces === 1;
      wrapNote = joinedSolid
        ? "Shrinkwrap validation adopted one continuous skin."
        : `Shrinkwrap validation found ${film.check.pieces} pieces, so it did not adopt one skin.`;
    } else wrapNote = "The shrinkwrap validation did not adopt one skin.";
  } catch (error) {
    wrapNote = error instanceof Error ? error.message : "The shrinkwrap validation could not be completed.";
  }
  const parcelFit = placed.every((seat) => seat.parcelFit && seat.pocket.includes(seat.kind));
  const validationPassed = Boolean(parcelFit && skipped.length === 0 && joinedSolid);
  const reasons = [
    parcelFit ? "" : "A cluster sits outside a pocket of its program.",
    skipped.join(" "),
    joinedSolid ? "" : wrapNote,
  ].filter(Boolean);
  const statement = iteration.architectureRecord?.relationships?.find((item) => item.from === TEST_LINK.from && item.to === TEST_LINK.to)?.statement
    ?? "Public Lobby leads to the central gathering system, which has the strongest waterfront projection.";
  const emptyPortal: PortalReadout = {
    center: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 0 },
    areaSqFt: 0,
    radiusFt: 0,
    section: "circle",
    loop: [],
  };
  return {
    iteration: 101,
    seed: 20365850,
    networkId: ZONING_NETWORK_ID,
    arrangement: iteration.layoutTitle ?? "City-side experimental lobby",
    scale: "1 model unit = 1 foot",
    anchors: (iteration.nodes ?? []).flatMap((node) => {
      const role = node.architecture?.role;
      if (!role || typeof node.x !== "number" || typeof node.z !== "number" || !(role in ROLE_LABEL)) return [];
      return [{ id: node.id ?? role, role, label: ROLE_LABEL[role as ArchitecturalRole], x: node.x, z: node.z }];
    }),
    zones: drawn,
    branches: (iteration.branches ?? []).flatMap((branch) => (
      typeof branch.x0 === "number" && typeof branch.z0 === "number" && typeof branch.x1 === "number" && typeof branch.z1 === "number"
        ? [{ x0: branch.x0, z0: branch.z0, x1: branch.x1, z1: branch.z1 }]
        : []
    )),
    recordedLinks: (iteration.architectureRecord?.relationships ?? []).flatMap((item) => (
      item.from && item.to && item.statement
        ? [{ from: item.from, to: item.to, statement: item.statement, built: item.from !== "north-lobby" }]
        : []
    )),
    placements: placed.map((seat) => ({
      programId: seat.id,
      name: seat.name,
      clusterId: seat.clusterId,
      anchorId: seat.anchorId,
      role: seat.role,
      kind: seat.kind,
      pocket: seat.pocket,
      anchor: { x: seat.anchor.x, z: seat.anchor.z },
      pose: { yaw: seat.pose.yaw, east: seat.pose.offsetX, north: seat.pose.offsetZ, lift: seat.pose.lift },
    })),
    link: {
      statement,
      fromLabel: "Public Lobby",
      toLabel: "Central Gathering",
      fromCluster: lobbyId,
      toCluster: gatheringId,
      fromAnchor: lobbyAnchor,
      toAnchor: gatheringAnchor,
      fromPose: lobby
        ? { yaw: lobby.pose.yaw, east: lobby.pose.offsetX, north: lobby.pose.offsetZ, lift: lobby.pose.lift }
        : { yaw: 0, east: 0, north: 0, lift: 0 },
      toPose: { yaw: gathering.pose.yaw, east: gathering.pose.offsetX, north: gathering.pose.offsetZ, lift: gathering.pose.lift },
      anchorSeparationFt: Math.hypot(gatheringAnchor.x - lobbyAnchor.x, gatheringAnchor.z - lobbyAnchor.z),
      separationFt: Math.hypot(gatheringCenter.x - lobbyCenter.x, gatheringCenter.z - lobbyCenter.z),
      portalA: emptyPortal,
      portalB: emptyPortal,
      direction: normalize(sub(gatheringCenter, lobbyCenter)),
      distanceFt: 0,
      hybridGenerated: false,
      validationPassed,
      joinedSolid,
      parcelFit,
      note: reasons.join(" "),
    },
    meshes: {
      clusters: placed.map((seat) => ({ programId: seat.id, ...packMesh(seat.mesh) })),
      hybrid: null,
      wrap: wrap ? packMesh(wrap) : null,
    },
  };
}
