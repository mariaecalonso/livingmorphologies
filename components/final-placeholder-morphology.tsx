"use client";

import { useEffect, useRef } from "react";

/**
 * Temporary exhibition stand-ins for the Collection view.
 * These are not Skill 3 selections and are never written into the morphology store.
 */

type Recipe = {
  sx: number;
  sy: number;
  sz: number;
  radius: number;
  kind: "tower" | "stack" | "hall" | "field" | "beam" | "open" | "terrace" | "knot" | "edge" | "wave" | "bowl" | "void" | "plate" | "room" | "rail";
};

const RECIPES: Record<string, Recipe> = {
  "vertical-void": { sx: 0.42, sy: 1, sz: 0.42, radius: 0.045, kind: "tower" },
  "compressed-sequential": { sx: 0.48, sy: 0.82, sz: 0.4, radius: 0.05, kind: "stack" },
  "continuous-hall": { sx: 1, sy: 0.4, sz: 0.62, radius: 0.048, kind: "hall" },
  "topographic-ground-field": { sx: 1, sy: 0.32, sz: 0.9, radius: 0.042, kind: "field" },
  "linear-gallery": { sx: 1, sy: 0.36, sz: 0.28, radius: 0.04, kind: "beam" },
  "open-hall": { sx: 0.92, sy: 0.52, sz: 0.88, radius: 0.044, kind: "open" },
  terraced: { sx: 0.9, sy: 0.7, sz: 0.55, radius: 0.042, kind: "terrace" },
  "flat-deep-plan": { sx: 0.72, sy: 0.4, sz: 0.72, radius: 0.05, kind: "knot" },
  "void-edge": { sx: 0.78, sy: 0.76, sz: 0.46, radius: 0.042, kind: "edge" },
  undulated: { sx: 1, sy: 0.46, sz: 0.42, radius: 0.04, kind: "wave" },
  "stepped-amphitheater": { sx: 0.98, sy: 0.4, sz: 0.86, radius: 0.04, kind: "bowl" },
  "void-field": { sx: 0.88, sy: 0.58, sz: 0.88, radius: 0.042, kind: "void" },
  "inserted-horizontal-plate": { sx: 1, sy: 0.24, sz: 0.74, radius: 0.036, kind: "plate" },
  "contained-room-within-volume": { sx: 0.62, sy: 0.66, sz: 0.62, radius: 0.048, kind: "room" },
  "linear-edge-gallery": { sx: 1, sy: 0.38, sz: 0.3, radius: 0.038, kind: "rail" },
};

type Mesh = {
  positions: Float32Array;
  normals: Float32Array;
};

const meshCache = new Map<string, Mesh>();

