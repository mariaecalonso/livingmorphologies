import type { ManifoldToplevel } from "manifold-3d/manifold";
import {
  BufferAttribute,
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  ShapeGeometry,
  Vector2,
} from "three";
import { siteGridPositions } from "@/lib/skill5/grid";
import type { SiteBuilding, SiteRoad, XZ } from "@/lib/skill5/site-model";

function shapeFromRing(ring: readonly XZ[]) {
  return new Shape(ring.map(([x, z]) => new Vector2(x, -z)));
}

/** Display-only study window, in site feet. East and west stay put. North stops short of NE 17th Terrace, south short of NE 11th Street, one block past the previous edge. */
export const STUDY_LIMIT = { minX: -1520, maxX: 1100, minZ: -1310, maxZ: 1160 };

export function ringCentroid(ring: readonly XZ[]): XZ {
  let x = 0;
  let z = 0;
  for (const point of ring) {
    x += point[0];
    z += point[1];
  }
  const count = Math.max(1, ring.length);
  return [x / count, z / count];
}

export function inStudy(x: number, z: number, box = STUDY_LIMIT) {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
}

function liang(a: XZ, b: XZ, box: typeof STUDY_LIMIT) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  const hit = clip(-dx, a[0] - box.minX) && clip(dx, box.maxX - a[0]) && clip(-dz, a[1] - box.minZ) && clip(dz, box.maxZ - a[1]);
  return hit ? { t0, t1, dx, dz } : null;
}

/** Display-only. Keeps the portions of a path that fall inside the study window. */
export function clipPath(path: readonly XZ[], box = STUDY_LIMIT): XZ[][] {
  const runs: XZ[][] = [];
  let run: XZ[] = [];
  const emit = () => {
    if (run.length >= 2) runs.push(run);
    run = [];
  };
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const span = liang(start, end, box);
    if (!span) {
      emit();
      continue;
    }
    const from: XZ = [start[0] + span.dx * span.t0, start[1] + span.dz * span.t0];
    const to: XZ = [start[0] + span.dx * span.t1, start[1] + span.dz * span.t1];
    const last = run[run.length - 1];
    if (!last || Math.hypot(last[0] - from[0], last[1] - from[1]) > 0.5) {
      emit();
      run.push(from);
    }
    run.push(to);
    if (span.t1 < 1 - 1e-6) emit();
  }
  emit();
  return runs;
}

function mixSample(a: number | null | undefined, b: number | null | undefined, t: number) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
  if (typeof a === "number") return a;
  return typeof b === "number" ? b : null;
}

/** Display-only. Cuts road ribbons at the study window and keeps deck and width samples on the remaining vertices. */
export function clipRoad(road: SiteRoad, box = STUDY_LIMIT): SiteRoad[] {
  const pieces: SiteRoad[] = [];
  let path: XZ[] = [];
  let halfWidthFeet: Array<number | null> = [];
  let centerShiftFeet: Array<number | null> = [];
  let deckFeet: Array<number | null> = [];
  const emit = () => {
    if (path.length >= 2) pieces.push({ ...road, path, halfWidthFeet, centerShiftFeet, deckFeet });
    path = [];
    halfWidthFeet = [];
    centerShiftFeet = [];
    deckFeet = [];
  };
  for (let index = 0; index < road.path.length - 1; index += 1) {
    const start = road.path[index];
    const end = road.path[index + 1];
    const span = liang(start, end, box);
    if (!span) {
      emit();
      continue;
    }
    const from: XZ = [start[0] + span.dx * span.t0, start[1] + span.dz * span.t0];
    const to: XZ = [start[0] + span.dx * span.t1, start[1] + span.dz * span.t1];
    const fromSample = {
      half: mixSample(road.halfWidthFeet?.[index], road.halfWidthFeet?.[index + 1], span.t0),
      shift: mixSample(road.centerShiftFeet?.[index], road.centerShiftFeet?.[index + 1], span.t0),
      deck: mixSample(road.deckFeet?.[index], road.deckFeet?.[index + 1], span.t0),
    };
    const toSample = {
      half: mixSample(road.halfWidthFeet?.[index], road.halfWidthFeet?.[index + 1], span.t1),
      shift: mixSample(road.centerShiftFeet?.[index], road.centerShiftFeet?.[index + 1], span.t1),
      deck: mixSample(road.deckFeet?.[index], road.deckFeet?.[index + 1], span.t1),
    };
    const last = path[path.length - 1];
    if (!last || Math.hypot(last[0] - from[0], last[1] - from[1]) > 0.5) {
      emit();
      path.push(from);
      halfWidthFeet.push(fromSample.half);
      centerShiftFeet.push(fromSample.shift);
      deckFeet.push(fromSample.deck);
    }
    path.push(to);
    halfWidthFeet.push(toSample.half);
    centerShiftFeet.push(toSample.shift);
    deckFeet.push(toSample.deck);
    if (span.t1 < 1 - 1e-6) emit();
  }
  emit();
  return pieces;
}

/** Display-only. Clips a ring to the study window. Shoreline vertices inside the window stay. */
export function clipPolygon(ring: readonly XZ[], box = STUDY_LIMIT): XZ[] {
  let output = ring.slice();
  const edges: Array<{ inside: (point: XZ) => boolean; cross: (from: XZ, to: XZ) => XZ }> = [
    { inside: (point) => point[0] >= box.minX, cross: (from, to) => { const t = (box.minX - from[0]) / (to[0] - from[0]); return [box.minX, from[1] + (to[1] - from[1]) * t]; } },
    { inside: (point) => point[0] <= box.maxX, cross: (from, to) => { const t = (box.maxX - from[0]) / (to[0] - from[0]); return [box.maxX, from[1] + (to[1] - from[1]) * t]; } },
    { inside: (point) => point[1] >= box.minZ, cross: (from, to) => { const t = (box.minZ - from[1]) / (to[1] - from[1]); return [from[0] + (to[0] - from[0]) * t, box.minZ]; } },
    { inside: (point) => point[1] <= box.maxZ, cross: (from, to) => { const t = (box.maxZ - from[1]) / (to[1] - from[1]); return [from[0] + (to[0] - from[0]) * t, box.maxZ]; } },
  ];
  for (const edge of edges) {
    if (output.length === 0) break;
    const input = output;
    output = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      const previous = input[(index + input.length - 1) % input.length];
      const currentIn = edge.inside(current);
      const previousIn = edge.inside(previous);
      if (currentIn !== previousIn) output.push(edge.cross(previous, current));
      if (currentIn) output.push(current);
    }
  }
  return output;
}

/** Display-only. The study rectangle west of the clipped shoreline. Shares the coast with the water and does not cover the bay. */
export function studyLandRing(water: readonly XZ[], box = STUDY_LIMIT): XZ[] {
  const shore = clipPolygon(water, box).filter(([x]) => x < box.maxX - 1);
  if (shore.length < 2) {
    return [
      [box.minX, box.minZ],
      [box.maxX, box.minZ],
      [box.maxX, box.maxZ],
      [box.minX, box.maxZ],
    ];
  }
  return [
    [box.minX, box.minZ],
    ...shore,
    [box.minX, box.maxZ],
  ];
}

/** A thin vertical volume. Roads use about half a foot; the water cap stays just below them. */
export function slabGeometry(ring: readonly XZ[], thickness: number, y: number) {
  const geometry = prismGeometry(ring, thickness);
  geometry.translate(0, y, 0);
  return geometry;
}

