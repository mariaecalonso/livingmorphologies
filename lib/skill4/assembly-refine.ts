import type { IsoMesh } from "../scan/isomesh";

export type RefinedMesh = {
  positions: Float32Array;
  /** Same indices as positions, with new vertices still on the original edges. */
  rest: Float32Array;
  indices: Uint32Array;
  triangles: number;
};

type Vec = { x: number; y: number; z: number };

const FOLD = 0.62;
const ROUNDS = 3;

/**
 * Splits edges that are still sharply folded, and the other edges of those
 * faces so the new corners meet. Only the fold vertices leave the original
 * surface. Open ends stay pinned.
 */
export function refineSharpRegions(mesh: IsoMesh): RefinedMesh | null {
  let positions = mesh.positions;
  let indices = mesh.indices;
  let rest: Float32Array | null = null;
  let changed = false;
  for (let round = 0; round < ROUNDS; round += 1) {
    const before = foldScore(positions, indices);
    if (before < 0.72) break;
    const split = splitSharpEdges(positions, indices);
    if (!split) break;
    const eased = easeNewVertices(split.positions, split.indices, split.fresh, split.wings);
    const relaxed = new Float32Array(eased);
    relaxFalloff(relaxed, split.positions, split.indices, vertexLinks(split.indices, relaxed.length / 3), split.fresh, medianEdge(relaxed, split.indices));
    const easedScore = foldScore(eased, split.indices);
    const relaxedScore = foldScore(relaxed, split.indices);
    const relaxedHold = surfaceHolds(split.rest, relaxed, split.indices, split.fresh);
    const candidate = relaxedScore < easedScore - 0.01 && !relaxedHold ? relaxed : eased;
    const hold = surfaceHolds(split.rest, candidate, split.indices, split.fresh);
    const after = foldScore(candidate, split.indices);
    if (hold) break;
    if (after > before - 0.04) break;
    positions = candidate;
    indices = split.indices;
    rest = split.rest;
    changed = true;
    if (after < 0.72) break;
  }
  if (!changed || !rest) return null;
  return { positions, rest, indices, triangles: indices.length / 3 };
}

function splitSharpEdges(positions: Float32Array, indices: Uint32Array) {
  const faces = new Map<string, number[]>();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (new Set(ids).size < 3) continue;
    for (let edge = 0; edge < 3; edge += 1) {
      const key = edgeKey(ids[edge], ids[(edge + 1) % 3]);
      const list = faces.get(key);
      if (list) list.push(triangle / 3);
      else faces.set(key, [triangle / 3]);
    }
  }
  const normals = faceNormalList(positions, indices);
  const marked: string[] = [];
  faces.forEach((list, key) => {
    if (list.length !== 2) return;
    const dot = Math.abs(vecDot(normals[list[0]], normals[list[1]]));
    if (1 - dot >= FOLD) marked.push(key);
  });
  if (marked.length < 4) return null;
  const sharp = new Set(marked);
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    const keys = [edgeKey(ids[0], ids[1]), edgeKey(ids[1], ids[2]), edgeKey(ids[2], ids[0])];
    if (!keys.some((key) => sharp.has(key))) continue;
    keys.forEach((key) => marked.push(key));
  }
  const region = [...new Set(marked)];
  const next = Array.from(positions);
  const mids = new Map<string, number>();
  const fresh = new Set<number>();
  const wings = new Map<number, { ends: [number, number]; wings: [number, number] }>();
  region.forEach((key) => {
    const [a, b] = key.split(":").map(Number);
    const id = next.length / 3;
    next.push(
      (positions[a * 3] + positions[b * 3]) / 2,
      (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2,
      (positions[a * 3 + 2] + positions[b * 3 + 2]) / 2,
    );
    mids.set(key, id);
    if (!sharp.has(key)) return;
    fresh.add(id);
    const [left, right] = faces.get(key) ?? [];
    const wing = (face: number) => {
      const base = face * 3;
      const ids = [indices[base], indices[base + 1], indices[base + 2]];
      return ids.find((vertex) => vertex !== a && vertex !== b) ?? a;
    };
    wings.set(id, { ends: [a, b], wings: [wing(left), wing(right)] });
  });
  const rebuilt = rebuild(indices, mids);
  if (!rebuilt) return null;
  const rest = Float32Array.from(next);
  return { positions: rest.slice(), rest, indices: rebuilt, fresh, wings };
}

