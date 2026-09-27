"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  captureSnapshot,
  createSimulation,
  stepMany,
} from "@/lib/skill1/engine";
import { DISPLAY_ITERATIONS, MAX_AGENT_COUNT, MIN_AGENT_COUNT, TRAIL_SCALE } from "@/lib/skill1/maps";
import { attractorsAsKind, runAttractorsFor } from "@/lib/skill1/run-variants";
import { densityFromTranslation, slimeControlsFromTranslation, varySlimeControls } from "@/lib/skill1/slime-controls";
import { agentCountFromDensity } from "@/components/skill1-archetype-info";
import { configForArchetype } from "@/lib/skill1/archetypes";
import { translateArchetype } from "@/lib/skill1/translate";
import type { SlimeControls } from "@/lib/skill1/slime-controls";
import type { AttractorKind, BiologicalBehavior, BiologicalParams, BiologicalTranslation, FieldAttractor, FieldSnapshot, SpatialRecipe, TopologyKind } from "@/lib/skill1/types";
import { mulberry32 } from "@/lib/physarum";
import { drawPlanField } from "@/components/skill1-viz";
import { TYPOLOGIES } from "@/lib/catalog";
import { listCatalogCounts, putCatalogEntries, readCatalog, writeCatalog } from "@/lib/skill1/run-catalog";
import { listArchetypeFieldCounts, loadArchetypeFields, saveArchetypeField } from "@/lib/persist/run-fields";
import { clearAllDoneFlag, clearRunFields, loadRunsSession, readAllDoneFlag, saveCatalogIndex, saveRunSnapshot, saveRunsMeta } from "@/lib/persist/session";

const COLUMNS = 20;
const ROWS = 4;
const RUN_COUNT = COLUMNS * ROWS;
const ALL_ARCHETYPE_IDS = TYPOLOGIES.flatMap((typology) => typology.archetypes.map((item) => item.id));
/** Run grid uses a lighter trail so 80 cells can finish. The board still uses TRAIL_SCALE. */
const RUN_TRAIL_SCALE = 8;
/** 8× the 160-cell trail. Sharp enough for catalog PNGs without the 2048 dumps that failed to save. */
const CATALOG_IMAGE_SIZE = 1280;

function seedFor(id: string, run: number) {
  return (0x51c11 ^ (run * 9973) ^ id.length * 131) >>> 0;
}

/** One attractor type per grid row: Point, Circle, Line, Curvy line. */
const ROW_KINDS: AttractorKind[] = ["point", "ring", "line", "curve"];

function rebuildSavedDetail(entry: SavedRun) {
  const base = translateArchetype(entry.archetypeId);
  const runTranslation = translationForRun(base, entry.seed, Math.max(0, entry.run - 1));
  const marks = runTranslation.recipe.attractors ?? [];
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
}

