"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  captureSnapshot,
  createSimulation,
  stepMany,
} from "@/lib/skill1/engine";
import { DISPLAY_ITERATIONS, MIN_AGENT_COUNT, robustTrailPeak } from "@/lib/skill1/maps";
import {
  lobbySimulationSlime,
  planLobby,
  realizeLobbyPlan,
  type LobbyPlan,
  type LobbySalt,
} from "@/lib/skill1/lobby-realization";
import { runAttractorsFor } from "@/lib/skill1/run-variants";
import {
  agentsFromOpenHall,
  attractorsFromOpenHall,
  paramsFromOpenHall,
  planOpenHall,
  recipeFromOpenHall,
  slimeFromOpenHall,
} from "@/lib/skill1/run-open-hall";
import { FLAT_DEEP_RUN_ITERATIONS, FLAT_DEEP_TRAIL_SCALE, flatDeepKept, flatDeepPlatesNeedRedraw, markFlatDeepFluid, realizeFlatDeepRun } from "@/lib/skill1/run-flat-deep-plan";
import { attractorsFromUndulated, planUndulated, tuneUndulatedSlime, undulatedAgentCount } from "@/lib/skill1/run-undulated";
import { agentsFromTerraced, attractorsFromTerraced, planTerraced, slimeFromTerraced, TERRACE_RUN_ITERATIONS } from "@/lib/skill1/run-terraced";
import {
  compressedSequentialIdentity,
  isNovelSequence,
  scoreCompressedSequential,
  sequenceSignature,
} from "@/lib/skill1/run-compressed-sequential";
import {
  attractorsFromTopographic,
  isNovelTerrain,
  pickMostNovelTerrain,
  planTopographicGroundField,
  scoreTopographic,
  topographicIdentity,
  topographicSignature,
} from "@/lib/skill1/run-topographic-ground-field";
import {
  attractorsFromLinearGallery,
  gallerySignature,
  isNovelGallery,
  linearGalleryIdentity,
  pickMostNovelGallery,
  planLinearGallery,
  scoreLinearGallery,
} from "@/lib/skill1/run-linear-gallery";
import {
  continuousHallIdentity,
  hallSignature,
  isNovelHall,
} from "@/lib/skill1/run-continuous-hall";
import {
  extractMorphFeatures,
  isNovelMorphology,
  pickMostNovel,
  verticalVoidIdentity,
  type MorphFeatures,
} from "@/lib/skill1/run-morphology";
import { densityFromTranslation, slimeControlsFromTranslation, varySlimeControls } from "@/lib/skill1/slime-controls";
import { agentCountFromDensity } from "@/components/skill1-archetype-info";
import { configForArchetype } from "@/lib/skill1/archetypes";
import { translateArchetype } from "@/lib/skill1/translate";
import type { SlimeControls } from "@/lib/skill1/slime-controls";
import type { BiologicalBehavior, BiologicalParams, BiologicalTranslation, FieldAttractor, FieldSnapshot, SpatialRecipe, TopologyKind } from "@/lib/skill1/types";
import { mulberry32 } from "@/lib/physarum";
import { drawPlanField } from "@/components/skill1-viz";
import { paintMorphology as paintSnapshot } from "@/components/morphology-preview";
import { useViewMode } from "@/components/view-mode";
import { TYPOLOGIES } from "@/lib/catalog";
import { catalogWasCleared, clearCatalog, listCatalogCounts, putCatalogEntries, readCatalog, writeCatalog } from "@/lib/skill1/run-catalog";
import { shareCatalogEntries } from "@/lib/skill1/shared-catalog";
import { clearArchetypeFields, listArchetypeFieldCounts, loadArchetypeFields, saveArchetypeField } from "@/lib/persist/run-fields";
import { clearAllDoneFlag, clearRunFields, loadRunsSession, readRunsTab, rememberRunsTab, saveCatalogIndex, saveRunSnapshot, saveRunsMeta } from "@/lib/persist/session";

const COLUMNS = 20;
const ROWS = 5;
const RUN_COUNT = COLUMNS * ROWS;
const CATALOG_MIN_ZOOM = 0.5;
const CATALOG_MAX_ZOOM = 6;
const clampCatalogZoom = (value: number) => Math.min(CATALOG_MAX_ZOOM, Math.max(CATALOG_MIN_ZOOM, value));
const ALL_ARCHETYPE_IDS = TYPOLOGIES.flatMap((typology) => typology.archetypes.map((item) => item.id));
/** Run grid uses a lighter trail so 100 cells can finish. The board still uses TRAIL_SCALE. */
const RUN_TRAIL_SCALE = 8;
/** Compressed Sequential needs more texels so zoomed white filaments stay hair-thin. */
const CS_TRAIL_SCALE = 32;
/** TGF uses the light run grid so each cell finishes well under a minute. */
const TGF_TRAIL_SCALE = 8;
const TGF_RUN_ITERATIONS = 320;
const TGF_ID = "topographic-ground-field";
const LG_TRAIL_SCALE = 16;
const OH_TRAIL_SCALE = 8;
const OH_RUN_ITERATIONS = 280;
const OH_STEP_BUDGET_MS = 18000;
const TR_ID = "terraced";
const TR_TRAIL_SCALE = 24;
const TR_STEP_BUDGET_MS = 19000;

function finePaint(id?: string) {
  return id === "compressed-sequential" || id === "topographic-ground-field" || id === "linear-gallery" || id === "open-hall" || id === "flat-deep-plan" || id === "undulated" || id === TR_ID;
}

function cellPeak(id: string | undefined, trails: ArrayLike<number>) {
  const peak = robustTrailPeak(trails);
  if (id === "open-hall") return Math.max(0.64, peak * 0.58);
  return Math.max(1.4, peak);
}

function emptyRunSlots() {
  return Array.from({ length: RUN_COUNT }, () => null);
}

function trailScaleFor(id?: string) {
  if (id === "topographic-ground-field") return TGF_TRAIL_SCALE;
  if (id === "compressed-sequential") return CS_TRAIL_SCALE;
  if (id === "linear-gallery") return LG_TRAIL_SCALE;
  if (id === "open-hall") return OH_TRAIL_SCALE;
  if (id === "flat-deep-plan" || id === "undulated") return FLAT_DEEP_TRAIL_SCALE;
  if (id === TR_ID) return TR_TRAIL_SCALE;
  return RUN_TRAIL_SCALE;
}
/** 8× the 160-cell trail. Sharp enough for catalog PNGs without the 2048 dumps that failed to save. */
const CATALOG_IMAGE_SIZE = 1280;
/** Continuous Hall runs that never landed in git. */
const tinySharedCache = new Map<string, boolean>();

async function isTinySharedImage(image: string) {
  if (tinySharedCache.has(image)) return tinySharedCache.get(image) ?? false;
  try {
    const response = await fetch(image, { cache: "no-store" });
    const blob = await response.blob();
    const tiny = blob.size < 4000;
    tinySharedCache.set(image, tiny);
    return tiny;
  } catch {
    tinySharedCache.set(image, true);
    return true;
  }
}

function seedFor(id: string, run: number) {
  return (0x51c11 ^ (run * 9973) ^ id.length * 131) >>> 0;
}

function rebuildSavedDetail(entry: SavedRun) {
  const base = translateArchetype(entry.archetypeId);
  try {
    if (entry.lobbyPlan && entry.lobbySalt && entry.lobbyPlan.archetypeId === entry.archetypeId) {
      const realized = realizeLobbyPlan(base, slimeControlsFromTranslation(base), entry.lobbyPlan, entry.lobbySalt);
      if (realized.ok) {
        return {
          slime: entry.slime ?? realized.slime,
          translation: {
            ...realized.translation,
            params: entry.params ?? realized.translation.params,
            behavior: entry.behavior ?? realized.translation.behavior,
            recipe: entry.recipe ?? realized.translation.recipe,
            topology: entry.topology ?? realized.translation.topology,
            archetypeName: entry.archetypeName ?? realized.translation.archetypeName,
          },
        };
      }
    }
    const runTranslation = translationForRun(base, entry.seed, Math.max(0, entry.run - 1));
    const marks = entry.recipe?.attractors ?? runTranslation.recipe.attractors ?? [];
    const slime = entry.slime ?? {
      ...varySlimeControls(slimeControlsFromTranslation(base), entry.seed, entry.archetypeId),
      foodPoints: marks.map((mark) => ({ x: mark.x, y: mark.y })),
    };
    return {
      slime,
      translation: {
        ...runTranslation,
        params: entry.params ?? runTranslation.params,
        behavior: entry.behavior ?? runTranslation.behavior,
        recipe: entry.recipe ?? runTranslation.recipe,
        topology: entry.topology ?? runTranslation.topology,
        archetypeName: entry.archetypeName ?? runTranslation.archetypeName,
      },
    };
  } catch {
    return {
      slime: entry.slime ?? slimeControlsFromTranslation(base),
      translation: {
        ...base,
        params: entry.params ?? base.params,
        behavior: entry.behavior ?? base.behavior,
        recipe: entry.recipe ?? base.recipe,
        topology: entry.topology ?? base.topology,
        archetypeName: entry.archetypeName ?? base.archetypeName,
      },
    };
  }
}

function translationForRun(base: BiologicalTranslation, seed: number, index: number, attempt = 0): BiologicalTranslation {
  const attractors = runAttractorsFor(base.archetypeId, seed, base.recipe.attractors ?? [], undefined, attempt, index);
  const first = attractors[0] ?? { x: 10, y: 10, kind: "point" as const, radius: 1.4, strength: 1 };
  return {
    ...base,
    recipe: {
      ...base.recipe,
      attractorFixed: true,
      attractorsOnly: true,
      attractor: { x: first.x, y: first.y },
      attractors,
    },
  };
}

