import { readFileSync } from "node:fs";
import { branchSampledFutures } from "./futures";
import {
  assertObjectiveConfig,
  DEFAULT_OBJECTIVE_CONFIG,
  scoreFuture,
  scoreFutures,
  type FutureObjectives,
  type ObjectiveComponents,
} from "./objectives";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);

const FIXTURE = { archetypeId: "void-field", runKey: "void-field@20260928", candidateId: 39 };

function finite01(value: number, label: string) {
  assert(Number.isFinite(value), `${label} is not finite`);
  assert(value >= 0 && value <= 1, `${label} ${value} is outside [0,1]`);
}

function sameScore(left: FutureObjectives, right: FutureObjectives, label: string) {
  assert(JSON.stringify(left) === JSON.stringify(right), `${label} changed`);
}

function explain(score: FutureObjectives, group: keyof ObjectiveComponents) {
  const weights = DEFAULT_OBJECTIVE_CONFIG.weights[group];
  let rebuilt = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = score.components[group][key as keyof (typeof score.components)[typeof group]];
    finite01(value, `${score.futureId} ${group}.${key}`);
    rebuilt += value * weight;
  }
  assert(Math.abs(rebuilt - score[group]) < 1e-12, `${score.futureId} ${group} does not match its measurements`);
}

assertObjectiveConfig(DEFAULT_OBJECTIVE_CONFIG);
const scoringSource = readFileSync(new URL("./objectives.ts", import.meta.url), "utf8");
assert(
  !scoringSource.includes("branchSampledFutures") && !scoringSource.includes("sampleFromParent") && !scoringSource.includes("replayZ0"),
  "scoring reruns futures",
);

const started = Date.now();
const branched = branchSampledFutures(FIXTURE);
const scored = scoreFutures(branched.futures);
assert(scored.length === 4, "expected four scores");

for (const score of scored) {
  finite01(score.continuity, `${score.futureId} continuity`);
  finite01(score.transformation, `${score.futureId} transformation`);
  finite01(score.concentration, `${score.futureId} concentration`);
  explain(score, "continuity");
  explain(score, "transformation");
  explain(score, "concentration");
  const again = scoreFuture(branched.futures.find((future) => future.id === score.futureId)!.samples, score.futureId);
  sameScore(score, again, `${score.futureId} repeated score`);
}
ok("four futures scored in [0,1], twice");

const held = branched.futures[0];
const withoutNeighbor = scoreFutures(branched.futures.filter((future) => future.id !== "F03"));
sameScore(scored[0], withoutNeighbor[0], "F01 after removing F03");
sameScore(scored[0], scoreFuture(held.samples, held.id), "F01 scored alone");
ok("a future's score ignores the rest of the batch");

const profiles = new Set(scored.map((score) => [score.continuity, score.transformation, score.concentration].join(",")));
assert(profiles.size >= 2, "divergent futures produced one score profile");
ok(`${profiles.size} distinct score profiles`);

for (const score of scored) {
  const parts = score.components;
  console.log(
    `${score.futureId}  continuity ${score.continuity.toFixed(4)}  transformation ${score.transformation.toFixed(4)}  concentration ${score.concentration.toFixed(4)}`,
  );
  console.log(
    `     persistence ${parts.continuity.persistence.toFixed(4)}  connectivity ${parts.continuity.connectivityRetention.toFixed(4)}  inv-fragment ${parts.continuity.inverseFragmentation.toFixed(4)}  inv-disappear ${parts.continuity.inverseDisappearance.toFixed(4)}`,
  );
  console.log(
    `     migration ${parts.transformation.migration.toFixed(4)}  emergence ${parts.transformation.emergence.toFixed(4)}  disappearance ${parts.transformation.disappearance.toFixed(4)}  vs-z0 ${parts.transformation.differenceFromZ0.toFixed(4)}`,
  );
  console.log(
    `     reinforcement ${parts.concentration.reinforcement.toFixed(4)}  density ${parts.concentration.densityAccumulation.toFixed(4)}  high-density ${parts.concentration.highDensityPersistence.toFixed(4)}`,
  );
}

console.log(`verify-objectives: all checks passed (${Math.round((Date.now() - started) / 1000)}s)`);
