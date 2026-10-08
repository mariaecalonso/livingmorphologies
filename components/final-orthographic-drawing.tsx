"use client";

import { useEffect, useRef, useState } from "react";
import { placeholderPositions } from "@/components/final-placeholder-morphology";
import { MODULE_SIZE_Z } from "@/lib/skill3/envelope";
import { cachedOpeningMesh } from "@/lib/skill3/opening-mesh-cache";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

type Surface = {
  positions: Float32Array;
  indices: Uint32Array | null;
};

type View = "top" | "side";

export function FinalOrthographicViews({
  field,
  cacheIdentity,
  placeholderId,
  accent,
}: {
  field: VerticalViewerField | null;
  cacheIdentity: string | null;
  placeholderId: string;
  accent: string;
}) {
  const [surface, setSurface] = useState<Surface | null>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const sideRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (field && cacheIdentity && field.slices.length >= 2) {
      try {
        const mesh = cachedOpeningMesh(field.slices, {
          identity: cacheIdentity,
          sequence: field.slices.map((slice) => slice.iteration).join(","),
          field: "network",
          mode: "isomesh",
          iso: 0.48,
          sizeZ: MODULE_SIZE_Z,
          refine: true,
        });
        setSurface(mesh.triangles > 0 ? { positions: mesh.positions, indices: mesh.indices } : null);
        return;
      } catch {
        setSurface(null);
        return;
      }
    }
    setSurface({ positions: placeholderPositions(placeholderId), indices: null });
  }, [cacheIdentity, field, placeholderId]);

  useEffect(() => {
    const paint = () => {
      drawOrthographic(topRef.current, surface, "top", accent);
      drawOrthographic(sideRef.current, surface, "side", accent);
    };
    paint();
    const nodes = [topRef.current?.parentElement, sideRef.current?.parentElement].filter((node): node is HTMLElement => !!node);
    const observer = new ResizeObserver(paint);
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [accent, surface]);

  return (
    <div className="final-drawings">
      <figure className="final-drawing">
        <figcaption>Top view</figcaption>
        <canvas ref={topRef} aria-label="Orthographic top view" />
      </figure>
      <figure className="final-drawing">
        <figcaption>Side / elevation view</figcaption>
        <canvas ref={sideRef} aria-label="Orthographic side elevation" />
      </figure>
    </div>
  );
}

