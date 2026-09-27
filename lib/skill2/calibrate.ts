import { runCalibration, writeCalibrationOutput } from "./calibration";

const outDir = process.argv[2] ?? "calibration/skill2";
const samples = Number(process.argv[3] ?? 20);
const result = runCalibration(samples);
const dir = writeCalibrationOutput(result, outDir);
const { analysis } = result;
const floorHits = Object.entries(analysis.acceptability.floorHits).sort((a, b) => b[1] - a[1]);
console.log("\nskill2 calibration complete");
console.log(`out=${dir}`);
console.log(`samples=${result.sampleCount} runtimeMs=${result.runtimeMs} deterministic=${result.deterministic}`);
console.log(`acceptable=${(analysis.acceptability.rate * 100).toFixed(1)}% (${analysis.acceptability.acceptable}/${analysis.acceptability.n})`);
console.log(`floorRejects=${analysis.acceptability.floorRejects} overallOnly=${analysis.acceptability.overallOnlyRejects}`);
console.log(`top floor hits=${floorHits.slice(0, 8).map(([id, n]) => `${id}:${n}`).join(", ")}`);
console.log(`nearlyConstant=${analysis.flags.nearlyConstant.join(", ") || "none"}`);
console.log(`saturating-ish=${analysis.flags.saturating.join(", ") || "none"}`);
