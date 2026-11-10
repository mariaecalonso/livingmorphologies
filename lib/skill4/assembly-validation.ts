import type { IsoMesh } from "../scan/isomesh";
import { HABITABLE_CLEARANCE } from "./architectural-integration";
import { easeRidges, refineSharpRegions, settleRemainingCreases } from "./assembly-refine";
import type { Vec3 } from "./contract";

export type ValidationMetrics = {
  continuity: number;
  junction: number;
  smoothness: number;
  integrity: number;
};

export type ValidationIssue = {
  x: number;
  y: number;
  z: number;
  weight: number;
};

export type SmoothedMesh = {
  source: IsoMesh;
  smoothed: IsoMesh;
  weights: Float32Array;
  issues: ValidationIssue[];
  /** Subdivided surface before the crease inset. Same indices as smoothed. */
  rest?: IsoMesh;
};

export type ValidationVerdict = "clear" | "corrected" | "unresolved";

export type AssemblyValidation = {
  meshes: SmoothedMesh[];
  before: ValidationMetrics;
  after: ValidationMetrics;
  verdict: ValidationVerdict;
  note: string;
  displacement: number;
};

export type ValidationOptions = {
  /** Widen for a person only when the connection is already marked for circulation. */
  circulation?: boolean;
};

const SLICES = 12;
const TWIST_LIMIT = 0.7;
const PINCH_RATIO = 0.45;
const BUMP_RATIO = 0.58;
const KINK_LIMIT = 2.4;
const SPIKE_RATIO = 2.5;
const MOVE_FRACTION = 0.5;
const END_DRIFT = 1e-4;

type Slice = {
  ids: number[];
  center: Vec3;
  median: number;
  angle: number;
  aspect: number;
  round: boolean;
};

type Frame = {
  origin: Vec3;
  dir: Vec3;
  side: Vec3;
  up: Vec3;
  span: number;
};

type Defects = {
  twist: number;
  pinch: number;
  bump: number;
  kink: number;
  seam: number;
  gap: number;
  narrow: number;
  edge: number;
};

type MeshReport = {
  mesh: SmoothedMesh;
  before: ValidationMetrics;
  after: ValidationMetrics;
  verdict: ValidationVerdict;
  note: string;
  displacement: number;
};

export function validateMeshes(meshes: readonly IsoMesh[], options: ValidationOptions = {}): AssemblyValidation | null {
  const rows = meshes.map((mesh) => correctMesh(mesh, options.circulation === true)).filter((row): row is MeshReport => row != null);
  if (rows.length === 0) return null;
  const verdict = rows.some((row) => row.verdict === "unresolved")
    ? "unresolved"
    : rows.some((row) => row.verdict === "corrected")
      ? "corrected"
      : "clear";
  return {
    meshes: rows.map((row) => row.mesh),
    before: averageMetrics(rows.map((row) => row.before)),
    after: averageMetrics(rows.map((row) => row.after)),
    verdict,
    note: rows.map((row) => row.note).filter(Boolean).join(" "),
    displacement: Math.max(...rows.map((row) => row.displacement)),
  };
}

export function revealSmooth(item: SmoothedMesh, amount: number): IsoMesh {
  const blend = clamp(amount, 0, 1);
  if (blend <= 0) return item.source;
  if (item.rest && item.rest.positions.length === item.smoothed.positions.length) {
    if (blend >= 1) return item.smoothed;
    const positions = new Float32Array(item.rest.positions);
    const target = item.smoothed.positions;
    for (let index = 0; index < positions.length; index += 1) {
      positions[index] += (target[index] - positions[index]) * blend;
    }
    return {
      positions,
      normals: faceNormals(positions, item.smoothed.indices),
      indices: item.smoothed.indices,
      triangles: item.smoothed.triangles,
    };
  }
  if (blend >= 1) return item.smoothed;
  const positions = new Float32Array(item.source.positions);
  for (let index = 0; index < item.weights.length; index += 1) {
    const weight = item.weights[index] * blend;
    if (weight <= 0) continue;
    const offset = index * 3;
    positions[offset] += (item.smoothed.positions[offset] - positions[offset]) * weight;
    positions[offset + 1] += (item.smoothed.positions[offset + 1] - positions[offset + 1]) * weight;
    positions[offset + 2] += (item.smoothed.positions[offset + 2] - positions[offset + 2]) * weight;
  }
  return {
    positions,
    normals: faceNormals(positions, item.source.indices),
    indices: item.source.indices,
    triangles: item.source.triangles,
  };
}