export function flatGeometry(ring: readonly XZ[], y: number) {
  const geometry = new ShapeGeometry(shapeFromRing(ring));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

export function prismGeometry(ring: readonly XZ[], height: number, holes: readonly (readonly XZ[])[] = []) {
  const shape = shapeFromRing(ring);
  for (const hole of holes) {
    if (hole.length >= 3) shape.holes.push(new Path(hole.map(([x, z]) => new Vector2(x, -z))));
  }
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function mergeGeometries(geometries: readonly BufferGeometry[]) {
  const merged = new BufferGeometry();
  if (geometries.length === 0) {
    merged.setAttribute("position", new Float32BufferAttribute([], 3));
    return merged;
  }
  let vertices = 0;
  let indices = 0;
  for (const geometry of geometries) {
    vertices += geometry.getAttribute("position").count;
    indices += geometry.getIndex()?.count ?? geometry.getAttribute("position").count;
  }
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const index = new Uint32Array(indices);
  let vertexBase = 0;
  let indexBase = 0;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    positions.set(position.array as Float32Array, vertexBase * 3);
    if (normal) normals.set(normal.array as Float32Array, vertexBase * 3);
    const source = geometry.getIndex();
    if (source) {
      for (let item = 0; item < source.count; item += 1) index[indexBase + item] = source.getX(item) + vertexBase;
      indexBase += source.count;
    } else {
      for (let item = 0; item < position.count; item += 1) index[indexBase + item] = vertexBase + item;
      indexBase += position.count;
    }
    vertexBase += position.count;
    geometry.dispose();
  }
  merged.setAttribute("position", new Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  merged.setIndex(new BufferAttribute(index, 1));
  return merged;
}

export function pathAttribute(paths: readonly (readonly XZ[])[], y: number, close: boolean) {
  const positions: number[] = [];
  for (const path of paths) {
    const count = close ? path.length : path.length - 1;
    for (let index = 0; index < count; index += 1) {
      const [x0, z0] = path[index];
      const [x1, z1] = path[(index + 1) % path.length];
      positions.push(x0, y, z0, x1, y, z1);
    }
  }
  return new Float32BufferAttribute(positions, 3);
}

export function loopAttribute(rings: readonly (readonly XZ[])[], y: number) {
  const positions: number[] = [];
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const [x0, z0] = ring[index];
      const [x1, z1] = ring[(index + 1) % ring.length];
      positions.push(x0, y, z0, x1, y, z1);
    }
  }
  return new Float32BufferAttribute(positions, 3);
}

export function attributeGeometry(attribute: Float32BufferAttribute) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", attribute);
  return geometry;
}

type RoadStation = {
  leftX: number;
  leftZ: number;
  rightX: number;
  rightZ: number;
  top: number;
  bottom: number;
};

function roadFace(positions: number[], indices: number[], corners: ReadonlyArray<readonly [number, number, number]>) {
  const base = positions.length / 3;
  for (const [x, y, z] of corners) positions.push(x, y, z);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function roadStations(road: SiteRoad, y: number, thickness: number, deck: boolean): RoadStation[] {
  const half = road.displayHalfWidthFeet;
  const samples = road.path.map((point, index) => {
    const previous = road.path[Math.max(0, index - 1)];
    const next = road.path[Math.min(road.path.length - 1, index + 1)];
    let dx = next[0] - previous[0];
    let dz = next[1] - previous[1];
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    const measuredHalf = road.halfWidthFeet?.[index];
    const width = typeof measuredHalf === "number" ? measuredHalf : half;
    const shift = road.centerShiftFeet?.[index];
    const lateral = typeof shift === "number" ? shift : 0;
    const cx = point[0] - dz * lateral;
    const cz = point[1] + dx * lateral;
    const elevation = road.deckFeet?.[index];
    const surface = typeof elevation === "number" ? elevation : y;
    return {
      cx,
      cz,
      leftX: cx - dz * width,
      leftZ: cz + dx * width,
      rightX: cx + dz * width,
      rightZ: cz - dx * width,
      surface,
      width,
    };
  });
  if (samples.length >= 2) {
    const stretch = (index: number, other: number) => {
      const sample = samples[index];
      let dx = sample.cx - samples[other].cx;
      let dz = sample.cz - samples[other].cz;
      const span = Math.hypot(dx, dz) || 1;
      const extra = Math.min(Math.max(sample.width, 12), 36, span * 0.45);
      dx /= span;
      dz /= span;
      sample.cx += dx * extra;
      sample.cz += dz * extra;
      sample.leftX += dx * extra;
      sample.leftZ += dz * extra;
      sample.rightX += dx * extra;
      sample.rightZ += dz * extra;
    };
    stretch(0, 1);
    stretch(samples.length - 1, samples.length - 2);
  }
  return samples.map((sample) => {
    const bridged = deck && sample.surface > 3;
    return {
      leftX: sample.leftX,
      leftZ: sample.leftZ,
      rightX: sample.rightX,
      rightZ: sample.rightZ,
      top: bridged ? sample.surface : thickness,
      bottom: bridged ? Math.max(1, sample.surface - thickness) : 0.05,
    };
  });
}

/** A road volume: deck, soffit, edges, and end caps. */
export function ribbonGeometry(roads: readonly SiteRoad[], y: number, thickness = 4, deck = false) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const road of roads) {
    const stations = roadStations(road, y, thickness, deck);
    for (let index = 0; index < stations.length - 1; index += 1) {
      const current = stations[index];
      const next = stations[index + 1];
      roadFace(positions, indices, [
        [current.leftX, current.top, current.leftZ],
        [current.rightX, current.top, current.rightZ],
        [next.rightX, next.top, next.rightZ],
        [next.leftX, next.top, next.leftZ],
      ]);
      roadFace(positions, indices, [
        [current.rightX, current.bottom, current.rightZ],
        [current.leftX, current.bottom, current.leftZ],
        [next.leftX, next.bottom, next.leftZ],
        [next.rightX, next.bottom, next.rightZ],
      ]);
      roadFace(positions, indices, [
        [current.leftX, current.bottom, current.leftZ],
        [current.leftX, current.top, current.leftZ],
        [next.leftX, next.top, next.leftZ],
        [next.leftX, next.bottom, next.leftZ],
      ]);
      roadFace(positions, indices, [
        [current.rightX, current.top, current.rightZ],
        [current.rightX, current.bottom, current.rightZ],
        [next.rightX, next.bottom, next.rightZ],
        [next.rightX, next.top, next.rightZ],
      ]);
    }
    const first = stations[0];
    const last = stations[stations.length - 1];
    if (stations.length >= 2 && first && last) {
      roadFace(positions, indices, [
        [first.rightX, first.top, first.rightZ],
        [first.leftX, first.top, first.leftZ],
        [first.leftX, first.bottom, first.leftZ],
        [first.rightX, first.bottom, first.rightZ],
      ]);
      roadFace(positions, indices, [
        [last.leftX, last.top, last.leftZ],
        [last.rightX, last.top, last.rightZ],
        [last.rightX, last.bottom, last.rightZ],
        [last.leftX, last.bottom, last.leftZ],
      ]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const DECK_SLAB = 2.4;
const DECK_LEVEL_FEET = 8;

type DeckSample = { x: number; z: number; half: number; top: number };
type DeckRun = { samples: DeckSample[]; capStart: boolean; capEnd: boolean };
type DeckFrame = { cx: number; cz: number; nx: number; nz: number; left: number; right: number; top: number };

function deckUnit(ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
}

function deckOutward(samples: readonly DeckSample[], end: number): [number, number] {
  if (end === 0) return deckUnit(samples[1].x, samples[1].z, samples[0].x, samples[0].z);
  const last = samples.length - 1;
  return deckUnit(samples[last - 1].x, samples[last - 1].z, samples[last].x, samples[last].z);
}

function deckEnd(run: DeckRun, end: number) {
  return end === 0 ? run.samples[0] : run.samples[run.samples.length - 1];
}

function closestDeck(run: DeckRun, x: number, z: number) {
  let best = Infinity;
  let top = run.samples[0].top;
  let half = run.samples[0].half;
  let px = run.samples[0].x;
  let pz = run.samples[0].z;
  let tx = 1;
  let tz = 0;
  let atEnd = true;
  for (let index = 0; index < run.samples.length - 1; index += 1) {
    const start = run.samples[index];
    const finish = run.samples[index + 1];
    const dx = finish.x - start.x;
    const dz = finish.z - start.z;
    const length2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / length2));
    const qx = start.x + dx * t;
    const qz = start.z + dz * t;
    const distance = Math.hypot(x - qx, z - qz);
    if (distance < best) {
      best = distance;
      top = start.top + (finish.top - start.top) * t;
      half = start.half + (finish.half - start.half) * t;
      px = qx;
      pz = qz;
      const span = Math.hypot(dx, dz) || 1;
      tx = dx / span;
      tz = dz / span;
      atEnd = t < 0.04 || t > 0.96;
    }
  }
  return { distance: best, top, half, x: px, z: pz, atEnd, tx, tz };
}

function bridgeClears(from: DeckSample, to: DeckSample, runs: readonly DeckRun[], left: number, right: number) {
  for (let step = 1; step < 6; step += 1) {
    const t = step / 6;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const top = from.top + (to.top - from.top) * t;
    for (let index = 0; index < runs.length; index += 1) {
      if (index === left || index === right) continue;
      const hit = closestDeck(runs[index], x, z);
      if (hit.distance < Math.min(hit.half, 18) && Math.abs(hit.top - top) > 10) return false;
    }
  }
  return true;
}

function canJoinDecks(from: DeckSample, fromOut: [number, number], to: DeckSample, toOut: [number, number], runs: readonly DeckRun[], left: number, right: number) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const gap = Math.hypot(dx, dz);
  if (gap > 180) return false;
  if (gap < 1) return fromOut[0] * toOut[0] + fromOut[1] * toOut[1] < -0.5;
  const ahead = (dx * fromOut[0] + dz * fromOut[1]) / gap;
  const back = (-dx * toOut[0] + -dz * toOut[1]) / gap;
  if (ahead < 0.72 || back < 0.72) return false;
  if (gap > 90 && (ahead < 0.9 || back < 0.9)) return false;
  const rise = Math.abs(from.top - to.top);
  if (rise > 14) return false;
  if (gap > 1 && rise > DECK_LEVEL_FEET && rise / gap > 0.055) return false;
  if (gap > 1 && !inStudy((from.x + to.x) / 2, (from.z + to.z) / 2)) return false;
  if (gap > 12 && !bridgeClears(from, to, runs, left, right)) return false;
  return true;
}