function rebuild(indices: Uint32Array, mids: Map<string, number>) {
  const out: number[] = [];
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = indices[triangle];
    const b = indices[triangle + 1];
    const c = indices[triangle + 2];
    const ab = mids.get(edgeKey(a, b));
    const bc = mids.get(edgeKey(b, c));
    const ca = mids.get(edgeKey(c, a));
    const count = (ab == null ? 0 : 1) + (bc == null ? 0 : 1) + (ca == null ? 0 : 1);
    if (count === 0) out.push(a, b, c);
    else if (count === 3) out.push(a, ab!, ca!, b, bc!, ab!, c, ca!, bc!, ab!, bc!, ca!);
    else if (count === 1) {
      if (ab != null) out.push(a, ab, c, ab, b, c);
      else if (bc != null) out.push(a, b, bc, a, bc, c);
      else out.push(a, b, ca!, ca!, b, c);
    } else if (ab != null && bc != null) out.push(a, ab, c, b, bc, ab, ab, bc, c);
    else if (bc != null && ca != null) out.push(b, bc, a, c, ca, bc, bc, ca, a);
    else out.push(c, ca!, b, a, ab!, ca!, ca!, ab!, b);
  }
  const used = new Set<string>();
  for (let triangle = 0; triangle < out.length; triangle += 3) {
    const ids = [out[triangle], out[triangle + 1], out[triangle + 2]];
    if (new Set(ids).size < 3) return null;
    for (let edge = 0; edge < 3; edge += 1) used.add(edgeKey(ids[edge], ids[(edge + 1) % 3]));
  }
  for (const key of mids.keys()) {
    if (used.has(key)) return null;
  }
  const counts = new Map<string, number>();
  used.forEach((key) => counts.set(key, 0));
  for (let triangle = 0; triangle < out.length; triangle += 3) {
    const ids = [out[triangle], out[triangle + 1], out[triangle + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const key = edgeKey(ids[edge], ids[(edge + 1) % 3]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const count of counts.values()) {
    if (count < 1 || count > 2) return null;
  }
  return Uint32Array.from(out);
}

function easeNewVertices(positions: Float32Array, indices: Uint32Array, fresh: Set<number>, wings: Map<number, { ends: [number, number]; wings: [number, number] }>) {
  const next = new Float32Array(positions);
  const pitch = medianEdge(next, indices);
  const center = meshCenter(positions);
  for (let pass = 0; pass < 5; pass += 1) {
    const order = [...fresh].sort((a, b) => vertexFold(next, indices, b) - vertexFold(next, indices, a));
    order.forEach((index) => {
      const pair = wings.get(index);
      if (!pair) return;
      const fold = vertexFold(next, indices, index);
      if (fold < 0.5) return;
      const origin = at(next, index);
      const hinge = norm(sub(at(next, pair.ends[1]), at(next, pair.ends[0])));
      const between = mul(add(at(next, pair.wings[0]), at(next, pair.wings[1])), 0.5);
      let across = sub(between, origin);
      across = sub(across, mul(hinge, vecDot(across, hinge)));
      const incident = incidentNormals(next, indices, index);
      const distinct = distinctNormals(incident);
      if (distinct.length < 2) return;
      let delta = norm(add(distinct[0], distinct[1]));
      if (Math.hypot(delta.x, delta.y, delta.z) < 0.2) delta = norm(sub(distinct[0], distinct[1]));
      if (vecDot(delta, across) < 0) delta = mul(delta, -1);
      if (Math.hypot(across.x, across.y, across.z) < 1e-4 && vecDot(delta, sub(origin, center)) > 0) delta = mul(delta, -1);
      const span = distance(at(next, pair.ends[0]), at(next, pair.ends[1]));
      delta = mul(norm(delta), Math.max(span, pitch));
      const accepted = acceptMove(next, positions, indices, index, delta, fold, [0.12, 0.22, 0.34, 0.46], span * 0.46);
      if (accepted) set(next, index, accepted);
    });
  }
  insetCorners(next, positions, indices, fresh, pitch);
  return next;
}

function insetCorners(positions: Float32Array, rest: Float32Array, indices: Uint32Array, fresh: Set<number>, pitch: number) {
  const count = positions.length / 3;
  const links = vertexLinks(indices, count);
  const pinned = boundaryVertices(indices);
  for (let pass = 0; pass < 6; pass += 1) {
    const order = [...Array(count).keys()].filter((index) => !fresh.has(index) && !pinned.has(index));
    order.sort((a, b) => vertexFold(positions, indices, b) - vertexFold(positions, indices, a));
    order.forEach((index) => {
      const fold = vertexFold(positions, indices, index);
      if (fold < 0.62) return;
      const around = (links[index] ?? []).filter((other) => fresh.has(other));
      if (around.length < 2) return;
      let ax = 0;
      let ay = 0;
      let az = 0;
      around.forEach((other) => {
        ax += positions[other * 3];
        ay += positions[other * 3 + 1];
        az += positions[other * 3 + 2];
      });
      const delta = sub({ x: ax / around.length, y: ay / around.length, z: az / around.length }, at(positions, index));
      const accepted = acceptMove(positions, rest, indices, index, delta, fold, [0.35, 0.6, 0.85], pitch * 0.55);
      if (accepted) set(positions, index, accepted);
    });
  }
}

function acceptMove(positions: Float32Array, rest: Float32Array, indices: Uint32Array, index: number, delta: Vec, fold: number, scales: number[], cap: number) {
  let best: Vec | null = null;
  let bestFold = fold;
  scales.forEach((scale) => {
    let candidate = add(at(positions, index), mul(delta, scale));
    const drift = sub(candidate, at(rest, index));
    const length = Math.hypot(drift.x, drift.y, drift.z);
    if (length > cap) candidate = add(at(rest, index), mul(norm(drift), cap));
    const saved = at(positions, index);
    const beforeNormals = incidentNormals(positions, indices, index);
    set(positions, index, candidate);
    const flipped = incidentNormals(positions, indices, index).some((normal, face) => {
      const previous = beforeNormals[face];
      return !previous || vecDot(normal, previous) < 0.15;
    });
    const opened = vertexFold(positions, indices, index);
    const hit = flipped || opened > bestFold - 0.02 || introducesHit(rest, positions, indices, index);
    set(positions, index, saved);
    if (!hit) {
      bestFold = opened;
      best = candidate;
    }
  });
  return best;
}

function introducesHit(rest: Float32Array, positions: Float32Array, indices: Uint32Array, index: number) {
  const mine: number[][] = [];
  const others: number[][] = [];
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (ids.includes(index)) mine.push(ids);
    else others.push(ids);
  }
  return mine.some((left) => others.some((right) => {
    if (sharesVertex(left, right)) return false;
    if (!boxesOverlap(triBox(positions, left), triBox(positions, right))) return false;
    return pairHits(positions, left, right) && !pairHits(rest, left, right);
  }));
}

function boundaryVertices(indices: Uint32Array) {
  const counts = new Map<string, number>();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const key = edgeKey(ids[edge], ids[(edge + 1) % 3]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const pinned = new Set<number>();
  counts.forEach((faces, key) => {
    if (faces !== 1) return;
    key.split(":").forEach((id) => pinned.add(Number(id)));
  });
  return pinned;
}

function distinctNormals(normals: Vec[]) {
  const found: Vec[] = [];
  normals.forEach((normal) => {
    if (Math.hypot(normal.x, normal.y, normal.z) < 1e-6) return;
    if (found.some((other) => vecDot(other, normal) > 0.85)) return;
    found.push(normal);
  });
  return found;
}

function meshCenter(positions: Float32Array) {
  const count = positions.length / 3;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < count; index += 1) {
    x += positions[index * 3];
    y += positions[index * 3 + 1];
    z += positions[index * 3 + 2];
  }
  return { x: x / count, y: y / count, z: z / count };
}

function incidentNormals(positions: Float32Array, indices: Uint32Array, index: number) {
  const normals: Vec[] = [];
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (!ids.includes(index)) continue;
    normals.push(triNormal(positions, ids));
  }
  return normals;
}

