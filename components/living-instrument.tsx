"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AxonModel, SectionDrawing } from "@/components/drawings";
import {
  IconAtmospheric,
  IconFormal,
  IconModel,
  IconSave,
  IconSection,
  IconSpatial,
  Panel,
  PanelHeader,
} from "@/components/hud";
import {
  ArchetypeArchitecturalLayers,
  ArchetypeBehaviorPanel,
  ArchetypeSimulationSettings,
  ArchetypeVisualLegend,
} from "@/components/skill1-archetype-info";
import { Skill1PlanView, Skill1Timeline } from "@/components/skill1-viz";
import {
  PHYSARUM_STEPS,
  TYPOLOGIES,
  WORKFLOW_STEPS,
  defaultRatings,
  findArchetype,
  findTypology,
  groupsForArchetype,
  ratingDescription,
} from "@/lib/catalog";
import { criteriaFit, mulberry32, ratingLabel } from "@/lib/physarum";
import {
  captureSnapshot,
  createSimulation,
  stepMany,
} from "@/lib/skill1/engine";
import { DEFAULT_AGENT_COUNT, DEFAULT_DENSITY, DISPLAY_ITERATIONS, SNAPSHOT_ITERATIONS } from "@/lib/skill1/maps";
import { snapshotFromState } from "@/lib/skill1/section-view";
import {
  behaviorFromRatings,
  paramsFromRatings,
  translateArchetype,
} from "@/lib/skill1/translate";
import type { FieldSnapshot, SimulationState, VizSettings } from "@/lib/skill1/types";
import type { RatingsMap, TypologyId } from "@/lib/types";

const GROUP_ICON = {
  formal: IconFormal,
  spatial: IconSpatial,
  atmospheric: IconAtmospheric,
} as const;

const SIMULATION_INTERVAL = 50;

