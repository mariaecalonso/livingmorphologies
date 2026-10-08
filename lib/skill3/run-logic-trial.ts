import { runLogicTrial, writeLogicTrial } from "./logic-trial";

const trial = runLogicTrial();
const file = writeLogicTrial(trial);
console.log(JSON.stringify({
  file,
  z0Iteration: trial.z0Iteration,
  parentChecksum: trial.parentChecksum,
  runs: trial.runs.map((run) => ({
    id: run.id,
    focus: run.focusLabel,
    resolvedHorizon: run.resolvedHorizon,
    status: run.status,
    acceptedSampleCount: run.acceptedSampleCount,
  })),
}));