function hash(id: string) {
  let h = 2166136261;
  for (const char of id) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function recipeFor(id: string): Recipe {
  return RECIPES[id] ?? { sx: 0.7, sy: 0.7, sz: 0.7, radius: 0.045, kind: "knot" };
}

type Vec3 = [number, number, number];

function polylinesFor(recipe: Recipe, rand: () => number): Vec3[][] {
  const { sx, sy, sz, kind } = recipe;
  const wobble = (amount: number) => (rand() - 0.5) * amount;
  const ringColumns = (columns: number, levels: number, radius: number, y0 = 0, y1 = sy) => {
    const cols: Vec3[][] = [];
    for (let c = 0; c < columns; c += 1) {
      const angle = (c / columns) * Math.PI * 2 + wobble(0.35);
      const radial = radius * (0.86 + rand() * 0.28);
      const line: Vec3[] = [];
      for (let i = 0; i <= levels; i += 1) {
        const t = i / levels;
        const breathe = 1 + Math.sin(t * Math.PI) * 0.16;
        line.push([
          Math.cos(angle) * radial * breathe * sx + wobble(0.03),
          y0 + (y1 - y0) * t,
          Math.sin(angle) * radial * breathe * sz + wobble(0.03),
        ]);
      }
      cols.push(line);
    }
    const lines = [...cols];
    for (let i = 1; i < levels; i += 2) {
      const ring = cols.map((col) => col[i]);
      ring.push(cols[0][i]);
      lines.push(ring);
    }
    return lines;
  };
  if (kind === "tower") return ringColumns(5, 7, 0.34);
  if (kind === "stack") return ringColumns(4, 6, 0.22);
  if (kind === "edge") {
    return ringColumns(4, 6, 0.28).map((line) => line.map((point) => [point[0] + sx * 0.22, point[1], point[2]] as Vec3));
  }
  if (kind === "void") return ringColumns(6, 4, 0.42, sy * 0.08, sy * 0.92);
  if (kind === "room") {
    const outer = ringColumns(6, 4, 0.46);
    const inner = ringColumns(4, 3, 0.18, sy * 0.2, sy * 0.8);
    return [...outer, ...inner];
  }
  if (kind === "hall" || kind === "open") {
    const lines: Vec3[][] = [];
    const rails = kind === "hall" ? 3 : 4;
    for (let rail = 0; rail < rails; rail += 1) {
      const z = ((rail / Math.max(1, rails - 1)) - 0.5) * sz * 0.8;
      const line: Vec3[] = [];
      for (let i = 0; i <= 7; i += 1) {
        const t = i / 7;
        line.push([
          (t - 0.5) * sx * 2,
          Math.sin(t * Math.PI) * sy * (kind === "hall" ? 0.55 : 0.9) + wobble(0.02),
          z + wobble(0.04),
        ]);
      }
      lines.push(line);
    }
    for (let i = 1; i <= 5; i += 2) {
      lines.push(lines.slice(0, rails).map((line) => line[i]));
    }
    return lines;
  }
  if (kind === "beam" || kind === "rail" || kind === "plate") {
    const lines: Vec3[][] = [];
    const spine: Vec3[] = [];
    const steps = kind === "plate" ? 8 : 9;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      spine.push([(t - 0.5) * sx * 2, sy * (kind === "plate" ? 0.35 : 0.45) + wobble(0.02), wobble(sz * 0.08)]);
    }
    lines.push(spine);
    for (let i = 1; i < steps; i += kind === "plate" ? 1 : 2) {
      const origin = spine[i];
      const reach = kind === "rail" ? 0.22 : kind === "plate" ? 0.7 : 0.34;
      lines.push([
        origin,
        [origin[0], origin[1] + wobble(0.04), origin[2] + sz * reach],
        [origin[0] + wobble(0.05), origin[1], origin[2] - sz * reach * 0.6],
      ]);
    }
    if (kind === "plate") {
      lines.push(spine.map((point) => [point[0], point[1] + sy * 0.35, point[2] + sz * 0.28]));
    }
    return lines;
  }
  if (kind === "field") {
    const lines: Vec3[][] = [];
    const bands: Vec3[][] = [];
    for (let rail = 0; rail < 4; rail += 1) {
      const line: Vec3[] = [];
      for (let i = 0; i <= 6; i += 1) {
        const t = i / 6;
        line.push([
          (t - 0.5) * sx * 1.8,
          sy * (0.3 + Math.sin(t * Math.PI * 2 + rail * 0.8) * 0.45),
          (rail - 1.5) * sz * 0.22,
        ]);
      }
      bands.push(line);
      lines.push(line);
    }
    for (let i = 1; i <= 5; i += 2) lines.push(bands.map((line) => line[i]));
    return lines;
  }
  if (kind === "terrace") {
    const lines: Vec3[][] = [];
    for (let level = 0; level < 4; level += 1) {
      const y = (level / 3) * sy;
      const inset = level * 0.08;
      const line: Vec3[] = [];
      for (let i = 0; i <= 6; i += 1) {
        const t = i / 6;
        line.push([(t - 0.5) * sx * (1.7 - inset), y, ((level % 2) - 0.5) * sz * 0.35]);
      }
      lines.push(line);
      if (level < 3) {
        lines.push([
          line[1],
          [line[1][0], ((level + 1) / 3) * sy, line[1][2]],
          line[4],
        ]);
      }
    }
    return lines;
  }
  if (kind === "wave") {
    const lines: Vec3[][] = [];
    for (let rail = 0; rail < 3; rail += 1) {
      const line: Vec3[] = [];
      for (let i = 0; i <= 8; i += 1) {
        const t = i / 8;
        line.push([
          (t - 0.5) * sx * 2,
          sy * (0.35 + Math.sin(t * Math.PI * 2 + rail) * 0.45),
          (rail - 1) * sz * 0.28,
        ]);
      }
      lines.push(line);
    }
    lines.push([lines[0][2], lines[1][2], lines[2][2]]);
    lines.push([lines[0][6], lines[1][6], lines[2][6]]);
    return lines;
  }
  if (kind === "bowl") {
    const lines: Vec3[][] = [];
    for (let ring = 0; ring < 3; ring += 1) {
      const radius = 0.28 + ring * 0.22;
      const y = sy * (0.2 + ring * 0.28);
      const line: Vec3[] = [];
      const steps = 10;
      for (let i = 0; i <= steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        line.push([Math.cos(angle) * radius * sx, y, Math.sin(angle) * radius * sz * 0.8]);
      }
      lines.push(line);
    }
    for (let spoke = 0; spoke < 4; spoke += 1) {
      const index = spoke * 2 + 1;
      lines.push([lines[0][index], lines[1][index], lines[2][index]]);
    }
    return lines;
  }
  const knot: Vec3[][] = [];
  for (let n = 0; n < 8; n += 1) {
    const line: Vec3[] = [];
    for (let i = 0; i < 3; i += 1) {
      line.push([
        (rand() - 0.5) * sx * 1.4,
        rand() * sy,
        (rand() - 0.5) * sz * 1.4,
      ]);
    }
    knot.push(line);
  }
  return knot;
}

