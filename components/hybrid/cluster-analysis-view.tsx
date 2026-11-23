"use client";

import { useEffect, useMemo, useRef } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
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
  const callouts = placeCallouts(ctx, reading, camera, width, height, tiles);
  const weight = Math.max(1.25, Math.min(width, height) / 380);
  for (const callout of callouts) {
    const fromX = callout.side === "left" ? callout.box.x + callout.box.w : callout.box.x;
    const fromY = callout.box.y + callout.nameSize * 0.55;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(callout.at.x, callout.at.y);
    ctx.strokeStyle = callout.color;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = weight;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const callout of callouts) {
    ctx.beginPath();
    ctx.arc(callout.at.x, callout.at.y, Math.max(4, callout.nameSize * 0.28), 0, Math.PI * 2);
    ctx.fillStyle = callout.color;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, weight);
    ctx.strokeStyle = "#000000";
    ctx.stroke();
    const plate = 6;
    ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
    ctx.fillRect(callout.box.x - plate, callout.box.y - plate * 0.4, callout.box.w + plate, callout.box.h + plate * 0.3);
    ctx.fillStyle = callout.color;
    ctx.fillRect(callout.box.x - plate, callout.box.y - plate * 0.4, Math.max(2, weight), callout.box.h + plate * 0.3);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = callout.color;
    ctx.font = `${callout.nameSize}px ui-sans-serif, sans-serif`;
    ctx.fillText(`${String(callout.index + 1).padStart(2, "0")}  ${callout.label.toUpperCase()}`, callout.box.x, callout.box.y);
    const trackH = Math.max(18, Math.round(callout.detailSize * 1.85));
    const captionW = Math.min(callout.box.w * 0.34, callout.detailSize * 7.2);
    const rows = [
      { caption: "Cluster", level: callout.measured, color: callout.color },
      { caption: "Program", level: callout.desired, color: "#c77e5f" },
    ];
    rows.forEach((row, index) => {
      const rowY = callout.box.y + callout.nameSize + callout.nameSize * 0.22 + index * trackH;
      ctx.fillStyle = "#9b9b98";
      ctx.font = `${callout.detailSize}px ui-sans-serif, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(row.caption, callout.box.x, rowY + trackH * 0.16);
      drawRankSlider(ctx, callout.box.x + captionW, rowY, callout.box.w - captionW, trackH, row.level, row.color);
    });
  }
}

/** One cluster's criteria, drawn on that cluster. This view does not write the cluster. */
export function ClusterCriteriaView({ programId, item, mesh, span }: { programId: string; item: FinishedIteration; mesh: IsoMesh | null; span: number }) {
  const solidRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const reading = useMemo(() => readClusterCriteria(programId, item), [programId, item]);
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
        }], 0.9, -0.48, Math.max(8, span), false, EYE, false, 0.58, undefined, true, true, undefined, 1, 960);
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
      paintReading(ctx, ink.width, ink.height, item, reading, camera);
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
