import { Panel, PanelHeader } from "@/components/hud";
import { EvolutionHeader } from "@/components/evolution/evolution-header";
import { MockMorphology } from "@/components/evolution/mock-morphology";
import {
  formatCandidateId,
  MOCK_GENERATION_COUNT,
  MOCK_GENERATIONS,
  MOCK_LINEAGE,
  MOCK_OPERATIONS,
  MOCK_POPULATION_SIZE,
  MOCK_PROGRESS,
} from "@/lib/ui-mock/evolution-mock";

const pad = (value: number) => String(value).padStart(2, "0");

export function EvolutionProgress() {
  const progress = MOCK_PROGRESS;
  const completed = MOCK_GENERATIONS.filter((generation) => generation.status === "done");
  const percent = (progress.evaluated / MOCK_POPULATION_SIZE) * 100;

  return (
    <main className="evo-page">
      <EvolutionHeader
        title="Evolutionary Search"
        detail={`${MOCK_GENERATION_COUNT} generations · ${MOCK_POPULATION_SIZE} candidates per generation · Formal / Spatial / Atmospheric`}
      />

      <ol className="evo-generations" aria-label="Generations">
        {MOCK_GENERATIONS.map((generation) => (
          <li key={generation.id} className="evo-generation" data-status={generation.status}>
            <span className="evo-generation-thumb" aria-hidden="true">
              {generation.status !== "waiting" ? (
                <MockMorphology seed={MOCK_LINEAGE.seed} generation={generation.index} founder={MOCK_LINEAGE.founder} />
              ) : null}
            </span>
            <span className="evo-generation-text">
              <span className="display evo-generation-id">
                {generation.id}
                {generation.index === 1 ? <span className="evo-generation-role">Initial population</span> : null}
              </span>
              <span className="evo-generation-status">
                {generation.status === "done" ? "Complete" : generation.status === "running" ? "Running" : "Waiting"}
              </span>
              <span className="evo-generation-bar" aria-hidden="true">
                <span style={{ width: `${(generation.evaluated / MOCK_POPULATION_SIZE) * 100}%` }} />
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="evo-main">
        <Panel className="evo-active">
          <PanelHeader kicker="Active generation" title={`Generation ${pad(progress.activeGeneration)} / ${pad(MOCK_GENERATION_COUNT)}`} />
          <p className="display evo-active-count">
            {progress.evaluated} / {MOCK_POPULATION_SIZE}
            <span className="eyebrow">Candidates evaluated</span>
          </p>
          <div className="evo-progress" role="progressbar" aria-valuemin={0} aria-valuemax={MOCK_POPULATION_SIZE} aria-valuenow={progress.evaluated}>
            <span style={{ width: `${percent}%` }} />
          </div>

          <div className="evo-operation">
            <p className="eyebrow">Current operation</p>
            <p className="display evo-operation-name">{progress.operationDetail}</p>
            <ol className="evo-operations">
              {MOCK_OPERATIONS.map((operation) => (
                <li key={operation} data-active={operation === progress.operation || undefined}>
                  {operation}
                </li>
              ))}
            </ol>
          </div>

          <dl className="evo-stats">
            <div>
              <dt>Candidates</dt>
              <dd>
                {progress.evaluated} / {MOCK_POPULATION_SIZE}
              </dd>
            </div>
            <div>
              <dt>Feasible</dt>
              <dd>{progress.feasible}</dd>
            </div>
            <div>
              <dt>Pareto front</dt>
              <dd>{progress.paretoFront}</dd>
            </div>
            <div>
              <dt>Archive</dt>
              <dd>{progress.archive}</dd>
            </div>
          </dl>
        </Panel>

        <Panel className="evo-preview">
          <PanelHeader kicker="Current candidate" title={formatCandidateId(progress.currentCandidate)} aside={<span className="eyebrow">Placeholder</span>} />
          <div className="evo-preview-frame">
            <MockMorphology seed={MOCK_LINEAGE.seed} generation={progress.activeGeneration} founder={MOCK_LINEAGE.founder} />
          </div>
          <p className="eyebrow evo-preview-caption">One representative morphology · descended from the G01 initial population</p>
        </Panel>

        <Panel className="evo-history">
          <PanelHeader kicker="History" title="Completed generations" />
          <ul className="evo-history-list">
            {completed.map((generation) => (
              <li key={generation.id}>
                <p className="display evo-history-title">{generation.id} Complete</p>
                <p>{generation.evaluated} evaluated</p>
                <p>{generation.pareto} Pareto</p>
                <p>{generation.archived} archived</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </main>
  );
}