function correctMesh(mesh: IsoMesh, circulation: boolean): MeshReport | null {
  const count = mesh.positions.length / 3;
  if (count < 12 || mesh.triangles < 4) return null;
  const source = new Float32Array(mesh.positions);
  const frame = principalFrame(source, count);
  if (!frame) return null;
  const beforeDefects = readDefects(source, count, frame, mesh.indices);
  const before = metricsOf(beforeDefects, degenerateRatio(mesh));
  let next = new Float32Array(source);
  const notes: string[] = [];

  if (beforeDefects.gap > 0) notes.push("A gap in the connection was left in place.");
  if (!circulation && beforeDefects.narrow > 0) {
    notes.push("Possible constriction. Circulation is not identified, so this passage was not enlarged.");
  }

  const geometric = hasGeometricDefect(beforeDefects);
  if (geometric) {
    keepPass(next, count, frame, mesh.indices, beforeDefects, "twist", () => applyTwist(next, count, frame));
    keepPass(next, count, frame, mesh.indices, beforeDefects, "pinch", () => applyPinch(next, count, frame));
    keepPass(next, count, frame, mesh.indices, beforeDefects, "bump", () => applyBumps(next, mesh.indices));
    keepPass(next, count, frame, mesh.indices, beforeDefects, "kink", () => applyKinks(next, count, frame));
    pinEnds(next, source, count, frame);
    limitDrift(next, source, count, frame);
    pinEnds(next, source, count, frame);
    keepPass(next, count, frame, mesh.indices, beforeDefects, "edge", () => roundSharpEdges(next, mesh.indices));
  }

  if (circulation && beforeDefects.narrow > 0) {
    let opened = false;
    for (let pass = 0; pass < 4 && readDefects(next, count, frame, mesh.indices).narrow > 0; pass += 1) {
      opened = applyClearance(next, count, frame);
      pinEnds(next, source, count, frame);
      limitDrift(next, source, count, frame);
      pinEnds(next, source, count, frame);
    }
    if (!opened || readDefects(next, count, frame, mesh.indices).narrow > 0) {
      notes.push("The passage is still below the existing clearance and was not forced open.");
    }
  }

  const afterDefects = readDefects(next, count, frame, mesh.indices);
  const after = metricsOf(afterDefects, degenerateRatio({ ...mesh, positions: next }));
  if (score(after) < score(before) + 0.01 || regressed(afterDefects, beforeDefects)) restore(next, source);

  let indices = mesh.indices;
  let rest: IsoMesh | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentDefects = readDefects(next, next.length / 3, frame, indices);
    if (currentDefects.edge < 0.72) break;
    const beforeEdge = currentDefects.edge;
    const refined = refineSharpRegions({ positions: next, normals: mesh.normals, indices, triangles: indices.length / 3 });
    if (refined) {
      const refinedDefects = readDefects(refined.positions, refined.positions.length / 3, frame, refined.indices);
      if (refinementHelps(refinedDefects, currentDefects) && refinedDefects.edge < beforeEdge - 0.012) {
        next = new Float32Array(refined.positions);
        indices = refined.indices;
        rest = {
          positions: refined.rest,
          normals: faceNormals(refined.rest, refined.indices),
          indices: refined.indices,
          triangles: refined.triangles,
        };
      }
    }
    const eased = new Float32Array(next);
    roundSharpEdges(eased, indices);
    const easedDefects = readDefects(eased, eased.length / 3, frame, indices);
    const held = readDefects(next, next.length / 3, frame, indices);
    if (refinementHelps(easedDefects, held) && easedDefects.edge < held.edge - 0.012) next = eased;
    const settled = settleRemainingCreases(next, indices);
    if (settled) {
      const settledDefects = readDefects(settled.positions, settled.positions.length / 3, frame, settled.indices);
      const heldNow = readDefects(next, next.length / 3, frame, indices);
      if (refinementHelps(settledDefects, heldNow)) {
        next = new Float32Array(settled.positions);
        indices = settled.indices;
        if (settled.rest) {
          rest = {
            positions: settled.rest,
            normals: faceNormals(settled.rest, settled.indices),
            indices: settled.indices,
            triangles: settled.indices.length / 3,
          };
        }
      }
    }
    const ridged = easeRidges(next, indices);
    if (ridged) {
      const ridgeDefects = readDefects(ridged, ridged.length / 3, frame, indices);
      const heldRidge = readDefects(next, next.length / 3, frame, indices);
      if (refinementHelps(ridgeDefects, heldRidge) && ridgeDefects.edge < heldRidge.edge - 0.012) next = new Float32Array(ridged);
    }
    const afterEdge = readDefects(next, next.length / 3, frame, indices).edge;
    if (afterEdge > beforeEdge - 0.012) break;
  }
  const skipped = new Set<string>();
  for (let round = 0; round < 8; round += 1) {
    const open = readDefects(next, next.length / 3, frame, indices);
    if (!hasGeometricDefect(open)) break;
    const issue = open.edge >= 0.72 && !skipped.has("edge") ? "edge"
      : open.gap > 0 && !skipped.has("gap") ? "gap"
      : (open.kink >= KINK_LIMIT || open.seam >= KINK_LIMIT) && !skipped.has("kink") ? "kink"
      : open.twist >= TWIST_LIMIT && !skipped.has("twist") ? "twist"
      : open.pinch > 0.02 && !skipped.has("pinch") ? "pinch"
      : open.bump >= SPIKE_RATIO && !skipped.has("bump") ? "bump"
      : "";
    if (!issue) break;
    const snapshot = new Float32Array(next);
    const snapshotIndices = indices;
    const snapshotRest = rest;
    if (issue === "edge") {
      const settled = settleRemainingCreases(next, indices);
      if (settled) {
        next = new Float32Array(settled.positions);
        indices = settled.indices;
        if (settled.rest) {
          rest = {
            positions: settled.rest,
            normals: faceNormals(settled.rest, settled.indices),
            indices: settled.indices,
            triangles: settled.indices.length / 3,
          };
        }
      }
      const ridged = easeRidges(next, indices);
      if (ridged) next = new Float32Array(ridged);
    } else if (issue === "gap") closeGap(next, next.length / 3, frame);
    else if (issue === "kink") applyKinks(next, next.length / 3, frame);
    else if (issue === "twist") applyTwist(next, next.length / 3, frame);
    else if (issue === "pinch") applyPinch(next, next.length / 3, frame);
    else applyBumps(next, indices);
    const closed = readDefects(next, next.length / 3, frame, indices);
    if (!refinementHelps(closed, open)) {
      next = snapshot;
      indices = snapshotIndices;
      rest = snapshotRest;
      skipped.add(issue);
      continue;
    }
    skipped.clear();
  }

  if (readDefects(next, next.length / 3, frame, indices).edge >= 0.72) {
    const opened = openSharpRidges(source, mesh.indices, frame);
    if (opened) {
      const openedDefects = readDefects(opened, opened.length / 3, frame, mesh.indices);
      const held = readDefects(next, next.length / 3, frame, indices);
      if (openedDefects.edge < 0.72 && keepsCleared(openedDefects, held)) {
        next = new Float32Array(opened);
        indices = mesh.indices;
        rest = undefined;
      }
    }
  }

  const finalCount = next.length / 3;
  const finalDefects = readDefects(next, finalCount, frame, indices);
  const finalMove = rest ? refinementDrift(source, next, rest.positions) : maxDrift(source, next);
  const remaining = hasGeometricDefect(finalDefects) || (circulation && finalDefects.narrow > 0);
  let verdict: ValidationVerdict = "clear";
  if (!hasGeometricDefect(beforeDefects) && !(circulation && beforeDefects.narrow > 0)) verdict = "clear";
  else if (!remaining && finalMove > 1e-3) verdict = "corrected";
  else if (remaining) verdict = "unresolved";
  else verdict = finalMove > 1e-3 ? "corrected" : "clear";

  if (verdict === "unresolved") notes.unshift(failureNote(finalDefects, circulation, next, indices, frame));
  else if (verdict === "corrected" && beforeDefects.edge >= 0.72) notes.unshift(`Sharp edges rounded. Largest correction ${finalMove.toFixed(2)} cells.`);
  else if (verdict === "corrected") notes.unshift(`Largest correction ${finalMove.toFixed(2)} cells.`);

  const weights = new Float32Array(finalCount);
  const span = Math.max(frame.span, 1e-4);
  for (let index = 0; index < count; index += 1) {
    const drift = vertexDrift(source, next, index);
    weights[index] = drift > END_DRIFT ? clamp(drift / (span * 0.04), 0, 1) : 0;
  }
  if (rest) {
    for (let index = count; index < finalCount; index += 1) {
      const drift = vertexDrift(rest.positions, next, index);
      weights[index] = drift > END_DRIFT ? clamp(drift / (span * 0.04), 0, 1) : 0;
    }
  }
  const issues = issuePoints(source, count, frame, beforeDefects);
  if (beforeDefects.edge >= 0.72) {
    const crease = vertexCrease(source, mesh.indices);
    const ranked: { index: number; crease: number }[] = [];
    for (let index = 0; index < crease.length; index += 1) {
      if (crease[index] >= 0.72) ranked.push({ index, crease: crease[index] });
    }
    ranked.sort((a, b) => b.crease - a.crease);
    ranked.slice(0, 24).forEach((entry) => {
      issues.push({
        x: source[entry.index * 3],
        y: source[entry.index * 3 + 1],
        z: source[entry.index * 3 + 2],
        weight: entry.crease,
      });
    });
  }
  const smoothed: IsoMesh = {
    positions: next,
    normals: faceNormals(next, indices),
    indices,
    triangles: indices.length / 3,
  };
  return {
    mesh: {
      source: { positions: source, normals: mesh.normals, indices: mesh.indices, triangles: mesh.triangles },
      smoothed,
      weights,
      issues,
      rest,
    },
    before,
    after: verdict === "clear" && finalMove <= 1e-3 ? before : metricsOf(finalDefects, degenerateRatio(smoothed)),
    verdict,
    note: notes.filter(Boolean).join(" "),
    displacement: finalMove,
  };
}

