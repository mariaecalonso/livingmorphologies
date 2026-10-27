"use client";

import { useEffect, useRef, useState } from "react";
import { paintedBox } from "@/lib/canvas-frame";
import { placeholderPositions } from "@/components/final-placeholder-morphology";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { MODULE_SIZE_Z } from "@/lib/skill3/envelope";
import { cachedOpeningMesh } from "@/lib/skill3/opening-mesh-cache";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

type Surface = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
};

type View = "top" | "side";
type Vec3 = [number, number, number];
type Point = { x: number; y: number; z: number; key: string };
type Screen = readonly [number, number];

export function FinalOrthographicViews({
  field,
  mesh,
  cacheIdentity,
  placeholderId,
  accent,
}: {
  field: VerticalViewerField | null;
  /** Stored module. When present, the continuation field is not meshed. */
  mesh?: IsoMesh | null;
  cacheIdentity: string | null;
  placeholderId: string;
  accent: string;
}) {
  const [surface, setSurface] = useState<Surface | null>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const sideRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (mesh && mesh.triangles > 0) {
      setSurface(prepareSurface(mesh.positions, mesh.indices, mesh.normals));
      return;
    }
    if (mesh) {
      setSurface(prepareSurface(placeholderPositions(placeholderId), null, null));
      return;
    }
    if (field && cacheIdentity && field.slices.length >= 2) {
      try {
        const built = cachedOpeningMesh(field.slices, {
          identity: cacheIdentity,
          sequence: field.slices.map((slice) => slice.iteration).join(","),
          field: "network",
          mode: "isomesh",
          iso: 0.48,
          sizeZ: MODULE_SIZE_Z,
          refine: true,
        });
        setSurface(built.triangles > 0 ? prepareSurface(built.positions, built.indices, built.normals) : null);
        return;
      } catch {
        setSurface(null);
        return;
      }
    }
    setSurface(prepareSurface(placeholderPositions(placeholderId), null, null));
  }, [cacheIdentity, field, mesh, placeholderId]);

  useEffect(() => {
    const paint = () => {
      drawPair(topRef.current, sideRef.current, surface, accent);
    };
    paint();
    const nodes = [topRef.current?.parentElement, sideRef.current?.parentElement].filter((node): node is HTMLElement => !!node);
    const observer = new ResizeObserver(paint);
    for (const node of nodes) observer.observe(node);
    const parent = window.parent;
    if (parent && parent !== window) parent.addEventListener("resize", paint);
    return () => {
      observer.disconnect();
      if (parent && parent !== window) parent.removeEventListener("resize", paint);
    };
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

function prepareSurface(positions: Float32Array, indices: Uint32Array | null, normals: Float32Array | null): Surface | null {
  if (positions.length < 9) return null;
  const resolved = indices && indices.length >= 3
    ? indices
    : Uint32Array.from({ length: Math.floor(positions.length / 3) }, (_, index) => index);
  const resolvedNormals = normals && normals.length === positions.length ? normals : vertexNormals(positions, resolved);
  return { positions, indices: resolved, normals: resolvedNormals };
}

function drawPair(
  topCanvas: HTMLCanvasElement | null,
  sideCanvas: HTMLCanvasElement | null,
  surface: Surface | null,
  accent: string,
) {
  const top = resizeCanvas(topCanvas);
  const side = resizeCanvas(sideCanvas);
  if (!top || !side) return;
  top.ctx.clearRect(0, 0, top.width, top.height);
  side.ctx.clearRect(0, 0, side.width, side.height);
  if (!surface) {
    groundLine(top.ctx, top.width, top.height * 0.78, top.width * 0.14, top.width * 0.86, accent);
    groundLine(side.ctx, side.width, side.height * 0.78, side.width * 0.14, side.width * 0.86, accent);
    return;
  }
  const topBounds = projectedBounds(surface.positions, "top");
  const sideBounds = projectedBounds(surface.positions, "side");
  const scale = Math.min(fitScale(topBounds, top.width, top.height), fitScale(sideBounds, side.width, side.height));
  const display = presentationScale();
  drawView(top, surface, "top", scale, topBounds, accent, display);
  drawView(side, surface, "side", scale, sideBounds, accent, display);
}

function drawView(
  canvas: SizedCanvas,
  surface: Surface,
  view: View,
  scale: number,
  bounds: Bounds,
  accent: string,
  display: number,
) {
  const { ctx, width, height } = canvas;
  const frame = makeFrame(view, scale, bounds, width, height);
  const longest = Math.max(width, height);
  const rasterScale = longest > 760 ? 760 / longest : 1;
  const rw = Math.max(2, Math.round(width * rasterScale));
  const rh = Math.max(2, Math.round(height * rasterScale));
  const mask = rasterize(surface, frame, rw, rh, rasterScale);
  const loops = maskPolylines(mask.cover, mask.outside, rw, rh).map((loop) => ({
    kind: loop.kind,
    points: loop.points.map(([x, y]) => [x / rasterScale, y / rasterScale] as const),
  }));
  const silhouette = loops.map((loop) => loop.points);
  const minor = Math.min(bounds.spanU, bounds.spanV) * scale;
  const weights = strokeWidths(display, minor);
  const gap = Math.max(14, weights.outer * 1.15);
  const minInternal = Math.max(52, minor * 0.14);
  const projectPath = (path: Point[]) => path.map((point) => frame.screen(point.x, point.y, point.z));
  const contours = internalContours(surface, frame, mask, rasterScale).flatMap((path) =>
    keepAway(projectPath(path), silhouette, gap, minInternal),
  );
  const features = featureStrokes(surface, frame, mask, rasterScale).flatMap((path) =>
    keepAway(projectPath(path.points), silhouette, gap, minInternal).map((points) => ({
      points,
      angle: path.angle,
    })),
  );
  const layers = depthContours(mask, rasterScale).flatMap((path) => keepAway(path, silhouette, gap, minInternal * 2.1));

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const path of features) {
    if (path.angle >= 56) continue;
    strokePath(ctx, smooth(path.points, 0.28), weights.fine, 0.78);
  }
  for (const path of features) {
    if (path.angle < 56) continue;
    strokePath(ctx, smooth(path.points, 0.22), weights.primary, 0.9);
  }
  for (const path of contours) strokePath(ctx, path, weights.contour, 0.9);
  for (const path of layers) strokePath(ctx, path, weights.depth, 0.96);
  for (const loop of loops) {
    if (loop.kind === "hole") strokePath(ctx, loop.points, weights.hole, 1, true);
  }
  for (const loop of loops) {
    if (loop.kind === "outer") strokePath(ctx, loop.points, weights.outer, 1, true);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let base = 0;
  for (const loop of loops) {
    if (loop.kind !== "outer") continue;
    for (const [x, y] of loop.points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      base = Math.max(base, y);
    }
  }
  if (Number.isFinite(minX)) {
    groundLine(ctx, width, Math.min(height - 2, base + Math.max(8, weights.outer)), minX, maxX, accent, Math.max(1, weights.fine * 0.9));
  }
}

type SizedCanvas = { ctx: CanvasRenderingContext2D; width: number; height: number };

function resizeCanvas(canvas: HTMLCanvasElement | null): SizedCanvas | null {
  if (!canvas) return null;
  const parent = canvas.parentElement;
  if (!parent) return null;
  const dpr = window.devicePixelRatio || 1;
  const frame = paintedBox(parent);
  const caption = canvas.previousElementSibling instanceof HTMLElement ? canvas.previousElementSibling.offsetHeight : 0;
  const width = frame.width;
  const height = Math.max(1, Math.floor(frame.height - caption * (frame.height / frame.layoutH)));
  const pixelsW = Math.floor(width * dpr);
  const pixelsH = Math.floor(height * dpr);
  canvas.style.width = `${frame.layoutW}px`;
  canvas.style.height = `${Math.max(1, frame.layoutH - caption)}px`;
  if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
    canvas.width = pixelsW;
    canvas.height = pixelsH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

type Bounds = { minU: number; maxU: number; minV: number; maxV: number; spanU: number; spanV: number };

function projectedBounds(positions: Float32Array, view: View): Bounds {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const [u, v] = project(view, positions[index], positions[index + 1], positions[index + 2]);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  return {
    minU,
    maxU,
    minV,
    maxV,
    spanU: Math.max(0.001, maxU - minU),
    spanV: Math.max(0.001, maxV - minV),
  };
}

function fitScale(bounds: Bounds, width: number, height: number) {
  return Math.min((width * 0.85) / bounds.spanU, (height * 0.85) / bounds.spanV);
}

function presentationScale() {
  try {
    const frame = window.frameElement;
    if (!frame || typeof frame.getBoundingClientRect !== "function") return 1;
    const displayed = frame.getBoundingClientRect().width;
    const layout = window.innerWidth;
    if (!(displayed > 0) || !(layout > 0)) return 1;
    const scale = displayed / layout;
    return scale > 0.05 && scale <= 1 ? scale : 1;
  } catch {
    return 1;
  }
}

function strokeWidths(display: number, minor: number) {
  const target = 2.55 / display;
  const cap = Math.max(2.5, minor * 0.16);
  const outer = Math.min(target, cap);
  const ratio = outer / target;
  const px = (screen: number) => (screen / display) * ratio;
  return {
    outer,
    hole: px(1.82),
    depth: px(1.5),
    contour: px(1.18),
    primary: px(0.98),
    fine: px(0.72),
  };
}

function project(view: View, x: number, y: number, z: number) {
  return view === "top" ? ([x, -z] as const) : ([x, y] as const);
}

function makeFrame(view: View, scale: number, bounds: Bounds, width: number, height: number) {
  const viewDir: Vec3 = view === "top" ? [0, 1, 0] : [0, 0, 1];
  const originU = width * 0.5 - ((bounds.minU + bounds.maxU) / 2) * scale;
  const originV = height * 0.5 + ((bounds.minV + bounds.maxV) / 2) * scale;
  const depth = (x: number, y: number, z: number) => (view === "top" ? y : z);
  const screen = (x: number, y: number, z: number): Screen => {
    const [u, v] = project(view, x, y, z);
    return [originU + u * scale, originV - v * scale];
  };
  return { viewDir, scale, originU, originV, depth, screen };
}

type Frame = ReturnType<typeof makeFrame>;

function rasterize(surface: Surface, frame: Frame, width: number, height: number, rasterScale: number) {
  const { positions, indices } = surface;
  const depth = new Float32Array(width * height);
  depth.fill(-Infinity);
  const glance = new Float32Array(width * height);
  const cover = new Uint8Array(width * height);
  const facing = new Float32Array(indices.length / 3);
  const sign = outwardSign(surface);
  for (let face = 0; face < indices.length; face += 3) {
    const normal = faceNormal(positions, indices[face], indices[face + 1], indices[face + 2]);
    facing[face / 3] = sign * (normal[0] * frame.viewDir[0] + normal[1] * frame.viewDir[1] + normal[2] * frame.viewDir[2]);
  }
  const toMask = (x: number, y: number, z: number) => {
    const [sx, sy] = frame.screen(x, y, z);
    return [sx * rasterScale, sy * rasterScale] as const;
  };
  for (let face = 0; face < indices.length; face += 3) {
    const ia = indices[face];
    const ib = indices[face + 1];
    const ic = indices[face + 2];
    const ax = positions[ia * 3];
    const ay = positions[ia * 3 + 1];
    const az = positions[ia * 3 + 2];
    const bx = positions[ib * 3];
    const by = positions[ib * 3 + 1];
    const bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3];
    const cy = positions[ic * 3 + 1];
    const cz = positions[ic * 3 + 2];
    const [a0, a1] = toMask(ax, ay, az);
    const [b0, b1] = toMask(bx, by, bz);
    const [c0, c1] = toMask(cx, cy, cz);
    const area = (b0 - a0) * (c1 - a1) - (c0 - a0) * (b1 - a1);
    if (Math.abs(area) < 1e-8) continue;
    const da = frame.depth(ax, ay, az);
    const db = frame.depth(bx, by, bz);
    const dc = frame.depth(cx, cy, cz);
    const front = facing[face / 3] > 0.02;
    const minX = Math.max(0, Math.floor(Math.min(a0, b0, c0)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(a0, b0, c0)));
    const minY = Math.max(0, Math.floor(Math.min(a1, b1, c1)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(a1, b1, c1)));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((b0 - px) * (c1 - py) - (c0 - px) * (b1 - py)) / area;
        const w1 = ((c0 - px) * (a1 - py) - (a0 - px) * (c1 - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
        const pixel = y * width + x;
        cover[pixel] = 1;
        if (!front) continue;
        const z = w0 * da + w1 * db + w2 * dc;
        if (z > depth[pixel]) {
          depth[pixel] = z;
          glance[pixel] = facing[face / 3];
        }
      }
    }
  }
  const outside = new Uint8Array(width * height);
  const queue: number[] = [];
  const pushEmpty = (pixel: number) => {
    if (cover[pixel] || outside[pixel]) return;
    outside[pixel] = 1;
    queue.push(pixel);
  };
  for (let x = 0; x < width; x += 1) {
    pushEmpty(x);
    pushEmpty((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    pushEmpty(y * width);
    pushEmpty(y * width + width - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = (pixel - x) / width;
    if (x > 0) pushEmpty(pixel - 1);
    if (x + 1 < width) pushEmpty(pixel + 1);
    if (y > 0) pushEmpty(pixel - width);
    if (y + 1 < height) pushEmpty(pixel + width);
  }
  return { depth, glance, cover, outside, width, height };
}

type Mask = ReturnType<typeof rasterize>;

function maskPolylines(cover: Uint8Array, outside: Uint8Array, width: number, height: number) {
  type End = { x: number; y: number; key: string; kind: "outer" | "hole" };
  const segs: Array<{ a: End; b: End }> = [];
  const corner = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : cover[y * width + x] ? 1 : 0);
  const mid = (x: number, y: number, emptyX: number, emptyY: number): End => {
    const px = Math.max(0, Math.min(width - 1, emptyX));
    const py = Math.max(0, Math.min(height - 1, emptyY));
    const pixel = py * width + px;
    const kind = !cover[pixel] && !outside[pixel] ? "hole" : "outer";
    return { x, y, key: `${x},${y}`, kind };
  };
  for (let y = -1; y < height; y += 1) {
    for (let x = -1; x < width; x += 1) {
      const c0 = corner(x, y);
      const c1 = corner(x + 1, y);
      const c2 = corner(x + 1, y + 1);
      const c3 = corner(x, y + 1);
      const id = c0 | (c1 << 1) | (c2 << 2) | (c3 << 3);
      if (id === 0 || id === 15) continue;
      const top = mid(x + 0.5, y, x + (c0 ? 1 : 0), y + (c0 ? -1 : 0));
      const right = mid(x + 1, y + 0.5, x + (c1 ? 2 : 0), y);
      const bottom = mid(x + 0.5, y + 1, x + (c3 ? 0 : 1), y + (c3 ? 1 : 2));
      const left = mid(x, y + 0.5, x + (c0 ? -1 : 1), y);
      const add = (a: End, b: End) => segs.push({ a, b });
      if (id === 1 || id === 14) add(left, top);
      else if (id === 2 || id === 13) add(top, right);
      else if (id === 3 || id === 12) add(left, right);
      else if (id === 4 || id === 11) add(right, bottom);
      else if (id === 6 || id === 9) add(top, bottom);
      else if (id === 7 || id === 8) add(left, bottom);
      else if (id === 5) {
        add(left, top);
        add(right, bottom);
      } else if (id === 10) {
        add(top, right);
        add(left, bottom);
      }
    }
  }
  const paths = chainEnds(segs);
  return paths.flatMap((ends) => {
    if (ends.length < 6) return [];
    const hole = ends.filter((point) => point.kind === "hole").length > ends.length * 0.4;
    const points = rdp(ends.map((point) => [point.x, point.y] as const), 0.85);
    if (screenLength(points) < 12) return [];
    return [{ points, kind: hole ? "hole" as const : "outer" as const }];
  });
}

function depthContours(mask: Mask, rasterScale: number): Screen[][] {
  const { depth, glance, cover, width, height } = mask;
  const jump = 0.85;
  const marks = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!cover[pixel] || glance[pixel] < 0.22) continue;
      const near = depth[pixel];
      if (x + 1 < width) {
        const other = pixel + 1;
        if (cover[other] && glance[other] > 0.22 && near > depth[other] + jump) marks[pixel] = 1;
      }
      if (y + 1 < height) {
        const other = pixel + width;
        if (cover[other] && glance[other] > 0.22 && near > depth[other] + jump) marks[pixel] = 1;
      }
    }
  }
  return traceMarks(marks, width, height).flatMap((path) => {
    const screen = rdp(
      path.map(([x, y]) => [x / rasterScale, y / rasterScale] as const),
      1.25,
    );
    return screenLength(screen) >= 16 ? [smooth(screen, 0.3)] : [];
  });
}

function traceMarks(marks: Uint8Array, width: number, height: number): Screen[][] {
  const visited = new Uint8Array(marks.length);
  const paths: Screen[][] = [];
  const open = (x: number, y: number) => {
    const found: Array<[number, number]> = [];
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (ox === 0 && oy === 0) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const pixel = ny * width + nx;
        if (marks[pixel] && !visited[pixel]) found.push([nx, ny]);
      }
    }
    return found;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!marks[start] || visited[start]) continue;
      visited[start] = 1;
      const path: Screen[] = [[x + 0.5, y + 0.5]];
      let cx = x;
      let cy = y;
      for (let guard = 0; guard < width * height; guard += 1) {
        const options = open(cx, cy);
        if (options.length === 0) break;
        let pick = options[0];
        if (options.length > 1 && path.length >= 2) {
          const prev = path[path.length - 2];
          const dx = cx + 0.5 - prev[0];
          const dy = cy + 0.5 - prev[1];
          let best = -Infinity;
          for (const option of options) {
            const score = (option[0] - cx) * dx + (option[1] - cy) * dy;
            if (score > best) {
              best = score;
              pick = option;
            }
          }
        }
        visited[pick[1] * width + pick[0]] = 1;
        path.push([pick[0] + 0.5, pick[1] + 0.5]);
        cx = pick[0];
        cy = pick[1];
      }
      if (Math.abs(cx - x) <= 1 && Math.abs(cy - y) <= 1 && (cx !== x || cy !== y)) path.push(path[0]);
      if (path.length >= 8) paths.push(path);
    }
  }
  return paths;
}

