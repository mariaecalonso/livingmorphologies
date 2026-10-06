import { evaluateSearchCandidate } from "./evaluate";
import type { EvaluationJob } from "./evaluate-pool";

process.on("message", (job: EvaluationJob) => {
  try {
    const result = evaluateSearchCandidate(job.plan, job.state, { preview: job.preview === true });
    process.send?.({ id: job.id, result });
  } catch (error) {
    process.send?.({ id: job.id, error: error instanceof Error ? error.stack ?? error.message : String(error) });
  }
});
