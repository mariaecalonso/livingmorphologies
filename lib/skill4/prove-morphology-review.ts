import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { adaptModule } from "./adapt";
import { runAssemblyShrinkwrap } from "./assembly-shrinkwrap";
import { evaluateClusterMorphology } from "./cluster-morphology";
import { connectClusterHybrid } from "./cluster-hybrids";
import { placeTileMesh } from "./cluster-void";
import { generateSizedCluster, MAX_CLUSTER_TILES } from "./program-cluster";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { resolveTileModule } from "./tiles";

const ROOT = path.join(process.cwd(), "data", "skill4", "morphology-review");
const TARGET = 10;
const ATTEMPT_LIMIT = 16;

type Row = {
  iteration: number;
  seed: number;
  tiles: number;
  size: string;
  planSpread: number;
  path: string;
  meaningfulBranches: number;
  enclosureDirections: number;
  verticalLevels: number;
  score: number | null;
  pass: boolean;
  flags: string[];
  reasons: string[];
  thumb: string;
};

function line(programId: string, row: Row) {
  return [
    programId,
    `iteration ${String(row.iteration).padStart(2, "0")}`,
    `tiles ${row.tiles}`,
    row.size,
    `planSpread ${row.planSpread}`,
    `path ${row.path}`,
    `meaningful ${row.meaningfulBranches}`,
    `enclosure ${row.enclosureDirections}`,
    `levels ${row.verticalLevels}`,
    `score ${row.score ?? "—"}`,
    row.pass ? "PASS" : "FAIL",
    row.flags.join(", "),
  ].join(" | ");
}