function applyTwist(positions: Float32Array, count: number, frame: Frame) {
  for (let pass = 0; pass < 5; pass += 1) {
    const slices = usableSlices(sliceMesh(positions, count, frame));
    if (slices.length < 4) return;
    const angles = unwrap(slices.map((slice) => slice.angle));
    if (slices.filter((slice) => !slice.round).length < 4) return;
    let peak = 0;
    const deviation = slices.map((slice, index) => {
      if (!rigidSlice(slice, slices) || index === 0 || index === slices.length - 1) return 0;
      const target = lerp(angles[0], angles[angles.length - 1], index / (slices.length - 1));
      const value = Math.abs(angles[index] - target);
      peak = Math.max(peak, value);
      return angles[index] - target;
    });
    if (pass === 0 && peak < TWIST_LIMIT) return;
    if (peak < 0.32) return;
    slices.forEach((slice, index) => {
      if (Math.abs(deviation[index]) < 0.32) return;
      const turn = clamp(deviation[index], -0.5, 0.5);
      rotateSlice(positions, slice, frame, -turn * 0.6);
    });
  }
}

function applyPinch(positions: Float32Array, count: number, frame: Frame) {
  for (let pass = 0; pass < 2; pass += 1) {
    const slices = usableSlices(sliceMesh(positions, count, frame));
    let changed = false;
    slices.forEach((slice, index) => {
      if (index === 0 || index === slices.length - 1) return;
      const neighbors = (slices[index - 1].median + slices[index + 1].median) / 2;
      if (neighbors < 1e-4 || slice.median / neighbors >= PINCH_RATIO) return;
      const target = neighbors * 0.86;
      scaleSlice(positions, slice, frame, target, neighbors * MOVE_FRACTION);
      changed = true;
    });
    if (!changed) return;
  }
}

function applyBumps(positions: Float32Array, indices: Uint32Array) {
  for (let pass = 0; pass < 3; pass += 1) {
    const spikes = surfaceSpikes(positions, indices);
    if (spikes.worst < SPIKE_RATIO) return;
    let changed = false;
    spikes.points.forEach((spike) => {
      const offset = spike.id * 3;
      const pull = 0.55;
      positions[offset] += (spike.rest.x - positions[offset]) * pull;
      positions[offset + 1] += (spike.rest.y - positions[offset + 1]) * pull;
      positions[offset + 2] += (spike.rest.z - positions[offset + 2]) * pull;
      changed = true;
    });
    if (!changed) return;
  }
}

function keepPass(positions: Float32Array, count: number, frame: Frame, indices: Uint32Array, baseline: Defects, key: "twist" | "pinch" | "bump" | "kink" | "edge", pass: () => void) {
  const snapshot = new Float32Array(positions);
  const beforePass = readDefects(snapshot, count, frame, indices);
  pass();
  const after = readDefects(positions, count, frame, indices);
  const helped = after[key] < beforePass[key] - 0.02;
  if (!helped || regressed(after, baseline)) positions.set(snapshot);
}

function outliersOf(positions: Float32Array, slice: Slice, frame: Frame) {
  const polar = slice.ids.map((id) => {
    const radial = radialOf(positions, id, slice.center, frame);
    return { id, radial, angle: Math.atan2(radial.v, radial.u), radius: radial.length };
  }).sort((a, b) => a.angle - b.angle);
  return polar.flatMap((point, index) => {
    const previous = polar[(index - 1 + polar.length) % polar.length];
    const next = polar[(index + 1) % polar.length];
    const neighbor = (previous.radius + next.radius) / 2;
    const spread = Math.abs(previous.radius - next.radius) / Math.max(neighbor, 1e-4);
    const error = Math.abs(point.radius - neighbor) / Math.max(neighbor, 1e-4);
    return error >= BUMP_RATIO && spread <= 0.35 ? [{ ...point, neighbor }] : [];
  });
}

function applyKinks(positions: Float32Array, count: number, frame: Frame, strength = 1) {
  for (let pass = 0; pass < 6; pass += 1) {
    if (!easeOneKink(positions, count, frame, strength)) return;
  }
}

