import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32 } from "../physarum";
import { ARCHETYPES } from "../skill1/archetypes";
import { legalOrientationsFor } from "../skill1/run-variants";
import { densityFromTranslation, slimeControlsFromTranslation } from "../skill1/slime-controls";
import { translateArchetype } from "../skill1/translate";
import type { BiologicalTranslation } from "../skill1/types";
import {
  EVOLUTION_CONFIG,
  createRun,
  mutateGenome,
  mutationSteps,
  runEvolution,
  sampleInitialGenomes,
  type EvaluateBatch,
  type EvolutionRun,
} from "./evolution";
import { EVALUATION_SEED, PREVIEW_SIZE, evaluateGenome, type GenomeEvaluation } from "./evolution-evaluate";
import {
  CANONICAL_GENOME,
  GENOME_BOUNDS,
  applyGenome,
  driftMagnitude,
  genomeKey,
  isLegalGenome,
  legalOrientations,
  type Genome,
} from "./genome";
import {
  crowdingDistances,
  dominates,
  nondominatedSort,
  rankPopulation,
  selectSurvivors,
  tournament,
  updateArchive,
  type Rankable,
} from "./nsga";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);

const ARCHETYPE_IDS = Object.values(ARCHETYPES).map((config) => config.id);
const EPS = 1e-12;
const item = (formal: number, spatial: number, atmospheric: number, feasible = true): Rankable => ({
  feasible,
  objectives: { formal, spatial, atmospheric },
});
const sameAngle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) <= 1e-9;
const withinBounds = (genome: Genome) =>
  driftMagnitude(genome) <= GENOME_BOUNDS.driftMagnitude + EPS &&
  genome.uniformRadiusScale >= GENOME_BOUNDS.radiusScaleMin &&
  genome.uniformRadiusScale <= GENOME_BOUNDS.radiusScaleMax;

function withoutPose(translation: BiologicalTranslation) {
  const recipe = { ...translation.recipe, attractor: null, attractors: null, attractorFixed: null };
  return JSON.stringify({ ...translation, recipe });
}

// ---------- legal orientations ----------
for (const id of ARCHETYPE_IDS) {
  const base = translateArchetype(id);
  const supported = legalOrientationsFor(id);
  const legal = legalOrientations(base);
  assert(legal.length > 0 && legal.some((angle) => sameAngle(angle, 0)), `${id}: 0 must stay legal`);
  assert(legal.every((angle) => supported.some((s) => sameAngle(s, angle))), `${id}: legal set outside supported set`);
}
assert(legalOrientations(translateArchetype("void-edge")).length === 1, "void-edge: only 0 stays inside the field");
const copy = legalOrientationsFor("void-field");
copy.push(99);
assert(!legalOrientationsFor("void-field").includes(99), "legalOrientationsFor must return a copy");
ok(
  `legal orientations: ${ARCHETYPE_IDS.map((id) => `${id}=${legalOrientations(translateArchetype(id)).length}`).join(" ")}`,
);

// ---------- Skill 1 biology locked under genome application ----------
{
  const rng = mulberry32(7);
  for (const id of ARCHETYPE_IDS) {
    const base = translateArchetype(id);
    const before = JSON.stringify(base);
    const [, ...samples] = sampleInitialGenomes(base, rng, { ...EVOLUTION_CONFIG, populationSize: 6 });
    for (const genome of samples) {
      const placed = applyGenome(base, genome);
      assert(JSON.stringify(base) === before, `${id}: base translation mutated`);
      assert(withoutPose(placed) === withoutPose(base), `${id}: non-pose translation fields changed`);
      assert(placed.recipe.attractorFixed === true, `${id}: attractor must be fixed`);
      const a = base.recipe.attractors ?? [];
      const b = placed.recipe.attractors ?? [];
      assert(a.length === b.length, `${id}: mark count changed`);
      a.forEach((mark, i) => {
        assert(mark.kind === b[i].kind, `${id}: mark kind changed`);
        assert(mark.strength === b[i].strength, `${id}: mark strength changed`);
        assert(mark.hole === b[i].hole, `${id}: ring hole changed`);
        if (mark.radius != null) {
          assert(Math.abs(b[i].radius! - mark.radius * genome.uniformRadiusScale) < 1e-9, `${id}: radius ratio changed`);
        }
      });
      assert(
        JSON.stringify({ ...slimeControlsFromTranslation(placed), foodPoints: [] }) ===
          JSON.stringify({ ...slimeControlsFromTranslation(base), foodPoints: [] }),
        `${id}: translated SlimeControls changed (food point aside, which follows the posed attractor)`,
      );
      assert(densityFromTranslation(placed) === densityFromTranslation(base), `${id}: density / agent count changed`);
    }
  }
  ok("Skill 1 params, behavior, ratings, topology, SlimeControls, density, mark count/kind/strength/radius ratios unchanged");
}

