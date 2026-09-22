import { readFileSync } from "node:fs";
import { mulberry32 } from "../physarum";
import { createSimulation, stepMany } from "../skill1/engine";
import { translateArchetype } from "../skill1/translate";
import { ARCHETYPE_VISUAL_REFERENCES } from "./archetype-visual-references";
import { measureMorphologyDetailed } from "./measurements";
import { buildPlanModel, type PlanModel } from "./plan-model";
import { planMorphogenesis, type ArchitecturalPlan } from "./plan-morphogenesis";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const N4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const FORBIDDEN = ["height", "z", "floor", "grounddatum", "verticallevel", "lowerenvelope", "plateelevation", "sourcebottomup"];

function keysOf(value: unknown, found: string[]) {
  if (!value || typeof value !== "object") return;
  if (ArrayBuffer.isView(value) || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    found.push(key);
    keysOf((value as Record<string, unknown>)[key], found);
  }
}

function checksum(mask: Uint8Array) {
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) n = (n + mask[i] * (i + 1)) % 1000003;
  return n;
}

function count(mask: Uint8Array) {
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) n += mask[i];
  return n;
}

function masksEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function distanceFrom(mask: Uint8Array, columns: number, rows: number) {
  const dist = new Int16Array(mask.length);
  dist.fill(32767);
  const queue: number[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    dist[i] = 0;
    queue.push(i);
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head];
    head += 1;
    const x = i % columns;
    const y = (i - x) / columns;
    const next = dist[i] + 1;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      const ni = ny * columns + nx;
      if (dist[ni] <= next) continue;
      dist[ni] = next;
      queue.push(ni);
    }
  }
  return dist;
}

function supportOf(plan: PlanModel) {
  const mask = new Uint8Array(plan.domain.columns * plan.domain.rows);
  for (let i = 0; i < mask.length; i += 1) {
    if (plan.reinforcement.strong[i] || plan.reinforcement.connective[i] || plan.mass.mask[i]) mask[i] = 1;
  }
  return mask;
}

function components(mask: Uint8Array, columns: number, rows: number) {
  const seen = new Uint8Array(mask.length);
  const groups: number[][] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      if (i === undefined) break;
      cells.push(i);
      const x = i % columns;
      const y = (i - x) / columns;
      for (const [ox, oy] of N4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const ni = ny * columns + nx;
        if (!mask[ni] || seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    groups.push(cells);
  }
  groups.sort((a, b) => b.length - a.length);
  return groups;
}

function interiorHoles(mass: Uint8Array, columns: number, rows: number) {
  const empty = new Uint8Array(mass.length);
  for (let i = 0; i < mass.length; i += 1) if (!mass[i]) empty[i] = 1;
  const seen = new Uint8Array(mass.length);
  const stack: number[] = [];
  for (let x = 0; x < columns; x += 1) stack.push(x, (rows - 1) * columns + x);
  for (let y = 0; y < rows; y += 1) stack.push(y * columns, y * columns + columns - 1);
  while (stack.length) {
    const i = stack.pop();
    if (i === undefined || seen[i] || !empty[i]) continue;
    seen[i] = 1;
    const x = i % columns;
    const y = (i - x) / columns;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      stack.push(ny * columns + nx);
    }
  }
  const holes: number[][] = [];
  for (let start = 0; start < empty.length; start += 1) {
    if (!empty[start] || seen[start]) continue;
    const cells: number[] = [];
    const pile = [start];
    seen[start] = 1;
    while (pile.length) {
      const i = pile.pop();
      if (i === undefined) break;
      cells.push(i);
      const x = i % columns;
      const y = (i - x) / columns;
      for (const [ox, oy] of N4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const ni = ny * columns + nx;
        if (!empty[ni] || seen[ni]) continue;
        seen[ni] = 1;
        pile.push(ni);
      }
    }
    holes.push(cells);
  }
  holes.sort((a, b) => b.length - a.length);
  return holes;
}