function relaxFalloff(positions: Float32Array, origin: Float32Array, indices: Uint32Array, links: number[][], fresh: Set<number>, pitch: number) {
  const pinned = boundaryVertices(indices);
  const weight = new Float32Array(positions.length / 3);
  fresh.forEach((index) => {
    weight[index] = 0.55;
    links[index]?.forEach((other) => {
      if (!fresh.has(other)) weight[other] = Math.max(weight[other], 0.18);
    });
  });
  for (let pass = 0; pass < 4; pass += 1) {
    const coeff = pass % 2 === 0 ? 0.42 : -0.44;
    const next = new Float32Array(positions);
    for (let index = 0; index < weight.length; index += 1) {
      if (weight[index] <= 0 || pinned.has(index)) continue;
      const around = links[index];
      if (!around || around.length < 2) continue;
      let ax = 0;
      let ay = 0;
      let az = 0;
      around.forEach((other) => {
        ax += positions[other * 3];
        ay += positions[other * 3 + 1];
        az += positions[other * 3 + 2];
      });
      const gain = coeff * weight[index];
      let dx = (ax / around.length - positions[index * 3]) * gain;
      let dy = (ay / around.length - positions[index * 3 + 1]) * gain;
      let dz = (az / around.length - positions[index * 3 + 2]) * gain;
      const step = Math.hypot(dx, dy, dz);
      const stepCap = pitch * 0.22;
      if (step > stepCap) {
        const scale = stepCap / step;
        dx *= scale;
        dy *= scale;
        dz *= scale;
      }
      const ox = positions[index * 3] + dx - origin[index * 3];
      const oy = positions[index * 3 + 1] + dy - origin[index * 3 + 1];
      const oz = positions[index * 3 + 2] + dz - origin[index * 3 + 2];
      const total = Math.hypot(ox, oy, oz);
      const cap = fresh.has(index) ? pitch * 0.9 : pitch * 0.28;
      const limited = total > cap ? cap / total : 1;
      next[index * 3] = origin[index * 3] + ox * limited;
      next[index * 3 + 1] = origin[index * 3 + 1] + oy * limited;
      next[index * 3 + 2] = origin[index * 3 + 2] + oz * limited;
    }
    positions.set(next);
  }
}

