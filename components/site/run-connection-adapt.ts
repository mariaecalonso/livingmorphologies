/**
 * Repair 03 prototype. Reads stored meshes and writes a report under
 * data/skill5/autonomous-test/repair-03. Does not modify the tile library,
 * Skill 04, or the live assembly.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeSolidifiedMesh } from "../../lib/skill3/solidified-mesh";
import { readSolidifiedMesh } from "../../lib/skill3/solidified-catalogue";
import { SITE_ARCHETYPES } from "../../lib/skill5/catalog";
import { proposeDirectJoin } from "../../lib/skill5/direct-join";
import { faceBook, type FaceId } from "../../lib/skill5/face-match";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT, type PlacedModule } from "../../lib/skill5/placement";

const CELL = 0.5;
const MIN = -12;
const N = Math.round(34 / CELL);
const MAX_CUT_FT = 2;
const MIN_CLEAR_WIDTH = 3;
const MIN_CLEAR_HEIGHT = 6.5;

type Grid = { shell: Uint8Array; solid: Uint8Array };

function load(id: string) {
  const item = SITE_ARCHETYPES.find((entry) => entry.archetypeId === id);
  if (!item) throw new Error(id);
  const stored = readSolidifiedMesh(item.archetypeId, item.candidateId, item.continuationId);
  if (!stored) throw new Error(`missing ${id}`);
  const mesh = decodeSolidifiedMesh(stored.geometry);
  return { item, positions: mesh.positions, indices: mesh.indices };
}

function at(ix: number, iy: number, iz: number) {
  return (iz * N + iy) * N + ix;
}

function cellOf(x: number, y: number, z: number) {
  return [Math.floor((x - MIN) / CELL), Math.floor((y - MIN) / CELL), Math.floor((z - MIN) / CELL)] as const;
}

function gridOf(positions: Float32Array, indices: Uint32Array): Grid {
  let minUp = Infinity;
  for (let index = 2; index < positions.length; index += 3) minUp = Math.min(minUp, positions[index]);
  const shell = new Uint8Array(N * N * N);
  const mark = (x: number, y: number, z: number) => {
    const [ix, iy, iz] = cellOf(x, y, z);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= N || iy >= N || iz >= N) return;
    shell[at(ix, iy, iz)] = 1;
  };
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const vertex = (index: number) => {
      const base = indices[index] * 3;
      return [positions[base], positions[base + 2] - minUp, positions[base + 1]] as const;
    };
    const a = vertex(triangle);
    const b = vertex(triangle + 1);
    const c = vertex(triangle + 2);
    const span = Math.max(
      Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
      Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]),
    );
    const steps = Math.max(2, Math.ceil(span / 0.25));
    for (let i = 0; i <= steps; i += 1) {
      for (let j = 0; j <= steps - i; j += 1) {
        const u = i / steps;
        const w = j / steps;
        const s = 1 - u - w;
        mark(a[0] * s + b[0] * u + c[0] * w, a[1] * s + b[1] * u + c[1] * w, a[2] * s + b[2] * u + c[2] * w);
      }
    }
  }
  const seen = new Uint8Array(shell.length);
  const stack: number[] = [];
  for (let index = 0; index < shell.length; index += 1) {
    const ix = index % N;
    const iy = Math.floor(index / N) % N;
    const iz = Math.floor(index / (N * N));
    const x = MIN + (ix + 0.5) * CELL;
    const y = MIN + (iy + 0.5) * CELL;
    const z = MIN + (iz + 0.5) * CELL;
    if (Math.abs(x) <= 11 && y >= -1 && y <= 21 && Math.abs(z) <= 11) continue;
    if (shell[index] || seen[index]) continue;
    seen[index] = 1;
    stack.push(index);
  }
  while (stack.length) {
    const current = stack.pop()!;
    const ix = current % N;
    const iy = Math.floor(current / N) % N;
    const iz = Math.floor(current / (N * N));
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const nx = ix + dx;
      const ny = iy + dy;
      const nz = iz + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= N || ny >= N || nz >= N) continue;
      const next = at(nx, ny, nz);
      if (shell[next] || seen[next]) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }
  const solid = new Uint8Array(shell.length);
  for (let index = 0; index < shell.length; index += 1) {
    if (!shell[index] && !seen[index]) solid[index] = 1;
  }
  return { shell, solid };
}

function tile(id: string, archetypeId: string, x: number, y: number, z: number, rotationY: number): PlacedModule {
  const item = SITE_ARCHETYPES.find((entry) => entry.archetypeId === archetypeId)!;
  return {
    instanceId: id,
    kind: "archetype",
    name: item.name,
    status: item.status,
    geometryState: "available",
    program: item.program ?? "unassigned",
    programSource: "suggested",
    provenance: { moduleId: item.moduleId, archetypeId, source: "skill3", candidateId: item.candidateId, continuationId: item.continuationId },
    transform: { position: { x, y, z }, rotationY },
  };
}

function openingCells(positions: Float32Array, face: FaceId) {
  return faceBook(positions)[face].samples.filter((sample) => sample.opening);
}

function inwardAir(grid: Grid, x: number, y: number, z: number, dir: readonly [number, number, number]) {
  let air = 0;
  for (let step = 1; step <= 40; step += 1) {
    const [ix, iy, iz] = cellOf(x + dir[0] * step * CELL, y + dir[1] * step * CELL, z + dir[2] * step * CELL);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= N || iy >= N || iz >= N) break;
    const index = at(ix, iy, iz);
    if (grid.shell[index] || grid.solid[index]) break;
    air += 1;
  }
  return air * CELL;
}

const voidTile = load("void-field");
const terrace = load("terraced");
const gallery = load("linear-gallery");
const voidSource = Array.from(voidTile.positions);
const terraceSource = Array.from(terrace.positions);
const gallerySource = Array.from(gallery.positions);
const voidGrid = gridOf(voidTile.positions, voidTile.indices);
const terraceGrid = gridOf(terrace.positions, terrace.indices);
const galleryGrid = gridOf(gallery.positions, gallery.indices);

const voidWest = openingCells(voidTile.positions, "W");
const westDepth = voidWest.map((sample) => inwardAir(voidGrid, sample.x, sample.y, sample.z, [1, 0, 0]));
const terraceSouth = openingCells(terrace.positions, "S");
const galleryNorth = openingCells(gallery.positions, "N");

function span(values: number[]) {
  return { min: Math.min(...values), max: Math.max(...values) };
}

const westSpan = {
  up: span(voidWest.map((sample) => sample.y)),
  north: span(voidWest.map((sample) => sample.z)),
  depthFt: { min: Math.min(...westDepth), max: Math.max(...westDepth) },
  cells: voidWest.length,
};

let roofOverVoid = Infinity;
for (const sample of voidWest) {
  if (inwardAir(voidGrid, sample.x, sample.y, sample.z, [1, 0, 0]) < 3) continue;
  for (let step = 1; step <= 40; step += 1) {
    const y = sample.y + step * CELL;
    const [ix, iy, iz] = cellOf(sample.x + 2, y, sample.z);
    if (iy >= N) break;
    const index = at(ix, iy, iz);
    if (voidGrid.shell[index] || voidGrid.solid[index]) {
      roofOverVoid = Math.min(roofOverVoid, 20 - y);
      break;
    }
  }
}

const host = tile("gallery", "linear-gallery", 0, MODULE_GROUND_Y, 0, 270 * Math.PI / 180);
const guest = tile("terrace", "terraced", MODULE_HEIGHT_FT, MODULE_GROUND_Y, 0, 270 * Math.PI / 180);
const direct = proposeDirectJoin(host, guest, gallery.positions, terrace.positions);

function faceGap() {
  const galleryUp = galleryNorth.map((sample) => sample.y);
  const terraceUp = terraceSouth.map((sample) => sample.y);
  const gallerySide = galleryNorth.map((sample) => sample.x);
  const terraceSide = terraceSouth.map((sample) => sample.x);
  const nearest = { feet: Infinity, gallery: galleryNorth[0], terrace: terraceSouth[0] };
  for (const left of galleryNorth) {
    for (const right of terraceSouth) {
      const feet = Math.hypot(left.y - right.y, left.x - right.x);
      if (feet < nearest.feet) nearest.feet = feet;
    }
  }
  return {
    galleryCells: galleryNorth.length,
    terraceCells: terraceSouth.length,
    galleryUp: span(galleryUp),
    terraceUp: span(terraceUp),
    galleryAcross: span(gallerySide),
    terraceAcross: span(terraceSide),
    nearestOpeningFt: nearest.feet,
    galleryDepthFt: galleryNorth.map((sample) => inwardAir(galleryGrid, sample.x, sample.y, sample.z, [0, 0, -1])),
    terraceDepthFt: terraceSouth.map((sample) => inwardAir(terraceGrid, sample.x, sample.y, sample.z, [0, 0, 1])),
  };
}

const gap = faceGap();
const horizontal = {
  pair: ["linear-gallery", "terraced"],
  faces: `${direct.faceA}/${direct.faceB}`,
  directValid: direct.valid,
  issues: direct.issues,
  openingSeparationFt: Number(gap.nearestOpeningFt.toFixed(2)),
  galleryOpeningDepthFt: gap.galleryDepthFt,
  terraceOpeningDepthFt: gap.terraceDepthFt,
  adapted: false,
  reason: "",
};
if (gap.nearestOpeningFt > 5) {
  horizontal.reason = `The nearest openings are ${gap.nearestOpeningFt.toFixed(1)} ft apart in the shared face. Closing that gap would cut a slot through the face, not a local enlargement. No derived opening was cut.`;
} else if (Math.max(...gap.terraceDepthFt, ...gap.galleryDepthFt) < MIN_CLEAR_HEIGHT) {
  horizontal.reason = "An opening is present, but the air behind it is shorter than 6.5 ft, so it is not a passage. No derived opening was cut.";
} else {
  horizontal.reason = "The openings are close enough to test a local cut, but this pair still has no overlapping two-cell opening. No cut was applied because the existing air already reaches the face and the mismatch is alignment, which a thinner wall would not repair.";
}

const lower = tile("lower", "void-field", 0, MODULE_GROUND_Y, 0, 0);
const upper = tile("upper", "void-field", 0, MODULE_GROUND_Y + MODULE_HEIGHT_FT, 0, 0);
const stackDirect = proposeDirectJoin(lower, upper, voidTile.positions, voidTile.positions);
const openingHeight = westSpan.up.max - westSpan.up.min + MODULE_HEIGHT_FT / 8;
const openingWidth = westSpan.north.max - westSpan.north.min + MODULE_HEIGHT_FT / 8;
const stairFitsFace = openingHeight >= MIN_CLEAR_HEIGHT && openingWidth >= MIN_CLEAR_WIDTH;
const yStart = westSpan.up.min;
const yEnd = MODULE_HEIGHT_FT + westSpan.up.min;
const stairRise = yEnd - yStart;
const risers = Math.max(1, Math.round(stairRise / (7 / 12)));
const riserFt = stairRise / risers;
const treadFt = 11 / 12;
const runFt = risers * treadFt;
const flights = 2;
const flightRisers = Math.ceil(risers / 2);
const flightRun = flightRisers * treadFt;

function stairCells() {
  const cells: { x: number; y: number; z: number }[] = [];
  if (!stairFitsFace) return cells;
  if (flightRun > 24) return cells;
  const width = 3.5;
  const z0 = (westSpan.north.min + westSpan.north.max) / 2 - width / 2;
  for (let riser = 0; riser < risers; riser += 1) {
    const flight = riser < flightRisers ? 0 : 1;
    const local = flight === 0 ? riser : riser - flightRisers;
    const y = yStart + riser * riserFt;
    const x = flight === 0 ? -10 - local * treadFt : -10 - flightRun + local * treadFt;
    for (let step = 0; step < width / CELL; step += 1) cells.push({ x, y, z: z0 + step * CELL });
  }
  const yTurn = yStart + flightRisers * riserFt;
  const yLand = yStart + (risers - 1) * riserFt;
  for (let step = 0; step < width / CELL; step += 1) {
    const z = z0 + step * CELL;
    for (let x = -10; x >= -11; x -= CELL) {
      cells.push({ x, y: yStart, z });
      cells.push({ x, y: yLand, z });
    }
    cells.push({ x: -10 - flightRun, y: yTurn, z });
  }
  return cells;
}

const treads = stairFitsFace ? stairCells() : [];
let stairClash = 0;
for (const tread of treads) {
  const [ix, iy, iz] = cellOf(tread.x, tread.y, tread.z);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= N || iy >= N || iz >= N) continue;
  if (voidGrid.solid[at(ix, iy, iz)] || voidGrid.shell[at(ix, iy, iz)]) stairClash += 1;
}
let headroomBlocked = 0;
let upperClash = 0;
for (const tread of treads) {
  for (let step = 1; step <= MIN_CLEAR_HEIGHT / CELL; step += 1) {
    const [ix, iy, iz] = cellOf(tread.x, tread.y + step * CELL, tread.z);
    if (ix >= 0 && iy >= 0 && iz >= 0 && ix < N && iy < N && iz < N && (voidGrid.solid[at(ix, iy, iz)] || voidGrid.shell[at(ix, iy, iz)])) headroomBlocked += 1;
    const localY = tread.y + step * CELL - MODULE_HEIGHT_FT;
    const above = cellOf(tread.x, localY, tread.z);
    if (above[0] >= 0 && above[1] >= 0 && above[2] >= 0 && above[0] < N && above[1] < N && above[2] < N && (voidGrid.solid[at(...above)] || voidGrid.shell[at(...above)])) upperClash += 1;
  }
  const local = cellOf(tread.x, tread.y - MODULE_HEIGHT_FT, tread.z);
  if (local[0] >= 0 && local[1] >= 0 && local[2] >= 0 && local[0] < N && local[1] < N && local[2] < N && (voidGrid.solid[at(...local)] || voidGrid.shell[at(...local)])) upperClash += 1;
}

function reachable() {
  if (treads.length === 0) return false;
  const points: { x: number; y: number; z: number; goal: boolean }[] = [];
  for (const sample of voidWest) {
    if (inwardAir(voidGrid, sample.x, sample.y, sample.z, [1, 0, 0]) < 3) continue;
    points.push({ x: sample.x, y: sample.y, z: sample.z, goal: false });
    points.push({ x: sample.x, y: sample.y + MODULE_HEIGHT_FT, z: sample.z, goal: true });
  }
  for (const tread of treads) points.push({ ...tread, goal: false });
  if (!points.some((point) => point.goal)) return false;
  const seen = new Set<number>();
  const stack = points.flatMap((point, index) => point.goal ? [] : point.y < yStart + 1 ? [index] : []);
  for (const index of stack) seen.add(index);
  const near = (left: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }) => Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z) <= 1.25;
  while (stack.length) {
    const current = stack.pop()!;
    if (points[current].goal) return true;
    for (let index = 0; index < points.length; index += 1) {
      if (seen.has(index) || !near(points[current], points[index])) continue;
      seen.add(index);
      stack.push(index);
    }
  }
  return false;
}

const verticalConnected = reachable();
const vertical = {
  pair: ["void-field", "void-field"],
  levelsFt: [MODULE_GROUND_Y, MODULE_GROUND_Y + MODULE_HEIGHT_FT],
  direct: { valid: stackDirect.valid, issues: stackDirect.issues, faces: `${stackDirect.faceA}/${stackDirect.faceB}` },
  westOpening: westSpan,
  openingWidthFt: Number(openingWidth.toFixed(2)),
  openingHeightFt: Number(openingHeight.toFixed(2)),
  roofClearanceAboveVoidFt: Number.isFinite(roofOverVoid) ? Number(roofOverVoid.toFixed(2)) : null,
  stair: stairFitsFace ? {
    form: "external switchback running west from the opening, then back to the upper opening",
    risers,
    riseInches: Number((riserFt * 12).toFixed(2)),
    treadInches: 11,
    runFt: Number(runFt.toFixed(2)),
    widthFt: 3.5,
    flights,
    cells: treads.length,
    clashWithSolid: stairClash + upperClash,
    headroomBlockedCells: headroomBlocked,
    continuousRoute: verticalConnected,
    code: "unverified",
  } : null,
  adaptedTile: false,
  valid: verticalConnected && stairClash === 0 && upperClash === 0 && headroomBlocked === 0,
  reason: "",
};
if (!stairFitsFace) {
  vertical.reason = `The west opening is ${openingWidth.toFixed(1)} ft wide and ${openingHeight.toFixed(1)} ft high. A usable stair needs at least ${MIN_CLEAR_WIDTH} ft by ${MIN_CLEAR_HEIGHT} ft at the landing. No stair was built.`;
} else if (!vertical.valid) {
  vertical.reason = verticalConnected
    ? "A tread line meets both openings, but it clashes with the tile or lacks headroom. It is not a route."
    : "The external tread line does not produce a continuous walk from the lower opening to the upper opening. The stack is not connected.";
} else {
  vertical.reason = "Experimental external stair. The original meshes were not cut. This is not a production connection, and no building code was checked.";
}

const sideA = tile("a", "void-field", 0, MODULE_GROUND_Y, 0, Math.PI);
const sideB = tile("b", "void-field", MODULE_HEIGHT_FT, MODULE_GROUND_Y, 0, 0);
const sideJoin = proposeDirectJoin(sideA, sideB, voidTile.positions, voidTile.positions);
const upperJoin = proposeDirectJoin(
  tile("c", "void-field", 0, MODULE_GROUND_Y + MODULE_HEIGHT_FT, 0, Math.PI),
  tile("d", "void-field", MODULE_HEIGHT_FT, MODULE_GROUND_Y + MODULE_HEIGHT_FT, 0, 0),
  voidTile.positions,
  voidTile.positions,
);
const cluster = {
  tiles: ["void-field A", "void-field B", "void-field C", "void-field D"],
  edges: [
    { from: "A", to: "B", method: "direct", valid: sideJoin.valid, traversable: sideJoin.traversable, issues: sideJoin.issues },
    { from: "C", to: "D", method: "direct", valid: upperJoin.valid, traversable: upperJoin.traversable, issues: upperJoin.issues },
    { from: "A", to: "C", method: "external-stair", valid: false, reason: "A's only opening faces B. The stair would occupy the same face as the horizontal join. No second opening was cut." },
    { from: "gallery", to: "terrace", method: "adapted-direct", valid: false, reason: horizontal.reason },
  ],
  oneConnectedCluster: false,
};

const unchanged = voidSource.every((value, index) => value === voidTile.positions[index])
  && terraceSource.every((value, index) => value === terrace.positions[index])
  && gallerySource.every((value, index) => value === gallery.positions[index]);

const report = {
  classification: "experimental",
  productionConnections: "unchanged",
  sourceMeshesUnchanged: unchanged,
  whyHybridsFail: "Skill 04 lofts the outer section rings between the two faces. A closed shell can result. Section correspondence is only an angular comparison of those outer rings, and the mesh check can still leave a gap or a sharp fold. Neither test asks whether air inside one tile reaches air inside the other. Several sampled hybrids were also seated on the east-west placement faces while the near openings were on other faces.",
  sealedMass: "The enclosed voxel volume is the solid inside the shell. Face openings lead into exterior-connected air, not into that solid.",
  horizontal,
  vertical,
  cluster,
  proposedIntegration: "Keep this out of the assembly workflow. A later Adapt Connection action could store an external stair as its own mesh, keyed to the two instance ids, and leave the source module untouched. It should run only after the opening is at least 3 by 6.5 ft, the treads reach both openings, and the stair misses both solids. The horizontal local cut tested here should stay unavailable.",
};
const out = join(process.cwd(), "data", "skill5", "autonomous-test", "repair-03");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));

const dots: string[] = [];
const project = (x: number, y: number, z: number, color: string) => {
  const sx = 360 + x * 8 - z * 4;
  const sy = 520 - y * 8 - z * 2;
  dots.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="1.1" fill="${color}"/>`);
};
for (let index = 0; index < voidTile.positions.length; index += 30) {
  const x = voidTile.positions[index];
  const up = voidTile.positions[index + 2];
  const north = voidTile.positions[index + 1];
  project(x, up + 8, north, "#5d7c79");
}
for (const tread of treads) project(tread.x, tread.y, tread.z, "#c77e5f");
const section: string[] = [];
const sectionZ = voidWest[0]?.z ?? 0;
for (let ix = 0; ix < N; ix += 2) {
  for (let iy = 0; iy < N; iy += 2) {
    const x = MIN + (ix + 0.5) * CELL;
    const y = MIN + (iy + 0.5) * CELL;
    if (Math.abs(x) > 11 || y < -1 || y > 21) continue;
    const [cx, cy, cz] = cellOf(x, y, sectionZ);
    if (cz < 0 || cz >= N) continue;
    const index = at(cx, cy, cz);
    const color = voidGrid.shell[index] ? "#8aa09d" : voidGrid.solid[index] ? "#3e5856" : "transparent";
    if (color === "transparent") continue;
    section.push(`<rect x="${(40 + (x + 12) * 8).toFixed(1)}" y="${(520 - (y + 12) * 8).toFixed(1)}" width="7" height="7" fill="${color}"/>`);
  }
}
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Repair 03</title><style>body{margin:0;background:#000;color:#fff;font:14px ui-sans-serif,sans-serif}h1,h2{font-weight:500;letter-spacing:.12em;text-transform:uppercase;font-size:13px}section{padding:24px}p{color:#bbb;max-width:760px}</style></head><body>
<section><h1>Repair 03 · original void field, experimental stair</h1><p>Teal points are the stored mesh. Copper points are the experimental tread line, drawn only when the opening is large enough to test one. ${vertical.valid ? "The route validated." : "The route did not validate."} ${vertical.reason}</p>
<svg viewBox="0 0 760 560" width="760" height="560"><rect width="100%" height="100%" fill="#000"/>${dots.join("")}</svg></section>
<section><h2>Section through the west opening</h2><p>Pale cells are the shell. Dark cells are the sealed solid. Empty space is air. No cells were removed from the original.</p>
<svg viewBox="0 0 420 560" width="420" height="560"><rect width="100%" height="100%" fill="#000"/>${section.join("")}</svg></section>
</body></html>`;
writeFileSync(join(out, "index.html"), html);
console.log(JSON.stringify(report, null, 2));