function centroid(cells: number[], columns: number) {
  let sx = 0;
  let sy = 0;
  for (const i of cells) {
    sx += i % columns;
    sy += (i - (i % columns)) / columns;
  }
  const n = Math.max(1, cells.length);
  return { x: sx / n, y: sy / n };
}

function massCentroid(mask: Uint8Array, columns: number) {
  const cells: number[] = [];
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) cells.push(i);
  return centroid(cells, columns);
}

function axisOf(mask: Uint8Array, columns: number) {
  const c = massCentroid(mask, columns);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const x = i % columns;
    const y = (i - x) / columns;
    const dx = x - c.x;
    const dy = y - c.y;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
    n += 1;
  }
  const angle = n ? 0.5 * Math.atan2(2 * xy, xx - yy) : 0;
  const trace = xx + yy;
  const det = xx * yy - xy * xy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const major = trace / 2 + disc;
  const minor = Math.max(1, trace / 2 - disc);
  return {
    cx: c.x,
    cy: c.y,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    aspect: Math.sqrt(major / minor),
  };
}

function project(x: number, y: number, axis: ReturnType<typeof axisOf>) {
  return {
    along: (x - axis.cx) * axis.cos + (y - axis.cy) * axis.sin,
    across: -(x - axis.cx) * axis.sin + (y - axis.cy) * axis.cos,
  };
}

function histogram(mask: Uint8Array, columns: number, key: (x: number, y: number) => number, bins: number) {
  let lo = Infinity;
  let hi = -Infinity;
  const pts: { x: number; y: number; t: number }[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const x = i % columns;
    const y = (i - x) / columns;
    const t = key(x, y);
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
    pts.push({ x, y, t });
  }
  const counts = new Array(bins).fill(0);
  const span = Math.max(1e-6, hi - lo);
  for (const p of pts) {
    const bin = Math.max(0, Math.min(bins - 1, Math.floor(((p.t - lo) / span) * (bins - 1))));
    counts[bin] += 1;
  }
  return { counts, lo, hi, span, pts };
}

function peakIndexes(counts: number[]) {
  const peaks: number[] = [];
  for (let i = 1; i < counts.length - 1; i += 1) {
    if (counts[i] >= counts[i - 1] && counts[i] > counts[i + 1] && counts[i] > 8) peaks.push(i);
  }
  const kept: number[] = [];
  for (const peak of peaks) {
    const prev = kept[kept.length - 1];
    if (prev === undefined || peak - prev > 2) kept.push(peak);
    else if (counts[peak] > counts[prev]) kept[kept.length - 1] = peak;
  }
  return kept;
}

function medianThickness(hist: { counts: number[]; span: number }) {
  const binWidth = hist.span / Math.max(1, hist.counts.length - 1);
  const samples = hist.counts.filter((n) => n > 0).map((n) => n / binWidth);
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}

function valleysBetween(counts: number[], peaks: number[], ratio: number) {
  let found = 0;
  for (let i = 1; i < peaks.length; i += 1) {
    let min = Infinity;
    for (let k = peaks[i - 1]; k <= peaks[i]; k += 1) min = Math.min(min, counts[k]);
    const limit = Math.min(counts[peaks[i - 1]], counts[peaks[i]]) * ratio;
    if (min < limit) found += 1;
  }
  return found;
}

function holeBuffer(mass: Uint8Array, hole: number[], columns: number, rows: number) {
  const exterior = new Uint8Array(mass.length);
  const mark = new Uint8Array(mass.length);
  for (const i of hole) mark[i] = 1;
  for (let i = 0; i < mass.length; i += 1) if (!mass[i] && !mark[i]) exterior[i] = 1;
  for (let x = 0; x < columns; x += 1) {
    exterior[x] = 1;
    exterior[(rows - 1) * columns + x] = 1;
  }
  for (let y = 0; y < rows; y += 1) {
    exterior[y * columns] = 1;
    exterior[y * columns + columns - 1] = 1;
  }
  const dist = distanceFrom(exterior, columns, rows);
  let buffer = 32767;
  for (const i of hole) buffer = Math.min(buffer, dist[i]);
  return buffer;
}