function surfaceHolds(rest: Float32Array, positions: Float32Array, indices: Uint32Array, fresh: Set<number>) {
  if (!manifold(indices)) return "manifold";
  const degenerate = degenerateRatio(positions, indices);
  if (degenerate > 0.02) return `degenerate ${degenerate.toFixed(3)}`;
  if (intersects(rest, positions, indices, fresh)) return "intersection";
  const before = bounds(rest);
  const after = bounds(positions);
  for (const key of ["x", "y", "z"] as const) {
    const span = before.max[key] - before.min[key];
    const next = after.max[key] - after.min[key];
    if (span > 1e-4 && (next > span * 1.04 || next < span * 0.72)) return `bounds ${key} ${span.toFixed(2)}->${next.toFixed(2)}`;
  }
  return null;
}

function intersects(rest: Float32Array, positions: Float32Array, indices: Uint32Array, fresh: Set<number>) {
  const triangles: number[][] = [];
  const boxes: { min: Vec; max: Vec }[] = [];
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (!ids.some((id) => fresh.has(id))) continue;
    triangles.push(ids);
    boxes.push(triBox(positions, ids));
  }
  for (let i = 0; i < triangles.length; i += 1) {
    for (let j = i + 1; j < triangles.length; j += 1) {
      if (sharesVertex(triangles[i], triangles[j])) continue;
      if (!boxesOverlap(boxes[i], boxes[j])) continue;
      if (!pairHits(positions, triangles[i], triangles[j])) continue;
      if (pairHits(rest, triangles[i], triangles[j])) continue;
      return true;
    }
  }
  return false;
}