function drawThumb(mesh: { positions: ArrayLike<number>; indices: ArrayLike<number> }, file: string) {
  const width = 640;
  const height = 280;
  const rgba = Buffer.alloc(width * height * 4);
  const depth = new Float32Array(width * height);
  depth.fill(1e9);
  const position = mesh.positions;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < position.length; index += 3) {
    minX = Math.min(minX, position[index] ?? 0);
    minY = Math.min(minY, position[index + 1] ?? 0);
    minZ = Math.min(minZ, position[index + 2] ?? 0);
    maxX = Math.max(maxX, position[index] ?? 0);
    maxY = Math.max(maxY, position[index + 1] ?? 0);
    maxZ = Math.max(maxZ, position[index + 2] ?? 0);
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  const fit = (value: number, min: number, size: number) => (value - min) / span * size;
  const projectPlan = (x: number, y: number, z: number): [number, number, number] => [
    24 + fit(x, minX, 250),
    250 - fit(z, minZ, 220),
    -(y),
  ];
  const projectView = (x: number, y: number, z: number): [number, number, number] => [
    360 + fit(x, minX, 200) + fit(z, minZ, 70),
    230 - fit(y, minY, 160) + fit(z, minZ, 40),
    x * 0.2 + z * 0.2 - y,
  ];
  const paint = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, rgb: [number, number, number]) => {
    const minSX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxSX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minSY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxSY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 0.05) return;
    for (let y = minSY; y <= maxSY; y += 1) {
      for (let x = minSX; x <= maxSX; x += 1) {
        const w0 = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / area;
        const w1 = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const far = w0 * az + w1 * bz + w2 * cz;
        const pixel = y * width + x;
        if (far >= depth[pixel]) continue;
        depth[pixel] = far;
        const offset = pixel * 4;
        rgba[offset] = rgb[0];
        rgba[offset + 1] = rgb[1];
        rgba[offset + 2] = rgb[2];
        rgba[offset + 3] = 255;
      }
    }
  };
  const splat = (sx: number, sy: number, rgb: [number, number, number]) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = Math.round(sx + dx);
        const y = Math.round(sy + dy);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const offset = (y * width + x) * 4;
        rgba[offset] = rgb[0];
        rgba[offset + 1] = rgb[1];
        rgba[offset + 2] = rgb[2];
        rgba[offset + 3] = 255;
      }
    }
  };
  const vertexStep = Math.max(1, Math.floor(position.length / 3 / 12000));
  for (let index = 0; index < position.length; index += 3 * vertexStep) {
    const x = position[index] ?? 0;
    const y = position[index + 1] ?? 0;
    const z = position[index + 2] ?? 0;
    const heightMix = (y - minY) / Math.max(1, maxY - minY);
    const plan: [number, number, number] = [
      Math.round(73 + heightMix * 126),
      Math.round(215 - heightMix * 80),
      Math.round(222 - heightMix * 40),
    ];
    const view: [number, number, number] = [Math.round(90 + heightMix * 40), Math.round(230 - heightMix * 30), Math.round(230 - heightMix * 20)];
    const p = projectPlan(x, y, z);
    const v = projectView(x, y, z);
    splat(p[0], p[1], plan);
    splat(v[0], v[1], view);
  }
  const indices = mesh.indices;
  const step = Math.max(1, Math.floor(indices.length / 3 / 12000));
  for (let triangle = 0; triangle < indices.length; triangle += 3 * step) {
    const ia = (indices[triangle] ?? 0) * 3;
    const ib = (indices[triangle + 1] ?? 0) * 3;
    const ic = (indices[triangle + 2] ?? 0) * 3;
    const ax = position[ia] ?? 0;
    const ay = position[ia + 1] ?? 0;
    const az = position[ia + 2] ?? 0;
    const bx = position[ib] ?? 0;
    const by = position[ib + 1] ?? 0;
    const bz = position[ib + 2] ?? 0;
    const cx = position[ic] ?? 0;
    const cy = position[ic + 1] ?? 0;
    const cz = position[ic + 2] ?? 0;
    const heightMix = (((ay + by + cy) / 3) - minY) / Math.max(1, maxY - minY);
    const plan: [number, number, number] = [
      Math.round(73 + heightMix * 126),
      Math.round(215 - heightMix * 80),
      Math.round(222 - heightMix * 40),
    ];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1;
    const light = Math.max(0.35, (nx / nl) * 0.35 + (ny / nl) * 0.75 + (nz / nl) * 0.2);
    const view: [number, number, number] = [Math.round(73 * light), Math.round(215 * light), Math.round(222 * light)];
    const p0 = projectPlan(ax, ay, az);
    const p1 = projectPlan(bx, by, bz);
    const p2 = projectPlan(cx, cy, cz);
    paint(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], plan);
    const v0 = projectView(ax, ay, az);
    const v1 = projectView(bx, by, bz);
    const v2 = projectView(cx, cy, cz);
    paint(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2], view);
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(file);
}