function soften(path: Vec3[]): Vec3[] {
  if (path.length < 2) return path;
  const curved: Vec3[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const steps = 3;
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const wave = Math.sin((i + t) * 2.2) * 0.028;
      curved.push([
        a[0] + (b[0] - a[0]) * t + wave,
        a[1] + (b[1] - a[1]) * t + wave * 0.45,
        a[2] + (b[2] - a[2]) * t - wave * 0.35,
      ]);
    }
  }
  curved.push(path[path.length - 1]);
  return curved;
}

function buildMesh(id: string): Mesh {
  const cached = meshCache.get(id);
  if (cached) return cached;
  const recipe = recipeFor(id);
  const rand = mulberry32(hash(id));
  const paths = polylinesFor(recipe, rand).map((path) => soften(path));
  const points: Vec3[] = [];
  const edges: Array<[number, number]> = [];
  for (const path of paths) {
    let previous = -1;
    for (const point of path) {
      const index = points.length;
      points.push(point);
      if (previous >= 0) edges.push([previous, index]);
      previous = index;
    }
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nxv = uy * vz - uz * vy;
    let nyv = uz * vx - ux * vz;
    let nzv = ux * vy - uy * vx;
    const length = Math.hypot(nxv, nyv, nzv) || 1;
    nxv /= length;
    nyv /= length;
    nzv /= length;
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    normals.push(nxv, nyv, nzv, nxv, nyv, nzv, nxv, nyv, nzv);
  };
  const sides = 7;
  for (const [ia, ib] of edges) {
    const a = points[ia];
    const b = points[ib];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz) || 1;
    const dir: [number, number, number] = [dx / length, dy / length, dz / length];
    const helper: [number, number, number] = Math.abs(dir[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0];
    let sx = dir[1] * helper[2] - dir[2] * helper[1];
    let sy = dir[2] * helper[0] - dir[0] * helper[2];
    let sz = dir[0] * helper[1] - dir[1] * helper[0];
    const sideLength = Math.hypot(sx, sy, sz) || 1;
    sx /= sideLength;
    sy /= sideLength;
    sz /= sideLength;
    const ux = dir[1] * sz - dir[2] * sy;
    const uy = dir[2] * sx - dir[0] * sz;
    const uz = dir[0] * sy - dir[1] * sx;
    const bulge = 0.82 + rand() * 0.36;
    const ring = (t: number) => {
      const px = a[0] + dx * t;
      const py = a[1] + dy * t;
      const pz = a[2] + dz * t;
        const radius = recipe.radius * 1.75 * (t > 0.08 && t < 0.92 ? bulge : 0.88);
      const circle: Array<[number, number, number]> = [];
      for (let s = 0; s < sides; s += 1) {
        const angle = (s / sides) * Math.PI * 2;
        const c = Math.cos(angle);
        const sn = Math.sin(angle);
        circle.push([
          px + (sx * c + ux * sn) * radius,
          py + (sy * c + uy * sn) * radius,
          pz + (sz * c + uz * sn) * radius,
        ]);
      }
      return circle;
    };
    const rings = [ring(0), ring(0.5), ring(1)];
    for (let r = 0; r < rings.length - 1; r += 1) {
      const left = rings[r];
      const right = rings[r + 1];
      for (let s = 0; s < sides; s += 1) {
        const n = (s + 1) % sides;
        pushTri(left[s], right[s], right[n]);
        pushTri(left[s], right[n], left[n]);
      }
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) / span;
    positions[i + 1] = (positions[i + 1] - minY) / span;
    positions[i + 2] = (positions[i + 2] - cz) / span;
  }
  const mesh = { positions: Float32Array.from(positions), normals: Float32Array.from(normals) };
  meshCache.set(id, mesh);
  return mesh;
}