function pairHits(positions: Float32Array, left: number[], right: number[]) {
  for (let edge = 0; edge < 3; edge += 1) {
    if (segmentHitsTriangle(at(positions, left[edge]), at(positions, left[(edge + 1) % 3]), right.map((id) => at(positions, id)))) return true;
    if (segmentHitsTriangle(at(positions, right[edge]), at(positions, right[(edge + 1) % 3]), left.map((id) => at(positions, id)))) return true;
  }
  return false;
}

function segmentHitsTriangle(start: Vec, end: Vec, corners: Vec[]) {
  const direction = sub(end, start);
  const edge1 = sub(corners[1], corners[0]);
  const edge2 = sub(corners[2], corners[0]);
  const pvec = cross(direction, edge2);
  const det = vecDot(edge1, pvec);
  if (Math.abs(det) < 1e-8) return false;
  const inverse = 1 / det;
  const tvec = sub(start, corners[0]);
  const u = vecDot(tvec, pvec) * inverse;
  if (u < -1e-4 || u > 1.0001) return false;
  const qvec = cross(tvec, edge1);
  const v = vecDot(direction, qvec) * inverse;
  if (v < -1e-4 || u + v > 1.0001) return false;
  const t = vecDot(edge2, qvec) * inverse;
  return t > 0.04 && t < 0.96;
}

function vertexFold(positions: Float32Array, indices: Uint32Array, index: number) {
  let worst = 0;
  const faces: { key: string; normal: Vec }[] = [];
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (!ids.includes(index)) continue;
    const normal = triNormal(positions, ids);
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge];
      const b = ids[(edge + 1) % 3];
      if (a !== index && b !== index) continue;
      faces.push({ key: edgeKey(a, b), normal });
    }
  }
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) {
      if (faces[i].key !== faces[j].key) continue;
      worst = Math.max(worst, 1 - Math.abs(vecDot(faces[i].normal, faces[j].normal)));
    }
  }
  return worst;
}

function vertexCrease(positions: Float32Array, indices: Uint32Array) {
  const crease = new Float32Array(positions.length / 3);
  const faces = new Map<string, Vec[]>();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (new Set(ids).size < 3) continue;
    const normal = triNormal(positions, ids);
    if (Math.hypot(normal.x, normal.y, normal.z) < 1e-8) continue;
    for (let edge = 0; edge < 3; edge += 1) {
      const key = edgeKey(ids[edge], ids[(edge + 1) % 3]);
      const list = faces.get(key);
      if (list) list.push(normal);
      else faces.set(key, [normal]);
    }
  }
  faces.forEach((list, key) => {
    if (list.length < 2) return;
    const value = 1 - Math.abs(vecDot(list[0], list[1]));
    key.split(":").forEach((id) => {
      const index = Number(id);
      if (value > crease[index]) crease[index] = value;
    });
  });
  return crease;
}

export function settleRemainingCreases(positions: Float32Array, indices: Uint32Array): { positions: Float32Array; indices: Uint32Array; rest?: Float32Array } | null {
  let next = new Float32Array(positions);
  let faces = indices;
  let rest: Float32Array | undefined;
  const pinned = boundaryVertices(indices);
  let score = foldScore(next, faces);
  if (score < 0.72) return null;
  let changed = false;
  for (let pass = 0; pass < 4; pass += 1) {
    const order = [...vertexCrease(next, faces)]
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.value >= 0.72 && !pinned.has(entry.index))
      .sort((a, b) => b.value - a.value)
      .slice(0, 16);
    order.forEach((entry) => {
      const fold = vertexFold(next, faces, entry.index);
      if (fold < 0.72) return;
      const step = relieveVertex(next, faces, entry.index, fold);
      if (!step) return;
      const saved = at(next, entry.index);
      const before = score;
      set(next, entry.index, step);
      const after = foldScore(next, faces);
      if (after > before - 0.004) {
        set(next, entry.index, saved);
        return;
      }
      score = after;
      changed = true;
    });
    if (score < 0.72) break;
  }
  for (let split = 0; split < 10 && score >= 0.72; split += 1) {
    const opened = splitWorstFold(next, faces);
    if (!opened) break;
    next = new Float32Array(opened.positions);
    faces = opened.indices;
    rest = opened.rest;
    score = foldScore(next, faces);
    changed = true;
  }
  return changed ? { positions: next, indices: faces, rest } : null;
}

