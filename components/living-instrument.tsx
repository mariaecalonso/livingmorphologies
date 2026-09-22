"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AxonModel, SectionDrawing } from "@/components/drawings";
import { DisplayMode, DisplayModeToggle } from "@/components/display-mode-toggle";
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
  ArchetypeBehaviorPanel,
  ArchetypeSimulationSettings,
} from "@/components/skill1-archetype-info";
import { Skill1PlanView } from "@/components/skill1-viz";
import { Skill2AuditWorkspace } from "@/components/skill2-audit";
import { DIRECT_CARVE_THRESHOLD, Skill2DirectInverseField } from "@/components/skill2-audit-views";
import {
  TYPOLOGIES,
  WORKFLOW_STEPS,
  defaultRatings,
  findArchetype,
  findTypology,
  groupsForArchetype,
  ratingDescription,
} from "@/lib/catalog";
import { mulberry32, ratingLabel } from "@/lib/physarum";
import {
  captureSnapshot,
  createSimulation,
  stepMany,
} from "@/lib/skill1/engine";
import {
  DEFAULT_AGENT_COUNT,
  DEFAULT_DENSITY,
  DISPLAY_ITERATIONS,
} from "@/lib/skill1/maps";
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

const PRESENTATION_WORKFLOW_STEPS = [
  { label: "Typology", focus: "Typology" },
  { label: "Archetype", focus: "Archetype" },
  { label: "Criteria", focus: "Criteria" },
  { label: "Descriptors", focus: "Descriptors" },
  { label: "Physarum", focus: "Physarum" },
  { label: "2D Section", focus: "2D Section" },
  { label: "2.5D Propagation", focus: "Iteration" },
  { label: "3D Model", focus: "3D Model" },
] as const;