function drawPlaceholder(canvas: HTMLCanvasElement, mesh: Mesh) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(parent.clientWidth));
  const height = Math.max(1, Math.floor(parent.clientHeight));
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
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const { positions } = mesh;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
  }
  const worldW = Math.max(0.001, maxX - minX);
  const worldH = Math.max(0.001, maxY - minY);
  const scale = Math.min((width * 0.78) / worldW, (height * 0.9) / worldH);
  const yaw = 0.62;
  const pitch = 0.42;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const project = (x: number, y: number, z: number) => {
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const y2 = y * cosP - z1 * sinP;
    const z2 = y * sinP + z1 * cosP;
    return { x: x1, y: y2, z: z2 };
  };
  const originX = width * 0.5 - ((minX + maxX) / 2) * scale;
  const originY = height * 0.94 - minY * scale;
  type Face = { depth: number; points: Array<[number, number]>; shade: number };
  const faces: Face[] = [];
  for (let i = 0; i < positions.length; i += 9) {
    const n = mesh.normals;
    const ax = positions[i];
    const ay = positions[i + 1];
    const az = positions[i + 2];
    const bx = positions[i + 3];
    const by = positions[i + 4];
    const bz = positions[i + 5];
    const cx = positions[i + 6];
    const cy = positions[i + 7];
    const cz = positions[i + 8];
    const pa = project(ax, ay, az);
    const pb = project(bx, by, bz);
    const pc = project(cx, cy, cz);
    const nx = n[i];
    const ny = n[i + 1];
    const nz = n[i + 2];
    const pn = project(nx, ny, nz);
    const facing = pn.z - project(0, 0, 0).z;
    const light = Math.max(0, nx * 0.25 + ny * 0.82 + nz * 0.28);
    const wrap = (light + 0.45) / 1.45;
    const shade = Math.min(1, 0.38 + wrap * 0.62 + Math.max(0, facing) * 0.08);
    faces.push({
      depth: (pa.z + pb.z + pc.z) / 3,
      shade,
      points: [
        [originX + pa.x * scale, originY - pa.y * scale],
        [originX + pb.x * scale, originY - pb.y * scale],
        [originX + pc.x * scale, originY - pc.y * scale],
      ],
    });
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const face of faces) {
    const lit = Math.round(Math.min(1, 0.62 + face.shade * 0.38) * 255);
    ctx.beginPath();
    ctx.moveTo(face.points[0][0], face.points[0][1]);
    ctx.lineTo(face.points[1][0], face.points[1][1]);
    ctx.lineTo(face.points[2][0], face.points[2][1]);
    ctx.closePath();
    ctx.fillStyle = `rgba(${lit}, ${lit}, ${lit}, 0.92)`;
    ctx.fill();
  }
}

export function PlaceholderMorphology({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const mesh = buildMesh(id);
    const paint = () => drawPlaceholder(canvas, mesh);
    paint();
    const parent = canvas.parentElement;
    const observer = parent ? new ResizeObserver(paint) : null;
    if (parent && observer) observer.observe(parent);
    return () => observer?.disconnect();
  }, [id]);
  return (
    <span className="final-placeholder">
      <canvas ref={ref} aria-label="Temporary morphology placeholder" />
    </span>
  );
}
