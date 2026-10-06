/**
 * Read-only Skill 1 variation audit.
 * Mirrors the planner call sequence in origin/main 6753fd4 run-grid realizeRun.
 * Does not change runtime behavior.
 */
import { writeFileSync } from "node:fs";
import { TYPOLOGIES } from "../lib/catalog";
import { mulberry32 } from "../lib/physarum";
import { createSimulation, stepMany } from "../lib/skill1/engine";
import {
  DISPLAY_ITERATIONS,
  FIELD_SIZE,
  MIN_AGENT_COUNT,
  robustTrailPeak,
} from "../lib/skill1/maps";
import {
  agentsFromCompressedSequential,
  attractorsFromCompressedSequential,
  foodFromAttractors,
  paramsFromCompressedSequential,
  planCompressedSequential,
  recipeFromCompressedSequential,
  slimeFromCompressedSequential,
} from "../lib/skill1/run-compressed-sequential";
import {
  agentsFromContinuousHall,
  attractorsFromContinuousHall,
  paramsFromContinuousHall,
  planContinuousHall,
  recipeFromContinuousHall,
  slimeFromContinuousHall,
} from "../lib/skill1/run-continuous-hall";
import {
  agentsFromLinearGallery,
  attractorsFromLinearGallery,
  paramsFromLinearGallery,
  planLinearGallery,
  recipeFromLinearGallery,
  slimeFromLinearGallery,
} from "../lib/skill1/run-linear-gallery";
import {
  attractorsFromVerticalVoidPlan,
  planVerticalVoid,
  slimeFromVerticalVoidPlan,
} from "../lib/skill1/run-morphology";
import {
  agentsFromTopographic,
  attractorsFromTopographic,
  paramsFromTopographic,
  planTopographicGroundField,
  recipeFromTopographic,
  slimeFromTopographic,
} from "../lib/skill1/run-topographic-ground-field";
import { runAttractorsFor } from "../lib/skill1/run-variants";
import {
  agentCountFromDensity,
  densityFromTranslation,
  slimeControlsFromTranslation,
  varySlimeControls,
  type SlimeControls,
} from "../lib/skill1/slime-controls";
import { translateArchetype } from "../lib/skill1/translate";
import type { BiologicalTranslation, FieldAttractor, FieldSnapshot } from "../lib/skill1/types";

const SEED = 42;
const ATTEMPT = 0;
const INDEX = 0;
const CHECKS = [80, 200, 420, 600];

function trailScaleFor(id: string) {
  if (id === "topographic-ground-field") return 32;
  if (id === "compressed-sequential") return 32;
  if (id === "linear-gallery") return 16;
  return 8;
}

