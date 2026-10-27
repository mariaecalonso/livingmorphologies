import type { IsoMesh } from "../scan/isomesh";
import { MODULE_SIZE, type Vec3 } from "./contract";
import { loftSectionRings } from "./hybrid-spine";
import type { Mat3 } from "./tile-basis";

/**
 * Architectural reading of the Skill 04 field-cell.
 * The pipeline never stores feet or meters. Skill 03 meshes are seated in the
 * 20-cell module without being resized. A person is expressed in those cells
 * by reading the module height as 8 meters. Vertices are not scaled.
 */
export const MODULE_METERS = 8;
export const CELL_METERS = MODULE_METERS / MODULE_SIZE;

export const HABITABLE_CLEARANCE = {
  clearHeight: 2.1 / CELL_METERS,
  clearWidth: 0.9 / CELL_METERS,
  figureHeight: 1.75 / CELL_METERS,
  figureWidth: 0.45 / CELL_METERS,
  shell: 0.4 / CELL_METERS,
  floor: 0.18 / CELL_METERS,
  maxSlope: Math.atan(1 / 6),
} as const;

export type HabitabilityMetrics = {
  minInteriorWidth: number;
  minInteriorHeight: number;
  minCrossSection: number;
  interiorConnected: boolean;
  hardSeam: boolean;
  terminalMismatch: number;
  walkable: boolean;
  maxFloorSlope: number;
  clearancePass: number;
};

export type HabitabilityReport = {
  unit: "field-cell";
  cellMeters: number;
  moduleMeters: number;
  status: "PASS" | "FAIL";
  reasons: string[];
  protectedStations: number[];
  terminalWeights: number[];
  coreDrift: number;
  before: HabitabilityMetrics;
  after: HabitabilityMetrics;
};

export type DevelopmentView = {
  key: string;
  /** Moves one parent along the connection so the hybrid can sit between the faces. */
  tileShift: { tileId: string; offset: Vec3 } | null;
  report: HabitabilityReport;
};

const views = new WeakMap<IsoMesh, DevelopmentView>();

export function developmentOf(mesh: IsoMesh | null | undefined): DevelopmentView | null {
  return mesh ? views.get(mesh) ?? null : null;
}

export function integrateDevelopmentLoft(
  rings: Vec3[][],
  faceA: Vec3[],
  faceB: Vec3[],
  planeA: { origin: Vec3; normal: Vec3 },
  planeB: { origin: Vec3; normal: Vec3 },
  openingA: Vec3[] | null = null,
  openingB: Vec3[] | null = null,
): { mesh: IsoMesh; report: HabitabilityReport } | null {
  if (rings.length < 5 || rings.some((ring) => ring.length < 12 || ring.length !== rings[0].length)) return null;
  const weights = rings.map((_, index) => terminalWeight(index / (rings.length - 1)));
  const protectedStations = weights.map((weight, index) => (weight === 0 ? index : -1)).filter((index) => index >= 0);
  const before = measureSolid(rings, faceA, faceB);
  const outer = rings.map((ring, index) => {
    const weight = weights[index];
    if (weight <= 0) return ring.map((point) => ({ ...point }));
    const side = index / (rings.length - 1) < 0.5 ? faceA : faceB;
    const matched = alignSamples(ring, resampleClosed(side, ring.length));
    return ring.map((point, sample) => lerp(point, matched[sample] ?? point, weight));
  }).map((ring) => keepInGap(ring, planeA, planeB));
  const coreDrift = maxDrift(rings, outer, protectedStations);
  const after = measureVoid(outer, outer.map(average), outer, faceA, faceB);
  const reasons: string[] = [];
  if (after.hardSeam) reasons.push("FAIL: TRANSITION PINCH");
  const report: HabitabilityReport = {
    unit: "field-cell",
    cellMeters: CELL_METERS,
    moduleMeters: MODULE_METERS,
    status: reasons.length === 0 ? "PASS" : "FAIL",
    reasons: reasons.length === 0 ? ["PASS"] : reasons,
    protectedStations,
    terminalWeights: weights.map((weight) => Number(weight.toFixed(3))),
    coreDrift: Number(coreDrift.toFixed(3)),
    before,
    after,
  };
  const porous = (openingA && openingA.length >= 3) || (openingB && openingB.length >= 3);
  const mesh = porous
    ? shellMesh(outer, outer.map((ring, index) => {
      const weight = weights[index];
      const inset = ring.map((point) => add(point, scale(sub(average(ring), point), 0.22)));
      if (weight <= 0) return inset;
      const side = index / (rings.length - 1) < 0.5 ? openingA : openingB;
      if (!side || side.length < 3) return inset;
      const matched = alignSamples(inset, resampleClosed(side, inset.length));
      return keepInGap(inset.map((point, sample) => lerp(point, matched[sample] ?? point, weight)), planeA, planeB);
    }))
    : loftSectionRings(outer);
  return { mesh, report };
}

