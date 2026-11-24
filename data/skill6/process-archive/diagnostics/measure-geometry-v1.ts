/**
 * Read-only diagnostic views of stored Skill 6 clusters.
 * Draws the stored refined mesh and the stored seated poses.
 * It does not write into experiment directories and it does not assemble a new union.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import path from "node:path";
import type { Skill6Pose, Vec3 } from "../../../../lib/skill6/contract";
import { poseBounds } from "../../../../lib/skill6/geometry";
import { readShape } from "../../../../lib/skill6/engines/morphology";
import { loadArchetypeMeshes, type ArchetypeMesh } from "../../../../lib/skill6/source";

const IDS = [
  "on-rule-compact-5",
  "on-rule-compact-6",
  "on-rule-branching-5",
  "on-graph-branching-5",
  "on-graph-branching-7",
  "on-wfc-branching-5",
  "on-wfc-branching-7",
  "on-rule-branching-4",
];
const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "skill6", "process-archive", "diagnostics", "geometry-v1");
const WIDTH = 480;
const HEIGHT = 340;

type Encoded = { positions: string; indices: string; triangles?: number };
type Mesh = { positions: Float32Array; indices: Uint32Array };

function decode(encoded: Encoded | null): Mesh | null {
  if (!encoded?.positions) return null;
  const positions = new Uint8Array(Buffer.from(encoded.positions, "base64"));
  const indices = new Uint8Array(Buffer.from(encoded.indices, "base64"));
  return {
    positions: new Float32Array(positions.buffer, positions.byteOffset, positions.byteLength / 4),
    indices: new Uint32Array(indices.buffer, indices.byteOffset, indices.byteLength / 4),
  };
}

function posePoint(pose: Skill6Pose, x: number, y: number, z: number): Vec3 {
  const b = pose.basis;
  return [
    b[0] * x + b[3] * y + b[6] * z + pose.translation[0],
    b[1] * x + b[4] * y + b[7] * z + pose.translation[1],
    b[2] * x + b[5] * y + b[8] * z + pose.translation[2],
  ];
}

const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
function project(x: number, y: number, z: number) {
  return { x: (x - y) * COS, y: -(z) + (x + y) * SIN, depth: -(x - y + z) };
}

function png(width: number, height: number, rgba: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();
function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type Part = { positions: Float32Array; indices: Uint32Array; color: [number, number, number] };

export function render(parts: Part[], file: string) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const projected: { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; color: [number, number, number]; shade: number }[] = [];
  for (const part of parts) {
    const p = part.positions;
    const ix = part.indices;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3;
      const b = ix[t + 1] * 3;
      const c = ix[t + 2] * 3;
      const pa = project(p[a], p[a + 1], p[a + 2]);
      const pb = project(p[b], p[b + 1], p[b + 2]);
      const pc = project(p[c], p[c + 1], p[c + 2]);
      const ux = p[b] - p[a];
      const uy = p[b + 1] - p[a + 1];
      const uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a];
      const vy = p[c + 1] - p[a + 1];
      const vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      const shade = 0.35 + 0.65 * Math.abs((nx + -ny + nz) / length / Math.sqrt(3));
      projected.push({ ax: pa.x, ay: pa.y, az: pa.depth, bx: pb.x, by: pb.y, bz: pb.depth, cx: pc.x, cy: pc.y, cz: pc.depth, color: part.color, shade });
      minX = Math.min(minX, pa.x, pb.x, pc.x);
      minY = Math.min(minY, pa.y, pb.y, pc.y);
      maxX = Math.max(maxX, pa.x, pb.x, pc.x);
      maxY = Math.max(maxY, pa.y, pb.y, pc.y);
    }
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const scale = (Math.min(WIDTH, HEIGHT) - 48) / span;
  const originX = WIDTH / 2 - ((minX + maxX) / 2) * scale;
  const originY = HEIGHT / 2 - ((minY + maxY) / 2) * scale;
  const color = Buffer.alloc(WIDTH * HEIGHT * 4);
  const depth = new Float32Array(WIDTH * HEIGHT);
  depth.fill(Infinity);
  for (let i = 0; i < color.length; i += 4) color[i + 3] = 255;
  for (const tri of projected) {
    const ax = tri.ax * scale + originX;
    const ay = tri.ay * scale + originY;
    const bx = tri.bx * scale + originX;
    const by = tri.by * scale + originY;
    const cx = tri.cx * scale + originX;
    const cy = tri.cy * scale + originY;
    const minPx = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxPx = Math.min(WIDTH - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minPy = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxPy = Math.min(HEIGHT - 1, Math.ceil(Math.max(ay, by, cy)));
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-6) continue;
    const step = 1;
    for (let y = minPy; y <= maxPy; y += step) {
      for (let x = minPx; x <= maxPx; x += step) {
        const w0 = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / area;
        const w1 = ((cx - bx) * (y - by) - (cy - by) * (x - bx)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w2 * tri.az + w0 * tri.bz + w1 * tri.cz;
        const pixel = y * WIDTH + x;
        if (z >= depth[pixel]) continue;
        const red = Math.round(tri.color[0] * tri.shade);
        const green = Math.round(tri.color[1] * tri.shade);
        const blue = Math.round(tri.color[2] * tri.shade);
        for (let oy = 0; oy < step; oy += 1) {
          for (let ox = 0; ox < step; ox += 1) {
            const px = x + ox;
            const py = y + oy;
            if (px >= WIDTH || py >= HEIGHT) continue;
            const slot = py * WIDTH + px;
            if (z >= depth[slot]) continue;
            depth[slot] = z;
            const offset = slot * 4;
            color[offset] = red;
            color[offset + 1] = green;
            color[offset + 2] = blue;
          }
        }
      }
    }
  }
  writeFileSync(file, png(WIDTH, HEIGHT, color));
}

export function poseMesh(mesh: ArchetypeMesh, pose: Skill6Pose): Mesh {
  const positions = new Float32Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const world = posePoint(pose, mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]);
    positions[index] = world[0];
    positions[index + 1] = world[1];
    positions[index + 2] = world[2];
  }
  return { positions, indices: mesh.indices };
}

export const STEP_COLORS: [number, number, number][] = [
  [214, 214, 214],
  [73, 215, 222],
  [199, 126, 95],
  [120, 168, 196],
  [232, 196, 140],
  [150, 196, 168],
  [196, 160, 190],
  [168, 168, 120],
];

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const report = JSON.parse(readFileSync(path.join(ROOT, "data", "skill6", "experiments", "clustering-overnight-v1", "index.json"), "utf8"));
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const measured = [];
  for (const id of IDS) {
    const record = report.records.find((item: { id: string }) => item.id === id);
    const row = report.rows.find((item: { id: string }) => item.id === id);
    const seated = new Map(record.assembly.seatedTiles.map((tile: { instanceId: string; pose: Skill6Pose }) => [tile.instanceId, tile.pose]));
    const reading = readShape(record.tiles, record.contacts, byId);
    const edges = Math.max(1, record.tiles.length - 1);
    const primary = reading.measures;
    const boxes = record.tiles.map((tile: { instanceId: string; archetypeId: string }) => {
      const pose = seated.get(tile.instanceId) ?? record.tiles.find((item: { instanceId: string }) => item.instanceId === tile.instanceId).pose;
      const box = poseBounds(byId.get(tile.archetypeId)!.tight, pose);
      const center = [0, 1, 2].map((axis) => (box.min[axis] + box.max[axis]) / 2) as Vec3;
      return { instanceId: tile.instanceId, archetypeId: tile.archetypeId, box, center, volume: byId.get(tile.archetypeId)!.solidVolume, minZ: box.min[2] };
    });
    const clusterMin = [Infinity, Infinity, Infinity];
    const clusterMax = [-Infinity, -Infinity, -Infinity];
    for (const box of boxes) {
      for (let axis = 0; axis < 3; axis += 1) {
        clusterMin[axis] = Math.min(clusterMin[axis], box.box.min[axis]);
        clusterMax[axis] = Math.max(clusterMax[axis], box.box.max[axis]);
      }
    }
    const extent = clusterMax.map((value, axis) => value - clusterMin[axis]);
    const solid = boxes.reduce((sum: number, box: { volume: number }) => sum + box.volume, 0);
    const centroidZ = boxes.reduce((sum: number, box: { volume: number; center: Vec3 }) => sum + box.volume * box.center[2], 0) / solid;
    const tiles = boxes.map((box: { instanceId: string; archetypeId: string; volume: number; minZ: number; center: Vec3 }, index: number) => {
      const previous = boxes.slice(0, index);
      const mesh = byId.get(box.archetypeId)!;
      const pose = seated.get(box.instanceId);
      let outside = 0;
      let sampled = 0;
      for (let vertex = 0; vertex < mesh.positions.length; vertex += 90) {
        const world = posePoint(pose, mesh.positions[vertex], mesh.positions[vertex + 1], mesh.positions[vertex + 2]);
        sampled += 1;
        const inside = previous.some((earlier: { box: { min: number[]; max: number[] } }) => world[0] >= earlier.box.min[0] && world[0] <= earlier.box.max[0] && world[1] >= earlier.box.min[1] && world[1] <= earlier.box.max[1] && world[2] >= earlier.box.min[2] && world[2] <= earlier.box.max[2]);
        if (!inside) outside += 1;
      }
      const joint = record.assembly.joints.find((item: { guestInstanceId: string; primary: boolean }) => item.primary && item.guestInstanceId === box.instanceId);
      return {
        step: index,
        instanceId: box.instanceId,
        archetypeId: box.archetypeId,
        solidVolume: round(box.volume, 1),
        shareOfSolid: round(box.volume / solid),
        outsidePreviousBounds: index === 0 ? 1 : round(outside / Math.max(1, sampled)),
        minZ: round(box.minZ, 3),
        centroidZ: round(box.center[2], 2),
        reachesGroundBand: box.minZ < 0.6,
        jointArea: joint ? round(joint.contact.contactArea, 2) : null,
        jointDirection: joint?.direction ?? null,
      };
    });
    const joints = record.assembly.joints.map((joint: { id: string; primary: boolean; direction: string; classification: string; contact: { contactArea: number; residualGap: number; deepestCrossing: number }; patch: { footprint: { extent: number[] }; volume: number } | null }) => {
      const extent = joint.patch?.footprint?.extent ?? [0, 0, 0];
      const sorted = [...extent].sort((a, b) => a - b);
      return {
        id: joint.id,
        primary: joint.primary,
        direction: joint.direction,
        classification: joint.classification,
        area: round(joint.contact.contactArea, 2),
        gap: round(joint.contact.residualGap, 3),
        rigidCrossing: round(joint.contact.deepestCrossing, 4),
        bridgePlanMin: round(sorted[1], 2),
        bridgeThickness: round(sorted[0], 2),
        patchVolume: joint.patch ? round(joint.patch.volume, 1) : null,
      };
    });
    const score = {
      branchPoints: primary.branchPoints,
      definition: "A branch point is a tile with two or more guests in the primary growth tree. The primary edge is the first stored contact that names that guest. Later contacts raise degree and compactness, and they do not add a branch point.",
      leaves: primary.leaves,
      depth: primary.depth,
      directions: primary.directions,
      primaryEdges: edges,
      extraContacts: primary.extraEdges,
      branchingTerms: {
        branchPoints: round(0.3 * Math.min(1, primary.branchPoints / Math.max(1, Math.floor(edges / 2)))),
        leaves: round(0.25 * (primary.leaves / edges)),
        depth: round(0.25 * Math.min(1, Math.max(0, primary.depth - 1) / 2)),
        directions: round(0.2 * Math.min(1, Math.max(0, primary.directions.length - 1) / 3)),
      },
      storedScore: row.shape,
      occupancy: round(primary.occupancy, 3),
      gyration: round(primary.gyration, 3),
    };
    const mass = {
      extent: extent.map((value) => round(value, 2)),
      solidVolume: round(solid, 1),
      boundingVolume: round(record.metrics.boundingVolume, 1),
      clusterVoidFraction: round(record.metrics.clusterVoidFraction, 3),
      centroidZ: round(centroidZ, 2),
      height: round(extent[2], 2),
      centroidHeightShare: round((centroidZ - clusterMin[2]) / Math.max(1e-6, extent[2]), 3),
      groundTiles: tiles.filter((tile: { reachesGroundBand: boolean }) => tile.reachesGroundBand).map((tile: { instanceId: string }) => tile.instanceId),
      lift: record.assembly.ground.lift,
    };
    const pipeline = {
      unionCavities: record.assembly.union.cavities,
      refinedCavities: record.assembly.refined.cavities,
      cavitiesFilled: record.assembly.refined.cavitiesFilled,
      penetrations: record.assembly.refined.parameters.penetrations,
      maxPenetration: round(record.assembly.refined.parameters.maxPenetration, 4),
      grazes: record.assembly.refined.parameters.grazes,
      maxShift: round(record.assembly.refined.maxShift, 3),
      meanShift: round(record.assembly.refined.meanShift, 3),
      verticesRestored: record.assembly.refined.parameters.verticesRestored,
      fillCavityVolume: record.assembly.refined.parameters.fillCavityVolume,
    };
    measured.push({
      id,
      requested: row.morphology,
      validated: row.validated,
      status: record.status,
      trace: record.search?.trace,
      score,
      mass,
      tiles,
      joints,
      pipeline,
      images: {
        refined: `${id}-refined.png`,
        rigid: `${id}-rigid.png`,
        contacts: `${id}-contacts.svg`,
        label: "Rendered views of stored meshes and stored seated poses. No intermediate union was reconstructed.",
      },
    });

    const stored = JSON.parse(readFileSync(path.join(ROOT, "data", "skill6", "experiments", "clustering-overnight-v1", `${id}.mesh.json`), "utf8")) as { refined: Encoded; raw: Encoded; patches: Encoded[] };
    const refined = decode(stored.refined)!;
    render([{ positions: refined.positions, indices: refined.indices, color: [214, 214, 214] }], path.join(OUT, `${id}-refined.png`));
    const rigidParts = record.tiles.map((tile: { instanceId: string; archetypeId: string }, index: number) => {
      const posed = poseMesh(byId.get(tile.archetypeId)!, seated.get(tile.instanceId));
      return { ...posed, color: STEP_COLORS[index % STEP_COLORS.length] };
    });
    render(rigidParts, path.join(OUT, `${id}-rigid.png`));
    const points = boxes.map((box: { center: Vec3; instanceId: string }) => ({ ...project(box.center[0], box.center[1], box.center[2]), id: box.instanceId }));
    const minSX = Math.min(...points.map((point: { x: number }) => point.x));
    const maxSX = Math.max(...points.map((point: { x: number }) => point.x));
    const minSY = Math.min(...points.map((point: { y: number }) => point.y));
    const maxSY = Math.max(...points.map((point: { y: number }) => point.y));
    const fit = 280 / Math.max(maxSX - minSX, maxSY - minSY, 1);
    const sx = (value: number) => 40 + (value - minSX) * fit;
    const sy = (value: number) => 40 + (value - minSY) * fit;
    const lines = record.assembly.graph.edges.map((edge: { host: string; guest: string; primary: boolean }) => {
      const host = points.find((point: { id: string }) => point.id === edge.host);
      const guest = points.find((point: { id: string }) => point.id === edge.guest);
      const joint = joints.find((item: { id: string }) => item.id === `${edge.host}-${edge.guest}`);
      return `<line x1="${sx(host.x)}" y1="${sy(host.y)}" x2="${sx(guest.x)}" y2="${sy(guest.y)}" stroke="${edge.primary ? "#49d7de" : "#c77e5f"}" stroke-width="${edge.primary ? 2 : 1}" />
        <text x="${(sx(host.x) + sx(guest.x)) / 2}" y="${(sy(host.y) + sy(guest.y)) / 2}" fill="#d6d6d6" font-size="11">${joint ? joint.area : ""}</text>`;
    });
    const nodes = points.map((point: { x: number; y: number; id: string }) => `<circle cx="${sx(point.x)}" cy="${sy(point.y)}" r="8" fill="#111" stroke="#d6d6d6" /><text x="${sx(point.x) + 10}" y="${sy(point.y) + 4}" fill="#d6d6d6" font-size="12">${point.id}</text>`);
    writeFileSync(path.join(OUT, `${id}-contacts.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="360" viewBox="0 0 420 360"><rect width="420" height="360" fill="#000"/>${lines.join("")}${nodes.join("")}</svg>`);
    console.log(id, "rendered");
  }
  writeFileSync(path.join(OUT, "measurements.json"), JSON.stringify({
    version: "skill6-geometry-diagnostic-v1",
    source: "data/skill6/experiments/clustering-overnight-v1",
    archive: "data/skill6/process-archive/v1.json",
    note: "Measurements are read from the stored records, or computed from the stored poses and the unchanged Skill 3 meshes. Images are views of those stored meshes. No union was rebuilt.",
    clusters: measured,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