function internalContours(surface: Surface, frame: Frame, mask: Mask, rasterScale: number) {
  const { positions, normals, indices } = surface;
  const sign = outwardSign(surface);
  const scalar = new Float32Array(normals.length / 3);
  for (let index = 0; index < scalar.length; index += 1) {
    let value = sign * dot3(normals, index, frame.viewDir);
    if (value === 0) value = 1e-7;
    scalar[index] = value;
  }
  const segments: Array<{ a: Point; b: Point }> = [];
  for (let face = 0; face < indices.length; face += 3) {
    const ids = [indices[face], indices[face + 1], indices[face + 2]];
    const hits: Point[] = [];
    for (let edge = 0; edge < 3; edge += 1) {
      const i0 = ids[edge];
      const i1 = ids[(edge + 1) % 3];
      if (scalar[i0] * scalar[i1] >= 0) continue;
      const t = scalar[i0] / (scalar[i0] - scalar[i1]);
      hits.push({
        x: positions[i0 * 3] + (positions[i1 * 3] - positions[i0 * 3]) * t,
        y: positions[i0 * 3 + 1] + (positions[i1 * 3 + 1] - positions[i0 * 3 + 1]) * t,
        z: positions[i0 * 3 + 2] + (positions[i1 * 3 + 2] - positions[i0 * 3 + 2]) * t,
        key: i0 < i1 ? `${i0}|${i1}` : `${i1}|${i0}`,
      });
    }
    if (hits.length === 2) segments.push({ a: hits[0], b: hits[1] });
  }
  return chainPoints(segments).flatMap((path) => clipVisible(path, frame, mask, rasterScale)).filter((path) => worldLength(path) > 0.48);
}

