import { evaluateLobbyCandidate } from "./evaluate";
import type { EvaluationJob } from "./evaluate-pool";

process.on("message", (job: EvaluationJob) => {
  try {
    const result = evaluateLobbyCandidate(job.plan, job.state);
    process.send?.({ id: job.id, result });
  } catch (error) {
    process.send?.({ id: job.id, error: error instanceof Error ? error.stack ?? error.message : String(error) });
  }
});
