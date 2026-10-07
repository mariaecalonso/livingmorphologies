import { continuationRecipesFor, modulateEmphasis, type ContinuationFocus } from "./continuation-recipes";
import { resolveAdaptiveHorizon } from "./adaptive-horizon";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);

const FOCUS_COUNTS: Record<ContinuationFocus, number> = {
  formal: 3,
  spatial: 3,
  atmospheric: 3,
  "formal+spatial": 3,
  "formal+atmospheric": 3,
  "spatial+atmospheric": 3,
  "formal+spatial+atmospheric": 6,
};

assert(typeof resolveAdaptiveHorizon === "function", "the adaptive horizon resolver is the later step-count source");

const set = continuationRecipesFor("vertical-void", 174);
const again = continuationRecipesFor("vertical-void", 174);
assert(set.recipes.length === 24, `expected 24 recipes, got ${set.recipes.length}`);
assert(JSON.stringify(set) === JSON.stringify(again), "recipes are not deterministic");
assert(set.descriptors.formal === "Dynamic Core", "formal descriptor");
assert(set.descriptors.spatial === "Open Threshold", "spatial descriptor");
assert(set.descriptors.atmospheric === "Visual Immersion", "atmospheric descriptor");
assert(Math.abs(set.strengths.formalBlend - 0.46) < 1e-12, "formal blend is the authored baseline");
assert(Math.abs(set.strengths.formalCore - 0.56) < 1e-12, "formal core is the authored baseline");
assert(Math.abs(set.strengths.spatialBlend - 0.40975) < 1e-12, "spatial blend is the authored baseline");
assert(Math.abs(set.strengths.spatialGain - 1.55) < 1e-12, "spatial gain is the authored baseline");
assert(Math.abs(set.strengths.protectBlend - 0.7) < 1e-12, "protect blend is the authored baseline");
assert(Math.abs(set.strengths.redirectShare - 0.775) < 1e-12, "redirect share is the authored baseline");

const counts = Object.fromEntries(Object.keys(FOCUS_COUNTS).map((focus) => [focus, 0])) as Record<ContinuationFocus, number>;
const seeds = new Set<number>();
const schedules = new Set<string>();
  const forbidden = ["trails", "checksum", "interior", "attractor", "geometry", "z0iteration", "mask"];
for (const recipe of set.recipes) {
  counts[recipe.focus] += 1;
  assert(!seeds.has(recipe.seed), `seed ${recipe.seed} is repeated`);
  seeds.add(recipe.seed);
  const scheduleKey = JSON.stringify(recipe.schedule);
  assert(!schedules.has(scheduleKey), `${recipe.id} repeats a schedule`);
  schedules.add(scheduleKey);
  assert(recipe.horizon === "adaptive", `${recipe.id} stores a numeric horizon`);
  assert(JSON.stringify(recipe.strengths) === JSON.stringify(set.strengths), `${recipe.id} replaced the authored baseline`);
  for (const family of ["formal", "spatial", "atmospheric"] as const) {
    const targets = recipe.schedule[family];
    const focused = recipe.families.includes(family);
    const flat = targets.every((value) => value === 1);
    assert(focused ? !flat : flat, `${recipe.id} ${family} focus does not match its schedule`);
  }
  const dumped = JSON.stringify(recipe).toLowerCase();
  for (const word of forbidden) assert(!dumped.includes(word), `${recipe.id} contains ${word}`);
}
for (const [focus, count] of Object.entries(FOCUS_COUNTS) as [ContinuationFocus, number][]) {
  assert(counts[focus] === count, `${focus} has ${counts[focus]} recipes`);
}
assert(seeds.size === 24 && schedules.size === 24, "seeds or schedules are not unique");
assert(modulateEmphasis(0, set.recipes[0].schedule.formal) === set.recipes[0].schedule.formal[0], "phase 1 starts on the first target");

const workspace = continuationRecipesFor("open-hall", 1);
const gathering = continuationRecipesFor("void-field", 1);
assert(workspace.recipes.length === 24 && gathering.recipes.length === 24, "other archetypes do not produce 24 recipes");
assert(workspace.descriptors.formal !== set.descriptors.formal, "workspace reused the lobby descriptor");
assert(gathering.strengths.formalBlend !== set.strengths.formalBlend, "gathering reused the lobby formal strength");
assert(!JSON.stringify(workspace).includes("vertical-void") && !JSON.stringify(gathering).includes("174"), "other archetypes inherited the fixture identity");

console.log(JSON.stringify(set, null, 2));
ok("24 continuation recipes");