function splitWorstFold(positions: Float32Array, indices: Uint32Array): { positions: Float32Array; indices: Uint32Array; rest: Float32Array } | null {
  const faces = new Map<string, number[]>();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (new Set(ids).size < 3) continue;
    for (let edge = 0; edge < 3; edge += 1) {
      const key = edgeKey(ids[edge], ids[(edge + 1) % 3]);
      const list = faces.get(key);
      if (list) list.push(triangle / 3);
      else faces.set(key, [triangle / 3]);
    }
  }
  const normals = faceNormalList(positions, indices);
  let worst = 0.72;
  let key = "";
  faces.forEach((list, edge) => {
    if (list.length !== 2) return;
    const crease = 1 - Math.abs(vecDot(normals[list[0]], normals[list[1]]));
    if (crease > worst) {
      worst = crease;
      key = edge;
    }
  });
  if (!key) return null;
  const [a, b] = key.split(":").map(Number);
  const id = positions.length / 3;
  const grown = Array.from(positions);
  grown.push(
    (positions[a * 3] + positions[b * 3]) / 2,
    (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2,
    (positions[a * 3 + 2] + positions[b * 3 + 2]) / 2,
  );
  const rebuilt = rebuild(indices, new Map([[key, id]]));
  if (!rebuilt) return null;
  const rest = Float32Array.from(grown);
  const moved = new Float32Array(rest);
  const fold = vertexFold(moved, rebuilt, id);
  const step = relieveVertex(moved, rebuilt, id, fold);
  if (step) set(moved, id, step);
  if (foldScore(moved, rebuilt) > foldScore(positions, indices) - 0.008) return null;
  return { positions: moved, indices: rebuilt, rest };
}

function relieveVertex(positions: Float32Array, indices: Uint32Array, index: number, fold: number) {
  const origin = at(positions, index);
  const incident = incidentNormals(positions, indices, index);
  const distinct = distinctNormals(incident);
  if (distinct.length < 2) return null;
  let direction = norm(add(distinct[0], distinct[1]));
  if (Math.hypot(direction.x, direction.y, direction.z) < 0.2) direction = norm(sub(distinct[0], distinct[1]));
  const center = meshCenter(positions);
  if (vecDot(direction, sub(origin, center)) > 0) direction = mul(direction, -1);
  const reach = Math.max(medianEdge(positions, indices), sharpestSpan(positions, indices, index));
  const inward = smallestClear(positions, indices, index, origin, direction, reach, fold);
  if (inward) return inward;
  return smallestClear(positions, indices, index, origin, mul(direction, -1), reach * 0.35, fold);
}

function smallestClear(positions: Float32Array, indices: Uint32Array, index: number, origin: Vec, direction: Vec, reach: number, fold: number) {
  const scales = [0.05, 0.1, 0.16, 0.24, 0.34, 0.46, 0.6, 0.78];
  let improved: Vec | null = null;
  for (const scale of scales) {
    const candidate = add(origin, mul(direction, reach * scale));
    const saved = at(positions, index);
    const beforeNormals = incidentNormals(positions, indices, index);
    set(positions, index, candidate);
    const flipped = incidentNormals(positions, indices, index).some((normal, face) => {
      const previous = beforeNormals[face];
      return !previous || vecDot(normal, previous) < 0.12;
    });
    const opened = vertexFold(positions, indices, index);
    set(positions, index, saved);
    if (flipped || opened > fold - 0.03) continue;
    if (!improved) improved = candidate;
    if (opened < 0.72) return candidate;
  }
  return improved;
}

function sharpestSpan(positions: Float32Array, indices: Uint32Array, index: number) {
  let span = 0;
  const seen = new Set<string>();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (!ids.includes(index)) continue;
    ids.forEach((other) => {
      if (other === index) return;
      const key = edgeKey(index, other);
      if (seen.has(key)) return;
      seen.add(key);
      span = Math.max(span, distance(at(positions, index), at(positions, other)));
    });
  }
  return span;
}