function realizeRun(
  base: BiologicalTranslation,
  slimeBase: SlimeControls,
  seed: number,
  attempt = 0,
  index = 0,
) {
  const salt: LobbySalt = { seed, attempt, index };
  if (base.archetypeId === "open-hall") {
    const plan = planOpenHall(seed, attempt, index);
    const marks = attractorsFromOpenHall(plan, seed, attempt);
    const first = marks[0] ?? { x: 10, y: 10 };
    return {
      seed,
      agents: agentsFromOpenHall(plan, seed),
      slime: slimeFromOpenHall(slimeBase, plan, seed),
      translation: {
        ...base,
        params: paramsFromOpenHall(base.params, seed ^ index),
        recipe: {
          ...recipeFromOpenHall(base.recipe, seed ^ index),
          attractorFixed: true,
          attractorsOnly: true,
          attractor: { x: first.x, y: first.y },
          attractors: marks,
        },
      },
    };
  }
  if (base.archetypeId === "flat-deep-plan") {
    const realized = realizeFlatDeepRun(base, slimeBase, seed, attempt, index);
    return { seed, agents: realized.agents, slime: realized.slime, translation: realized.translation };
  }
  if (base.archetypeId === "undulated") {
    const plan = planUndulated(seed, attempt, index);
    const marks = attractorsFromUndulated(plan);
    const first = marks[0] ?? { x: 10, y: 10 };
    return {
      seed,
      agents: undulatedAgentCount(plan, seed),
      slime: {
        ...tuneUndulatedSlime(slimeBase, plan),
        foodPoints: marks
          .filter((_, mark) => mark % 3 === 0)
          .slice(0, 5)
          .map((mark) => ({ x: (mark.x + (mark.x2 ?? mark.x)) / 2, y: (mark.y + (mark.y2 ?? mark.y)) / 2 })),
      },
      translation: {
        ...base,
        params: {
          ...base.params,
          geometryVariation: Math.min(base.params.geometryVariation, 0.22),
          attractionStrength: Math.max(base.params.attractionStrength, 1.15),
          directionalBias: Math.max(base.params.directionalBias, 0.62),
          randomness: Math.min(base.params.randomness, 0.08),
          permeability: Math.min(base.params.permeability, 0.38),
        },
        recipe: {
          ...base.recipe,
          attractorFixed: true,
          attractorsOnly: true,
          attractor: { x: first.x, y: first.y },
          attractors: marks,
          clustering: 0.86,
          coreExposure: Math.min(base.recipe.coreExposure, 0.28),
          approachWidth: Math.min(base.recipe.approachWidth, 1.25),
        },
      },
    };
  }
  if (base.archetypeId === TR_ID) {
    const plan = planTerraced(seed, attempt, index);
    const marks = attractorsFromTerraced(plan, seed);
    const first = marks[0] ?? { x: 10, y: 10 };
    return {
      seed,
      agents: agentsFromTerraced(plan),
      slime: {
        ...slimeFromTerraced(slimeBase, plan, seed ^ (attempt * 9973)),
        foodPoints: marks.map((mark) => ({ x: (mark.x + (mark.x2 ?? mark.x)) / 2, y: (mark.y + (mark.y2 ?? mark.y)) / 2 })),
      },
      translation: {
        ...base,
        recipe: {
          ...base.recipe,
          attractorFixed: true,
          attractorsOnly: true,
          attractor: { x: first.x, y: first.y },
          attractors: marks,
        },
      },
    };
  }
  const planned = planLobby(base.archetypeId, salt);
  if (planned) {
    const realized = realizeLobbyPlan(base, slimeBase, planned, salt);
    if (!realized.ok) throw new Error(`${base.archetypeId}: ${realized.reasons.join(", ")}`);
    return {
      seed,
      agents: realized.agents,
      slime: realized.slime,
      translation: realized.translation,
      lobbyPlan: realized.plan,
      lobbySalt: realized.salt,
    };
  }
  const translation = translationForRun(base, seed, index, attempt);
  const marks = translation.recipe.attractors ?? [];
  const slime = {
    ...varySlimeControls(slimeBase, seed ^ (attempt * 9973), base.archetypeId),
    foodPoints: marks.map((mark) => ({ x: mark.x, y: mark.y })),
  };
  const rng = mulberry32(seed ^ 0x6d2b79f5 ^ attempt);
  const agents = Math.round(Math.min(600, Math.max(MIN_AGENT_COUNT, agentCountFromDensity(densityFromTranslation(base)) + (rng() - 0.5) * 36)));
  return { seed, agents, slime, translation };
}

/** One saved run in the per-archetype catalog. */
type SavedRun = {
  id: string;
  archetypeId: string;
  archetypeName?: string;
  run: number;
  seed: number;
  kind: string;
  agents: number;
  iterations: number;
  image: string;
  savedAt: number;
  slime?: SlimeControls;
  params?: BiologicalParams;
  behavior?: BiologicalBehavior;
  recipe?: SpatialRecipe;
  topology?: TopologyKind;
  /** Semantic plan that drew this cell. Absent on rows saved before the Lobby handoff. */
  lobbyPlan?: LobbyPlan;
  /** Salt held with that plan. `index` is the grid slot, `attempt` is the try the grid kept. */
  lobbySalt?: LobbySalt;
};

function paintCatalogCanvas(snapshot: FieldSnapshot, size = CATALOG_IMAGE_SIZE, attractors?: FieldAttractor[], peak?: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  drawPlanField(ctx, snapshot, size, size, {
    showHud: false,
    fine: true,
    density: 5,
    attractors,
    showAttractors: false,
    peak,
    hairThin: Boolean(peak),
    maxResolution: size,
  });
  return canvas;
}

function snapshotImage(snapshot: FieldSnapshot, size = CATALOG_IMAGE_SIZE, attractors?: FieldAttractor[], peak?: number) {
  const canvas = paintCatalogCanvas(snapshot, size, attractors, peak);
  if (!canvas) return "";
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function snapshotBlob(snapshot: FieldSnapshot, size = CATALOG_IMAGE_SIZE, attractors?: FieldAttractor[], peak?: number) {
  const canvas = paintCatalogCanvas(snapshot, size, attractors, peak);
  if (!canvas) return Promise.resolve(null);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.size > 32 ? blob : null), "image/png");
  });
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function canvasImage(canvas: HTMLCanvasElement | null) {
  if (!canvas || canvas.width < 2 || canvas.height < 2) return "";
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function kindLabel(marks?: FieldAttractor[]) {
  if (!marks?.length) return "mixed";
  const kinds = [...new Set(marks.map((mark) => mark.kind))];
  if (kinds.length === 1) {
    const kind = kinds[0];
    return kind === "ring" ? "circle" : kind === "curve" ? "curvy line" : kind;
  }
  return "mixed";
}

function entryImage(
  index: number,
  snapshot: FieldSnapshot | null,
  canvas: HTMLCanvasElement | null,
  size = CATALOG_IMAGE_SIZE,
  attractors?: FieldAttractor[],
  peak?: number,
) {
  return (snapshot ? snapshotImage(snapshot, size, attractors, peak) : "") || canvasImage(canvas);
}

function paintRunCell(
  canvas: HTMLCanvasElement,
  snapshot: FieldSnapshot,
  attractors?: FieldAttractor[],
  archetypeId?: string,
  fine = false,
) {
  paintSnapshot(
    canvas,
    snapshot,
    fine,
    attractors,
    undefined,
    finePaint(archetypeId) ? 8 : 5,
    finePaint(archetypeId) ? cellPeak(archetypeId, snapshot.trails) : undefined,
    finePaint(archetypeId),
    archetypeId === "open-hall" ? 1.75 : 1,
  );
}

function labelize(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (typeof value === "boolean" || typeof value === "string") return String(value);
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(" · ");
  if (value && typeof value === "object") {
    if ("x" in value && "y" in value) {
      const point = value as { x: number; y: number; radius?: number; kind?: string };
      const extra = point.kind ? ` ${point.kind}` : "";
      const radius = point.radius != null ? ` r ${point.radius.toFixed(2)}` : "";
      return `${point.x.toFixed(2)}, ${point.y.toFixed(2)}${radius}${extra}`;
    }
    return Object.entries(value)
      .map(([key, item]) => `${key} ${formatValue(item)}`)
      .join(" · ");
  }
  return String(value);
}

function attractorRows(marks: FieldAttractor[] | undefined): Array<[string, unknown]> {
  if (!marks?.length) return [["attractors", "none"]];
  return marks.map((item, index) => {
    const end = item.x2 != null && item.y2 != null ? ` → ${item.x2.toFixed(2)}, ${item.y2.toFixed(2)}` : "";
    const bend = item.cx != null && item.cy != null ? ` · bend ${item.cx.toFixed(2)}, ${item.cy.toFixed(2)}` : "";
    const radius = item.radius != null ? ` · r ${item.radius.toFixed(2)}` : "";
    const strength = item.strength != null ? ` · s ${item.strength.toFixed(2)}` : "";
    const hole = item.hole ? " · void" : "";
    return [`${index + 1} ${item.kind}`, `${item.x.toFixed(2)}, ${item.y.toFixed(2)}${end}${bend}${radius}${strength}${hole}`];
  });
}

function slimeRows(slime: SlimeControls): Array<[string, unknown]> {
  return [
    ["sensorAngle", slime.sensorAngle],
    ["sensorDistance", slime.sensorDistance],
    ["turnAngle", slime.turnAngle],
    ["stepSize", slime.stepSize],
    ["deposit", slime.deposit],
    ["depositWidth", slime.depositWidth],
    ["diffusion", slime.diffusion],
    ["decay", slime.decay],
    ["trailInfluence", slime.trailInfluence],
    ["resistance", slime.resistance],
    ["randomness", slime.randomness],
    ["persistence", slime.persistence],
    ["trailCap", slime.trailCap],
    ["crowdingLimit", slime.crowdingLimit],
    ["voidElongation", slime.voidElongation],
    ["voidRotation", slime.voidRotation],
    ["voidLobes", slime.voidLobes],
    ["voidNotch", slime.voidNotch],
    ["foodPoints", slime.foodPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" · ")],
  ];
}