function featureStrokes(surface: Surface, frame: Frame, mask: Mask, rasterScale: number) {
  const { positions, indices } = surface;
  const sign = outwardSign(surface);
  const triCount = indices.length / 3;
  const normals: Vec3[] = new Array(triCount);
  for (let face = 0; face < triCount; face += 1) {
    const normal = faceNormal(positions, indices[face * 3], indices[face * 3 + 1], indices[face * 3 + 2]);
    normals[face] = [normal[0] * sign, normal[1] * sign, normal[2] * sign];
  }
  const edges = new Map<string, { a: number; b: number; faces: number[] }>();
  for (let face = 0; face < triCount; face += 1) {
    const ids = [indices[face * 3], indices[face * 3 + 1], indices[face * 3 + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const left = ids[edge];
      const right = ids[(edge + 1) % 3];
      const key = left < right ? `${left}|${right}` : `${right}|${left}`;
      let record = edges.get(key);
      if (!record) {
        record = { a: left, b: right, faces: [] };
        edges.set(key, record);
      }
      record.faces.push(face);
    }
  }
  const sharp: Array<{ a: number; b: number; angle: number }> = [];
  for (const edge of edges.values()) {
    if (edge.faces.length !== 2) continue;
    const a = normals[edge.faces[0]];
    const b = normals[edge.faces[1]];
    const angle = (Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
    if (angle < 40) continue;
    const fa = a[0] * frame.viewDir[0] + a[1] * frame.viewDir[1] + a[2] * frame.viewDir[2];
    const fb = b[0] * frame.viewDir[0] + b[1] * frame.viewDir[1] + b[2] * frame.viewDir[2];
    if (fa <= 0.1 || fb <= 0.1) continue;
    sharp.push({ a: edge.a, b: edge.b, angle });
  }
  return chainFeatures(surface.positions, sharp).flatMap((path) => {
    const points = path.ids.map((index) => ({
      x: surface.positions[index * 3],
      y: surface.positions[index * 3 + 1],
      z: surface.positions[index * 3 + 2],
      key: String(index),
    }));
    return clipVisible(points, frame, mask, rasterScale)
      .filter((run) => worldLength(run) > 0.95)
      .map((run) => ({ points: run, angle: path.angle }));
  });
}

function clipVisible(points: Point[], frame: Frame, mask: Mask, rasterScale: number) {
  if (points.length < 2) return [];
  const seen = points.map((point) => visible(point, frame, mask, rasterScale));
  const runs: Point[][] = [];
  let current: Point[] = [];
  let hidden: Point[] = [];
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
    hidden = [];
  };
  for (let index = 0; index < points.length; index += 1) {
    if (seen[index]) {
      if (hidden.length && current.length) {
        if (worldLength([current[current.length - 1], ...hidden, points[index]]) <= 0.45) current.push(...hidden);
        else flush();
      }
      hidden = [];
      current.push(points[index]);
    } else if (current.length) hidden.push(points[index]);
  }
  flush();
  return runs;
}

function visible(point: Point, frame: Frame, mask: Mask, rasterScale: number) {
  const [sx, sy] = frame.screen(point.x, point.y, point.z);
  const x = Math.round(sx * rasterScale - 0.5);
  const y = Math.round(sy * rasterScale - 0.5);
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return true;
  const pixel = y * mask.width + x;
  if (!mask.cover[pixel] || mask.depth[pixel] === -Infinity) return true;
  return frame.depth(point.x, point.y, point.z) >= mask.depth[pixel] - 0.24;
}

function keepAway(points: Screen[], silhouette: Screen[][], gap: number, minLength: number) {
  if (points.length < 2) return [];
  const near = (x: number, y: number) => {
    for (const loop of silhouette) {
      for (let index = 1; index < loop.length; index += 1) {
        if (segmentDistance(x, y, loop[index - 1], loop[index]) < gap) return true;
      }
    }
    return false;
  };
  const runs: Screen[][] = [];
  let current: Screen[] = [];
  const flush = () => {
    if (current.length >= 2 && screenLength(current) >= minLength) runs.push(rdp(current, 1.05));
    current = [];
  };
  for (const point of points) {
    if (near(point[0], point[1])) flush();
    else current.push(point);
  }
  flush();
  return runs;
}

function chainFeatures(positions: Float32Array, edges: Array<{ a: number; b: number; angle: number }>) {
  const adj = new Map<number, Array<{ to: number; edge: number }>>();
  edges.forEach((edge, index) => {
    for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]] as const) {
      const list = adj.get(from) ?? [];
      list.push({ to, edge: index });
      adj.set(from, list);
    }
  });
  const used = new Set<number>();
  const turn = (prev: number, curr: number, next: number) => {
    const ax = positions[curr * 3] - positions[prev * 3];
    const ay = positions[curr * 3 + 1] - positions[prev * 3 + 1];
    const az = positions[curr * 3 + 2] - positions[prev * 3 + 2];
    const bx = positions[next * 3] - positions[curr * 3];
    const by = positions[next * 3 + 1] - positions[curr * 3 + 1];
    const bz = positions[next * 3 + 2] - positions[curr * 3 + 2];
    const denom = (Math.hypot(ax, ay, az) || 1) * (Math.hypot(bx, by, bz) || 1);
    return (Math.acos(Math.min(1, Math.max(-1, (ax * bx + ay * by + az * bz) / denom))) * 180) / Math.PI;
  };
  const paths: Array<{ ids: number[]; angle: number }> = [];
  for (let index = 0; index < edges.length; index += 1) {
    if (used.has(index)) continue;
    used.add(index);
    const ids = [edges[index].a, edges[index].b];
    let angle = edges[index].angle;
    const extend = (start: number, prev: number) => {
      let curr = start;
      let came = prev;
      for (let guard = 0; guard < edges.length; guard += 1) {
        const options = (adj.get(curr) ?? []).filter((item) => !used.has(item.edge));
        if (options.length === 0) break;
        let best = options[0];
        let bestTurn = turn(came, curr, best.to);
        for (const option of options.slice(1)) {
          const value = turn(came, curr, option.to);
          if (value < bestTurn) {
            best = option;
            bestTurn = value;
          }
        }
        if (bestTurn > 100) break;
        used.add(best.edge);
        angle = Math.max(angle, edges[best.edge].angle);
        ids.push(best.to);
        came = curr;
        curr = best.to;
      }
    };
    extend(edges[index].b, edges[index].a);
    ids.reverse();
    extend(edges[index].a, edges[index].b);
    ids.reverse();
    paths.push({ ids, angle });
  }
  return paths;
}