function realize(archetypeId: string) {
  const translation = translateArchetype(archetypeId);
  const seed = 42;
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const state = createSimulation(translation, seed, 200);
  state.maxIterations = 90;
  stepMany(state, translation, rng, 90, 0.986);
  const morphology = measureMorphologyDetailed(state);
  const plan = buildPlanModel(state, morphology);
  return plan;
}

function describe(planOut: ArchitecturalPlan, plan: PlanModel) {
  const { mass, columns, rows } = planOut;
  const white = count(mass);
  const groups = components(mass, columns, rows);
  const holes = interiorHoles(mass, columns, rows);
  const axis = axisOf(mass, columns);
  const along = histogram(mass, columns, (x, y) => project(x, y, axis).along, 24);
  const across = histogram(mass, columns, (x, y) => project(x, y, axis).across, 24);
  const support = supportOf(plan);
  const dist = distanceFrom(support, columns, rows);
  let far = 0;
  let near = 0;
  for (let i = 0; i < mass.length; i += 1) {
    if (!mass[i]) continue;
    if (dist[i] > 20) far += 1;
    if (dist[i] <= 2) near += 1;
  }
  return {
    white,
    black: mass.length - white,
    largest: groups[0]?.length ?? 0,
    parts: groups.length,
    holes: holes.map((h) => h.length),
    hole: holes[0] ?? [],
    aspect: axis.aspect,
    alongPeaks: peakIndexes(along.counts),
    alongValleys: valleysBetween(along.counts, peakIndexes(along.counts), 0.72),
    acrossPeaks: peakIndexes(across.counts),
    acrossValleys: valleysBetween(across.counts, peakIndexes(across.counts), 0.55),
    along,
    across,
    axis,
    far,
    near,
    columns,
    rows,
    mass,
  };
}

const source = readFileSync(new URL("./plan-morphogenesis.ts", import.meta.url), "utf8");
assert(!source.includes("sectionTranslate"), "plan morphogenesis must not call section translation");
assert(!source.includes("SectionModel"), "plan morphogenesis must not depend on a section model");
assert(!source.includes(".png"), "plan morphogenesis must not read reference images");
assert(!source.includes("Math.random"), "plan morphogenesis must stay deterministic");
assert(!/\bheight\b/.test(source), "plan morphogenesis must not use height");
assert(!/\bz\b/.test(source), "plan morphogenesis must not use z");

const ids = ARCHETYPE_VISUAL_REFERENCES.map((entry) => entry.archetypeId);
assert(ids.length === 15, "expected 15 archetypes");

const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};

const plans = new Map<string, PlanModel>();
const outputs = new Map<string, ArchitecturalPlan>();

for (const id of ids) {
  const plan = realize(id);
  plans.set(id, plan);
  const first = planMorphogenesis(id, plan);
  const second = planMorphogenesis(id, plan);
  outputs.set(id, first);
  const keys: string[] = [];
  keysOf(first, keys);
  check(first.mass.length === first.columns * first.rows, `${id} grid`);
  check(first.columns === plan.domain.columns && first.rows === plan.domain.rows, `${id} xy domain`);
  check(count(first.mass) > 8, `${id} has white mass`);
  check(count(first.mass) < first.mass.length, `${id} keeps black ground`);
  check(masksEqual(first.mass, second.mass), `${id} deterministic`);
  check(!keys.some((key) => FORBIDDEN.includes(key.toLowerCase())), `${id} xy only keys ${keys.join(",")}`);
  const info = describe(first, plan);
  check(info.far === 0, `${id} leaves biological reach (${info.far})`);
  check(info.near > 8, `${id} lacks nearby biological support (${info.near})`);
}

const shared = plans.get("void-field");
if (!shared) throw new Error("shared plan");
const sharedOut = ids.map((id) => ({ id, sum: checksum(planMorphogenesis(id, shared).mass) }));
const sharedUnique = new Set(sharedOut.map((item) => item.sum));
check(sharedUnique.size >= 12, `shared-evidence plans collapsed (${sharedUnique.size}) ${sharedOut.map((item) => item.id + ":" + item.sum).join(" ")}`);

