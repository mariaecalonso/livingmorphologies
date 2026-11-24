"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { parseClientCompatibility, type ClientCompatibilityDocument } from "@/lib/skill5/client-compatibility";
import { levelName, readClusterCriteria, type ClusterReading, type CriterionRelation, type SpacePoint, type SpatialMark } from "@/lib/skill4/cluster-criteria-reading";
import { drawPlacedMeshes, projectPlacement } from "@/lib/skill4/draw-placed";
import type { FinishedIteration } from "@/lib/skill4/finished-catalog";
import type { TileInstance } from "@/lib/skill4/tiles";

type Camera = {
  fit: number;
  center: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
};

const EYE = 4.2;

function inkColor(relation: CriterionRelation) {
  if (relation === "meets") return "#49d7de";
  if (relation === "above") return "#c77e5f";
  return "#b7b7b2";
}

function projectTile(tile: TileInstance, camera: Camera | null, width: number, height: number, tiles: TileInstance[]) {
  if (camera) return projectPlacement(tile.transform, camera.center, camera.yaw, camera.pitch, camera.fit, width, height, EYE);
  const xs = tiles.map((item) => item.transform.x);
  const zs = tiles.map((item) => item.transform.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const spanX = Math.max(maxX - minX, 1);
  const spanZ = Math.max(maxZ - minZ, 1);
  const pad = 42;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanZ);
  return {
    x: pad + (tile.transform.x - minX) * scale + ((width - pad * 2) - spanX * scale) / 2,
    y: pad + (maxZ - tile.transform.z) * scale + ((height - pad * 2) - spanZ * scale) / 2,
  };
}

function projectPoint(
  point: { x: number; y: number; z: number },
  camera: Camera | null,
  width: number,
  height: number,
  tiles: TileInstance[],
) {
  if (camera) return projectPlacement(point, camera.center, camera.yaw, camera.pitch, camera.fit, width, height, EYE);
  const standIn = tiles[0];
  if (!standIn) return { x: width / 2, y: height / 2 };
  const origin = projectTile(standIn, null, width, height, tiles);
  const xs = tiles.map((item) => item.transform.x);
  const zs = tiles.map((item) => item.transform.z);
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1);
  const spanZ = Math.max(Math.max(...zs) - Math.min(...zs), 1);
  const pad = 42;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanZ);
  return {
    x: origin.x + (point.x - standIn.transform.x) * scale,
    y: origin.y - (point.z - standIn.transform.z) * scale,
  };
}

function boxFaces(min: SpacePoint, max: SpacePoint): SpacePoint[][] {
  const p = (x: number, y: number, z: number): SpacePoint => ({ x, y, z });
  const { x: x0, y: y0, z: z0 } = min;
  const { x: x1, y: y1, z: z1 } = max;
  return [
    [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)],
    [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)],
    [p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0)],
    [p(x0, y0, z1), p(x0, y1, z1), p(x1, y1, z1), p(x1, y0, z1)],
    [p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)],
    [p(x1, y0, z0), p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0)],
  ];
}

function barFaces(a: SpacePoint, b: SpacePoint, thickness: number): SpacePoint[][] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const sx = (-dz / length) * thickness * 0.5;
  const sz = (dx / length) * thickness * 0.5;
  const up = thickness * 0.5 + Math.abs(dy) * 0.05;
  const ring = (point: SpacePoint): SpacePoint[] => [
    { x: point.x + sx, y: point.y - up, z: point.z + sz },
    { x: point.x - sx, y: point.y - up, z: point.z - sz },
    { x: point.x - sx, y: point.y + up, z: point.z - sz },
    { x: point.x + sx, y: point.y + up, z: point.z + sz },
  ];
  const start = ring(a);
  const end = ring(b);
  return [0, 1, 2, 3].map((index) => [start[index]!, start[(index + 1) % 4]!, end[(index + 1) % 4]!, end[index]!]);
}

function slabFaces(polygon: SpacePoint[], y: number, height: number): SpacePoint[][] {
  const bottom = polygon.map((point) => ({ x: point.x, y, z: point.z }));
  const top = polygon.map((point) => ({ x: point.x, y: y + height, z: point.z }));
  const sides = polygon.map((_, index) => {
    const next = (index + 1) % polygon.length;
    return [bottom[index]!, bottom[next]!, top[next]!, top[index]!];
  });
  return [bottom, top, ...sides];
}