function chainPoints(segs: Array<{ a: Point; b: Point }>) {
  return chainEnds(segs);
}

function chainEnds<T extends { key: string }>(segs: Array<{ a: T; b: T }>) {
  const at = new Map<string, number[]>();
  segs.forEach((seg, index) => {
    for (const key of [seg.a.key, seg.b.key]) {
      const list = at.get(key) ?? [];
      list.push(index);
      at.set(key, list);
    }
  });
  const used = new Set<number>();
  const paths: T[][] = [];
  for (let index = 0; index < segs.length; index += 1) {
    if (used.has(index)) continue;
    used.add(index);
    const trace = (from: T) => {
      const points: T[] = [];
      let current = index;
      let key = from.key;
      for (let guard = 0; guard < segs.length + 2; guard += 1) {
        const seg = segs[current];
        const other = seg.a.key === key ? seg.b : seg.a;
        points.push(other);
        const next = (at.get(other.key) ?? []).find((item) => item !== current && !used.has(item));
        if (next == null) break;
        used.add(next);
        current = next;
        key = other.key;
      }
      return points;
    };
    const forward = trace(segs[index].a);
    const backward = trace(segs[index].b);
    const points = [...backward.reverse(), ...forward];
    if (points.length >= 2) paths.push(points);
  }
  return paths;
}

