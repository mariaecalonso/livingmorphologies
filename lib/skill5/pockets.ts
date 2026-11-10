import type { XZ } from "./site-model";
import { polygonCentroid, type ZonePoint } from "./zoning";

export type NetworkBranch = {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  conductivity: number;
};

export type NetworkPocket = {
  id: string;
  points: ZonePoint[];
  /** True when the parcel edge is part of this boundary. */
  touchesParcel: boolean;
};

export type PocketReport = {
  pockets: NetworkPocket[];
  /** Branch segments that never close, so they were not joined into a pocket. */
  openSegments: number;
};

type Segment = { ax: number; az: number; bx: number; bz: number; parcel: boolean };

const QUANT = 0.5;
const MIN_AREA = 40;

function keyOf(x: number, z: number) {
  return `${Math.round(x / QUANT)}:${Math.round(z / QUANT)}`;
}

function quantize(value: number) {
  return Math.round(value / QUANT) * QUANT;
}

function pointInRing(x: number, z: number, ring: readonly XZ[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, zi] = ring[index];
    const [xj, zj] = ring[previous];
    const crosses = zi > z !== zj > z;
    if (crosses && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function onSegment(x: number, z: number, segment: Segment) {
  const dx = segment.bx - segment.ax;
  const dz = segment.bz - segment.az;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return Math.hypot(x - segment.ax, z - segment.az) < QUANT;
  const t = ((x - segment.ax) * dx + (z - segment.az) * dz) / (length * length);
  if (t < -0.02 || t > 1.02) return false;
  const px = segment.ax + dx * Math.min(1, Math.max(0, t));
  const pz = segment.az + dz * Math.min(1, Math.max(0, t));
  return Math.hypot(x - px, z - pz) < QUANT * 1.2;
}

function parameterOn(x: number, z: number, segment: Segment) {
  const dx = segment.bx - segment.ax;
  const dz = segment.bz - segment.az;
  const length = dx * dx + dz * dz;
  if (length < 1e-8) return null;
  const t = ((x - segment.ax) * dx + (z - segment.az) * dz) / length;
  if (t <= 0.002 || t >= 0.998) return null;
  const px = segment.ax + dx * t;
  const pz = segment.az + dz * t;
  if (Math.hypot(x - px, z - pz) > QUANT * 0.8) return null;
  return t;
}

function crosses(a: Segment, b: Segment) {
  const rx = a.bx - a.ax;
  const rz = a.bz - a.az;
  const sx = b.bx - b.ax;
  const sz = b.bz - b.az;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-8) return null;
  const qx = b.ax - a.ax;
  const qz = b.az - a.az;
  const t = (qx * sz - qz * sx) / denom;
  const u = (qx * rz - qz * rx) / denom;
  if (t <= 0.002 || t >= 0.998 || u <= 0.002 || u >= 0.998) return null;
  return { x: a.ax + rx * t, z: a.az + rz * t, t, u };
}

function insideOrOn(x: number, z: number, ring: readonly XZ[], boundary: readonly Segment[]) {
  if (pointInRing(x, z, ring)) return true;
  return boundary.some((segment) => onSegment(x, z, segment));
}

function cut(segment: Segment, cuts: number[]) {
  const marks = [0, 1, ...cuts].filter((value) => value >= -1e-6 && value <= 1 + 1e-6).sort((a, b) => a - b);
  const pieces: Segment[] = [];
  for (let index = 0; index < marks.length - 1; index += 1) {
    const from = marks[index];
    const to = marks[index + 1];
    if (to - from < 1e-4) continue;
    pieces.push({
      ax: segment.ax + (segment.bx - segment.ax) * from,
      az: segment.az + (segment.bz - segment.az) * from,
      bx: segment.ax + (segment.bx - segment.ax) * to,
      bz: segment.az + (segment.bz - segment.az) * to,
      parcel: segment.parcel,
    });
  }
  return pieces;
}

function pocketKey(points: readonly ZonePoint[]) {
  let start = 0;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const best = points[start];
    if (point.x < best.x - 1e-3 || (Math.abs(point.x - best.x) < 1e-3 && point.z < best.z)) start = index;
  }
  const ordered = [...points.slice(start), ...points.slice(0, start)];
  const text = ordered.map((point) => `${Math.round(point.x)}:${Math.round(point.z)}`).join("|");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `p${(hash >>> 0).toString(36)}`;
}

