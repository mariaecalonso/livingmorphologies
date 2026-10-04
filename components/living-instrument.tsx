"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AxonModel, SectionDrawing } from "@/components/drawings";
import type { DisplayMode } from "@/components/display-mode-toggle";
import { useViewMode } from "@/components/view-mode";
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
  PhysarumParameterPanel,
  agentCountFromDensity,
} from "@/components/skill1-archetype-info";
import { downloadPlanPng, renderPlanImage, Skill1PlanView } from "@/components/skill1-viz";
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
import { densityFromTranslation, slimeControlsFromTranslation, type SlimeControls } from "@/lib/skill1/slime-controls";
import type { FieldAttractor } from "@/lib/skill1/types";
import { configForArchetype } from "@/lib/skill1/archetypes";
import {
  behaviorFromRatings,
  paramsFromRatings,
  translateArchetype,
} from "@/lib/skill1/translate";
import type { FieldSnapshot, SimulationState, VizSettings } from "@/lib/skill1/types";
import type { RatingsMap, TypologyId } from "@/lib/types";
import { loadBoardSession, saveBoardSession, simulationFromSnapshot } from "@/lib/persist/session";

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

function copyAttractors(marks: FieldAttractor[]) {
  return marks.map((item) => ({ ...item }));
}

function recipeAttractors(recipe: { attractor: { x: number; y: number }; attractors?: FieldAttractor[] }) {
  if (recipe.attractors?.length) return copyAttractors(recipe.attractors);
  return [{ kind: "point" as const, x: recipe.attractor.x, y: recipe.attractor.y, radius: 1.6 }];
}

const WALL_CONTROLS_KEY = "lm-wall-controls";

/** Slider values on the wall just before the runs page replaced that view. */
const LAST_WALL_CONTROLS = {
  density: 5,
  iterations: 600,
  sensorDistance: 0.93,
  sensorAngle: 0.68,
  turnAngle: 0.66,
  stepSize: 0.24,
  deposit: 0.059,
  diffusion: 0.09,
  trailInfluence: 1,
  resistance: 0,
};

function readWallControls() {
  if (typeof window === "undefined") return LAST_WALL_CONTROLS;
  try {
    const raw = window.localStorage.getItem(WALL_CONTROLS_KEY) ?? window.sessionStorage.getItem(WALL_CONTROLS_KEY);
    if (!raw) return LAST_WALL_CONTROLS;
    return { ...LAST_WALL_CONTROLS, ...JSON.parse(raw) };
  } catch {
    return LAST_WALL_CONTROLS;
  }
}

function writeWallControls(next: typeof LAST_WALL_CONTROLS) {
  try {
    window.localStorage.setItem(WALL_CONTROLS_KEY, JSON.stringify(next));
  } catch {
    /* the sliders still hold the values in memory */
  }
}

type BoardSaved = {
  id: string;
  archetypeId: string;
  iteration: number;
  image: string;
  savedAt: number;
};

const BOARD_CATALOG_KEY = (id: string) => `lm-board-catalog:${id}`;

