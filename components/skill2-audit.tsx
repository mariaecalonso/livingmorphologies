"use client";

import { useMemo, useState } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import {
  DEFAULT_PLAN_EVIDENCE_FLAGS,
  DIRECT_CARVE_THRESHOLD,
  Skill2DirectInverseField,
  Skill2PlanEvidenceField,
  Skill2RawField,
  Skill2WhitePlanField,
  type PlanEvidenceFlags,
  type Skill2OverlayFlags,
} from "@/components/skill2-audit-views";
import { findArchetype, findTypology } from "@/lib/catalog";
import { snapshotFromState } from "@/lib/skill1/section-view";
import {
  EVALUATION_CALIBRATION,
  SKILL2_AUDIT_PROTOCOL,
  runSkill2Audit,
  skill2AuditSeed,
  type Skill2AuditResult,
} from "@/lib/skill2/audit";
import { buildPlanModel } from "@/lib/skill2/plan-model";
import type { TypologyId } from "@/lib/types";

const EMPTY_FLAGS: Skill2OverlayFlags = {
  mass: false,
  void: false,
  network: false,
  interior: false,
  circulation: false,
  skeleton: false,
};

function fmt(value: number, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

export function Skill2AuditWorkspace({
  typologyId,
  archetypeId,
}: {
  typologyId: TypologyId;
  archetypeId: string;
}) {
  const typology = findTypology(typologyId);
  const archetype = findArchetype(typology, archetypeId);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [seedOverride, setSeedOverride] = useState("");
  const [agentCount, setAgentCount] = useState<number>(SKILL2_AUDIT_PROTOCOL.agentCount);
  const [maxIterations, setMaxIterations] = useState<number>(SKILL2_AUDIT_PROTOCOL.maxIterations);
  const [trailDecay, setTrailDecay] = useState<number>(SKILL2_AUDIT_PROTOCOL.trailDecay);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Skill2AuditResult | null>(null);
  const [flags, setFlags] = useState<Skill2OverlayFlags>(EMPTY_FLAGS);
  const [rightView, setRightView] = useState<"morphology" | "inverse" | "plan">("morphology");
  const [planFlags, setPlanFlags] = useState<PlanEvidenceFlags>(DEFAULT_PLAN_EVIDENCE_FLAGS);
  const [carveThreshold, setCarveThreshold] = useState(DIRECT_CARVE_THRESHOLD);

  const defaultSeed = skill2AuditSeed(archetype.id, sampleIndex);
  const parsedSeed = Number.parseInt(seedOverride.trim(), 10);
  const activeSeed = Number.isFinite(parsedSeed) ? parsedSeed >>> 0 : defaultSeed;
  const realizationBaseline =
    agentCount === SKILL2_AUDIT_PROTOCOL.agentCount &&
    maxIterations === SKILL2_AUDIT_PROTOCOL.maxIterations &&
    trailDecay === SKILL2_AUDIT_PROTOCOL.trailDecay;
  const snapshot = useMemo(
    () => (result ? snapshotFromState(result.state) : null),
    [result],
  );

  const run = () => {
    setRunning(true);
    setError(null);
    window.setTimeout(() => {
      try {
        const parsed = Number.parseInt(seedOverride.trim(), 10);
        const next = runSkill2Audit({
          typologyId,
          archetypeId: archetype.id,
          sampleIndex,
          seed: Number.isFinite(parsed) ? parsed : undefined,
          agentCount,
          maxIterations,
          trailDecay,
        });
        setResult(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Audit run failed");
      } finally {
        setRunning(false);
      }
    }, 30);
  };

  const resetRealizationBaseline = () => {
    setAgentCount(SKILL2_AUDIT_PROTOCOL.agentCount);
    setMaxIterations(SKILL2_AUDIT_PROTOCOL.maxIterations);
    setTrailDecay(SKILL2_AUDIT_PROTOCOL.trailDecay);
    setRunning(true);
    setError(null);
    window.setTimeout(() => {
      try {
        const parsed = Number.parseInt(seedOverride.trim(), 10);
        const next = runSkill2Audit({
          typologyId,
          archetypeId: archetype.id,
          sampleIndex,
          seed: Number.isFinite(parsed) ? parsed : undefined,
          agentCount: SKILL2_AUDIT_PROTOCOL.agentCount,
          maxIterations: SKILL2_AUDIT_PROTOCOL.maxIterations,
          trailDecay: SKILL2_AUDIT_PROTOCOL.trailDecay,
        });
        setResult(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Audit run failed");
      } finally {
        setRunning(false);
      }
    }, 30);
  };

  const descriptors = result?.handoff.descriptors;
  const evaluation = result?.evaluation;
  const measurements = result?.morphology.measurements;
  const plan = useMemo(
    () => (result ? buildPlanModel(result.state, result.morphology) : null),
    [result],
  );
  const planCounts = useMemo(() => {
    if (!plan) return null;
    let strong = 0;
    let connective = 0;
    for (let i = 0; i < plan.reinforcement.strong.length; i += 1) {
      if (plan.reinforcement.strong[i]) strong += 1;
      if (plan.reinforcement.connective[i]) connective += 1;
    }
    return { strong, connective };
  }, [plan]);
  const connection = measurements?.connection;

  return (
    <>
      <section className="criteria-region skill2-audit-source">
        <Panel className="flex min-h-0 flex-col">
          <PanelHeader kicker="Skill 2" title="Visual Audit" />
          <p className="mb-2 text-[0.68rem] leading-snug text-[var(--muted)]">
            One real Skill 1 realization, then frozen Skill 2 measurement and evaluation. Not a candidate search.
          </p>
          <p className="mb-2 text-[0.5rem] tracking-[0.16em] uppercase text-[var(--muted)]">Biological realization</p>
          <span
            className={`mb-2 inline-block border px-1.5 py-0.5 text-[0.5rem] tracking-[0.14em] uppercase ${
              realizationBaseline
                ? "border-[var(--cyan)] text-[var(--cyan-hot)]"
                : "border-[var(--orange)] text-[var(--orange-hot)]"
            }`}
          >
            {realizationBaseline ? "Baseline 1000 / 600 / 0.986" : "Temporary override"}
          </span>
          <label className="mb-1 block text-[0.5rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Sample index (0–19)
            <input
              className="mt-1 w-full border border-[rgba(242,242,238,0.22)] bg-black px-2 py-1 text-[0.72rem] text-[var(--text)]"
              type="number"
              min={0}
              max={19}
              value={sampleIndex}
              onChange={(event) => setSampleIndex(Math.max(0, Math.min(19, Number(event.target.value) || 0)))}
            />
          </label>
          <label className="mb-2 block text-[0.5rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Seed
            <input
              className="mt-1 w-full border border-[rgba(242,242,238,0.22)] bg-black px-2 py-1 text-[0.72rem] text-[var(--text)]"
              type="text"
              inputMode="numeric"
              placeholder={String(defaultSeed)}
              value={seedOverride}
              onChange={(event) => setSeedOverride(event.target.value)}
              onBlur={() => run()}
              onKeyDown={(event) => {
                if (event.key === "Enter") run();
              }}
            />
            <span className="mt-0.5 block text-[0.48rem] normal-case tracking-normal text-[var(--muted)]">
              Active {activeSeed}
              {seedOverride.trim() ? " · override" : " · sample protocol"}
            </span>
          </label>
          <label className="mb-2 block text-[0.5rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Agent count {agentCount}
            <input
              className="range-hud mt-1 w-full"
              type="range"
              min={1}
              max={2000}
              step={1}
              value={agentCount}
              onChange={(event) => setAgentCount(Number(event.target.value))}
              onPointerUp={() => run()}
            />
          </label>
          <label className="mb-2 block text-[0.5rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Iterations {maxIterations}
            <input
              className="range-hud mt-1 w-full"
              type="range"
              min={1}
              max={1000}
              step={1}
              value={maxIterations}
              onChange={(event) => setMaxIterations(Number(event.target.value))}
              onPointerUp={() => run()}
            />
          </label>
          <label className="mb-2 block text-[0.5rem] tracking-[0.16em] uppercase text-[var(--muted)]">
            Trail decay {trailDecay.toFixed(3)}
            <input
              className="range-hud mt-1 w-full"
              type="range"
              min={0.96}
              max={0.998}
              step={0.001}
              value={trailDecay}
              onChange={(event) => setTrailDecay(Number(event.target.value))}
              onPointerUp={() => run()}
            />
            <input
              className="mt-1 w-full border border-[rgba(242,242,238,0.22)] bg-black px-2 py-1 text-[0.72rem] text-[var(--text)]"
              type="number"
              min={0.96}
              max={0.998}
              step={0.001}
              value={trailDecay}
              onChange={(event) => setTrailDecay(Number(event.target.value))}
              onBlur={() => run()}
            />
          </label>
          <div className="mt-1 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="border border-[var(--orange)] bg-[rgba(255,122,50,0.14)] px-2 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--orange-hot)] hover:bg-[rgba(255,122,50,0.22)] disabled:opacity-50"
          >
            {running ? "Running…" : "Run diagnostic"}
          </button>
          <button
            type="button"
            onClick={resetRealizationBaseline}
            disabled={running}
            className="border border-[rgba(242,242,238,0.22)] px-2 py-2 text-[0.5rem] tracking-[0.12em] uppercase text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
          >
            Reset to baseline
          </button>
          </div>
          {error ? <p className="mt-2 text-[0.68rem] text-[var(--danger)]">{error}</p> : null}

          <dl className="mt-3 space-y-1.5 text-[0.68rem]">
            <div>
              <dt className="text-[0.48rem] tracking-[0.16em] uppercase text-[var(--muted)]">Typology</dt>
              <dd>{typology.label}</dd>
            </div>
            <div>
              <dt className="text-[0.48rem] tracking-[0.16em] uppercase text-[var(--muted)]">Archetype</dt>
              <dd>{archetype.name}</dd>
            </div>
            <div>
              <dt className="text-[0.48rem] tracking-[0.16em] uppercase text-[var(--muted)]">Formal</dt>
              <dd>{descriptors?.formal ?? archetype.descriptors.formal}</dd>
            </div>
            <div>
              <dt className="text-[0.48rem] tracking-[0.16em] uppercase text-[var(--muted)]">Spatial</dt>
              <dd>{descriptors?.spatial ?? archetype.descriptors.spatial}</dd>
            </div>
            <div>
              <dt className="text-[0.48rem] tracking-[0.16em] uppercase text-[var(--muted)]">Atmospheric</dt>
              <dd>{descriptors?.atmospheric ?? archetype.descriptors.atmospheric}</dd>
            </div>
            <div>
              <dt className="text-[0.48rem] tracking-[0.16em] uppercase text-[var(--muted)]">Seed</dt>
              <dd>{result ? result.seed : defaultSeed}</dd>
            </div>
            <div>
              <dt className="text-[0.48rem] tracking-[0.16em] uppercase text-[var(--muted)]">Realization</dt>
              <dd>
                {result
                  ? `${result.realization.agentCount} · ${result.realization.maxIterations} · ${result.realization.trailDecay}`
                  : `${agentCount} · ${maxIterations} · ${trailDecay.toFixed(3)}`}
              </dd>
            </div>
            <div>
              <dt className="text-[0.48rem] tracking-[0.16em] uppercase text-[var(--muted)]">Protocol</dt>
              <dd>
                frozen {SKILL2_AUDIT_PROTOCOL.agentCount} / {SKILL2_AUDIT_PROTOCOL.maxIterations} /{" "}
                {SKILL2_AUDIT_PROTOCOL.trailDecay}
              </dd>
            </div>
            {result ? (
              <>
                <div>
                  <dt className="text-[0.48rem] tracking-[0.16em] uppercase text-[var(--muted)]">Iteration</dt>
                  <dd>
                    {result.state.iteration}
                    {result.state.converged ? " · converged" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.48rem] tracking-[0.16em] uppercase text-[var(--muted)]">Runtime</dt>
                  <dd>{result.elapsedMs} ms</dd>
                </div>
              </>
            ) : null}
          </dl>

          <p className="mt-3 text-[0.5rem] tracking-[0.16em] uppercase text-[var(--muted)]">Overlays</p>
          <div className="mt-1 grid grid-cols-1 gap-1">
            {(
              [
                ["mass", "Mass / concentrations"],
                ["void", "Significant void"],
                ["network", "Connective network"],
                ["interior", "Interior analysis domain"],
                ["circulation", "Circulation FAR / AROUND / ZONE / THROUGH"],
                ["skeleton", "Skeleton"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-[0.68rem] text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={flags[key]}
                  onChange={(event) => setFlags((current) => ({ ...current, [key]: event.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          {flags.circulation ? (
            <ul className="mt-2 space-y-0.5 text-[0.58rem] uppercase tracking-[0.08em] text-[var(--muted)]">
              <li>Far · muted grey</li>
              <li>Around / wrap · cyan</li>
              <li>Zone / partial · light orange</li>
              <li>Through · orange</li>
            </ul>
          ) : null}
        </Panel>
      </section>

      <section className="agent-system-region min-w-0">
        <Panel padded={false} className="flex min-h-[22rem] min-w-0 flex-col">
          <div className="flex items-start justify-between gap-3 px-3 pt-3">
            <div>
              <p className="eyebrow">Skill 2 Diagnostic</p>
              <h2 className="panel-title mt-1">Raw Field / Interpreted Morphology</h2>
            </div>
            <span className="border border-[var(--cyan-dim)] px-2 py-0.5 text-[0.58rem] tracking-[0.16em] uppercase text-[var(--cyan)]">
              {running ? "Simulating" : result ? "Ready" : "Idle"}
            </span>
          </div>
          <div className="flex gap-2 px-3 pt-1">
            <button
              type="button"
              onClick={() => setRightView("morphology")}
              className={`border px-1.5 py-0.5 text-[0.5rem] tracking-[0.14em] uppercase ${
                rightView === "morphology"
                  ? "border-[var(--cyan)] text-[var(--cyan-hot)]"
                  : "border-[rgba(242,242,238,0.22)] text-[var(--muted)]"
              }`}
            >
              Morphogenetic
            </button>
            <button
              type="button"
              onClick={() => setRightView("inverse")}
              className={`border px-1.5 py-0.5 text-[0.5rem] tracking-[0.14em] uppercase ${
                rightView === "inverse"
                  ? "border-[var(--cyan)] text-[var(--cyan-hot)]"
                  : "border-[rgba(242,242,238,0.22)] text-[var(--muted)]"
              }`}
            >
              Direct carving
            </button>
            <button
              type="button"
              onClick={() => setRightView("plan")}
              className={`border px-1.5 py-0.5 text-[0.5rem] tracking-[0.14em] uppercase ${
                rightView === "plan"
                  ? "border-[var(--cyan)] text-[var(--cyan-hot)]"
                  : "border-[rgba(242,242,238,0.22)] text-[var(--muted)]"
              }`}
            >
              Plan evidence
            </button>
          </div>
          <div className="skill2-audit-compare min-h-0 flex-1 px-3 pb-3 pt-2">
            <div className="skill2-audit-pane">
              <p className="eyebrow agent-zone-title">Skill 1 Physarum field</p>
              <Skill2RawField snapshot={snapshot} />
            </div>
            <div className="skill2-audit-pane">
              <p className="eyebrow agent-zone-title">
                {rightView === "inverse"
                  ? "DIRECT CARVING  SOLID FIELD − PHYSARUM TRAILS"
                  : rightView === "plan"
                    ? "PLANMODEL XY EVIDENCE"
                    : "Architectural plan"}
              </p>
              {rightView === "plan" ? (
                <>
                  <Skill2PlanEvidenceField plan={plan} flags={planFlags} />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(
                      [
                        ["strong", "Strong"],
                        ["connective", "Connective"],
                        ["mass", "Mass"],
                        ["void", "Void"],
                        ["skeleton", "Skeleton"],
                        ["circulation", "Circulation"],
                        ["endpoints", "Endpoints"],
                        ["branchPoints", "Branch points"],
                        ["source", "Source"],
                        ["attractor", "Attractor"],
                        ["interior", "Interior boundary"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPlanFlags((current) => ({ ...current, [key]: !current[key] }))}
                        className={`border px-1.5 py-0.5 text-[0.48rem] tracking-[0.12em] uppercase ${
                          planFlags[key]
                            ? "border-[var(--cyan)] text-[var(--cyan-hot)]"
                            : "border-[rgba(242,242,238,0.22)] text-[var(--muted)]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[0.5rem] uppercase tracking-[0.1em] text-[var(--muted)]">
                    Weak band — not currently supplied by frozen biological classification
                    {plan ? ` (${String(plan.reinforcement.weakBandSupplied)})` : ""}
                  </p>
                  {plan && planCounts ? (
                    <p className="text-[0.5rem] uppercase tracking-[0.08em] text-[var(--muted)]">
                      {plan.domain.columns}×{plan.domain.rows} · strong {planCounts.strong} · connective{" "}
                      {planCounts.connective} · mass components {plan.mass.components.length} · void components{" "}
                      {plan.void.components.length} · endpoints {plan.network.endpoints.length} · branch points{" "}
                      {plan.network.branchPoints.length}
                    </p>
                  ) : (
                    <p className="text-[0.5rem] uppercase tracking-[0.1em] text-[var(--muted)]">
                      Run a diagnostic to read PlanModel evidence.
                    </p>
                  )}
                </>
              ) : rightView === "inverse" ? (
                <>
                <Skill2DirectInverseField
                  trails={result?.state.trails ?? null}
                  trailSize={result?.state.trailSize ?? 0}
                  carveThreshold={carveThreshold}
                />
                <label className="mt-1 flex flex-col gap-1 text-[0.5rem] tracking-[0.12em] uppercase text-[var(--muted)]">
                  <span>Carving interpretation</span>
                  <span className="flex items-center gap-2">
                  Carve threshold
                  <input
                    type="range"
                    min={0.05}
                    max={0.5}
                    step={0.01}
                    value={carveThreshold}
                    onChange={(event) => setCarveThreshold(Number(event.target.value))}
                    className="range-hud min-w-0 flex-1"
                  />
                  <span className="tabular-nums text-[var(--text)]">{carveThreshold.toFixed(2)}</span>
                  </span>
                </label>
                </>
              ) : (
                <>
              <Skill2WhitePlanField plan={result?.architecturalPlan ?? null} />
              {result ? (
                <p className="mt-1 text-[0.5rem] uppercase tracking-[0.1em] text-[var(--muted)]">
                  {result.architecturalPlan.columns}×{result.architecturalPlan.rows} white plan ·{" "}
                  {result.architecturalPlan.archetypeId}
                </p>
              ) : (
                <p className="mt-1 text-[0.5rem] uppercase tracking-[0.1em] text-[var(--muted)]">
                  Run a diagnostic to read the architectural plan.
                </p>
              )}
                </>
              )}
            </div>
          </div>
          {connection ? (
            <p className="px-3 pb-2 text-[0.58rem] tracking-[0.08em] uppercase text-[var(--muted)]">
              Far {fmt(connection.farNetworkFraction)} · Around {fmt(connection.aroundNetworkFraction)} · Zone{" "}
              {fmt(connection.zoneNetworkFraction)} · Through {fmt(connection.throughNetworkFraction)}
            </p>
          ) : (
            <p className="px-3 pb-2 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
              Run a diagnostic to compare one seed.
            </p>
          )}
        </Panel>
      </section>

      <section className="architectural-output instrument-scroll min-h-0">
        <Panel className="flex min-h-0 flex-col">
          <PanelHeader
            kicker="Biological correspondence"
            title="Nine Criteria"
            aside={
              evaluation ? (
                <span
                  className={`border px-1.5 py-0.5 text-[0.5rem] tracking-[0.16em] uppercase ${
                    evaluation.acceptable
                      ? "border-[var(--cyan)] text-[var(--cyan-hot)]"
                      : "border-[var(--orange)] text-[var(--orange-hot)]"
                  }`}
                >
                  {evaluation.acceptable ? "Acceptable" : "Not acceptable"}
                </span>
              ) : null
            }
          />
          {evaluation ? (
            <>
              <div className="mb-2 grid grid-cols-2 gap-2 text-[0.68rem]">
                <p>
                  Overall {fmt(evaluation.overallPerformance, 1)}
                  <span className="block text-[0.48rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                    gate {EVALUATION_CALIBRATION.overallMinimum}
                  </span>
                </p>
                <p>
                  Min {fmt(evaluation.minimumIndividualPerformance, 1)}
                  <span className="block text-[0.48rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                    floor {EVALUATION_CALIBRATION.individualFloor}
                  </span>
                </p>
              </div>
              <ul className="instrument-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {evaluation.criteria.map((item) => (
                  <li
                    key={item.criterionId}
                    className="border border-[rgba(242,242,238,0.14)] bg-[rgba(255,255,255,0.03)] px-2 py-1.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[0.64rem] uppercase tracking-[0.08em]">{item.criterionName}</span>
                      <span className="text-[0.66rem] text-[var(--orange-hot)]">{item.targetRatingLabel}</span>
                    </div>
                    <p className="mt-0.5 text-[0.8rem] tabular-nums">{fmt(item.correspondenceScore, 1)}</p>
                    <p className="text-[0.58rem] text-[var(--muted)]">
                      Observed {fmt(item.observedCondition)}
                    </p>
                    {item.evidence[0] ? (
                      <p className="mt-0.5 truncate text-[0.52rem] text-[var(--muted)]">
                        {item.evidence
                          .slice(0, 3)
                          .map((row) => `${row.measurement.split(".").pop()}=${fmt(row.value, 2)}`)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.48rem] leading-snug tracking-[0.06em] text-[var(--muted)]">
                Peaks 0.20 / 0.50 / 0.80 · weights 1.0 / 1.15. Not editable.
              </p>
            </>
          ) : (
            <p className="text-[0.68rem] text-[var(--muted)]">No evaluation until a run completes.</p>
          )}
        </Panel>

        <Panel className="mt-2 flex min-h-0 flex-col">
          <PanelHeader
            kicker="Archetype section validity"
            title="Archetype Validity"
            aside={
              result?.validity ? (
                <span
                  className={`border px-1.5 py-0.5 text-[0.5rem] tracking-[0.16em] uppercase ${
                    result.validity.valid
                      ? "border-[var(--cyan)] text-[var(--cyan-hot)]"
                      : "border-[var(--orange)] text-[var(--orange-hot)]"
                  }`}
                >
                  {result.validity.valid ? "Valid" : "Invalid"}
                </span>
              ) : null
            }
          />
          {result?.validity ? (
            <>
              {result.morphogenesis.status !== "formed" ? (
                <p className="mb-2 text-[0.62rem] leading-snug text-[var(--orange-hot)]">
                  Morphogenesis: insufficient biological evidence
                  {result.morphogenesis.reasons[0] ? ` — ${result.morphogenesis.reasons[0]}` : ""}
                </p>
              ) : (
                <p className="mb-2 text-[0.58rem] text-[var(--muted)]">
                  Ops {result.morphogenesis.operations.map((op) => op.op).join(" · ") || "none"}
                </p>
              )}
            <ul className="instrument-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {result.validity.checks.map((item) => (
                <li
                  key={item.id}
                  className="border border-[rgba(242,242,238,0.14)] bg-[rgba(255,255,255,0.03)] px-2 py-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.62rem] uppercase tracking-[0.08em]">{item.label}</span>
                    <span
                      className={
                        item.passed ? "text-[0.58rem] text-[var(--cyan-hot)]" : "text-[0.58rem] text-[var(--orange-hot)]"
                      }
                    >
                      {item.passed ? "Pass" : "Fail"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[0.58rem] text-[var(--muted)]">
                    Observed {fmt(item.observed, 3)} · {item.required}
                  </p>
                  <p className="text-[0.5rem] text-[var(--muted)]">{item.evidence}</p>
                </li>
              ))}
            </ul>
            </>
          ) : (
            <p className="text-[0.68rem] text-[var(--muted)]">
              Geometric identity of the translated section. Independent of frozen biological scores.
            </p>
          )}
        </Panel>
      </section>
    </>
  );
}