function easeOneKink(positions: Float32Array, count: number, frame: Frame, strength: number) {
  const slices = usableSlices(sliceMesh(positions, count, frame));
  if (slices.length < 4) return false;
  const bends = slices.map((slice, index) => index > 0 && index < slices.length - 1
    ? turnAngle(slices[index - 1].center, slice.center, slices[index + 1].center)
    : 0);
  let eased = false;
  for (let index = 1; index < slices.length - 1; index += 1) {
    const neighborBend = Math.max(bends[index - 1] ?? 0, bends[index + 1] ?? 0);
    if (bends[index] < KINK_LIMIT || bends[index] <= neighborBend + 0.45) continue;
    const prev = slices[index - 1].center;
    const current = slices[index].center;
    const next = slices[index + 1].center;
    const midpoint = {
      x: (prev.x + next.x) / 2,
      y: (prev.y + next.y) / 2,
      z: (prev.z + next.z) / 2,
    };
    const shift = {
      x: (midpoint.x - current.x) * 0.22 * strength,
      y: (midpoint.y - current.y) * 0.22 * strength,
      z: (midpoint.z - current.z) * 0.22 * strength,
    };
    const spacing = Math.hypot(next.x - prev.x, next.y - prev.y, next.z - prev.z);
    const length = Math.hypot(shift.x, shift.y, shift.z);
    const cap = spacing * 0.12 * strength;
    const scale = length > cap && length > 0 ? cap / length : 1;
    sliceTranslate(positions, slices[index], shift.x * scale, shift.y * scale, shift.z * scale);
    eased = true;
  }
  return eased;
}

function openSharpRidges(source: Float32Array, indices: Uint32Array, frame: Frame) {
  const opened = easeRidges(source, indices);
  if (!opened) return null;
  const count = opened.length / 3;
  const candidate = new Float32Array(opened);
  const beforeCenter = readDefects(candidate, count, frame, indices);
  if (beforeCenter.kink < KINK_LIMIT && beforeCenter.seam < KINK_LIMIT) return candidate;
  for (const strength of [1.1, 1.25, 1.4, 1.6]) {
    const trial = new Float32Array(opened);
    easeOneKink(trial, count, frame, strength);
    for (const scale of [0.35, 0.5, 0.7]) {
      const again = easeRidges(trial, indices, scale);
      const finalPositions = again ?? trial;
      const after = readDefects(finalPositions, count, frame, indices);
      if (after.edge < 0.72 && after.kink <= KINK_LIMIT && after.seam <= KINK_LIMIT && after.bump < SPIKE_RATIO && after.twist < TWIST_LIMIT && after.pinch <= 0.02 && after.gap <= 0) return finalPositions;
    }
  }
  return null;
}

function closeGap(positions: Float32Array, count: number, frame: Frame) {
  const slices = usableSlices(sliceMesh(positions, count, frame));
  if (slices.length < 3) return;
  const spacing = slices.slice(1).map((slice, index) => distance(slice.center, slices[index].center));
  const typical = median(spacing.filter((value) => value > 1e-5));
  if (typical <= 0) return;
  for (let index = 1; index < slices.length; index += 1) {
    const step = distance(slices[index].center, slices[index - 1].center);
    if (step <= typical * 2.6 && step >= typical * 0.28) continue;
    const previous = slices[index - 1].center;
    const current = slices[index].center;
    const following = slices[Math.min(slices.length - 1, index + 1)].center;
    const target = {
      x: (previous.x + following.x) / 2,
      y: (previous.y + following.y) / 2,
      z: (previous.z + following.z) / 2,
    };
    const shift = {
      x: (target.x - current.x) * 0.4,
      y: (target.y - current.y) * 0.4,
      z: (target.z - current.z) * 0.4,
    };
    const length = Math.hypot(shift.x, shift.y, shift.z);
    const cap = typical * 0.2;
    const scale = length > cap && length > 0 ? cap / length : 1;
    sliceTranslate(positions, slices[index], shift.x * scale, shift.y * scale, shift.z * scale);
    return;
  }
}

function applyClearance(positions: Float32Array, count: number, frame: Frame) {
  const slices = usableSlices(sliceMesh(positions, count, frame));
  const needed = HABITABLE_CLEARANCE.clearWidth / 2;
  let opened = true;
  slices.forEach((slice, index) => {
    if (index === 0 || index === slices.length - 1) return;
    if (slice.median * 2 >= HABITABLE_CLEARANCE.clearWidth) return;
    scaleSlice(positions, slice, frame, Math.max(slice.median, needed), Math.max(slice.median, needed) * MOVE_FRACTION);
    if (slice.median + Math.max(slice.median, needed) * MOVE_FRACTION < needed - 1e-3) opened = false;
  });
  return opened;
}

function pinEnds(positions: Float32Array, source: Float32Array, count: number, frame: Frame) {
  const slices = sliceMesh(source, count, frame);
  if (slices.length < 2) return;
  for (const slice of [slices[0], slices[slices.length - 1]]) {
    slice.ids.forEach((id) => {
      const offset = id * 3;
      positions[offset] = source[offset];
      positions[offset + 1] = source[offset + 1];
      positions[offset + 2] = source[offset + 2];
    });
  }
}

function limitDrift(positions: Float32Array, source: Float32Array, count: number, frame: Frame) {
  const slices = sliceMesh(source, count, frame);
  const cap = new Float32Array(count);
  slices.forEach((slice) => {
    const limit = Math.max(slice.median * 0.85, frame.span * 0.04);
    slice.ids.forEach((id) => {
      cap[id] = limit;
    });
  });
  for (let index = 0; index < count; index += 1) {
    const drift = vertexDrift(source, positions, index);
    const limit = cap[index] || frame.span * 0.04;
    if (drift <= limit || drift <= 0) continue;
    const scale = limit / drift;
    const offset = index * 3;
    positions[offset] = source[offset] + (positions[offset] - source[offset]) * scale;
    positions[offset + 1] = source[offset + 1] + (positions[offset + 1] - source[offset + 1]) * scale;
    positions[offset + 2] = source[offset + 2] + (positions[offset + 2] - source[offset + 2]) * scale;
  }
  const before = extent(source, count);
  const after = extent(positions, count);
  for (const key of ["x", "y", "z"] as const) {
    const original = before.max[key] - before.min[key];
    const changed = after.max[key] - after.min[key];
    if (original < 1e-4 || changed <= original * 1.08) continue;
    const pull = (original * 1.08) / changed;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3 + (key === "x" ? 0 : key === "y" ? 1 : 2);
      const center = (before.min[key] + before.max[key]) / 2;
      positions[offset] = center + (positions[offset] - center) * pull;
    }
  }
}