/**
 * Opens edges that are still folded, a small step at a time, and stops at the
 * first step that clears them. Only vertices on a sharp edge move, and open
 * ends stay pinned.
 */
export function easeRidges(positions: Float32Array, indices: Uint32Array, scale = 0.22): Float32Array | null {
  let next = positions;
  let score = foldScore(next, indices);
  if (score < 0.72) return null;
  let changed = false;
  for (let pass = 0; pass < 8; pass += 1) {
    const moved = bevelOnce(next, indices, scale);
    if (!moved) break;
    const after = foldScore(moved, indices);
    if (after > score - 0.008) break;
    if (degenerateRatio(moved, indices) > degenerateRatio(next, indices) + 0.02) break;
    next = moved;
    score = after;
    changed = true;
    if (score < 0.72) break;
  }
  return changed ? next : null;
}

function bevelOnce(positions: Float32Array, indices: Uint32Array, scale: number): Float32Array | null {
  const faces = new Map<string, number[]>();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (new Set(ids).size < 3) continue;
    for (let edge = 0; edge < 3; edge += 1) {
      const key = edgeKey(ids[edge], ids[(edge + 1) % 3]);
      const list = faces.get(key);
      if (list) list.push(triangle / 3);
      else faces.set(key, [triangle / 3]);
    }
  }
  const normals = faceNormalList(positions, indices);
  const pinned = boundaryVertices(indices);
  const delta = new Float32Array(positions.length);
  const weight = new Float32Array(positions.length / 3);
  let edges = 0;
  faces.forEach((list, key) => {
    if (list.length !== 2) return;
    const crease = 1 - Math.abs(vecDot(normals[list[0]], normals[list[1]]));
    if (crease < 0.72) return;
    const [a, b] = key.split(":").map(Number);
    if (pinned.has(a) && pinned.has(b)) return;
    const hinge = norm(sub(at(positions, b), at(positions, a)));
    const wing = (face: number) => {
      const base = face * 3;
      const ids = [indices[base], indices[base + 1], indices[base + 2]];
      return ids.find((vertex) => vertex !== a && vertex !== b) ?? a;
    };
    const left = wing(list[0]);
    const right = wing(list[1]);
    const mid = mul(add(at(positions, a), at(positions, b)), 0.5);
    let across = sub(mul(add(at(positions, left), at(positions, right)), 0.5), mid);
    across = sub(across, mul(hinge, vecDot(across, hinge)));
    const acrossLength = Math.hypot(across.x, across.y, across.z);
    if (acrossLength < 1e-5) return;
    const span = distance(at(positions, a), at(positions, b));
    const altitude = (face: number) => {
      const base = face * 3;
      const ids = [indices[base], indices[base + 1], indices[base + 2]];
        const wide = cross(sub(at(positions, ids[1]), at(positions, ids[0])), sub(at(positions, ids[2]), at(positions, ids[0])));
      const area = Math.hypot(wide.x, wide.y, wide.z);
      return span > 1e-5 ? area / span : 0;
    };
    const rise = Math.max(Math.min(altitude(list[0]), altitude(list[1])), span * 0.15);
    const step = mul(norm(across), rise * scale);
    [a, b].forEach((index) => {
      if (pinned.has(index)) return;
      delta[index * 3] += step.x;
      delta[index * 3 + 1] += step.y;
      delta[index * 3 + 2] += step.z;
      weight[index] += 1;
    });
    edges += 1;
  });
  if (edges === 0) return null;
  const next = new Float32Array(positions);
  for (let index = 0; index < weight.length; index += 1) {
    if (weight[index] <= 0) continue;
    next[index * 3] += delta[index * 3] / weight[index];
    next[index * 3 + 1] += delta[index * 3 + 1] / weight[index];
    next[index * 3 + 2] += delta[index * 3 + 2] / weight[index];
  }
  return next;
}

export function foldScore(positions: Float32Array, indices: Uint32Array) {
  const crease = vertexCrease(positions, indices);
  const sharp: number[] = [];
  crease.forEach((value) => {
    if (value >= 0.5) sharp.push(value);
  });
  if (sharp.length < 4) return 0;
  sharp.sort((a, b) => a - b);
  const sample = sharp.slice(-Math.max(4, Math.floor(sharp.length * 0.2)));
  return sample.reduce((sum, value) => sum + value, 0) / sample.length;
}