export function LivingInstrument() {
  const [typologyId, setTypologyId] = useState<TypologyId>("lobby");
  const [archetypeId, setArchetypeId] = useState("vertical-void");
  const [ratings, setRatings] = useState<RatingsMap>(() =>
    defaultRatings(findTypology("lobby").archetypes[0]),
  );
  const [iteration, setIteration] = useState(1);
  const [saved, setSaved] = useState(0);
  const [simulating, setSimulating] = useState(false);
  const [focus, setFocus] = useState<(typeof WORKFLOW_STEPS)[number]>("Physarum");
  const [notice, setNotice] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [state, setState] = useState<SimulationState | null>(null);
  const [snapshots, setSnapshots] = useState<Partial<Record<number, FieldSnapshot>>>({});
  const [viz, setViz] = useState<VizSettings>({
    agentCount: DEFAULT_AGENT_COUNT,
    density: DEFAULT_DENSITY,
    speed: 3,
    trailDecay: 0.986,
    showField: true,
    showAgents: true,
    showTrails: true,
    showAttraction: true,
  });

  const typology = findTypology(typologyId);
  const archetype = findArchetype(typology, archetypeId);
  const original = defaultRatings(archetype);
  const groups = groupsForArchetype(typologyId, archetype, ratings);
  const catalogTranslation = useMemo(
    () => translateArchetype(archetype.id),
    [archetype.id],
  );
  const translation = useMemo(() => {
    const params = paramsFromRatings(ratings);
    return {
      ...catalogTranslation,
      ratings: { ...ratings },
      params,
      behavior: behaviorFromRatings(ratings),
    };
  }, [catalogTranslation, ratings]);
  const behavior = useMemo(() => behaviorFromRatings(ratings), [ratings]);
  const fit = criteriaFit(original, ratings, typologyId);
  const rngRef = useRef<() => number>(() => 0.5);
  const translationRef = useRef(translation);
  const vizRef = useRef(viz);
  const snapshotsRef = useRef(snapshots);
  const stateRef = useRef<SimulationState | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepTickRef = useRef(0);
  const appliedTickRef = useRef(-1);
  const stepResultRef = useRef<SimulationState | null>(null);

  useEffect(() => {
    translationRef.current = translation;
  }, [translation]);
  useEffect(() => {
    vizRef.current = viz;
  }, [viz]);
  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const seedFor = (id: string, nextRun: number) =>
    (0x51c11 ^ (nextRun * 9973) ^ id.length * 131) >>> 0;
  const seed = seedFor(archetype.id, run);

  useEffect(() => {
    if (!simulating) return;

    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const id = window.setInterval(() => {
      const tick = stepTickRef.current + 1;
      stepTickRef.current = tick;
      const snapshotsBefore = snapshotsRef.current;

      setState((current) => {
        if (!current || current.converged || !translationRef.current) {
          return current;
        }
        if (appliedTickRef.current === tick && stepResultRef.current) {
          return stepResultRef.current;
        }

        const settings = vizRef.current;
        const next = stepMany(
          current,
          translationRef.current,
          rngRef.current,
          settings.speed,
          settings.trailDecay,
        );

        const marks = snapshotsRef.current;
        let nextMarks = marks;
        for (const mark of SNAPSHOT_ITERATIONS) {
          if (!nextMarks[mark] && next.iteration >= mark) {
            if (nextMarks === marks) nextMarks = { ...marks };
            nextMarks[mark] = captureSnapshot(next);
          }
        }
        snapshotsRef.current = nextMarks;

        const copy = { ...next };
        appliedTickRef.current = tick;
        stepResultRef.current = copy;
        stateRef.current = copy;
        return copy;
      });

      if (snapshotsRef.current !== snapshotsBefore) {
        setSnapshots(snapshotsRef.current);
      }

      if (stateRef.current?.converged) {
        setSimulating(false);
      }
    }, SIMULATION_INTERVAL);

    intervalRef.current = id;
    return () => {
      window.clearInterval(id);
      if (intervalRef.current === id) intervalRef.current = null;
    };
  }, [simulating]);

  const liveSnapshot = useMemo(
    () => (state ? snapshotFromState(state) : null),
    [state],
  );
  const simIteration = state?.iteration ?? 0;

  const clearField = () => {
    setSimulating(false);
    setState(null);
    stateRef.current = null;
    appliedTickRef.current = -1;
    stepResultRef.current = null;
    snapshotsRef.current = {};
    setSnapshots({});
  };

  const pulse = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1600);
  };

  const selectTypology = (id: TypologyId) => {
    const next = findTypology(id);
    const first = next.archetypes[0];
    setTypologyId(id);
    setArchetypeId(first.id);
    setRatings(defaultRatings(first));
    setIteration(1);
    setRun(0);
    clearField();
    setFocus("Typology");
  };

  const selectArchetype = (id: string) => {
    const next = findArchetype(typology, id);
    setArchetypeId(next.id);
    setRatings(defaultRatings(next));
    setIteration(1);
    setRun(0);
    clearField();
    setFocus("Archetype");
  };

  const generate = () => {
    const nextSeed = seedFor(archetype.id, run);
    rngRef.current = mulberry32(nextSeed ^ 0x9e3779b9);
    translationRef.current = translation;
    const sim = createSimulation(translation, nextSeed, vizRef.current.agentCount);
    sim.maxIterations = DISPLAY_ITERATIONS;
    const first = captureSnapshot(sim);
    const initial = { 0: first };
    snapshotsRef.current = initial;
    setSnapshots(initial);
    stateRef.current = sim;
    appliedTickRef.current = -1;
    stepResultRef.current = null;
    setState(sim);
    setSimulating(true);
    setFocus("Physarum");
    pulse(`Generating ${archetype.name}`);
  };

  const resetField = () => {
    clearField();
    setFocus("Physarum");
    pulse("Field cleared");
  };

  const regenerate = () => {
    const next = run + 1;
    setRun(next);
    setIteration(next);
    setFocus("Iteration");
    const nextSeed = seedFor(archetype.id, next);
    rngRef.current = mulberry32(nextSeed ^ 0x9e3779b9);
    translationRef.current = translation;
    const sim = createSimulation(translation, nextSeed, vizRef.current.agentCount);
    sim.maxIterations = DISPLAY_ITERATIONS;
    const first = captureSnapshot(sim);
    const initial = { 0: first };
    snapshotsRef.current = initial;
    setSnapshots(initial);
    stateRef.current = sim;
    appliedTickRef.current = -1;
    stepResultRef.current = null;
    setState(sim);
    setSimulating(true);
    pulse("New iteration seeded from current criteria");
  };

  const saveIteration = () => {
    setSaved((n) => n + 1);
    setFocus("Iteration");
    pulse(`Iteration ${String(iteration).padStart(2, "0")} saved`);
  };

  return (
    <div className="flex min-h-dvh flex-col px-2 py-2 text-[13px] md:h-dvh md:overflow-hidden md:px-3 md:py-2.5">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
        <div>
          <p className="display text-[1.05rem] text-white cyan-glow md:text-[1.25rem]">
            Living Morphologies
          </p>
          <p className="eyebrow mt-0.5 text-[0.58rem]">Emergent Network</p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Typology">
          {TYPOLOGIES.map((item) => {
            const active = item.id === typologyId;
            return (
              <button
                key={item.id}
                type="button"
                title={item.definition}
                aria-label={`${item.label}. ${item.definition}`}
                onClick={() => selectTypology(item.id)}
                className={`group relative min-w-[7.5rem] border px-4 py-1.5 text-[0.72rem] tracking-[0.22em] uppercase transition ${
                  active
                    ? "border-[var(--cyan)] bg-[rgba(0,228,255,0.12)] text-[var(--cyan-hot)] cyan-glow"
                    : "border-[rgba(0,228,255,0.18)] text-[var(--muted)] hover:border-[var(--cyan-dim)] hover:text-[var(--text)]"
                }`}
              >
                {item.label}
                <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-30 hidden w-[18rem] -translate-x-1/2 border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-left text-[0.68rem] normal-case tracking-normal text-[#d5eef6] shadow-[0_12px_30px_rgba(0,0,0,0.45)] group-hover:block group-focus-visible:block">
                  {item.definition}
                </span>
              </button>
            );
          })}
        </nav>
        <label className="flex items-center gap-2 text-[0.68rem] tracking-[0.18em] uppercase text-[var(--muted)]">
          <span className="inline-flex h-7 w-7 items-center justify-center border border-[var(--cyan-dim)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3" y="5" width="18" height="14" />
              <path d="M3 9h18" />
            </svg>
          </span>
          <select
            defaultValue="screen"
            className="border border-[var(--cyan-dim)] bg-transparent px-2 py-1 text-[var(--text)]"
          >
            <option value="screen">Screen</option>
          </select>
        </label>
      </header>

      <ol className="mb-2 flex gap-1 overflow-x-auto instrument-scroll pb-1">
        {WORKFLOW_STEPS.map((step, index) => {
          const active = step === focus;
          return (
            <li key={step} className="flex items-center gap-1">
              <span
                className={`whitespace-nowrap border px-2 py-0.5 text-[0.58rem] tracking-[0.16em] uppercase ${
                  active
                    ? "border-[var(--orange)] text-[var(--orange-hot)] orange-glow"
                    : "border-[rgba(0,228,255,0.16)] text-[var(--muted)]"
                }`}
              >
                {String(index + 1).padStart(2, "0")} {step}
              </span>
              {index < WORKFLOW_STEPS.length - 1 ? (
                <span className="text-[var(--cyan-dim)]">›</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[8rem_12.75rem_minmax(0,1fr)_15rem] md:grid-rows-[minmax(0,1fr)]">
        <Panel className="flex flex-col">
          <PanelHeader kicker="Input" title="Archetype" />
          <div className="flex flex-1 flex-col gap-1.5">
            {typology.archetypes.map((item) => {
              const active = item.id === archetype.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectArchetype(item.id)}
                  className={`border px-1.5 py-1.5 text-left text-[0.58rem] leading-tight tracking-[0.08em] uppercase transition ${
                    active
                      ? "border-[var(--cyan)] bg-[rgba(0,228,255,0.16)] text-white"
                      : "border-[rgba(0,228,255,0.16)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={saveIteration}
            className="mt-3 inline-flex items-center justify-center gap-2 border border-[var(--cyan-dim)] px-3 py-2 text-[0.68rem] tracking-[0.22em] uppercase text-[var(--cyan)] hover:bg-[rgba(0,228,255,0.08)]"
          >
            <IconSave /> Save
          </button>
        </Panel>

        <Panel className="flex min-h-0 flex-col">
          <PanelHeader
            kicker="Analysis"
            title="Criteria Configuration"
            aside={
              <span className="border border-[rgba(0,228,255,0.28)] px-1.5 py-0.5 text-[0.5rem] tracking-[0.16em] uppercase text-[var(--cyan)]">
                Locked
              </span>
            }
          />
          <div className="instrument-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {groups.map((group) => {
              const Icon = GROUP_ICON[group.id];
              return (
                <div
                  key={group.id}
                  className="border border-[rgba(0,228,255,0.14)] bg-[rgba(0,20,28,0.35)] px-2 py-1.5"
                >
                  <div className="mb-1 flex items-center gap-2 text-[var(--cyan)]">
                    <Icon />
                    <div>
                      <p className="text-[0.66rem] tracking-[0.18em] uppercase">
                        {group.title}
                      </p>
                      <p className="text-[0.5rem] tracking-[0.12em] uppercase text-[var(--muted)]">
                        {group.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {group.criteria.map((criterion) => {
                      const value = ratings[criterion.id] ?? criterion.rating;
                      const description = ratingDescription(
                        criterion.definition,
                        value,
                      );
                      return (
                        <div
                          key={criterion.id}
                          className="block cursor-not-allowed"
                          title={`${description} Ranked and locked.`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[0.64rem] tracking-[0.08em] uppercase text-[var(--text)]">
                              {criterion.label}
                            </span>
                            <span className="text-[0.66rem] text-[var(--orange-hot)]">
                              {ratingLabel(value)} {value}
                            </span>
                          </div>
                          <input
                            className="range-hud"
                            data-high={value === 2 ? "true" : "false"}
                            type="range"
                            min={0}
                            max={2}
                            step={1}
                            value={value}
                            disabled
                            aria-readonly="true"
                            aria-disabled="true"
                            aria-valuetext={`${ratingLabel(value)}. Ranked and locked. ${description}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-0.5 flex justify-between text-[0.48rem] tracking-[0.14em] uppercase text-[var(--muted)]">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                  </div>
                  <p className="mt-1 border-t border-[rgba(0,228,255,0.12)] pt-1 text-[0.7rem] tracking-[0.12em] uppercase text-[#d5eef6]">
                    <span className="mr-1 text-[0.48rem] tracking-[0.14em] text-[var(--cyan)]">
                      {group.title} descriptor
                    </span>
                    {group.descriptor}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 border border-[rgba(0,228,255,0.2)] bg-[rgba(0,40,48,0.28)] p-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--cyan)]">
                Generated Descriptor
              </p>
              <span className="text-[0.5rem] text-[var(--muted)]">v1.0</span>
            </div>
            <ul className="space-y-1">
              {groups.map((group) => (
                <li
                  key={group.id}
                  className="flex items-baseline justify-between gap-2 text-[0.7rem] uppercase tracking-[0.08em] text-[#d5eef6]"
                >
                  <span className="text-[0.48rem] tracking-[0.16em] text-[var(--muted)]">
                    {group.title}
                  </span>
                  <span>{group.descriptor}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel padded={false} className="flex min-h-[22rem] min-w-0 flex-col md:min-h-0">
          <div className="flex items-start justify-between gap-3 px-3 pt-3">
            <div>
              <p className="eyebrow">Physarum Workflow</p>
              <h2 className="panel-title cyan-glow mt-1">Emergent Spatial Logic</h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`border px-2 py-0.5 text-[0.58rem] tracking-[0.16em] uppercase ${
                  simulating
                    ? "border-[var(--orange)] text-[var(--orange-hot)]"
                    : "border-[var(--cyan-dim)] text-[var(--cyan)]"
                }`}
              >
                {simulating ? "Simulating" : state?.converged ? "Converged" : "Stable"}
              </span>
              <span className="text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                Iteration {String(simIteration).padStart(3, "0")}
              </span>
            </div>
          </div>
          <ol className="mt-3 flex gap-1 overflow-x-auto px-3 instrument-scroll">
            {PHYSARUM_STEPS.map((step) => {
              const active = step.n === 3;
              return (
                <li
                  key={step.n}
                  className={`min-w-[6.4rem] flex-1 border px-2 py-1.5 ${
                    active
                      ? "border-[var(--orange)] bg-[rgba(255,122,50,0.1)]"
                      : "border-[rgba(0,228,255,0.16)]"
                  }`}
                >
                  <p className={`text-[0.62rem] tracking-[0.14em] uppercase ${active ? "text-[var(--orange-hot)]" : "text-[var(--cyan)]"}`}>
                    {step.n} {step.title}
                  </p>
                  <p className="text-[0.58rem] text-[var(--muted)]">{step.caption}</p>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 grid grid-cols-3 gap-1.5 px-3">
            <button
              type="button"
              onClick={generate}
              className="border border-[var(--orange)] bg-[rgba(255,122,50,0.14)] px-2 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--orange-hot)] hover:bg-[rgba(255,122,50,0.22)]"
            >
              Generate
            </button>
            <button
              type="button"
              onClick={resetField}
              className="border border-[var(--cyan-dim)] px-2 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--cyan)] hover:bg-[rgba(0,228,255,0.08)]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={regenerate}
              className="border border-[var(--cyan-dim)] px-2 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--cyan)] hover:bg-[rgba(0,228,255,0.08)]"
            >
              Regenerate
            </button>
          </div>
          <div className="px-3 pt-2">
            <Skill1Timeline snapshots={snapshots} currentIteration={simIteration} compact density={viz.density} />
          </div>
          <div className="relative mt-2 min-h-[16rem] flex-1 bg-[#071018]">
            <Skill1PlanView snapshot={liveSnapshot} density={viz.density} />
          </div>
          <div className="flex items-center justify-between border-t border-[rgba(0,228,255,0.16)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase text-[var(--muted)]">
            <span>Physarum interpreting criteria · 2D agent field</span>
            <span>Iteration {String(simIteration).padStart(3, "0")}</span>
          </div>
        </Panel>

        <div className="instrument-scroll flex min-h-0 flex-col gap-2 overflow-y-auto">
          <Panel>
            <PanelHeader kicker={archetype.name} title="Agent Field" />
            <div className="space-y-3">
              <ArchetypeBehaviorPanel behavior={behavior} />
              <ArchetypeSimulationSettings
                behavior={behavior}
                translation={translation}
                viz={viz}
                seed={seed}
                onAgentCount={(value) =>
                  setViz((current) => ({ ...current, agentCount: value }))
                }
                onDensity={(value) =>
                  setViz((current) => ({ ...current, density: value }))
                }
                onSpeed={(value) => setViz((current) => ({ ...current, speed: value }))}
              />
              <ArchetypeVisualLegend />
              <ArchetypeArchitecturalLayers topology={translation.topology} />
            </div>
          </Panel>
          <Panel className="flex min-h-0 flex-[1.15] flex-col">
            <PanelHeader
              kicker="Architectural Output"
              title="Generated From Emergent Logic"
            />
            <div className="mb-1 flex items-center justify-between text-[0.62rem] tracking-[0.16em] uppercase text-[var(--cyan)]">
              <span className="inline-flex items-center gap-1.5">
                <IconSection /> 2D Wall Section
              </span>
              <span className="text-[var(--muted)]">v1.0</span>
            </div>
            <div className="min-h-[9rem] flex-1 border border-[rgba(0,228,255,0.16)] bg-[#071018]">
              <SectionDrawing ratings={ratings} title={archetype.name} />
            </div>
          </Panel>

          <Panel className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1 flex items-center justify-between text-[0.62rem] tracking-[0.16em] uppercase text-[var(--cyan)]">
              <span className="inline-flex items-center gap-1.5">
                <IconModel /> 2.5D Model
              </span>
              <span className="text-[var(--muted)]">v1.0</span>
            </div>
            <div className="min-h-[8rem] flex-1 border border-[rgba(0,228,255,0.16)] bg-[#071018]">
              <AxonModel ratings={ratings} />
            </div>
          </Panel>

          <Panel>
            <p className="eyebrow mb-2">Evaluation</p>
            <div className="space-y-1.5">
              <FitBar label="Formal" value={fit.formal} />
              <FitBar label="Spatial" value={fit.spatial} />
              <FitBar label="Atmospheric" value={fit.atmospheric} />
            </div>
            <p className="mt-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--muted)]">
              Criteria fit {Math.round(fit.overall * 100)}% versus precedent ratings
            </p>
          </Panel>

          <Panel>
            <PanelHeader title="Iteration Controls" />
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={regenerate}
                className="border border-[var(--orange)] bg-[rgba(255,122,50,0.14)] px-2 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--orange-hot)] hover:bg-[rgba(255,122,50,0.22)]"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={() => {
                  setFocus("Criteria");
                  pulse("Ranked criteria are locked to catalog analysis");
                }}
                className="border border-[var(--cyan-dim)] px-2 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--cyan)] hover:bg-[rgba(0,228,255,0.08)]"
              >
                View Criteria
              </button>
              <button
                type="button"
                onClick={saveIteration}
                className="border border-[var(--cyan-dim)] px-2 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--cyan)] hover:bg-[rgba(0,228,255,0.08)]"
              >
                Save Iteration
              </button>
            </div>
            <p className="mt-2 text-center text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)]">
              Maria Alonso · Julieta Segura · Renata Maglino
            </p>
          </Panel>
        </div>
      </div>

      <footer className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
        <span>Design 7 Prof. Daniel Bolojan</span>
        <span>
          {saved > 0 ? `${saved} saved · ` : ""}
          {archetype.name} / {typology.label}
        </span>
      </footer>

      {notice ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-20 -translate-x-1/2 border border-[var(--cyan)] bg-[var(--panel-strong)] px-4 py-2 text-[0.7rem] tracking-[0.16em] uppercase text-[var(--cyan-hot)]">
          {notice}
        </div>
      ) : null}
    </div>
  );
}

function FitBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1 bg-[rgba(0,228,255,0.12)]">
        <div
          className="h-1 bg-[linear-gradient(90deg,var(--cyan),var(--orange))]"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}
