import { readFileSync } from "node:fs";
import { mulberry32 } from "../physarum";
import { createSimulation, stepMany } from "../skill1/engine";
import { translateArchetype } from "../skill1/translate";
import { measureMorphologyDetailed } from "./measurements";
import { buildPlanModel, type PlanModel } from "./plan-model";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const FORBIDDEN = [
  "height",
  "floor",
  "grounddatum",
  "verticallevel",
  "lowerenvelope",
  "above",
  "below",
  "plateelevation",
  "orientation",
  "sourcebottomup",
];

function keysOf(value: unknown, found: string[]) {
  if (!value || typeof value !== "object") return;
  if (ArrayBuffer.isView(value) || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    found.push(key);
    keysOf((value as Record<string, unknown>)[key], found);
  }
}

function masksEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function sameModel(a: PlanModel, b: PlanModel) {
  assert(a.domain.columns === b.domain.columns && a.domain.rows === b.domain.rows, "grid");
  assert(masksEqual(a.reinforcement.strong, b.reinforcement.strong), "strong mask");
  assert(masksEqual(a.reinforcement.connective, b.reinforcement.connective), "connective mask");
  assert(masksEqual(a.void.significant, b.void.significant), "void mask");
  assert(masksEqual(a.network.skeleton, b.network.skeleton), "skeleton");
  assert(a.network.endpoints.join(",") === b.network.endpoints.join(","), "endpoints");
  assert(a.network.branchPoints.join(",") === b.network.branchPoints.join(","), "branch points");
  assert(a.anchors.source.x === b.anchors.source.x && a.anchors.attractor.y === b.anchors.attractor.y, "anchors");
  assert(a.reinforcement.weakBandSupplied === false && b.reinforcement.weakBandSupplied === false, "weak band");
  for (let i = 0; i < a.reinforcement.relative.length; i += 1) {
    if (a.reinforcement.relative[i] !== b.reinforcement.relative[i]) {
      throw new Error(`relative trail diverged at ${i}`);
    }
  }
}

const source = readFileSync(new URL("./plan-model.ts", import.meta.url), "utf8");
assert(!source.includes("sectionTranslate"), "PlanModel must not call sectionTranslate");
assert(!source.includes("SectionModel"), "PlanModel must not depend on SectionModel");
assert(!source.includes("references/archetypes"), "PlanModel must not import reference PNGs");
assert(!source.includes(".png"), "PlanModel must not read PNG files");

const translation = translateArchetype("void-field");
const seed = 0x51c11;
const rng = mulberry32(seed ^ 0x9e3779b9);
const state = createSimulation(translation, seed, 180);
state.maxIterations = 80;
stepMany(state, translation, rng, 80, 0.986);
const morphology = measureMorphologyDetailed(state);

const trailSample = state.trails.slice(0, 8);
const massSample = morphology.overlays.mass.slice(0, 8);
const meanDensity = morphology.measurements.activity.meanDensity;
const overlayMass = morphology.overlays.mass;
const overlayVoid = morphology.overlays.significantVoid;

const plan = buildPlanModel(state, morphology);

assert(plan.domain.columns === state.trailSize, "columns must match trail grid");
assert(plan.domain.rows === state.trailSize, "rows must match trail grid");
assert(plan.domain.columns === morphology.overlays.width, "columns must match overlay width");
assert(plan.domain.rows === morphology.overlays.height, "rows must match overlay grid extent");
assert(plan.reinforcement.relative.length === state.trails.length, "relative trail length");
assert(plan.anchors.attraction.columns === state.size, "attraction grid");
assert(plan.anchors.source.x === state.source.x && plan.anchors.source.y === state.source.y, "source");
assert(plan.anchors.attractor.x === state.attractor.x && plan.anchors.attractor.y === state.attractor.y, "attractor");

const keys: string[] = [];
keysOf(plan, keys);
for (const key of keys) {
  const folded = key.toLowerCase();
  assert(!FORBIDDEN.includes(folded), `forbidden plan key: ${key}`);
  assert(folded !== "z", `forbidden plan key: ${key}`);
}

assert(masksEqual(plan.void.significant, overlayVoid), "significant void evidence must be copied");
assert(plan.void.significantVoidCount === morphology.measurements.void.significantVoidCount, "void count");

let strong = 0;
let connective = 0;
for (let i = 0; i < plan.reinforcement.strong.length; i += 1) {
  if (plan.reinforcement.strong[i]) {
    strong += 1;
    assert(plan.reinforcement.connective[i] === 0, "strong and connective must be disjoint");
    assert(
      plan.reinforcement.relative[i] + 1e-9 >= plan.reinforcement.massMinRelative,
      "strong cells must stay in the existing mass band",
    );
  }
  if (plan.reinforcement.connective[i]) {
    connective += 1;
    assert(
      plan.reinforcement.relative[i] < plan.reinforcement.massMinRelative &&
        plan.reinforcement.relative[i] + 1e-9 >= plan.reinforcement.voidMaxRelative,
      "connective cells must stay between the existing cutoffs",
    );
  }
}
assert(plan.reinforcement.weakBandSupplied === false, "no invented weak band");
assert(strong > 0, "real simulation should produce some mass evidence");

const again = buildPlanModel(state, morphology);
sameModel(plan, again);

for (let i = 0; i < trailSample.length; i += 1) {
  assert(state.trails[i] === trailSample[i], "SimulationState trails mutated");
  assert(morphology.overlays.mass[i] === massSample[i], "measurement overlay mutated");
}
assert(morphology.measurements.activity.meanDensity === meanDensity, "measurements mutated");
assert(morphology.overlays.mass === overlayMass, "mass overlay buffer replaced");
assert(morphology.overlays.significantVoid === overlayVoid, "void overlay buffer replaced");
assert(plan.reinforcement.strong !== overlayMass, "plan must copy the mass mask");

console.log(
  JSON.stringify(
    {
      columns: plan.domain.columns,
      rows: plan.domain.rows,
      strong,
      connective,
      weakBandSupplied: plan.reinforcement.weakBandSupplied,
      voidComponents: plan.void.components.length,
      massComponents: plan.mass.components.length,
      endpoints: plan.network.endpoints.length,
      branchPoints: plan.network.branchPoints.length,
    },
    null,
    2,
  ),
);
console.log("Skill 2 PlanModel stays XY, copies existing evidence, and does not call the section pipeline.");