function readBoardCatalog(id: string): BoardSaved[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BOARD_CATALOG_KEY(id));
    const parsed = raw ? (JSON.parse(raw) as BoardSaved[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBoardCatalog(id: string, entries: BoardSaved[]) {
  try {
    window.localStorage.setItem(BOARD_CATALOG_KEY(id), JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

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
  const displayMode: DisplayMode = useViewMode() ?? "desktop";
  const [workspace, setWorkspace] = useState<"skill1" | "skill2-audit">("skill1");
  const [carveThreshold, setCarveThreshold] = useState(DIRECT_CARVE_THRESHOLD);
  const [slime, setSlime] = useState<SlimeControls | null>(null);
  const [attractorMarks, setAttractorMarks] = useState<FieldAttractor[] | null>(null);
  const [showAttractors, setShowAttractors] = useState(true);
  const [selectedAttractors, setSelectedAttractors] = useState<number[]>([0]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [boardReady, setBoardReady] = useState(false);
  const persistReadyRef = useRef(false);
  const slimeRef = useRef<SlimeControls | null>(null);
  const attractorMarksRef = useRef<FieldAttractor[] | null>(null);
  const dnaStampRef = useRef("");
  const physarumExportRef = useRef<HTMLDivElement>(null);
  const carvingExportRef = useRef<HTMLDivElement>(null);

  const typology = findTypology(typologyId);
  const archetype = findArchetype(typology, archetypeId);
  const groups = groupsForArchetype(typologyId, archetype, ratings);
  const catalogStamp = JSON.stringify(configForArchetype(archetype.id).recipe);
  const catalogTranslation = useMemo(
    () => translateArchetype(archetype.id),
    [archetype.id, catalogStamp],
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
  const shownAttractors = useMemo(() => {
    if (attractorMarks?.length) return attractorMarks;
    return recipeAttractors(translation.recipe);
  }, [attractorMarks, translation.recipe]);
  const rngRef = useRef<() => number>(() => 0.5);
  const translationRef = useRef(translation);
  const vizRef = useRef(viz);
  const snapshotsRef = useRef(snapshots);
  const stateRef = useRef<SimulationState | null>(null);
  const generationRef = useRef(0);
  const targetIterationsRef = useRef(targetIterations);
  const debounceRef = useRef<number | null>(null);
  const growthRef = useRef<number | null>(null);
  const simRef = useRef<SimulationState | null>(null);

  useEffect(() => {
    let live = true;
    void loadBoardSession().then(({ session, snapshot }) => {
      if (!live) return;
      if (session) {
        setTypologyId(session.typologyId);
        setArchetypeId(session.archetypeId);
        setRatings(session.ratings);
        setIteration(session.iteration);
        setRun(session.run);
        setSaved(session.saved);
        if (session.slime) {
          slimeRef.current = session.slime;
          setSlime(session.slime);
        }
        if (session.attractors?.length) {
          attractorMarksRef.current = session.attractors;
          setAttractorMarks(session.attractors);
        }
        vizRef.current = session.viz;
        setViz(session.viz);
        setTargetIterations(session.targetIterations);
        setCarveThreshold(session.carveThreshold);
        setShowAttractors(session.showAttractors);
        setSelectedAttractors(session.selectedAttractors);
        setCatalogOpen(session.catalogOpen);
        dnaStampRef.current = JSON.stringify(configForArchetype(session.archetypeId).recipe);
      }
      if (snapshot) {
        const sim = simulationFromSnapshot(snapshot);
        stateRef.current = sim;
        setState(sim);
        snapshotsRef.current = { [snapshot.iteration]: snapshot };
        setSnapshots(snapshotsRef.current);
      }
      persistReadyRef.current = true;
      setBoardReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!persistReadyRef.current) return;
    const marks = recipeAttractors(catalogTranslation.recipe);
    attractorMarksRef.current = marks;
    setAttractorMarks(marks);
    setSelectedAttractors([0]);
    const next = slimeControlsFromTranslation(translation);
    if (marks[0]) next.foodPoints = [{ x: marks[0].x, y: marks[0].y }];
    slimeRef.current = next;
    setSlime(next);
    const density = densityFromTranslation(translation);
    const agentCount = agentCountFromDensity(density);
    vizRef.current = { ...vizRef.current, density, agentCount };
    setViz((current) => ({ ...current, density, agentCount }));
    dnaStampRef.current = catalogStamp;
    // Catalog DNA only. A later slider move is the user's, until the next archetype.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetype.id, catalogStamp]);
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
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    if (growthRef.current != null) window.clearTimeout(growthRef.current);
    generationRef.current += 1;
  }, []);

  const seedFor = (id: string, nextRun: number) =>
    (0x51c11 ^ (nextRun * 9973) ^ id.length * 131) >>> 0;

  const publishFinalField = (sim: SimulationState, generation: number) => {
    if (growthRef.current != null) window.clearTimeout(growthRef.current);
    const slime = slimeRef.current ?? undefined;
    const trailDecay = vizRef.current.trailDecay;
    simRef.current = sim;
    stateRef.current = sim;
    setState({ ...sim });
    const pump = () => {
      if (generationRef.current !== generation || !translationRef.current) return;
      const current = simRef.current;
      if (!current || current.converged) {
        setSimulating(false);
        return;
      }
      const started = performance.now();
      const batch = Math.max(1, Math.round(current.maxIterations / 180));
      const next = stepMany(
        current,
        translationRef.current,
        rngRef.current,
        batch,
        trailDecay,
        slime,
      );
      simRef.current = next;
      stateRef.current = next;
      setState({ ...next });
      if (next.converged || next.iteration >= next.maxIterations) {
        const snapshot = captureSnapshot(next);
        snapshotsRef.current = { [snapshot.iteration]: snapshot };
        setSnapshots(snapshotsRef.current);
        setSimulating(false);
        return;
      }
      const delay = Math.max(16, 48 - (performance.now() - started));
      growthRef.current = window.setTimeout(pump, delay);
    };
    growthRef.current = window.setTimeout(pump, 32);
  };

  const liveSnapshot = useMemo(
    () => (state ? snapshotFromState(state) : null),
    [state],
  );

  useEffect(() => {
    if (!boardReady) return;
    const timer = window.setTimeout(() => {
      void saveBoardSession(
        {
          typologyId,
          archetypeId,
          ratings,
          iteration,
          run,
          saved,
          slime,
          attractors: attractorMarks,
          viz,
          targetIterations,
          displayMode,
          carveThreshold,
          showAttractors,
          selectedAttractors,
          catalogOpen,
        },
        liveSnapshot,
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    boardReady,
    typologyId,
    archetypeId,
    ratings,
    iteration,
    run,
    saved,
    slime,
    attractorMarks,
    viz,
    targetIterations,
    displayMode,
    carveThreshold,
    showAttractors,
    selectedAttractors,
    catalogOpen,
    liveSnapshot,
  ]);

  const cancelPendingGeneration = () => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (growthRef.current != null) {
      window.clearTimeout(growthRef.current);
      growthRef.current = null;
    }
    generationRef.current += 1;
  };

  const rememberMarks = (next: FieldAttractor[]) => {
    const copy = copyAttractors(next);
    attractorMarksRef.current = copy;
    setAttractorMarks(copy);
    try {
      window.localStorage.setItem(`lm-attractors:${archetype.id}`, JSON.stringify(copy));
    } catch {
      /* the field still keeps the marks in memory */
    }
  };

  const translationWithMarks = () => {
    const fresh = translateArchetype(archetype.id);
    const liveStamp = JSON.stringify(configForArchetype(archetype.id).recipe);
    if (dnaStampRef.current !== liveStamp || !attractorMarksRef.current?.length) {
      const marks = recipeAttractors(fresh.recipe);
      attractorMarksRef.current = marks;
      const slime = slimeControlsFromTranslation(fresh);
      if (marks[0]) slime.foodPoints = [{ x: marks[0].x, y: marks[0].y }];
      slimeRef.current = slime;
      setSlime(slime);
      setAttractorMarks(marks);
      dnaStampRef.current = liveStamp;
    }
    const marks = attractorMarksRef.current ?? recipeAttractors(fresh.recipe);
    const first = marks[0];
    return {
      ...fresh,
      ratings: { ...ratings },
      params: paramsFromRatings(ratings),
      behavior: behaviorFromRatings(ratings),
      recipe: {
        ...fresh.recipe,
        attractorFixed: true,
        attractor: { x: first?.x ?? fresh.recipe.attractor.x, y: first?.y ?? fresh.recipe.attractor.y },
        attractors: marks,
      },
    };
  };

  const runPresentationSimulation = () => {
    const nextSeed = seedFor(archetype.id, run);
    rngRef.current = mulberry32(nextSeed ^ 0x9e3779b9);
    const placed = translationWithMarks();
    translationRef.current = placed;
    const sim = createSimulation(placed, nextSeed, vizRef.current.agentCount);
    sim.maxIterations = targetIterationsRef.current;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSimulating(true);
    publishFinalField(sim, generation);
  };

  const patchViz = (patch: Partial<VizSettings>) => {
    setViz((current) => {
      const next = { ...current, ...patch };
      vizRef.current = next;
      const saved = readWallControls();
      writeWallControls({ ...saved, density: next.density });
      return next;
    });
  };

  const patchSlime = (patch: Partial<SlimeControls>) => {
    setSlime((current) => {
      const next = { ...(current ?? slimeControlsFromTranslation(translationRef.current)), ...patch };
      slimeRef.current = next;
      const saved = readWallControls();
      writeWallControls({
        ...saved,
        sensorDistance: next.sensorDistance,
        sensorAngle: next.sensorAngle,
        turnAngle: next.turnAngle,
        stepSize: next.stepSize,
        deposit: next.deposit,
        diffusion: next.diffusion,
        trailInfluence: next.trailInfluence,
        resistance: next.resistance,
      });
      return next;
    });
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
    const placed = translationWithMarks();
    translationRef.current = placed;
    const sim = createSimulation(placed, nextSeed, vizRef.current.agentCount);
    sim.maxIterations = targetIterationsRef.current;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSimulating(true);
    pulse("New iteration seeded from current criteria");
    publishFinalField(sim, generation);
  };

  const catalog = useMemo(
    () => (catalogOpen ? readBoardCatalog(archetype.id) : []),
    [catalogOpen, archetype.id, catalogVersion],
  );

  const fileSlug = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const saveToCatalog = () => {
    if (liveSnapshot) {
      const image = renderPlanImage(liveSnapshot, 2048, {
        attractors: shownAttractors,
        density: viz.density,
      });
      if (image) {
        const entry: BoardSaved = {
          id: `${archetype.id}-${iteration}-${Date.now()}`,
          archetypeId: archetype.id,
          iteration,
          image,
          savedAt: Date.now(),
        };
        writeBoardCatalog(archetype.id, [...readBoardCatalog(archetype.id), entry]);
        setSaved((n) => n + 1);
        setCatalogVersion((current) => current + 1);
        pulse(`Iteration ${String(iteration).padStart(2, "0")} saved to catalog`);
      }
    }
    setFocus("Iteration");
    setCatalogOpen(true);
  };

  const saveFieldJpeg = () => {
    if (!liveSnapshot) {
      pulse("Generate a field first");
      return;
    }
    downloadPlanPng(
      liveSnapshot,
      `${fileSlug(typology.id)}-${fileSlug(archetype.id)}-iteration-${String(iteration).padStart(2, "0")}.png`,
      { attractors: shownAttractors, density: viz.density },
    );
    pulse("PNG downloaded");
  };

  const removeCatalogEntry = (id: string) => {
    writeBoardCatalog(archetype.id, readBoardCatalog(archetype.id).filter((item) => item.id !== id));
    setCatalogVersion((current) => current + 1);
  };

  const exportFileName = (kind: "physarum" | "carving") => {
    return `${fileSlug(typology.id)}-${fileSlug(archetype.id)}-${kind}.png`;
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
    <div className="living-instrument-shell flex min-h-full flex-col px-2 py-2 text-[13px] md:h-full md:overflow-hidden md:px-3 md:py-2.5" data-display-mode={displayMode}>
      <header className="living-instrument-header mb-2 flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
        <div className="living-instrument-header-identity">
          <p className="eyebrow text-[0.58rem]">Emergent Network</p>
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
        <section className="archetype-region h-full min-h-0">
        <Panel className="flex min-h-0 flex-col">
          <PanelHeader kicker="Input" title="Archetype" />
          <div className="archetype-list flex flex-1 flex-col gap-1.5">
            {typology.archetypes.map((item) => {
              const active = item.id === archetype.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectArchetype(item.id)}
                  className={`archetype-chip px-1.5 py-1.5 text-center text-[0.58rem] leading-tight tracking-[0.08em] uppercase transition ${
                    active ? "is-active text-white" : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
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
        <section className="criteria-region h-full min-h-0">
        <Panel className="flex min-h-0 flex-col">
          <PanelHeader
            kicker="Analysis"
            title="Criteria Configuration"
            aside={
              <span className="border border-[rgba(242,242,238,0.24)] px-1.5 py-0.5 text-[0.6rem] tracking-[0.16em] uppercase text-[var(--muted)]">
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
                      <p className="text-[0.79rem] tracking-[0.18em] uppercase">
                        {group.title}
                      </p>
                      <p className="text-[0.6rem] tracking-[0.12em] uppercase text-[var(--muted)]">
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
                            <span className="text-[0.77rem] tracking-[0.08em] uppercase text-[var(--text)]">
                              {criterion.label}
                            </span>
                            <span className="text-[0.79rem] uppercase tracking-[0.12em] text-[var(--orange-hot)]">
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
                  <div className="criteria-scale mt-0.5 flex justify-between text-[0.58rem] tracking-[0.14em] uppercase text-[var(--muted)]">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                  </div>
                  <p className="mt-1 border-t border-[rgba(242,242,238,0.12)] pt-1 text-[0.84rem] tracking-[0.12em] uppercase text-[#d5eef6]">
                    <span className="mr-1 text-[0.58rem] tracking-[0.14em] text-[var(--muted)]">
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
              <p className="text-[0.7rem] tracking-[0.18em] uppercase text-[var(--text)]">
                Generated Descriptor
              </p>
              <span className="text-[0.6rem] text-[var(--muted)]">v1.0</span>
            </div>
            <ul className="space-y-1">
              {groups.map((group) => (
                <li
                  key={group.id}
                  className="flex items-baseline justify-between gap-2 text-[0.84rem] uppercase tracking-[0.08em] text-[#d5eef6]"
                >
                  <span className="text-[0.58rem] tracking-[0.16em] text-[var(--muted)]">
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
              <aside className="agent-information" aria-label="Agent simulation">
                <div className="agent-information-header">
                  <p className="eyebrow">{archetype.name}</p>
                  <h3 className="panel-title mt-1">Agent / Simulation</h3>
                </div>
                <div className="agent-logic">
                  <PhysarumParameterPanel
                    sensorDistance={slime?.sensorDistance ?? LAST_WALL_CONTROLS.sensorDistance}
                    sensorAngle={slime?.sensorAngle ?? LAST_WALL_CONTROLS.sensorAngle}
                    turnAngle={slime?.turnAngle ?? LAST_WALL_CONTROLS.turnAngle}
                    moveDistance={slime?.stepSize ?? LAST_WALL_CONTROLS.stepSize}
                    deposit={slime?.deposit ?? LAST_WALL_CONTROLS.deposit}
                    diffusion={slime?.diffusion ?? LAST_WALL_CONTROLS.diffusion}
                    trailInfluence={slime?.trailInfluence ?? LAST_WALL_CONTROLS.trailInfluence}
                    resistance={slime?.resistance ?? LAST_WALL_CONTROLS.resistance}
                    agentDensity={viz.density}
                    agentCount={agentCountFromDensity(viz.density)}
                    iterations={targetIterations}
                    onSensorDistance={(sensorDistance) => patchSlime({ sensorDistance })}
                    onSensorAngle={(sensorAngle) => patchSlime({ sensorAngle })}
                    onTurnAngle={(turnAngle) => patchSlime({ turnAngle })}
                    onMoveDistance={(stepSize) => patchSlime({ stepSize })}
                    onDeposit={(deposit) => patchSlime({ deposit })}
                    onDiffusion={(diffusion) => patchSlime({ diffusion })}
                    onTrailInfluence={(trailInfluence) => patchSlime({ trailInfluence })}
                    onResistance={(resistance) => patchSlime({ resistance })}
                    onAgentDensity={(density) => patchViz({ density, agentCount: agentCountFromDensity(density) })}
                    onIterations={(value) => {
                      targetIterationsRef.current = value;
                      setTargetIterations(value);
                      writeWallControls({ ...readWallControls(), iterations: value });
                    }}
                    showAttractors={showAttractors}
                    onShowAttractors={setShowAttractors}
                    attractors={shownAttractors}
                    onAttractorsEdit={rememberMarks}
                    selectedIndices={selectedAttractors}
                    onSelectedIndices={setSelectedAttractors}
                  />
                </div>
              </aside>

              <div className="agent-compare agent-compare-field">
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
                  </div>
                </div>
                <div className="agent-compare-head agent-carving" hidden>
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
                    <Skill1PlanView
                      snapshot={liveSnapshot}
                      density={viz.density}
                      showHud={false}
                      attractors={shownAttractors}
                      showAttractors={showAttractors}
                      selectedIndices={selectedAttractors}
                      onSelectAttractor={(index, shift) => {
                        setSelectedAttractors((current) => {
                          if (!shift) return [index];
                          if (current.includes(index)) {
                            const next = current.filter((item) => item !== index);
                            return next.length ? next : [index];
                          }
                          return [...current, index];
                        });
                      }}
                      onAttractorsChange={rememberMarks}
                    />
                  </div>
                </div>
                <div className="agent-stage agent-carving" ref={carvingExportRef} hidden>
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
                <label className="agent-carve-control flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]" hidden>
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

      {catalogOpen ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setCatalogOpen(false)}
          role="presentation"
        >
          <section
            className="panel flex h-[min(92dvh,860px)] w-[min(96vw,1180px)] flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            aria-label="Saved iterations catalog"
          >
            <header className="panel-header">
              <div className="panel-header-content">
                <p className="hud-panel-kicker">Catalog</p>
                <h2 className="panel-title">{archetype.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[0.58rem] tracking-[0.14em] uppercase text-[var(--muted)]">
                  {catalog.length} saved
                </p>
                <button
                  type="button"
                  onClick={() => setCatalogOpen(false)}
                  className="border border-[rgba(242,242,238,0.18)] px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Close
                </button>
              </div>
            </header>
            {catalog.length ? (
              <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 overflow-auto p-3">
                {catalog.map((entry) => (
                  <figure key={entry.id} className="flex flex-col border border-[rgba(242,242,238,0.16)] bg-black">
                    <img
                      src={entry.image}
                      alt={`Saved iteration ${String(entry.iteration).padStart(2, "0")}`}
                      className="block aspect-square w-full"
                    />
                    <figcaption className="flex items-center justify-between gap-2 px-1.5 py-1 text-[0.55rem] tracking-[0.08em] uppercase text-[var(--muted)]">
                      <span>Iteration {String(entry.iteration).padStart(2, "0")}</span>
                      <button
                        type="button"
                        onClick={() => removeCatalogEntry(entry.id)}
                        className="border border-[rgba(242,242,238,0.18)] px-1.5 py-0.5 text-[0.5rem] tracking-[0.1em] uppercase text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        Remove
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="flex flex-1 items-center justify-center text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                No saved iterations for this archetype
              </p>
            )}
          </section>
        </div>
      ) : null}

      {notice ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-20 -translate-x-1/2 border border-[var(--cyan)] bg-[var(--panel-strong)] px-4 py-2 text-[0.7rem] tracking-[0.16em] uppercase text-[var(--cyan-hot)]">
          {notice}
        </div>
      ) : null}
    </div>
  );
}