function strokePath(ctx: CanvasRenderingContext2D, points: Screen[], width: number, alpha: number, close = false) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1]);
  const endsMeet = Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 2.5;
  if (close || endsMeet) ctx.closePath();
  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function smooth(points: Screen[], weight: number): Screen[] {
  if (points.length < 5) return points;
  const next = points.map((point) => [point[0], point[1]] as const);
  const closed = Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 2.5;
  const limit = closed ? points.length - 1 : points.length;
  for (let index = closed ? 0 : 1; index < limit - (closed ? 0 : 1); index += 1) {
    const prev = points[(index - 1 + points.length) % points.length];
    const curr = points[index];
    const following = points[(index + 1) % points.length];
    next[index] = [
      curr[0] + ((prev[0] + following[0]) * 0.5 - curr[0]) * weight,
      curr[1] + ((prev[1] + following[1]) * 0.5 - curr[1]) * weight,
    ];
  }
  if (closed) next[next.length - 1] = next[0];
  return next;
}

function rdp(points: Screen[], epsilon: number): Screen[] {
  if (points.length < 3) return points;
  const closed = Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 1.5;
  const open = closed ? points.slice(0, -1) : points;
  const keep = new Array(open.length).fill(false);
  keep[0] = true;
  keep[open.length - 1] = true;
  const stack: Array<[number, number]> = [[0, open.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let farthest = 0;
    let found = -1;
    const [ax, ay] = open[start];
    const [bx, by] = open[end];
    const abx = bx - ax;
    const aby = by - ay;
    const ab = abx * abx + aby * aby || 1;
    for (let index = start + 1; index < end; index += 1) {
      const t = Math.max(0, Math.min(1, ((open[index][0] - ax) * abx + (open[index][1] - ay) * aby) / ab));
      const dist = Math.hypot(open[index][0] - (ax + abx * t), open[index][1] - (ay + aby * t));
      if (dist > farthest) {
        farthest = dist;
        found = index;
      }
    }
    if (farthest > epsilon && found > start) {
      keep[found] = true;
      stack.push([start, found], [found, end]);
    }
  }
  const simplified = open.filter((_, index) => keep[index]);
  if (closed) simplified.push(simplified[0]);
  return simplified;
}

function screenLength(points: readonly Screen[]) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return length;
}