function translationForRun(base: BiologicalTranslation, seed: number, index: number): BiologicalTranslation {
  const kind = ROW_KINDS[Math.floor(index / COLUMNS) % ROW_KINDS.length];
  const built = runAttractorsFor(base.archetypeId, seed, base.recipe.attractors ?? [], kind);
  const attractors =
    base.archetypeId === "stepped-amphitheater" ? built : attractorsAsKind(built, kind, seed, base.archetypeId);
  const first = attractors[0];
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

function paintSnapshot(canvas: HTMLCanvasElement, snapshot: FieldSnapshot, fine = false, attractors?: FieldAttractor[]) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const dpr = Math.max(window.devicePixelRatio || 1, width >= 200 ? 2 : 1);
  if (width < 8 || height < 8) return;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  drawPlanField(ctx, snapshot, width, height, { showHud: false, fine, density: 5, attractors, showAttractors: false });
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

function snapshotImage(snapshot: FieldSnapshot, size = CATALOG_IMAGE_SIZE, attractors?: FieldAttractor[]) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  drawPlanField(ctx, snapshot, size, size, { showHud: false, fine: true, density: 5, attractors, showAttractors: false });
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

function kindLabel(index: number) {
  const kind = ROW_KINDS[Math.floor(index / COLUMNS) % ROW_KINDS.length];
  return kind === "ring" ? "circle" : kind === "curve" ? "curvy line" : kind;
}

function entryImage(index: number, snapshot: FieldSnapshot | null, canvas: HTMLCanvasElement | null, size = CATALOG_IMAGE_SIZE, attractors?: FieldAttractor[]) {
  return (snapshot ? snapshotImage(snapshot, size, attractors) : "") || canvasImage(canvas);
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

export function RunGrid() {
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
  const [catalogOpen, setCatalogOpen] = useState(false);
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
  const variantsRef = useRef<
    Array<{
      seed: number;
      agents: number;
      slime: SlimeControls;
      translation: BiologicalTranslation;
    }>
  >([]);
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
    () =>
      slime && translation
        ? seeds.map((seed, index) => {
            const runTranslation = translationForRun(translation, seed, index);
            const rng = mulberry32(seed ^ 0x6d2b79f5);
            const marks = runTranslation.recipe.attractors ?? [];
            const agents = Math.round(
              Math.min(
                500,
                Math.max(MIN_AGENT_COUNT, agentCountFromDensity(densityFromTranslation(translation)) + (rng() - 0.5) * 280),
              ),
            );
            return {
              seed,
              agents,
              slime: {
                ...varySlimeControls(slime, seed, translation.archetypeId),
                foodPoints: marks.map((mark) => ({ x: mark.x, y: mark.y })),
              },
              translation: runTranslation,
            };
          })
        : [],
    [seeds, slime, translation],
  );

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
    const image = snapshotImage(snapshot, 768, marks);
    if (!image) return null;
    const seed = variant?.seed ?? seedFor(id, index);
    return {
      id: `${id}-${seed}-${index}-${Date.now()}`,
      archetypeId: id,
      archetypeName: variant?.translation.archetypeName,
      run: index + 1,
      seed,
      kind: kindLabel(index),
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

  const catalogFromFields = async (id: string) => {
    const kept = await loadArchetypeFields(id, RUN_COUNT);
    const entries: SavedRun[] = [];
    for (let index = 0; index < RUN_COUNT; index += 1) {
      const snapshot = kept[index] ?? (id === (runningIdRef.current ?? pickedIdRef.current) ? snapshotsRef.current[index] : null);
      if (!snapshot) continue;
      const entry = entryFromSnapshot(id, index, snapshot);
      if (entry) entries.push(entry);
    }
    if (kept.some(Boolean) && id === (runningIdRef.current ?? pickedIdRef.current)) snapshotsRef.current = kept;
    return entries;
  };

  useEffect(() => {
    if (!catalogOpen || !catalogId) return;
    let live = true;
    void (async () => {
      const cached = catalogCacheRef.current[catalogId] ?? [];
      if (cached.length) setCatalogEntries(cached);
      const stored = await readCatalog<SavedRun>(catalogId);
      const next = stored.length ? stored : await catalogFromFields(catalogId);
      if (!live) return;
      catalogCacheRef.current[catalogId] = next;
      setCatalogEntries(next);
      refreshCatalogCounts();
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
    const image = entryImage(index, snapshot, canvasRefs.current[index], size, marks);
    if (!image) return null;
    const seed = variant?.seed ?? seedFor(id, index);
    return {
      id: `${id}-${seed}-${index}-${savedAt}`,
      archetypeId: id,
      archetypeName: variant?.translation.archetypeName,
      run: index + 1,
      seed,
      kind: kindLabel(index),
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
    if (await putCatalogEntries(id, incoming)) return true;
    const compact = incoming.map((item) => {
      const index = item.run - 1;
      const image = entryImage(index, snapshotsRef.current[index], canvasRefs.current[index], 960, variantsRef.current[index]?.translation.recipe.attractors);
      return image ? { ...item, image } : item;
    });
    return putCatalogEntries(id, compact);
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
    setPickedId(id);
    const cached = catalogCacheRef.current[id];
    if (cached?.length) setCatalogEntries(cached);
    else setCatalogEntries([]);
    void (async () => {
      const stored = await readCatalog<SavedRun>(id);
      const next = stored.length ? stored : await catalogFromFields(id);
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
    document.title = "20 × 4 runs · catalog complete";
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
      ? "20 × 4 runs · catalog complete"
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
        if (snapshot && canvas) paintSnapshot(canvas, snapshot, false, variantsRef.current[cell]?.translation.recipe.attractors);
      });
    }
    const startRun = (run: number) => {
      const variant = variantsRef.current[run];
      const next = createSimulation(variant.translation, variant.seed, variant.agents, RUN_TRAIL_SCALE);
      next.maxIterations = DISPLAY_ITERATIONS;
      return {
        sim: next,
        rng: mulberry32(variant.seed ^ 0x9e3779b9),
        slime: { ...variant.slime, diffusion: Math.min(variant.slime.diffusion, 0.04) },
        translation: variant.translation,
      };
    };

    const frame = () => {
      if (cancelled || !runningRef.current || index >= RUN_COUNT) return;
      const current = startRun(index);
      const left = DISPLAY_ITERATIONS - current.sim.iteration;
      stepMany(current.sim, current.translation, current.rng, Math.max(1, left), current.slime.decay, current.slime, false);
      const snapshot = captureSnapshot(current.sim, true);
      snapshotsRef.current[index] = snapshot;
      const canvas = canvasRefs.current[index];
      if (canvas) paintSnapshot(canvas, snapshot, false, current.translation.recipe.attractors);
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
        if (snapshot && canvas) paintSnapshot(canvas, snapshot, false, variants[index]?.translation.recipe.attractors);
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
    const paint = () => paintSnapshot(canvas, snapshot, true, variants[selected]?.translation.recipe.attractors);
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

  return (
    <main className={`flex h-dvh flex-col bg-black text-[var(--text)]${wall ? " runs-wall" : ""}`}>
      <header className="runs-header border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="display text-[0.95rem] text-white">20 × 4 runs</p>
          <div className="flex items-center gap-2">
            <p className="text-[0.58rem] tracking-[0.14em] uppercase text-[var(--muted)]">
              {completed} / {RUN_COUNT}
            </p>
            <a
              href={wall ? "/?wall=1" : "/"}
              className="border border-[rgba(242,242,238,0.18)] px-3 py-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-[var(--muted)] hover:text-[var(--text)]"
            >
              Board
            </a>
          </div>
        </div>
        <div className="mt-0.5 flex items-center">
          <p className="eyebrow shrink-0">
            {pickedName
              ? `${pickedName} · ${RUN_COUNT} growth variants · ${DISPLAY_ITERATIONS} iterations`
              : "Select an archetype"}
          </p>
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
              onClick={() => {
                setCatalogOpen((current) => !current);
                setCatalogInspected(null);
              }}
              disabled={!catalogId}
              aria-pressed={catalogOpen}
              className={`runs-control border px-2 py-1 text-[0.58rem] tracking-[0.14em] uppercase disabled:opacity-30 ${
                catalogOpen
                  ? "border-[var(--cyan)] bg-[linear-gradient(90deg,rgba(15,115,119,0.14),rgba(199,126,95,0.14))] text-white"
                  : "border-[rgba(242,242,238,0.18)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              Catalog
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
              {saveFlash ? "Saved" : "Save"}
            </button>
          </div>
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
            <p className="text-[0.58rem] tracking-[0.14em] uppercase text-[var(--muted)]">
              {catalog.length} saved{allDone ? " · all 15 complete" : ""}
            </p>
          </header>
          {catalog.length ? (
            <div className="runs-catalog-grid grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 overflow-auto">
              {catalog.map((entry, index) => (
                <figure key={entry.id} className="flex flex-col border border-[rgba(242,242,238,0.16)] bg-black">
                  <button
                    type="button"
                    onClick={() => setCatalogInspected(index)}
                    className="block w-full text-left"
                    aria-label={`Open saved run ${String(entry.run).padStart(2, "0")} at full size`}
                  >
                    <img src={entry.image} alt={`Saved run ${String(entry.run).padStart(2, "0")}`} className="block aspect-square w-full" />
                  </button>
                  <figcaption className="flex items-center justify-between gap-2 px-1.5 py-1 text-[0.55rem] tracking-[0.08em] uppercase text-[var(--muted)]">
                    <span>
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
            variants[catalog[catalogInspected].run - 1]?.seed === catalog[catalogInspected].seed
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
                {saved ? "Saved" : "Save"}
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
    const paint = () => paintSnapshot(canvas, snapshot, true, translation.recipe.attractors);
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    const frame = requestAnimationFrame(paint);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [snapshot, translation.recipe.attractors]);
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