function orderedSamples(run: DeckRun, end: number, atTail: boolean) {
  const samples = run.samples.map((sample) => ({ ...sample }));
  const reverse = atTail ? end === 0 : end !== 0;
  if (reverse) samples.reverse();
  return samples;
}

/** Display-only. Facing ends of one deck become one path. A steep chord across another level stays apart. */
function joinDeckRuns(runs: DeckRun[]) {
  const open = runs.map((run) => ({ ...run, samples: run.samples.map((sample) => ({ ...sample })) }));
  for (;;) {
    let best: { gap: number; left: number; leftEnd: number; right: number; rightEnd: number } | null = null;
    for (let left = 0; left < open.length; left += 1) {
      if (open[left].samples.length < 2) continue;
      for (let right = left + 1; right < open.length; right += 1) {
        if (open[right].samples.length < 2) continue;
        for (const leftEnd of [0, 1]) {
          for (const rightEnd of [0, 1]) {
            const from = deckEnd(open[left], leftEnd);
            const to = deckEnd(open[right], rightEnd);
            const gap = Math.hypot(from.x - to.x, from.z - to.z);
            if (best && gap >= best.gap) continue;
            if (!canJoinDecks(from, deckOutward(open[left].samples, leftEnd), to, deckOutward(open[right].samples, rightEnd), open, left, right)) continue;
            best = { gap, left, leftEnd, right, rightEnd };
          }
        }
      }
    }
    if (!best) break;
    const head = orderedSamples(open[best.left], best.leftEnd, true);
    const tail = orderedSamples(open[best.right], best.rightEnd, false);
    const last = head[head.length - 1];
    if (Math.hypot(last.x - tail[0].x, last.z - tail[0].z) < 1) head.pop();
    open[best.left] = { samples: [...head, ...tail], capStart: true, capEnd: true };
    open.splice(best.right, 1);
  }
  return open;
}

/** Display-only. A ramp end lands on the edge of a deck at the same level instead of running through it. */
function landDeckEnds(runs: DeckRun[]) {
  runs.forEach((run, index) => {
    for (const end of [0, 1]) {
      const sample = deckEnd(run, end);
      const outward = deckOutward(run.samples, end);
      let best: { distance: number; half: number; top: number; x: number; z: number } | null = null;
      for (let other = 0; other < runs.length; other += 1) {
        if (other === index) continue;
        const hit = closestDeck(runs[other], sample.x, sample.z);
        if (hit.atEnd || hit.distance > hit.half + 80) continue;
        if (Math.abs(hit.top - sample.top) > DECK_LEVEL_FEET) continue;
        const dx = hit.x - sample.x;
        const dz = hit.z - sample.z;
        const reach = Math.hypot(dx, dz) || 1;
        const tangent = deckUnit(runs[other].samples[0].x, runs[other].samples[0].z, runs[other].samples[runs[other].samples.length - 1].x, runs[other].samples[runs[other].samples.length - 1].z);
        if (Math.abs(outward[0] * tangent[0] + outward[1] * tangent[1]) > 0.85) continue;
        if (hit.distance > hit.half && (dx * outward[0] + dz * outward[1]) / reach < 0.65) continue;
        if (!best || hit.distance < best.distance) best = { distance: hit.distance, half: hit.half, top: hit.top, x: hit.x, z: hit.z };
      }
      if (!best) continue;
      const awayX = sample.x - best.x;
      const awayZ = sample.z - best.z;
      const away = Math.hypot(awayX, awayZ);
      const place = best.half + 0.5;
      const next = away < 1
        ? { x: sample.x - outward[0] * place, z: sample.z - outward[1] * place }
        : { x: best.x + (awayX / away) * place, z: best.z + (awayZ / away) * place };
      const previous = run.samples[end === 0 ? 1 : run.samples.length - 2];
      if (Math.hypot(next.x - previous.x, next.z - previous.z) < 8) continue;
      if (Math.hypot(next.x - sample.x, next.z - sample.z) > 80) continue;
      sample.x = next.x;
      sample.z = next.z;
      sample.top = best.top;
      if (end === 0) run.capStart = false;
      else run.capEnd = false;
    }
  });
}

function deckFrames(samples: readonly DeckSample[]): DeckFrame[] {
  const frames: DeckFrame[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const incoming = index === 0 ? deckUnit(current.x, current.z, next.x, next.z) : deckUnit(previous.x, previous.z, current.x, current.z);
    const outgoing = index === samples.length - 1 ? deckUnit(previous.x, previous.z, current.x, current.z) : deckUnit(current.x, current.z, next.x, next.z);
    const leftIn: [number, number] = [-incoming[1], incoming[0]];
    const leftOut: [number, number] = [-outgoing[1], outgoing[0]];
    const dot = leftIn[0] * leftOut[0] + leftIn[1] * leftOut[1];
    const push = (nx: number, nz: number, offset: number) => {
      frames.push({ cx: current.x, cz: current.z, nx, nz, left: offset, right: offset, top: current.top });
    };
    if (index > 0 && index < samples.length - 1 && dot < 0.25) {
      push(leftIn[0], leftIn[1], current.half);
      push(leftOut[0], leftOut[1], current.half);
    } else {
      const mixedX = leftIn[0] + leftOut[0];
      const mixedZ = leftIn[1] + leftOut[1];
      const length = Math.hypot(mixedX, mixedZ) || 1;
      const offset = Math.min(current.half * 1.75, current.half / Math.max(0.4, Math.sqrt((1 + dot) / 2)));
      push(mixedX / length, mixedZ / length, offset);
    }
  }
  return frames;
}

