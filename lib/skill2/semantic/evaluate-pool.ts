import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { SemanticEvaluation } from "./evaluate";
import type { RealizationState, SemanticPlan } from "./types";

export type EvaluationJob = {
  id: number;
  plan: SemanticPlan;
  state: RealizationState;
  /** Catalog pictures are drawn later, only for candidates the catalog keeps. */
  preview?: boolean;
};

type WorkerReply = { id: number; result?: SemanticEvaluation; error?: string };

/**
 * One Physarum evaluation per child process.
 * The slime engine keeps scratch buffers in module scope, so threads in one
 * process would race. Separate processes do not share those buffers.
 */
export function createEvaluationPool(workers: number) {
  const count = Math.max(1, workers);
  const path = fileURLToPath(new URL("./evaluate-worker.ts", import.meta.url));
  const children = Array.from({ length: count }, () =>
    fork(path, [], { execArgv: process.execArgv, serialization: "advanced" }),
  );
  const free: ChildProcess[] = [...children];
  const waiting: Array<() => void> = [];
  let sequence = 0;

  function evaluate(plan: SemanticPlan, state: RealizationState, options?: { preview?: boolean }): Promise<SemanticEvaluation> {
    return new Promise((resolve, reject) => {
      const start = () => {
        const child = free.pop();
        if (!child) {
          waiting.push(start);
          return;
        }
        const id = ++sequence;
        const finish = (error?: Error, result?: SemanticEvaluation) => {
          child.off("message", onMessage);
          child.off("exit", onExit);
          free.push(child);
          const next = waiting.shift();
          if (next) next();
          if (error) reject(error);
          else resolve(result as SemanticEvaluation);
        };
        const onMessage = (message: WorkerReply) => {
          if (message.id !== id) return;
          if (message.error || !message.result) finish(new Error(message.error ?? "worker returned no evaluation"));
          else finish(undefined, restorePreview(message.result));
        };
        const onExit = (code: number | null) => finish(new Error(`evaluation worker exited (${code})`));
        child.on("message", onMessage);
        child.on("exit", onExit);
        child.send({ id, plan, state, preview: options?.preview === true } satisfies EvaluationJob);
      };
      start();
    });
  }

  function close() {
    for (const child of children) child.kill();
  }

  return { evaluate, close };
}

function restorePreview(result: SemanticEvaluation): SemanticEvaluation {
  if (!result.preview) return result;
  return { ...result, preview: result.preview instanceof Uint8Array ? result.preview : new Uint8Array(result.preview) };
}
