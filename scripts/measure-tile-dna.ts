import { decodeSolidifiedMesh } from "../lib/skill3/solidified-mesh";
import { readSolidifiedMesh } from "../lib/skill3/solidified-catalogue";
import selection from "../data/skill3/final-selection.json";

const N = 16;

function measure(id: string, candidate: number, continuation: string) {
  const stored = readSolidifiedMesh(id, candidate, continuation);
  if (!stored?.geometry) throw new Error(`missing ${id}`);
  const mesh = decodeSolidifiedMesh(stored.geometry);
  const p = mesh.positions;
  const idx = mesh.indices;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]);
    minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]);
  }
  const sx = maxX - minX || 1;
  const sy = maxY - minY || 1;
  const sz = maxZ - minZ || 1;
  let volume = 0;
  let area = 0;
  let cx = 0, cy = 0, cz = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cxp = p[c], cyp = p[c + 1], czp = p[c + 2];
    const vx = (ay * bz - az * by) + (by * czp - bz * cyp) + (cyp * by - czp * ay);
    // signed volume of tet with origin
    const tet = (ax * (by * czp - bz * cyp) + bx * (cy * 0 + cyp * az - czp * ay) + cxp * (ay * bz - az * by)) / 6;
    const crossX = (by - ay) * (czp - az) - (bz - az) * (cyp - ay);
    const crossY = (bz - az) * (cxp - ax) - (bx - ax) * (czp - az);
    const crossZ = (bx - ax) * (cyp - ay) - (by - ay) * (cxp - ax);
    const tetV = (ax * crossX + ay * crossY + az * crossZ) / 6;
    volume += tetV;
    area += 0.5 * Math.hypot(crossX, crossY, crossZ);
    cx += tetV * (ax + bx + cxp) / 4;
    cy += tetV * (ay + by + cyp) / 4;
    cz += tetV * (az + bz + czp) / 4;
    void vx;
  }
  const absV = Math.abs(volume) || 1e-9;
  cx /= volume || 1;
  cy /= volume || 1;
  cz /= volume || 1;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const centroidOffset = Math.hypot((cx - centerX) / sx, (cy - centerY) / sy, (cz - centerZ) / sz);
  const bboxV = sx * sy * sz;
  const fill = absV / bboxV;
  const isoperimetric = area / Math.pow(absV, 2 / 3);

  const inside = new Uint8Array(N * N * N);
  const eps = 1e-7;
  const ray = (x: number, y: number, z: number) => {
    let hits = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const y0 = p[a + 1], z0 = p[a + 2];
      const y1 = p[b + 1], z1 = p[b + 2];
      const y2 = p[c + 1], z2 = p[c + 2];
      if ((y0 > y) === (y1 > y) && (y1 > y) === (y2 > y)) continue;
      const denom = (z1 - z0) * (y2 - y0) - (z2 - z0) * (y1 - y0);
      if (Math.abs(denom) < eps) continue;
      const u = ((z - z0) * (y2 - y0) - (y - y0) * (z2 - z0)) / denom;
      const v = ((y - y0) * (z1 - z0) - (z - z0) * (y1 - y0)) / denom;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const ix = p[a] + u * (p[b] - p[a]) + v * (p[c] - p[a]);
      if (ix > x) hits += 1;
    }
    return hits % 2 === 1;
  };
  for (let iz = 0; iz < N; iz += 1) {
    for (let iy = 0; iy < N; iy += 1) {
      for (let ix = 0; ix < N; ix += 1) {
        const x = minX + ((ix + 0.5) / N) * sx;
        const y = minY + ((iy + 0.5) / N) * sy;
        const z = minZ + ((iz + 0.5) / N) * sz;
        if (ray(x, y, z)) inside[(iz * N + iy) * N + ix] = 1;
      }
    }
  }
  let solid = 0;
  const plan = new Float64Array(N * N);
  const heights: number[] = [];
  for (let iz = 0; iz < N; iz += 1) {
    let layer = 0;
    let lx = 0, ly = 0;
    for (let iy = 0; iy < N; iy += 1) {
      for (let ix = 0; ix < N; ix += 1) {
        if (!inside[(iz * N + iy) * N + ix]) continue;
        solid += 1;
        layer += 1;
        lx += ix;
        ly += iy;
        plan[iy * N + ix] += 1;
      }
    }
    if (layer > 0) heights.push(layer);
  }
  let planCount = 0;
  let meanX = 0, meanY = 0;
  for (let iy = 0; iy < N; iy += 1) {
    for (let ix = 0; ix < N; ix += 1) {
      if (plan[iy * N + ix] <= 0) continue;
      planCount += 1;
      meanX += ix;
      meanY += iy;
    }
  }
  meanX /= planCount || 1;
  meanY /= planCount || 1;
  let xx = 0, yy = 0, xy = 0;
  for (let iy = 0; iy < N; iy += 1) {
    for (let ix = 0; ix < N; ix += 1) {
      if (plan[iy * N + ix] <= 0) continue;
      const dx = ix - meanX, dy = iy - meanY;
      xx += dx * dx;
      yy += dy * dy;
      xy += dx * dy;
    }
  }
  const trace = xx + yy;
  const det = xx * yy - xy * xy;
  const root = Math.sqrt(Math.max(0, trace * trace / 4 - det));
  const major = trace / 2 + root;
  const minor = Math.max(trace / 2 - root, 1e-6);
  const anisotropy = major / minor;
  const planFill = planCount / (N * N);
  const meanH = heights.reduce((sum, value) => sum + value, 0) / (heights.length || 1);
  const heightVar = heights.reduce((sum, value) => sum + (value - meanH) ** 2, 0) / (heights.length || 1);
  const heightCv = Math.sqrt(heightVar) / (meanH || 1);
  const dims = [sx, sy, sz].sort((a, b) => b - a);
  return {
    id,
    triangles: mesh.triangles,
    dims: dims.map((value) => Number(value.toFixed(2))),
    axes: { x: Number(sx.toFixed(2)), y: Number(sy.toFixed(2)), z: Number(sz.toFixed(2)) },
    fill: Number(fill.toFixed(3)),
    voxelFill: Number((solid / (N * N * N)).toFixed(3)),
    planFill: Number(planFill.toFixed(3)),
    anisotropy: Number(anisotropy.toFixed(2)),
    heightCv: Number(heightCv.toFixed(3)),
    centroid: Number(centroidOffset.toFixed(3)),
    isoperimetric: Number(isoperimetric.toFixed(2)),
    layers: heights.length,
  };
}

for (const item of selection.selections) {
  const started = Date.now();
  const row = measure(item.archetypeId, item.candidateId, item.continuationId);
  console.log(JSON.stringify({ ...row, ms: Date.now() - started, program: item.category }));
}
