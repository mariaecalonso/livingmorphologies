import { BRANCHES, TYPOLOGIES, ratingDescription } from "../catalog";
import { CRITERION_EVALUATION_SPECS } from "./evaluation-definitions";
import { evaluateMorphology, readMeasurement } from "./evaluate";
import { measureMorphology } from "./measurements";
import type { MeasurementKey } from "./types";
import type { SimulationState } from "../skill1/types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function makeState(trails: number[]): SimulationState {
  const trailSize = 32;
  const size = 8;
  return {
    size,
    trailSize,
    iteration: 0,
    maxIterations: 1,
    converged: false,
    streak: 0,
    totalDelta: 0,
    seed: 1,
    source: { x: 1, y: 1 },
    attractor: { x: 4, y: 4 },
    attraction: new Array(size * size).fill(0),
    permeabilityField: new Array(size * size).fill(1),
    occupancy: new Array(size * size).fill(0),
    trails,
    flow: new Array(size * size).fill(0),
    agents: [],
  };
}

const catalogIds = new Set(
  BRANCHES.flatMap((branch) => [
    ...branch.shared.map((item) => item.id),
    ...Object.values(branch.specific).map((item) => item.id),
  ]),
);

const specIds = new Set(Object.keys(CRITERION_EVALUATION_SPECS));

for (const id of catalogIds) {
  assert(specIds.has(id), `catalog criterion ${id} has no evaluation spec`);
}
for (const id of specIds) {
  assert(catalogIds.has(id), `evaluation spec ${id} is not in the catalog`);
}

const trails = new Array(32 * 32).fill(0);
for (let y = 10; y < 22; y += 1) {
  for (let x = 8; x < 24; x += 1) trails[y * 32 + x] = x > 16 ? 1 : 0.25;
}
const measurements = measureMorphology(makeState(trails));

let targets = 0;
let mapped = 0;
const unsupported: string[] = [];

for (const typology of TYPOLOGIES) {
  assert(typology.archetypes.length === 5, `${typology.id} should have 5 archetypes`);
  for (const archetype of typology.archetypes) {
    const first = evaluateMorphology({
      typologyId: typology.id,
      archetypeId: archetype.id,
      measurements,
    });
    const second = evaluateMorphology({
      typologyId: typology.id,
      archetypeId: archetype.id,
      measurements,
    });
    assert(JSON.stringify(first) === JSON.stringify(second), `${archetype.id} evaluation is not deterministic`);
    assert(first.criteria.length === 9, `${archetype.id} should have 9 criterion results`);

    for (const result of first.criteria) {
      targets += 1;
      const spec = CRITERION_EVALUATION_SPECS[result.criterionId];
      const rating = archetype.ratings[result.criterionId];
      if (!spec) {
        unsupported.push(`${archetype.id}/${result.criterionId}: no spec`);
        continue;
      }
      if (rating !== 0 && rating !== 1 && rating !== 2) {
        unsupported.push(`${archetype.id}/${result.criterionId}: missing catalog rating`);
        continue;
      }
      if (result.targetRating !== rating) {
        unsupported.push(`${archetype.id}/${result.criterionId}: rating mismatch`);
        continue;
      }
      if (!result.targetDescription.trim()) {
        unsupported.push(`${archetype.id}/${result.criterionId}: empty target description`);
        continue;
      }
      if (result.limitations.some((note) => note.includes("not yet mapped"))) {
        unsupported.push(`${archetype.id}/${result.criterionId}: unmapped fallback`);
        continue;
      }
      if (!Number.isFinite(result.correspondenceScore)) {
        unsupported.push(`${archetype.id}/${result.criterionId}: non-finite score`);
        continue;
      }
      const catalogText = ratingDescription(
        [...BRANCHES.flatMap((branch) => [...branch.shared, ...Object.values(branch.specific)])].find(
          (item) => item.id === result.criterionId,
        )!,
        rating,
      );
      if (result.targetDescription !== catalogText) {
        unsupported.push(`${archetype.id}/${result.criterionId}: description not from catalog`);
        continue;
      }
      for (const key of spec.evidence) {
        const value = readMeasurement(measurements, key as MeasurementKey);
        if (!Number.isFinite(value)) {
          unsupported.push(`${archetype.id}/${result.criterionId}: bad evidence ${key}`);
        }
      }
      mapped += 1;
    }
  }
}

assert(unsupported.length === 0, `unsupported targets:\n${unsupported.join("\n")}`);
assert(targets === 135, `expected 135 archetype-criterion targets, got ${targets}`);
assert(mapped === targets, `mapped ${mapped} of ${targets}`);
assert(TYPOLOGIES.length === 3, "expected 3 typologies");
assert(
  TYPOLOGIES.reduce((sum, item) => sum + item.archetypes.length, 0) === 15,
  "expected 15 archetypes",
);

console.log("skill2 catalog coverage: ok");
console.log(
  [
    `unique catalog criteria ${catalogIds.size}`,
    `registered specs ${specIds.size}`,
    `typologies ${TYPOLOGIES.length}`,
    `archetypes 15`,
    `targets ${targets}`,
    `mapped ${mapped}`,
    `unsupported ${unsupported.length}`,
  ].join("\n"),
);