function keepInGap(ring: Vec3[], planeA: { origin: Vec3; normal: Vec3 }, planeB: { origin: Vec3; normal: Vec3 }) {
  return ring.map((point) => {
    const beyondA = dot(sub(planeA.origin, point), planeA.normal);
    const beyondB = dot(sub(planeB.origin, point), planeB.normal);
    let next = point;
    if (beyondA > 0) next = add(next, scale(planeA.normal, beyondA));
    if (beyondB > 0) next = add(next, scale(planeB.normal, beyondB));
    return next;
  });
}

export function moduleSpaceMesh(mesh: IsoMesh, basis: Mat3, translate: Vec3): IsoMesh {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length || mesh.positions.length);
  const inverse = (vector: Vec3): Vec3 => ({
    x: basis[0] * vector.x + basis[1] * vector.y + basis[2] * vector.z,
    y: basis[3] * vector.x + basis[4] * vector.y + basis[5] * vector.z,
    z: basis[6] * vector.x + basis[7] * vector.y + basis[8] * vector.z,
  });
  for (let index = 0; index < mesh.positions.length / 3; index += 1) {
    const point = inverse(sub(read(mesh.positions, index), translate));
    write(positions, index, point);
    const normal = mesh.normals.length === mesh.positions.length ? inverse(read(mesh.normals, index)) : { x: 0, y: 1, z: 0 };
    const span = length(normal);
    write(normals, index, span > 1e-6 ? scale(normal, 1 / span) : { x: 0, y: 1, z: 0 });
  }
  return { positions, normals, indices: Uint32Array.from(mesh.indices), triangles: mesh.triangles };
}

export function rememberDevelopment(mesh: IsoMesh, view: DevelopmentView) {
  views.set(mesh, view);
}

function terminalWeight(t: number) {
  const edge = Math.min(t, 1 - t);
  const band = 0.42;
  if (edge >= band) return 0;
  const mix = 1 - edge / band;
  return mix * mix * (3 - 2 * mix);
}

function occupiableTarget(loop: Vec3[], opening: boolean) {
  const frame = gravityFrame(loop);
  const local = project(loop, frame);
  const width = Math.max(...local.map((point) => point.u)) - Math.min(...local.map((point) => point.u));
  const height = Math.max(...local.map((point) => point.v)) - Math.min(...local.map((point) => point.v));
  if (opening && width >= HABITABLE_CLEARANCE.clearWidth && height >= HABITABLE_CLEARANCE.clearHeight) return loop;
  const halfW = Math.max(HABITABLE_CLEARANCE.clearWidth / 2, width * 0.28);
  const halfH = Math.max(HABITABLE_CLEARANCE.clearHeight / 2, Math.min(height * 0.28, HABITABLE_CLEARANCE.clearHeight));
  const minV = Math.min(...local.map((point) => point.v));
  const centerV = minV + HABITABLE_CLEARANCE.floor + halfH;
  return Array.from({ length: loop.length }, (_, index) => {
    const angle = (index / loop.length) * Math.PI * 2;
    return add(frame.origin, add(scale(frame.width, Math.cos(angle) * halfW), scale(frame.up, centerV + Math.sin(angle) * halfH)));
  });
}

