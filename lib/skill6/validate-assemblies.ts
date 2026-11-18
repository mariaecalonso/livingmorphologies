/**
 * Measure the stored assembled meshes and write data/skill6/assembled/validation.json.
 * Reads the assembly index and mesh files only. Nothing is regenerated. The catalog reads the result; it never runs this.
 * Run: npx tsx lib/skill6/validate-assemblies.ts [clusterId ...]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SKILL6_GROWTH_DIRECTIONS, type ClusterRecord, type Vec3 } from "./contract";
import { ASSEMBLY_DIRECTORY, ASSEMBLY_VALIDATION_PATH, type AssemblyValidation } from "./catalog";
import { growthRejection } from "./grow";
import { posedMesh, type PatchMesh } from "./patch";
import { crossingReport } from "./refine-mesh";
import { loadArchetypeMeshes } from "./source";

type Box = { min: number[]; max: number[] };

function decode(encoded: { positions: string; indices: string }): PatchMesh {
  const positions = new Uint8Array(Buffer.from(encoded.positions, "base64"));
  const indices = new Uint8Array(Buffer.from(encoded.indices, "base64"));
  return { positions: new Float32Array(positions.buffer), indices: new Uint32Array(indices.buffer) };
}

function boundsOf(positions: ArrayLike<number>): Box {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  return { min, max };
}

/** Pairs of triangles that share no vertex and cross each other. Uniform grid broad phase, exact edge-through-face test. */
function crossings(mesh: PatchMesh): { count: number; region: Box | null } {
  const P = mesh.positions;
  const I = mesh.indices;
  const count = I.length / 3;
  const box = boundsOf(P);
  const extent = box.max.map((value, axis) => value - box.min[axis]);
  const cell = Math.max(0.4, Math.cbrt((extent[0] * extent[1] * Math.max(1, extent[2])) / count) * 2);
  const low = new Float32Array(count * 3);
  const high = new Float32Array(count * 3);
  const buckets = new Map<number, number[]>();
  for (let t = 0; t < count; t += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const a = P[I[t * 3] * 3 + axis];
      const b = P[I[t * 3 + 1] * 3 + axis];
      const c = P[I[t * 3 + 2] * 3 + axis];
      low[t * 3 + axis] = Math.min(a, b, c);
      high[t * 3 + axis] = Math.max(a, b, c);
    }
    const from = [0, 1, 2].map((axis) => Math.floor(low[t * 3 + axis] / cell));
    const to = [0, 1, 2].map((axis) => Math.floor(high[t * 3 + axis] / cell));
    for (let x = from[0]; x <= to[0]; x += 1) for (let y = from[1]; y <= to[1]; y += 1) for (let z = from[2]; z <= to[2]; z += 1) {
      const key = (x + 4096) + (y + 4096) * 8192 + (z + 4096) * 8192 * 8192;
      const list = buckets.get(key);
      if (list) list.push(t);
      else buckets.set(key, [t]);
    }
  }
  const point = (index: number) => [P[index * 3], P[index * 3 + 1], P[index * 3 + 2]];
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const through = (p: number[], q: number[], a: number[], b: number[], c: number[]) => {
    const n = cross(sub(b, a), sub(c, a));
    const dp = dot(sub(p, a), n);
    const dq = dot(sub(q, a), n);
    if (dp * dq >= 0) return false;
    const s = dp / (dp - dq);
    const x = [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s, p[2] + (q[2] - p[2]) * s];
    return dot(cross(sub(b, a), sub(x, a)), n) > 1e-7 && dot(cross(sub(c, b), sub(x, b)), n) > 1e-7 && dot(cross(sub(a, c), sub(x, c)), n) > 1e-7;
  };
  const seen = new Set<number>();
  const hits: number[] = [];
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const t = list[i];
        const u = list[j];
        const pair = Math.min(t, u) * count + Math.max(t, u);
        if (seen.has(pair)) continue;
        let overlap = true;
        for (let axis = 0; axis < 3; axis += 1) {
          if (low[t * 3 + axis] > high[u * 3 + axis] || low[u * 3 + axis] > high[t * 3 + axis]) overlap = false;
        }
        if (!overlap) continue;
        seen.add(pair);
        const A = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
        const B = [I[u * 3], I[u * 3 + 1], I[u * 3 + 2]];
        if (A.some((index) => B.includes(index))) continue;
        const [a, b, c] = A.map(point);
        const [d, e, f] = B.map(point);
        if (through(a, b, d, e, f) || through(b, c, d, e, f) || through(c, a, d, e, f) || through(d, e, a, b, c) || through(e, f, a, b, c) || through(f, d, a, b, c)) {
          hits.push(...a);
        }
      }
    }
  }
  return { count: hits.length / 3, region: hits.length ? boundsOf(hits) : null };
}

type ManifoldLike = { status: () => string; volume: () => number; genus: () => number; decompose: () => ManifoldLike[]; delete: () => void };