function RunInfoLists({
  seed,
  agents,
  iterations,
  field,
  slime,
  params,
  behavior,
  recipe,
  topology,
}: {
  seed: number;
  agents: number;
  iterations: number;
  field: string;
  slime?: SlimeControls;
  params?: BiologicalParams;
  behavior?: BiologicalBehavior;
  recipe?: SpatialRecipe;
  topology?: TopologyKind | string;
}) {
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-auto px-4 py-4">
      <ParamList
        title="Simulation"
        rows={[
          ["seed", seed],
          ["agents", agents],
          ["iterations", iterations],
          ["maxIterations", DISPLAY_ITERATIONS],
          ["field", field],
        ]}
      />
      {slime ? <ParamList title="Slime mold" rows={slimeRows(slime)} /> : null}
      {params ? <ParamList title="Physarum" rows={Object.entries(params)} /> : null}
      {behavior ? <ParamList title="Behavior" rows={Object.entries(behavior)} /> : null}
      <ParamList title="Attractors" rows={attractorRows(recipe?.attractors)} />
      {recipe ? (
        <ParamList
          title="Recipe"
          rows={[
            ["topology", topology ?? ""],
            ["sourceCorner", recipe.sourceCorner],
            ["attractor", recipe.attractor],
            ["attractorTypes", (recipe.attractors ?? []).map((item) => item.kind).join(", ")],
            ["coreExposure", recipe.coreExposure],
            ["enclosureCollar", recipe.enclosureCollar],
            ["isolationRadius", recipe.isolationRadius],
            ["clustering", recipe.clustering],
            ["approachWidth", recipe.approachWidth],
          ]}
        />
      ) : null}
    </div>
  );
}