function surfaceSpikes(positions: Float32Array, indices: Uint32Array) {
  const count = positions.length / 3;
  const links = vertexLinks(indices, count);
  const edges: number[] = [];
  links.forEach((around, index) => {
    around.forEach((other) => {
      if (other < index) return;
      edges.push(Math.hypot(
        positions[other * 3] - positions[index * 3],
        positions[other * 3 + 1] - positions[index * 3 + 1],
        positions[other * 3 + 2] - positions[index * 3 + 2],
      ));
    });
  });
  const pitch = Math.max(median(edges), 1e-4);
  const points: { id: number; rest: Vec3 }[] = [];
  let worst = 0;
  for (let index = 0; index < count; index += 1) {
    const around = links[index];
    if (!around || around.length < 3) continue;
    let ax = 0;
    let ay = 0;
    let az = 0;
    around.forEach((other) => {
      ax += positions[other * 3];
      ay += positions[other * 3 + 1];
      az += positions[other * 3 + 2];
    });
    const rest = { x: ax / around.length, y: ay / around.length, z: az / around.length };
    const offset = Math.hypot(rest.x - positions[index * 3], rest.y - positions[index * 3 + 1], rest.z - positions[index * 3 + 2]);
    const ratio = offset / pitch;
    if (ratio > worst) worst = ratio;
    if (ratio >= SPIKE_RATIO) points.push({ id: index, rest });
  }
  return { worst, points };
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

function edgeScore(positions: Float32Array, indices: Uint32Array) {
  const crease = vertexCrease(positions, indices);
  const sharp: number[] = [];
  for (let index = 0; index < crease.length; index += 1) {
    if (crease[index] >= 0.5) sharp.push(crease[index]);
  }
  if (sharp.length < 4) return 0;
  sharp.sort((a, b) => a - b);
  const sample = sharp.slice(-Math.max(4, Math.floor(sharp.length * 0.2)));
  return sample.reduce((sum, value) => sum + value, 0) / sample.length;
}

function roundSharpEdges(positions: Float32Array, indices: Uint32Array) {
  if (edgeScore(positions, indices) < 0.72) return;
  const count = positions.length / 3;
  const pitch = edgePitch(positions, indices);
  const cap = pitch * 1.35;
  const origin = new Float32Array(positions);
  const links = vertexLinks(indices, count);
  for (let pass = 0; pass < 10; pass += 1) {
    const crease = vertexCrease(positions, indices);
    const next = new Float32Array(positions);
    for (let index = 0; index < count; index += 1) {
      const around = links[index];
      if (!around || around.length < 2 || crease[index] < 0.5) continue;
      let ax = 0;
      let ay = 0;
      let az = 0;
      around.forEach((other) => {
        ax += positions[other * 3];
        ay += positions[other * 3 + 1];
        az += positions[other * 3 + 2];
      });
      const gain = 0.24 + 0.4 * clamp((crease[index] - 0.5) / 0.45, 0, 1);
      let dx = (ax / around.length - positions[index * 3]) * gain;
      let dy = (ay / around.length - positions[index * 3 + 1]) * gain;
      let dz = (az / around.length - positions[index * 3 + 2]) * gain;
      const step = Math.hypot(dx, dy, dz);
      const stepCap = pitch * 0.32;
      if (step > stepCap && step > 0) {
        const scale = stepCap / step;
        dx *= scale;
        dy *= scale;
        dz *= scale;
      }
      const ox = positions[index * 3] + dx - origin[index * 3];
      const oy = positions[index * 3 + 1] + dy - origin[index * 3 + 1];
      const oz = positions[index * 3 + 2] + dz - origin[index * 3 + 2];
      const total = Math.hypot(ox, oy, oz);
      const pull = total > cap && total > 0 ? cap / total : 1;
      next[index * 3] = origin[index * 3] + ox * pull;
      next[index * 3 + 1] = origin[index * 3 + 1] + oy * pull;
      next[index * 3 + 2] = origin[index * 3 + 2] + oz * pull;
    }
    positions.set(next);
  }
}

function vertexCrease(positions: Float32Array, indices: Uint32Array) {
  const crease = new Float32Array(positions.length / 3);
  const faces = new Map<string, number[]>();
  const normals: number[] = [];
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const normal = triangleNormal(positions, indices, triangle / 3);
    const length = Math.hypot(normal[0], normal[1], normal[2]);
    if (length < 1e-8) continue;
    const face = normals.length / 3;
    normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge];
      const b = ids[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const list = faces.get(key);
      if (list) list.push(face);
      else faces.set(key, [face]);
    }
  }
  faces.forEach((list, key) => {
    if (list.length < 2) return;
    const dot = Math.abs(
      normals[list[0] * 3] * normals[list[1] * 3]
      + normals[list[0] * 3 + 1] * normals[list[1] * 3 + 1]
      + normals[list[0] * 3 + 2] * normals[list[1] * 3 + 2],
    );
    const value = 1 - dot;
    key.split(":").forEach((id) => {
      const index = Number(id);
      if (value > crease[index]) crease[index] = value;
    });
  });
  return crease;
}

function edgePitch(positions: Float32Array, indices: Uint32Array) {
  const edges: number[] = [];
  const count = Math.min(indices.length, 2400);
  for (let triangle = 0; triangle < count; triangle += 3) {
    const a = indices[triangle] * 3;
    const b = indices[triangle + 1] * 3;
    edges.push(Math.hypot(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]));
  }
  return Math.max(median(edges), 1e-4);
}

function readDefects(positions: Float32Array, count: number, frame: Frame, indices: Uint32Array): Defects {
  const slices = usableSlices(sliceMesh(positions, count, frame));
  const defects: Defects = { twist: 0, pinch: 0, bump: 0, kink: 0, seam: 0, gap: 0, narrow: 0, edge: 0 };
  defects.bump = surfaceSpikes(positions, indices).worst;
  defects.edge = edgeScore(positions, indices);
  if (slices.length < 4) return defects;
  const angles = unwrap(slices.map((slice) => slice.angle));
  const spacing = slices.slice(1).map((slice, index) => distance(slice.center, slices[index].center));
  const typical = median(spacing.filter((value) => value > 1e-5));
  const bends = slices.map((slice, index) => index > 0 && index < slices.length - 1
    ? turnAngle(slices[index - 1].center, slice.center, slices[index + 1].center)
    : 0);
  slices.forEach((slice, index) => {
    if (index > 0 && index < slices.length - 1) {
      const neighbors = (slices[index - 1].median + slices[index + 1].median) / 2;
      if (neighbors > 1e-4) defects.pinch = Math.max(defects.pinch, Math.max(0, PINCH_RATIO - slice.median / neighbors));
      const neighborBend = Math.max(bends[index - 1] ?? 0, bends[index + 1] ?? 0);
      if (bends[index] >= KINK_LIMIT && bends[index] > neighborBend + 0.45) {
        defects.kink = Math.max(defects.kink, bends[index]);
        if (index === 1 || index === slices.length - 2) defects.seam = Math.max(defects.seam, bends[index]);
      }
    }
    if (index > 0 && index < slices.length - 1 && slice.median * 2 < HABITABLE_CLEARANCE.clearWidth) {
      defects.narrow = Math.max(defects.narrow, HABITABLE_CLEARANCE.clearWidth - slice.median * 2);
    }
    if (index > 0 && typical > 0) {
      const step = distance(slice.center, slices[index - 1].center);
      if (step > typical * 2.6 || step < typical * 0.28) defects.gap = Math.max(defects.gap, step / typical);
    }
  });
  defects.twist = twistDeparture(slices, angles);
  return defects;
}

