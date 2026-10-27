/**
 * Presentation loops for Step 03.
 * Replays four saved Vertical Void catalog runs through the existing stepper
 * and writes low-resolution GIFs. Does not change the engine or the catalog.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { createSimulation, stepMany, trailPeak } from "../lib/skill1/engine";
import { DISPLAY_ITERATIONS, FIELD_SIZE } from "../lib/skill1/maps";
import { attractorsAsKind, runAttractorsFor } from "../lib/skill1/run-variants";
import { slimeControlsFromTranslation, varySlimeControls, type SlimeControls } from "../lib/skill1/slime-controls";
import { translateArchetype } from "../lib/skill1/translate";
import type { AttractorKind, BiologicalBehavior, BiologicalParams, BiologicalTranslation, FieldAttractor, SpatialRecipe, TopologyKind } from "../lib/skill1/types";
import { mulberry32 } from "../lib/physarum";

const COLUMNS = 20;
const RUN_TRAIL_SCALE = 8;
const SIZE = 176;
const FRAMES = 16;
const DELAY = 480;
const ROW_KINDS: AttractorKind[] = ["point", "ring", "line", "curve"];
const RUNS = [28, 23, 58, 69];
/** Stop each loop when the painted colony reaches this share of the finished plate. */
const SHOWN = 0.9;
const EARLY = 40;

type Entry = {
  id: string;
  archetypeId: string;
  archetypeName?: string;
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
    recipe: {
      ...base.recipe,
      attractorFixed: true,
      attractorsOnly: true,
      attractor: { x: first.x, y: first.y },
      attractors,
    },
  };
}

function rebuild(entry: Entry) {
  const base = translateArchetype(entry.archetypeId);
  const runTranslation = translationForRun(base, entry.seed, Math.max(0, entry.run - 1));
  const marks = runTranslation.recipe.attractors ?? [];
  const slime = entry.slime ?? {
    ...varySlimeControls(slimeControlsFromTranslation(base), entry.seed, entry.archetypeId),
    foodPoints: marks.map((mark) => ({ x: mark.x, y: mark.y })),
  };
  return {
    seed: entry.seed,
    agents: entry.agents,
    slime: { ...slime, diffusion: Math.min(slime.diffusion, 0.04) },
    translation: {
      ...runTranslation,
      params: entry.params ?? runTranslation.params,
      behavior: entry.behavior ?? runTranslation.behavior,
      recipe: entry.recipe ?? runTranslation.recipe,
      topology: entry.topology ?? runTranslation.topology,
      archetypeName: entry.archetypeName ?? runTranslation.archetypeName,
    },
  };
}