const ownUnique = new Set([...outputs.values()].map((plan) => checksum(plan.mass)));
check(ownUnique.size >= 12, `own-field plans collapsed (${ownUnique.size})`);

function info(id: string) {
  const plan = plans.get(id);
  const out = outputs.get(id);
  if (!plan || !out) throw new Error(id);
  return describe(out, plan);
}

{
  const vertical = info("vertical-void");
  check(vertical.holes[0] >= 60, `vertical void hole ${vertical.holes[0] ?? 0}`);
  check(vertical.hole.length > 0, "vertical void missing core");
  if (vertical.hole.length) {
    const c = centroid(vertical.hole, vertical.columns);
    const m = massCentroid(vertical.mass, vertical.columns);
    check(Math.hypot(c.x - m.x, c.y - m.y) < 22, "vertical void is not a core relationship");
    check(holeBuffer(vertical.mass, vertical.hole, vertical.columns, vertical.rows) >= 2, "vertical void buffer");
  }
}

{
  const sequential = info("compressed-sequential");
  check(sequential.alongValleys >= 1, `compressed sequence valleys ${sequential.alongValleys} peaks ${sequential.alongPeaks.join(",")}`);
  check(sequential.aspect >= 1.4, `compressed sequence aspect ${sequential.aspect.toFixed(2)}`);
}

{
  const hall = info("continuous-hall");
  check(hall.largest / hall.white > 0.8, "continuous hall fragmented");
  check(hall.aspect >= 1.6, `continuous hall aspect ${hall.aspect.toFixed(2)}`);
  check(medianThickness(hall.along) >= 7, `continuous hall too thin ${medianThickness(hall.along).toFixed(1)}`);
}

{
  const field = info("topographic-ground-field");
  check(field.largest / field.white > 0.8, "topographic field disconnected");
  check((field.holes[0] ?? 0) < 80, `topographic field has a dominant core ${field.holes[0] ?? 0}`);
}

{
  const gallery = info("linear-gallery");
  check(gallery.aspect >= 1.7, `linear gallery aspect ${gallery.aspect.toFixed(2)}`);
  check(gallery.largest / gallery.white > 0.72, "linear gallery fragmented");
  check(medianThickness(gallery.along) <= 12, `linear gallery not linear enough ${medianThickness(gallery.along).toFixed(1)}`);
}

{
  const open = info("open-hall");
  check((open.holes[0] ?? 0) >= 150, `open hall opening ${open.holes[0] ?? 0}`);
  check((open.holes[0] ?? 0) > open.white * 0.12, `open hall opening is not dominant ${open.holes[0] ?? 0}/${open.white}`);
  check(open.largest / Math.max(1, open.white) > 0.75, "open hall fragmented");
}

{
  const terraced = info("terraced");
  check(terraced.acrossValleys >= 2 || terraced.acrossPeaks.length >= 3, `terraced bands peaks ${terraced.acrossPeaks.join(",")} valleys ${terraced.acrossValleys}`);
  check((terraced.holes[0] ?? 0) < 24, `terraced gained a focus ${terraced.holes[0] ?? 0}`);
}

{
  const flat = info("flat-deep-plan");
  check(flat.aspect >= 1.35, `flat deep aspect ${flat.aspect.toFixed(2)}`);
  check((flat.holes[0] ?? 0) < 20, `flat deep void ${flat.holes[0] ?? 0}`);
  check(flat.largest / flat.white > 0.85, "flat deep fragmented");
}

{
  const edge = info("void-edge");
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < edge.mass.length; i += 1) {
    if (!edge.mass[i]) continue;
    const x = i % edge.columns;
    const y = (i - x) / edge.columns;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const margins = [minX, edge.columns - 1 - maxX, minY, edge.rows - 1 - maxY];
  margins.sort((a, b) => b - a);
  check(margins[0] > edge.columns * 0.12, `void edge margin ${margins.join(",")}`);
  const c = massCentroid(edge.mass, edge.columns);
  check(
    Math.abs(c.x - edge.columns / 2) > edge.columns * 0.06 || Math.abs(c.y - edge.rows / 2) > edge.rows * 0.06,
    "void edge is not asymmetric",
  );
}

