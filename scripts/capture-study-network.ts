/**
 * White filament frames for the growth study.
 * Replays a saved Skill 01 run and paints its trail field with the plate hair. Does not change the engine.
 */
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createSimulation, stepMany, trailPeak } from "../lib/skill1/engine";
import { DISPLAY_ITERATIONS } from "../lib/skill1/maps";
import { attractorsAsKind, runAttractorsFor } from "../lib/skill1/run-variants";
import { slimeControlsFromTranslation, varySlimeControls, type SlimeControls } from "../lib/skill1/slime-controls";
import { translateArchetype } from "../lib/skill1/translate";
import type { AttractorKind, BiologicalBehavior, BiologicalParams, BiologicalTranslation, SpatialRecipe, TopologyKind } from "../lib/skill1/types";
import { mulberry32 } from "../lib/physarum";

const OUT = "public/assets/skill0/study-network";
let SIZE = 1280;
const SHOWN = [12, 18, 26, 36, 46, 58, 70, 84, 98];
const COLUMNS = 20;
const ROW_KINDS: AttractorKind[] = ["point", "ring", "line", "curve"];

type Entry = {
  id: string;
  archetypeId: string;
  run: number;
  seed: number;
  agents: number;
  slime?: SlimeControls;
  params?: BiologicalParams;
  behavior?: BiologicalBehavior;
  recipe?: SpatialRecipe;
  topology?: TopologyKind;
  archetypeName?: string;
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

/** Same ridge ink as the live field renderer: white filaments, transparent ground. */
function paint(trails: ArrayLike<number>, trailSize: number) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const field = new Float32Array(trailSize * trailSize);
  for (let i = 0; i < field.length; i += 1) field[i] = Math.min(1, Math.max(0, trails[i] / 0.55));
  let minX = SIZE;
  let minY = SIZE;
  let maxX = 0;
  let maxY = 0;
  let ink = 0;
  for (let py = 0; py < SIZE; py += 1) {
    const ty = (1 - py / (SIZE - 1)) * (trailSize - 1);
    for (let px = 0; px < SIZE; px += 1) {
      const tx = (px / (SIZE - 1)) * (trailSize - 1);
      const value = sample(field, trailSize, tx, ty);
      const around = 0.125 * (
        sample(field, trailSize, tx + 1, ty) +
        sample(field, trailSize, tx - 1, ty) +
        sample(field, trailSize, tx, ty + 1) +
        sample(field, trailSize, tx, ty - 1) +
        sample(field, trailSize, tx + 1, ty + 1) +
        sample(field, trailSize, tx - 1, ty + 1) +
        sample(field, trailSize, tx + 1, ty - 1) +
        sample(field, trailSize, tx - 1, ty - 1)
      );
      const ridge = Math.max(0, value - around * 0.62);
      const core = smoothstep(0.012, 0.032, ridge) * (1 - smoothstep(0.055, 0.11, ridge)) * smoothstep(0.012, 0.04, value);
      if (core < 0.04) continue;
      const index = (py * SIZE + px) * 4;
      const white = Math.round(Math.min(1, core) * 255);
      rgba[index] = white;
      rgba[index + 1] = white;
      rgba[index + 2] = white;
      rgba[index + 3] = Math.round(Math.min(1, core) * 255);
      ink += 1;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  const margin = ink ? Math.min(minX, minY, SIZE - 1 - maxX, SIZE - 1 - maxY) : SIZE;
  return { rgba, ink, margin, box: ink ? [minX, minY, maxX, maxY] : [0, 0, 0, 0] };
}

async function paintRun(catalog: string, run: number, out: string, shown: number[]) {
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
  mkdirSync(out, { recursive: true });
  let cursor = 0;
  for (let index = 0; index < shown.length; index += 1) {
    const iteration = shown[index];
    const steps = iteration - cursor;
    if (steps > 0) stepMany(sim, translation, random, steps, controls.decay, controls, false);
    cursor = sim.iteration;
    const source = sim.displayTrails ?? sim.trails;
    const frame = paint(source, sim.trailSize);
    const name = `${out}/${String(index).padStart(2, "0")}.png`;
    await sharp(frame.rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } }).rotate(270).png().toFile(name);
    console.log(entry.archetypeId, "run", entry.run, "agents", entry.agents, name, "i", sim.iteration, "ink", frame.ink, "margin", frame.margin);
  }
}

async function main() {
  if (process.argv.includes("--probe")) {
    SIZE = 720;
    const shown = [10, 24, 40, 64];
    await paintRun("public/demo/skill1/vertical-void/entries.json", 23, "C:/Users/julie/AppData/Local/Temp/src-void", shown);
    await paintRun("public/demo/skill1/continuous-hall/entries.json", 4, "C:/Users/julie/AppData/Local/Temp/src-hall", shown);
    await paintRun("public/demo/skill1/open-hall/entries.json", 100, "C:/Users/julie/AppData/Local/Temp/src-open", shown);
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const shown = process.argv.includes("--test") ? [1, 4, 12, 36] : SHOWN;
  await paintRun("public/demo/skill1/open-hall/entries.json", 100, OUT, shown);
}

void main();