/**
 * Faces enclosed by the surviving network and, where a branch meets it, the parcel edge.
 * Open branches are counted and left open. No edge is added to force a closure.
 */
export function detectPockets(branches: readonly NetworkBranch[], parcel: readonly XZ[]): PocketReport {
  if (parcel.length < 3 || branches.length === 0) return { pockets: [], openSegments: branches.length };
  const boundary: Segment[] = [];
  for (let index = 0; index < parcel.length; index += 1) {
    const from = parcel[index];
    const to = parcel[(index + 1) % parcel.length];
    boundary.push({ ax: from[0], az: from[1], bx: to[0], bz: to[1], parcel: true });
  }
  const network: Segment[] = [];
  for (const branch of branches) {
    if (Math.hypot(branch.x1 - branch.x0, branch.z1 - branch.z0) < QUANT) continue;
    const segment = { ax: branch.x0, az: branch.z0, bx: branch.x1, bz: branch.z1, parcel: false };
    const cuts: number[] = [];
    for (const edge of boundary) {
      const hit = crosses(segment, edge);
      if (hit) cuts.push(hit.t);
    }
    for (const piece of cut(segment, cuts)) {
      const midX = (piece.ax + piece.bx) / 2;
      const midZ = (piece.az + piece.bz) / 2;
      if (insideOrOn(midX, midZ, parcel, boundary)) network.push(piece);
    }
  }
  const source = [...boundary, ...network];
  const splits = source.map(() => [] as number[]);
  for (let index = 0; index < source.length; index += 1) {
    for (let other = index + 1; other < source.length; other += 1) {
      const hit = crosses(source[index], source[other]);
      if (hit) {
        splits[index].push(hit.t);
        splits[other].push(hit.u);
      }
      const onOtherStart = parameterOn(source[index].ax, source[index].az, source[other]);
      const onOtherEnd = parameterOn(source[index].bx, source[index].bz, source[other]);
      const onThisStart = parameterOn(source[other].ax, source[other].az, source[index]);
      const onThisEnd = parameterOn(source[other].bx, source[other].bz, source[index]);
      if (onOtherStart != null) splits[other].push(onOtherStart);
      if (onOtherEnd != null) splits[other].push(onOtherEnd);
      if (onThisStart != null) splits[index].push(onThisStart);
      if (onThisEnd != null) splits[index].push(onThisEnd);
    }
  }
  const pieces = source.flatMap((segment, index) => cut(segment, splits[index]));
  const unique = new Map<string, Segment>();
  for (const piece of pieces) {
    const ax = quantize(piece.ax);
    const az = quantize(piece.az);
    const bx = quantize(piece.bx);
    const bz = quantize(piece.bz);
    if (Math.hypot(bx - ax, bz - az) < QUANT * 0.6) continue;
    const forward = `${keyOf(ax, az)}>${keyOf(bx, bz)}`;
    const backward = `${keyOf(bx, bz)}>${keyOf(ax, az)}`;
    if (unique.has(forward) || unique.has(backward)) continue;
    unique.set(forward, { ax, az, bx, bz, parcel: piece.parcel });
  }
  const atoms = [...unique.values()];
  if (atoms.length === 0) return { pockets: [], openSegments: network.length };

  type Dir = { to: string; angle: number; parcel: boolean };
  const vertices = new Map<string, { x: number; z: number; out: Dir[] }>();
  const add = (x: number, z: number, toX: number, toZ: number, parcelEdge: boolean) => {
    const from = keyOf(x, z);
    const to = keyOf(toX, toZ);
    const vertex = vertices.get(from) ?? { x, z, out: [] };
    vertex.out.push({ to, angle: Math.atan2(toZ - z, toX - x), parcel: parcelEdge });
    vertices.set(from, vertex);
  };
  for (const piece of atoms) {
    add(piece.ax, piece.az, piece.bx, piece.bz, piece.parcel);
    add(piece.bx, piece.bz, piece.ax, piece.az, piece.parcel);
  }
  for (const vertex of vertices.values()) vertex.out.sort((a, b) => a.angle - b.angle);

  const used = new Set<string>();
  const pockets: NetworkPocket[] = [];
  let openSegments = 0;
  const directed = (from: string, to: string) => `${from}>${to}`;
  for (const [from, vertex] of vertices) {
    for (const edge of vertex.out) {
      const start = directed(from, edge.to);
      if (used.has(start)) continue;
      const points: ZonePoint[] = [];
      let parcelEdges = 0;
      let networkEdges = 0;
      let current = from;
      let next = edge.to;
      let guard = 0;
      let closed = false;
      while (guard < atoms.length * 2 + 4) {
        guard += 1;
        const mark = directed(current, next);
        if (used.has(mark)) break;
        used.add(mark);
        const here = vertices.get(current);
        const link = here?.out.find((item) => item.to === next);
        if (link?.parcel) parcelEdges += 1;
        else networkEdges += 1;
        if (here) points.push({ x: here.x, z: here.z });
        const arrival = vertices.get(next);
        const previous = vertices.get(current);
        if (!arrival || !previous) break;
        const incoming = Math.atan2(previous.z - arrival.z, previous.x - arrival.x);
        let slot = arrival.out.findIndex((item) => Math.abs(Math.atan2(Math.sin(item.angle - incoming), Math.cos(item.angle - incoming))) < 1e-3);
        if (slot < 0) {
          let best = Infinity;
          arrival.out.forEach((item, index) => {
            const delta = Math.abs(Math.atan2(Math.sin(item.angle - incoming), Math.cos(item.angle - incoming)));
            if (delta < best) {
              best = delta;
              slot = index;
            }
          });
        }
        if (slot < 0 || arrival.out.length === 0) break;
        const turn = (slot - 1 + arrival.out.length) % arrival.out.length;
        current = next;
        next = arrival.out[turn].to;
        if (current === from && next === edge.to) {
          closed = true;
          break;
        }
      }
      if (!closed || points.length < 3 || networkEdges === 0) continue;
      let signed = 0;
      for (let index = 0; index < points.length; index += 1) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        signed += from.x * to.z - to.x * from.z;
      }
      signed *= 0.5;
      if (signed < MIN_AREA) continue;
      const center = polygonCentroid(points);
      if (!pointInRing(center.x, center.z, parcel) && !insideOrOn(center.x, center.z, parcel, boundary)) continue;
      pockets.push({
        id: pocketKey(points),
        points,
        touchesParcel: parcelEdges > 0,
      });
    }
  }
  const kept = new Set<string>();
  for (const pocket of pockets) {
    for (let index = 0; index < pocket.points.length; index += 1) {
      const from = pocket.points[index];
      const to = pocket.points[(index + 1) % pocket.points.length];
      kept.add(directed(keyOf(from.x, from.z), keyOf(to.x, to.z)));
      kept.add(directed(keyOf(to.x, to.z), keyOf(from.x, from.z)));
    }
  }
  for (const piece of atoms) {
    if (piece.parcel) continue;
    const mark = directed(keyOf(piece.ax, piece.az), keyOf(piece.bx, piece.bz));
    if (!kept.has(mark)) openSegments += 1;
  }
  const uniquePockets = new Map<string, NetworkPocket>();
  for (const pocket of pockets) {
    if (!uniquePockets.has(pocket.id)) uniquePockets.set(pocket.id, pocket);
  }
  return { pockets: [...uniquePockets.values()], openSegments };
}