// ---------- G01 ----------
{
  for (const id of ARCHETYPE_IDS) {
    const base = translateArchetype(id);
    const legal = legalOrientations(base);
    const genomes = sampleInitialGenomes(base, mulberry32(11), EVOLUTION_CONFIG, legal);
    assert(genomes.length === 80, `${id}: G01 size ${genomes.length}`);
    assert(new Set(genomes.map(genomeKey)).size === 80, `${id}: G01 genomes not unique`);
    assert(genomeKey(genomes[0]) === genomeKey(CANONICAL_GENOME), `${id}: canonical genome missing`);
    for (const genome of genomes) {
      assert(Object.keys(genome).sort().join(",") === "driftX,driftY,orientation,uniformRadiusScale", `${id}: genome keys`);
      assert(withinBounds(genome), `${id}: G01 genome out of bounds`);
      assert(isLegalGenome(base, genome, legal), `${id}: G01 genome illegal`);
    }
    const outer = genomes.slice(1).filter((genome) => driftMagnitude(genome) > 0.6).length / 79;
    assert(outer > 0.55, `${id}: G01 drift biased toward the canonical pose (${outer.toFixed(2)} beyond 0.6)`);
  }
  const edged = translateArchetype("void-field");
  const pinned: BiologicalTranslation = {
    ...edged,
    recipe: {
      ...edged.recipe,
      attractors: [{ kind: "point", x: 0, y: 0, radius: 1 }, { kind: "point", x: 19, y: 19, radius: 1 }],
    },
  };
  let threw = "";
  try {
    sampleInitialGenomes(pinned, mulberry32(3), { ...EVOLUTION_CONFIG, maxSampleAttempts: 3 });
  } catch (error) {
    threw = String(error);
  }
  assert(threw.includes("G01"), "G01 sampling must fail clearly when no legal genome is found");
  ok("G01: 80 unique legal genomes per archetype, canonical first, rejection sampling (no shrink bias), clear failure");
}

// ---------- mutation ----------
{
  const steps = [2, 3, 4].map((g) => mutationSteps(g));
  assert(Math.abs(steps[0].driftStep - 0.3) < EPS && Math.abs(steps[0].radiusStep - 0.03) < EPS, "G02 steps");
  assert(steps.every((s, i) => i === 0 || (s.driftStep < steps[i - 1].driftStep && s.radiusStep < steps[i - 1].radiusStep)), "steps shrink");
  for (const id of ["void-field", "void-edge", "linear-gallery", "open-hall", "stepped-amphitheater"]) {
    const base = translateArchetype(id);
    const legal = legalOrientations(base);
    const rng = mulberry32(99);
    const parents: Genome[] = [
      ...sampleInitialGenomes(base, mulberry32(5), EVOLUTION_CONFIG, legal),
      ...legal.flatMap((orientation) =>
        [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({
          driftX: 1.2 * Math.cos((k * Math.PI) / 4),
          driftY: 1.2 * Math.sin((k * Math.PI) / 4),
          uniformRadiusScale: k % 2 ? 0.9 : 1.1,
          orientation,
        })),
      ),
    ].filter((genome) => isLegalGenome(base, genome, legal));
    let jumps = 0;
    let total = 0;
    for (let n = 0; n < 4000; n += 1) {
      const parent = parents[n % parents.length];
      const generation = 2 + (n % (EVOLUTION_CONFIG.generations - 1));
      const { genome, flags } = mutateGenome(base, parent, generation, rng, EVOLUTION_CONFIG, legal);
      assert(withinBounds(genome), `${id}: mutated genome out of bounds`);
      assert(isLegalGenome(base, genome, legal), `${id}: mutated genome illegal`);
      assert(legal.some((angle) => sameAngle(angle, genome.orientation)), `${id}: illegal orientation`);
      if (flags.includes("orientation-mutated")) jumps += 1;
      total += 1;
    }
    const rate = jumps / total;
    if (legal.length === 1) assert(jumps === 0, `${id}: single legal orientation must stay locked`);
    else assert(rate > 0.07 && rate < 0.13, `${id}: orientation mutation rate ${rate.toFixed(3)}`);
  }
  ok("mutation: drift <= 1.2, radius 0.90–1.10, legal orientations, rare orientation jumps, shrinking steps");
}