function drawOrthographic(
  canvas: HTMLCanvasElement | null,
  surface: Surface | null,
  view: View,
  accent: string,
) {
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(parent.clientWidth));
  const height = Math.max(1, Math.floor(canvas.clientHeight || parent.clientHeight * 0.82));
  const pixelsW = Math.floor(width * dpr);
  const pixelsH = Math.floor(height * dpr);
  if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
    canvas.width = pixelsW;
    canvas.height = pixelsH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!surface || surface.positions.length < 9) {
    groundLine(ctx, width, height * 0.78, width * 0.14, width * 0.86, accent);
    return;
  }

  const { positions } = surface;
  const triangles = triangleList(surface);
  let positive = 0;
  const normals: Array<[number, number, number]> = [];
  for (const [ia, ib, ic] of triangles) {
    const normal = faceNormal(positions, ia, ib, ic);
    normals.push(normal);
    const facing = view === "top" ? normal[1] : normal[2];
    if (facing > 0) positive += 1;
  }
  const flip = positive < triangles.length * 0.5;
  const front = (index: number) => {
    const value = view === "top" ? normals[index][1] : normals[index][2];
    return flip ? value < -1e-6 : value > 1e-6;
  };

  const weld = new Map<string, number>();
  const weldId = (index: number) => {
    const key = `${Math.round(positions[index * 3] * 1000)},${Math.round(positions[index * 3 + 1] * 1000)},${Math.round(positions[index * 3 + 2] * 1000)}`;
    const existing = weld.get(key);
    if (existing != null) return existing;
    const next = weld.size;
    weld.set(key, next);
    return next;
  };

  type Edge = {
    a: number;
    b: number;
    fronts: number;
    na: [number, number, number] | null;
    nb: [number, number, number] | null;
  };
  const edges = new Map<string, Edge>();
  triangles.forEach(([ia, ib, ic], face) => {
    const ids = [weldId(ia), weldId(ib), weldId(ic)];
    const raw = [ia, ib, ic];
    const facing = front(face);
    for (let edge = 0; edge < 3; edge += 1) {
      const left = ids[edge];
      const right = ids[(edge + 1) % 3];
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      let record = edges.get(key);
      if (!record) {
        record = { a: raw[edge], b: raw[(edge + 1) % 3], fronts: 0, na: null, nb: null };
        edges.set(key, record);
      }
      if (!facing) continue;
      record.fronts += 1;
      if (!record.na) record.na = normals[face];
      else record.nb = normals[face];
    }
  });

  const lines: Array<{ a: number; b: number; kind: "outline" | "crease" }> = [];
  for (const edge of edges.values()) {
    if (edge.fronts === 1) lines.push({ a: edge.a, b: edge.b, kind: "outline" });
    else if (edge.fronts === 2 && edge.na && edge.nb && dot(edge.na, edge.nb) < 0.28) {
      lines.push({ a: edge.a, b: edge.b, kind: "crease" });
    }
  }
  if (lines.length === 0) return;

  const project = (index: number) => {
    const x = positions[index * 3];
    const y = positions[index * 3 + 1];
    const z = positions[index * 3 + 2];
    return view === "top" ? [x, -z] as const : [x, y] as const;
  };
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const line of lines) {
    for (const index of [line.a, line.b]) {
      const [u, v] = project(index);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  const spanU = Math.max(0.001, maxU - minU);
  const spanV = Math.max(0.001, maxV - minV);
  const pad = 0.86;
  const scale = Math.min((width * pad) / spanU, (height * pad) / spanV);
  const originU = width * 0.5 - ((minU + maxU) / 2) * scale;
  const originV = height * 0.5 + ((minV + maxV) / 2) * scale;
  const point = (index: number) => {
    const [u, v] = project(index);
    return [originU + u * scale, originV - v * scale] as const;
  };

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = 0.55;
  for (const line of lines) {
    if (line.kind !== "crease") continue;
    const [ax, ay] = point(line.a);
    const [bx, by] = point(line.b);
    if (Math.hypot(bx - ax, by - ay) < 7) continue;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.strokeStyle = "#f4f4f0";
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.75;
  for (const line of lines) {
    if (line.kind !== "outline") continue;
    const [ax, ay] = point(line.a);
    const [bx, by] = point(line.b);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const [left, top] = point(lines[0].a);
  let minX = left;
  let maxX = left;
  let base = top;
  for (const line of lines) {
    for (const index of [line.a, line.b]) {
      const [x, y] = point(index);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      base = Math.max(base, y);
    }
  }
  groundLine(ctx, width, Math.min(height - 2, base + 8), minX, maxX, accent);
}

function groundLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  y: number,
  x0: number,
  x1: number,
  accent: string,
) {
  const pad = Math.max(8, (x1 - x0) * 0.08);
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.max(8, x0 - pad), y);
  ctx.lineTo(Math.min(width - 8, x1 + pad), y);
  ctx.stroke();
  ctx.restore();
}

function triangleList(surface: Surface) {
  const triangles: Array<[number, number, number]> = [];
  if (surface.indices) {
    for (let i = 0; i < surface.indices.length; i += 3) {
      triangles.push([surface.indices[i], surface.indices[i + 1], surface.indices[i + 2]]);
    }
    return triangles;
  }
  const count = Math.floor(surface.positions.length / 9) * 3;
  for (let i = 0; i < count; i += 3) triangles.push([i, i + 1, i + 2]);
  return triangles;
}

function faceNormal(positions: Float32Array, ia: number, ib: number, ic: number): [number, number, number] {
  const ax = positions[ia * 3];
  const ay = positions[ia * 3 + 1];
  const az = positions[ia * 3 + 2];
  const bx = positions[ib * 3] - ax;
  const by = positions[ib * 3 + 1] - ay;
  const bz = positions[ib * 3 + 2] - az;
  const cx = positions[ic * 3] - ax;
  const cy = positions[ic * 3 + 1] - ay;
  const cz = positions[ic * 3 + 2] - az;
  const nx = by * cz - bz * cy;
  const ny = bz * cx - bx * cz;
  const nz = bx * cy - by * cx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
