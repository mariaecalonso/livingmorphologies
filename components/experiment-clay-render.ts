import type { IsoMesh } from "@/lib/scan/isomesh";
import { moduleCorners, projectModule } from "@/lib/skill3/view-project";

/**
 * Display-only clay render for the experiment comparison.
 * Smoothing copies the mesh. It does not rebuild the morphology.
 */

const BOX_EDGES = [
  [0, 1], [0, 2], [0, 4],
  [3, 1], [3, 2], [3, 7],
  [5, 1], [5, 4], [5, 7],
  [6, 2], [6, 4], [6, 7],
];

const smoothCache = new WeakMap<IsoMesh, IsoMesh>();

function addNeighbor(lists: number[][], a: number, b: number) {
  const list = lists[a];
  for (let i = 0; i < list.length; i += 1) if (list[i] === b) return;
  list.push(b);
}

/** Two Taubin pairs. Steps are capped by the local edge length so thin walls stay. */
export function lightSmoothMesh(mesh: IsoMesh): IsoMesh {
  const cached = smoothCache.get(mesh);
  if (cached) return cached;
  const count = mesh.positions.length / 3;
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  const { indices } = mesh;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    addNeighbor(neighbors, a, b);
    addNeighbor(neighbors, b, a);
    addNeighbor(neighbors, b, c);
    addNeighbor(neighbors, c, b);
    addNeighbor(neighbors, c, a);
    addNeighbor(neighbors, a, c);
  }
  const meanEdge = new Float32Array(count);
  const source = mesh.positions;
  for (let vertex = 0; vertex < count; vertex += 1) {
    const list = neighbors[vertex];
    if (!list.length) continue;
    let sum = 0;
    const x = source[vertex * 3];
    const y = source[vertex * 3 + 1];
    const z = source[vertex * 3 + 2];
    for (const other of list) {
      const ox = source[other * 3] - x;
      const oy = source[other * 3 + 1] - y;
      const oz = source[other * 3 + 2] - z;
      sum += Math.hypot(ox, oy, oz);
    }
    meanEdge[vertex] = sum / list.length;
  }
  let positions = new Float32Array(source);
  const lambdas = [0.5, -0.53, 0.5, -0.53, 0.5, -0.53, 0.5, -0.53];
  for (const lambda of lambdas) {
    const next = new Float32Array(positions.length);
    for (let vertex = 0; vertex < count; vertex += 1) {
      const list = neighbors[vertex];
      const x = positions[vertex * 3];
      const y = positions[vertex * 3 + 1];
      const z = positions[vertex * 3 + 2];
      if (!list.length) {
        next[vertex * 3] = x;
        next[vertex * 3 + 1] = y;
        next[vertex * 3 + 2] = z;
        continue;
      }
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const other of list) {
        cx += positions[other * 3];
        cy += positions[other * 3 + 1];
        cz += positions[other * 3 + 2];
      }
      const inv = 1 / list.length;
      let dx = (cx * inv - x) * lambda;
      let dy = (cy * inv - y) * lambda;
      let dz = (cz * inv - z) * lambda;
      const cap = meanEdge[vertex] * 0.6;
      const length = Math.hypot(dx, dy, dz);
      if (length > cap && length > 0) {
        const scale = cap / length;
        dx *= scale;
        dy *= scale;
        dz *= scale;
      }
      next[vertex * 3] = x + dx;
      next[vertex * 3 + 1] = y + dy;
      next[vertex * 3 + 2] = z + dz;
    }
    positions = next;
  }
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  for (let vertex = 0; vertex < count; vertex += 1) {
    const length = Math.hypot(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]) || 1;
    normals[vertex * 3] /= length;
    normals[vertex * 3 + 1] /= length;
    normals[vertex * 3 + 2] /= length;
  }
  const smoothed: IsoMesh = { positions, normals, indices: mesh.indices, triangles: mesh.triangles };
  smoothCache.set(mesh, smoothed);
  return smoothed;
}

function rotateNormal(nx: number, ny: number, nz: number, yaw: number, pitch: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const nx1 = nx * cy + nz * sy;
  const nz1 = -nx * sy + nz * cy;
  const ny2 = ny * cp - nz1 * sp;
  const nz2 = ny * sp + nz1 * cp;
  const length = Math.hypot(nx1, ny2, nz2) || 1;
  let x = nx1 / length;
  let y = ny2 / length;
  let z = nz2 / length;
  if (z > 0) {
    x = -x;
    y = -y;
    z = -z;
  }
  return { x, y, z };
}

function clayTone(nx: number, ny: number, nz: number) {
  const key = Math.max(0, nx * 0.22 + ny * 0.9 + nz * -0.28);
  const fill = Math.max(0, nx * -0.55 + ny * 0.2 + nz * -0.4);
  const fresnel = (1 - Math.max(0, -nz)) ** 1.8;
  return Math.max(0, Math.min(1, 0.56 + key * 0.36 + fill * 0.1 + fresnel * 0.04));
}