// ---------- nondominated sort ----------
{
  const items = [
    item(0.9, 0.9, 0.9), // 0 front 1
    item(0.5, 0.5, 0.5), // 1 front 2
    item(1, 0, 0.5), // 2 front 1
    item(0, 1, 0.5), // 3 front 1
    item(0.4, 0.4, 0.4), // 4 front 3
    item(0.5, 0.5, 0.5), // 5 front 2 (duplicate of 1)
    item(0.99, 0.99, 0.99, false), // 6 infeasible, last
  ];
  const fronts = nondominatedSort(items).map((front) => [...front].sort((a, b) => a - b));
  assert(JSON.stringify(fronts) === JSON.stringify([[0, 2, 3], [1, 5], [4], [6]]), `fronts ${JSON.stringify(fronts)}`);
  assert(dominates(item(0.1, 0.1, 0.1), item(1, 1, 1, false)), "feasible dominates infeasible");
  assert(!dominates(item(1, 1, 1, false), item(0.1, 0.1, 0.1, false)), "infeasible never dominates infeasible");
  assert(!dominates(item(0.5, 0.5, 0.5), item(0.5, 0.5, 0.5)), "equal vectors do not dominate");
  const { rank } = rankPopulation(items);
  assert(Math.max(...[0, 1, 2, 3, 4, 5].map((i) => rank[i])) < rank[6], "feasible outranks infeasible");
  ok("nondominated sort fixtures; feasible outranks infeasible");
}

// ---------- crowding ----------
{
  const items = [item(0, 1, 0.5), item(0.25, 0.75, 0.5), item(0.5, 0.5, 0.5), item(1, 0, 0.5), item(0.25, 0.75, 0.5)];
  const d = crowdingDistances(items, [0, 1, 2, 3, 4]);
  assert(d.get(0) === Infinity && d.get(3) === Infinity, "boundary points are infinite");
  assert(Math.abs(d.get(1)! - 1.0) < 1e-9, `interior crowding ${d.get(1)}`);
  assert(Math.abs(d.get(2)! - 1.5) < 1e-9, `interior crowding ${d.get(2)}`);
  assert(d.get(4) === d.get(1), "duplicate vectors share crowding");
  const three = [item(0, 1, 0), item(0.1, 0.9, 0), item(1, 0, 0)];
  const e = crowdingDistances(three, [0, 1, 2]);
  assert(Math.abs(e.get(1)! - 2) < 1e-9, `three-point crowding ${e.get(1)}`);
  ok("crowding fixtures");
}

// ---------- tournament ----------
{
  const seq = (...values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
  };
  assert(tournament([1, 2], [0, 0], seq(0.1, 0.1)) === 0, "lower rank wins (a first)");
  assert(tournament([1, 2], [0, 0], seq(0.9, 0.1)) === 0, "lower rank wins (b first)");
  assert(tournament([1, 1], [0.2, 5], seq(0.1, 0.1)) === 1, "equal rank: higher crowding wins");
  assert(tournament([2, 2], [3, 3], seq(0.9, 0.1)) === 1, "full tie: first draw wins");
  ok("tournament: rank, then crowding");
}

// ---------- survival ----------
{
  const pool = [
    item(0.9, 0.1, 0.5), item(0.1, 0.9, 0.5), item(0.5, 0.5, 0.9), // front 1
    item(0.8, 0.05, 0.4), item(0.45, 0.45, 0.45), item(0.05, 0.8, 0.4), // front 2
  ];
  const { survivors } = selectSurvivors(pool, 4);
  assert(survivors.length === 4 && [0, 1, 2].every((i) => survivors.includes(i)), "front 1 survives whole");
  assert(!survivors.includes(4), "overflowing front is cut by crowding");
  const rng = mulberry32(1);
  const big = Array.from({ length: 160 }, () => item(rng(), rng(), rng(), rng() > 0.1));
  const cut = selectSurvivors(big, 80).survivors;
  assert(cut.length === 80 && new Set(cut).size === 80, "parent + offspring survival keeps exactly 80");
  ok("elitist survival");
}