async function kernel() {
  const wasm = await (await import("manifold-3d/manifold")).default();
  wasm.setup();
  return wasm as unknown as { Manifold: new (mesh: unknown) => ManifoldLike; Mesh: new (mesh: unknown) => unknown };
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

async function main() {
  const only = process.argv.slice(2);
  const wasm = await kernel();
  const index = JSON.parse(readFileSync(path.join(ASSEMBLY_DIRECTORY, "index.json"), "utf8")) as { clusters: ClusterRecord[] };
  const previous: Record<string, AssemblyValidation> = existsSync(ASSEMBLY_VALIDATION_PATH) ? JSON.parse(readFileSync(ASSEMBLY_VALIDATION_PATH, "utf8")).clusters ?? {} : {};
  const archetypes = new Map(loadArchetypeMeshes().map((mesh) => [mesh.archetypeId, mesh]));
  const clusters: Record<string, AssemblyValidation> = only.length ? { ...previous } : {};
  for (const record of index.clusters) {
    const assembly = record.assembly;
    if (!assembly || (only.length && !only.includes(record.id))) continue;
    const stored = JSON.parse(readFileSync(path.join(process.cwd(), assembly.meshFile), "utf8"));
    const solid = (mesh: PatchMesh) => {
      const body = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
      const shells = body.decompose().map((piece) => {
        const volume = piece.volume();
        piece.delete();
        return volume;
      });
      const crossed = crossingReport(mesh);
      const reading = {
        status: body.status(),
        triangles: mesh.indices.length / 3,
        bodies: shells.filter((volume) => volume >= 1e-3).length,
        cavities: shells.filter((volume) => volume <= -1e-3).length,
        genus: body.genus(),
        volume: round(body.volume(), 1),
        minZ: round(boundsOf(mesh.positions).min[2], 4),
        penetrations: crossed.penetrations,
        grazes: crossed.grazes,
        maxPenetration: round(crossed.maxPenetration, 4),
      };
      body.delete();
      return reading;
    };
    const raw = solid(decode(stored.raw));
    const refined = solid(decode(stored.refined));
    const seated = new Map(assembly.seatedTiles.map((tile) => [tile.instanceId, tile.pose]));
    const boxes = new Map<string, Box>();
    const tiles = record.tiles.map((tile) => {
      const pose = seated.get(tile.instanceId) ?? tile.pose;
      const box = boundsOf(posedMesh(archetypes.get(tile.archetypeId)!, pose).positions);
      boxes.set(tile.instanceId, box);
      return {
        instanceId: tile.instanceId,
        tiltDegrees: round((Math.acos(Math.max(-1, Math.min(1, pose.basis[8]))) * 180) / Math.PI, 1),
        mirrored: pose.mirrorX,
        minZ: round(box.min[2], 2),
        maxZ: round(box.max[2], 2),
      };
    });
    const growth = assembly.growth.filter((step) => step.hostInstanceId).map((step) => {
      const host = boxes.get(step.hostInstanceId!)!;
      const guest = boxes.get(step.instanceId)!;
      const asBounds = (box: Box) => ({ min: box.min as Vec3, max: box.max as Vec3 });
      return {
        instanceId: step.instanceId,
        hostInstanceId: step.hostInstanceId!,
        label: step.direction,
        baseChange: round(guest.min[2] - host.min[2], 1),
        topChange: round(guest.max[2] - host.max[2], 1),
        rejection: growthRejection(asBounds(host), asBounds(guest), SKILL6_GROWTH_DIRECTIONS),
      };
    });
    const all = [...boxes.values()];
    const refinedBox = boundsOf(decode(stored.refined).positions);
    clusters[record.id] = {
      meshFile: assembly.meshFile,
      refinedTriangles: assembly.refined.triangles,
      lift: assembly.ground.lift,
      raw,
      refined,
      tiles,
      growth,
      seatedTilesMinZ: round(Math.min(...all.map((box) => box.min[2])), 4),
      refinedToTilesOffset: round(Math.max(...[0, 1, 2].flatMap((axis) => [
        Math.abs(refinedBox.min[axis] - Math.min(...all.map((box) => box.min[axis]))),
        Math.abs(refinedBox.max[axis] - Math.max(...all.map((box) => box.max[axis]))),
      ])), 3),
    };
    console.log(`${record.id} · refined ${refined.bodies} body · ${refined.cavities} cavities · genus ${refined.genus} · penetrations ${refined.penetrations} · grazes ${refined.grazes} · max ${refined.maxPenetration} · min Z ${refined.minZ}`);
  }
  writeFileSync(ASSEMBLY_VALIDATION_PATH, `${JSON.stringify({
    version: 1,
    note: "Measured from the stored meshes. A penetration is a triangle pair deeper than the seating tolerance; a shallower meeting is a graze. Manifold reports NoError for a closed mesh even when its surface folds through itself. A growth rejection uses the posed bounds: below ground, a downward meeting face, a body that drops into the host's lower quarter, or a tile floating above its host.",
    clusters,
  }, null, 1)}\n`);
}

main();