function translationForRun(base: BiologicalTranslation, seed: number, index: number, attempt = 0): BiologicalTranslation {
  const attractors = runAttractorsFor(base.archetypeId, seed, base.recipe.attractors ?? [], undefined, attempt, index);
  const first = attractors[0] ?? { x: 10, y: 10, kind: "point" as const, radius: 1.4, strength: 1 };
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

function realizeRun(base: BiologicalTranslation, slimeBase: SlimeControls, seed: number, attempt = 0, index = 0) {
  const id = base.archetypeId;
  const compressedPlan = id === "compressed-sequential" ? planCompressedSequential(seed, attempt, index) : null;
  const hallPlan = id === "continuous-hall" ? planContinuousHall(seed, attempt, index) : null;
  const groundPlan = id === "topographic-ground-field" ? planTopographicGroundField(seed, attempt, index) : null;
  const galleryPlan = id === "linear-gallery" ? planLinearGallery(seed, attempt, index) : null;
  const voidPlan = id === "vertical-void" ? planVerticalVoid(seed, attempt) : null;
  const runTranslation = translationForRun(base, seed, index, attempt);
  const tuned = compressedPlan
    ? {
        ...runTranslation,
        params: paramsFromCompressedSequential(base.params, compressedPlan),
        recipe: {
          ...recipeFromCompressedSequential(runTranslation.recipe, compressedPlan, seed ^ (attempt * 131)),
          attractors: attractorsFromCompressedSequential(compressedPlan, seed, attempt),
          attractorFixed: true,
          attractorsOnly: compressedPlan.attractorsOnly,
        },
      }
    : hallPlan
      ? {
          ...runTranslation,
          topology: hallPlan.figure === "void-cut" ? ("around-absence" as const) : ("open-network" as const),
          params: paramsFromContinuousHall(base.params, hallPlan),
          recipe: {
            ...recipeFromContinuousHall(runTranslation.recipe, hallPlan, seed ^ (attempt * 131)),
            attractors: attractorsFromContinuousHall(hallPlan, seed, attempt),
          },
        }
      : groundPlan
        ? {
            ...runTranslation,
            params: paramsFromTopographic(base.params, seed ^ (attempt * 131)),
            recipe: {
              ...recipeFromTopographic(runTranslation.recipe, seed ^ (attempt * 131)),
              attractors: attractorsFromTopographic(groundPlan, seed, attempt),
              attractorFixed: true,
              attractorsOnly: true,
            },
          }
        : galleryPlan
          ? {
              ...runTranslation,
              params: paramsFromLinearGallery(base.params, seed ^ (attempt * 131)),
              recipe: {
                ...recipeFromLinearGallery(runTranslation.recipe, seed ^ (attempt * 131)),
                attractors: attractorsFromLinearGallery(galleryPlan, seed, attempt),
                attractorFixed: true,
                attractorsOnly: true,
              },
            }
          : runTranslation;
  const marks = tuned.recipe.attractors ?? [];
  const slime =
    voidPlan
      ? {
          ...slimeFromVerticalVoidPlan(slimeBase, voidPlan, seed ^ (attempt * 131)),
          foodPoints: marks.map((mark) => ({ x: mark.x, y: mark.y })),
        }
      : compressedPlan
        ? {
            ...slimeFromCompressedSequential(slimeBase, compressedPlan, seed ^ (attempt * 131)),
            foodPoints: foodFromAttractors(marks),
          }
        : hallPlan
          ? {
              ...slimeFromContinuousHall(slimeBase, hallPlan, seed ^ (attempt * 131)),
              foodPoints: (() => {
                if (hallPlan.figure !== "void-cut") return foodFromAttractors(marks);
                const banks = foodFromAttractors(marks.filter((item) => !item.hole && item.kind !== "ring"));
                return banks.length ? banks : [{ x: hallPlan.cx, y: hallPlan.cy }];
              })(),
            }
          : groundPlan
            ? {
                ...slimeFromTopographic(slimeBase, groundPlan, seed ^ (attempt * 131)),
                foodPoints: foodFromAttractors(marks),
              }
            : galleryPlan
              ? {
                  ...slimeFromLinearGallery(slimeBase, galleryPlan, seed ^ (attempt * 131)),
                  foodPoints: foodFromAttractors(marks),
                }
              : {
                  ...varySlimeControls(slimeBase, seed ^ (attempt * 9973), id),
                  foodPoints: marks.map((mark) => ({ x: mark.x, y: mark.y })),
                };
  const rng = mulberry32(seed ^ 0x6d2b79f5 ^ attempt);
  const baseAgents = agentCountFromDensity(densityFromTranslation(base)) + (rng() - 0.5) * 36;
  const plannedAgents = compressedPlan
    ? agentsFromCompressedSequential(compressedPlan, seed ^ attempt)
    : hallPlan
      ? agentsFromContinuousHall(hallPlan, seed ^ attempt)
      : groundPlan
        ? agentsFromTopographic(groundPlan, seed ^ attempt)
        : galleryPlan
          ? agentsFromLinearGallery(galleryPlan, seed ^ attempt)
          : baseAgents;
  const agents = Math.round(Math.min(600, Math.max(MIN_AGENT_COUNT, plannedAgents)));
  const planner = compressedPlan
    ? "planCompressedSequential"
    : hallPlan
      ? "planContinuousHall"
      : groundPlan
        ? "planTopographicGroundField"
        : galleryPlan
          ? "planLinearGallery"
          : voidPlan
            ? "planVerticalVoid"
            : "runAttractorsFor+varySlimeControls";
  const plan = compressedPlan ?? hallPlan ?? groundPlan ?? galleryPlan ?? voidPlan;
  return { seed, agents, slime, translation: tuned, planner, plan, marks };
}

function round(value: number, digits = 3) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function measure(trails: ArrayLike<number>, trailSize: number, attractors: FieldAttractor[]) {
  const peak = robustTrailPeak(trails);
  const cut = Math.max(0.012, peak * 0.18);
  let occupied = 0;
  let mass = 0;
  let sx = 0;
  let sy = 0;
  let minX = trailSize;
  let minY = trailSize;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < trails.length; i += 1) {
    const value = trails[i];
    mass += value;
    if (value < cut) continue;
    occupied += 1;
    const x = i % trailSize;
    const y = Math.floor(i / trailSize);
    sx += x;
    sy += y;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const cx = occupied ? sx / occupied : trailSize / 2;
  const cy = occupied ? sy / occupied : trailSize / 2;
  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  const bins = new Array<number>(8).fill(0);
  for (let i = 0; i < trails.length; i += 1) {
    if (trails[i] < cut) continue;
    const x = (i % trailSize) - cx;
    const y = Math.floor(i / trailSize) - cy;
    cxx += x * x;
    cyy += y * y;
    cxy += x * y;
    const bin = ((Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
    bins[bin] += 1;
  }
  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.max(0, trace * trace * 0.25 - det);
  const l1 = trace * 0.5 + Math.sqrt(disc);
  const l2 = Math.max(1e-6, trace * 0.5 - Math.sqrt(disc));
  const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const width = occupied ? Math.max(1, maxX - minX + 1) : 1;
  const height = occupied ? Math.max(1, maxY - minY + 1) : 1;
  const grid = 20;
  const step = trailSize / grid;
  const seen = new Uint8Array(grid * grid);
  const on = (gx: number, gy: number) => {
    const x0 = Math.floor(gx * step);
    const y0 = Math.floor(gy * step);
    const x1 = Math.min(trailSize, Math.ceil((gx + 1) * step));
    const y1 = Math.min(trailSize, Math.ceil((gy + 1) * step));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) if (trails[y * trailSize + x] >= cut) return true;
    }
    return false;
  };
  const flood = (sx0: number, sy0: number) => {
    const stack = [sx0 + sy0 * grid];
    seen[sx0 + sy0 * grid] = 1;
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % grid;
      const y = Math.floor(i / grid);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
        const j = nx + ny * grid;
        if (seen[j] || !on(nx, ny)) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
  };
  let components = 0;
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      if (seen[gx + gy * grid] || !on(gx, gy)) continue;
      components += 1;
      flood(gx, gy);
    }
  }
  const holes = attractors.filter((item) => item.hole || item.kind === "ring").length;
  const lines = attractors.filter((item) => item.kind === "line" || item.kind === "curve").length;
  const branches = bins.filter((count) => count > occupied * 0.04).length;
  return {
    occupied: round(occupied / Math.max(1, trails.length), 4),
    mass: round(mass / Math.max(1, trails.length), 4),
    cx: round((cx / trailSize) * FIELD_SIZE, 2),
    cy: round((cy / trailSize) * FIELD_SIZE, 2),
    anisotropy: round(l1 / l2, 3),
    angle: round(angle, 3),
    aspect: round(width / height, 3),
    fill: round(occupied / (width * height), 3),
    components,
    branches,
    holes,
    lines,
    marks: attractors.length,
  };
}