function thicken(ring: Vec3[], weight: number) {
  const frame = gravityFrame(ring);
  const local = project(ring, frame);
  const minU = Math.min(...local.map((point) => point.u));
  const maxU = Math.max(...local.map((point) => point.u));
  const minV = Math.min(...local.map((point) => point.v));
  const maxV = Math.max(...local.map((point) => point.v));
  const needW = HABITABLE_CLEARANCE.clearWidth + HABITABLE_CLEARANCE.shell * 2;
  const needH = HABITABLE_CLEARANCE.clearHeight + HABITABLE_CLEARANCE.floor + HABITABLE_CLEARANCE.shell;
  const scaleU = Math.max(1, needW / Math.max(1e-4, maxU - minU));
  const scaleV = Math.max(1, needH / Math.max(1e-4, maxV - minV));
  const gainU = Math.min(scaleU, 4);
  const gainV = Math.min(scaleV, 4);
  if (gainU === 1 && gainV === 1) return ring;
  const midU = (minU + maxU) / 2;
  const midV = (minV + maxV) / 2;
  return local.map((point) => add(frame.origin, add(
    scale(frame.width, midU + (point.u - midU) * gainU),
    scale(frame.up, midV + (point.v - midV) * gainV),
  )));
}

function clearanceLoop(ring: Vec3[], count: number) {
  const frame = gravityFrame(ring);
  const local = project(ring, frame);
  const minU = Math.min(...local.map((point) => point.u));
  const maxU = Math.max(...local.map((point) => point.u));
  const minV = Math.min(...local.map((point) => point.v));
  const maxV = Math.max(...local.map((point) => point.v));
  const halfW = Math.max(HABITABLE_CLEARANCE.clearWidth / 2, Math.min(Math.max(0, (maxU - minU) / 2 - HABITABLE_CLEARANCE.shell), (maxU - minU) * 0.42));
  const halfH = Math.max(HABITABLE_CLEARANCE.clearHeight / 2, Math.min(Math.max(0, (maxV - minV) / 2 - HABITABLE_CLEARANCE.shell), (maxV - minV) * 0.42));
  const centerV = minV + HABITABLE_CLEARANCE.floor + halfH;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return add(frame.origin, add(scale(frame.width, Math.cos(angle) * halfW), scale(frame.up, centerV + Math.sin(angle) * halfH)));
  });
}

function measureSolid(rings: Vec3[][], targetA: Vec3[], targetB: Vec3[]): HabitabilityMetrics {
  const mismatch = Math.max(loopGap(rings[0], targetA), loopGap(rings[rings.length - 1], targetB));
  return {
    minInteriorWidth: 0,
    minInteriorHeight: 0,
    minCrossSection: 0,
    interiorConnected: false,
    hardSeam: true,
    terminalMismatch: Number(mismatch.toFixed(3)),
    walkable: false,
    maxFloorSlope: Number(slopeOf(rings.map((ring) => average(ring))).toFixed(4)),
    clearancePass: 0,
  };
}

function measureVoid(inner: Vec3[][], walks: Vec3[], outer: Vec3[][], targetA: Vec3[], targetB: Vec3[]): HabitabilityMetrics {
  const spans = inner.map((ring) => {
    const frame = gravityFrame(ring);
    const local = project(ring, frame);
    const width = Math.max(...local.map((point) => point.u)) - Math.min(...local.map((point) => point.u));
    const height = Math.max(...local.map((point) => point.v)) - Math.min(...local.map((point) => point.v));
    return { width, height, area: Math.max(0, width * height * Math.PI / 4) };
  });
  const pass = spans.filter((span) => span.width >= HABITABLE_CLEARANCE.clearWidth && span.height >= HABITABLE_CLEARANCE.clearHeight).length / spans.length;
  const mismatch = Math.max(loopGap(outer[0], targetA), loopGap(outer[outer.length - 1], targetB));
  return {
    minInteriorWidth: Number(Math.min(...spans.map((span) => span.width)).toFixed(3)),
    minInteriorHeight: Number(Math.min(...spans.map((span) => span.height)).toFixed(3)),
    minCrossSection: Number(Math.min(...spans.map((span) => span.area)).toFixed(3)),
    interiorConnected: spans.every((span) => span.area > 1),
    hardSeam: mismatch > 1.5,
    terminalMismatch: Number(mismatch.toFixed(3)),
    walkable: walks.length === inner.length && slopeOf(walks) <= HABITABLE_CLEARANCE.maxSlope,
    maxFloorSlope: Number(slopeOf(walks).toFixed(4)),
    clearancePass: Number(pass.toFixed(3)),
  };
}