type ScreenVert = { x: number; y: number; depth: number; nx: number; ny: number; nz: number };

function rasterTriangle(
  target: Float32Array | Uint8ClampedArray,
  depth: Float32Array | null,
  width: number,
  height: number,
  a: ScreenVert,
  b: ScreenVert,
  c: ScreenVert,
  shade: boolean,
) {
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(area) < 0.4) return;
  const invArea = 1 / area;
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      let w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) * invArea;
      let w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) * invArea;
      let w2 = 1 - w0 - w1;
      if (w0 < -0.002 || w1 < -0.002 || w2 < -0.002) continue;
      w0 = Math.max(0, w0);
      w1 = Math.max(0, w1);
      w2 = Math.max(0, w2);
      const sum = w0 + w1 + w2 || 1;
      w0 /= sum;
      w1 /= sum;
      w2 /= sum;
      const invDepth = w0 / a.depth + w1 / b.depth + w2 / c.depth;
      const pixelDepth = 1 / invDepth;
      const index = y * width + x;
      if (depth) {
        if (pixelDepth >= depth[index]) continue;
        depth[index] = pixelDepth;
        const nx = (w0 * a.nx / a.depth + w1 * b.nx / b.depth + w2 * c.nx / c.depth) / invDepth;
        const ny = (w0 * a.ny / a.depth + w1 * b.ny / b.depth + w2 * c.ny / c.depth) / invDepth;
        const nz = (w0 * a.nz / a.depth + w1 * b.nz / b.depth + w2 * c.nz / c.depth) / invDepth;
        const length = Math.hypot(nx, ny, nz) || 1;
        const tone = clayTone(nx / length, ny / length, nz / length);
        const offset = index * 4;
        (target as Uint8ClampedArray)[offset] = tone * 214;
        (target as Uint8ClampedArray)[offset + 1] = tone * 210;
        (target as Uint8ClampedArray)[offset + 2] = tone * 204;
        (target as Uint8ClampedArray)[offset + 3] = 255;
      } else if (shade) {
        target[index] = 1;
      }
    }
  }
}

function applyOcclusion(color: Uint8ClampedArray, depth: Float32Array, width: number, height: number) {
  const taps = [
    [5, 0], [-5, 0], [0, 5], [0, -5],
    [4, 4], [-4, 4], [4, -4], [-4, -4],
    [9, 2], [-9, 2], [2, 9], [-2, 9],
  ];
  const darkened = new Uint8ClampedArray(color);
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const index = y * width + x;
      const here = depth[index];
      if (here > 1e8) continue;
      let occlusion = 0;
      for (const [dx, dy] of taps) {
        const neighbor = depth[(y + dy) * width + (x + dx)];
        if (neighbor > 1e8) continue;
        const closer = here - neighbor;
        if (closer > 0.22) occlusion += Math.min(1, (closer - 0.22) / 0.85);
      }
      occlusion /= taps.length;
      const shade = 1 - occlusion * 0.38;
      const offset = index * 4;
      darkened[offset] = color[offset] * shade;
      darkened[offset + 1] = color[offset + 1] * shade;
      darkened[offset + 2] = color[offset + 2] * shade;
    }
  }
  color.set(darkened);
}

export function drawClay(
  canvas: HTMLCanvasElement,
  mesh: IsoMesh,
  yaw: number,
  pitch: number,
  showBox: boolean,
) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const width = Math.max(1, Math.floor(parent.clientWidth));
  const height = Math.max(1, Math.floor(parent.clientHeight));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const color = new Uint8ClampedArray(width * height * 4);
  const depth = new Float32Array(width * height);
  depth.fill(1e9);
  for (let index = 0; index < width * height; index += 1) color[index * 4 + 3] = 255;
  const count = mesh.positions.length / 3;
  const screen: ScreenVert[] = new Array(count);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const x = mesh.positions[vertex * 3];
    const y = mesh.positions[vertex * 3 + 1];
    const z = mesh.positions[vertex * 3 + 2];
    const projected = projectModule(x, y, z, yaw, pitch, width, height);
    const normal = rotateNormal(mesh.normals[vertex * 3], mesh.normals[vertex * 3 + 1], mesh.normals[vertex * 3 + 2], yaw, pitch);
    screen[vertex] = { x: projected.x, y: projected.y, depth: Math.max(0.05, projected.depth), nx: normal.x, ny: normal.y, nz: normal.z };
  }
  const { indices } = mesh;
  for (let i = 0; i < indices.length; i += 3) {
    rasterTriangle(color, depth, width, height, screen[indices[i]], screen[indices[i + 1]], screen[indices[i + 2]], false);
  }
  applyOcclusion(color, depth, width, height);
  ctx.putImageData(new ImageData(color, width, height), 0, 0);
  if (!showBox) return;
  const corners = moduleCorners(yaw, pitch, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [a, b] of BOX_EDGES) {
    ctx.moveTo(corners[a].x, corners[a].y);
    ctx.lineTo(corners[b].x, corners[b].y);
  }
  ctx.stroke();
}
