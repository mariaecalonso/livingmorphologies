import { mkdirSync, writeFileSync } from "node:fs";
import { readArchitecture } from "../lib/skill1/architecture";
import { runSimulation } from "../lib/skill1/engine";
import { encodePng, renderVoidFrame, scoreVoidField } from "../lib/skill1/score-void";
import { translateArchetype } from "../lib/skill1/translate";
const OUT = process.argv[2] ?? "/opt/cursor/artifacts/void-search";
const RUNS = Number(process.argv[3] ?? 50);
const ITERATIONS = Number(process.argv[4] ?? 600);
const AGENTS = Number(process.argv[5] ?? 1000);
function seedFor(index: number) {
  return (0x51c11 ^ (index * 9973) ^ 0x9e3779b9) >>> 0;
}
function main() {
  mkdirSync(OUT, { recursive: true });
  const translation = translateArchetype("void-field");
  const ranking: Array<ReturnType<typeof scoreVoidField> & { index: number; ms: number; file: string; iteration: number }> =
    [];
  for (let index = 0; index < RUNS; index += 1) {
    const seed = seedFor(index);
    const started = Date.now();
    const state = runSimulation(translation, seed, ITERATIONS, AGENTS);
    const reading = readArchitecture(state, translation);
    const score = scoreVoidField(state, translation);
    const file = `run-${String(index).padStart(2, "0")}-seed-${seed}.png`;
    writeFileSync(
      `${OUT}/${file}`,
      encodePng(960, 480, renderVoidFrame(state, reading, translation, 960, 480)),
    );
    const row = {
      ...score,
      index,
      ms: Date.now() - started,
      file,
      iteration: state.iteration,
    };
    ranking.push(row);
    const pass = Object.values(score.questions).filter(Boolean).length;
    console.log(
      `${file} score=${score.score} pass=${pass}/3 core=${score.exposedCore} iso=${score.isolatedAnchor} commons=${score.expansiveCommons} corridor=${score.corridor} doughnut=${score.doughnut} ${row.ms}ms`,
    );
  }
  ranking.sort((a, b) => b.score - a.score);
  writeFileSync(
    `${OUT}/scores.json`,
    JSON.stringify(
      {
        runs: RUNS,
        iterations: ITERATIONS,
        agents: AGENTS,
        params: translation.params,
        recipe: translation.recipe,
        descriptors: translation.descriptors,
        ranking,
      },
      null,
      2,
    ),
  );
  console.log("\nTOP 8");
  for (const row of ranking.slice(0, 8)) {
    console.log(
      `${row.file} ${row.score} ${JSON.stringify(row.questions)} voids=${row.primaryVoids} sat=${row.satelliteVoids} mass=${row.mass}`,
    );
  }
}
main();
