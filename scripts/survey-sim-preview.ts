/** One-frame survey of saved runs. Does not change the simulation. */
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createSimulation, stepMany } from "../lib/skill1/engine";
import { DISPLAY_ITERATIONS } from "../lib/skill1/maps";
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

async function paint(trails: ArrayLike<number>, trailSize: number, file: string) {
  let peak = 0.0001;
  for (let i = 0; i < trails.length; i += 1) if (trails[i] > peak) peak = trails[i];
  const gray = Buffer.alloc(trailSize * trailSize);
  const ceiling = peak * 0.15;
  for (let i = 0; i < trails.length; i += 1) gray[i] = Math.round(Math.min(1, trails[i] / ceiling) * 255);
  const blurred = await sharp(gray, { raw: { width: trailSize, height: trailSize, channels: 1 } }).blur(0.8).raw().toBuffer();
  const size = 640;
  const rgba = Buffer.alloc(size * size * 4);
  const field = new Float32Array(blurred.length);
  for (let i = 0; i < blurred.length; i += 1) field[i] = blurred[i] / 255;
  for (let py = 0; py < size; py += 1) {
    const ty = (py / (size - 1)) * (trailSize - 1);
    for (let px = 0; px < size; px += 1) {
      const value = sample(field, trailSize, (px / (size - 1)) * (trailSize - 1), ty);
      const core = Math.min(1, smoothstep(0.2, 0.45, value) * 0.85 + smoothstep(0.62, 0.9, value) * 0.3);
      if (core < 0.08) continue;
      const index = (py * size + px) * 4;
      const white = Math.round(core * 255);
      rgba[index] = white;
      rgba[index + 1] = white;
      rgba[index + 2] = white;
      rgba[index + 3] = 255;
    }
  }
  await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toFile(file);
}

async function one(id: string, run: number, file: string) {
  const entries = JSON.parse(readFileSync(`public/demo/skill1/${id}/entries.json`, "utf8")) as Entry[];
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
  const sim = createSimulation(translation, entry.seed, Math.max(1, entry.agents), 32);
  sim.maxIterations = Math.max(DISPLAY_ITERATIONS, 520);
  const random = mulberry32(entry.seed ^ 0x9e3779b9);
  const controls = { ...slime, diffusion: Math.min(slime.diffusion, 0.04) };
  stepMany(sim, translation, random, 280, controls.decay, controls, false);
  await paint(sim.displayTrails ?? sim.trails, sim.trailSize, file);
  console.log(id, entry.run, "agents", entry.agents, "iter", sim.iteration);
}

async function main() {
  mkdirSync("C:/Users/julie/AppData/Local/Temp/sim-survey", { recursive: true });
  const jobs: Array<[string, number]> = [
    ["open-hall", 2],
    ["undulated", 2],
    ["topographic-ground-field", 9],
    ["terraced", 12],
  ];
  for (const [id, run] of jobs) {
    await one(id, run, `C:/Users/julie/AppData/Local/Temp/sim-survey/${id}-${run}.png`);
  }
}

void main();