function separateEnds(rings: Vec3[][]) {
  const last = rings.length - 1;
  pushApart(rings, 1, 0);
  pushApart(rings, last - 1, last);
}

function pushApart(rings: Vec3[][], from: number, toward: number) {
  const start = average(rings[from]);
  const end = average(rings[toward]);
  const run = Math.hypot(end.x - start.x, end.z - start.z);
  const rise = Math.abs(end.y - start.y);
  const needed = rise / Math.tan(HABITABLE_CLEARANCE.maxSlope);
  if (run >= needed || needed < 0.2) return;
  let direction = { x: end.x - start.x, y: 0, z: end.z - start.z };
  if (length(direction) < 0.2) {
    const chord = sub(average(rings[rings.length - 1]), average(rings[0]));
    direction = { x: chord.x, y: 0, z: chord.z };
    if (toward < from) direction = scale(direction, -1);
  }
  direction = normalize(direction);
  const shift = scale(direction, needed - run);
  rings[toward] = rings[toward].map((point) => add(point, shift));
}

function loopGap(loop: Vec3[], target: Vec3[]) {
  const shift = sub(average(loop), average(target));
  const moved = target.map((point) => add(point, shift));
  const matched = alignSamples(loop, resampleClosed(moved, loop.length));
  let total = 0;
  loop.forEach((point, index) => {
    total += length(sub(point, matched[index]));
  });
  return total / loop.length;
}

function resampleClosed(loop: Vec3[], count: number) {
  const lengths = [0];
  for (let index = 0; index < loop.length; index += 1) {
    lengths.push(lengths[index] + length(sub(loop[(index + 1) % loop.length], loop[index])));
  }
  const total = lengths[lengths.length - 1] || 1;
  return Array.from({ length: count }, (_, sample) => {
    const distance = (sample / count) * total;
    let index = 1;
    while (index < lengths.length - 1 && lengths[index] < distance) index += 1;
    const span = lengths[index] - lengths[index - 1] || 1;
    return lerp(loop[index - 1], loop[index % loop.length], (distance - lengths[index - 1]) / span);
  });
}

function alignSamples(source: Vec3[], target: Vec3[]) {
  let best = target;
  let bestCost = Infinity;
  for (const reversed of [false, true]) {
    const ordered = reversed ? [...target].reverse() : target;
    for (let shift = 0; shift < ordered.length; shift += 1) {
      let cost = 0;
      for (let index = 0; index < ordered.length; index += 1) cost += length(sub(source[index], ordered[(index + shift) % ordered.length]));
      if (cost < bestCost) {
        bestCost = cost;
        best = source.map((_, index) => ordered[(index + shift) % ordered.length]);
      }
    }
  }
  return best;
}

function maxDrift(before: Vec3[][], after: Vec3[][], stations: number[]) {
  let drift = 0;
  stations.forEach((station) => {
    before[station].forEach((point, index) => {
      drift = Math.max(drift, length(sub(point, after[station][index])));
    });
  });
  return drift;
}