// ---------- archive ----------
{
  const a = { id: 1, ...item(0.5, 0.5, 0.5) };
  const b = { id: 2, ...item(0.9, 0.2, 0.5) };
  const c = { id: 3, ...item(0.6, 0.6, 0.6) };
  const d = { id: 4, ...item(1, 1, 1, false) };
  const e = { id: 5, ...item(0.55, 0.55, 0.55) };
  let archive = updateArchive([], [a, b]);
  assert(archive.map((x) => x.id).join() === "1,2", "non-dominated pair kept");
  archive = updateArchive(archive, [c, d, e]);
  assert(archive.map((x) => x.id).sort().join() === "2,3", "newly dominated entry removed; infeasible and dominated newcomers rejected");
  ok("external archive");
}

// ---------- controller with a synthetic evaluator ----------
function fakeEvaluator(seed = EVALUATION_SEED): EvaluateBatch {
  return async (genomes) =>
    genomes.map(
      (genome): GenomeEvaluation => ({
        evaluationSeed: seed,
        trailSize: 1280,
        iteration: 0,
        feasible: genome.driftX < 1.0,
        objectives: {
          formal: 0.5 + 0.4 * Math.sin(genome.driftX * 2.1 + genome.orientation),
          spatial: 0.5 + 0.4 * Math.cos(genome.driftY * 1.7),
          atmospheric: 0.5 + 3 * (genome.uniformRadiusScale - 1) + 0.05 * Math.sin(genome.driftX * genome.driftY * 5),
        },
        criterionMatch: {},
        observed: {},
        preview: new Uint8Array(4),
      }),
    );
}

async function controllerChecks() {
  const archetypeId = "void-field";
  const base = translateArchetype(archetypeId);
  const legal = legalOrientations(base);
  const previewCounts: number[] = [];
  const run = await runEvolution({
    run: createRun(archetypeId, 20260928),
    evaluate: fakeEvaluator(),
    onGeneration: (_run, previews) => {
      previewCounts.push(previews.length);
    },
  });
  const generations = EVOLUTION_CONFIG.generations;
  const total = generations * EVOLUTION_CONFIG.populationSize;
  assert(generations === 4, "version-1 experiment runs four generations");
  assert(run.completedGenerations === generations && run.generations.length === generations, "all generations completed");
  assert(run.candidates.length === total, `candidates ${run.candidates.length}`);
  assert(new Set(run.candidates.map((c) => c.id)).size === total, "unique candidate ids");
  assert(previewCounts.every((n) => n === 80), "80 previews per generation");
  const g01 = run.candidates.filter((c) => c.generation === 1);
  assert(g01.length === 80 && g01.every((c) => c.parentId === null), "G01 has 80 founders");
  assert(g01[0].flags.includes("canonical") && genomeKey(g01[0].genome) === genomeKey(CANONICAL_GENOME), "canonical founder");
  for (const record of run.generations) {
    assert(record.survivorIds.length === 80 && new Set(record.survivorIds).size === 80, `G${record.generation} survivors`);
    assert(record.pool.length === (record.generation === 1 ? 80 : 160), `G${record.generation} pool size`);
    assert(record.frontIds.every((id) => record.pool.find((e) => e.id === id)!.rank === 1), "front ids are rank 1 in pool");
    if (record.generation > 1) {
      const previousSurvivors = new Set(run.generations[record.generation - 2].survivorIds);
      const born = run.candidates.filter((c) => c.generation === record.generation);
      assert(born.length === 80 && born.every((c) => previousSurvivors.has(c.parentId!)), "parents come from previous survivors");
    }
  }
  for (const candidate of run.candidates) {
    assert(candidate.evaluationSeed === EVALUATION_SEED, "fixed evaluation seed recorded");
    assert(withinBounds(candidate.genome) && isLegalGenome(base, candidate.genome, legal), "controller genome legal");
  }
  const feasible = run.candidates.filter((c) => c.feasible);
  const expected = feasible
    .filter((c) => !feasible.some((other) => dominates(other, c)))
    .map((c) => c.id)
    .sort((a, b) => a - b);
  assert(JSON.stringify(run.archiveIds) === JSON.stringify(expected), "archive equals global non-dominated set");
  assert(run.candidates.every((c) => c.archived === run.archiveIds.includes(c.id)), "archived flags follow the global archive");
  const leftArchive = run.candidates.filter((c) => c.rank === 1 && !c.archived).length;
  ok(
    `controller: ${generations} × 80, archive ${run.archiveIds.length}, rank-1-at-birth but no longer archived ${leftArchive} (rank 1 ≠ archived)`,
  );

  const partial = await runEvolution({
    run: { ...createRun(archetypeId, 20260928), config: { ...EVOLUTION_CONFIG, generations: 2 } },
    evaluate: fakeEvaluator(),
  });
  const resumed = await runEvolution({
    run: { ...(JSON.parse(JSON.stringify(partial)) as EvolutionRun), config: EVOLUTION_CONFIG },
    evaluate: fakeEvaluator(),
  });
  const strip = (r: EvolutionRun) => JSON.stringify({ ...r, config: null });
  assert(strip(resumed) === strip(run), "resumed run matches an uninterrupted run");
  ok("resume after G02 reproduces the uninterrupted run");

  let rejected = "";
  try {
    await runEvolution({ run: createRun(archetypeId, 1), evaluate: fakeEvaluator(2) });
  } catch (error) {
    rejected = String(error);
  }
  assert(rejected.includes("fixed seed"), "an evaluation with another seed is rejected");
  rejected = "";
  try {
    await runEvolution({ run: { ...createRun(archetypeId, 1), evaluationSeed: 2 }, evaluate: fakeEvaluator() });
  } catch (error) {
    rejected = String(error);
  }
  assert(rejected.includes("fixed seed"), "a run with another seed is rejected");
  assert(EVALUATION_SEED === 1, "evaluation seed is 1");
  assert(evaluateGenome.length === 2, "evaluateGenome takes no seed argument");
  ok("fixed evaluation seed enforced");
}