/** Display-only. Parallel decks at one level meet at the midline instead of stacking. */
function separateParallelDecks(frames: DeckFrame[][]) {
  for (let left = 0; left < frames.length; left += 1) {
    for (let right = left + 1; right < frames.length; right += 1) {
      const pull = (from: DeckFrame[], toward: DeckFrame[]) => {
        for (const frame of from) {
          let best = Infinity;
          let top = frame.top;
          let qx = frame.cx;
          let qz = frame.cz;
          let tx = 1;
          let tz = 0;
          for (let index = 0; index < toward.length - 1; index += 1) {
            const start = toward[index];
            const finish = toward[index + 1];
            const dx = finish.cx - start.cx;
            const dz = finish.cz - start.cz;
            const length2 = dx * dx + dz * dz || 1;
            const t = Math.max(0, Math.min(1, ((frame.cx - start.cx) * dx + (frame.cz - start.cz) * dz) / length2));
            const x = start.cx + dx * t;
            const z = start.cz + dz * t;
            const distance = Math.hypot(frame.cx - x, frame.cz - z);
            if (distance < best) {
              best = distance;
              top = start.top + (finish.top - start.top) * t;
              qx = x;
              qz = z;
              const span = Math.hypot(dx, dz) || 1;
              tx = dx / span;
              tz = dz / span;
            }
          }
          if (best < 8 || best > frame.left + frame.right) continue;
          if (Math.abs(top - frame.top) > DECK_LEVEL_FEET) continue;
          if (Math.abs(frame.nx * -tz + frame.nz * tx) < 0.7) continue;
          const side = frame.nx * (qx - frame.cx) + frame.nz * (qz - frame.cz);
          if (side > 0) frame.left = Math.min(frame.left, best / 2);
          else frame.right = Math.min(frame.right, best / 2);
        }
      };
      pull(frames[left], frames[right]);
      pull(frames[right], frames[left]);
    }
  }
}

function deckLength(run: DeckRun) {
  let length = 0;
  for (let index = 0; index < run.samples.length - 1; index += 1) {
    length += Math.hypot(run.samples[index + 1].x - run.samples[index].x, run.samples[index + 1].z - run.samples[index].z);
  }
  return length;
}

function sampleAt(from: DeckSample, to: DeckSample, t: number): DeckSample {
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
    half: from.half + (to.half - from.half) * t,
    top: from.top + (to.top - from.top) * t,
  };
}

/** Display-only. Where a narrower deck runs through a wider one at the same level, it stops at the edge. */
function cutCoveredDecks(runs: DeckRun[]) {
  const ranked = runs.map((run, index) => ({ run, index, half: Math.max(...run.samples.map((sample) => sample.half)), length: deckLength(run) }));
  const outranks = (other: (typeof ranked)[number], item: (typeof ranked)[number]) => {
    if (other.half > item.half + 3) return true;
    if (item.half > other.half + 3) return false;
    if (other.length > item.length + 10) return true;
    if (item.length > other.length + 10) return false;
    return other.index < item.index;
  };
  const covered = (item: (typeof ranked)[number], sample: DeckSample, tangent: [number, number]) => ranked.some((other) => {
    if (other === item || !outranks(other, item)) return false;
    const hit = closestDeck(other.run, sample.x, sample.z);
    if (Math.abs(hit.top - sample.top) > DECK_LEVEL_FEET) return false;
    const aligned = Math.abs(tangent[0] * hit.tx + tangent[1] * hit.tz) >= 0.7;
    if (aligned) return hit.distance < 12;
    return hit.distance < hit.half + sample.half + 0.5;
  });
  const next: DeckRun[] = [];
  for (const item of ranked) {
    const chain: DeckSample[] = [];
    const flush = () => {
      const unique: DeckSample[] = [];
      for (const sample of chain) {
        const last = unique[unique.length - 1];
        if (!last || Math.hypot(last.x - sample.x, last.z - sample.z) > 1) unique.push(sample);
      }
      if (unique.length >= 2) next.push({ samples: unique, capStart: true, capEnd: true });
      chain.length = 0;
    };
    for (let index = 0; index < item.run.samples.length - 1; index += 1) {
      const from = item.run.samples[index];
      const to = item.run.samples[index + 1];
      const tangent = deckUnit(from.x, from.z, to.x, to.z);
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      const steps = Math.max(1, Math.round(length / 24));
      let previous = sampleAt(from, to, 0);
      let previousInside = covered(item, previous, tangent);
      if (index === 0 && !previousInside) chain.push(previous);
      for (let step = 1; step <= steps; step += 1) {
        const sample = sampleAt(from, to, step / steps);
        const isInside = covered(item, sample, tangent);
        if (previousInside !== isInside) {
          let low = (step - 1) / steps;
          let high = step / steps;
          for (let pass = 0; pass < 8; pass += 1) {
            const mid = (low + high) / 2;
            if (covered(item, sampleAt(from, to, mid), tangent) === previousInside) low = mid;
            else high = mid;
          }
          const edge = sampleAt(from, to, previousInside ? high : low);
          chain.push(edge);
          if (!previousInside) flush();
        } else if (!isInside && step < steps) chain.push(sample);
        previous = sample;
        previousInside = isInside;
      }
      if (!previousInside) chain.push(to);
    }
    flush();
  }
  return next;
}

function deckVertex(positions: number[], x: number, y: number, z: number) {
  const index = positions.length / 3;
  positions.push(x, y, z);
  return index;
}

function deckQuad(indices: number[], a: number, b: number, c: number, d: number) {
  indices.push(a, b, c, a, c, d);
}