function ParamList({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, unknown]>;
}) {
  return (
    <section>
      <h3 className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--orange-hot)]">{title}</h3>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.78rem]">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-[var(--muted)]">{labelize(key)}</dt>
            <dd className="text-right text-[var(--text)]">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function RunGrid({ view = "runs" }: { view?: "runs" | "catalog" }) {
  const viewMode = useViewMode();
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const snapshotsRef = useRef<Array<FieldSnapshot | null>>(Array.from({ length: RUN_COUNT }, () => null));
  const [completed, setCompleted] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(ALL_ARCHETYPE_IDS[0] ?? null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runToken, setRunToken] = useState(0);
  const [wall, setWall] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(view === "catalog");
  const catalogBodyRef = useRef<HTMLDivElement>(null);
  const catalogZoomRef = useRef(1);
  const catalogPanRef = useRef({ x: 0, y: 0 });
  const catalogDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [catalogZoom, setCatalogZoom] = useState(1);
  const [catalogPan, setCatalogPan] = useState({ x: 0, y: 0 });
  const [catalogPage, setCatalogPage] = useState(0);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [inspecting, setInspecting] = useState(false);
  const [catalogInspected, setCatalogInspected] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [catalogEntries, setCatalogEntries] = useState<SavedRun[]>([]);
  const [allQueue, setAllQueue] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const runningRef = useRef(false);
  const allQueueRef = useRef(false);
  const allDoneRef = useRef(false);
  const freshQueueRef = useRef(false);
  const savingRef = useRef(false);
  const fillCatalogRef = useRef(false);
  const savingCatalogRef = useRef(false);
  const autoStartedRef = useRef<string | null>(null);
  const resumeIndexRef = useRef(0);
  const completedRef = useRef(0);
  const wallRef = useRef(false);
  const runningIdRef = useRef<string | null>(null);
  const pickedIdRef = useRef<string | null>(null);
  const pendingSavesRef = useRef<SavedRun[]>([]);
  const variantsRef = useRef<
    Array<{
      seed: number;
      agents: number;
      slime: SlimeControls;
      translation: BiologicalTranslation;
      lobbyPlan?: LobbyPlan;
      lobbySalt?: LobbySalt;
    }>
  >([]);
  const frameRef = useRef<number | null>(null);
  const resumeFrameRef = useRef<(() => void) | null>(null);
  const saveFlashTimer = useRef<number | null>(null);
  const catalogCacheRef = useRef<Record<string, SavedRun[]>>({});
  const catalogFieldsRef = useRef<Record<string, Array<FieldSnapshot | null>>>({});
  const [catalogCounts, setCatalogCounts] = useState<Record<string, number>>({});
  const activeId = runningId ?? pickedId;
  const catalogStamp = activeId ? JSON.stringify(configForArchetype(activeId).recipe) : "";
  const translation = useMemo(
    () => (activeId ? translateArchetype(activeId) : null),
    [activeId, catalogStamp],
  );
  const slime = useMemo(() => (translation ? slimeControlsFromTranslation(translation) : null), [translation]);
  const seeds = useMemo(
    () => (activeId ? Array.from({ length: RUN_COUNT }, (_, index) => seedFor(activeId, index)) : []),
    [activeId],
  );
  const variants = useMemo(() => {
    if (!slime || !translation || catalogOpen) return [];
    return seeds.map((seed) => ({ seed, agents: MIN_AGENT_COUNT, slime, translation }));
  }, [catalogOpen, seeds, slime, translation]);

  const catalogId = catalogOpen ? pickedId : activeId;
  const catalog = catalogEntries;
  completedRef.current = completed;
  variantsRef.current = variants;
  wallRef.current = wall;
  runningIdRef.current = runningId;
  pickedIdRef.current = pickedId;

  const refreshCatalogCounts = () => {
    void Promise.all([listCatalogCounts(ALL_ARCHETYPE_IDS), listArchetypeFieldCounts(ALL_ARCHETYPE_IDS, RUN_COUNT)]).then(
      ([images, fields]) => {
        const next: Record<string, number> = {};
        for (const id of ALL_ARCHETYPE_IDS) next[id] = Math.max(images[id] ?? 0, fields[id] ?? 0);
        setCatalogCounts(next);
      },
    );
  };

  const entryFromSnapshot = (id: string, index: number, snapshot: FieldSnapshot): SavedRun | null => {
    const variant = id === (runningIdRef.current ?? pickedIdRef.current) ? variantsRef.current[index] : undefined;
    const marks = variant?.translation.recipe.attractors;
    const image = snapshotImage(
      snapshot,
      480,
      marks,
      finePaint(id) ? Math.max(1.4, robustTrailPeak(snapshot.trails)) : undefined,
    );
    if (!image) return null;
    const seed = variant?.seed ?? seedFor(id, index);
    return {
      id: `${id}-${seed}-${index}-${Date.now()}`,
      archetypeId: id,
      archetypeName: variant?.translation.archetypeName,
      run: index + 1,
      seed,
      kind: kindLabel(marks),
      agents: variant?.agents ?? 0,
      iterations: snapshot.iteration ?? DISPLAY_ITERATIONS,
      image,
      savedAt: Date.now(),
      slime: variant?.slime,
      params: variant?.translation.params,
      behavior: variant?.translation.behavior,
      recipe: variant?.translation.recipe,
      topology: variant?.translation.topology,
      lobbyPlan: variant?.lobbyPlan,
      lobbySalt: variant?.lobbySalt,
    };
  };

  const catalogFromFields = async (id: string) => {
    const kept = await loadArchetypeFields(id, RUN_COUNT);
    catalogFieldsRef.current[id] = kept;
    if (kept.some(Boolean) && id === (runningIdRef.current ?? pickedIdRef.current)) snapshotsRef.current = kept;
    const savedAt = Date.now();
    const entries: SavedRun[] = [];
    for (let index = 0; index < RUN_COUNT; index += 1) {
      const snapshot = kept[index];
      if (!snapshot?.trails?.length) continue;
      entries.push({
        id: `${id}-field-${index}`,
        archetypeId: id,
        run: index + 1,
        seed: seedFor(id, index),
        kind: "mixed",
        agents: 0,
        iterations: snapshot.iteration ?? DISPLAY_ITERATIONS,
        image: `field:${id}:${index}`,
        savedAt,
      });
    }
    return entries;
  };

  const slimEntry = (item: SavedRun): SavedRun => ({
    id: item.id,
    archetypeId: item.archetypeId,
    run: item.run,
    seed: item.seed,
    kind: item.kind,
    agents: item.agents,
    iterations: item.iterations,
    image: item.image,
    savedAt: item.savedAt,
    lobbyPlan: item.lobbyPlan,
    lobbySalt: item.lobbySalt,
  });

  const mergeCatalog = async (id: string) => {
    if (catalogWasCleared(id)) return [];
    if (id !== TGF_ID) {
      const rebuilt = await catalogFromFields(id);
      if (rebuilt.length) return rebuilt;
    }
    const stored = await readCatalog<SavedRun>(id);
    const usable: SavedRun[] = [];
    for (const item of stored) {
      if (!item.image) continue;
      if (item.image.startsWith("/shared-catalog/linear-edge-gallery/") && (await isTinySharedImage(item.image))) continue;
      usable.push(slimEntry(item));
    }
    return usable.sort((a, b) => a.run - b.run);
  };

  useEffect(() => {
    if (!catalogOpen || !catalogId) return;
    let live = true;
    void (async () => {
      try {
        const next = await mergeCatalog(catalogId);
        if (!live) return;
        catalogCacheRef.current[catalogId] = next;
        setCatalogEntries(next);
        setCatalogCounts((current) => ({ ...current, [catalogId]: next.length }));
      } catch {
        if (live) setCatalogEntries(catalogCacheRef.current[catalogId] ?? []);
      }
    })();
    return () => {
      live = false;
    };
  }, [catalogOpen, catalogId, catalogVersion]);

  useEffect(() => {
    const node = catalogBodyRef.current;
    if (!catalogOpen || !node) return;

    const zoomAt = (factor: number, clientX: number, clientY: number) => {
      const rect = node.getBoundingClientRect();
      const px = clientX - rect.left - rect.width / 2;
      const py = clientY - rect.top - rect.height / 2;
      const prevZoom = catalogZoomRef.current;
      const nextZoom = clampCatalogZoom(prevZoom * factor);
      const ratio = nextZoom / prevZoom;
      const prevPan = catalogPanRef.current;
      applyCatalogView(nextZoom, {
        x: px - (px - prevPan.x) * ratio,
        y: py - (py - prevPan.y) * ratio,
      });
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1) return;
      catalogDragRef.current = {
        x: event.clientX,
        y: event.clientY,
        panX: catalogPanRef.current.x,
        panY: catalogPanRef.current.y,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = catalogDragRef.current;
      if (!drag || !event.buttons) return;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      event.preventDefault();
      applyCatalogView(catalogZoomRef.current, {
        x: drag.panX + (event.clientX - drag.x),
        y: drag.panY + (event.clientY - drag.y),
      });
    };
    const onPointerUp = () => {
      catalogDragRef.current = null;
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [catalogOpen]);

  const markSaved = () => {
    setCatalogVersion((current) => current + 1);
    setSaveFlash(true);
    if (saveFlashTimer.current != null) window.clearTimeout(saveFlashTimer.current);
    saveFlashTimer.current = window.setTimeout(() => setSaveFlash(false), 1600);
  };

  const buildEntry = (index: number, savedAt: number, size = CATALOG_IMAGE_SIZE, archetypeId?: string): SavedRun | null => {
    const snapshot = snapshotsRef.current[index];
    const id = archetypeId ?? runningIdRef.current ?? pickedIdRef.current;
    const active = runningIdRef.current ?? pickedIdRef.current;
    const variant = id === active ? variantsRef.current[index] : undefined;
    if (!id) return null;
    const marks = variant?.translation.recipe.attractors;
    const image = entryImage(
      index,
      snapshot,
      canvasRefs.current[index],
      size,
      marks,
      finePaint(id) && snapshot ? Math.max(1.4, robustTrailPeak(snapshot.trails)) : undefined,
    );
    if (!image) return null;
    const seed = variant?.seed ?? seedFor(id, index);
    return {
      id: `${id}-${seed}-${index}-${savedAt}`,
      archetypeId: id,
      archetypeName: variant?.translation.archetypeName,
      run: index + 1,
      seed,
      kind: kindLabel(marks),
      agents: variant?.agents ?? 0,
      iterations: snapshot?.iteration ?? DISPLAY_ITERATIONS,
      image,
      savedAt,
      slime: variant?.slime,
      params: variant?.translation.params,
      behavior: variant?.translation.behavior,
      recipe: variant?.translation.recipe,
      topology: variant?.translation.topology,
      lobbyPlan: variant?.lobbyPlan,
      lobbySalt: variant?.lobbySalt,
    };
  };

  const persistEntries = async (id: string, incoming: Array<SavedRun & { imageBlob?: Blob }>) => {
    const ready = incoming.filter((item) => item.imageBlob || item.image.startsWith("data:"));
    if (!ready.length) return false;
    let stored = true;
    for (let index = 0; index < ready.length; index += 8) {
      if (!(await putCatalogEntries(id, ready.slice(index, index + 8)))) stored = false;
      await nextFrame();
    }
    if (!stored && ready.every((item) => item.image.startsWith("data:"))) {
      const compact = ready.map((item) => {
        const index = item.run - 1;
        const image = entryImage(index, snapshotsRef.current[index], canvasRefs.current[index], 960, variantsRef.current[index]?.translation.recipe.attractors);
        return image ? { ...item, image } : item;
      });
      stored = await putCatalogEntries(id, compact);
      if (stored) {
        void shareCatalogEntries(id, compact);
        return true;
      }
    }
    void shareCatalogEntries(id, ready);
    return stored || ready.length > 0;
  };

  const catalogOne = async (index: number, archetypeId?: string) => {
    const id = archetypeId ?? runningIdRef.current ?? pickedIdRef.current;
    if (!id) return false;
    for (const size of [CATALOG_IMAGE_SIZE, 960]) {
      const entry = buildEntry(index, Date.now(), size, id);
      if (!entry) continue;
      if (await persistEntries(id, [entry])) {
        catalogCacheRef.current[id] = [...(catalogCacheRef.current[id] ?? []).filter((item) => item.run !== entry.run), entry].sort(
          (a, b) => a.run - b.run,
        );
        return true;
      }
    }
    return false;
  };

  const ensureAllCatalogued = async (id: string) => {
    const kept = await loadArchetypeFields(id, RUN_COUNT);
    if (kept.some(Boolean)) snapshotsRef.current = kept;
    const stored = await readCatalog<SavedRun>(id);
    const have = new Set(stored.map((item) => item.run));
    for (let index = 0; index < RUN_COUNT; index += 1) {
      if (have.has(index + 1)) continue;
      await catalogOne(index, id);
    }
    const next = await readCatalog<SavedRun>(id);
    catalogCacheRef.current[id] = next;
    refreshCatalogCounts();
    return next.length >= RUN_COUNT;
  };

  const saveCatalog = async () => {
    if (savingCatalogRef.current) return false;
    const id = runningIdRef.current ?? pickedIdRef.current;
    if (!id) return false;
    savingCatalogRef.current = true;
    setSaveProgress({ done: 0, total: RUN_COUNT });
    try {
      const kept = await loadArchetypeFields(id, RUN_COUNT);
      if (kept.some(Boolean)) {
        snapshotsRef.current = snapshotsRef.current.map((current, index) => current ?? kept[index] ?? null);
      }
      const savedAt = Date.now();
      const incoming: Array<SavedRun & { imageBlob?: Blob }> = [];
      let painted = 0;
      const alreadyShared = new Set<number>();
      if (id === "flat-deep-plan") {
        try {
          const response = await fetch(`/shared-catalog/${id}/entries.json`, { cache: "no-store" });
          const entries = response.ok ? ((await response.json()) as Array<{ run?: number; savedAt?: number }>) : [];
          for (const item of entries) {
            if (item.run && (item.savedAt ?? 0) > 1791000000000) alreadyShared.add(item.run);
          }
        } catch {
          /* a missing catalog just means every cell is saved */
        }
      }
      const flushIncoming = async () => {
        if (!incoming.length) return true;
        const batch = incoming.splice(0, incoming.length);
        try {
          await putCatalogEntries(id, batch);
        } catch {
          /* the shared catalog is the copy that replaces the old set */
        }
        if (id !== "flat-deep-plan") return true;
        try {
          return await shareCatalogEntries(id, batch);
        } catch {
          return false;
        }
      };
      for (let index = 0; index < RUN_COUNT; index += 1) {
        if (alreadyShared.has(index + 1)) {
          painted += 1;
          setSaveProgress({ done: index + 1, total: RUN_COUNT });
          continue;
        }
        const snapshot = snapshotsRef.current[index];
        const active = runningIdRef.current ?? pickedIdRef.current;
        const variant = id === active ? variantsRef.current[index] : undefined;
        const marks = variant?.translation.recipe.attractors;
        const peak = finePaint(id) && snapshot ? Math.max(1.4, robustTrailPeak(snapshot.trails)) : undefined;
        const blob = snapshot ? await snapshotBlob(snapshot, CATALOG_IMAGE_SIZE, marks, peak) : null;
        if (blob) {
          const seed = variant?.seed ?? seedFor(id, index);
          incoming.push({
            id: `${id}-${seed}-${index}-${savedAt}`,
            archetypeId: id,
            archetypeName: variant?.translation.archetypeName,
            run: index + 1,
            seed,
            kind: kindLabel(marks),
            agents: variant?.agents ?? 0,
            iterations: snapshot?.iteration ?? DISPLAY_ITERATIONS,
            image: "",
            imageBlob: blob,
            savedAt,
            slime: variant?.slime,
            params: variant?.translation.params,
            behavior: variant?.translation.behavior,
            recipe: variant?.translation.recipe,
            topology: variant?.translation.topology,
            lobbyPlan: variant?.lobbyPlan,
            lobbySalt: variant?.lobbySalt,
          });
          painted += 1;
        }
        if (id === "flat-deep-plan" && incoming.length >= 2 && !(await flushIncoming())) return false;
        setSaveProgress({ done: index + 1, total: RUN_COUNT });
        await nextFrame();
      }
      if (!painted) return false;
      if (id === "flat-deep-plan") {
        if (!(await flushIncoming())) return false;
      } else if (!(await persistEntries(id, incoming))) return false;
      const stored = await readCatalog<SavedRun>(id);
      catalogCacheRef.current[id] = stored;
      setCatalogEntries(stored);
      refreshCatalogCounts();
      markSaved();
      return true;
    } finally {
      savingCatalogRef.current = false;
      setSaveProgress(null);
    }
  };

  const removeSaved = (id: string) => {
    if (!catalogId) return;
    void (async () => {
      const next = (await readCatalog<SavedRun>(catalogId)).filter((item) => item.id !== id);
      await writeCatalog(catalogId, next);
      setCatalogVersion((current) => current + 1);
      setCatalogInspected((current) => {
        if (current == null) return current;
        if (!next.length) return null;
        return Math.min(current, next.length - 1);
      });
    })();
  };

  const deleteDisplayedCatalog = () => {
    if (!catalogId || !catalog.length) return;
    const name = pickedName ?? "this archetype";
    if (!window.confirm(`Delete the ${name} catalog currently on screen?`)) return;
    void (async () => {
      await clearCatalog(catalogId);
      await clearArchetypeFields(catalogId, RUN_COUNT);
      if (catalogId === (runningIdRef.current ?? pickedIdRef.current)) {
        snapshotsRef.current = Array.from({ length: RUN_COUNT }, () => null);
      }
      catalogCacheRef.current[catalogId] = [];
      setCatalogEntries([]);
      setCatalogInspected(null);
      setCatalogPage(0);
      setCatalogCounts((current) => ({ ...current, [catalogId]: 0 }));
      setCatalogVersion((current) => current + 1);
    })();
  };

  const applyCatalogView = (nextZoom: number, nextPan: { x: number; y: number }) => {
    const clamped = clampCatalogZoom(nextZoom);
    catalogZoomRef.current = clamped;
    catalogPanRef.current = nextPan;
    setCatalogZoom(clamped);
    setCatalogPan(nextPan);
  };

  const viewArchetype = (id: string) => {
    setCatalogInspected(null);
    setCatalogPage(0);
    applyCatalogView(1, { x: 0, y: 0 });
    setPickedId(id);
    const cached = catalogCacheRef.current[id];
    if (cached?.length) setCatalogEntries(cached);
    else setCatalogEntries([]);
  };

  const pickArchetype = (id: string, force = false) => {
    if (catalogOpen && !force) {
      viewArchetype(id);
      return;
    }
    runningRef.current = false;
    setRunning(false);
    setPaused(false);
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setRunningId(null);
    setCompleted(0);
    setSelected(null);
    setInspecting(false);
    snapshotsRef.current = Array.from({ length: RUN_COUNT }, () => null);
    canvasRefs.current.forEach((canvas) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    setCatalogInspected(null);
    rememberRunsTab(id);
    setPickedId(id);
    void (async () => {
      const kept = await loadArchetypeFields(id, RUN_COUNT);
      if (pickedIdRef.current !== id) return;
      snapshotsRef.current = kept;
      completedRef.current = kept.filter(Boolean).length;
      setCompleted(completedRef.current);
      requestAnimationFrame(() => {
        if (pickedIdRef.current !== id) return;
        kept.forEach((snapshot, index) => {
          const canvas = canvasRefs.current[index];
          if (snapshot && canvas) paintRunCell(canvas, snapshot, variantsRef.current[index]?.translation.recipe.attractors, id);
        });
      });
      void clearRunFields();
    })();
  };

  const startRuns = () => {
    if (!pickedId) return;
    rememberRunsTab(pickedId);
    allQueueRef.current = false;
    setAllQueue(false);
    setCatalogOpen(false);
    setSelected(null);
    setInspecting(false);
    setCatalogInspected(null);
    pendingSavesRef.current = [];
    setRunningId(pickedId);
    void (async () => {
      let existing = snapshotsRef.current;
      if (pickedId === TR_ID) {
        const restyle = sessionStorage.getItem("lm-terraced-restyle") === "1";
        if (restyle) {
          sessionStorage.removeItem("lm-terraced-restyle");
          await clearArchetypeFields(TR_ID, RUN_COUNT);
          await clearRunFields(TR_ID);
          existing = emptyRunSlots();
          snapshotsRef.current = existing;
        } else {
          const stored = await loadArchetypeFields(TR_ID, RUN_COUNT);
          existing = snapshotsRef.current.map((snap, index) => snap ?? stored[index] ?? null);
          snapshotsRef.current = existing;
        }
      } else if (pickedId === "open-hall") {
        await clearArchetypeFields("open-hall", RUN_COUNT);
        await clearRunFields("open-hall");
        existing = emptyRunSlots();
        snapshotsRef.current = existing;
      } else if (pickedId === "undulated") {
        await clearArchetypeFields("undulated", RUN_COUNT);
        await clearRunFields("undulated");
        existing = emptyRunSlots();
        snapshotsRef.current = existing;
      } else if (pickedId === "flat-deep-plan") {
        const redrawPlates = flatDeepPlatesNeedRedraw();
        const loaded = await loadArchetypeFields(pickedId, RUN_COUNT);
        existing = loaded.map((snap, index) => {
          if (!snap) return null;
          if (redrawPlates && flatDeepKept(index)) return null;
          return snap;
        });
        snapshotsRef.current = existing;
      } else if (pickedId === TGF_ID || !existing.some(Boolean)) {
        existing = await loadArchetypeFields(pickedId, RUN_COUNT);
        snapshotsRef.current = existing;
      }
      let resumeAt = 0;
      while (resumeAt < RUN_COUNT && existing[resumeAt]) resumeAt += 1;
      resumeIndexRef.current = resumeAt;
      completedRef.current = existing.filter(Boolean).length;
      setCompleted(completedRef.current);
      if (resumeAt === 0) await clearRunFields(pickedId);
      runningRef.current = true;
      setPaused(false);
      setRunning(true);
      setRunToken((current) => current + 1);
    })();
  };

  const stopRuns = () => {
    runningRef.current = false;
    setRunning(false);
    setPaused(false);
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const pauseRuns = () => {
    if (!runningRef.current) return;
    runningRef.current = false;
    setRunning(false);
    setPaused(true);
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const resumeRuns = () => {
    if (!paused || !resumeFrameRef.current) return;
    runningRef.current = true;
    setPaused(false);
    setRunning(true);
    frameRef.current = requestAnimationFrame(resumeFrameRef.current);
  };

  const resetRuns = () => {
    stopRuns();
    setRunningId(null);
    setCompleted(0);
    setSelected(null);
    setInspecting(false);
    snapshotsRef.current = emptyRunSlots();
    canvasRefs.current.forEach((canvas) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    void (async () => {
      if (pickedId === "undulated") {
        await clearArchetypeFields("undulated", RUN_COUNT);
        await clearRunFields("undulated");
        return;
      }
      await clearRunFields();
      if (pickedId === TGF_ID) await clearArchetypeFields(TGF_ID, RUN_COUNT);
    })();
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const tabId = readRunsTab();
      const { session } = await loadRunsSession({ snapshots: false, archetypeId: tabId });
      if (!live) return;
      const params = new URLSearchParams(window.location.search);
      const fresh = params.get("fresh") === "1";
      allQueueRef.current = false;
      freshQueueRef.current = false;
      autoStartedRef.current = null;
      setAllQueue(false);
      if (fresh) {
        clearAllDoneFlag();
        snapshotsRef.current = Array.from({ length: RUN_COUNT }, () => null);
        completedRef.current = 0;
        setPickedId(ALL_ARCHETYPE_IDS[0] ?? null);
        setRunningId(null);
        setCompleted(0);
        setPaused(false);
        allDoneRef.current = false;
        setAllDone(false);
        try {
          window.localStorage.removeItem("lm-run-all-queue");
          window.localStorage.removeItem("lm-run-all-next");
          params.delete("fresh");
          const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
          window.history.replaceState({}, "", next);
        } catch {
          /* ignore */
        }
      } else {
        const restoreId = tabId ?? session?.pickedId;
        if (restoreId) {
          const kept = await loadArchetypeFields(restoreId, RUN_COUNT);
          if (!live) return;
          if (kept.some(Boolean)) {
            snapshotsRef.current = kept;
            completedRef.current = kept.filter(Boolean).length;
          }
        }
        if (session || restoreId) {
          completedRef.current = snapshotsRef.current.some(Boolean) ? snapshotsRef.current.filter(Boolean).length : session?.completed ?? 0;
          setPickedId(restoreId ?? session?.pickedId ?? null);
          if (restoreId) rememberRunsTab(restoreId);
          setRunningId(null);
          setCompleted(completedRef.current);
          setPaused(false);
        }
        allDoneRef.current = false;
        setAllDone(false);
        try {
          window.localStorage.removeItem("lm-run-all-queue");
          window.localStorage.removeItem("lm-run-all-next");
        } catch {
          /* ignore */
        }
      }
      setSessionReady(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    const storedTab = readRunsTab();
    const current = runningId ?? pickedId;
    if (storedTab && current === ALL_ARCHETYPE_IDS[0] && storedTab !== current) {
      setPickedId(storedTab);
      return;
    }
    if (pickedId) rememberRunsTab(runningId ?? pickedId);
    if (pickedId === "undulated" || runningId === "undulated") {
      void saveRunsMeta(
        { pickedId, runningId, completed, allQueue, allDone, running, paused },
        "undulated",
      );
      return;
    }
    if (pickedId === TR_ID || runningId === TR_ID) {
      void saveRunsMeta(
        { pickedId, runningId, completed, allQueue, allDone, running, paused },
        TR_ID,
      );
      return;
    }
    void saveRunsMeta({
      pickedId,
      runningId,
      completed,
      allQueue,
      allDone,
      running,
      paused,
    });
  }, [sessionReady, pickedId, runningId, completed, allQueue, allDone, running, paused]);

  useEffect(() => {
    if (!sessionReady) return;
    refreshCatalogCounts();
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady || running || completed < RUN_COUNT) return;
    if ((runningId ?? pickedId) !== TGF_ID) return;
    if (fillCatalogRef.current) return;
    fillCatalogRef.current = true;
    void ensureAllCatalogued(TGF_ID);
  }, [sessionReady, running, completed, runningId, pickedId]);

  const finishAllQueue = async () => {
    const currentId = runningIdRef.current ?? pickedIdRef.current;
    const hold = snapshotsRef.current.slice();
    allDoneRef.current = true;
    allQueueRef.current = false;
    setAllQueue(false);
    setAllDone(true);
    try {
      if (currentId) {
        await Promise.all(
          hold.map((snapshot, cell) => {
            if (!snapshot) return Promise.resolve();
            return Promise.all([saveRunSnapshot(cell, snapshot), saveArchetypeField(currentId, cell, snapshot)]);
          }),
        );
      }
      snapshotsRef.current = hold;
      await saveRunsMeta({
        pickedId: pickedIdRef.current,
        runningId: runningIdRef.current,
        completed: RUN_COUNT,
        allQueue: false,
        allDone: true,
        running: false,
        paused: false,
      });
      const [images, fields] = await Promise.all([
        listCatalogCounts(ALL_ARCHETYPE_IDS),
        listArchetypeFieldCounts(ALL_ARCHETYPE_IDS, RUN_COUNT),
      ]);
      await saveCatalogIndex({ ...images, ...Object.fromEntries(ALL_ARCHETYPE_IDS.map((id) => [`field:${id}`, fields[id] ?? 0])) });
      refreshCatalogCounts();
      markSaved();
    } catch {
      snapshotsRef.current = hold;
    }
    try {
      window.localStorage.setItem("lm-run-all-done", "1");
      window.localStorage.removeItem("lm-run-all-queue");
      window.localStorage.removeItem("lm-run-all-next");
      window.sessionStorage.removeItem("lm-run-all-queue");
      window.sessionStorage.removeItem("lm-run-all-next");
      const params = new URLSearchParams(window.location.search);
      if (params.get("all") === "1") {
        params.delete("all");
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
        window.history.replaceState({}, "", next);
      }
    } catch {
      /* ignore */
    }
    document.title = "20 × 5 runs · catalog complete";
  };

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setWall(viewMode === "presentation" || params.get("wall") === "1");
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [viewMode]);

  useEffect(() => {
    if (completed !== RUN_COUNT || savingRef.current) return;
    if (allDoneRef.current) return;
    savingRef.current = true;
    void (async () => {
      if (!allQueueRef.current) {
        savingRef.current = false;
        return;
      }
      const [images, fields] = await Promise.all([
        listCatalogCounts(ALL_ARCHETYPE_IDS),
        listArchetypeFieldCounts(ALL_ARCHETYPE_IDS, RUN_COUNT),
      ]);
      const nextId = ALL_ARCHETYPE_IDS.find((id) => Math.max(images[id] ?? 0, fields[id] ?? 0) < RUN_COUNT);
      if (!nextId) {
        await finishAllQueue();
        savingRef.current = false;
        return;
      }
      try {
        window.localStorage.setItem("lm-run-all-next", nextId);
      } catch {
        /* ignore */
      }
      pendingSavesRef.current = [];
      autoStartedRef.current = null;
      pickArchetype(nextId, true);
      savingRef.current = false;
    })();
  }, [completed]);

  useEffect(() => {
    if (!allQueue && !allDone) return;
    const current = runningId ?? pickedId;
    const index = current ? ALL_ARCHETYPE_IDS.indexOf(current) : -1;
    document.title = allDone
      ? "20 × 5 runs · catalog complete"
      : `${current ?? "runs"} ${completed}/${RUN_COUNT} · ${Math.max(1, index + 1)}/${ALL_ARCHETYPE_IDS.length}`;
  }, [allQueue, allDone, runningId, pickedId, completed]);

  useEffect(() => {
    if (!running || !variantsRef.current.length) return;
    runningRef.current = true;
    let cancelled = false;
    let index = Math.min(RUN_COUNT, Math.max(0, resumeIndexRef.current));
    resumeIndexRef.current = 0;
    if (index <= 0 && !snapshotsRef.current.some(Boolean)) {
      snapshotsRef.current = Array.from({ length: RUN_COUNT }, () => null);
      canvasRefs.current.forEach((canvas) => {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      });
    } else {
      snapshotsRef.current.forEach((snapshot, cell) => {
        const canvas = canvasRefs.current[cell];
        if (!canvas) return;
        if (snapshot) {
          paintRunCell(canvas, snapshot, variantsRef.current[cell]?.translation.recipe.attractors, variantsRef.current[cell]?.translation.archetypeId);
        } else {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
    }
    const previous: MorphFeatures[] = [];
    const previousSequences: number[][] = [];
    const archetypeId = runningIdRef.current ?? pickedIdRef.current;
    const source = archetypeId ? translateArchetype(archetypeId) : null;
    const sourceSlime = source ? slimeControlsFromTranslation(source) : null;

    const simulateVariant = (variant: (typeof variantsRef.current)[number]) => {
      const next = createSimulation(
        variant.translation,
        variant.seed,
        variant.agents,
        trailScaleFor(variant.translation.archetypeId),
      );
      next.maxIterations = DISPLAY_ITERATIONS;
      const rng = mulberry32(variant.seed ^ 0x9e3779b9);
      const slime = lobbySimulationSlime(variant.translation.archetypeId, variant.slime);
      const openHall = variant.translation.archetypeId === "open-hall";
      const flatDeep = variant.translation.archetypeId === "flat-deep-plan";
      const undulated = variant.translation.archetypeId === "undulated";
      const terraced = variant.translation.archetypeId === TR_ID;
      const targetSteps = variant.translation.archetypeId === "topographic-ground-field"
        ? TGF_RUN_ITERATIONS
        : openHall
          ? OH_RUN_ITERATIONS
          : terraced
            ? TERRACE_RUN_ITERATIONS
            : flatDeep || undulated
              ? FLAT_DEEP_RUN_ITERATIONS
              : DISPLAY_ITERATIONS;
      const steps = targetSteps - next.iteration;
      next.maxIterations = next.iteration + Math.max(1, steps);
      if (openHall || flatDeep || undulated) {
        const started = performance.now();
        const budget = openHall ? OH_STEP_BUDGET_MS : 18000;
        let left = Math.max(1, steps);
        while (left > 0 && performance.now() - started < budget) {
          const batch = Math.min(openHall ? 40 : 30, left);
          stepMany(next, variant.translation, rng, batch, slime.decay, slime, false);
          left -= batch;
        }
      } else if (terraced) {
        const started = performance.now();
        let left = Math.max(1, steps);
        while (left > 0 && performance.now() - started < TR_STEP_BUDGET_MS) {
          const batch = Math.min(20, left);
          stepMany(next, variant.translation, rng, batch, slime.decay, slime, false);
          left -= batch;
          if (next.converged) break;
        }
      } else {
        stepMany(next, variant.translation, rng, Math.max(1, steps), slime.decay, slime, false);
      }
      return captureSnapshot(next, true);
    };

    if (archetypeId === "linear-gallery") {
      for (let cell = 0; cell < RUN_COUNT; cell += 1) {
        if (!snapshotsRef.current[cell]) continue;
        const seed = variantsRef.current[cell]?.seed ?? seedFor(archetypeId, cell);
        const planned = planLinearGallery(seed, 0, cell);
        previousSequences.push(
          gallerySignature(attractorsFromLinearGallery(planned, seed, 0), {
            kind: planned.kind,
            growth: planned.growth,
            slime: variantsRef.current[cell]?.slime,
            agents: variantsRef.current[cell]?.agents,
            snapshot: snapshotsRef.current[cell] ?? undefined,
          }),
        );
      }
    }

    if (archetypeId === "topographic-ground-field") {
      for (let cell = 0; cell < RUN_COUNT; cell += 1) {
        if (!snapshotsRef.current[cell]) continue;
        const seed = variantsRef.current[cell]?.seed ?? seedFor(archetypeId, cell);
        const planned = planTopographicGroundField(seed, 0, cell);
        previousSequences.push(
          topographicSignature(attractorsFromTopographic(planned, seed, 0), {
            kind: planned.kind,
            growth: planned.growth,
            figure: planned.figure,
            slime: variantsRef.current[cell]?.slime,
            agents: variantsRef.current[cell]?.agents,
            snapshot: snapshotsRef.current[cell] ?? undefined,
          }),
        );
      }
    }

    const frame = () => {
      if (cancelled || !runningRef.current) return;
      while (index < RUN_COUNT && snapshotsRef.current[index]) index += 1;
      if (index >= RUN_COUNT) {
        runningRef.current = false;
        setRunning(false);
        setCompleted(snapshotsRef.current.filter(Boolean).length);
        return;
      }
      const fallback = variantsRef.current[index];
      const tries: Array<{ variant: typeof fallback; snapshot: FieldSnapshot; features: MorphFeatures; identity: boolean; signature: number[]; score: number }> = [];
      const compressed = fallback.translation.archetypeId === "compressed-sequential";
      const hall = fallback.translation.archetypeId === "continuous-hall";
      const ground = fallback.translation.archetypeId === "topographic-ground-field";
      const gallery = fallback.translation.archetypeId === "linear-gallery";
      const attempts = compressed ? 5 : ground ? 5 : gallery ? 6 : fallback.translation.archetypeId === "vertical-void" || hall ? 6 : 1;
      let chosen: (typeof tries)[number] | null = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const variant =
          source && sourceSlime ? realizeRun(source, sourceSlime, fallback.seed, attempt, index) : fallback;
        const snapshot = simulateVariant(variant);
        const marks = variant.translation.recipe.attractors ?? [];
        const features = extractMorphFeatures(snapshot, marks);
        const identity =
          variant.translation.archetypeId === "vertical-void"
            ? verticalVoidIdentity(features)
            : compressed
              ? compressedSequentialIdentity(features, marks, snapshot)
              : hall
                ? continuousHallIdentity(features, marks, snapshot)
              : ground
                ? topographicIdentity(features, marks, snapshot)
              : gallery
                ? linearGalleryIdentity(features, marks, snapshot)
              : true;
        const signature = compressed
          ? sequenceSignature(marks, { slime: variant.slime, agents: variant.agents })
          : hall
            ? hallSignature(marks, { slime: variant.slime, agents: variant.agents })
            : ground
              ? topographicSignature(marks, {
                  slime: variant.slime,
                  agents: variant.agents,
                  snapshot,
                  ...(() => {
                    const planned = planTopographicGroundField(variant.seed, attempt, index);
                    return { kind: planned.kind, growth: planned.growth, figure: planned.figure };
                  })(),
                })
              : gallery
                ? gallerySignature(marks, {
                    slime: variant.slime,
                    agents: variant.agents,
                    snapshot,
                    ...(() => {
                      const planned = planLinearGallery(variant.seed, attempt, index);
                      return { kind: planned.kind, growth: planned.growth };
                    })(),
                  })
              : [];
        const score = compressed
          ? scoreCompressedSequential(snapshot, marks, variant.slime)
          : ground
            ? scoreTopographic(snapshot, marks)
            : gallery
              ? scoreLinearGallery(snapshot, marks)
              : 0;
        tries.push({ variant, snapshot, features, identity, signature, score });
        if (compressed) continue;
        if (ground) {
          if (identity && isNovelTerrain(signature, previousSequences)) {
            chosen = { variant, snapshot, features, identity, signature, score };
            break;
          }
          continue;
        }
        if (gallery) {
          if (identity && isNovelGallery(signature, previousSequences)) {
            chosen = { variant, snapshot, features, identity, signature, score };
            break;
          }
          continue;
        }
        if (!identity) continue;
        if (hall ? !isNovelHall(signature, previousSequences) : !isNovelMorphology(features, previous)) continue;
        chosen = { variant, snapshot, features, identity, signature, score };
        break;
      }
      if (!chosen) {
        if (compressed || ground || gallery) {
          const novel = tries.filter((item) =>
            item.identity &&
            (gallery
              ? isNovelGallery(item.signature, previousSequences)
              : ground
                ? isNovelTerrain(item.signature, previousSequences)
                : isNovelSequence(item.signature, previousSequences)),
          );
          const valid = novel.length ? novel : tries.filter((item) => item.identity);
          const pool = valid.length ? valid : tries;
          const galleryPool = gallery
            ? pool.filter((item) => (item.signature[14] ?? 0) >= 0.1)
            : pool;
          const ranked = gallery && galleryPool.length ? galleryPool : pool;
          chosen = gallery
            ? ranked[pickMostNovelGallery(ranked.map((item) => item.signature), previousSequences)] ?? ranked[0]
            : ground
              ? pool[pickMostNovelTerrain(pool.map((item) => item.signature), previousSequences)] ?? pool[0]
              : pool.reduce((best, item) => (item.score > best.score ? item : best));
        } else {
          const valid = tries.filter((item) => item.identity);
          const pool = valid.length ? valid : tries;
          chosen = pool[pickMostNovel(pool.map((item) => item.features), previous)] ?? tries[tries.length - 1];
        }
      }
      previous.push(chosen.features);
      if (chosen.signature.length) previousSequences.push(chosen.signature);
      variantsRef.current[index] = chosen.variant;
      snapshotsRef.current[index] = chosen.snapshot;
      const canvas = canvasRefs.current[index];
      if (canvas) paintRunCell(canvas, chosen.snapshot, chosen.variant.translation.recipe.attractors, chosen.variant.translation.archetypeId);
      const id = runningIdRef.current ?? pickedIdRef.current;
      const cell = index;
      const snapshot = chosen.snapshot;
      index += 1;
      setCompleted(snapshotsRef.current.filter(Boolean).length);
      const continueRun = () => {
        if (cancelled || !runningRef.current) return;
        if (index >= RUN_COUNT) {
          runningRef.current = false;
          setRunning(false);
          return;
        }
        frameRef.current = requestAnimationFrame(frame);
      };
      if (id === "open-hall" || id === "undulated") {
        continueRun();
        void Promise.race([
          (async () => {
            await saveRunSnapshot(cell, snapshot, id);
            await saveArchetypeField(id, cell, snapshot);
          })(),
          new Promise((resolve) => window.setTimeout(resolve, 2500)),
        ]).catch(() => {});
      } else {
      void (async () => {
        try {
          await saveRunSnapshot(cell, snapshot, id);
          if (id) await saveArchetypeField(id, cell, snapshot);
          if (id === "flat-deep-plan") markFlatDeepFluid(cell);
        } catch {
          /* a failed save should not stop the remaining cells */
        }
        continueRun();
      })();
      }
    };

    resumeFrameRef.current = frame;
    frameRef.current = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      resumeFrameRef.current = null;
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [runToken, running]);

  useEffect(() => {
    const onResize = () => {
      snapshotsRef.current.forEach((snapshot, index) => {
        const canvas = canvasRefs.current[index];
        if (snapshot && canvas) paintRunCell(canvas, snapshot, variants[index]?.translation.recipe.attractors, variants[index]?.translation.archetypeId);
      });
    };
    if (!catalogOpen) onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [catalogOpen, variants]);

  useEffect(() => {
    if (!inspecting || selected == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInspecting(false);
        setCatalogInspected(null);
      }
      if (event.key === "ArrowRight") {
        setSelected((current) => (current == null ? current : Math.min(RUN_COUNT - 1, current + 1)));
      }
      if (event.key === "ArrowLeft") {
        setSelected((current) => (current == null ? current : Math.max(0, current - 1)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspecting, selected]);

  useEffect(() => {
    if (!inspecting || selected == null) return;
    const snapshot = snapshotsRef.current[selected];
    const canvas = detailRef.current;
    const box = canvas?.parentElement;
    if (!snapshot || !canvas || !box) return;
    const paint = () => paintRunCell(canvas, snapshot, variants[selected]?.translation.recipe.attractors, variants[selected]?.translation.archetypeId, true);
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    const frame = requestAnimationFrame(paint);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [inspecting, selected, completed, variants]);

  const selectedSnapshot = selected == null ? null : snapshotsRef.current[selected];
  const pickedName = TYPOLOGIES.flatMap((typology) => typology.archetypes).find((item) => item.id === (catalogOpen ? pickedId : runningId ?? pickedId))?.name;
  const pageSize = RUN_COUNT;
  const pageCount = 1;
  const page = 0;
  const pageStart = 0;
  const catalogSlots = Array.from({ length: RUN_COUNT }, (_, index) => catalog.find((item) => item.run === index + 1) ?? null);
  const catalogEmptyLabel =
    (catalogCounts[catalogId ?? ""] ?? 0) > 0
      ? "Building catalog from saved runs"
      : "No saved runs for this archetype yet";
  const catalogZoomStyle = {
    transform: `translate(${catalogPan.x}px, ${catalogPan.y}px) scale(${catalogZoom})`,
  };

  return (
    <main className={`flex h-full flex-col bg-black text-[var(--text)]${wall ? " runs-wall" : ""}${view === "catalog" ? "" : " runs-page"}`}>
      <header className="runs-header border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="display text-[0.95rem] text-white">{view === "catalog" ? "Physarum Catalog" : "20 × 5 runs"}</p>
          <div className="flex items-center gap-2">
            <p className="text-[0.58rem] tracking-[0.14em] uppercase text-[var(--muted)]">
              {view === "catalog" ? `${catalog.length} saved` : `${completed} / ${RUN_COUNT}`}
            </p>
          </div>
        </div>
        <div className="mt-0.5 flex items-center">
          <p className={view === "catalog" ? "eyebrow min-w-0 truncate" : "eyebrow shrink-0"}>
            {view === "catalog"
              ? `Generation 01 · Initial morphology population · ${pickedName ?? "Select an archetype"}`
              : pickedName
                ? `${pickedName} · ${RUN_COUNT} growth variants · ${(runningId ?? pickedId) === "open-hall" ? OH_RUN_ITERATIONS : (runningId ?? pickedId) === "flat-deep-plan" ? FLAT_DEEP_RUN_ITERATIONS : DISPLAY_ITERATIONS} iterations`
                : "Select an archetype"}
          </p>
          {view === "catalog" ? (
            <p className="runs-g01-slot" title="This catalog becomes the G01 population of 2D Evolution. Saved entries are legacy studies until validated against the locked generation rules.">
              Legacy entries · G01 validity not confirmed
            </p>
          ) : (
          <div className="runs-controls">
            <button
              type="button"
              onClick={startRuns}
              disabled={!pickedId || running}
              className="runs-control border border-[var(--orange)] bg-[rgba(199,126,95,0.16)] px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase text-[var(--orange-hot)] disabled:opacity-30"
            >
              Start
            </button>
            <button
              type="button"
              onClick={stopRuns}
              disabled={!running && !paused}
              className="runs-control border border-[var(--cyan-dim)] px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase text-[var(--cyan)] disabled:opacity-30"
            >
              Stop
            </button>
            <button
              type="button"
              onClick={paused ? resumeRuns : pauseRuns}
              disabled={!running && !paused}
              className="runs-control border border-[var(--cyan-dim)] px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase text-[var(--cyan)] disabled:opacity-30"
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={resetRuns}
              className="runs-control border border-[var(--cyan-dim)] px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase text-[var(--cyan)]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={saveCatalog}
              disabled={saveProgress != null || (completed < 1 && !snapshotsRef.current.some(Boolean))}
              className={`runs-control border px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase disabled:opacity-30 ${
                saveFlash || saveProgress
                  ? "border-[var(--orange)] bg-[rgba(199,126,95,0.16)] text-[var(--orange-hot)]"
                  : "border-[rgba(242,242,238,0.18)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {saveProgress ? `Saving ${saveProgress.done}/${saveProgress.total}` : saveFlash ? "Saved" : "Save to catalog"}
            </button>
          </div>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
      <aside className="runs-aside panel m-2 flex w-[15.5rem] shrink-0 flex-col" aria-label="Archetype runs">
        <header className="panel-header">
          <div className="panel-header-content">
            <p className="hud-panel-kicker">Input</p>
            <h2 className="panel-title">Archetype</h2>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {TYPOLOGIES.map((typology) => (
            <section key={typology.id} className="flex min-h-0 flex-1 flex-col gap-1.5">
              <p className="eyebrow shrink-0">{typology.label}</p>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                {typology.archetypes.map((item) => {
                  const active = item.id === pickedId;
                  const saved = catalogCounts[item.id] ?? 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => pickArchetype(item.id)}
                      className={`flex min-h-0 flex-1 items-center border px-1.5 py-1.5 text-left text-[0.58rem] leading-tight tracking-[0.08em] uppercase transition ${
                        active
                          ? "border-[var(--cyan)] bg-[linear-gradient(90deg,rgba(15,115,119,0.14),rgba(199,126,95,0.14))] text-white"
                          : "border-[rgba(242,242,238,0.16)] text-[var(--muted)] hover:border-[rgba(242,242,238,0.32)] hover:text-[var(--text)]"
                      }`}
                    >
                      {item.name}{saved ? ` · ${saved}` : ""}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </aside>
      {catalogOpen ? (
        <section className="runs-catalog panel m-2 ml-0 flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Saved runs catalog">
          <header className="panel-header">
            <div className="panel-header-content">
              <p className="hud-panel-kicker">Catalog</p>
              <h2 className="panel-title">{pickedName ?? "Archetype"}</h2>
            </div>
            <div className="runs-catalog-toolbar">
              <div className="runs-catalog-pager">
                <p className="text-[0.58rem] tracking-[0.14em] uppercase text-[var(--muted)]">
                  {catalog.length} saved{allDone ? " · all 15 complete" : ""}
                </p>
                <button type="button" onClick={() => setCatalogPage(page - 1)} disabled={page === 0} aria-label="Previous page">
                  ‹
                </button>
                <span>
                  {page + 1} / {pageCount}
                </span>
                <button type="button" onClick={() => setCatalogPage(page + 1)} disabled={page >= pageCount - 1} aria-label="Next page">
                  ›
                </button>
              </div>
              <div className="runs-catalog-zoom">
                <button type="button" onClick={() => applyCatalogView(catalogZoom / 1.25, catalogPan)} aria-label="Zoom catalog out">
                  −
                </button>
                <button type="button" onClick={() => applyCatalogView(1, { x: 0, y: 0 })} aria-label="Reset catalog zoom">
                  {Math.round(catalogZoom * 100)}%
                </button>
                <button type="button" onClick={() => applyCatalogView(catalogZoom * 1.25, catalogPan)} aria-label="Zoom catalog in">
                  +
                </button>
              </div>
              <div className="runs-catalog-delete">
                <button
                  type="button"
                  onClick={deleteDisplayedCatalog}
                  disabled={!catalog.length}
                  aria-label={`Delete the ${pickedName ?? "current"} catalog`}
                >
                  Delete catalog
                </button>
              </div>
            </div>
          </header>
          <div ref={catalogBodyRef} className="runs-catalog-body">
            {catalog.length ? (
              <div className="runs-catalog-zoom-plane h-full w-full" style={catalogZoomStyle}>
                <div
                  className="runs-catalog-grid h-full w-full"
                  style={{
                    gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
                    gap: wall ? 12 : 8,
                  }}
                >
                  {catalogSlots.map((entry, offset) => (
                    <figure key={entry?.id ?? `empty-${offset}`} className="flex min-h-0 flex-col border border-[rgba(242,242,238,0.16)] bg-black">
                      {entry ? (
                        <>
                      <button
                        type="button"
                        onClick={() => setCatalogInspected(offset)}
                        className="block min-h-0 w-full flex-1 text-left"
                        aria-label={`Open saved run ${String(entry.run).padStart(2, "0")} at full size`}
                      >
                        {catalogId && catalogFieldsRef.current[catalogId]?.[offset] ? (
                          <CatalogFieldThumb snapshot={catalogFieldsRef.current[catalogId][offset]!} />
                        ) : (
                          <img src={entry.image} alt={`Saved run ${String(entry.run).padStart(2, "0")}`} className="block h-full w-full object-contain" loading="lazy" decoding="async" />
                        )}
                      </button>
                      <figcaption className="flex shrink-0 items-center justify-between gap-2 px-1.5 py-1 text-[0.55rem] tracking-[0.08em] uppercase text-[var(--muted)]">
                        <span className="truncate">
                          Run {String(entry.run).padStart(2, "0")} · {entry.kind} · {entry.agents} agents
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSaved(entry.id)}
                          className="border border-[rgba(242,242,238,0.18)] px-1.5 py-0.5 text-[0.5rem] tracking-[0.1em] uppercase text-[var(--muted)] hover:text-[var(--text)]"
                        >
                          Remove
                        </button>
                      </figcaption>
                        </>
                      ) : (
                        <div className="flex flex-1 items-center justify-center text-[0.5rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                          {String(offset + 1).padStart(2, "0")}
                        </div>
                      )}
                    </figure>
                  ))}
                </div>
              </div>
            ) : (
              <p className="flex flex-1 items-center justify-center text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                {catalogEmptyLabel}
              </p>
            )}
          </div>
        </section>
      ) : null}
      {catalogOpen ? null : (
      <div
        className="grid min-h-0 flex-1 gap-px bg-[rgba(242,242,238,0.12)]"
        style={{
          gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: RUN_COUNT }, (_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              setSelected(index);
              setInspecting(true);
            }}
            className={`relative min-h-0 min-w-0 bg-black text-left ${
              selected === index ? "outline outline-1 outline-[var(--orange)]" : ""
            }`}
            aria-label={`Enlarge run ${String(index + 1).padStart(2, "0")}`}
          >
            <canvas
              ref={(node) => {
                canvasRefs.current[index] = node;
              }}
              className="pointer-events-none block h-full w-full object-contain"
            />
            <span className="runs-index pointer-events-none absolute left-1 top-0.5 text-[0.55rem] tracking-[0.08em] text-[rgba(242,242,238,0.55)]">
              {String(index + 1).padStart(2, "0")}
            </span>
          </button>
        ))}
      </div>
      )}
      </div>
      {catalogInspected != null && catalogSlots[catalogInspected] ? (
        <CatalogDetail
          entry={catalogSlots[catalogInspected]}
          snapshot={
            (catalogId ? catalogFieldsRef.current[catalogId]?.[catalogSlots[catalogInspected].run - 1] : null) ??
            (variants[catalogSlots[catalogInspected].run - 1]?.seed === catalogSlots[catalogInspected].seed
              ? snapshotsRef.current[catalogSlots[catalogInspected].run - 1]
              : null)
          }
          onClose={() => setCatalogInspected(null)}
          onStep={(delta) =>
            setCatalogInspected((current) =>
              current == null ? current : Math.min(catalog.length - 1, Math.max(0, current + delta)),
            )
          }
          canPrev={catalogInspected > 0}
          canNext={catalogInspected < catalog.length - 1}
        />
      ) : null}
      {inspecting && selected != null && translation && variants[selected] ? (
        <RunDetail
          index={selected}
          seed={variants[selected].seed}
          agents={variants[selected].agents}
          snapshot={selectedSnapshot}
          translation={variants[selected].translation}
          slime={variants[selected].slime}
          canvasRef={detailRef}
          saved={saveFlash}
          saveLabel={saveProgress ? `Saving ${saveProgress.done}/${saveProgress.total}` : undefined}
          onSave={saveCatalog}
          onClose={() => setInspecting(false)}
          onStep={(delta) =>
            setSelected((current) =>
              current == null ? current : Math.min(RUN_COUNT - 1, Math.max(0, current + delta)),
            )
          }
        />
      ) : null}
    </main>
  );
}

function RunDetail({
  index,
  seed,
  agents,
  snapshot,
  translation,
  slime,
  canvasRef,
  saved,
  saveLabel,
  onSave,
  onClose,
  onStep,
}: {
  index: number;
  seed: number;
  agents: number;
  snapshot: FieldSnapshot | null;
  translation: BiologicalTranslation;
  slime: SlimeControls;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  saved: boolean;
  saveLabel?: string;
  onSave: () => void;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const { params, behavior, recipe } = translation;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="runs-detail grid h-[min(94dvh,920px)] w-[min(98vw,1480px)] grid-cols-[minmax(0,1fr)_22rem] overflow-hidden border border-[var(--line)] bg-[#050505]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Run ${String(index + 1).padStart(2, "0")} parameters`}
      >
        <div className="relative min-h-0 min-w-0 bg-black">
          {snapshot ? (
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center text-[0.72rem] uppercase tracking-[0.16em] text-[var(--muted)]">
              Still generating
            </p>
          )}
        </div>
        <aside className="flex min-h-0 w-[22rem] shrink-0 flex-col border-l border-[var(--line)]">
          <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="display text-[0.95rem] text-white">Run {String(index + 1).padStart(2, "0")}</p>
              <p className="mt-1 text-[0.68rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                {translation.archetypeName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSave}
                disabled={!snapshot || Boolean(saveLabel)}
                className="border border-[var(--orange)] bg-[rgba(199,126,95,0.16)] px-2 py-1 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--orange-hot)] disabled:opacity-30"
              >
                {saveLabel ?? (saved ? "Saved" : "Save to catalog")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="border border-[rgba(242,242,238,0.18)] px-2 py-1 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--text)]"
              >
                Close
              </button>
            </div>
          </header>
          <RunInfoLists
            seed={seed}
            agents={agents}
            iterations={snapshot?.iteration ?? DISPLAY_ITERATIONS}
            field={`${snapshot?.size ?? 20} × ${snapshot?.size ?? 20}`}
            slime={slime}
            params={params}
            behavior={behavior}
            recipe={recipe}
            topology={translation.topology}
          />
          <footer className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3">
            <button
              type="button"
              onClick={() => onStep(-1)}
              disabled={index === 0}
              className="border border-[rgba(242,242,238,0.18)] px-3 py-1 text-[0.68rem] uppercase tracking-[0.14em] disabled:opacity-30"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              disabled={index === RUN_COUNT - 1}
              className="border border-[rgba(242,242,238,0.18)] px-3 py-1 text-[0.68rem] uppercase tracking-[0.14em] disabled:opacity-30"
            >
              Next
            </button>
          </footer>
        </aside>
      </div>
    </div>
  );
}

function CatalogFieldThumb({ snapshot }: { snapshot: FieldSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const size = Math.max(48, Math.floor(Math.min(parent.clientWidth, parent.clientHeight) || 96));
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    drawPlanField(ctx, snapshot, size, size, { showHud: false, fine: false, density: 5, showAttractors: false });
  }, [snapshot]);
  return <canvas ref={ref} className="block h-full w-full object-contain" />;
}

function CatalogDetail({
  entry,
  snapshot,
  onClose,
  onStep,
  canPrev,
  canNext,
}: {
  entry: SavedRun;
  snapshot: FieldSnapshot | null;
  onClose: () => void;
  onStep: (delta: number) => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const rebuilt = rebuildSavedDetail(entry);
  const { slime, translation } = rebuilt;
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    if (!snapshot || !canvas || !box) return;
    const paint = () =>
      paintSnapshot(
        canvas,
        snapshot,
        true,
        translation.recipe.attractors,
        undefined,
        finePaint(translation.archetypeId) ? 8 : 5,
        finePaint(translation.archetypeId) ? Math.max(1.4, robustTrailPeak(snapshot.trails)) : undefined,
        finePaint(translation.archetypeId),
      );
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    const frame = requestAnimationFrame(paint);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [snapshot, translation.recipe.attractors]);
  useEffect(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [entry.id]);
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const apply = (nextZoom: number, nextPan: { x: number; y: number }) => {
      const clamped = clampCatalogZoom(nextZoom);
      zoomRef.current = clamped;
      panRef.current = nextPan;
      setZoom(clamped);
      setPan(nextPan);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = node.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      const prev = zoomRef.current;
      const next = clampCatalogZoom(prev * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
      const ratio = next / prev;
      const prevPan = panRef.current;
      apply(next, { x: px - (px - prevPan.x) * ratio, y: py - (py - prevPan.y) * ratio });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="runs-detail grid h-[min(94dvh,920px)] w-[min(98vw,1480px)] grid-cols-[minmax(0,1fr)_22rem] overflow-hidden border border-[var(--line)] bg-[#050505]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Saved run ${String(entry.run).padStart(2, "0")} parameters`}
      >
        <div ref={frameRef} className="relative min-h-0 min-w-0 overflow-hidden bg-black">
          <div className="runs-catalog-zoom-plane absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {snapshot ? (
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          ) : (
            <img src={entry.image} alt={`Saved run ${String(entry.run).padStart(2, "0")}`} className="absolute inset-0 h-full w-full object-contain" />
          )}
          </div>
          <div className="runs-catalog-zoom runs-catalog-zoom-overlay">
            <button type="button" onClick={() => { const next = clampCatalogZoom(zoom / 1.25); zoomRef.current = next; setZoom(next); }} aria-label="Zoom saved run out">−</button>
            <button type="button" onClick={() => { zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Reset saved run zoom">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => { const next = clampCatalogZoom(zoom * 1.25); zoomRef.current = next; setZoom(next); }} aria-label="Zoom saved run in">+</button>
          </div>
        </div>
        <aside className="flex min-h-0 w-[22rem] shrink-0 flex-col border-l border-[var(--line)]">
          <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="display text-[0.95rem] text-white">Run {String(entry.run).padStart(2, "0")}</p>
              <p className="mt-1 text-[0.68rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                {translation.archetypeName} · {entry.kind}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="border border-[rgba(242,242,238,0.18)] px-2 py-1 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--text)]"
            >
              Close
            </button>
          </header>
          <RunInfoLists
            seed={entry.seed}
            agents={entry.agents}
            iterations={entry.iterations}
            field="20 × 20"
            slime={slime}
            params={translation.params}
            behavior={translation.behavior}
            recipe={translation.recipe}
            topology={translation.topology}
          />
          <footer className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3">
            <button
              type="button"
              onClick={() => onStep(-1)}
              disabled={!canPrev}
              className="border border-[rgba(242,242,238,0.18)] px-3 py-1 text-[0.68rem] uppercase tracking-[0.14em] disabled:opacity-30"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              disabled={!canNext}
              className="border border-[rgba(242,242,238,0.18)] px-3 py-1 text-[0.68rem] uppercase tracking-[0.14em] disabled:opacity-30"
            >
              Next
            </button>
          </footer>
        </aside>
      </div>
    </div>
  );
}