// ---------- no legacy catalog path ----------
{
  const root = join(__dirname, "..", "..");
  const files = [
    "lib/skill2/genome.ts",
    "lib/skill2/nsga.ts",
    "lib/skill2/evolution.ts",
    "lib/skill2/evolution-evaluate.ts",
    "scripts/evolve.ts",
  ];
  const forbidden = ["runAttractorsFor", "attractorsAsKind", "varySlimeControls", "run-catalog", "shared-catalog", "persist/", "run-grid"];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    for (const token of forbidden) assert(!text.includes(token), `${file} references legacy catalog path ${token}`);
  }
  ok("no legacy catalog generator, slime variation, or stored catalog entries reach G01");
}

async function realEvaluationChecks() {
  const started = Date.now();
  const a = evaluateGenome("void-field", CANONICAL_GENOME);
  const b = evaluateGenome("void-field", CANONICAL_GENOME);
  assert(a.evaluationSeed === EVALUATION_SEED && b.evaluationSeed === EVALUATION_SEED, "real evaluation seed");
  assert(a.trailSize === 1280, `standard trail scale 64 (trailSize ${a.trailSize})`);
  assert(JSON.stringify(a.objectives) === JSON.stringify(b.objectives), "identical genome + seed: identical objectives");
  assert(JSON.stringify(a.observed) === JSON.stringify(b.observed), "identical genome + seed: identical observations");
  assert(PREVIEW_SIZE === 1280 && a.preview.length === PREVIEW_SIZE * PREVIEW_SIZE, "preview is the full 1280 field");
  assert(a.preview.every((v, i) => v === b.preview[i]), "identical genome + seed: identical preview");
  assert(a.preview.some((v) => v > 0), "preview carries the evaluated morphology");
  const r = (v: number) => v.toFixed(3);
  assert(
    r(a.objectives.formal) === "0.480" && r(a.objectives.spatial) === "0.703" && r(a.objectives.atmospheric) === "0.626",
    `canonical void-field seed 1 must match the audit record (got ${r(a.objectives.formal)} ${r(a.objectives.spatial)} ${r(a.objectives.atmospheric)})`,
  );
  ok(`real evaluation deterministic and equal to the audit record (2 simulations, ${Math.round((Date.now() - started) / 1000)}s)`);
}

async function main() {
  await controllerChecks();
  await realEvaluationChecks();
  console.log("verify-evolution: all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