{
  const wave = info("undulated");
  check(wave.largest / wave.white > 0.85, "undulated broke continuity");
  const occupied = wave.along.counts.filter((n) => n > 0).length;
  check(occupied / wave.along.counts.length > 0.7, "undulated is not continuous");
  check(wave.acrossPeaks.length < 3, `undulated stepped into ${wave.acrossPeaks.length} bands`);
}

{
  const amphi = info("stepped-amphitheater");
  check((amphi.holes[0] ?? 0) >= 20, `amphitheater focus ${amphi.holes[0] ?? 0}`);
  const focus = amphi.hole.length ? centroid(amphi.hole, amphi.columns) : massCentroid(amphi.mass, amphi.columns);
  const radial = histogram(amphi.mass, amphi.columns, (x, y) => Math.hypot(x - focus.x, y - focus.y), 18);
  const radialPeaks = peakIndexes(radial.counts);
  check(radialPeaks.length >= 2, `amphitheater bands ${radialPeaks.join(",")}`);
}

{
  const voids = info("void-field");
  check(voids.holes.length >= 3, `void field holes ${voids.holes.length}`);
  const holeSum = voids.holes.reduce((sum, n) => sum + n, 0);
  check(holeSum > 0 && (voids.holes[0] ?? 0) / holeSum < 0.7, "void field has a single dominant void");
  check(voids.largest / voids.white > 0.7, "void field disconnected");
}

{
  const plate = info("inserted-horizontal-plate");
  const rows = new Array(plate.rows).fill(0);
  for (let i = 0; i < plate.mass.length; i += 1) if (plate.mass[i]) rows[(i - (i % plate.columns)) / plate.columns] += 1;
  let bestY = 0;
  for (let y = 1; y < rows.length; y += 1) if (rows[y] > rows[bestY]) bestY = y;
  let minX = plate.columns;
  let maxX = 0;
  for (let x = 0; x < plate.columns; x += 1) {
    if (!plate.mass[bestY * plate.columns + x]) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  let band = 0;
  for (let y = Math.max(0, bestY - 8); y <= Math.min(plate.rows - 1, bestY + 8); y += 1) band += rows[y];
  check(maxX - minX > plate.columns * 0.45, `inserted plate span ${maxX - minX}`);
  check(band / plate.white > 0.4, `inserted plate dominance ${band}/${plate.white}`);
}

{
  const room = info("contained-room-within-volume");
  check((room.holes[0] ?? 0) >= 24, `contained room ${room.holes[0] ?? 0}`);
  if (room.hole.length) {
    check(holeBuffer(room.mass, room.hole, room.columns, room.rows) >= 4, "contained room touches the outer boundary");
  }
}

{
  const edgeGallery = info("linear-edge-gallery");
  check(edgeGallery.aspect >= 1.5, `edge gallery aspect ${edgeGallery.aspect.toFixed(2)}`);
  const c = massCentroid(edgeGallery.mass, edgeGallery.columns);
  check(
    Math.abs(c.x - edgeGallery.columns / 2) > edgeGallery.columns * 0.05 ||
      Math.abs(c.y - edgeGallery.rows / 2) > edgeGallery.rows * 0.05,
    "edge gallery is not edge-associated",
  );
  check(
    medianThickness(edgeGallery.along) <= 16,
    `edge gallery is not a linear organizer ${medianThickness(edgeGallery.along).toFixed(1)}`,
  );
}

if (failures.length) {
  console.error(failures.map((line) => `- ${line}`).join("\n"));
  throw new Error(`${failures.length} plan morphogenesis checks failed`);
}

console.log("plan morphogenesis verifier passed");
console.log(
  ids
    .map((id) => {
      const item = info(id);
      return `${id} white=${item.white} aspect=${item.aspect.toFixed(2)} holes=${item.holes.slice(0, 4).join("+") || 0}`;
    })
    .join("\n"),
);