/** Display-only. Elevated paths become continuous decks. Grade-separated crossings stay separate surfaces. */
export function elevatedDeckGeometry(roads: readonly SiteRoad[]) {
  const runs = joinDeckRuns(roads.filter((road) => road.path.length >= 2).map((road) => ({
    capStart: true,
    capEnd: true,
    samples: road.path.map((point, index) => ({
      x: point[0],
      z: point[1],
      half: road.displayHalfWidthFeet,
      top: typeof road.deckFeet?.[index] === "number" ? road.deckFeet[index] as number : 0.4,
    })),
  })));
  landDeckEnds(runs);
  const opened = cutCoveredDecks(runs);
  const framed = opened.map((run) => deckFrames(run.samples));
  separateParallelDecks(framed);
  const positions: number[] = [];
  const indices: number[] = [];
  framed.forEach((frames, runIndex) => {
    const stations = frames.map((frame) => {
      const surface = frame.top > 3 ? frame.top : DECK_SLAB;
      return {
        lx: frame.cx + frame.nx * frame.left,
        lz: frame.cz + frame.nz * frame.left,
        rx: frame.cx - frame.nx * frame.right,
        rz: frame.cz - frame.nz * frame.right,
        top: surface,
        bottom: frame.top > 3 ? Math.max(1, frame.top - DECK_SLAB) : 0.05,
      };
    });
    if (stations.length < 2) return;
    const leftTop = stations.map((station) => deckVertex(positions, station.lx, station.top, station.lz));
    const rightTop = stations.map((station) => deckVertex(positions, station.rx, station.top, station.rz));
    const leftBottom = stations.map((station) => deckVertex(positions, station.lx, station.bottom, station.lz));
    const rightBottom = stations.map((station) => deckVertex(positions, station.rx, station.bottom, station.rz));
    for (let index = 0; index < stations.length - 1; index += 1) {
      deckQuad(indices, leftTop[index], rightTop[index], rightTop[index + 1], leftTop[index + 1]);
      deckQuad(indices, rightBottom[index], leftBottom[index], leftBottom[index + 1], rightBottom[index + 1]);
      deckQuad(indices, leftBottom[index], leftTop[index], leftTop[index + 1], leftBottom[index + 1]);
      deckQuad(indices, rightTop[index], rightBottom[index], rightBottom[index + 1], rightTop[index + 1]);
    }
    const run = opened[runIndex];
    const first = stations[0];
    const last = stations[stations.length - 1];
    if (run.capStart) {
      const a = deckVertex(positions, first.rx, first.top, first.rz);
      const b = deckVertex(positions, first.lx, first.top, first.lz);
      const c = deckVertex(positions, first.lx, first.bottom, first.lz);
      const d = deckVertex(positions, first.rx, first.bottom, first.rz);
      deckQuad(indices, a, b, c, d);
    }
    if (run.capEnd) {
      const a = deckVertex(positions, last.lx, last.top, last.lz);
      const b = deckVertex(positions, last.rx, last.top, last.rz);
      const c = deckVertex(positions, last.rx, last.bottom, last.rz);
      const d = deckVertex(positions, last.lx, last.bottom, last.lz);
      deckQuad(indices, a, b, c, d);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function gridAttribute(ring: readonly XZ[], y: number) {
  return new Float32BufferAttribute(siteGridPositions(ring, y), 3);
}

function deviation(point: XZ, start: XZ, end: XZ) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs((point[0] - start[0]) * dz - (point[1] - start[1]) * dx) / length;
}

function simplifyOpen(points: readonly XZ[], epsilon: number): XZ[] {
  if (points.length < 3) return points.map((point) => [point[0], point[1]]);
  let farthest = 0;
  let index = 0;
  const last = points.length - 1;
  for (let cursor = 1; cursor < last; cursor += 1) {
    const distance = deviation(points[cursor], points[0], points[last]);
    if (distance > farthest) {
      farthest = distance;
      index = cursor;
    }
  }
  if (farthest > epsilon) {
    const left = simplifyOpen(points.slice(0, index + 1), epsilon);
    const right = simplifyOpen(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [[points[0][0], points[0][1]], [points[last][0], points[last][1]]];
}

function dedupe(points: readonly XZ[]) {
  const next: XZ[] = [];
  for (const point of points) {
    const previous = next[next.length - 1];
    if (!previous || Math.hypot(previous[0] - point[0], previous[1] - point[1]) > 0.5) next.push([point[0], point[1]]);
  }
  if (next.length > 2) {
    const first = next[0];
    const last = next[next.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 0.5) next.pop();
  }
  return next.length >= 3 ? next : points.map((point) => [point[0], point[1]] as XZ);
}

function ringArea(ring: readonly XZ[]) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const next = ring[(index + 1) % ring.length];
    area += ring[index][0] * next[1] - next[0] * ring[index][1];
  }
  return Math.abs(area) / 2;
}

function removalArea(ring: readonly XZ[], index: number) {
  const previous = ring[(index - 1 + ring.length) % ring.length];
  const point = ring[index];
  const next = ring[(index + 1) % ring.length];
  return Math.abs((point[0] - previous[0]) * (next[1] - previous[1]) - (point[1] - previous[1]) * (next[0] - previous[0])) / 2;
}

function spanOf(ring: readonly XZ[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return Math.max(maxX - minX, maxZ - minZ);
}

/** Display grain for design context. A few feet of pavement, or a few degrees of street angle, is not drawn. */
const CONTEXT_GRAIN_FEET = 40;

/** A diagonal nick between two edges that already run with the compass becomes the corner those edges were approaching. A run of diagonals, such as a cranked hall, stays. */
function closeChamfers(ring: readonly XZ[]): XZ[] {
  const next = ring.map((point) => [point[0], point[1]] as XZ);
  const original = ringArea(next);
  if (original < 400 || next.length < 5) return next;
  const span = spanOf(next);
  const limit = span > 400 ? 150 : span > 160 ? CONTEXT_GRAIN_FEET : 16;
  const stepCap = Math.max(limit * limit, original * (span > 400 ? 0.08 : 0.04));
  const budget = original * (span > 400 ? 0.18 : 0.08);
  const axisLimit = (18 * Math.PI) / 180;
  let spent = 0;
  let guard = next.length;
  while (next.length > 4 && guard > 0) {
    guard -= 1;
    let best = Infinity;
    let at = -1;
    for (let index = 0; index < next.length; index += 1) {
      const previous = next[(index - 1 + next.length) % next.length];
      const point = next[index];
      const following = next[(index + 1) % next.length];
      const dx = following[0] - previous[0];
      const dz = following[1] - previous[1];
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const angle = Math.abs(Math.atan2(dz, dx));
      const toAxis = Math.min(angle % (Math.PI / 2), Math.PI / 2 - (angle % (Math.PI / 2)));
      if (toAxis > axisLimit) continue;
      const before = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      const after = Math.hypot(following[0] - point[0], following[1] - point[1]);
      if (before > length || after > length) continue;
      const rise = Math.abs(dx * (previous[1] - point[1]) - (previous[0] - point[0]) * dz) / length;
      if (rise > limit) continue;
      const area = removalArea(next, index);
      if (area < best) {
        best = area;
        at = index;
      }
    }
    if (at < 0 || best > stepCap || spent + best > budget) break;
    next.splice(at, 1);
    spent += best;
  }
  return dedupe(next);
}

/** Drops a short jog. The jog that counts as short grows with the footprint, so a city block loses a stair-step and a small building keeps its corners. */
function collapseNotches(ring: readonly XZ[]): XZ[] {
  const next = ring.map((point) => [point[0], point[1]] as XZ);
  const original = ringArea(next);
  if (original < 400 || next.length < 5) return next;
  const span = spanOf(next);
  const jog = span > 320 ? 80 : span > 160 ? CONTEXT_GRAIN_FEET : 20;
  const stepCap = Math.max(jog * jog, original * (span > 320 ? 0.06 : 0.04));
  const budget = original * (span > 320 ? 0.22 : span > 160 ? 0.12 : 0.1);
  let spent = 0;
  let guard = next.length;
  while (next.length > 4 && guard > 0) {
    guard -= 1;
    let best = Infinity;
    let at = -1;
    for (let index = 0; index < next.length; index += 1) {
      const previous = next[(index - 1 + next.length) % next.length];
      const point = next[index];
      const following = next[(index + 1) % next.length];
      const before = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      const after = Math.hypot(following[0] - point[0], following[1] - point[1]);
      if (Math.min(before, after) > jog) continue;
      const area = removalArea(next, index);
      if (area < best) {
        best = area;
        at = index;
      }
    }
    if (at < 0 || best > stepCap || spent + best > budget) break;
    next.splice(at, 1);
    spent += best;
  }
  return dedupe(next);
}

/** A long thin spur, or a vertex only a few feet off the line through its neighbors, becomes that line. */
function collapseSlivers(ring: readonly XZ[]): XZ[] {
  const next = ring.map((point) => [point[0], point[1]] as XZ);
  const original = ringArea(next);
  if (original < 200 || next.length < 4) return next;
  const span = spanOf(next);
  const altitudeLimit = span > 160 ? 22 : 8;
  const stepCap = Math.max(altitudeLimit * 80, original * 0.025);
  let guard = next.length;
  while (next.length > 3 && guard > 0) {
    guard -= 1;
    let best = Infinity;
    let at = -1;
    for (let index = 0; index < next.length; index += 1) {
      const previous = next[(index - 1 + next.length) % next.length];
      const point = next[index];
      const following = next[(index + 1) % next.length];
      const dx = following[0] - previous[0];
      const dz = following[1] - previous[1];
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const altitude = Math.abs(dx * (previous[1] - point[1]) - (previous[0] - point[0]) * dz) / length;
      if (altitude > altitudeLimit) continue;
      const area = removalArea(next, index);
      if (area < best) {
        best = area;
        at = index;
      }
    }
    if (at < 0 || best > stepCap) break;
    next.splice(at, 1);
  }
  return dedupe(next);
}

/** A shed-scale footprint with a jagged outline becomes its compass rectangle when that rectangle is almost the same shape. */
function compactSmallRing(ring: readonly XZ[]): XZ[] {
  if (ring.length <= 4) return ring.map((point) => [point[0], point[1]] as XZ);
  const span = spanOf(ring);
  if (span > 90) return ring.map((point) => [point[0], point[1]] as XZ);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const boxArea = (maxX - minX) * (maxZ - minZ);
  const original = ringArea(ring);
  if (original < 80 || boxArea > original * 1.35) return ring.map((point) => [point[0], point[1]] as XZ);
  const longest = Math.max(...ring.map((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  }));
  const angle = (() => {
    let best = 0;
    let at = 0;
    for (let index = 0; index < ring.length; index += 1) {
      const next = ring[(index + 1) % ring.length];
      const length = Math.hypot(next[0] - ring[index][0], next[1] - ring[index][1]);
      if (length > best) {
        best = length;
        at = index;
      }
    }
    const next = ring[(at + 1) % ring.length];
    return Math.abs(Math.atan2(next[1] - ring[at][1], next[0] - ring[at][0]));
  })();
  const toAxis = Math.min(angle % (Math.PI / 2), Math.PI / 2 - (angle % (Math.PI / 2)));
  if (longest > span * 0.45 && toAxis > (20 * Math.PI) / 180) return ring.map((point) => [point[0], point[1]] as XZ);
  return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
}

function squareNearAxes(ring: XZ[]) {
  const snapped = ring.map((point) => [point[0], point[1]] as XZ);
  const count = snapped.length;
  const limit = (16 * Math.PI) / 180;
  for (let index = 0; index < count; index += 1) {
    const start = snapped[index];
    const end = snapped[(index + 1) % count];
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const angle = Math.abs(Math.atan2(dz, dx));
    const toAxis = Math.min(angle % (Math.PI / 2), Math.PI / 2 - (angle % (Math.PI / 2)));
    if (toAxis > limit) continue;
    const offset = Math.min(64, Math.max(14, length * 0.2));
    if (Math.abs(dx) <= Math.abs(dz)) {
      if (Math.abs(dx) > offset) continue;
      const x = (start[0] + end[0]) / 2;
      start[0] = x;
      end[0] = x;
    } else {
      if (Math.abs(dz) > offset) continue;
      const z = (start[1] + end[1]) / 2;
      start[1] = z;
      end[1] = z;
    }
  }
  return dedupe(snapped);
}

/** Display-only. Keeps the block and drops corner changes finer than the design-context grain. */
export function regularizeRing(ring: readonly XZ[], epsilon = CONTEXT_GRAIN_FEET): XZ[] {
  if (ring.length < 4) return ring.map((point) => [point[0], point[1]]);
  let far = 0;
  let farIndex = 0;
  for (let index = 1; index < ring.length; index += 1) {
    const distance = Math.hypot(ring[index][0] - ring[0][0], ring[index][1] - ring[0][1]);
    if (distance > far) {
      far = distance;
      farIndex = index;
    }
  }
  const span = spanOf(ring);
  const tolerance = Math.max(epsilon, span > 80 ? CONTEXT_GRAIN_FEET : 16);
  const rotated = [...ring.slice(farIndex), ...ring.slice(0, farIndex), ring[farIndex]];
  const simplified = dedupe(simplifyOpen(rotated, tolerance).slice(0, -1));
  const result = compactSmallRing(collapseSlivers(squareNearAxes(closeChamfers(collapseNotches(collapseSlivers(squareNearAxes(simplified)))))));
  const original = ringArea(ring);
  if (original > 0 && ringArea(result) < original * 0.75) {
    const compact = compactSmallRing(ring.map((point) => [point[0], point[1]]));
    if (compact.length === 4 && ringArea(compact) >= original * 0.75 && ringArea(compact) <= original * 1.35) return compact;
    const milder = squareNearAxes(dedupe(simplifyOpen(rotated, 20).slice(0, -1)));
    if (ringArea(milder) >= original * 0.75) return milder;
    return ring.map((point) => [point[0], point[1]]);
  }
  return result;
}

function sampleHalf(road: SiteRoad) {
  const samples = road.halfWidthFeet?.filter((value): value is number => typeof value === "number") ?? [];
  if (samples.length === 0) return road.displayHalfWidthFeet;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function shareOn(road: SiteRoad, other: SiteRoad, limit: number) {
  let close = 0;
  for (const [x, z] of road.path) {
    let best = Infinity;
    for (let index = 0; index < other.path.length - 1; index += 1) {
      const start = other.path[index];
      const end = other.path[index + 1];
      const dx = end[0] - start[0];
      const dz = end[1] - start[1];
      const length2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - start[0]) * dx + (z - start[1]) * dz) / length2));
      best = Math.min(best, Math.hypot(x - (start[0] + dx * t), z - (start[1] + dz * t)));
    }
    if (best < limit) close += 1;
  }
  return close / road.path.length;
}

function chordDirection(road: SiteRoad): XZ {
  const start = road.path[0];
  const end = road.path[road.path.length - 1];
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
}

function pathLength(road: SiteRoad) {
  let length = 0;
  for (let index = 0; index < road.path.length - 1; index += 1) {
    length += Math.hypot(road.path[index + 1][0] - road.path[index][0], road.path[index + 1][1] - road.path[index][1]);
  }
  return length;
}

/** Display-only. Drops a second ribbon where the same street is already drawn on the same corridor. */
export function displayRoads(roads: readonly SiteRoad[]): SiteRoad[] {
  const drop = new Set<number>();
  for (let index = 0; index < roads.length; index += 1) {
    const road = roads[index];
    if (drop.has(index) || road.elevated || road.path.length < 2 || !road.name) continue;
    for (let otherIndex = index + 1; otherIndex < roads.length; otherIndex += 1) {
      const other = roads[otherIndex];
      if (drop.has(otherIndex) || other.elevated || other.path.length < 2) continue;
      if (other.name !== road.name || other.kind !== road.kind) continue;
      const toward = chordDirection(road);
      const otherToward = chordDirection(other);
      if (Math.abs(toward[0] * otherToward[0] + toward[1] * otherToward[1]) < 0.85) continue;
      const limit = sampleHalf(road) + sampleHalf(other) - 4;
      if (shareOn(road, other, limit) < 0.7 || shareOn(other, road, limit) < 0.7) continue;
      drop.add(pathLength(road) < pathLength(other) ? index : otherIndex);
      if (drop.has(index)) break;
    }
  }
  return roads.filter((_, index) => !drop.has(index));
}

function medianSample(values: Array<number | null> | undefined, fallback: number) {
  const samples = values?.filter((value): value is number => typeof value === "number") ?? [];
  if (samples.length === 0) return fallback;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Display-only. A grade street within the design-context grain of the compass becomes one straight ribbon. Every corridor keeps one width. Deck paths and their joins stay. */
export function tidyLocalRoads(roads: readonly SiteRoad[]): SiteRoad[] {
  return roads.map((road) => {
    if (road.path.length < 2) return road;
    const half = medianSample(road.halfWidthFeet, road.displayHalfWidthFeet);
    const shift = medianSample(road.centerShiftFeet, 0);
    const shifted = Math.abs(shift) > 0.5;
    const steady = (path: readonly XZ[]) => ({
      ...road,
      path: path.map((point) => [point[0], point[1]] as XZ),
      halfWidthFeet: path.map(() => half),
      centerShiftFeet: shifted ? path.map(() => shift) : undefined,
      displayHalfWidthFeet: half,
    });
    if (road.elevated || road.deckFeet || road.kind !== "local") return steady(road.path);
    const first = road.path[0];
    const last = road.path[road.path.length - 1];
    const angle = Math.abs(Math.atan2(last[1] - first[1], last[0] - first[0]));
    const toAxis = Math.min(angle % (Math.PI / 2), Math.PI / 2 - (angle % (Math.PI / 2)));
    if (toAxis > (12 * Math.PI) / 180) return steady(road.path);
    const northSouth = Math.abs(last[0] - first[0]) <= Math.abs(last[1] - first[1]);
    const axis = road.path.reduce((sum, point) => sum + (northSouth ? point[0] : point[1]), 0) / road.path.length;
    const drift = Math.max(...road.path.map((point) => Math.abs((northSouth ? point[0] : point[1]) - axis)));
    if (drift > CONTEXT_GRAIN_FEET) return steady(road.path);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of road.path) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    if ((northSouth ? maxZ - minZ : maxX - minX) < 8) return steady(road.path);
    const path: [XZ, XZ] = northSouth ? [[axis, minZ], [axis, maxZ]] : [[minX, axis], [maxX, axis]];
    return steady(path);
  });
}

function deckCrown(road: SiteRoad): XZ | null {
  const deck = road.deckFeet;
  if (!deck) return null;
  let max = -Infinity;
  let at = -1;
  for (let index = 0; index < deck.length; index += 1) {
    const height = deck[index];
    if (typeof height === "number" && height > max) {
      max = height;
      at = index;
    }
  }
  if (at <= 0 || at >= road.path.length - 1) return null;
  const start = deck[0];
  const end = deck[deck.length - 1];
  const ends = Math.max(typeof start === "number" ? start : 0, typeof end === "number" ? end : 0);
  if (max <= ends + 8) return null;
  return road.path[at];
}

/** Display-only. A bend smaller than the design-context grain becomes a straight run. A real curve, and the crown of a deck, stay. */
export function regularizeRoad(road: SiteRoad, epsilon = CONTEXT_GRAIN_FEET): SiteRoad {
  if (road.path.length < 3) return road;
  const kept = simplifyOpen(road.path, epsilon);
  const crown = deckCrown(road);
  if (crown && !kept.some((point) => Math.hypot(point[0] - crown[0], point[1] - crown[1]) < 1)) {
    const at = road.path.findIndex((point) => point[0] === crown[0] && point[1] === crown[1]);
    let insert = kept.length - 1;
    for (let index = 0; index < kept.length; index += 1) {
      const source = road.path.findIndex((point) => point[0] === kept[index][0] && point[1] === kept[index][1]);
      if (source > at) {
        insert = index;
        break;
      }
    }
    kept.splice(insert, 0, [crown[0], crown[1]]);
  }
  if (kept.length < 2 || kept.length === road.path.length) return road;
  const pick = (index: number) => {
    let nearest = 0;
    let best = Infinity;
    for (let cursor = 0; cursor < road.path.length; cursor += 1) {
      const distance = Math.hypot(road.path[cursor][0] - kept[index][0], road.path[cursor][1] - kept[index][1]);
      if (distance < best) {
        best = distance;
        nearest = cursor;
      }
    }
    return nearest;
  };
  const indices = kept.map((_, index) => pick(index));
  return {
    ...road,
    path: kept.map((point) => [point[0], point[1]] as XZ),
    halfWidthFeet: road.halfWidthFeet ? indices.map((index) => road.halfWidthFeet?.[index] ?? null) : undefined,
    centerShiftFeet: road.centerShiftFeet ? indices.map((index) => road.centerShiftFeet?.[index] ?? null) : undefined,
    deckFeet: road.deckFeet ? indices.map((index) => road.deckFeet?.[index] ?? null) : undefined,
  };
}

const GROUND_ROAD_BOTTOM = 0.05;
const GROUND_ROAD_TOP = 0.62;

function signedArea(ring: readonly XZ[]) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const next = ring[(index + 1) % ring.length];
    area += ring[index][0] * next[1] - next[0] * ring[index][1];
  }
  return area / 2;
}