function hasGeometricDefect(defects: Defects) {
  return defects.twist >= TWIST_LIMIT || defects.pinch > 0.02 || defects.bump >= SPIKE_RATIO || defects.edge >= 0.72 || defects.kink >= KINK_LIMIT || defects.seam >= KINK_LIMIT || defects.gap > 0;
}

function limitOf(key: keyof Defects) {
  if (key === "twist") return TWIST_LIMIT;
  if (key === "pinch") return 0.02;
  if (key === "bump") return SPIKE_RATIO;
  if (key === "edge") return 0.72;
  if (key === "kink" || key === "seam") return KINK_LIMIT;
  if (key === "gap") return 0;
  return Infinity;
}

function keepsCleared(after: Defects, before: Defects) {
  const keys: (keyof Defects)[] = ["twist", "pinch", "bump", "kink", "seam", "gap"];
  return keys.every((key) => !(before[key] <= limitOf(key) && after[key] > limitOf(key)));
}

/** Keep a local remesh when it reduces a failing check and does not create a new one. */
function refinementHelps(after: Defects, before: Defects) {
  const keys: (keyof Defects)[] = ["twist", "pinch", "bump", "edge", "kink", "seam", "gap"];
  let reduced = false;
  for (const key of keys) {
    const limit = limitOf(key);
    const wasFailing = before[key] > limit;
    const nowFailing = after[key] > limit;
    if (!wasFailing && nowFailing) return false;
    if (wasFailing && after[key] > before[key] + 0.04) return false;
    if (wasFailing && after[key] < before[key] - 0.012) reduced = true;
  }
  return reduced;
}

function regressed(after: Defects, before: Defects) {
  return after.twist > before.twist + 0.08
    || after.pinch > before.pinch + 0.04
    || (after.bump >= SPIKE_RATIO && after.bump > before.bump + 0.2)
    || (after.edge >= 0.72 && after.edge > before.edge + 0.08)
    || after.kink > before.kink + 0.08
    || after.seam > before.seam + 0.08;
}

function metricsOf(defects: Defects, degenerate: number): ValidationMetrics {
  return {
    continuity: roundMetric(1 - clamp(defects.kink / 1.4, 0, 1)),
    junction: roundMetric(1 - clamp(defects.seam / 1.4, 0, 1)),
    smoothness: roundMetric(1 - clamp(defects.twist / 1.6, 0, 1) * 0.4 - clamp(defects.bump / 3, 0, 1) * 0.2 - clamp(defects.edge, 0, 1) * 0.4),
    integrity: roundMetric(1 - clamp(defects.pinch / 0.45, 0, 1) * 0.7 - clamp(degenerate, 0, 1) * 0.3),
  };
}

function failureNote(defects: Defects, circulation: boolean, positions: Float32Array, indices: Uint32Array, frame: Frame) {
  const place = foldPlace(positions, indices, frame);
  if (defects.gap > 0) return "A gap or overlap is still unresolved.";
  if (defects.twist >= TWIST_LIMIT) return `Surface smoothness is still low ${place}. A twist remains that could not be corrected safely.`;
  if (defects.pinch > 0.02) return `Geometry integrity is still low ${place}. A pinched passage remains that could not be opened safely.`;
  if (defects.kink >= KINK_LIMIT) return `Continuity is still low ${place}. A sharp change in direction remains.`;
  if (defects.seam >= KINK_LIMIT) return `Junction fit is still low ${place}. A sharp change in direction remains at the connection.`;
  if (defects.edge >= 0.72) return `Surface smoothness is still low ${place}. Sharp folds remain after local refinement.`;
  if (defects.bump >= SPIKE_RATIO) return `Surface smoothness is still low ${place}. Irregular surface regions remain.`;
  if (circulation && defects.narrow > 0) return "The passage is still narrower than the existing clearance.";
  return "The remaining problem could not be corrected safely.";
}

function foldPlace(positions: Float32Array, indices: Uint32Array, frame: Frame) {
  const crease = vertexCrease(positions, indices);
  let worst = 0;
  let station = 0.5;
  for (let index = 0; index < crease.length; index += 1) {
    if (crease[index] < worst) continue;
    worst = crease[index];
    const offset = index * 3;
    station = ((positions[offset] - frame.origin.x) * frame.dir.x
      + (positions[offset + 1] - frame.origin.y) * frame.dir.y
      + (positions[offset + 2] - frame.origin.z) * frame.dir.z) / Math.max(frame.span, 1e-4);
  }
  if (station < 0.33) return "near the start of the connection";
  if (station > 0.67) return "near the end of the connection";
  return "through the middle of the connection";
}

function refinementDrift(source: Float32Array, next: Float32Array, rest: Float32Array) {
  let peak = 0;
  const shared = Math.min(source.length, next.length) / 3;
  for (let index = 0; index < shared; index += 1) peak = Math.max(peak, vertexDrift(source, next, index));
  for (let index = shared; index < next.length / 3; index += 1) peak = Math.max(peak, vertexDrift(rest, next, index));
  return peak;
}

