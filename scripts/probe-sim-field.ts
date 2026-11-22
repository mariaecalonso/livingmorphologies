import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createSimulation, stepMany } from "../lib/skill1/engine";
import { DISPLAY_ITERATIONS, FIELD_SIZE } from "../lib/skill1/maps";
import { attractorsAsKind, runAttractorsFor } from "../lib/skill1/run-variants";
import { slimeControlsFromTranslation, varySlimeControls, type SlimeControls } from "../lib/skill1/slime-controls";
import { translateArchetype } from "../lib/skill1/translate";
import type { AttractorKind, BiologicalBehavior, BiologicalParams, BiologicalTranslation, SpatialRecipe, TopologyKind } from "../lib/skill1/types";
import { mulberry32 } from "../lib/physarum";

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

function translationForRun(base: BiologicalTranslation, seed: number, index: number): BiologicalTranslation {
  const kind = ROW_KINDS[Math.floor(index / COLUMNS) % ROW_KINDS.length];
  const built = runAttractorsFor(base.archetypeId, seed, base.recipe.attractors ?? [], kind);
  const attractors = attractorsAsKind(built, kind, seed, base.archetypeId);
  const first = attractors[0];
  return {
    ...base,
    recipe: { ...base.recipe, attractorFixed: true, attractorsOnly: true, attractor: { x: first.x, y: first.y }, attractors },
  };
}

function sample(field: Float32Array, size: number, x: number, y: number) {
  const x0 = Math.max(0, Math.min(size - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(size - 1, Math.floor(y)));
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (ix: number, iy: number) => field[iy * size + ix] ?? 0;
  return at(x0, y0) * (1 - tx) * (1 - ty) + at(x1, y0) * tx * (1 - ty) + at(x0, y1) * (1 - tx) * ty + at(x1, y1) * tx * ty;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
}

async function paint(trails: ArrayLike<number>, trailSize: number, file: string, peak: number) {
  const gray = Buffer.alloc(trailSize * trailSize);
  const ceiling = peak * 0.12;
  for (let i = 0; i < trails.length; i += 1) gray[i] = Math.round(Math.min(1, trails[i] / ceiling) * 255);
  const blurred = await sharp(gray, { raw: { width: trailSize, height: trailSize, channels: 1 } })
    .blur(1.05)
    .raw()
    .toBuffer();
  const size = 1400;
  const rgba = Buffer.alloc(size * size * 4);
  const field = new Float32Array(trailSize * trailSize);
  for (let i = 0; i < field.length; i += 1) field[i] = blurred[i] / 255;
  let ink = 0;
  let minX = size;
  let minY = size;
  let maxX = 0;
  let maxY = 0;
  for (let py = 0; py < size; py += 1) {
    const ty = (py / (size - 1)) * (trailSize - 1);
    for (let px = 0; px < size; px += 1) {
      const tx = (px / (size - 1)) * (trailSize - 1);
      const value = sample(field, trailSize, tx, ty);
      const fine = smoothstep(0.28, 0.52, value);
      const primary = smoothstep(0.7, 0.92, value);
      const core = Math.min(1, fine * 0.82 + primary * 0.28);
      if (core < 0.08) continue;
      const index = (py * size + px) * 4;
      const white = Math.round(core * 255);
      rgba[index] = white;
      rgba[index + 1] = white;
      rgba[index + 2] = white;
      rgba[index + 3] = 255;
      ink += 1;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toFile(file);
  const column = new Float64Array(size);
  const row = new Float64Array(size);
  let total = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = rgba[(y * size + x) * 4];
      if (value < 40) continue;
      column[x] += value;
      row[y] += value;
      total += value;
    }
  }
  const trim = (hist: Float64Array) => {
    let start = 0;
    let seen = 0;
    for (; start < hist.length; start += 1) {
      seen += hist[start];
      if (seen > total * 0.015) break;
    }
    let end = hist.length - 1;
    seen = 0;
    for (; end > start; end -= 1) {
      seen += hist[end];
      if (seen > total * 0.015) break;
    }
    return [start / size, end / size];
  };
  const [left, right] = trim(column);
  const [top, bottom] = trim(row);
  const pad = 0.02;
  return {
    ink,
    bounds: {
      left: Math.max(0, left - pad),
      top: Math.max(0, top - pad),
      right: Math.min(1, right + pad),
      bottom: Math.min(1, bottom + pad),
    },
  };
}

async function main() {
  const catalog = "public/demo/skill1/open-hall/entries.json";
  const run = 100;
  const entries = JSON.parse(readFileSync(catalog, "utf8")) as Entry[];
  const entry = entries.find((item) => item.run === run) ?? entries[0];
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
  const sim = createSimulation(translation, entry.seed, entry.agents, 64);
  sim.maxIterations = DISPLAY_ITERATIONS;
  const random = mulberry32(entry.seed ^ 0x9e3779b9);
  const controls = { ...slime, diffusion: Math.min(slime.diffusion, 0.04) };
  const out = "public/assets/skill0/study-field";
  mkdirSync(out, { recursive: true });
  console.log("attractor", sim.attractor, "trail", sim.trailSize);
  const shown = [48, 62, 76, 92, 110, 128, 148, 170];
  const snaps: Float32Array[] = [];
  for (let index = 0; index < shown.length; index += 1) {
    const steps = shown[index] - sim.iteration;
    if (steps > 0) stepMany(sim, translation, random, steps, controls.decay, controls, false);
    snaps.push(Float32Array.from(sim.displayTrails ?? sim.trails));
  }
  let peak = 0.0001;
  const last = snaps[snaps.length - 1];
  for (let i = 0; i < last.length; i += 1) if (last[i] > peak) peak = last[i];
  let bounds = { left: 1, top: 1, right: 0, bottom: 0 };
  for (let index = 0; index < snaps.length; index += 1) {
    const painted = await paint(snaps[index], sim.trailSize, `${out}/${String(index).padStart(2, "0")}.png`, peak);
    bounds = painted.bounds;
    console.log("frame", index, "ink", painted.ink);
  }
  writeFileSync(`${out}/attractor.json`, JSON.stringify({
    x: sim.attractor.x / FIELD_SIZE,
    y: sim.attractor.y / FIELD_SIZE,
    ...bounds,
  }));
  console.log("bounds", bounds);
}

void main();