function orientRing(ring: readonly XZ[], positive: boolean): XZ[] {
  const next = ring.map((point) => [point[0], point[1]] as XZ);
  if ((signedArea(next) > 0) !== positive) next.reverse();
  return next;
}

/** A flat-capped corridor. Sharp bends bevel instead of growing a long miter. */
function corridorRing(path: readonly XZ[], half: number): XZ[] {
  const points = dedupe(path);
  if (points.length < 2 || half <= 0) return [];
  const direction = (from: XZ, to: XZ): XZ => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
  };
  const left: XZ[] = [];
  const right: XZ[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const incoming = index === 0 ? direction(points[0], points[1]) : direction(points[index - 1], points[index]);
    const outgoing = index === points.length - 1 ? direction(points[index - 1], points[index]) : direction(points[index], points[index + 1]);
    const previousNormal: XZ = [-incoming[1], incoming[0]];
    const nextNormal: XZ = [-outgoing[1], outgoing[0]];
    const dot = previousNormal[0] * nextNormal[0] + previousNormal[1] * nextNormal[1];
    const push = (normal: XZ, scale: number) => {
      left.push([points[index][0] + normal[0] * scale, points[index][1] + normal[1] * scale]);
      right.push([points[index][0] - normal[0] * scale, points[index][1] - normal[1] * scale]);
    };
    if (index > 0 && index < points.length - 1 && dot < 0.25) {
      push(previousNormal, half);
      push(nextNormal, half);
    } else {
      const mixed: XZ = [previousNormal[0] + nextNormal[0], previousNormal[1] + nextNormal[1]];
      const length = Math.hypot(mixed[0], mixed[1]) || 1;
      const factor = Math.min(half * 2, half / Math.max(0.35, Math.sqrt((1 + dot) / 2)));
      push([mixed[0] / length, mixed[1] / length], factor);
    }
  }
  return dedupe([...left, ...right.reverse()]);
}

