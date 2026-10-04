"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  captureSnapshot,
  createSimulation,
  stepMany,
} from "@/lib/skill1/engine";
import { DISPLAY_ITERATIONS, MIN_AGENT_COUNT, robustTrailPeak } from "@/lib/skill1/maps";
import { runAttractorsFor } from "@/lib/skill1/run-variants";
import {
  agentsFromCompressedSequential,
  attractorsFromCompressedSequential,
  compressedSequentialIdentity,
  foodFromAttractors,
  isNovelSequence,
  paramsFromCompressedSequential,
  planCompressedSequential,
  recipeFromCompressedSequential,
  scoreCompressedSequential,
  sequenceSignature,
  slimeFromCompressedSequential,
} from "@/lib/skill1/run-compressed-sequential";
import {
  agentsFromTopographic,
  attractorsFromTopographic,
  isNovelTerrain,
  paramsFromTopographic,
  planTopographicGroundField,
  recipeFromTopographic,
  scoreTopographic,
  slimeFromTopographic,
  topographicIdentity,
  topographicSignature,
} from "@/lib/skill1/run-topographic-ground-field";
import {
  agentsFromLinearGallery,
  attractorsFromLinearGallery,
  gallerySignature,
  isNovelGallery,
  linearGalleryIdentity,
  paramsFromLinearGallery,
  pickMostNovelGallery,
  planLinearGallery,
  recipeFromLinearGallery,
  scoreLinearGallery,
  slimeFromLinearGallery,
} from "@/lib/skill1/run-linear-gallery";
import {
  agentsFromContinuousHall,
  attractorsFromContinuousHall,
  continuousHallIdentity,
  hallSignature,
  isNovelHall,
  paramsFromContinuousHall,
  planContinuousHall,
  recipeFromContinuousHall,
  slimeFromContinuousHall,
} from "@/lib/skill1/run-continuous-hall";
import {
  extractMorphFeatures,
  isNovelMorphology,
  pickMostNovel,
  planVerticalVoid,
  slimeFromVerticalVoidPlan,
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
import { useSquareGridFit } from "@/components/use-square-grid-fit";
import { TYPOLOGIES } from "@/lib/catalog";
import { listCatalogCounts, putCatalogEntries, readCatalog, writeCatalog } from "@/lib/skill1/run-catalog";
import { readSharedCatalog, shareCatalogEntries } from "@/lib/skill1/shared-catalog";
import { listArchetypeFieldCounts, loadArchetypeFields, saveArchetypeField } from "@/lib/persist/run-fields";
import { clearAllDoneFlag, clearRunFields, loadRunsSession, readAllDoneFlag, saveCatalogIndex, saveRunSnapshot, saveRunsMeta } from "@/lib/persist/session";

const COLUMNS = 20;
const ROWS = 5;
const RUN_COUNT = COLUMNS * ROWS;
const ALL_ARCHETYPE_IDS = TYPOLOGIES.flatMap((typology) => typology.archetypes.map((item) => item.id));
/** Run grid uses a lighter trail so 100 cells can finish. Dedicated planners raise this per archetype. */
const RUN_TRAIL_SCALE = 8;
/** Compressed Sequential needs more texels so zoomed white filaments stay hair-thin. */
const CS_TRAIL_SCALE = 32;
const TGF_TRAIL_SCALE = 32;
const LG_TRAIL_SCALE = 16;

function finePaint(id?: string) {
  return id === "compressed-sequential" || id === "topographic-ground-field" || id === "linear-gallery";
}

function trailScaleFor(id?: string) {
  if (id === "topographic-ground-field") return TGF_TRAIL_SCALE;
  if (id === "compressed-sequential") return CS_TRAIL_SCALE;
  if (id === "linear-gallery") return LG_TRAIL_SCALE;
  return RUN_TRAIL_SCALE;
}
/** 8× the 160-cell trail. Sharp enough for catalog PNGs without the 2048 dumps that failed to save. */
const CATALOG_IMAGE_SIZE = 1280;
/** Continuous Hall runs that never landed in git. */
const CH_GAP_RUNS = new Set([17, 18, 19, 20, 21, 22, 23, 24, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]);
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

type RunVariant = {
  seed: number;
  agents: number;
  slime: SlimeControls;
  translation: BiologicalTranslation;
};

function rebuildSavedDetail(entry: SavedRun) {
  const base = translateArchetype(entry.archetypeId);
  try {
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
): RunVariant {
  const compressedPlan = base.archetypeId === "compressed-sequential" ? planCompressedSequential(seed, attempt, index) : null;
  const hallPlan = base.archetypeId === "continuous-hall" ? planContinuousHall(seed, attempt, index) : null;
  const groundPlan = base.archetypeId === "topographic-ground-field" ? planTopographicGroundField(seed, attempt, index) : null;
  const galleryPlan = base.archetypeId === "linear-gallery" ? planLinearGallery(seed, attempt, index) : null;
  const runTranslation = translationForRun(base, seed, index, attempt);
  const tuned = compressedPlan
    ? {
        ...runTranslation,
        params: paramsFromCompressedSequential(base.params, compressedPlan),
        recipe: {
          ...recipeFromCompressedSequential(runTranslation.recipe, compressedPlan, seed ^ (attempt * 131)),
          attractors: attractorsFromCompressedSequential(compressedPlan, seed, attempt),
          attractorFixed: true,
          attractorsOnly: compressedPlan.attractorsOnly,
        },
      }
    : hallPlan
      ? {
          ...runTranslation,
          topology: (hallPlan.figure === "void-cut" ? "around-absence" : "open-network") as BiologicalTranslation["topology"],
          params: paramsFromContinuousHall(base.params, hallPlan),
          recipe: {
            ...recipeFromContinuousHall(runTranslation.recipe, hallPlan, seed ^ (attempt * 131)),
            attractors: attractorsFromContinuousHall(hallPlan, seed, attempt),
          },
        }
      : groundPlan
        ? {
            ...runTranslation,
            params: paramsFromTopographic(base.params, seed ^ (attempt * 131)),
            recipe: {
              ...recipeFromTopographic(runTranslation.recipe, seed ^ (attempt * 131)),
              attractors: attractorsFromTopographic(groundPlan, seed, attempt),
              attractorFixed: true,
              attractorsOnly: true,
            },
          }
        : galleryPlan
          ? {
              ...runTranslation,
              params: paramsFromLinearGallery(base.params, seed ^ (attempt * 131)),
              recipe: {
                ...recipeFromLinearGallery(runTranslation.recipe, seed ^ (attempt * 131)),
                attractors: attractorsFromLinearGallery(galleryPlan, seed, attempt),
                attractorFixed: true,
                attractorsOnly: true,
              },
            }
          : runTranslation;
  const marks = tuned.recipe.attractors ?? [];
  const slime =
    base.archetypeId === "vertical-void"
      ? {
          ...slimeFromVerticalVoidPlan(slimeBase, planVerticalVoid(seed, attempt), seed ^ (attempt * 131)),
          foodPoints: marks.map((mark) => ({ x: mark.x, y: mark.y })),
        }
      : compressedPlan
        ? {
            ...slimeFromCompressedSequential(slimeBase, compressedPlan, seed ^ (attempt * 131)),
            foodPoints: foodFromAttractors(marks),
          }
        : hallPlan
          ? {
              ...slimeFromContinuousHall(slimeBase, hallPlan, seed ^ (attempt * 131)),
              foodPoints: (() => {
                if (hallPlan.figure !== "void-cut") return foodFromAttractors(marks);
                const banks = foodFromAttractors(marks.filter((item) => !item.hole && item.kind !== "ring"));
                return banks.length ? banks : [{ x: hallPlan.cx, y: hallPlan.cy }];
              })(),
            }
          : groundPlan
            ? {
                ...slimeFromTopographic(slimeBase, groundPlan, seed ^ (attempt * 131)),
                foodPoints: foodFromAttractors(marks),
              }
            : galleryPlan
              ? {
                  ...slimeFromLinearGallery(slimeBase, galleryPlan, seed ^ (attempt * 131)),
                  foodPoints: foodFromAttractors(marks),
                }
              : {
                  ...varySlimeControls(slimeBase, seed ^ (attempt * 9973), base.archetypeId),
                  foodPoints: marks.map((mark) => ({ x: mark.x, y: mark.y })),
                };
  const rng = mulberry32(seed ^ 0x6d2b79f5 ^ attempt);
  const baseAgents = agentCountFromDensity(densityFromTranslation(base)) + (rng() - 0.5) * 36;
  const plannedAgents = compressedPlan
    ? agentsFromCompressedSequential(compressedPlan, seed ^ attempt)
    : hallPlan
      ? agentsFromContinuousHall(hallPlan, seed ^ attempt)
      : groundPlan
        ? agentsFromTopographic(groundPlan, seed ^ attempt)
        : galleryPlan
          ? agentsFromLinearGallery(galleryPlan, seed ^ attempt)
          : baseAgents;
  const agents = Math.round(Math.min(600, Math.max(MIN_AGENT_COUNT, plannedAgents)));
  return { seed, agents, slime, translation: tuned };
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
};

function snapshotImage(
  snapshot: FieldSnapshot,
  size = CATALOG_IMAGE_SIZE,
  attractors?: FieldAttractor[],
  peak?: number,
  hairThin = false,
) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  drawPlanField(ctx, snapshot, size, size, {
    showHud: false,
    fine: true,
    density: hairThin ? 8 : 5,
    attractors,
    showAttractors: false,
    peak,
    hairThin,
  });
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

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
  snapshot: FieldSnapshot | null,
  canvas: HTMLCanvasElement | null,
  size = CATALOG_IMAGE_SIZE,
  attractors?: FieldAttractor[],
  peak?: number,
  hairThin = false,
) {
  return (snapshot ? snapshotImage(snapshot, size, attractors, peak, hairThin) : "") || canvasImage(canvas);
}

function paintRunCell(
  canvas: HTMLCanvasElement,
  snapshot: FieldSnapshot,
  attractors?: FieldAttractor[],
  archetypeId?: string,
  fine = false,
) {
  const hair = finePaint(archetypeId);
  paintSnapshot(
    canvas,
    snapshot,
    fine,
    attractors,
    undefined,
    hair ? 8 : 5,
    hair ? Math.max(1.4, robustTrailPeak(snapshot.trails)) : undefined,
    hair,
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
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const snapshotsRef = useRef<Array<FieldSnapshot | null>>(Array.from({ length: RUN_COUNT }, () => null));
  const [completed, setCompleted] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runToken, setRunToken] = useState(0);
  const [wall, setWall] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(view === "catalog");
  const catalogBodyRef = useRef<HTMLDivElement>(null);
  const [catalogPage, setCatalogPage] = useState(0);
  const catalogFit = useSquareGridFit(catalogBodyRef, {
    minimum: wall ? 300 : 132,
    caption: wall ? 50 : 28,
    gap: wall ? 12 : 8,
    enabled: catalogOpen,
  });
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [inspecting, setInspecting] = useState(false);
  const [catalogInspected, setCatalogInspected] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [catalogEntries, setCatalogEntries] = useState<SavedRun[]>([]);
  const [allQueue, setAllQueue] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const runningRef = useRef(false);
  const allQueueRef = useRef(false);
  const allDoneRef = useRef(false);
  const freshQueueRef = useRef(false);
  const savingRef = useRef(false);
  const autoStartedRef = useRef<string | null>(null);
  const resumeIndexRef = useRef(0);
  const completedRef = useRef(0);
  const wallRef = useRef(false);
  const runningIdRef = useRef<string | null>(null);
  const pickedIdRef = useRef<string | null>(null);
  const pendingSavesRef = useRef<SavedRun[]>([]);
  const variantsRef = useRef<RunVariant[]>([]);
  const chosenRef = useRef<Array<RunVariant | null>>(Array.from({ length: RUN_COUNT }, () => null));
  const chosenForRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const resumeFrameRef = useRef<(() => void) | null>(null);
  const saveFlashTimer = useRef<number | null>(null);
  const catalogCacheRef = useRef<Record<string, SavedRun[]>>({});
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
  const variants = useMemo(
    () => (slime && translation ? seeds.map((seed, index) => realizeRun(translation, slime, seed, 0, index)) : []),
    [seeds, slime, translation],
  );

  const catalogId = catalogOpen ? pickedId : activeId;
  const catalog = catalogEntries;
  completedRef.current = completed;
  if (chosenForRef.current !== (activeId ?? null)) {
    chosenForRef.current = activeId ?? null;
    chosenRef.current = Array.from({ length: RUN_COUNT }, () => null);
  }
  variantsRef.current = variants.map((item, index) => chosenRef.current[index] ?? item);
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
    const hair = finePaint(id);
    const image = snapshotImage(
      snapshot,
      768,
      marks,
      hair ? Math.max(1.4, robustTrailPeak(snapshot.trails)) : undefined,
      hair,
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
    };
  };

  const catalogFromFields = async (id: string, skipRuns?: Set<number>) => {
    const kept = await loadArchetypeFields(id, RUN_COUNT);
    const entries: SavedRun[] = [];
    for (let index = 0; index < RUN_COUNT; index += 1) {
      if (skipRuns?.has(index + 1)) continue;
      const snapshot = kept[index] ?? (id === (runningIdRef.current ?? pickedIdRef.current) ? snapshotsRef.current[index] : null);
      if (!snapshot) continue;
      const entry = entryFromSnapshot(id, index, snapshot);
      if (entry) entries.push(entry);
    }
    if (kept.some(Boolean) && id === (runningIdRef.current ?? pickedIdRef.current)) snapshotsRef.current = kept;
    return entries;
  };

  const mergeCatalog = async (id: string) => {
    const stored = await readCatalog<SavedRun>(id);
    const usable: SavedRun[] = [];
    for (const item of stored) {
      if (!item.image) continue;
      if (item.image.startsWith("/shared-catalog/linear-edge-gallery/") && (await isTinySharedImage(item.image))) continue;
      usable.push(item);
    }
    const extra = await catalogFromFields(id, new Set(usable.map((item) => item.run)));
    return [...usable, ...extra].sort((a, b) => a.run - b.run);
  };

  const writeContinuousHallGaps = (entries: SavedRun[]) => {
    if (typeof sessionStorage === "undefined" || sessionStorage.getItem("lm-ch-gap-write") === "done") return;
    const missing = entries.filter((item) => CH_GAP_RUNS.has(item.run) && item.image);
    if (!missing.length) return;
    sessionStorage.setItem("lm-ch-gap-write", "done");
    void shareCatalogEntries("continuous-hall", missing);
  };

  const writeLinearEdgeOriginals = (entries: SavedRun[]) => {
    if (typeof sessionStorage === "undefined") return;
    void (async () => {
      if (sessionStorage.getItem("lm-leg-rewrite-v2") === "done") return;
      const real = entries.filter((item) => item.image && !item.image.startsWith("/shared-catalog/"));
      if (!real.length) return;
      sessionStorage.setItem("lm-leg-rewrite-v2", "done");
      await shareCatalogEntries("linear-edge-gallery", real);
    })();
  };

  useEffect(() => {
    if (pickedId !== "linear-edge-gallery") return;
    let live = true;
    void (async () => {
      const next = await mergeCatalog("linear-edge-gallery");
      if (!live) return;
      writeLinearEdgeOriginals(next);
    })();
    return () => {
      live = false;
    };
  }, [pickedId]);

  useEffect(() => {
    if (!catalogOpen || !catalogId) return;
    let live = true;
    void (async () => {
      const cached = catalogCacheRef.current[catalogId] ?? [];
      if (cached.length) setCatalogEntries(cached);
      const stored = await readCatalog<SavedRun>(catalogId);
      if (!live) return;
      if (stored.length) {
        catalogCacheRef.current[catalogId] = stored;
        setCatalogEntries(stored);
      }
      const next = await mergeCatalog(catalogId);
      if (!live) return;
      catalogCacheRef.current[catalogId] = next;
      setCatalogEntries(next);
      refreshCatalogCounts();
      if (catalogId === "continuous-hall") writeContinuousHallGaps(next);
      if (catalogId === "linear-edge-gallery") writeLinearEdgeOriginals(next);
    })();
    return () => {
      live = false;
    };
  }, [catalogOpen, catalogId, catalogVersion]);

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
    const hair = finePaint(id);
    const image = entryImage(
      snapshot,
      canvasRefs.current[index],
      size,
      marks,
      hair && snapshot ? Math.max(1.4, robustTrailPeak(snapshot.trails)) : undefined,
      hair,
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
    };
  };

  const persistEntries = async (id: string, incoming: SavedRun[]) => {
    incoming = incoming.filter((item) => item.image.startsWith("data:"));
    if (!incoming.length) return false;
    const saved = (await putCatalogEntries(id, incoming))
      ? incoming
      : await (async () => {
          const compact = incoming.map((item) => {
            const index = item.run - 1;
            const snapshot = snapshotsRef.current[index];
            const marks = variantsRef.current[index]?.translation.recipe.attractors;
            const hair = finePaint(id);
            const image = entryImage(
              snapshot,
              canvasRefs.current[index],
              960,
              marks,
              hair && snapshot ? Math.max(1.4, robustTrailPeak(snapshot.trails)) : undefined,
              hair,
            );
            return image ? { ...item, image } : item;
          });
          return (await putCatalogEntries(id, compact)) ? compact : null;
        })();
    if (!saved) return false;
    void shareCatalogEntries(id, saved);
    return true;
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
    const id = runningIdRef.current ?? pickedIdRef.current;
    if (!id) return false;
    const kept = await loadArchetypeFields(id, RUN_COUNT);
    if (kept.some(Boolean)) {
      snapshotsRef.current = snapshotsRef.current.map((current, index) => current ?? kept[index] ?? null);
    }
    const savedAt = Date.now();
    const incoming: SavedRun[] = [];
    for (let index = 0; index < RUN_COUNT; index += 1) {
      const entry = buildEntry(index, savedAt, CATALOG_IMAGE_SIZE, id);
      if (entry) incoming.push(entry);
      if (index % 4 === 3) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    if (!incoming.length) return false;
    if (!(await persistEntries(id, incoming))) return false;
    const stored = await readCatalog<SavedRun>(id);
    catalogCacheRef.current[id] = stored;
    setCatalogEntries(stored);
    refreshCatalogCounts();
    markSaved();
    return true;
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

  const viewArchetype = (id: string) => {
    setCatalogInspected(null);
    setCatalogPage(0);
    setPickedId(id);
    const cached = catalogCacheRef.current[id];
    if (cached?.length) setCatalogEntries(cached);
    else setCatalogEntries([]);
    void (async () => {
      const next = await mergeCatalog(id);
      catalogCacheRef.current[id] = next;
      setCatalogEntries(next);
    })();
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
    setPickedId(id);
    void (async () => {
      const kept = await loadArchetypeFields(id, RUN_COUNT);
      snapshotsRef.current = kept;
      completedRef.current = kept.filter(Boolean).length;
      setCompleted(completedRef.current);
      void clearRunFields();
    })();
  };

  const startRuns = () => {
    if (!pickedId) return;
    if (allQueueRef.current || new URLSearchParams(window.location.search).get("all") === "1") {
      allQueueRef.current = true;
      setAllQueue(true);
      try {
        window.localStorage.setItem("lm-run-all-queue", "1");
        window.localStorage.setItem("lm-run-all-next", pickedId);
      } catch {
        /* ignore */
      }
    }
    setCatalogOpen(false);
    runningRef.current = true;
    setRunning(true);
    setPaused(false);
    setSelected(null);
    setInspecting(false);
    setCatalogInspected(null);
    pendingSavesRef.current = [];
    resumeIndexRef.current = 0;
    setCompleted(0);
    setRunningId(pickedId);
    setRunToken((current) => current + 1);
    void clearRunFields();
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
    snapshotsRef.current = Array.from({ length: RUN_COUNT }, () => null);
    canvasRefs.current.forEach((canvas) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    void clearRunFields();
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const { session, snapshots } = await loadRunsSession();
      if (!live) return;
      const params = new URLSearchParams(window.location.search);
      const fresh = params.get("fresh") === "1";
      const lastId = session?.runningId ?? session?.pickedId ?? null;
      if (!fresh && lastId && snapshots.some(Boolean)) {
        await Promise.all(
          snapshots.map((snapshot, index) => (snapshot ? saveArchetypeField(lastId, index, snapshot) : Promise.resolve())),
        );
      }
      const [images, fields] = await Promise.all([
        listCatalogCounts(ALL_ARCHETYPE_IDS),
        listArchetypeFieldCounts(ALL_ARCHETYPE_IDS, RUN_COUNT),
      ]);
      const savedFor = (id: string) => Math.max(images[id] ?? 0, fields[id] ?? 0);
      const allSaved = !fresh && ALL_ARCHETYPE_IDS.every((id) => savedFor(id) >= RUN_COUNT);
      if (fresh) {
        clearAllDoneFlag();
        freshQueueRef.current = true;
        autoStartedRef.current = null;
        snapshotsRef.current = Array.from({ length: RUN_COUNT }, () => null);
        completedRef.current = 0;
        setPickedId(ALL_ARCHETYPE_IDS[0] ?? null);
        setRunningId(null);
        setCompleted(0);
        setPaused(false);
        allDoneRef.current = false;
        allQueueRef.current = true;
        setAllDone(false);
        setAllQueue(true);
        try {
          window.localStorage.setItem("lm-run-all-queue", "1");
          window.localStorage.setItem("lm-run-all-next", ALL_ARCHETYPE_IDS[0] ?? "");
          params.delete("fresh");
          const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
          window.history.replaceState({}, "", next);
        } catch {
          /* ignore */
        }
      } else {
        if (session) {
          snapshotsRef.current = snapshots;
          completedRef.current = session.completed;
          setPickedId(session.pickedId);
          setRunningId(session.runningId);
          setCompleted(session.completed);
          setPaused(false);
          if (session.pickedId) autoStartedRef.current = session.completed > 0 ? session.pickedId : autoStartedRef.current;
        }
        const firstMissing = ALL_ARCHETYPE_IDS.find((id) => savedFor(id) < RUN_COUNT) ?? null;
        if (!allSaved) clearAllDoneFlag();
        allDoneRef.current = allSaved;
        allQueueRef.current = !allSaved;
        setAllDone(allSaved);
        setAllQueue(!allSaved);
        if (!allSaved && firstMissing && !session?.pickedId) setPickedId(firstMissing);
        if (allSaved) {
          try {
            window.localStorage.setItem("lm-run-all-done", "1");
            window.localStorage.removeItem("lm-run-all-queue");
            window.localStorage.removeItem("lm-run-all-next");
          } catch {
            /* ignore */
          }
        } else {
          try {
            window.localStorage.setItem("lm-run-all-queue", "1");
            if (firstMissing) window.localStorage.setItem("lm-run-all-next", firstMissing);
          } catch {
            /* ignore */
          }
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
      setWall(params.get("wall") === "1");
      if (params.get("fresh") === "1") {
        clearAllDoneFlag();
        allDoneRef.current = false;
        allQueueRef.current = true;
        freshQueueRef.current = true;
        setAllDone(false);
        setAllQueue(true);
        setPickedId(ALL_ARCHETYPE_IDS[0] ?? null);
        return;
      }
      if (allDoneRef.current || readAllDoneFlag()) {
        allDoneRef.current = true;
        allQueueRef.current = false;
        setAllDone(true);
        setAllQueue(false);
        return;
      }
      const queued =
        params.get("all") === "1" ||
        window.localStorage.getItem("lm-run-all-queue") === "1" ||
        window.sessionStorage.getItem("lm-run-all-queue") === "1";
      if (queued) {
        allQueueRef.current = true;
        setAllQueue(true);
        const resume =
          window.localStorage.getItem("lm-run-all-next") || window.sessionStorage.getItem("lm-run-all-next");
        setPickedId((current) => current ?? resume ?? ALL_ARCHETYPE_IDS[0] ?? null);
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (allDoneRef.current || catalogOpen) return;
    if (!allQueueRef.current || !pickedId || running || paused || savingRef.current) return;
    void (async () => {
      if (freshQueueRef.current) {
        freshQueueRef.current = false;
        autoStartedRef.current = pickedId;
        startRuns();
        return;
      }
      const [images, fields] = await Promise.all([
        listCatalogCounts(ALL_ARCHETYPE_IDS),
        listArchetypeFieldCounts(ALL_ARCHETYPE_IDS, RUN_COUNT),
      ]);
      const savedFor = (id: string) => Math.max(images[id] ?? 0, fields[id] ?? 0);
      if (ALL_ARCHETYPE_IDS.every((id) => savedFor(id) >= RUN_COUNT)) {
        await finishAllQueue();
        return;
      }
      const stored = savedFor(pickedId);
      if (stored >= RUN_COUNT) {
        const nextId = ALL_ARCHETYPE_IDS.find((id) => savedFor(id) < RUN_COUNT);
        if (!nextId) {
          await finishAllQueue();
          return;
        }
        autoStartedRef.current = null;
        pickArchetype(nextId, true);
        return;
      }
      if (completed === RUN_COUNT) return;
      if (stored > 0 && stored < RUN_COUNT) {
        const kept = await loadArchetypeFields(pickedId, RUN_COUNT);
        snapshotsRef.current = kept;
        autoStartedRef.current = pickedId;
        resumeIndexRef.current = stored;
        runningRef.current = true;
        setCompleted(stored);
        setRunning(true);
        setRunningId(pickedId);
        setRunToken((current) => current + 1);
        return;
      }
      if (completed > 0 && snapshotsRef.current.some(Boolean) && stored < RUN_COUNT) {
        autoStartedRef.current = pickedId;
        resumeIndexRef.current = completed;
        runningRef.current = true;
        setRunning(true);
        setRunningId(pickedId);
        setRunToken((current) => current + 1);
        return;
      }
      if (autoStartedRef.current === pickedId) return;
      autoStartedRef.current = pickedId;
      startRuns();
    })();
  }, [sessionReady, allQueue, pickedId, running, paused, completed]);

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
    if (index <= 0) {
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
        const variant = variantsRef.current[cell];
        if (snapshot && canvas) paintRunCell(canvas, snapshot, variant?.translation.recipe.attractors, variant?.translation.archetypeId);
      });
    }
    const previous: MorphFeatures[] = [];
    const previousSequences: number[][] = [];
    const archetypeId = runningIdRef.current ?? pickedIdRef.current;
    const source = archetypeId ? translateArchetype(archetypeId) : null;
    const sourceSlime = source ? slimeControlsFromTranslation(source) : null;

    const simulateVariant = (variant: RunVariant) => {
      const next = createSimulation(
        variant.translation,
        variant.seed,
        variant.agents,
        trailScaleFor(variant.translation.archetypeId),
      );
      next.maxIterations = DISPLAY_ITERATIONS;
      const rng = mulberry32(variant.seed ^ 0x9e3779b9);
      const slime = {
        ...variant.slime,
        diffusion:
          variant.translation.archetypeId === "continuous-hall" || finePaint(variant.translation.archetypeId)
            ? variant.slime.diffusion
            : Math.min(variant.slime.diffusion, 0.04),
      };
      const steps = DISPLAY_ITERATIONS - next.iteration;
      next.maxIterations = next.iteration + Math.max(1, steps);
      stepMany(next, variant.translation, rng, Math.max(1, steps), slime.decay, slime, false);
      return captureSnapshot(next, true);
    };

    const frame = () => {
      if (cancelled || !runningRef.current || index >= RUN_COUNT) return;
      const fallback = variantsRef.current[index];
      if (!fallback) return;
      const tries: Array<{ variant: RunVariant; snapshot: FieldSnapshot; features: MorphFeatures; identity: boolean; signature: number[]; score: number }> = [];
      const compressed = fallback.translation.archetypeId === "compressed-sequential";
      const hall = fallback.translation.archetypeId === "continuous-hall";
      const ground = fallback.translation.archetypeId === "topographic-ground-field";
      const gallery = fallback.translation.archetypeId === "linear-gallery";
      const attempts = compressed || ground || gallery ? 5 : fallback.translation.archetypeId === "vertical-void" || hall ? 6 : 1;
      let chosen: (typeof tries)[number] | null = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const variant = source && sourceSlime ? realizeRun(source, sourceSlime, fallback.seed, attempt, index) : fallback;
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
              ? topographicSignature(marks, { slime: variant.slime, agents: variant.agents })
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
        if (compressed || ground) continue;
        if (gallery) {
          if (identity && isNovelGallery(signature, previousSequences)) {
            chosen = tries[tries.length - 1];
            break;
          }
          continue;
        }
        if (!identity) continue;
        if (hall ? !isNovelHall(signature, previousSequences) : !isNovelMorphology(features, previous)) continue;
        chosen = tries[tries.length - 1];
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
          chosen = gallery
            ? pool[pickMostNovelGallery(pool.map((item) => item.signature), previousSequences)] ?? pool[0]
            : pool.reduce((best, item) => (item.score > best.score ? item : best));
        } else {
          const valid = tries.filter((item) => item.identity);
          const pool = valid.length ? valid : tries;
          chosen = pool[pickMostNovel(pool.map((item) => item.features), previous)] ?? tries[tries.length - 1];
        }
      }
      previous.push(chosen.features);
      if (chosen.signature.length) previousSequences.push(chosen.signature);
      chosenRef.current[index] = chosen.variant;
      variantsRef.current[index] = chosen.variant;
      snapshotsRef.current[index] = chosen.snapshot;
      const canvas = canvasRefs.current[index];
      if (canvas) paintRunCell(canvas, chosen.snapshot, chosen.variant.translation.recipe.attractors, chosen.variant.translation.archetypeId);
      const snapshot = chosen.snapshot;
      const id = runningIdRef.current ?? pickedIdRef.current;
      const cell = index;
      index += 1;
      setCompleted(index);
      void (async () => {
        await saveRunSnapshot(cell, snapshot);
        if (id) await saveArchetypeField(id, cell, snapshot);
        if (cancelled || !runningRef.current) return;
        if (index >= RUN_COUNT) {
          runningRef.current = false;
          setRunning(false);
          return;
        }
        frameRef.current = requestAnimationFrame(frame);
      })();
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
        const variant = variantsRef.current[index] ?? variants[index];
        if (snapshot && canvas) paintRunCell(canvas, snapshot, variant?.translation.recipe.attractors, variant?.translation.archetypeId);
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
    const variant = variantsRef.current[selected] ?? variants[selected];
    const paint = () => paintRunCell(canvas, snapshot, variant?.translation.recipe.attractors, variant?.translation.archetypeId, true);
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    const frame = requestAnimationFrame(paint);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [inspecting, selected, completed, variants]);

  const selectedSnapshot = selected == null ? null : snapshotsRef.current[selected];
  const selectedVariant = selected == null ? null : variantsRef.current[selected] ?? variants[selected];
  const pickedName = TYPOLOGIES.flatMap((typology) => typology.archetypes).find((item) => item.id === (catalogOpen ? pickedId : runningId ?? pickedId))?.name;
  const pageSize = catalogFit.columns * catalogFit.rows;
  const pageCount = Math.max(1, Math.ceil(catalog.length / pageSize));
  const page = Math.min(catalogPage, pageCount - 1);
  const pageStart = page * pageSize;

  return (
    <main className={`flex h-full flex-col bg-black text-[var(--text)]${wall ? " runs-wall" : ""}`}>
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
                ? `${pickedName} · ${RUN_COUNT} growth variants · ${DISPLAY_ITERATIONS} iterations`
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
              disabled={!pickedId}
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
              disabled={completed < 1 && !snapshotsRef.current.some(Boolean)}
              className={`runs-control border px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase disabled:opacity-30 ${
                saveFlash
                  ? "border-[var(--orange)] bg-[rgba(199,126,95,0.16)] text-[var(--orange-hot)]"
                  : "border-[rgba(242,242,238,0.18)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {saveFlash ? "Saved" : "Save to catalog"}
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
          </header>
          <div ref={catalogBodyRef} className="runs-catalog-body">
          {catalog.length ? (
            <div
              className="runs-catalog-grid"
              style={{
                gridTemplateColumns: `repeat(${catalogFit.columns}, ${catalogFit.size}px)`,
                gap: wall ? 12 : 8,
              }}
            >
              {catalog.slice(pageStart, pageStart + pageSize).map((entry, offset) => (
                <figure key={entry.id} className="flex flex-col border border-[rgba(242,242,238,0.16)] bg-black">
                  <button
                    type="button"
                    onClick={() => setCatalogInspected(pageStart + offset)}
                    className="block w-full text-left"
                    aria-label={`Open saved run ${String(entry.run).padStart(2, "0")} at full size`}
                  >
                    <img src={entry.image} alt={`Saved run ${String(entry.run).padStart(2, "0")}`} className="block aspect-square w-full" />
                  </button>
                  <figcaption className="flex items-center justify-between gap-2 px-1.5 py-1 text-[0.55rem] tracking-[0.08em] uppercase text-[var(--muted)]">
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
                </figure>
              ))}
            </div>
          ) : (
            <p className="flex flex-1 items-center justify-center text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
              {catalogCounts[catalogId ?? ""] || snapshotsRef.current.some(Boolean)
                ? "Building catalog from saved runs"
                : "No saved runs for this archetype yet"}
            </p>
          )}
          </div>
        </section>
      ) : null}
      <div
        className={`grid min-h-0 flex-1 gap-px bg-[rgba(242,242,238,0.12)]${catalogOpen ? " hidden" : ""}`}
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
              className="pointer-events-none block h-full w-full"
            />
            <span className="runs-index pointer-events-none absolute left-1 top-0.5 text-[0.55rem] tracking-[0.08em] text-[rgba(242,242,238,0.55)]">
              {String(index + 1).padStart(2, "0")}
            </span>
          </button>
        ))}
      </div>
      </div>
      {catalogInspected != null && catalog[catalogInspected] ? (
        <CatalogDetail
          entry={catalog[catalogInspected]}
          snapshot={
            (variantsRef.current[catalog[catalogInspected].run - 1] ?? variants[catalog[catalogInspected].run - 1])?.seed === catalog[catalogInspected].seed
              ? snapshotsRef.current[catalog[catalogInspected].run - 1]
              : null
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
      {inspecting && selected != null && translation && selectedVariant ? (
        <RunDetail
          index={selected}
          seed={selectedVariant.seed}
          agents={selectedVariant.agents}
          snapshot={selectedSnapshot}
          translation={selectedVariant.translation}
          slime={selectedVariant.slime}
          canvasRef={detailRef}
          saved={saveFlash}
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
                disabled={!snapshot}
                className="border border-[var(--orange)] bg-[rgba(199,126,95,0.16)] px-2 py-1 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--orange-hot)] disabled:opacity-30"
              >
                {saved ? "Saved" : "Save to catalog"}
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
  const rebuilt = rebuildSavedDetail(entry);
  const { slime, translation } = rebuilt;
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    if (!snapshot || !canvas || !box) return;
    const paint = () => paintRunCell(canvas, snapshot, translation.recipe.attractors, translation.archetypeId, true);
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    const frame = requestAnimationFrame(paint);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [snapshot, translation.archetypeId, translation.recipe.attractors]);
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
        <div className="relative min-h-0 min-w-0 bg-black">
          {snapshot ? (
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          ) : (
            <img src={entry.image} alt={`Saved run ${String(entry.run).padStart(2, "0")}`} className="absolute inset-0 h-full w-full object-contain" />
          )}
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