const CONTROL_DEBOUNCE_MS = 220;

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
  const [targetIterations, setTargetIterations] = useState(DISPLAY_ITERATIONS);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("desktop");
  const [workspace, setWorkspace] = useState<"skill1" | "skill2-audit">("skill1");
  const [carveThreshold, setCarveThreshold] = useState(DIRECT_CARVE_THRESHOLD);
  const physarumExportRef = useRef<HTMLDivElement>(null);
  const carvingExportRef = useRef<HTMLDivElement>(null);

  const typology = findTypology(typologyId);
  const archetype = findArchetype(typology, archetypeId);
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
  const rngRef = useRef<() => number>(() => 0.5);
  const translationRef = useRef(translation);
  const vizRef = useRef(viz);
  const snapshotsRef = useRef(snapshots);
  const stateRef = useRef<SimulationState | null>(null);
  const generationRef = useRef(0);
  const targetIterationsRef = useRef(targetIterations);
  const debounceRef = useRef<number | null>(null);
  const runPresentationSimulationRef = useRef<() => void>(() => {});

  useEffect(() => {
    translationRef.current = translation;
  }, [translation]);
  useEffect(() => {
    vizRef.current = viz;
  }, [viz]);
  useEffect(() => {
    targetIterationsRef.current = targetIterations;
  }, [targetIterations]);
  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => () => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }
    generationRef.current += 1;
  }, []);

  const seedFor = (id: string, nextRun: number) =>
    (0x51c11 ^ (nextRun * 9973) ^ id.length * 131) >>> 0;
  const seed = seedFor(archetype.id, run);

  const publishFinalField = (sim: SimulationState, generation: number) => {
    window.setTimeout(() => {
      if (generationRef.current !== generation || !translationRef.current) return;
      const finalState = stepMany(
        sim,
        translationRef.current,
        rngRef.current,
        sim.maxIterations,
        vizRef.current.trailDecay,
      );
      if (generationRef.current !== generation) return;
      const snapshot = captureSnapshot(finalState);
      const marks = { [snapshot.iteration]: snapshot };
      snapshotsRef.current = marks;
      setSnapshots(marks);
      stateRef.current = finalState;
      setState({ ...finalState });
      setSimulating(false);
    }, 48);
  };

  const liveSnapshot = useMemo(
    () => (state ? snapshotFromState(state) : null),
    [state],
  );

  const cancelPendingGeneration = () => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    generationRef.current += 1;
  };

  const runPresentationSimulation = () => {
    const nextSeed = seedFor(archetype.id, run);
    rngRef.current = mulberry32(nextSeed ^ 0x9e3779b9);
    translationRef.current = translation;
    const sim = createSimulation(translation, nextSeed, vizRef.current.agentCount);
    sim.maxIterations = targetIterationsRef.current;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSimulating(true);
    publishFinalField(sim, generation);
  };
  runPresentationSimulationRef.current = runPresentationSimulation;

  const scheduleAutoGenerate = () => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }
    generationRef.current += 1;
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      runPresentationSimulationRef.current();
    }, CONTROL_DEBOUNCE_MS);
  };

  const patchViz = (patch: Partial<VizSettings>) => {
    setViz((current) => {
      const next = { ...current, ...patch };
      vizRef.current = next;
      return next;
    });
    scheduleAutoGenerate();
  };

  const clearField = () => {
    cancelPendingGeneration();
    setSimulating(false);
    setState(null);
    stateRef.current = null;
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
    cancelPendingGeneration();
    setFocus("Physarum");
    pulse(`Generating ${archetype.name}`);
    runPresentationSimulation();
  };

  const resetField = () => {
    clearField();
    setFocus("Physarum");
    pulse("Field cleared");
  };

  const regenerate = () => {
    cancelPendingGeneration();
    const next = run + 1;
    setRun(next);
    setIteration(next);
    setFocus("Iteration");
    const nextSeed = seedFor(archetype.id, next);
    rngRef.current = mulberry32(nextSeed ^ 0x9e3779b9);
    translationRef.current = translation;
    const sim = createSimulation(translation, nextSeed, vizRef.current.agentCount);
    sim.maxIterations = targetIterationsRef.current;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSimulating(true);
    pulse("New iteration seeded from current criteria");
    publishFinalField(sim, generation);
  };

  const saveIteration = () => {
    setSaved((n) => n + 1);
    setFocus("Iteration");
    pulse(`Iteration ${String(iteration).padStart(2, "0")} saved`);
  };

  const exportFileName = (kind: "physarum" | "carving") => {
    const slug = (value: string) =>
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${slug(typology.id)}-${slug(archetype.id)}-${kind}.png`;
  };

  const saveCanvasPng = (root: HTMLDivElement | null, filename: string) => {
    const canvas = root?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = filename;
    link.click();
  };

  return (
    <div className="living-instrument-shell flex min-h-dvh flex-col px-2 py-2 text-[13px] md:h-dvh md:overflow-hidden md:px-3 md:py-2.5" data-display-mode={displayMode}>
      <header className="living-instrument-header mb-2 flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
        <div className="living-instrument-header-identity">
          <p className="display text-[1.05rem] text-white md:text-[1.25rem]">
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
                    ? "border-[var(--cyan)] bg-[linear-gradient(90deg,rgba(15,115,119,0.16),rgba(199,126,95,0.16))] text-white"
                    : "border-[rgba(242,242,238,0.18)] text-[var(--muted)] hover:border-[rgba(242,242,238,0.38)] hover:text-[var(--text)]"
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
        <div className="living-instrument-display-mode flex items-center gap-2" aria-label="Display mode">
          <button
            type="button"
            onClick={() => setWorkspace((current) => (current === "skill1" ? "skill2-audit" : "skill1"))}
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
          >
            {workspace === "skill2-audit" ? "Skill 2 Audit" : "Skill 1"}
          </button>
          <DisplayModeToggle mode={displayMode} onModeChange={setDisplayMode} />
        </div>
      </header>

      <ol
        className="living-instrument-workflow mb-2 hidden flex gap-1 overflow-x-auto instrument-scroll pb-1"
        aria-hidden="true"
      >
        {displayMode === "presentation"
          ? PRESENTATION_WORKFLOW_STEPS.map((step, index) => {
              const active = step.focus === focus;
              return (
                <li key={step.label} className="flex items-center gap-1">
                  <span
                    className={`whitespace-nowrap border px-2 py-0.5 text-[0.58rem] tracking-[0.16em] uppercase ${
                      active
                        ? "border-[var(--orange)] text-[var(--orange-hot)] orange-glow"
                        : "border-[rgba(242,242,238,0.14)] text-[var(--muted)]"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")} {step.label}
                  </span>
                  {index < PRESENTATION_WORKFLOW_STEPS.length - 1 ? (
                    <span className="text-[var(--muted)]">›</span>
                  ) : null}
                </li>
              );
            })
          : WORKFLOW_STEPS.map((step, index) => {
              const active = step === focus;
              return (
                <li key={step} className="flex items-center gap-1">
                  <span
                    className={`whitespace-nowrap border px-2 py-0.5 text-[0.58rem] tracking-[0.16em] uppercase ${
                      active
                        ? "border-[var(--orange)] text-[var(--orange-hot)] orange-glow"
                        : "border-[rgba(242,242,238,0.14)] text-[var(--muted)]"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")} {step}
                  </span>
                  {index < WORKFLOW_STEPS.length - 1 ? (
                    <span className="text-[var(--muted)]">›</span>
                  ) : null}
                </li>
              );
            })}
      </ol>

      <div className="living-instrument-content grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[8rem_12.75rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
        <section className="archetype-region">
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
                      ? "border-[var(--cyan)] bg-[linear-gradient(90deg,rgba(15,115,119,0.14),rgba(199,126,95,0.14))] text-white"
                      : "border-[rgba(242,242,238,0.16)] text-[var(--muted)] hover:border-[rgba(242,242,238,0.32)] hover:text-[var(--text)]"
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
            className="mt-3 inline-flex items-center justify-center gap-2 border border-[rgba(242,242,238,0.28)] px-3 py-2 text-[0.68rem] tracking-[0.22em] uppercase text-[var(--text)] hover:border-[rgba(242,242,238,0.5)]"
          >
            <IconSave /> Save
          </button>
        </Panel>
        </section>

        {workspace === "skill2-audit" ? (
          <Skill2AuditWorkspace
            key={`${typologyId}-${archetype.id}`}
            typologyId={typologyId}
            archetypeId={archetype.id}
          />
        ) : (
          <>
        <section className="criteria-region">
        <Panel className="flex min-h-0 flex-col">
          <PanelHeader
            kicker="Analysis"
            title="Criteria Configuration"
            aside={
              <span className="border border-[rgba(242,242,238,0.24)] px-1.5 py-0.5 text-[0.5rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                Locked
              </span>
            }
          />
          <div className="criteria-groups min-h-0 flex-1 space-y-1.5 overflow-hidden">
            {groups.map((group) => {
              const Icon = GROUP_ICON[group.id];
              return (
                <div
                  key={group.id}
                  className="criteria-group border border-[rgba(242,242,238,0.14)] bg-[rgba(255,255,255,0.03)] px-2 py-1.5"
                >
                  <div className="mb-1 flex items-center gap-2 text-[var(--text)]">
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
                            <span className="text-[0.66rem] uppercase tracking-[0.12em] text-[var(--orange-hot)]">
                              {ratingLabel(value)}
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
                  <div className="criteria-scale mt-0.5 flex justify-between text-[0.48rem] tracking-[0.14em] uppercase text-[var(--muted)]">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                  </div>
                  <p className="mt-1 border-t border-[rgba(242,242,238,0.12)] pt-1 text-[0.7rem] tracking-[0.12em] uppercase text-[#d5eef6]">
                    <span className="mr-1 text-[0.48rem] tracking-[0.14em] text-[var(--muted)]">
                      {group.title} descriptor
                    </span>
                    {group.descriptor}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="descriptor-region mt-1.5 border border-[rgba(242,242,238,0.18)] bg-[rgba(255,255,255,0.04)] p-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--text)]">
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
        </section>

        <section className="agent-system-region min-w-0">
          <Panel padded={false} className="flex min-h-[22rem] min-w-0 flex-col">
            <div className="flex items-start justify-between gap-3 px-3 pt-3">
              <div>
                <p className="eyebrow">Physarum Workflow</p>
                <h2 className="panel-title mt-1">Emergent Spatial Logic</h2>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`border px-2 py-0.5 text-[0.58rem] tracking-[0.16em] uppercase ${
                    simulating
                      ? "border-[var(--orange)] text-[var(--orange-hot)]"
                      : "border-[var(--cyan-dim)] text-[var(--cyan)]"
                  }`}
                >
                  {simulating ? "Generating" : state?.converged ? "Converged" : "Ready"}
                </span>
              </div>
            </div>
            <div className="agent-system-body min-h-0 flex-1 px-3 pb-3 pt-2">
              <aside className="agent-information instrument-scroll" aria-label="Agent simulation">
                <div className="agent-information-header">
                  <p className="eyebrow">{archetype.name}</p>
                  <h3 className="panel-title mt-1">Agent / Simulation</h3>
                </div>
                <div className="agent-logic">
                  <ArchetypeBehaviorPanel behavior={translation.behavior} />
                  <ArchetypeSimulationSettings
                    behavior={translation.behavior}
                    translation={translation}
                    viz={viz}
                    seed={seed}
                    iterations={targetIterations}
                    onAgentCount={(agentCount) => patchViz({ agentCount })}
                    onDensity={(density) => patchViz({ density })}
                    onSpeed={(speed) => patchViz({ speed })}
                    onIterations={(value) => {
                      targetIterationsRef.current = value;
                      setTargetIterations(value);
                      scheduleAutoGenerate();
                    }}
                    onTrailDecay={(trailDecay) => patchViz({ trailDecay })}
                  />
                </div>
                <div className="mt-3 border-t border-[rgba(242,242,238,0.14)] pt-2">
                  <p className="eyebrow mb-1.5">Field</p>
                  <ul className="space-y-1 text-[0.62rem] uppercase tracking-[0.1em] text-[var(--muted)]">
                    <li className="flex items-center gap-2">
                      <span className="field-key-swatch field-key-swatch-strong" />
                      Stronger / reinforced activity
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="field-key-swatch field-key-swatch-weak" />
                      Weaker / lower activity
                    </li>
                  </ul>
                </div>
              </aside>

              <div className="agent-compare">
                <div className="agent-compare-head">
                  <p className="eyebrow agent-zone-title">Physarum field</p>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={generate}
                      className="border border-[var(--orange)] bg-[rgba(199,126,95,0.16)] px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase text-[var(--orange-hot)]"
                    >
                      Generate
                    </button>
                    <button
                      type="button"
                      onClick={resetField}
                      className="border border-[var(--cyan-dim)] px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase text-[var(--cyan)]"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={regenerate}
                      className="border border-[var(--cyan-dim)] px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase text-[var(--cyan)]"
                    >
                      Regenerate
                    </button>
                    <button
                      type="button"
                      title="Save Physarum PNG"
                      aria-label="Save Physarum PNG"
                      onClick={() => saveCanvasPng(physarumExportRef.current, exportFileName("physarum"))}
                      className="inline-flex h-7 w-7 items-center justify-center border border-[rgba(242,242,238,0.28)] text-[var(--text)] hover:border-[rgba(242,242,238,0.5)]"
                    >
                      <IconSave />
                    </button>
                  </div>
                </div>
                <div className="agent-compare-head">
                  <p className="eyebrow agent-zone-title">Carving</p>
                  <button
                    type="button"
                    title="Save Carving PNG"
                    aria-label="Save Carving PNG"
                    onClick={() => saveCanvasPng(carvingExportRef.current, exportFileName("carving"))}
                    className="inline-flex h-7 w-7 items-center justify-center border border-[rgba(242,242,238,0.28)] text-[var(--text)] hover:border-[rgba(242,242,238,0.5)]"
                  >
                    <IconSave />
                  </button>
                </div>
                <div className="agent-stage" ref={physarumExportRef}>
                  <div className="agent-stage-square agent-field bg-[#000000]">
                    <Skill1PlanView snapshot={liveSnapshot} density={viz.density} showHud={false} />
                  </div>
                </div>
                <div className="agent-stage" ref={carvingExportRef}>
                  <div className="agent-stage-square agent-field bg-[#000000]">
                    <Skill2DirectInverseField
                      trails={liveSnapshot?.trails ?? null}
                      trailSize={liveSnapshot?.trailSize ?? 0}
                      carveThreshold={carveThreshold}
                      showCaption={false}
                      revision={liveSnapshot?.iteration ?? 0}
                    />
                  </div>
                </div>
                <p className="agent-compare-foot text-[0.52rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                  {simulating ? "Running" : state?.converged ? "Converged" : "Ready"}
                </p>
                <label className="agent-carve-control flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                  <span className="flex items-center justify-between gap-2">
                    <span>Carving threshold</span>
                    <span className="tabular-nums text-[var(--text)]">{carveThreshold.toFixed(2)}</span>
                  </span>
                  <input
                    className="range-hud"
                    type="range"
                    min={0.05}
                    max={0.5}
                    step={0.01}
                    value={carveThreshold}
                    onChange={(event) => setCarveThreshold(Number(event.target.value))}
                  />
                </label>
              </div>
            </div>
          </Panel>
        </section>

        <section className="architectural-output instrument-scroll min-h-0" hidden>
          <Panel className="architectural-output-panel architectural-output-section flex min-h-0 flex-col">
            <PanelHeader
              kicker="Architectural Output"
              title="Generated From Emergent Logic"
            />
            <div className="mb-1 flex items-center justify-between text-[0.62rem] tracking-[0.16em] uppercase text-[var(--text)]">
              <span className="inline-flex items-center gap-1.5">
                <IconSection /> 2D Wall Section
              </span>
              <span className="text-[var(--muted)]">v1.0</span>
            </div>
            <div className="architectural-output-viewport architectural-output-section-viewport min-h-0 flex-1 border border-[rgba(242,242,238,0.18)] bg-[#000000]">
              <SectionDrawing ratings={ratings} title={archetype.name} />
            </div>
          </Panel>

          <Panel className="architectural-output-panel architectural-output-axon flex min-h-0 flex-col">
            <div className="architectural-output-heading mb-1 flex items-start justify-between gap-2 text-[0.62rem] tracking-[0.16em] uppercase text-[var(--text)]">
              <span className="inline-flex items-center gap-1.5">
                <IconModel /> 2.5D Axonometric Preview
              </span>
              <span className="text-right text-[var(--muted)]">Current</span>
            </div>
            <p className="architectural-output-status">Skill 2 Propagation Pending</p>
            <div className="architectural-output-viewport architectural-output-axon-viewport min-h-0 flex-1 border border-[rgba(242,242,238,0.18)] bg-[#000000]">
              <AxonModel ratings={ratings} />
            </div>
          </Panel>

          <Panel className="skill3-pending-panel architectural-output-panel architectural-output-3d">
            <p className="eyebrow">3D Model</p>
            <p className="mt-1 text-[0.62rem] tracking-[0.14em] uppercase text-[var(--muted)]">
              Skill 3 Pending
            </p>
          </Panel>
        </section>
          </>
        )}
      </div>

      <footer className="living-instrument-footer mt-2 grid grid-cols-3 items-center gap-2 px-1 text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
        <span className="living-instrument-footer-left">Design 7 Prof. Daniel Bolojan</span>
        <span className="living-instrument-footer-center text-center">
          {archetype.name} / {typology.label}
        </span>
        <span className="living-instrument-footer-right text-right">
          {saved > 0 ? `${saved} saved · ` : ""}
          Maria Alonso · Julieta Segura · Renata Maguino
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