function markFaces(mark: SpatialMark) {
  if (mark.kind === "box") return boxFaces(mark.min, mark.max);
  if (mark.kind === "bar") return barFaces(mark.a, mark.b, mark.thickness);
  return slabFaces(mark.polygon, mark.y, mark.height);
}

function traceFace(
  ctx: CanvasRenderingContext2D,
  face: SpacePoint[],
  color: string,
  alpha: number,
  camera: Camera | null,
  width: number,
  height: number,
  tiles: TileInstance[],
) {
  const projected = face.map((point) => projectPoint(point, camera, width, height, tiles));
  ctx.beginPath();
  ctx.moveTo(projected[0]!.x, projected[0]!.y);
  for (const point of projected.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.28;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(1.25, Math.min(width, height) / 420);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const RANK_STOPS = ["Low", "Med", "High"] as const;

type Callout = {
  index: number;
  label: string;
  measured: number | null;
  desired: number;
  color: string;
  at: { x: number; y: number };
  side: "left" | "right";
  box: { x: number; y: number; w: number; h: number };
  nameSize: number;
  detailSize: number;
};

function placeCallouts(
  ctx: CanvasRenderingContext2D,
  reading: ClusterReading,
  camera: Camera | null,
  width: number,
  height: number,
  tiles: TileInstance[],
): Callout[] {
  const column = Math.max(96, Math.round(width * 0.24));
  let nameSize = Math.max(13, Math.round(Math.min(width, height) / 32));
  const nameWidth = (size: number, label: string) => {
    ctx.font = `${size}px ui-sans-serif, sans-serif`;
    return ctx.measureText(label.toUpperCase()).width;
  };
  while (nameSize > 11 && reading.criteria.some((criterion, index) => nameWidth(nameSize, `${String(index + 1).padStart(2, "0")}  ${criterion.label}`) > column - 18)) {
    nameSize -= 1;
  }
  const detailSize = Math.max(10, Math.round(nameSize * 0.78));
  const trackH = Math.max(18, Math.round(detailSize * 1.85));
  const blockH = nameSize + trackH * 2 + nameSize * 0.55;
  const pad = Math.round(nameSize * 0.55);
  const anchors = reading.criteria.map((criterion, index) => ({
    index,
    label: criterion.label,
    measured: criterion.measured,
    desired: criterion.desired,
    color: inkColor(criterion.relation),
    at: projectPoint(criterion.labelAt, camera, width, height, tiles),
  }));
  let left = anchors.filter((item) => item.at.x <= width / 2).sort((a, b) => a.at.y - b.at.y);
  let right = anchors.filter((item) => item.at.x > width / 2).sort((a, b) => a.at.y - b.at.y);
  if (left.length === 0 || right.length === 0) {
    const ordered = [...anchors].sort((a, b) => a.at.y - b.at.y);
    left = ordered.filter((_, index) => index % 2 === 0);
    right = ordered.filter((_, index) => index % 2 === 1);
  }
  const stack = (group: typeof anchors, side: "left" | "right") => {
    const count = group.length;
    if (!count) return [];
    const room = height - pad * 2;
    const gap = Math.max(4, Math.round(nameSize * 0.4));
    const needed = count * blockH + (count - 1) * gap;
    const usedGap = needed > room && count > 1 ? Math.max(3, (room - count * blockH) / (count - 1)) : gap;
    const usedBlock = count * blockH + (count - 1) * usedGap > room ? (room - usedGap * (count - 1)) / count : blockH;
    const total = count * usedBlock + (count - 1) * usedGap;
    let cursor = pad + Math.max(0, (room - total) / 2);
    return group.map((item) => {
      const box = {
        x: side === "left" ? pad : width - pad - column,
        y: cursor,
        w: column,
        h: usedBlock,
      };
      cursor += usedBlock + usedGap;
      return { ...item, side, box, nameSize, detailSize };
    });
  };
  return [...stack(left, "left"), ...stack(right, "right")];
}

function drawRankSlider(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  level: number | null,
  color: string,
) {
  const type = Math.max(8, Math.round(height * 0.34));
  const trackY = y + height * 0.34;
  const x0 = x + 2;
  const x1 = x + width - 2;
  ctx.strokeStyle = "rgba(242, 242, 238, 0.28)";
  ctx.lineWidth = Math.max(1, height * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, trackY);
  ctx.lineTo(x1, trackY);
  ctx.stroke();
  if (level !== null && level >= 0 && level <= 2) {
    const thumbX = x0 + ((x1 - x0) * level) / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, height * 0.09);
    ctx.beginPath();
    ctx.moveTo(x0, trackY);
    ctx.lineTo(thumbX, trackY);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(thumbX, trackY, Math.max(3.5, height * 0.15), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#9b9b98";
  ctx.font = `${type}px ui-sans-serif, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let stop = 0; stop < RANK_STOPS.length; stop += 1) {
    const px = x0 + ((x1 - x0) * stop) / 2;
    const word = stop === 1 && width >= 150 ? "Medium" : RANK_STOPS[stop];
    ctx.fillText(word, px, trackY + height * 0.2);
  }
  ctx.lineCap = "butt";
}

function paintReading(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  item: FinishedIteration,
  reading: ClusterReading,
  camera: Camera | null,
) {
  const tiles = item.tiles ?? [];
  ctx.clearRect(0, 0, width, height);
  if (!tiles.length || !reading.criteria.length) return;
  const order = ["box", "slab", "bar"] as const;
  for (const kind of order) {
    for (const criterion of reading.criteria) {
      const color = inkColor(criterion.relation);
      for (const mark of criterion.marks) {
        if (mark.kind !== kind) continue;
        for (const face of markFaces(mark)) traceFace(ctx, face, color, mark.alpha, camera, width, height, tiles);
      }
    }
  }
}

const CYAN: [number, number, number] = [0.29, 0.86, 0.9];
const WHITE: [number, number, number] = [0.96, 0.97, 0.95];
const ORANGE: [number, number, number] = [0.9, 0.55, 0.4];

type FieldPoint = { x: number; y: number; z: number };
type FieldSample = {
  points: FieldPoint[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

const fieldCache = new WeakMap<IsoMesh, FieldSample>();

function unit(n: number) {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hue(t: number): [number, number, number] {
  const u = Math.min(1, Math.max(0, t));
  if (u < 0.46) return mix(CYAN, WHITE, u / 0.46);
  if (u > 0.54) return mix(WHITE, ORANGE, (u - 0.54) / 0.46);
  return WHITE;
}

function css(rgb: [number, number, number], alpha: number) {
  return `rgba(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)},${alpha})`;
}

function sampleField(mesh: IsoMesh): FieldSample {
  const cached = fieldCache.get(mesh);
  if (cached) return cached;
  const { positions, indices } = mesh;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  const triCount = Math.floor(indices.length / 3);
  const prefix = new Float32Array(Math.max(1, triCount));
  let total = 0;
  for (let tri = 0; tri < triCount; tri += 1) {
    const ia = indices[tri * 3] * 3;
    const ib = indices[tri * 3 + 1] * 3;
    const ic = indices[tri * 3 + 2] * 3;
    const abx = positions[ib] - positions[ia];
    const aby = positions[ib + 1] - positions[ia + 1];
    const abz = positions[ib + 2] - positions[ia + 2];
    const acx = positions[ic] - positions[ia];
    const acy = positions[ic + 1] - positions[ia + 1];
    const acz = positions[ic + 2] - positions[ia + 2];
    total += Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) * 0.5;
    prefix[tri] = total;
  }
  const count = Math.min(15000, Math.max(6000, triCount * 3));
  const points: FieldPoint[] = [];
  const push = (x: number, y: number, z: number, salt: number) => {
    points.push({
      x: x + (unit(salt) - 0.5) * span * 0.008,
      y: y + (unit(salt + 1.7) - 0.5) * span * 0.008,
      z: z + (unit(salt + 3.1) - 0.5) * span * 0.008,
    });
  };
  if (total > 0) {
    for (let index = 0; index < count; index += 1) {
      const target = unit(index + 0.25) * total;
      let low = 0;
      let high = triCount - 1;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (prefix[mid] < target) low = mid + 1;
        else high = mid;
      }
      const ia = indices[low * 3] * 3;
      const ib = indices[low * 3 + 1] * 3;
      const ic = indices[low * 3 + 2] * 3;
      let u = unit(index * 3 + 1);
      let v = unit(index * 3 + 2);
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      const w = 1 - u - v;
      push(
        positions[ia] * w + positions[ib] * u + positions[ic] * v,
        positions[ia + 1] * w + positions[ib + 1] * u + positions[ic + 1] * v,
        positions[ia + 2] * w + positions[ib + 2] * u + positions[ic + 2] * v,
        index * 9.1,
      );
    }
  }
  const vertexStep = Math.max(1, Math.floor(positions.length / 3 / 1800));
  for (let index = 0; index < positions.length; index += 3 * vertexStep) {
    push(positions[index], positions[index + 1], positions[index + 2], index + 40);
  }
  const sample = { points, minX, maxX, minY, maxY, minZ, maxZ };
  fieldCache.set(mesh, sample);
  return sample;
}

function projectView(
  point: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  fit: number,
  width: number,
  height: number,
) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x = point.x - center.x;
  const y = point.y - center.y;
  const z = point.z - center.z;
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  const aspect = width / Math.max(1, height);
  const depth = z2 * fit + EYE;
  const clip = depth > 0.05 ? depth : 0.05;
  const focal = 1.55;
  return {
    x: (x1 * fit * focal / clip * 0.5 + 0.5) * width,
    y: (-y2 * fit * aspect * focal / clip * 0.5 + 0.5) * height,
    depth,
  };
}

/** Abstract field for the criteria diagram only. The points are this cluster's mesh. */
function paintAbstract(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mesh: IsoMesh | null,
  camera: Camera | null,
) {
  ctx.clearRect(0, 0, width, height);
  if (!mesh || !camera || mesh.triangles < 4 || width < 2 || height < 2) return;
  const field = sampleField(mesh);
  const project = (point: { x: number; y: number; z: number }) => projectView(point, camera.center, camera.yaw, camera.pitch, camera.fit, width, height);
  const rightX = Math.cos(camera.yaw);
  const rightZ = Math.sin(camera.yaw);
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  const projected = field.points.map((point, index) => {
    const along = point.x * rightX + point.z * rightZ;
    if (along < minAlong) minAlong = along;
    if (along > maxAlong) maxAlong = along;
    const screen = project(point);
    return { ...screen, along, index };
  }).filter((point) => point.depth > 0.05);
  if (!projected.length) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let near = Infinity;
  for (const point of projected) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
    if (point.depth < near) near = point.depth;
  }
  const midY = (minY + maxY) / 2;
  const reach = Math.max(maxX - minX, maxY - minY, 40);

  ctx.save();
  const leftGlow = ctx.createRadialGradient(minX, midY, 0, minX, midY, reach * 0.72);
  leftGlow.addColorStop(0, "rgba(73, 215, 222, 0.2)");
  leftGlow.addColorStop(1, "rgba(73, 215, 222, 0)");
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 0, width, height);
  const rightGlow = ctx.createRadialGradient(maxX, midY, 0, maxX, midY, reach * 0.72);
  rightGlow.addColorStop(0, "rgba(224, 138, 100, 0.16)");
  rightGlow.addColorStop(1, "rgba(224, 138, 100, 0)");
  ctx.fillStyle = rightGlow;
  ctx.fillRect(0, 0, width, height);

  const alongSpan = Math.max(maxAlong - minAlong, 1e-4);
  projected.sort((a, b) => b.depth - a.depth);
  for (const point of projected) {
    const t = (point.along - minAlong) / alongSpan;
    const color = hue(t);
    const focus = Math.min(1.15, near / point.depth);
    const spark = unit(point.index + 8) > 0.972;
    const grain = unit(point.index);
    const size = (spark ? 3.4 : 0.9 + grain * 1.5) * (0.75 + focus * 0.35);
    ctx.fillStyle = css(spark ? WHITE : color, spark ? 0.85 : 0.22 + grain * 0.45);
    ctx.fillRect(point.x, point.y, size, size);
  }
  ctx.restore();
}

const SLIDER_STOPS: Array<[number, [number, number, number]]> = [
  [0, [73, 215, 222]],
  [0.34, [126, 200, 192]],
  [0.7, [215, 160, 122]],
  [1, [199, 126, 95]],
];

/** Same gradient as the ranking bars, sampled at that bar's end. */
function sliderColor(measured: number) {
  const t = Math.min(1, Math.max(0, (measured + 1) / 3));
  let index = 0;
  while (index < SLIDER_STOPS.length - 1 && t > SLIDER_STOPS[index + 1]![0]) index += 1;
  const [start, from] = SLIDER_STOPS[index]!;
  const [end, to] = SLIDER_STOPS[Math.min(index + 1, SLIDER_STOPS.length - 1)]!;
  const blend = end === start ? 0 : (t - start) / (end - start);
  const channel = (slot: 0 | 1 | 2) => Math.round(from[slot] + (to[slot] - from[slot]) * blend);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function tracePath(ctx: CanvasRenderingContext2D, color: string, width: number, alpha = 1) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
  ctx.lineWidth = width + 2.2;
  ctx.globalAlpha = 0.4;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.stroke();
  ctx.restore();
}

function boxCorners(mark: Extract<SpatialMark, { kind: "box" }>) {
  const { min, max } = mark;
  return [
    { x: min.x, y: min.y, z: min.z }, { x: max.x, y: min.y, z: min.z }, { x: max.x, y: max.y, z: min.z }, { x: min.x, y: max.y, z: min.z },
    { x: min.x, y: min.y, z: max.z }, { x: max.x, y: min.y, z: max.z }, { x: max.x, y: max.y, z: max.z }, { x: min.x, y: max.y, z: max.z },
  ];
}

function paintMeasuredMark(
  ctx: CanvasRenderingContext2D,
  mark: SpatialMark,
  project: (point: SpacePoint) => { x: number; y: number },
  color: string,
  width: number,
) {
  const stroke = Math.max(2.2, width / 340);
  if (mark.kind === "box") {
    const corners = boxCorners(mark).map(project);
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    ctx.beginPath();
    for (const [a, b] of edges) {
      ctx.moveTo(corners[a]!.x, corners[a]!.y);
      ctx.lineTo(corners[b]!.x, corners[b]!.y);
    }
    tracePath(ctx, color, stroke);
    return;
  }
  if (mark.kind === "bar") {
    const a = project(mark.a);
    const b = project(mark.b);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    tracePath(ctx, color, stroke + 0.4);
    return;
  }
  if (mark.polygon.length < 3) return;
  const ring = mark.polygon.map((point) => project({ x: point.x, y: mark.y + mark.height * 0.5, z: point.z }));
  ctx.beginPath();
  ring.forEach((point, slot) => (slot === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.closePath();
  tracePath(ctx, color, stroke);
}

function insideCluster(point: { x: number; y: number }, bounds: { minX: number; minY: number; maxX: number; maxY: number }, pad: number) {
  return point.x >= bounds.minX - pad && point.x <= bounds.maxX + pad && point.y >= bounds.minY - pad && point.y <= bounds.maxY + pad;
}

function clipSegment(a: { x: number; y: number }, b: { x: number; y: number }, bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: Array<[number, number]> = [
    [-dx, a.x - bounds.minX],
    [dx, bounds.maxX - a.x],
    [-dy, a.y - bounds.minY],
    [dy, bounds.maxY - a.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-6) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return {
    a: { x: a.x + dx * t0, y: a.y + dy * t0 },
    b: { x: a.x + dx * t1, y: a.y + dy * t1 },
  };
}

/** Measured extents only. A wire box is a volume on the cluster, a line is an axis across it. */
function paintQualities(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  reading: ClusterReading,
  camera: Camera,
  mesh: IsoMesh,
) {
  const project = (point: SpacePoint) => projectView(point, camera.center, camera.yaw, camera.pitch, camera.fit, width, height);
  const positions = mesh.positions;
  let meshMinX = Infinity;
  let meshMinZ = Infinity;
  let meshMaxX = -Infinity;
  let meshMaxZ = -Infinity;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const point = { x: positions[index]!, y: positions[index + 1]!, z: positions[index + 2]! };
    meshMinX = Math.min(meshMinX, point.x);
    meshMinZ = Math.min(meshMinZ, point.z);
    meshMaxX = Math.max(meshMaxX, point.x);
    meshMaxZ = Math.max(meshMaxZ, point.z);
    const screen = project(point);
    minX = Math.min(minX, screen.x);
    minY = Math.min(minY, screen.y);
    maxX = Math.max(maxX, screen.x);
    maxY = Math.max(maxY, screen.y);
  }
  const cluster = { minX, minY, maxX, maxY };
  const spanX = Math.max(meshMaxX - meshMinX, 1);
  const spanZ = Math.max(meshMaxZ - meshMinZ, 1);
  const ranked = reading.criteria.filter((criterion) => criterion.measured !== null && criterion.marks.length > 0);
  ctx.save();
  for (const criterion of ranked) {
    const color = sliderColor(criterion.measured ?? 0);
    for (const mark of criterion.marks) {
      if (mark.kind === "box") {
        const sizeX = mark.max.x - mark.min.x;
        const sizeZ = mark.max.z - mark.min.z;
        if (sizeX > spanX * 0.9 && sizeZ > spanZ * 0.9) continue;
        const center = project({
          x: (mark.min.x + mark.max.x) / 2,
          y: (mark.min.y + mark.max.y) / 2,
          z: (mark.min.z + mark.max.z) / 2,
        });
        if (!insideCluster(center, cluster, Math.min(width, height) * 0.02)) continue;
        paintMeasuredMark(ctx, mark, project, color, width);
        continue;
      }
      if (mark.kind === "bar") {
        const clipped = clipSegment(project(mark.a), project(mark.b), cluster);
        if (!clipped) continue;
        if (Math.hypot(clipped.b.x - clipped.a.x, clipped.b.y - clipped.a.y) < 8) continue;
        ctx.beginPath();
        ctx.moveTo(clipped.a.x, clipped.a.y);
        ctx.lineTo(clipped.b.x, clipped.b.y);
        tracePath(ctx, color, Math.max(2.2, width / 340) + 0.4);
        continue;
      }
      const sample = mark.polygon[Math.floor(mark.polygon.length / 2)];
      if (!sample) continue;
      const center = project({ x: sample.x, y: mark.y + mark.height * 0.5, z: sample.z });
      if (!insideCluster(center, cluster, Math.min(width, height) * 0.02)) continue;
      paintMeasuredMark(ctx, mark, project, color, width);
    }
  }
  ctx.restore();
}

/** One cluster's criteria, drawn on that cluster. This view does not write the cluster. */
export function ClusterCriteriaView({ programId, item, mesh, span }: { programId: string; item: FinishedIteration; mesh: IsoMesh | null; span: number }) {
  const solidRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const [activities, setActivities] = useState<ClientCompatibilityDocument | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/site/client-activities", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unread");
        return parseClientCompatibility(await response.json() as unknown);
      })
      .then((document) => {
        if (document) setActivities(document);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const reading = useMemo(
    () => (activities ? readClusterCriteria(programId, item, activities) : { criteria: [] as ClusterReading["criteria"] }),
    [activities, item, programId],
  );
  const title = reading.criteria.map((criterion) => `${criterion.label}: ${levelName(criterion.measured)} measured, ${levelName(criterion.desired)} desired. ${criterion.basis}`).join("\n");

  useEffect(() => {
    const solid = solidRef.current;
    const ink = inkRef.current;
    const stage = solid?.parentElement;
    if (!solid || !ink || !stage) return;
    const draw = () => {
      let camera: Camera | null = null;
      if (mesh && mesh.triangles > 4) {
        const frame = drawPlacedMeshes(solid, [{
          id: "shrinkwrap",
          mesh,
          translate: { x: 0, y: 0, z: 0 },
          selected: false,
          color: [1, 1, 1] as [number, number, number],
          opacity: 1,
          plain: true,
          hold: true,
        }], 0.9, -0.48, Math.max(8, span), false, EYE, false, 0.74, undefined, true, true, undefined, 1, 960, [0, 0, 0, 0]);
        if (frame) camera = frame;
      } else {
        const width = Math.max(1, stage.clientWidth);
        const height = Math.max(1, stage.clientHeight);
        solid.width = width;
        solid.height = height;
      }
      ink.width = solid.width;
      ink.height = solid.height;
      ink.style.width = solid.style.width;
      ink.style.height = solid.style.height;
      const ctx = ink.getContext("2d");
      if (!ctx) return;
      paintAbstract(ctx, ink.width, ink.height, mesh, camera);
      if (camera && mesh) paintQualities(ctx, ink.width, ink.height, reading, camera, mesh);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [mesh, item, reading, span]);

  return (
    <div className="cluster-study-criteria" data-analysis-stage="" title={title}>
      <canvas ref={solidRef} aria-hidden="true" />
      <canvas ref={inkRef} aria-label={`Iteration ${String(item.iteration).padStart(2, "0")} criteria`} />
    </div>
  );
}
