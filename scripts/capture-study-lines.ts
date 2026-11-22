/**
 * Records agent steps from a saved Skill 01 run as line segments.
 * Does not change the engine. The study draws these segments directly.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createSimulation, stepSimulation } from "../lib/skill1/engine";
import { DISPLAY_ITERATIONS, FIELD_SIZE } from "../lib/skill1/maps";
import { attractorsAsKind, runAttractorsFor } from "../lib/skill1/run-variants";
import { slimeControlsFromTranslation, varySlimeControls, type SlimeControls } from "../lib/skill1/slime-controls";
import { translateArchetype } from "../lib/skill1/translate";
import type { AttractorKind, BiologicalBehavior, BiologicalParams, BiologicalTranslation, SpatialRecipe, TopologyKind } from "../lib/skill1/types";
import { mulberry32 } from "../lib/physarum";

const OUT = "public/assets/skill0/study-lines.json";
const STEPS = 120;
const COLUMNS = 20;
const ROW_KINDS: AttractorKind[] = ["point", "ring", "line", "curve"];

type Entry = {
  archetypeId: string;
  run: number;
  seed: number;
  agents: number;
  slime?: SlimeControls;
  params?: BiologicalParams;
  behavior?: BiologicalBehavior;
  recipe?: SpatialRecipe;
  topology?: TopologyKind;
};

type Segment = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  born: number;
  hits: number;
  agent: number;
};

function translationForRun(base: BiologicalTranslation, seed: number, index: number): BiologicalTranslation {
  const kind = ROW_KINDS[Math.floor(index / COLUMNS) % ROW_KINDS.length];
  const built = runAttractorsFor(base.archetypeId, seed, base.recipe.attractors ?? [], kind);
  const attractors = attractorsAsKind(built, kind, seed, base.archetypeId);
  const first = attractors[0];
  return {
    ...base,
    recipe: {
      ...base.recipe,
      attractorFixed: true,
      attractorsOnly: true,
      attractor: { x: first.x, y: first.y },
      attractors,
    },
  };
}

function replay(catalog: string, run: number) {
  const entries = JSON.parse(readFileSync(catalog, "utf8")) as Entry[];
  const entry = entries.find((item) => item.run === run) ?? entries[0];
  if (!entry) throw new Error(`missing ${catalog}`);
  const base = translateArchetype(entry.archetypeId);
  const runTranslation = translationForRun(base, entry.seed, Math.max(0, entry.run - 1));
  const marks = runTranslation.recipe.attractors ?? [];
  const slime = entry.slime ?? {
    ...varySlimeControls(slimeControlsFromTranslation(base), entry.seed, entry.archetypeId),
    foodPoints: marks.map((mark) => ({ x: mark.x, y: mark.y })),
  };
  const translation: BiologicalTranslation = {
    ...runTranslation,
    params: entry.params ?? runTranslation.params,
    behavior: entry.behavior ?? runTranslation.behavior,
    recipe: entry.recipe ?? runTranslation.recipe,
    topology: entry.topology ?? runTranslation.topology,
  };
  const sim = createSimulation(translation, entry.seed, entry.agents, 8);
  sim.maxIterations = DISPLAY_ITERATIONS;
  const random = mulberry32(entry.seed ^ 0x9e3779b9);
  const controls = { ...slime, diffusion: Math.min(slime.diffusion, 0.04) };
  const segments: Segment[] = [];
  const cell = 0.45;
  const bins = new Map<string, number[]>();
  const key = (x: number, y: number) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  for (let step = 1; step <= STEPS; step += 1) {
    const before = sim.agents.map((agent) => ({ x: agent.x, y: agent.y }));
    stepSimulation(sim, translation, random, controls.decay, controls, true, false);
    for (let index = 0; index < before.length; index += 1) {
      const agent = sim.agents[index];
      const from = before[index];
      if (!agent || !from) continue;
      const span = Math.hypot(agent.x - from.x, agent.y - from.y);
      if (span < 0.01 || span > 1.15) continue;
      const segment: Segment = { ax: from.x, ay: from.y, bx: agent.x, by: agent.y, born: step, hits: 1, agent: index };
      const id = segments.length;
      segments.push(segment);
      const mx = (from.x + agent.x) / 2;
      const my = (from.y + agent.y) / 2;
      if (mx < minX) minX = mx;
      if (my < minY) minY = my;
      if (mx > maxX) maxX = mx;
      if (my > maxY) maxY = my;
      const bin = key(mx, my);
      const list = bins.get(bin);
      if (list) list.push(id);
      else bins.set(bin, [id]);
      const cx = Math.floor(mx / cell);
      const cy = Math.floor(my / cell);
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const near = bins.get(`${cx + ox}:${cy + oy}`);
          if (!near) continue;
          for (let n = near.length - 1; n >= 0 && n > near.length - 8; n -= 1) {
            const other = segments[near[n]];
            if (!other || other === segment || step - other.born < 2 || step - other.born > 36) continue;
            other.hits += 1;
          }
        }
      }
    }
  }
  const scale = sim.trailSize / FIELD_SIZE;
  let peak = 0.0001;
  for (const segment of segments) {
    const tx = Math.max(0, Math.min(sim.trailSize - 1, Math.round(((segment.ax + segment.bx) / 2) * scale)));
    const ty = Math.max(0, Math.min(sim.trailSize - 1, Math.round(((segment.ay + segment.by) / 2) * scale)));
    const live = sim.trails[ty * sim.trailSize + tx] ?? 0;
    segment.hits = live;
    if (live > peak) peak = live;
  }
  for (const segment of segments) segment.hits = segment.hits / peak;
  let best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, score: 0 };
  for (const [bin, list] of bins) {
    if (list.length < 8) continue;
    const [sx, sy] = bin.split(":").map(Number);
    const early = list.filter((id) => segments[id].born < STEPS * 0.45).length;
    const score = early * 2 + list.length;
    if (score > best.score) best = { x: (sx + 0.5) * cell, y: (sy + 0.5) * cell, score };
  }
  return {
    archetypeId: entry.archetypeId,
    run: entry.run,
    agents: entry.agents,
    iterations: STEPS,
    bounds: [minX, minY, maxX, maxY],
    anchor: { x: best.x, y: best.y },
    segments,
  };
}

type PathPoint = { x: number; y: number; born: number; strength: number };

function pathsOf(segments: Segment[]) {
  const grouped = new Map<number, Segment[]>();
  for (const segment of segments) {
    const list = grouped.get(segment.agent);
    if (list) list.push(segment);
    else grouped.set(segment.agent, [segment]);
  }
  const paths: PathPoint[][] = [];
  for (const list of grouped.values()) {
    let path: PathPoint[] = [];
    const commit = () => {
      if (path.length > 2) paths.push(path);
      path = [];
    };
    for (const segment of list) {
      const last = path[path.length - 1];
      if (last && (segment.born - last.born > 1 || Math.hypot(segment.ax - last.x, segment.ay - last.y) > 0.35)) commit();
      let loopAt = -1;
      for (let index = path.length - 8; index >= Math.max(0, path.length - 22); index -= 1) {
        if (Math.hypot(path[index].x - segment.bx, path[index].y - segment.by) < 0.38) {
          loopAt = index;
          break;
        }
      }
      if (loopAt >= 0) {
        path = path.slice(0, loopAt + 1);
        continue;
      }
      if (!path.length) path.push({ x: segment.ax, y: segment.ay, born: segment.born, strength: segment.hits });
      path.push({ x: segment.bx, y: segment.by, born: segment.born, strength: segment.hits });
    }
    commit();
  }
  return paths.map((path) => path.map((point, index) => {
    const prev = path[Math.max(0, index - 1)];
    const next = path[Math.min(path.length - 1, index + 1)];
    return {
      x: point.x * 0.5 + (prev.x + next.x) * 0.25,
      y: point.y * 0.5 + (prev.y + next.y) * 0.25,
      born: point.born,
      strength: point.strength,
    };
  }));
}

function renderPreview(record: ReturnType<typeof replay>, file: string, until: number) {
  const width = 1851;
  const height = 540;
  const rgba = Buffer.alloc(width * height * 4);
  const paths = pathsOf(record.segments).map((path) => path.filter((point) => point.born <= until));
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  for (const path of paths) {
    for (const point of path) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }
  const spanX = Math.max(0.1, maxX - minX);
  const spanY = Math.max(0.1, maxY - minY);
  const scale = Math.min((width * 0.94) / spanX, (height * 0.86) / spanY);
  const originX = (width - spanX * scale) / 2 - minX * scale;
  const originY = (height - spanY * scale) / 2 - (FIELD_SIZE - maxY) * scale;
  const plot = (x: number, y: number, alpha: number) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const index = (py * width + px) * 4;
    const next = Math.max(rgba[index], Math.round(alpha * 255));
    rgba[index] = next;
    rgba[index + 1] = next;
    rgba[index + 2] = next;
    rgba[index + 3] = 255;
  };
  for (const path of paths) {
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1];
      const to = path[index];
      if (to.born > until) continue;
      const age = until - to.born;
      const primary = to.strength >= 0.42;
      if (to.strength < 0.16 && age > 16) continue;
      const alpha = primary ? 1 : 0.34 + to.strength * 0.5;
      const x0 = originX + from.x * scale;
      const y0 = originY + (FIELD_SIZE - from.y) * scale;
      const x1 = originX + to.x * scale;
      const y1 = originY + (FIELD_SIZE - to.y) * scale;
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        plot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, alpha);
      }
    }
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(file);
}

async function main() {
  const record = replay("public/demo/skill1/open-hall/entries.json", 100);
  mkdirSync("public/assets/skill0", { recursive: true });
  const paths = pathsOf(record.segments);
  const packed = {
    archetypeId: record.archetypeId,
    run: record.run,
    agents: record.agents,
    iterations: record.iterations,
    field: FIELD_SIZE,
    bounds: record.bounds,
    anchor: record.anchor,
    paths: paths.map((path) => path.flatMap((point) => [
      Number(point.x.toFixed(3)),
      Number(point.y.toFixed(3)),
      point.born,
      Number(point.strength.toFixed(3)),
    ])),
  };
  writeFileSync(OUT, JSON.stringify(packed));
  await renderPreview(record, "C:/Users/julie/AppData/Local/Temp/study-lines-40.png", 40);
  await renderPreview(record, "C:/Users/julie/AppData/Local/Temp/study-lines-80.png", 80);
  await renderPreview(record, "C:/Users/julie/AppData/Local/Temp/study-lines-120.png", 120);
  console.log(record.archetypeId, "run", record.run, "paths", paths.length, "bounds", record.bounds.map((value) => value.toFixed(2)).join(","), "anchor", record.anchor.x.toFixed(2), record.anchor.y.toFixed(2));
}

void main();