function worldLength(points: Point[]) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y, points[index].z - points[index - 1].z);
  }
  return length;
}

function segmentDistance(x: number, y: number, a: Screen, b: Screen) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const ab = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (y - a[1]) * aby) / ab));
  return Math.hypot(x - (a[0] + abx * t), y - (a[1] + aby * t));
}

function groundLine(ctx: CanvasRenderingContext2D, width: number, y: number, x0: number, x1: number, accent: string, weight = 1) {
  const pad = Math.max(8, (x1 - x0) * 0.08);
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = weight;
  ctx.beginPath();
  ctx.moveTo(Math.max(8, x0 - pad), y);
  ctx.lineTo(Math.min(width - 8, x1 + pad), y);
  ctx.stroke();
  ctx.restore();
}

function vertexNormals(positions: Float32Array, indices: Uint32Array) {
  const normals = new Float32Array(positions.length);
  for (let face = 0; face < indices.length; face += 3) {
    const normal = faceNormal(positions, indices[face], indices[face + 1], indices[face + 2]);
    for (const index of [indices[face], indices[face + 1], indices[face + 2]]) {
      normals[index * 3] += normal[0];
      normals[index * 3 + 1] += normal[1];
      normals[index * 3 + 2] += normal[2];
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

function faceNormal(positions: Float32Array, ia: number, ib: number, ic: number): Vec3 {
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

function outwardSign(surface: Surface) {
  const { positions, normals } = surface;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const count = positions.length / 3;
  for (let index = 0; index < count; index += 1) {
    cx += positions[index * 3];
    cy += positions[index * 3 + 1];
    cz += positions[index * 3 + 2];
  }
  cx /= count;
  cy /= count;
  cz /= count;
  let score = 0;
  for (let index = 0; index < count; index += 1) {
    score += normals[index * 3] * (positions[index * 3] - cx);
    score += normals[index * 3 + 1] * (positions[index * 3 + 1] - cy);
    score += normals[index * 3 + 2] * (positions[index * 3 + 2] - cz);
  }
  return score >= 0 ? 1 : -1;
}

function dot3(normals: Float32Array, index: number, dir: Vec3) {
  return normals[index * 3] * dir[0] + normals[index * 3 + 1] * dir[1] + normals[index * 3 + 2] * dir[2];
}
