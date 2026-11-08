/**
 * Presentation recording for the Physarum Logic chapter.
 * Replays Vertical Void run 23 the same way as `capture-void-growth.ts`, then paints
 * each shown iteration with the filament shader of the stored plate and ends on that plate.
 * Does not change the engine, the catalog, or the saved plate.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import sharp from "sharp";
import { createSimulation, stepMany, trailPeak } from "../lib/skill1/engine";
import { DISPLAY_ITERATIONS, FIELD_SIZE, robustTrailPeak } from "../lib/skill1/maps";
import { attractorsAsKind, runAttractorsFor } from "../lib/skill1/run-variants";
import { slimeControlsFromTranslation, varySlimeControls, type SlimeControls } from "../lib/skill1/slime-controls";
import { translateArchetype } from "../lib/skill1/translate";
import type { AttractorKind, BiologicalBehavior, BiologicalParams, BiologicalTranslation, SpatialRecipe, TopologyKind } from "../lib/skill1/types";
import { mulberry32 } from "../lib/physarum";
import { renderPlateFrames } from "./present-plate-frames";

const COLUMNS = 20;
const RUN_TRAIL_SCALE = 8;
const SIZE = 1024;
const DELAY = 420;
const ROW_KINDS: AttractorKind[] = ["point", "ring", "line", "curve"];
const PLATE = "public/demo/skill1/vertical-void/vertical-void-410552-1790449934138-22.webp";
const OUT = "public/assets/skill0/void-growth-2.gif";
/** Iterations that carry the growth from the first deposit to the stored plate. */
const SHOWN_AT = [0, 2, 4, 6, 8, 12, 18, 28, 44, 68, 100, 150, 210, 290, 380, 480, 560];

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

const entries = JSON.parse(readFileSync("public/demo/skill1/vertical-void/entries.json", "utf8")) as Entry[];
const entry = entries.find((item) => item.run === 23);
if (!entry) throw new Error("missing run 23");

const variant = rebuild(entry);
const state = createSimulation(variant.translation, variant.seed, variant.agents, RUN_TRAIL_SCALE);
state.maxIterations = DISPLAY_ITERATIONS;
const rng = mulberry32(variant.seed ^ 0x9e3779b9);
const wanted = new Set(SHOWN_AT);
const samples = new Map<number, number[]>();
const started = Date.now();
for (let iteration = 0; iteration <= DISPLAY_ITERATIONS; iteration += 1) {
  const steps = iteration - state.iteration;
  if (steps > 0) stepMany(state, variant.translation, rng, steps, variant.slime.decay, variant.slime, false);
  if (wanted.has(iteration) || iteration === DISPLAY_ITERATIONS) samples.set(iteration, state.trails.slice());
}
const finished = samples.get(DISPLAY_ITERATIONS);
if (!finished) throw new Error("missing final trails");
const peak = Math.max(1.4, robustTrailPeak(finished));
console.log("catalog peak", peak.toFixed(3), "raw", trailPeak(state).toFixed(3));
const attractors = variant.translation.recipe.attractors ?? [];
console.log("replay", `${Date.now() - started}ms`, "peak", peak.toFixed(3), "samples", samples.size);

function stampSource(rgba: Uint8Array, source: { x: number; y: number }) {
  const cx = (source.x / FIELD_SIZE) * SIZE;
  const cy = SIZE - (source.y / FIELD_SIZE) * SIZE;
  const color = [15, 115, 119];
  const dot = (radius: number, alpha: number) => {
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
  };
  dot(8, 0.9);
  dot(3, 0.45);
}

const safePeak = Math.max(peak, 0.0001);
const normalize = (trails: number[]) => trails.map((value) => Math.pow(Math.max(0, value / safePeak), 0.82));

async function writeFrames() {
  const shown = process.argv.includes("--probe") ? [] : SHOWN_AT;
  const rendered = await renderPlateFrames(
    [...shown, DISPLAY_ITERATIONS].map((iteration) => {
      const trails = samples.get(iteration);
      if (!trails) throw new Error(`missing iteration ${iteration}`);
      return { trails: normalize(trails), trailSize: state.trailSize };
    }),
    attractors,
    SIZE,
  );
  const replay = rendered.pop();
  if (!replay) throw new Error("missing replay frame");
  const painted = rendered;
  for (const frame of [...painted, replay]) stampSource(frame, state.source);
  const plate = await sharp(PLATE).resize(SIZE, SIZE, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  mkdirSync("C:/Users/User/AppData/Local/Temp/field-match-mockups", { recursive: true });
  await sharp(Buffer.from(replay), { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile("C:/Users/User/AppData/Local/Temp/field-match-mockups/replay-600.png");
  await sharp(Buffer.from(plate), { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile("C:/Users/User/AppData/Local/Temp/field-match-mockups/plate-512.png");
  painted.push(new Uint8Array(plate));
  const preview = await sharp({
    create: { width: SIZE * painted.length, height: SIZE, channels: 4, background: "#000" },
  })
    .composite(painted.map((frame, index) => ({ input: Buffer.from(frame), raw: { width: SIZE, height: SIZE, channels: 4 }, left: index * SIZE, top: 0 })))
    .png()
    .toBuffer();
  mkdirSync("C:/Users/User/AppData/Local/Temp/field-match-mockups", { recursive: true });
  writeFileSync("C:/Users/User/AppData/Local/Temp/field-match-mockups/growth-strip.png", preview);
  const palette = quantize(painted[painted.length - 1], 256);
  const gif = GIFEncoder();
  painted.forEach((rgba, frame) => {
    gif.writeFrame(applyPalette(rgba, palette), SIZE, SIZE, { palette: frame === 0 ? palette : undefined, delay: DELAY, repeat: 0 });
  });
  gif.finish();
  if (process.argv.includes("--probe")) {
    console.log("probe only", `${Date.now() - started}ms`);
    return;
  }
  writeFileSync(OUT, Buffer.from(gif.bytes()));
  console.log(OUT, painted.length, "frames", `${Date.now() - started}ms`);
}

void writeFrames();