function vector(m: ReturnType<typeof measure>, lateShift: number, lateOccupy: number, converged: boolean) {
  return [
    m.occupied,
    Math.min(6, m.anisotropy) / 6,
    (m.angle + Math.PI) / (Math.PI * 2),
    m.cx / FIELD_SIZE,
    m.cy / FIELD_SIZE,
    Math.min(8, m.components) / 8,
    Math.min(8, m.branches) / 8,
    Math.min(8, m.holes) / 8,
    Math.min(12, m.lines) / 12,
    Math.min(4, m.aspect) / 4,
    m.fill,
    Math.min(1, lateShift / 8),
    Math.min(1, lateOccupy),
    converged ? 1 : 0,
  ];
}

function dist(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

function attractorBrief(marks: FieldAttractor[]) {
  const kinds: Record<string, number> = {};
  let holes = 0;
  for (const mark of marks) {
    kinds[mark.kind] = (kinds[mark.kind] ?? 0) + 1;
    if (mark.hole || mark.kind === "ring") holes += 1;
  }
  return { count: marks.length, kinds, holes };
}

async function main() {
  const rows: Array<Record<string, unknown>> = [];
  for (const typology of TYPOLOGIES) {
    for (const archetype of typology.archetypes) {
      const started = Date.now();
      const base = translateArchetype(archetype.id);
      const slimeBase = slimeControlsFromTranslation(base);
      const run = realizeRun(base, slimeBase, SEED, ATTEMPT, INDEX);
      const scale = trailScaleFor(archetype.id);
      const state = createSimulation(run.translation, run.seed, run.agents, scale);
      state.maxIterations = DISPLAY_ITERATIONS;
      const rng = mulberry32(run.seed ^ 0x9e3779b9);
      const slime = {
        ...run.slime,
        diffusion:
          archetype.id === "continuous-hall" ||
          archetype.id === "compressed-sequential" ||
          archetype.id === "topographic-ground-field" ||
          archetype.id === "linear-gallery"
            ? run.slime.diffusion
            : Math.min(run.slime.diffusion, 0.04),
      };
      const frames: Array<Record<string, unknown>> = [];
      let cursor = 0;
      for (const at of CHECKS) {
        const steps = at - cursor;
        if (steps > 0) stepMany(state, run.translation, rng, steps, slime.decay, slime, false);
        cursor = state.iteration;
        const shot = measure(state.trails, state.trailSize, run.marks);
        frames.push({
          iteration: state.iteration,
          converged: state.converged,
          delta: round(state.totalDelta, 5),
          streak: state.streak,
          ...shot,
        });
      }
      const early = frames[0] as ReturnType<typeof measure> & { cx: number; cy: number; occupied: number };
      const mid = frames[2] as typeof early;
      const late = frames[3] as typeof early;
      const shift = Math.hypot(late.cx - early.cx, late.cy - early.cy);
      const occupyChange = Math.abs(late.occupied - mid.occupied);
      rows.push({
        typology: typology.name,
        archetype: archetype.name,
        id: archetype.id,
        planner: run.planner,
        plan: run.plan,
        sourceCorner: run.translation.recipe.sourceCorner,
        source: state.source,
        attractor: state.attractor,
        attractors: attractorBrief(run.marks),
        recipe: {
          sourceCorner: run.translation.recipe.sourceCorner,
          clustering: round(run.translation.recipe.clustering),
          isolationRadius: round(run.translation.recipe.isolationRadius),
          enclosureCollar: round(run.translation.recipe.enclosureCollar),
          approachWidth: round(run.translation.recipe.approachWidth),
          coreExposure: round(run.translation.recipe.coreExposure),
          attractorsOnly: Boolean(run.translation.recipe.attractorsOnly),
          topology: run.translation.topology,
        },
        behavior: run.translation.behavior,
        densitySlider: densityFromTranslation(base),
        agents: run.agents,
        speed: round(slime.stepSize),
        decay: round(slime.decay, 4),
        exploration: {
          label: run.translation.behavior.exploration,
          randomness: round(slime.randomness),
          sensorDistance: round(slime.sensorDistance),
          sensorAngle: round(slime.sensorAngle),
        },
        reinforcement: {
          label: run.translation.behavior.reinforcement,
          deposit: round(slime.deposit, 4),
          trailInfluence: round(slime.trailInfluence),
          persistence: round(slime.persistence),
        },
        directionalBias: round(run.translation.params.directionalBias),
        turnAngle: round(slime.turnAngle),
        resistance: round(slime.resistance),
        diffusion: round(slime.diffusion, 4),
        trailScale: scale,
        frames,
        migration: round(shift, 3),
        lateOccupyChange: round(occupyChange, 4),
        ms: Date.now() - started,
      });
      console.log(`${archetype.id} ${run.planner} ${Date.now() - started}ms agents=${run.agents}`);
    }
  }

  const finals = rows.map((row) => {
    const frames = row.frames as Array<ReturnType<typeof measure> & { occupied: number; cx: number; cy: number }>;
    return vector(frames[3], row.migration as number, row.lateOccupyChange as number, Boolean((frames[3] as { converged?: boolean }).converged));
  });
  const nearest = rows.map((row, i) => {
    let best = -1;
    let bestD = Infinity;
    const pairs: Array<{ id: string; d: number }> = [];
    for (let j = 0; j < rows.length; j += 1) {
      if (i === j) continue;
      const d = dist(finals[i], finals[j]);
      pairs.push({ id: String(rows[j].id), d: round(d, 3) });
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    return { id: row.id, nearest: rows[best]?.id, distance: round(bestD, 3), closest: pairs.slice(0, 3) };
  });

  const output = {
    seed: SEED,
    attempt: ATTEMPT,
    index: INDEX,
    iterations: CHECKS,
    displayIterations: DISPLAY_ITERATIONS,
    rows,
    nearest,
  };
  writeFileSync("tmp/skill1-variation-audit.json", JSON.stringify(output, null, 2));
  console.log(JSON.stringify(nearest, null, 2));
}

main();