function faceNormalList(positions: Float32Array, indices: Uint32Array) {
  const normals: Vec[] = [];
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    normals.push(triNormal(positions, [indices[triangle], indices[triangle + 1], indices[triangle + 2]]));
  }
  return normals;
}

function triNormal(positions: Float32Array, ids: number[]) {
  return norm(cross(sub(at(positions, ids[1]), at(positions, ids[0])), sub(at(positions, ids[2]), at(positions, ids[0]))));
}

function vertexLinks(indices: Uint32Array, count: number) {
  const links: number[][] = Array.from({ length: count }, () => []);
  const seen = Array.from({ length: count }, () => new Set<number>());
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    ids.forEach((id) => {
      ids.forEach((other) => {
        if (other === id || seen[id].has(other)) return;
        seen[id].add(other);
        links[id].push(other);
      });
    });
  }
  return links;
}

function manifold(indices: Uint32Array) {
  const counts = new Map<string, number>();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    if (new Set(ids).size < 3) return false;
    for (let edge = 0; edge < 3; edge += 1) {
      const key = edgeKey(ids[edge], ids[(edge + 1) % 3]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const count of counts.values()) {
    if (count < 1 || count > 2) return false;
  }
  return true;
}

function degenerateRatio(positions: Float32Array, indices: Uint32Array) {
  let bad = 0;
  let samples = 0;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const normal = triNormal(positions, [indices[triangle], indices[triangle + 1], indices[triangle + 2]]);
    if (Math.hypot(normal.x, normal.y, normal.z) < 1e-8) bad += 1;
    samples += 1;
  }
  return samples > 0 ? bad / samples : 0;
}

function medianEdge(positions: Float32Array, indices: Uint32Array) {
  const edges: number[] = [];
  const limit = Math.min(indices.length, 2400);
  for (let triangle = 0; triangle < limit; triangle += 3) {
    edges.push(distance(at(positions, indices[triangle]), at(positions, indices[triangle + 1])));
  }
  edges.sort((a, b) => a - b);
  return Math.max(edges[Math.floor(edges.length / 2)] ?? 1, 1e-4);
}

function bounds(positions: Float32Array) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let index = 0; index < positions.length; index += 3) {
    min.x = Math.min(min.x, positions[index]);
    min.y = Math.min(min.y, positions[index + 1]);
    min.z = Math.min(min.z, positions[index + 2]);
    max.x = Math.max(max.x, positions[index]);
    max.y = Math.max(max.y, positions[index + 1]);
    max.z = Math.max(max.z, positions[index + 2]);
  }
  return { min, max };
}

function triBox(positions: Float32Array, ids: number[]) {
  const box = bounds(Float32Array.from(ids.flatMap((id) => [positions[id * 3], positions[id * 3 + 1], positions[id * 3 + 2]])));
  return box;
}

function boxesOverlap(left: { min: Vec; max: Vec }, right: { min: Vec; max: Vec }) {
  return left.min.x <= right.max.x && left.max.x >= right.min.x
    && left.min.y <= right.max.y && left.max.y >= right.min.y
    && left.min.z <= right.max.z && left.max.z >= right.min.z;
}

function sharesVertex(left: number[], right: number[]) {
  return left.some((id) => right.includes(id));
}

function edgeKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function at(positions: Float32Array, index: number): Vec {
  return { x: positions[index * 3], y: positions[index * 3 + 1], z: positions[index * 3 + 2] };
}

function set(positions: Float32Array, index: number, value: Vec) {
  positions[index * 3] = value.x;
  positions[index * 3 + 1] = value.y;
  positions[index * 3 + 2] = value.z;
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function mul(value: Vec, scale: number): Vec {
  return { x: value.x * scale, y: value.y * scale, z: value.z * scale };
}

function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function vecDot(a: Vec, b: Vec) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec, b: Vec): Vec {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function norm(value: Vec): Vec {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length < 1e-8) return { x: 0, y: 0, z: 0 };
  return mul(value, 1 / length);
}