function outwardEnd(path: readonly XZ[], end: number): XZ {
  const other = end === 0 ? 1 : path.length - 2;
  const point = path[end];
  const from = path[Math.max(0, other)];
  const length = Math.hypot(point[0] - from[0], point[1] - from[1]) || 1;
  return [(point[0] - from[0]) / length, (point[1] - from[1]) / length];
}

function approachJoin(point: XZ, outward: XZ, start: XZ, finish: XZ) {
  const rx = finish[0] - start[0];
  const rz = finish[1] - start[1];
  const span = Math.hypot(rx, rz) || 1;
  const along = Math.max(0, Math.min(1, ((point[0] - start[0]) * rx + (point[1] - start[1]) * rz) / (span * span)));
  const closest: XZ = [start[0] + rx * along, start[1] + rz * along];
  const gapx = closest[0] - point[0];
  const gapz = closest[1] - point[1];
  const distance = Math.hypot(gapx, gapz);
  if (distance < 2) return null;
  const forward = gapx * outward[0] + gapz * outward[1];
  if (forward < distance * 0.5) return null;
  if (Math.abs(outward[0] * gapz - outward[1] * gapx) > 24) return null;
  const parallel = Math.abs(outward[0] * rz - outward[1] * rx) < span * 0.35;
  return { distance, point: closest, parallel };
}

function pavementBlocked(from: XZ, to: XZ, blocked: readonly (readonly XZ[])[]) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.ceil(length / 12);
  for (let step = 1; step < steps; step += 1) {
    const along = (length * step) / steps;
    if (along < 10 || length - along < 10) continue;
    const point: XZ = [from[0] + ((to[0] - from[0]) * step) / steps, from[1] + ((to[1] - from[1]) * step) / steps];
    if (blocked.some((ring) => ring.length >= 3 && rayInside(point, ring))) return true;
  }
  return false;
}

/** Display-only. Carries a ground end to the street it is already aimed at. A join that crosses a building, the bay, or the site is refused, and parallel carriageways stay apart. */
function closeGroundEnds(roads: readonly SiteRoad[], blocked: readonly (readonly XZ[])[]): SiteRoad[] {
  const paths = roads.map((road) => road.path.map((point) => [point[0], point[1]] as XZ));
  const joined = paths.map((path) => path.map((point) => [point[0], point[1]] as XZ));
  for (let index = 0; index < roads.length; index += 1) {
    const path = paths[index];
    if (path.length < 2) continue;
    for (const end of [0, path.length - 1]) {
      const point = path[end];
      const outward = outwardEnd(path, end);
      const ownHalf = roads[index].displayHalfWidthFeet;
      let best = Infinity;
      let hit: XZ | null = null;
      for (let otherIndex = 0; otherIndex < roads.length; otherIndex += 1) {
        if (otherIndex === index) continue;
        const other = roads[otherIndex];
        const otherPath = paths[otherIndex];
        for (let cursor = 0; cursor < otherPath.length - 1; cursor += 1) {
          const approach = approachJoin(point, outward, otherPath[cursor], otherPath[cursor + 1]);
          if (!approach || approach.distance >= best) continue;
          const continuation = Boolean(roads[index].name) && roads[index].name === other.name && approach.parallel;
          const clear = approach.distance - ownHalf - other.displayHalfWidthFeet;
          if (!continuation && clear > 2 * (ownHalf + other.displayHalfWidthFeet)) continue;
          if (pavementBlocked(point, approach.point, blocked)) continue;
          best = approach.distance;
          hit = approach.point;
        }
      }
      if (hit) joined[index][end] = hit;
    }
  }
  return roads.map((road, index) => ({ ...road, path: joined[index] }));
}

function rayInside(point: XZ, ring: readonly XZ[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index];
    const prior = ring[previous];
    const crosses = (current[1] > point[1]) !== (prior[1] > point[1]);
    if (crosses && point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0]) inside = !inside;
  }
  return inside;
}

function joinedGroundRoads(roads: readonly SiteRoad[], blocked: readonly (readonly XZ[])[]) {
  return closeGroundEnds(roads.filter((road) => !road.elevated && road.path.length >= 2), blocked);
}

function groundCorridorRings(roads: readonly SiteRoad[], blocked: readonly (readonly XZ[])[]) {
  return joinedGroundRoads(roads, blocked).flatMap((road) => {
    const ring = corridorRing(road.path, road.displayHalfWidthFeet);
    return ring.length >= 3 ? [orientRing(ring, true)] : [];
  });
}