function gradedWalks(rings: Vec3[][], outer: Vec3[][]) {
  const mids = rings.map(average);
  const distance = [0];
  for (let index = 1; index < mids.length; index += 1) {
    distance.push(distance[index - 1] + Math.hypot(mids[index].x - mids[index - 1].x, mids[index].z - mids[index - 1].z));
  }
  const total = Math.max(distance[distance.length - 1], 1e-4);
  const maxDrop = Math.tan(HABITABLE_CLEARANCE.maxSlope) * total;
  let y0 = mids[0].y;
  let y1 = mids[mids.length - 1].y;
  if (Math.abs(y1 - y0) > maxDrop) {
    const mid = (y0 + y1) / 2;
    const half = maxDrop / 2;
    y0 = mid + Math.sign(y0 - mid) * half;
    y1 = mid + Math.sign(y1 - mid) * half;
  }
  return mids.map((mid, index) => {
    const grade = y0 + (y1 - y0) * (distance[index] / total);
    let low = Infinity;
    let high = -Infinity;
    rings[index].forEach((point) => {
      low = Math.min(low, point.y);
      high = Math.max(high, point.y);
    });
    const margin = HABITABLE_CLEARANCE.floor;
    const head = HABITABLE_CLEARANCE.clearHeight * 0.35;
    let shift = 0;
    if (grade < low + margin) shift = grade - (low + margin);
    if (grade > high + shift - head) shift += grade - (high + shift - head);
    if (shift !== 0) {
      rings[index] = rings[index].map((point) => ({ ...point, y: point.y + shift }));
      outer[index] = outer[index].map((point) => ({ ...point, y: point.y + shift }));
    }
    return { x: mid.x, y: grade, z: mid.z };
  });
}

function slopeOf(points: Vec3[]) {
  let slope = 0;
  for (let index = 1; index < points.length; index += 1) {
    const step = sub(points[index], points[index - 1]);
    const run = Math.hypot(step.x, step.z);
    slope = Math.max(slope, Math.atan2(Math.abs(step.y), Math.max(run, 1e-4)));
  }
  return slope;
}

function passageSolid(inner: Vec3[][]) {
  const grown = inner.map((ring) => {
    const mid = average(ring);
    return ring.map((point) => add(point, scale(normalize(sub(point, mid)), 0.2)));
  });
  const first = grown[0];
  const last = grown[grown.length - 1];
  const intoA = normalize(sub(average(first), average(grown[1])));
  const intoB = normalize(sub(average(last), average(grown[grown.length - 2])));
  return loftSectionRings([
    first.map((point) => add(point, scale(intoA, 1.6))),
    ...grown,
    last.map((point) => add(point, scale(intoB, 1.6))),
  ]);
}

function pathMesh(points: Vec3[]) {
  const rings = points.map((point, index) => {
    const next = points[Math.min(points.length - 1, index + 1)];
    const prev = points[Math.max(0, index - 1)];
    let normal = sub(next, prev);
    if (length(normal) < 1e-5) normal = { x: 0, y: 0, z: 1 };
    normal = normalize(normal);
    let width = reject({ x: 0, y: 1, z: 0 }, normal);
    if (length(width) < 1e-4) width = { x: 1, y: 0, z: 0 };
    width = normalize(width);
    const up = normalize(cross(normal, width));
    return Array.from({ length: 8 }, (_, sample) => {
      const angle = (sample / 8) * Math.PI * 2;
      return add(point, add(scale(width, Math.cos(angle) * 0.12), scale(up, Math.sin(angle) * 0.12)));
    });
  });
  return loftSectionRings(rings);
}

function figureMesh(feet: Vec3) {
  const width = HABITABLE_CLEARANCE.figureWidth / 2;
  const depth = 0.3 / CELL_METERS;
  const height = HABITABLE_CLEARANCE.figureHeight;
  const corners = [
    { x: -width, y: 0, z: -depth },
    { x: width, y: 0, z: -depth },
    { x: width, y: 0, z: depth },
    { x: -width, y: 0, z: depth },
  ];
  const ring = (y: number) => corners.map((corner) => ({ x: feet.x + corner.x, y: feet.y + y, z: feet.z + corner.z }));
  return loftSectionRings([ring(0), ring(height)]);
}