function issuePoints(positions: Float32Array, count: number, frame: Frame, defects: Defects): ValidationIssue[] {
  if (!hasGeometricDefect(defects) && defects.narrow <= 0) return [];
  const slices = usableSlices(sliceMesh(positions, count, frame));
  const angles = unwrap(slices.map((slice) => slice.angle));
  const issues: ValidationIssue[] = [];
  slices.forEach((slice, index) => {
    if (index === 0 || index === slices.length - 1) return;
    const neighbors = (slices[Math.max(0, index - 1)].median + slices[Math.min(slices.length - 1, index + 1)].median) / 2;
    const pinch = neighbors > 1e-4 ? Math.max(0, PINCH_RATIO - slice.median / neighbors) : 0;
    const target = lerp(angles[0], angles[angles.length - 1], index / (slices.length - 1));
    const twist = slice.round ? 0 : Math.abs(angles[index] - target);
    let worst = slice.ids[0] ?? 0;
    let worstError = 0;
    slice.ids.forEach((id) => {
      const error = Math.abs(radialOf(positions, id, slice.center, frame).length - slice.median) / Math.max(slice.median, 1e-4);
      if (error > worstError) {
        worstError = error;
        worst = id;
      }
    });
    const bumpError = outliersOf(positions, slice, frame).reduce((peak, outlier) => Math.max(peak, Math.abs(outlier.radius - outlier.neighbor) / Math.max(outlier.neighbor, 1e-4)), 0);
    const weight = clamp(pinch * 2 + bumpError + (twist >= TWIST_LIMIT ? 0.7 : 0) + (slice.median * 2 < HABITABLE_CLEARANCE.clearWidth ? 0.35 : 0), 0, 1);
    if (weight < 0.2) return;
    const offset = worst * 3;
    issues.push({
      x: positions[offset],
      y: positions[offset + 1],
      z: positions[offset + 2],
      weight: Math.max(weight, defects.twist >= TWIST_LIMIT ? 0.55 : 0),
    });
  });
  return issues.slice(0, 48);
}

function usableSlices(slices: Slice[]) {
  if (slices.length < 4) return slices;
  const typical = median(slices.map((slice) => slice.ids.length));
  const floor = Math.max(8, typical * 0.45);
  const filtered = slices.filter((slice) => slice.ids.length >= floor);
  return filtered.length >= 4 ? filtered : slices;
}

function twistDeparture(slices: Slice[], angles: number[]) {
  let peak = 0;
  for (let index = 1; index < slices.length - 1; index += 1) {
    if (!rigidSlice(slices[index], slices)) continue;
    const target = lerp(angles[0], angles[angles.length - 1], index / (slices.length - 1));
    peak = Math.max(peak, Math.abs(angles[index] - target));
  }
  return peak;
}

function rigidSlice(slice: Slice, slices: Slice[]) {
  const first = slices[0];
  const last = slices[slices.length - 1];
  if (!first || !last || slice.round || first.round || last.round) return false;
  const matches = (end: Slice) => slice.aspect > end.aspect * 0.7 && slice.aspect < end.aspect * 1.3;
  return matches(first) && matches(last);
}

function sliceMesh(positions: Float32Array, count: number, frame: Frame): Slice[] {
  const bins: number[][] = Array.from({ length: SLICES }, () => []);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const travel = ((positions[offset] - frame.origin.x) * frame.dir.x
      + (positions[offset + 1] - frame.origin.y) * frame.dir.y
      + (positions[offset + 2] - frame.origin.z) * frame.dir.z) / frame.span;
    const bin = clamp(Math.floor(travel * SLICES), 0, SLICES - 1);
    bins[bin].push(index);
  }
  return bins.filter((ids) => ids.length >= 3).map((ids) => {
    const center = centroid(positions, ids);
    const radii = ids.map((id) => radialOf(positions, id, center, frame).length);
    const section = sectionAngle(positions, ids, center, frame);
    return { ids, center, median: median(radii), angle: section.angle, aspect: section.aspect, round: section.round };
  });
}

function principalFrame(positions: Float32Array, count: number): Frame | null {
  let ox = 0;
  let oy = 0;
  let oz = 0;
  for (let index = 0; index < count; index += 1) {
    ox += positions[index * 3];
    oy += positions[index * 3 + 1];
    oz += positions[index * 3 + 2];
  }
  ox /= count;
  oy /= count;
  oz /= count;
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (let index = 0; index < count; index += 1) {
    const x = positions[index * 3] - ox;
    const y = positions[index * 3 + 1] - oy;
    const z = positions[index * 3 + 2] - oz;
    xx += x * x;
    xy += x * y;
    xz += x * z;
    yy += y * y;
    yz += y * z;
    zz += z * z;
  }
  let vx = 1;
  let vy = 0.15;
  let vz = 0.05;
  for (let pass = 0; pass < 14; pass += 1) {
    const nx = xx * vx + xy * vy + xz * vz;
    const ny = xy * vx + yy * vy + yz * vz;
    const nz = xz * vx + yz * vy + zz * vz;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-8) return null;
    vx = nx / length;
    vy = ny / length;
    vz = nz / length;
  }
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < count; index += 1) {
    const travel = (positions[index * 3] - ox) * vx + (positions[index * 3 + 1] - oy) * vy + (positions[index * 3 + 2] - oz) * vz;
    min = Math.min(min, travel);
    max = Math.max(max, travel);
  }
  const span = max - min;
  if (span < 1e-4) return null;
  const dir = { x: vx, y: vy, z: vz };
  const hint = Math.abs(dir.y) < 0.85 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const side = normalize(cross(hint, dir));
  const up = normalize(cross(dir, side));
  return {
    origin: { x: ox + dir.x * min, y: oy + dir.y * min, z: oz + dir.z * min },
    dir,
    side,
    up,
    span,
  };
}

function sectionAngle(positions: Float32Array, ids: number[], center: Vec3, frame: Frame) {
  let uu = 0;
  let uv = 0;
  let vv = 0;
  ids.forEach((id) => {
    const radial = radialOf(positions, id, center, frame);
    uu += radial.u * radial.u;
    uv += radial.u * radial.v;
    vv += radial.v * radial.v;
  });
  const trace = uu + vv;
  const det = uu * vv - uv * uv;
  const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
  const major = trace / 2 + disc;
  const minor = Math.max(1e-8, trace / 2 - disc);
  return {
    angle: 0.5 * Math.atan2(2 * uv, uu - vv),
    aspect: Math.sqrt(major / minor),
    round: major < minor * 1.28,
  };
}

function rotateSlice(positions: Float32Array, slice: Slice, frame: Frame, delta: number) {
  const cosine = Math.cos(delta);
  const sine = Math.sin(delta);
  slice.ids.forEach((id) => {
    const radial = radialOf(positions, id, slice.center, frame);
    const u = radial.u * cosine - radial.v * sine;
    const v = radial.u * sine + radial.v * cosine;
    writePlane(positions, id, slice.center, frame, radial.axial, u, v);
  });
}

function scaleSlice(positions: Float32Array, slice: Slice, frame: Frame, target: number, limit: number) {
  slice.ids.forEach((id) => {
    const radial = radialOf(positions, id, slice.center, frame);
    if (radial.length >= target || radial.length < 1e-5) return;
    const nextRadius = radial.length + Math.min(limit, (target - radial.length) * 0.7);
    writeRadial(positions, id, slice.center, frame, radial, nextRadius);
  });
}