function bilerp(field: Float32Array, ts: number, x: number, y: number) {
  const x0 = Math.max(0, Math.min(ts - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(ts - 1, Math.floor(y)));
  const x1 = Math.min(ts - 1, x0 + 1);
  const y1 = Math.min(ts - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = field[y0 * ts + x0];
  const b = field[y0 * ts + x1];
  const c = field[y1 * ts + x0];
  const d = field[y1 * ts + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/** Same colony colors as the Skill 1 plan plate: white veins, copper body, teal near the attractor. */
function paint(trails: number[], trailSize: number, peak: number, attractors: FieldAttractor[], source: { x: number; y: number }) {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  const field = new Float32Array(trailSize * trailSize);
  const safePeak = Math.max(peak, 0.0001);
  for (let i = 0; i < field.length; i += 1) field[i] = Math.pow(Math.max(0, trails[i] / safePeak), 0.82);
  const last = SIZE - 1;
  const scale = trailSize / FIELD_SIZE;
  for (let py = 0; py < SIZE; py += 1) {
    const fy = (1 - py / last) * FIELD_SIZE;
    for (let px = 0; px < SIZE; px += 1) {
      const fx = (px / last) * FIELD_SIZE;
      const tx = fx * scale;
      const ty = fy * scale;
      const v = bilerp(field, trailSize, tx, ty);
      const around = 0.25 * (
        bilerp(field, trailSize, tx + 1, ty) +
        bilerp(field, trailSize, tx - 1, ty) +
        bilerp(field, trailSize, tx, ty + 1) +
        bilerp(field, trailSize, tx, ty - 1)
      );
      const ridge = Math.max(0, v - around * 0.62);
      const gx = bilerp(field, trailSize, tx + 1, ty) - bilerp(field, trailSize, tx - 1, ty);
      const gy = bilerp(field, trailSize, tx, ty + 1) - bilerp(field, trailSize, tx, ty - 1);
      const glen = Math.hypot(gx, gy);
      const ax = glen > 1e-6 ? -gy / glen : 1;
      const ay = glen > 1e-6 ? gx / glen : 0;
      let tissue = v;
      if (v > 0.04 || ridge > 0.005) {
        let linked = v;
        for (let k = 1; k <= 6; k += 1) {
          linked = Math.max(
            linked,
            bilerp(field, trailSize, tx + ax * k * 1.6, ty + ay * k * 1.6),
            bilerp(field, trailSize, tx - ax * k * 1.6, ty - ay * k * 1.6),
          );
        }
        tissue = Math.max(v, linked * 0.96);
      }
      const membrane = Math.min(1, Math.max(0, (tissue - 0.14) / 0.14));
      const tube = Math.min(1, Math.max(0, (tissue - 0.045) / 0.075)) * Math.min(1, Math.max(0, (ridge - 0.004) / 0.012));
      const hair = Math.min(1, Math.max(0, (tissue - 0.018) / 0.022)) * Math.min(1, Math.max(0, (ridge - 0.008) / 0.012));
      const mask = Math.max(membrane, tube, hair);
      const i = (py * SIZE + px) * 4;
      rgba[i + 3] = 255;
      if (mask < 0.03) continue;
      const body = Math.min(1, tissue);
      const vein = Math.min(1, Math.max(0, (body - 0.08) / 0.26));
      let nearest = 1;
      for (const mark of attractors) {
        const dx = fx / FIELD_SIZE - mark.x / FIELD_SIZE;
        const dy = fy / FIELD_SIZE - mark.y / FIELD_SIZE;
        let d = Math.hypot(dx, dy);
        if (mark.kind === "ring") d = Math.abs(d - (mark.radius ?? 4) / FIELD_SIZE);
        nearest = Math.min(nearest, d);
      }
      const pull = nearest >= 0.16 ? 0 : 1 - nearest / 0.16;
      const core = Math.max(pull * Math.min(1, Math.max(0, (body - 0.08) / 0.24)), Math.min(1, Math.max(0, (body - 0.48) / 0.34)));
      const mixCore = core * (0.35 + body * 0.37);
      const alpha = mask;
      rgba[i] = Math.round(Math.min(1, ((1 * (1 - vein) + 0.78 * vein) * (1 - mixCore) + 0.059 * mixCore) * alpha) * 255);
      rgba[i + 1] = Math.round(Math.min(1, ((1 * (1 - vein) + 0.494 * vein) * (1 - mixCore) + 0.451 * mixCore) * alpha) * 255);
      rgba[i + 2] = Math.round(Math.min(1, ((1 * (1 - vein) + 0.373 * vein) * (1 - mixCore) + 0.467 * mixCore) * alpha) * 255);
    }
  }
  const unit = SIZE / FIELD_SIZE;
  const sx = source.x * unit;
  const sy = SIZE - source.y * unit;
  stamp(rgba, sx, sy, 5.5, [15, 115, 119], 0.85);
  stamp(rgba, sx, sy, 2.2, [15, 115, 119], 0.28);
  return rgba;
}

function stamp(rgba: Uint8Array, cx: number, cy: number, radius: number, color: number[], alpha: number) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(SIZE - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(SIZE - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      const i = (y * SIZE + x) * 4;
      rgba[i] = Math.round(rgba[i] * (1 - alpha) + color[0] * alpha);
      rgba[i + 1] = Math.round(rgba[i + 1] * (1 - alpha) + color[1] * alpha);
      rgba[i + 2] = Math.round(rgba[i + 2] * (1 - alpha) + color[2] * alpha);
    }
  }
}

function encode(frames: Uint8Array[], delay = DELAY) {
  const palette = quantize(frames[frames.length - 1], 64);
  const gif = GIFEncoder();
  frames.forEach((rgba, frame) => {
    gif.writeFrame(applyPalette(rgba, palette), SIZE, SIZE, { palette: frame === 0 ? palette : undefined, delay, repeat: 0 });
  });
  gif.finish();
  return Buffer.from(gif.bytes());
}

const entries = JSON.parse(readFileSync("public/demo/skill1/vertical-void/entries.json", "utf8")) as Entry[];
mkdirSync("public/assets/skill0", { recursive: true });

function inkOf(rgba: Uint8Array) {
  let ink = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] + rgba[i + 1] + rgba[i + 2] > 30) ink += 1;
  }
  return ink;
}

const requested = process.argv.slice(2);
const jobs = requested.length
  ? requested.map((id, slot) => {
      const entry = entries.find((item) => item.id === id);
      if (!entry) throw new Error(`missing entry ${id}`);
      return { entry, file: `public/assets/skill0/void-panel-${slot + 1}.gif` };
    })
  : RUNS.map((run, slot) => {
      const entry = entries.find((item) => item.run === run);
      if (!entry) throw new Error(`missing run ${run}`);
      return { entry, file: `public/assets/skill0/void-growth-${slot + 1}.gif` };
    });

jobs.forEach(({ entry, file }) => {
  const variant = rebuild(entry);
  const state = createSimulation(variant.translation, variant.seed, variant.agents, RUN_TRAIL_SCALE);
  state.maxIterations = DISPLAY_ITERATIONS;
  const rng = mulberry32(variant.seed ^ 0x9e3779b9);
  const samples: number[][] = [];
  const started = Date.now();
  for (let iteration = 0; iteration <= EARLY; iteration += 1) {
    const steps = iteration - state.iteration;
    if (steps > 0) stepMany(state, variant.translation, rng, steps, variant.slime.decay, variant.slime, false);
    samples.push(state.trails.slice());
  }
  const remain = DISPLAY_ITERATIONS - state.iteration;
  if (remain > 0) stepMany(state, variant.translation, rng, remain, variant.slime.decay, variant.slime, false);
  const peak = trailPeak(state);
  const attractors = variant.translation.recipe.attractors ?? [];
  const painted = samples.map((trails) => paint(trails, state.trailSize, peak, attractors, state.source));
  const finished = paint(state.trails, state.trailSize, peak, attractors, state.source);
  const goal = inkOf(finished) * SHOWN;
  let half = painted.findIndex((frame) => inkOf(frame) >= goal);
  if (half < 1) half = painted.length - 1;
  const frames = Array.from({ length: FRAMES }, (_, frame) => painted[Math.round((half * frame) / (FRAMES - 1))]);
  writeFileSync(file, encode(frames, requested.length ? 450 : DELAY));
  const share = Math.round((inkOf(painted[half]) / inkOf(finished)) * 100);
  console.log(file, entry.id, `${Date.now() - started}ms`, `stop at iteration ${half}`, `${share}%`);
});