async function prove(programId: string, loaded: Map<string, ReturnType<typeof adaptModule>>) {
  const rows: Row[] = [];
  let attempt = 0;
  while (rows.length < TARGET && attempt < ATTEMPT_LIMIT) {
    const seed = attempt;
    const size = 4 + (attempt % (MAX_CLUSTER_TILES - 4 + 1));
    attempt += 1;
    const cluster = generateSizedCluster(programId, size, seed, true);
    if (!cluster) continue;
    let connections = cluster.connections.slice();
    let hybrids = true;
    for (const connection of connections) {
      try {
        const next = connectClusterHybrid(connection, cluster.tiles, loaded);
        connections = connections.map((item) => item.id === next.id ? next : item);
        if ((next.validatedHybrid?.triangles ?? 0) < 1) hybrids = false;
      } catch {
        hybrids = false;
      }
      if (!hybrids) break;
    }
    if (!hybrids) {
      console.log(`${programId} | seed ${seed} | hybrid did not seat`);
      continue;
    }
    const solids = [
      ...cluster.tiles.flatMap((tile) => {
        const geometry = resolveTileModule(tile.archetypeId, loaded).geometry;
        return geometry ? [placeTileMesh(tile, geometry)] : [];
      }),
      ...connections.flatMap((connection) => connection.validatedHybrid ? [connection.validatedHybrid] : []),
    ];
    const worlds = solids.map((mesh) => ({ positions: mesh.positions, indices: mesh.indices }));
    const film = runAssemblyShrinkwrap(worlds);
    if (!film) {
      console.log(`${programId} | seed ${seed} | shrinkwrap was not adopted`);
      continue;
    }
    const report = evaluateClusterMorphology(cluster.tiles, connections, programId, solids);
    const iteration = rows.length + 1;
    const thumb = `thumbs/${programId}-${String(iteration).padStart(2, "0")}.png`;
    await drawThumb(film.mesh, path.join(ROOT, thumb));
    const row: Row = {
      iteration,
      seed,
      tiles: cluster.tiles.length,
      size: `${report.width}' × ${report.depth}' × ${report.height}'`,
      planSpread: report.planSpread,
      path: `${report.longestPath}/${cluster.tiles.length}`,
      meaningfulBranches: report.meaningfulBranches,
      enclosureDirections: report.enclosureDirections,
      verticalLevels: report.verticalLevels,
      score: report.flags.length === 0 ? report.score : null,
      pass: report.pass,
      flags: report.flags,
      reasons: report.reasons,
      thumb,
    };
    rows.push(row);
    console.log(line(programId, row));
  }
  const body = { programId, requested: TARGET, shown: rows.length, rows };
  writeFileSync(path.join(ROOT, `${programId}.json`), JSON.stringify(body));
  publish();
  console.log(`${programId} shown ${rows.length}`);
  return body;
}

function publish() {
  const files = readdirSync(ROOT).filter((name) => name.endsWith(".json"));
  const boards = files.map((name) => JSON.parse(readFileSync(path.join(ROOT, name), "utf8")) as { programId: string; rows: Row[] });
  const cards = boards.flatMap((board) => board.rows.map((row) => ({ programId: board.programId, ...row })));
  const figures = cards.map((card) => {
    const mark = card.pass ? "PASS" : "FAIL";
    const reason = card.flags[0] ?? "";
    return `<figure><img src="${card.thumb}" alt="${card.programId} ${card.iteration}"><figcaption><b>${String(card.iteration).padStart(2, "0")} · ${mark}</b> ${card.size}<br>${card.programId}<br>${reason}</figcaption></figure>`;
  }).join("");
  const table = cards.map((card) => `<tr><td>${card.programId}</td><td>${String(card.iteration).padStart(2, "0")}</td><td>${card.tiles}</td><td>${card.size}</td><td>${card.planSpread}</td><td>${card.path}</td><td>${card.meaningfulBranches}</td><td>${card.enclosureDirections}</td><td>${card.verticalLevels}</td><td>${card.score ?? "—"}</td><td>${card.pass ? "PASS" : "FAIL"}</td><td>${card.flags.join(", ")}</td></tr>`).join("");
  writeFileSync(path.join(ROOT, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>Morphology review</title><style>
    body{margin:0;background:#000;color:#fff;font:12px/1.4 sans-serif}
    table{border-collapse:collapse;margin:24px;width:calc(100% - 48px)}
    td{border-bottom:1px solid #222;padding:6px 8px;text-align:left}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px;padding:24px}
    figure{margin:0}
    img{width:100%;background:#000;border:1px solid #222}
    figcaption{margin-top:8px;letter-spacing:.04em;text-transform:uppercase}
    b{color:#49d7de;font-weight:500}
  </style></head><body><table>${table}</table><div class="grid">${figures}</div></body></html>`);
}

async function main() {
  const requested = process.argv.slice(2);
  const programs = requested.length > 0 ? requested : ["public-lobby", "interdisciplinary-collaboration-hub"];
  mkdirSync(path.join(ROOT, "thumbs"), { recursive: true });
  const records = loadSkill3HandoffRecords();
  const loaded = new Map(records.map((record) => [record.archetypeId, adaptModule(record)] as const));
  for (const programId of programs) await prove(programId, loaded);
}

void main();