function shellMesh(outer: Vec3[][], inner: Vec3[][]): IsoMesh {
  const count = outer[0].length;
  const positions: number[] = [];
  const indices: number[] = [];
  const pushRing = (ring: Vec3[]) => {
    const start = positions.length / 3;
    ring.forEach((point) => positions.push(point.x, point.y, point.z));
    return start;
  };
  const outerStart = outer.map(pushRing);
  const innerStart = inner.map(pushRing);
  const wall = (starts: number[], flip: boolean) => {
    for (let station = 0; station < starts.length - 1; station += 1) {
      for (let sample = 0; sample < count; sample += 1) {
        const next = (sample + 1) % count;
        const a = starts[station] + sample;
        const b = starts[station] + next;
        const c = starts[station + 1] + next;
        const d = starts[station + 1] + sample;
        indices.push(...(flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d]));
      }
    }
  };
  wall(outerStart, false);
  wall(innerStart, true);
  for (const end of [0, outer.length - 1]) {
    for (let sample = 0; sample < count; sample += 1) {
      const next = (sample + 1) % count;
      const a = outerStart[end] + sample;
      const b = outerStart[end] + next;
      const c = innerStart[end] + next;
      const d = innerStart[end] + sample;
      indices.push(...(end === 0 ? [a, d, b, b, d, c] : [a, b, d, b, c, d]));
    }
  }
  const mesh = {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
  return shade(mesh);
}

function shade(mesh: IsoMesh): IsoMesh {
  const normals = new Float32Array(mesh.positions.length);
  for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
    const normal = cross(
      sub(read(mesh.positions, mesh.indices[index + 1]), read(mesh.positions, mesh.indices[index])),
      sub(read(mesh.positions, mesh.indices[index + 2]), read(mesh.positions, mesh.indices[index])),
    );
    addNormal(normals, mesh.indices[index], normal);
    addNormal(normals, mesh.indices[index + 1], normal);
    addNormal(normals, mesh.indices[index + 2], normal);
  }
  for (let index = 0; index < normals.length / 3; index += 1) {
    const normal = read(normals, index);
    const span = length(normal);
    write(normals, index, span > 1e-8 ? scale(normal, 1 / span) : { x: 0, y: 1, z: 0 });
  }
  return { ...mesh, normals };
}

function gravityFrame(ring: Vec3[]) {
  const origin = average(ring);
  const next = ring[(ring.length * 0.25) | 0];
  let normal = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const following = ring[(index + 1) % ring.length];
    normal = add(normal, cross(current, following));
  }
  if (length(normal) < 1e-6) normal = cross(sub(ring[1] ?? next, ring[0]), sub(next, ring[0]));
  if (length(normal) < 1e-6) normal = { x: 0, y: 0, z: 1 };
  normal = normalize(normal);
  let up = reject({ x: 0, y: 1, z: 0 }, normal);
  if (length(up) < 0.25) up = reject({ x: 1, y: 0, z: 0 }, normal);
  up = normalize(up);
  const width = normalize(cross(normal, up));
  return { origin, width, up };
}

function project(ring: Vec3[], frame: { origin: Vec3; width: Vec3; up: Vec3 }) {
  return ring.map((point) => {
    const delta = sub(point, frame.origin);
    return { u: dot(delta, frame.width), v: dot(delta, frame.up) };
  });
}

function addNormal(normals: Float32Array, index: number, normal: Vec3) {
  normals[index * 3] += normal.x;
  normals[index * 3 + 1] += normal.y;
  normals[index * 3 + 2] += normal.z;
}

function average(points: Vec3[]): Vec3 {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / Math.max(1, points.length));
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector: Vec3, factor: number): Vec3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function length(vector: Vec3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector: Vec3) {
  const span = length(vector);
  return span > 1e-8 ? scale(vector, 1 / span) : { x: 0, y: 0, z: 0 };
}

function reject(vector: Vec3, normal: Vec3) {
  return sub(vector, scale(normal, dot(vector, normal)));
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(a, scale(sub(b, a), t));
}

function read(values: Float32Array, index: number): Vec3 {
  return { x: values[index * 3], y: values[index * 3 + 1], z: values[index * 3 + 2] };
}

function write(values: Float32Array, index: number, point: Vec3) {
  values[index * 3] = point.x;
  values[index * 3 + 1] = point.y;
  values[index * 3 + 2] = point.z;
}
