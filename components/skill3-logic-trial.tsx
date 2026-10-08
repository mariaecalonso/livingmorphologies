"use client";

import { ProcessMorphology, ProcessPlate, ProcessStack } from "@/components/vertical-process-stage";
import { stackDisplayIndices } from "@/lib/skill3/stack-display";
import type { LogicTrialFile } from "@/lib/skill3/logic-trial-types";

export function Skill3LogicTrial({ trial }: { trial: LogicTrialFile }) {
  return (
    <div className="logic-trial">
      <p className="logic-trial-kicker">
        Development fixture · {trial.archetypeId} {trial.candidateId} · Z0 {trial.z0Iteration} · {trial.parentChecksum.slice(0, 8)}
      </p>
      <div className="logic-trial-row">
        {trial.runs.map((run) => {
          const shown = stackDisplayIndices(run.field.slices.length).filter((index) => index > 0);
          const z0 = run.field.slices[0];
          return (
            <article key={run.id} className="logic-trial-card">
              <header>
                <h2>{run.id}</h2>
                <p>{run.focusLabel}</p>
                <p>Horizon {run.resolvedHorizon}</p>
              </header>
              <div className="logic-trial-z0">
                {z0 ? <ProcessPlate slice={z0} /> : null}
              </div>
              <p className="logic-trial-arrow" aria-hidden="true">→</p>
              <div className="logic-trial-samples">
                {shown.map((index) => {
                  const slice = run.field.slices[index];
                  return slice ? (
                    <figure key={slice.iteration}>
                      <ProcessPlate slice={slice} />
                    </figure>
                  ) : null;
                })}
              </div>
              <p className="logic-trial-arrow" aria-hidden="true">→</p>
              <div className="logic-trial-xyt">
                <ProcessStack field={run.field} />
              </div>
              <p className="logic-trial-arrow" aria-hidden="true">→</p>
              <div className="logic-trial-mesh">
                <ProcessMorphology
                  field={run.field}
                  cacheIdentity={`logic-trial:${run.id}:${trial.parentChecksum}`}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