let clipperKernel: Promise<ManifoldToplevel> | null = null;

function loadClipper() {
  clipperKernel ??= import("manifold-3d/manifold").then(async (mod) => {
    const wasm = await mod.default();
    wasm.setup();
    return wasm;
  });
  return clipperKernel;
}

/** Display-only. Ground streets become one footprint per connected surface, extruded at one thickness. */
export function groundRoadBlocks(buildings: readonly SiteBuilding[], water: readonly XZ[], site: readonly XZ[]) {
  const rings: XZ[][] = [];
  for (const building of buildings) {
    const ring = clipPolygon(regularizeRing(building.ring));
    if (ring.length < 3) continue;
    if (!building.name && building.heightSource === "estimated" && ringArea(ring) > 50000) continue;
    rings.push(ring);
  }
  const bay = clipPolygon(water);
  if (bay.length >= 3) rings.push(bay);
  if (site.length >= 3) rings.push(site.map((point) => [point[0], point[1]] as XZ));
  return rings;
}

export async function groundRoadGeometry(roads: readonly SiteRoad[], blocked: readonly (readonly XZ[])[] = []) {
  const rings = groundCorridorRings(roads, blocked);
  if (rings.length === 0) return mergeGeometries([]);
  const wasm = await loadClipper();
  const section = new wasm.CrossSection(rings.map((ring) => ring.map((point) => [point[0], point[1]] as [number, number])));
  const polygons = section.toPolygons();
  section.delete();
  const outers: XZ[][] = [];
  const holes: XZ[][] = [];
  for (const polygon of polygons) {
    const ring = polygon.map(([x, z]) => [x, z] as XZ);
    const area = signedArea(ring);
    if (Math.abs(area) < 1) continue;
    if (area > 0) outers.push(ring);
    else holes.push(ring);
  }
  return mergeGeometries(outers.map((outer) => {
    const owned = holes.filter((hole) => {
      const centroid = ringCentroid(hole);
      if (!rayInside(centroid, outer)) return false;
      return !outers.some((other) => other !== outer && ringArea(other) < ringArea(outer) && rayInside(centroid, other));
    });
    const geometry = prismGeometry(outer, GROUND_ROAD_TOP - GROUND_ROAD_BOTTOM, owned.map((hole) => orientRing(hole, false)));
    geometry.translate(0, GROUND_ROAD_BOTTOM, 0);
    return geometry;
  }));
}

type DisplayMass = {
  building: SiteBuilding;
  ring: XZ[];
  holes: XZ[][];
  area: number;
  span: number;
};

function massRank(building: SiteBuilding) {
  const named = building.name ? 4 : 0;
  const source = building.heightSource === "osm-height" || building.heightSource === "county" ? 3 : building.heightSource === "osm-levels" ? 2 : 1;
  return named + source;
}

function smallScrap(mass: DisplayMass) {
  return !mass.building.name && mass.building.heightSource === "estimated" && mass.area < 8000 && mass.span < 180;
}

/** The occupant keeps the shared plan. The container loses it. */
function occupantKeeps(container: DisplayMass, occupant: DisplayMass, overlap: number) {
  const occupantShare = overlap / occupant.area;
  const containerShare = overlap / container.area;
  if (overlap < 200) return false;
  const scraps = smallScrap(container) && smallScrap(occupant);
  if (!scraps && occupantShare < 0.2 && containerShare < 0.2) return false;
  const generic = container.building.heightSource === "estimated" && !container.building.name;
  if (generic && massRank(occupant.building) > massRank(container.building) && overlap >= 400 && (occupantShare >= 0.2 || containerShare >= 0.75)) return true;
  if (generic && container.area > occupant.area * 3 && container.span > 200 && occupantShare >= 0.45) return true;
  if (smallScrap(container) && smallScrap(occupant) && (containerShare >= 0.2 || overlap >= 400)) {
    if (occupant.area > container.area * 1.05) return true;
    const heights = Math.abs((occupant.building.heightFeet ?? 0) - (container.building.heightFeet ?? 0));
    if (occupant.area > container.area * 0.95 && (occupant.building.heightFeet ?? 0) > (container.building.heightFeet ?? 0) + 8) return true;
    if (occupant.area > container.area * 0.95 && heights <= 8 && occupant.building.id < container.building.id) return true;
  }
  return false;
}

function sectionContours(mass: DisplayMass) {
  return [orientRing(mass.ring, true), ...mass.holes.map((hole) => orientRing(hole, false))].map((ring) => ring.map((point) => [point[0], point[1]] as [number, number]));
}

function openPolygon(polygon: readonly (readonly [number, number])[]) {
  const ring = polygon.map(([x, z]) => [x, z] as XZ);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) ring.pop();
  return ring;
}

/** Display-only rings after generic masses yield to a named or more specific footprint. */
async function cutDisplayFootprints(buildings: readonly SiteBuilding[]) {
  const masses: DisplayMass[] = [];
  for (const building of buildings) {
    if (building.heightFeet === null || building.heightFeet <= 0) continue;
    const ring = clipPolygon(regularizeRing(building.ring));
    if (ring.length < 3) continue;
    const holes = (building.holes ?? []).map((hole) => clipPolygon(regularizeRing(hole))).filter((hole) => hole.length >= 3);
    masses.push({ building, ring, holes, area: ringArea(ring), span: spanOf(ring) });
  }
  if (masses.length === 0) return [];
  const wasm = await loadClipper();
  const sections = masses.map((mass) => new wasm.CrossSection(sectionContours(mass)));
  const cutters = masses.map(() => [] as number[]);
  for (let index = 0; index < masses.length; index += 1) {
    for (let other = index + 1; other < masses.length; other += 1) {
      const hit = sections[index].intersect(sections[other]);
      const overlap = hit.area();
      hit.delete();
      if (overlap < 200) continue;
      if (occupantKeeps(masses[index], masses[other], overlap)) cutters[index].push(other);
      if (occupantKeeps(masses[other], masses[index], overlap)) cutters[other].push(index);
    }
  }
  const footprints: Array<{ id: number; name: string | null; source: SiteBuilding["heightSource"]; height: number; ring: XZ[]; holes: XZ[][] }> = [];
  for (let index = 0; index < masses.length; index += 1) {
    const mass = masses[index];
    const height = mass.building.heightFeet ?? 0;
    const ids = cutters[index];
    if (ids.length === 0) {
      footprints.push({ id: mass.building.id, name: mass.building.name, source: mass.building.heightSource, height, ring: mass.ring, holes: mass.holes });
      continue;
    }
    let tool = sections[ids[0]];
    for (const id of ids.slice(1)) {
      const next = tool.add(sections[id]);
      if (tool !== sections[ids[0]]) tool.delete();
      tool = next;
    }
    const diff = sections[index].subtract(tool).simplify(2);
    if (tool !== sections[ids[0]]) tool.delete();
    const polygons = diff.toPolygons();
    diff.delete();
    const outers: XZ[][] = [];
    const holes: XZ[][] = [];
    for (const polygon of polygons) {
      const ring = openPolygon(polygon);
      if (ring.length < 3 || ringArea(ring) < 500) continue;
      if (signedArea(ring) > 0) outers.push(ring);
      else holes.push(ring);
    }
    for (const outer of outers) {
      const owned = holes.filter((hole) => {
        const centroid = ringCentroid(hole);
        if (!rayInside(centroid, outer)) return false;
        return !outers.some((other) => other !== outer && ringArea(other) < ringArea(outer) && rayInside(centroid, other));
      }).map((hole) => orientRing(hole, false));
      footprints.push({ id: mass.building.id, name: mass.building.name, source: mass.building.heightSource, height, ring: outer, holes: owned });
    }
  }
  sections.forEach((section) => section.delete());
  return footprints;
}

/** Display-only. Generic masses yield where a named or more specific footprint occupies the same plan. */
export async function displayBuildingGeometry(buildings: readonly SiteBuilding[]) {
  const footprints = await cutDisplayFootprints(buildings);
  return mergeGeometries(footprints.map((footprint) => prismGeometry(footprint.ring, footprint.height, footprint.holes)));
}