function sliceTranslate(positions: Float32Array, slice: Slice, x: number, y: number, z: number) {
  slice.ids.forEach((id) => {
    const offset = id * 3;
    positions[offset] += x;
    positions[offset + 1] += y;
    positions[offset + 2] += z;
  });
}

function radialOf(positions: Float32Array, index: number, center: Vec3, frame: Frame) {
  const x = positions[index * 3] - center.x;
  const y = positions[index * 3 + 1] - center.y;
  const z = positions[index * 3 + 2] - center.z;
  const axial = x * frame.dir.x + y * frame.dir.y + z * frame.dir.z;
  const u = x * frame.side.x + y * frame.side.y + z * frame.side.z;
  const v = x * frame.up.x + y * frame.up.y + z * frame.up.z;
  return { axial, u, v, length: Math.hypot(u, v) };
}

function writeRadial(positions: Float32Array, index: number, center: Vec3, frame: Frame, radial: { axial: number; u: number; v: number; length: number }, radius: number) {
  const scale = radial.length > 1e-5 ? radius / radial.length : 1;
  writePlane(positions, index, center, frame, radial.axial, radial.u * scale, radial.v * scale);
}

function writePlane(positions: Float32Array, index: number, center: Vec3, frame: Frame, axial: number, u: number, v: number) {
  const offset = index * 3;
  positions[offset] = center.x + frame.dir.x * axial + frame.side.x * u + frame.up.x * v;
  positions[offset + 1] = center.y + frame.dir.y * axial + frame.side.y * u + frame.up.y * v;
  positions[offset + 2] = center.z + frame.dir.z * axial + frame.side.z * u + frame.up.z * v;
}

function unwrap(angles: number[]) {
  const result: number[] = [];
  angles.forEach((angle, index) => {
    if (index === 0 || !Number.isFinite(angle) || !Number.isFinite(result[index - 1])) {
      result.push(angle);
      return;
    }
    let next = angle;
    while (next - result[index - 1] > Math.PI / 2) next -= Math.PI;
    while (result[index - 1] - next > Math.PI / 2) next += Math.PI;
    result.push(next);
  });
  return result;
}

function turnAngle(prev: Vec3, current: Vec3, next: Vec3) {
  const ax = current.x - prev.x;
  const ay = current.y - prev.y;
  const az = current.z - prev.z;
  const bx = next.x - current.x;
  const by = next.y - current.y;
  const bz = next.z - current.z;
  const al = Math.hypot(ax, ay, az);
  const bl = Math.hypot(bx, by, bz);
  if (al < 1e-5 || bl < 1e-5) return 0;
  const dot = clamp((ax * bx + ay * by + az * bz) / (al * bl), -1, 1);
  return Math.acos(dot);
}

function centroid(positions: Float32Array, ids: number[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  ids.forEach((id) => {
    x += positions[id * 3];
    y += positions[id * 3 + 1];
    z += positions[id * 3 + 2];
  });
  return { x: x / ids.length, y: y / ids.length, z: z / ids.length };
}

function extent(positions: Float32Array, count: number) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let index = 0; index < count; index += 1) {
    min.x = Math.min(min.x, positions[index * 3]);
    min.y = Math.min(min.y, positions[index * 3 + 1]);
    min.z = Math.min(min.z, positions[index * 3 + 2]);
    max.x = Math.max(max.x, positions[index * 3]);
    max.y = Math.max(max.y, positions[index * 3 + 1]);
    max.z = Math.max(max.z, positions[index * 3 + 2]);
  }
  return { min, max };
}

function degenerateRatio(mesh: IsoMesh) {
  let bad = 0;
  const step = Math.max(1, Math.floor(mesh.triangles / 4000));
  let samples = 0;
  for (let triangle = 0; triangle < mesh.triangles; triangle += step) {
    const normal = triangleNormal(mesh.positions, mesh.indices, triangle);
    if (Math.hypot(normal[0], normal[1], normal[2]) < 1e-10) bad += 1;
    samples += 1;
  }
  return samples > 0 ? bad / samples : 0;
}

function triangleNormal(positions: Float32Array, indices: Uint32Array, triangle: number) {
  const a = indices[triangle * 3] * 3;
  const b = indices[triangle * 3 + 1] * 3;
  const c = indices[triangle * 3 + 2] * 3;
  const abx = positions[b] - positions[a];
  const aby = positions[b + 1] - positions[a + 1];
  const abz = positions[b + 2] - positions[a + 2];
  const acx = positions[c] - positions[a];
  const acy = positions[c + 1] - positions[a + 1];
  const acz = positions[c + 2] - positions[a + 2];
  return [aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx];
}

function faceNormals(positions: Float32Array, indices: Uint32Array) {
  const normals = new Float32Array(positions.length);
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const normal = triangleNormal(positions, indices, triangle / 3);
    for (const corner of [0, 1, 2]) {
      const offset = indices[triangle + corner] * 3;
      normals[offset] += normal[0];
      normals[offset + 1] += normal[1];
      normals[offset + 2] += normal[2];
    }
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1;
    normals[index] /= length;
    normals[index + 1] /= length;
    normals[index + 2] /= length;
  }
  return normals;
}

function vertexDrift(source: Float32Array, next: Float32Array, index: number) {
  const offset = index * 3;
  return Math.hypot(next[offset] - source[offset], next[offset + 1] - source[offset + 1], next[offset + 2] - source[offset + 2]);
}

function maxDrift(source: Float32Array, next: Float32Array) {
  let peak = 0;
  for (let index = 0; index < source.length / 3; index += 1) peak = Math.max(peak, vertexDrift(source, next, index));
  return peak;
}

function restore(target: Float32Array, source: Float32Array) {
  target.set(source);
}

function score(metrics: ValidationMetrics) {
  return metrics.continuity + metrics.junction + metrics.smoothness + metrics.integrity;
}

function averageMetrics(rows: ValidationMetrics[]): ValidationMetrics {
  const total = rows.length || 1;
  return {
    continuity: roundMetric(rows.reduce((sum, row) => sum + row.continuity, 0) / total),
    junction: roundMetric(rows.reduce((sum, row) => sum + row.junction, 0) / total),
    smoothness: roundMetric(rows.reduce((sum, row) => sum + row.smoothness, 0) / total),
    integrity: roundMetric(rows.reduce((sum, row) => sum + row.integrity, 0) / total),
  };
}

function roundMetric(value: number) {
  return Number(clamp(value, 0, 1).toFixed(3));
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z) || 1;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
