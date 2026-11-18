"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClusterCatalog } from "@/lib/skill6/catalog";
import { displaySizeLabel, displaySizeOfCount, DISPLAY_SIZE_BANDS, type ClusterEngine, type ClusterMorphology, type ClusterRecord, type ClusterSize, type Vec3 } from "@/lib/skill6/contract";
import { narrowLargeGuest } from "@/lib/skill6/engines/morphology";
import type { LabRunRow } from "@/lib/skill6/experiment-catalog";
import { ClusterView, type ViewArchetype, type ViewExtra } from "@/components/clustering/cluster-view";
import { CardView, assemblyFor, refinedFor, seatedTilesOf } from "@/components/clustering/card-view";
import base from "@/components/clustering/clustering-workspace.module.css";
import styles from "@/components/clustering/engine-lab.module.css";

/** Stored four-engine collection. Opening it reads files only; nothing is generated. */
export const ENGINE_COLLECTION = "initial-clustering-lab";
export const COVERAGE_COLLECTION = "initial-clustering-coverage";
export const EXPANSION_COLLECTION = "clustering-expansion-v1";
export const FIVE_TILE_COLLECTION = "clustering-five-tile-v1";
/** Current engine set: exact 2–7 tiles. The directory name is the batch that wrote it. */
export const CLUSTER_COLLECTION = "clustering-overnight-v1";
/** Increased-budget Graph alternatives. The overnight chain stays the default. */
export const GRAPH_BUDGET_COLLECTION = "clustering-graph-budget-v1";
/** Seven-tile Rule experiment. The overnight collection stays the default. */
export const RULE_LARGE_COLLECTION = "clustering-rule-large-v1";

export function isEngineCollection(id: string | null): boolean {
  return id === ENGINE_COLLECTION || id === COVERAGE_COLLECTION || id === EXPANSION_COLLECTION || id === FIVE_TILE_COLLECTION || id === CLUSTER_COLLECTION || id === GRAPH_BUDGET_COLLECTION || id === RULE_LARGE_COLLECTION;
}

function liveGeneration(collection: string) {
  return collection === CLUSTER_COLLECTION || collection === EXPANSION_COLLECTION || collection === FIVE_TILE_COLLECTION;
}

function openingSize(collection: string): ClusterSize | "all" {
  if (collection === CLUSTER_COLLECTION) return "all";
  if (collection === GRAPH_BUDGET_COLLECTION || collection === RULE_LARGE_COLLECTION) return "large";
  return liveGeneration(collection) ? "medium" : "small";
}

type LabCatalog = ClusterCatalog & { note?: string; provisional?: string[]; rows?: LabRunRow[] };
type Layer = "tiles" | "patches" | "union" | "refined";
type StatusFilter = "all" | "validated" | "partial" | "failed";

const ENGINES: { id: ClusterEngine; key: LabRunRow["engine"]; label: string; method: string }[] = [
  { id: "rule-based", key: "rule", label: "Full Build", method: "Coverage solver, scored selection" },
  { id: "graph-based", key: "graph", label: "Graph Based", method: "Topology first, then realized" },
  { id: "wave-function-collapse", key: "wfc", label: "WFC", method: "Domain propagation, backtracking" },
];

const MORPHOLOGIES: ClusterMorphology[] = ["compact", "branching", "vertical", "integrated"];
const ACTIVE_MORPHOLOGIES: ClusterMorphology[] = ["compact", "branching"];
const ACTIVE_ENGINES: ClusterEngine[] = ["rule-based", "graph-based", "wave-function-collapse"];

const SIZES: { id: ClusterSize; band: string; min: number; max: number }[] = (["small", "medium", "large"] as const).map((id) => ({
  id,
  band: displaySizeLabel(id),
  min: DISPLAY_SIZE_BANDS[id].min,
  max: DISPLAY_SIZE_BANDS[id].max ?? Infinity,
}));

const LAYERS: { id: Layer; label: string; shown: string[]; hideTiles: boolean }[] = [
  { id: "tiles", label: "Fit tiles", shown: [], hideTiles: false },
  { id: "patches", label: "Patches", shown: ["patch"], hideTiles: false },
  { id: "union", label: "Raw union", shown: ["union"], hideTiles: true },
  { id: "refined", label: "Refined", shown: ["refined"], hideTiles: true },
];

type Run = {
  record: ClusterRecord;
  row: LabRunRow | null;
  engine: ClusterEngine;
  morphology: ClusterMorphology;
  target: number;
  achieved: number;
  size: ClusterSize;
  geometry: "passed" | "failed" | "missing";
  reached: boolean;
};

function placedSize(count: number): ClusterSize {
  return displaySizeOfCount(count) ?? "small";
}

function isActiveRun(engine: ClusterEngine, morphology: ClusterMorphology) {
  return ACTIVE_ENGINES.includes(engine) && ACTIVE_MORPHOLOGIES.includes(morphology);
}

function runsOf(catalog: LabCatalog | null): Run[] {
  if (!catalog) return [];
  const rows = new Map((catalog.rows ?? []).map((row) => [row.id, row]));
  return catalog.clusters.flatMap((record): Run[] => {
    const engine = record.search?.engine;
    const morphology = record.search?.organization;
    if (!engine || !morphology) return [];
    const row = rows.get(record.id) ?? null;
    const target = row?.targetTiles ?? (Number(record.id.split("-").pop()) || record.tiles.length);
    const passed = Boolean(row?.partial || row?.validated);
    return [{
      record,
      row,
      engine,
      morphology,
      target,
      achieved: record.tiles.length,
      size: placedSize(record.tiles.length),
      geometry: passed ? "passed" : record.assembly ? "failed" : "missing",
      reached: record.tiles.length >= target,
    }];
  });
}

function engineLabel(id: ClusterEngine) {
  return ENGINES.find((item) => item.id === id)?.label ?? id;
}

function Meter({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return <span className={styles.meter} aria-hidden="true"><i style={{ width: `${value * 100}%` }} /></span>;
}

function format(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function clearanceOf(record: ClusterRecord) {
  const gaps = (record.assembly?.joints ?? []).map((joint) => joint.contact.residualGap).filter((gap): gap is number => gap != null && Number.isFinite(gap));
  return gaps.length > 0 ? Math.min(...gaps) : null;
}

function shapeLine(shape: NonNullable<LabRunRow["shape"]>) {
  return [shape.compact, shape.branching, shape.vertical, shape.quality].map((value) => value.toFixed(2)).join(" · ");
}

function seconds(ms: number | null | undefined) {
  return ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`;
}

function statusOf(run: Run): Exclude<StatusFilter, "all"> {
  if (run.geometry !== "passed") return "failed";
  return run.reached ? "validated" : "partial";
}

/** Two independent readings: did generation reach the request, and did the refined geometry pass. */
function StatusLine({ run }: { run: Run }) {
  return (
    <span className={styles.status}>
      <span data-tone={run.reached ? "ok" : "short"}>{run.achieved} of {run.target} tiles{run.reached ? "" : " · incomplete"}</span>
      <span data-tone={run.geometry === "passed" ? "ok" : "short"}>{run.geometry === "passed" ? "Refined geometry passed" : run.geometry === "failed" ? "Refined geometry failed" : "Not assembled"}</span>
    </span>
  );
}

function useExtras(id: string | null, collection: string, layer: Layer) {
  const [extras, setExtras] = useState<{ id: string; layer: Layer; list: ViewExtra[] } | null>(null);
  useEffect(() => {
    if (!id || layer === "tiles") return;
    let live = true;
    const load = layer === "refined" ? refinedFor(id, collection) : assemblyFor(id, collection);
    void load.then((list) => { if (live) setExtras({ id, layer, list }); }).catch(() => undefined);
    return () => { live = false; };
  }, [id, collection, layer]);
  if (layer === "tiles") return undefined;
  return extras && extras.id === id && extras.layer === layer ? extras.list : undefined;
}

function liftedContacts(cluster: ClusterRecord) {
  const lift = cluster.assembly?.ground.lift ?? 0;
  if (!lift) return cluster.contacts;
  const up = (point: Vec3): Vec3 => [point[0], point[1], point[2] + lift];
  return cluster.contacts.map((contact) => ({
    ...contact,
    samples: contact.samples.map((sample) => ({ ...sample, host: up(sample.host), guest: up(sample.guest) })),
    rejected: contact.rejected.map((item) => ({ ...item, point: up(item.point) })),
  }));
}

function fitAll(prefix: string) {
  document.querySelectorAll<HTMLCanvasElement>(`[data-cluster-view^='${prefix}']`).forEach((canvas) => canvas.dispatchEvent(new Event("lm-cluster-fit")));
}

/** Initial Clustering Lab: one workspace over the stored engine runs. */
export function EngineLab({ frame, collection, onCollection }: { frame: boolean; collection: string; onCollection: (collection: string | null) => void }) {
  const [catalog, setCatalog] = useState<LabCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<ClusterEngine | "all">("all");
  const [size, setSize] = useState<ClusterSize | "all">(openingSize(collection));
  const [historical, setHistorical] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogMorphology, setCatalogMorphology] = useState<ClusterMorphology | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [comparing, setComparing] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null);
    void fetch(`/api/clustering/catalog?collection=${collection}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The engine collection did not load.");
        return response.json() as Promise<LabCatalog>;
      })
      .then(setCatalog)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "The engine collection did not load.");
      });
    return () => controller.abort();
  }, [collection]);

  useEffect(() => {
    setHistorical(true);
    setSize(openingSize(collection));
    setEngine(collection === GRAPH_BUDGET_COLLECTION ? "graph-based" : "all");
    setSelected(null);
    setComparing(false);
    setCompareIds([]);
    setCatalogOpen(false);
  }, [collection]);

  const runs = useMemo(() => runsOf(catalog), [catalog]);
  const listed = useMemo(
    () => runs.filter((run) => run.engine !== "evolutionary-search" && (historical || isActiveRun(run.engine, run.morphology))),
    [runs, historical],
  );
  const archetypes: ViewArchetype[] = catalog?.archetypes ?? [];
  const solids = useMemo(() => new Map((catalog?.archetypes ?? []).map((item) => [item.archetypeId, item.solidVolume])), [catalog]);
  const filtered = useMemo(
    () => listed.filter((run) => (engine === "all" || run.engine === engine) && (size === "all" || run.size === size)),
    [listed, engine, size],
  );
  const sizeCount = (id: ClusterSize) => filtered.length === listed.length
    ? listed.filter((run) => run.size === id).length
    : listed.filter((run) => (engine === "all" || run.engine === engine) && run.size === id).length;
  const toggleCompare = (id: string) => {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  };

  useEffect(() => {
    if (compareIds.length < 2) setComparing(false);
  }, [compareIds]);

  return (
    <div className={frame ? styles.lab : styles.labBare} data-clustering="initial" data-lab-view="workspace">
      <aside className={`${base.list} ${styles.controls}`} aria-label="Cluster selection">
        <h1 className={styles.panelHeading}>Selection</h1>
        <section className={styles.group} aria-label="Generation engine">
          <p className={styles.sectionLabel}>Generation engine</p>
          <div className={styles.picks}>
            <button type="button" data-on={engine === "all" ? "true" : "false"} onClick={() => setEngine("all")}>All engines</button>
            {ENGINES.map((item) => (
              <button key={item.id} type="button" data-on={engine === item.id ? "true" : "false"} onClick={() => setEngine(item.id)}>{item.label}</button>
            ))}
          </div>
        </section>
        <section className={styles.group} aria-label="Cluster size">
          <p className={styles.sectionLabel}>Cluster size</p>
          <div className={styles.picks}>
            <button type="button" data-on={size === "all" ? "true" : "false"} onClick={() => setSize("all")}>All</button>
            {SIZES.map((item) => (
              <button key={item.id} type="button" data-on={size === item.id ? "true" : "false"} data-empty={sizeCount(item.id) === 0 ? "true" : "false"} onClick={() => setSize(item.id)}>
                {item.id}<span>{item.band}</span>
              </button>
            ))}
          </div>
        </section>
        <section className={`${styles.group} ${styles.compareGroup}`} aria-label="Compare">
          <p className={styles.sectionLabel}>Compare</p>
          <ul className={styles.checkList}>
            {filtered.map((item) => (
              <li key={item.record.id}>
                <button type="button" aria-pressed={compareIds.includes(item.record.id)} onClick={() => toggleCompare(item.record.id)}>
                  <i />
                  <span>{engineLabel(item.engine)} · {item.morphology} · {item.achieved}/{item.target}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={styles.compareOpen} disabled={compareIds.length < 2} onClick={() => setComparing(true)}>Compare<span>{compareIds.length}</span></button>
        </section>
      </aside>
      <Board
        runs={filtered}
        listed={listed}
        archetypes={archetypes}
        collection={collection}
        solids={solids}
        selected={selected}
        onSelect={setSelected}
        loading={!catalog && !error}
        comparing={comparing}
        compareIds={compareIds}
        onToggleCompare={toggleCompare}
        onCloseCompare={() => setComparing(false)}
        onCatalog={() => setCatalogOpen(true)}
      />
      {catalogOpen ? (
        <div className={styles.catalog} role="dialog" aria-label="Stored cluster catalog">
          <div className={styles.catalogBar}>
            <button type="button" onClick={() => setCatalogOpen(false)}>Back to cluster</button>
            <SavedCollections
              collection={collection}
              note={error ?? catalog?.note ?? null}
              historical={historical}
              onHistorical={() => setHistorical((value) => !value)}
              onCollection={onCollection}
            />
          </div>
          <Results
            runs={listed}
            engines={ENGINES}
            morphologies={MORPHOLOGIES}
            archetypes={archetypes}
            collection={collection}
            engine={engine}
            morphology={catalogMorphology}
            size={size}
            status={statusFilter}
            onStatus={setStatusFilter}
            onOpen={(run) => { setSelected(run.record.id); setComparing(false); setCatalogOpen(false); }}
            onMatrix={(id, item, band) => { setEngine(id); setCatalogMorphology(item); setSize(band); }}
          />
        </div>
      ) : null}
    </div>
  );
}

function SavedCollections({ collection, note, historical, onHistorical, onCollection }: {
  collection: string;
  note: string | null;
  historical: boolean;
  onHistorical: () => void;
  onCollection: (collection: string | null) => void;
}) {
  return (
    <details className={styles.saved}>
      <summary>Saved collections</summary>
      {note ? <p className={base.note}>{note}</p> : null}
      <button type="button" className={styles.choice} data-on={historical ? "true" : "false"} aria-pressed={historical} onClick={onHistorical}><b>Earlier runs</b><span>{historical ? "Included" : "Hidden"}</span></button>
      <div className={styles.choices}>
        <button type="button" className={styles.choice} data-on={collection === CLUSTER_COLLECTION ? "true" : "false"} onClick={() => onCollection(CLUSTER_COLLECTION)}><b>Overnight</b></button>
        <button type="button" className={styles.choice} data-on={collection === EXPANSION_COLLECTION ? "true" : "false"} onClick={() => onCollection(EXPANSION_COLLECTION)}><b>Expansion</b></button>
        <button type="button" className={styles.choice} data-on={collection === FIVE_TILE_COLLECTION ? "true" : "false"} onClick={() => onCollection(FIVE_TILE_COLLECTION)}><b>Five-tile</b></button>
        <button type="button" className={styles.choice} data-on={collection === GRAPH_BUDGET_COLLECTION ? "true" : "false"} onClick={() => onCollection(GRAPH_BUDGET_COLLECTION)}><b>Graph 420</b></button>
        <button type="button" className={styles.choice} data-on={collection === RULE_LARGE_COLLECTION ? "true" : "false"} onClick={() => onCollection(RULE_LARGE_COLLECTION)}><b>Rule large</b></button>
        <button type="button" className={styles.choice} onClick={() => onCollection(null)}><b>Catalog</b></button>
        <button type="button" className={styles.choice} onClick={() => onCollection("small-ground-v1")}><b>Small ground</b></button>
        <button type="button" className={styles.choice} onClick={() => onCollection("small-ground-v2")}><b>Small ground v2</b></button>
        <button type="button" className={styles.choice} onClick={() => onCollection("organization-v1")}><b>Organization</b></button>
        <button type="button" className={styles.choice} data-on={collection === COVERAGE_COLLECTION ? "true" : "false"} onClick={() => onCollection(COVERAGE_COLLECTION)}><b>Coverage</b></button>
        <button type="button" className={styles.choice} data-on={collection === ENGINE_COLLECTION ? "true" : "false"} onClick={() => onCollection(ENGINE_COLLECTION)}><b>Two-tile lab</b></button>
      </div>
    </details>
  );
}

function Board({ runs, listed, archetypes, collection, solids, selected, onSelect, loading, comparing, compareIds, onToggleCompare, onCloseCompare, onCatalog }: {
  runs: Run[];
  listed: Run[];
  archetypes: ViewArchetype[];
  collection: string;
  solids: ReadonlyMap<string, number>;
  selected: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  comparing: boolean;
  compareIds: string[];
  onToggleCompare: (id: string) => void;
  onCloseCompare: () => void;
  onCatalog: () => void;
}) {
  const run = runs.find((item) => item.record.id === selected) ?? runs[0] ?? null;
  const [browserOpen, setBrowserOpen] = useState(true);
  const browserRef = useRef<HTMLUListElement>(null);
  const [tileId, setTileId] = useState<string | null>(null);
  const [sync, setSync] = useState(true);
  const [sameScale, setSameScale] = useState(true);
  const [spans, setSpans] = useState<Record<string, number>>({});
  const refined = useExtras(run?.record.id ?? null, collection, "refined");
  const tiles = useMemo(() => (run ? seatedTilesOf(run.record) : []), [run]);
  const framedId = run?.record.id ?? null;

  useEffect(() => {
    if (!framedId || comparing) return;
    const early = window.setTimeout(() => fitAll("lab-stage"), 80);
    const late = window.setTimeout(() => fitAll("lab-stage"), 700);
    return () => { window.clearTimeout(early); window.clearTimeout(late); };
  }, [framedId, comparing]);

  const slots = useMemo(() => compareIds
    .map((id) => listed.find((item) => item.record.id === id))
    .filter((item): item is Run => Boolean(item))
    .map((item) => ({ key: item.record.id, label: `${engineLabel(item.engine)} · ${item.morphology}`, run: item })), [compareIds, listed]);
  const open = comparing && slots.length >= 2;
  const shared = sameScale ? Math.max(0, ...slots.map((slot) => (slot.run ? spans[slot.run.record.id] ?? 0 : 0))) : 0;
  const report = useCallback((id: string, span: number) => {
    setSpans((current) => (Math.abs((current[id] ?? 0) - span) < 1e-3 ? current : { ...current, [id]: span }));
  }, []);

  return (
    <>
      <section className={`${base.stage} ${styles.stageCol}`} aria-label="Cluster viewer">
          <div className={styles.viewport}>
            {run ? <div className={styles.viewerHead}><h2>{run.record.id}</h2></div> : null}
            {run ? (
              <ClusterView
                tiles={tiles}
                archetypes={archetypes}
                selectedId={tileId}
                interactive
                marker="lab-stage"
                onSelect={setTileId}
                extras={refined}
                shownExtras={refined ? ["refined"] : undefined}
                hideTiles={Boolean(refined)}
                floorZ={run.record.assembly ? 0 : undefined}
                presentation
              />
            ) : (
              <div className={styles.viewportEmpty}>
                {loading ? <p className={base.note}>Reading the stored runs.</p> : <p className={base.note}>No stored run matches this engine and size.</p>}
              </div>
            )}
            {open ? (
              <div className={styles.comparePop} role="dialog" aria-label="Compare clusters">
                <div className={styles.comparePopBar}>
                  <p>Compare</p>
                  <label className={styles.compareCheck}><input type="checkbox" checked={sync} onChange={() => setSync((value) => !value)} /><i />Sync</label>
                  <label className={styles.compareCheck}><input type="checkbox" checked={sameScale} onChange={() => setSameScale((value) => !value)} /><i />Same scale</label>
                  <button type="button" onClick={() => fitAll("lab-compare")}>Fit</button>
                  <button type="button" className={styles.stripIcon} onClick={onCloseCompare} aria-label="Close compare"><StripIcon name="close" /></button>
                </div>
                <div className={styles.columns} style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
                  {slots.map((slot) => (
                    <CompareColumn
                      key={slot.key}
                      engine={slot.run.engine}
                      title={slot.label}
                      collection={collection}
                      run={slot.run}
                      archetypes={archetypes}
                      sync={sync}
                      span={sameScale && shared > 0 ? shared : undefined}
                      onSpan={report}
                      onOpen={(item) => { onSelect(item.record.id); onCloseCompare(); }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        <div className={styles.strip} data-open={browserOpen ? "true" : "false"}>
          <div className={styles.stripBar}>
            <p>Cluster browser</p>
            <span>{runs.length} clusters</span>
            <div className={styles.stripTools}>
              <button type="button" className={styles.stripIcon} onClick={() => browserRef.current?.scrollBy({ left: -280, behavior: "smooth" })} aria-label="Previous clusters"><StripIcon name="prev" /></button>
              <button type="button" className={styles.stripIcon} onClick={() => browserRef.current?.scrollBy({ left: 280, behavior: "smooth" })} aria-label="Next clusters"><StripIcon name="next" /></button>
              <button type="button" className={styles.stripIcon} onClick={() => setBrowserOpen((value) => !value)} aria-label={browserOpen ? "Collapse cluster browser" : "Show cluster browser"}><StripIcon name={browserOpen ? "collapse" : "show"} /></button>
              <button type="button" className={styles.stripIcon} onClick={onCatalog} aria-label="Expand catalog"><StripIcon name="expand" /></button>
            </div>
          </div>
          {browserOpen ? (
            <ul className={styles.stripList} ref={browserRef}>
              {runs.map((item) => (
                <li key={item.record.id}>
                  <button
                    type="button"
                    className={styles.stripCheck}
                    aria-pressed={compareIds.includes(item.record.id)}
                    aria-label={compareIds.includes(item.record.id) ? "Remove from compare" : "Add to compare"}
                    onClick={() => onToggleCompare(item.record.id)}
                  ><i /></button>
                  <button
                    type="button"
                    className={styles.stripCard}
                    data-on={item.record.id === run?.record.id ? "true" : "false"}
                    data-compare={compareIds.includes(item.record.id) ? "true" : "false"}
                    onClick={() => onSelect(item.record.id)}
                  >
                    <span className={styles.stripThumb}><CardView cluster={item.record} archetypes={archetypes} collection={collection} /></span>
                    <b>{engineLabel(item.engine)}</b>
                    <i>{item.morphology} · {item.achieved}/{item.target}</i>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
      <div className={`${base.detail} ${styles.panel}`}>
        {run ? (
          <Reading run={run} collection={collection} archetypes={archetypes} solids={solids} tiles={tiles} tileId={tileId} onTile={setTileId} />
        ) : null}
      </div>
    </>
  );
}

function StripIcon({ name }: { name: "prev" | "next" | "collapse" | "show" | "expand" | "close" }) {
  const path = {
    prev: "M14 5 L8 12 L14 19",
    next: "M10 5 L16 12 L10 19",
    collapse: "M5 9 L12 16 L19 9",
    show: "M5 15 L12 8 L19 15",
    expand: "M9 4 H4 V9 M15 4 H20 V9 M20 15 V20 H15 M4 15 V20 H9",
    close: "M6 6 L18 18 M18 6 L6 18",
  }[name];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function Comparison({ runs }: { runs: { key: string; label: string; run: Run | null }[] }) {
  const cells = (read: (run: Run) => string) => runs.map((slot) => slot.run ? read(slot.run) : "No stored run");
  const rows: { label: string; values: string[] }[] = [
    { label: "Cluster", values: runs.map((slot) => slot.run?.record.id ?? "No stored run") },
    { label: "Engine", values: cells((run) => engineLabel(run.engine)) },
    { label: "Morphology", values: cells((run) => run.morphology) },
    { label: "Placed", values: cells((run) => `${run.achieved} of ${run.target}`) },
    { label: "Geometry", values: cells((run) => run.geometry === "passed" ? "Refined geometry passed" : run.geometry === "failed" ? "Refined geometry failed" : "Not assembled") },
    { label: "Volume", values: cells((run) => format(run.record.assembly?.refined.volume ?? run.record.metrics?.solidVolume, 0)) },
    { label: "Void", values: cells((run) => format(run.record.metrics?.clusterVoidFraction)) },
    { label: "Diversity", values: cells((run) => format(run.record.metrics?.geometricDiversity)) },
    { label: "Branching", values: cells((run) => run.row?.shape ? run.row.shape.branching.toFixed(2) : "—") },
    { label: "Compact", values: cells((run) => run.row?.shape ? run.row.shape.compact.toFixed(2) : "—") },
  ];
  return (
    <section className={styles.section} aria-label="Comparison">
      <p className={styles.sectionLabel}>Comparison</p>
      <table className={styles.delta}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.values.map((value, index) => <td key={`${row.label}-${runs[index]?.key ?? index}`}>{value}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Reading({ run, collection, archetypes, solids, tiles, tileId, onTile }: {
  run: Run;
  collection: string;
  archetypes: ViewArchetype[];
  solids: ReadonlyMap<string, number>;
  tiles: ReturnType<typeof seatedTilesOf>;
  tileId: string | null;
  onTile: (id: string) => void;
}) {
  const [layer, setLayer] = useState<Layer>("patches");
  const [showContacts, setShowContacts] = useState(false);
  const [readingFor, setReadingFor] = useState<string | null>(null);
  const readingOpen = readingFor === run.record.id;
  const loaded = useExtras(run.record.id, collection, "patches");
  const spec = LAYERS.find((item) => item.id === layer) ?? LAYERS[1];
  const extras = loaded?.map((extra) => extra.id === "patch" ? { ...extra, color: "#8d8d8d" } : extra);
  const record = run.record;
  const assembly = record.assembly ?? null;
  const metrics = record.metrics;
  const contacts = useMemo(() => liftedContacts(record), [record]);
  const nameOf = (instanceId: string) => record.tiles.find((tile) => tile.instanceId === instanceId)?.name ?? instanceId;
  const joints = assembly?.joints ?? [];
  const clusterSolid = metrics?.solidVolume ?? 0;
  const warnings = joints.filter((joint) => joint.primary && narrowLargeGuest(joint.contact.contactArea, solids.get(joint.guestArchetypeId) ?? 0, clusterSolid)).map((joint) => {
    const guest = solids.get(joint.guestArchetypeId) ?? 0;
    return `${nameOf(joint.guestInstanceId)} · area ${joint.contact.contactArea.toFixed(2)} · ${Math.round((guest / clusterSolid) * 100)}% of solid`;
  });
  return (
    <>
      <header className={styles.identity}>
        <p className={styles.kicker}>Selected cluster</p>
        <h2 className={styles.identityName}>{record.id}</h2>
        <p className={styles.metaLine}>
          <span><i>Engine</i> {engineLabel(run.engine)}</span>
          <span><i>Morphology</i> {run.morphology}</span>
          <span><i>Size</i> {run.size} ({run.achieved})</span>
        </p>
        <StatusLine run={run} />
      </header>
      <section className={styles.section} aria-label="Assembly">
        <p className={styles.slashLabel}><b>Assembly</b><span>Components & connections</span></p>
        <div className={styles.assemblyRow}>
          <div className={styles.assemblyView}>
            <ClusterView
              tiles={tiles}
              archetypes={archetypes}
              contacts={contacts}
              showContacts={showContacts}
              selectedId={tileId}
              interactive
              marker="lab-stage-parts"
              onSelect={onTile}
              extras={extras}
              shownExtras={extras ? spec.shown : undefined}
              hideTiles={Boolean(extras) && spec.hideTiles}
              floorZ={assembly ? 0 : undefined}
              presentation
              tones="interface"
            />
          </div>
          {spec.hideTiles ? null : (
            <ul className={styles.legend}>
              <li><i data-tone="lobby" />Lobby</li>
              <li><i data-tone="workspace" />Workspace</li>
              <li><i data-tone="gathering" />Gathering</li>
              {layer === "patches" ? <li><i data-tone="patch" />Patch</li> : null}
            </ul>
          )}
        </div>
        <div className={styles.process}>
          {LAYERS.map((item) => (
            <button key={item.id} type="button" data-on={layer === item.id ? "true" : "false"} disabled={!loaded && item.id !== "tiles"} onClick={() => setLayer(item.id)}>{item.label}</button>
          ))}
          <button type="button" data-on={showContacts ? "true" : "false"} onClick={() => setShowContacts((value) => !value)}>Contacts</button>
        </div>
      </section>
      <section className={styles.section} aria-label="Composition">
        <p className={styles.slashLabel}><b>Composition</b></p>
        <dl className={styles.facts}>
          <div><dt>Archetypes</dt><dd>{metrics?.uniqueArchetypes ?? "—"}</dd></div>
          <div><dt>Direct</dt><dd>{assembly ? assembly.counts["direct-contact"] : "—"}</dd></div>
          <div><dt>Patched</dt><dd>{assembly ? assembly.counts["patched-near-contact"] : record.contacts.length}</dd></div>
          <div><dt>Failed</dt><dd>{assembly ? assembly.counts["failed-patch"] : "—"}</dd></div>
        </dl>
        <p className={styles.identityMeta}>{record.tiles.map((tile) => tile.name).join(" · ")}</p>
      </section>
      <section className={styles.section} aria-label="Performance">
        <p className={styles.slashLabel}><b>Performance</b></p>
        <dl className={styles.stats}>
          <div><dt>Void</dt><dd>{format(metrics?.clusterVoidFraction)}<Meter value={metrics?.clusterVoidFraction} /></dd></div>
          <div><dt>Diversity</dt><dd>{format(metrics?.geometricDiversity)}<Meter value={metrics?.geometricDiversity} /></dd></div>
          <div><dt>Branching</dt><dd>{run.row?.shape ? run.row.shape.branching.toFixed(2) : "—"}<Meter value={run.row?.shape?.branching} /></dd></div>
          <div><dt>Compact</dt><dd>{run.row?.shape ? run.row.shape.compact.toFixed(2) : "—"}<Meter value={run.row?.shape?.compact} /></dd></div>
        </dl>
      </section>
      <button type="button" className={styles.readingOpen} onClick={() => setReadingFor(record.id)}>Detailed reading</button>
      {readingOpen ? (
        <div className={styles.detailPop} role="dialog" aria-label="Detailed reading">
          <header>
            <p>Detailed reading</p>
            <button type="button" onClick={() => setReadingFor(null)} aria-label="Close">×</button>
          </header>
          <ol className={styles.steps}>
            {(assembly?.growth ?? record.tiles.map((tile, index) => ({ step: index, instanceId: tile.instanceId, hostInstanceId: null, direction: null, placement: "" }))).map((step) => {
              const joint = assembly?.joints.find((item) => item.primary && item.guestInstanceId === step.instanceId);
              return (
                <li key={step.instanceId}>
                  <button type="button" data-on={tileId === step.instanceId ? "true" : "false"} onClick={() => onTile(step.instanceId)}>
                    <b>{step.step}</b>
                    <span>{nameOf(step.instanceId)}</span>
                    <i>{step.hostInstanceId ? `${step.direction ?? "—"} from ${nameOf(step.hostInstanceId)}${joint ? `, ${joint.classification}` : ""}` : "Ground seed"}</i>
                  </button>
                </li>
              );
            })}
          </ol>
          <section className={styles.section} aria-label="Geometry">
            <p className={styles.slashLabel}><b>Geometry</b></p>
            <dl className={styles.metricRow}>
              <div><dt>Volume</dt><dd>{format(assembly?.refined.volume ?? metrics?.solidVolume, 0)}</dd></div>
              <div><dt>Surface</dt><dd>{format(metrics?.surfaceExposure, 0)}</dd></div>
              <div><dt>Clearance</dt><dd>{format(clearanceOf(record))}</dd></div>
              <div><dt>Bounding</dt><dd>{format(metrics?.boundingVolume, 0)}</dd></div>
            </dl>
          </section>
          {record.reason ? <p className={base.note}>{record.reason}</p> : null}
          {run.row?.duplicateOf ? <p className={base.note}>Same geometry as {run.row.duplicateOf}.</p> : null}
          {warnings.length > 0 ? <p className={base.note}>Narrow joint, not a rejection. {warnings.join(" · ")}</p> : null}
          <dl className={styles.grid}>
            <div><dt>Algorithm</dt><dd>{record.algorithm}</dd></div>
            <div><dt>Stop</dt><dd>{record.search?.stop ?? "—"}</dd></div>
            <div><dt>Geometric tests</dt><dd>{record.search?.evaluations ?? "—"}</dd></div>
            <div><dt>Backtracks</dt><dd>{record.search?.backtracks ?? "—"}</dd></div>
            <div><dt>Search</dt><dd>{seconds(record.search?.milliseconds)}</dd></div>
            <div><dt>Search and assembly</dt><dd>{seconds(run.row?.milliseconds)}</dd></div>
            {run.row?.shape ? <div><dt>Shape</dt><dd>{shapeLine(run.row.shape)}</dd></div> : null}
          </dl>
          {record.search?.trace ? <p className={base.note}>{record.search.trace}</p> : null}
        </div>
      ) : null}
    </>
  );
}

function Untested({ size, engine }: { size: ClusterSize; engine?: ClusterEngine }) {
  const band = SIZES.find((item) => item.id === size)?.band ?? "";
  return (
    <div className={styles.empty}>
      <p className={base.kicker}>{size} · {band} tiles</p>
      <p className={base.title}>Untested</p>
      <p className={base.note}>{engine ? `${engineLabel(engine)} has no stored run at this size.` : "No engine has a stored run at this size."} Nothing is generated from this page.</p>
    </div>
  );
}


function Results({ runs, engines, morphologies, archetypes, collection, engine, morphology, size, status, onStatus, onOpen, onMatrix }: {
  runs: Run[];
  engines: typeof ENGINES;
  morphologies: ClusterMorphology[];
  archetypes: ViewArchetype[];
  collection: string;
  engine: ClusterEngine | "all";
  morphology: ClusterMorphology | "all";
  size: ClusterSize | "all";
  status: StatusFilter;
  onStatus: (value: StatusFilter) => void;
  onOpen: (run: Run) => void;
  onMatrix: (engine: ClusterEngine, morphology: ClusterMorphology | "all", size: ClusterSize) => void;
}) {
  const visible = useMemo(() => runs
    .filter((run) => engine === "all" || run.engine === engine)
    .filter((run) => morphology === "all" || run.morphology === morphology)
    .filter((run) => size === "all" || run.size === size)
    .filter((run) => status === "all" || statusOf(run) === status)
    .sort((left, right) => engines.findIndex((item) => item.id === left.engine) - engines.findIndex((item) => item.id === right.engine)
      || morphologies.indexOf(left.morphology) - morphologies.indexOf(right.morphology)
      || left.target - right.target), [runs, engines, morphologies, engine, morphology, size, status]);
  const counts = useMemo(() => ({
    all: runs.length,
    validated: runs.filter((run) => statusOf(run) === "validated").length,
    partial: runs.filter((run) => statusOf(run) === "partial").length,
    failed: runs.filter((run) => statusOf(run) === "failed").length,
  }), [runs]);
  const sizeHas = (id: ClusterSize) => runs.some((run) => run.size === id);

  return (
    <section className={styles.results} aria-label="Results">
      <div className={`${base.detail} ${styles.matrixFrame}`}>
        <div className={styles.matrixHead}>
          <p className={base.kicker}>Availability · placed of requested tiles · refined result</p>
          <div className={base.filters}>
            {(["all", "validated", "partial", "failed"] as const).map((item) => (
              <button key={item} type="button" data-on={status === item ? "true" : "false"} onClick={() => onStatus(item)}>
                {item === "validated" ? "target reached" : item === "partial" ? "refined, short" : item} {counts[item]}
              </button>
            ))}
          </div>
        </div>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th scope="col">Engine</th>
              {morphologies.map((item) => <th key={item} scope="col">Small · {item}</th>)}
              <th scope="col">Medium {displaySizeLabel("medium")}</th>
              <th scope="col">Large {displaySizeLabel("large")}</th>
            </tr>
          </thead>
          <tbody>
            {engines.map((item) => (
              <tr key={item.id} data-on={engine === item.id ? "true" : "false"}>
                <th scope="row">{item.label}</th>
                {morphologies.map((shape) => {
                  const cell = runs.filter((run) => run.engine === item.id && run.morphology === shape && run.size === "small").sort((left, right) => left.target - right.target);
                  return (
                    <td key={shape}>
                      {cell.length === 0 ? <span data-tone="none">untested</span> : (
                        <button type="button" onClick={() => onMatrix(item.id, shape, "small")}>
                          {cell.map((run) => (
                            <span key={run.record.id} data-tone={statusOf(run) === "validated" ? "ok" : statusOf(run) === "partial" ? "short" : "fail"}>{run.achieved}/{run.target}</span>
                          ))}
                        </button>
                      )}
                    </td>
                  );
                })}
                {(["medium", "large"] as const).map((band) => {
                  const cell = runs.filter((run) => run.engine === item.id && run.size === band).sort((left, right) => morphologies.indexOf(left.morphology) - morphologies.indexOf(right.morphology) || left.target - right.target);
                  return (
                    <td key={band}>
                      {cell.length === 0 ? <span data-tone="none">{sizeHas(band) ? "—" : "untested"}</span> : (
                        <button type="button" onClick={() => onMatrix(item.id, "all", band)}>
                          {cell.map((run) => (
                            <span key={run.record.id} title={run.morphology} data-tone={statusOf(run) === "validated" ? "ok" : statusOf(run) === "partial" ? "short" : "fail"}>{run.morphology[0]} {run.achieved}/{run.target}</span>
                          ))}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className={base.note}>Cyan: target reached and refined geometry passed. Copper: refined geometry passed, generation stopped short of the target. Size is the tiles placed. Medium and large cells carry the morphology initial.</p>
      </div>
      <div className={`${base.detail} ${styles.cardsFrame}`}>
        {size !== "all" && size !== "small" && visible.length === 0 ? <Untested size={size} /> : null}
        {visible.length === 0 && (size === "all" || size === "small") ? <p className={base.note}>No stored run matches these filters.</p> : null}
        <ul className={styles.cards}>
          {visible.map((run) => (
            <li key={run.record.id}>
              <button type="button" className={styles.card} onClick={() => onOpen(run)}>
                <span className={styles.thumb}><CardView cluster={run.record} archetypes={archetypes} collection={collection} /></span>
                <span className={styles.cardCopy}>
                  <b>{engineLabel(run.engine)}</b>
                  <i>{run.morphology} · {run.size}</i>
                  <strong>{run.achieved} of {run.target}</strong>
                  <StatusLine run={run} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}


function CompareColumn({ engine, title, collection, run, archetypes, sync, span, onSpan, onOpen }: {
  engine: ClusterEngine;
  title?: string;
  collection: string;
  run: Run | null;
  archetypes: ViewArchetype[];
  sync: boolean;
  span: number | undefined;
  onSpan: (id: string, span: number) => void;
  onOpen: (run: Run) => void;
}) {
  const extras = useExtras(run?.record.id ?? null, collection, "refined");
  const tiles = useMemo(() => (run ? seatedTilesOf(run.record) : []), [run]);
  const id = run?.record.id ?? null;
  const handleSpan = useCallback((value: number) => { if (id) onSpan(id, value); }, [id, onSpan]);
  const record = run?.record;
  const assembly = record?.assembly;
  return (
    <div className={styles.column}>
      <div className={styles.columnHead}>
        <b>{title ?? engineLabel(engine)}</b>
        {run ? null : <span className={styles.status}><span data-tone="none">No stored run</span></span>}
      </div>
      <div className={`${base.stage} ${styles.viewport}`}>
        {run && tiles.length > 0 ? (
          <ClusterView
            tiles={tiles}
            archetypes={archetypes}
            selectedId={null}
            interactive
            marker={`lab-compare-${run?.record.id ?? engine}`}
            extras={extras}
            shownExtras={extras ? ["refined"] : undefined}
            hideTiles={Boolean(extras)}
            floorZ={assembly ? 0 : undefined}
            syncGroup={sync ? "lab-compare" : undefined}
            fixedSpan={span}
            onSpan={handleSpan}
          />
        ) : (
          <div className={styles.viewportEmpty}><p className={base.note}>Not generated for this engine.</p></div>
        )}
      </div>
      {run && record ? (
        <div className={styles.columnFoot}>
          <StatusLine run={run} />
          <p className={styles.identityMeta}>{run.achieved} of {run.target} · {record.metrics?.uniqueArchetypes ?? "—"} archetypes</p>
          <p className={styles.identityMeta}>{assembly ? `${assembly.counts["direct-contact"]} direct, ${assembly.counts["patched-near-contact"]} patched` : `${record.contacts.length} contacts`} · volume {format(assembly?.refined.volume, 0)}</p>
          <details className={styles.reading}>
            <summary>Comparison detail</summary>
            <dl className={styles.grid}>
              <div><dt>Tiles</dt><dd>{record.tiles.map((tile) => tile.name).join(" · ")}</dd></div>
              <div><dt>Contact area</dt><dd>{format(record.contacts.reduce((sum, contact) => sum + contact.contactArea, 0), 1)}</dd></div>
              <div><dt>Penetrations</dt><dd>{assembly?.refined.parameters.penetrations ?? "—"}</dd></div>
              {run.row?.shape ? <div><dt>Shape</dt><dd>{shapeLine(run.row.shape)}{run.row.duplicateOf ? ` · same as ${run.row.duplicateOf}` : ""}</dd></div> : null}
              <div><dt>Tests</dt><dd>{record.search?.evaluations ?? "—"} · {record.search?.backtracks ?? "—"} backtracks</dd></div>
              <div><dt>Runtime</dt><dd>{seconds(run.row?.milliseconds)}</dd></div>
              <div className={styles.wide}><dt>Trace</dt><dd>{record.search?.trace ?? "—"}</dd></div>
            </dl>
          </details>
          <button type="button" className={styles.open} onClick={() => onOpen(run)}>Open in workspace</button>
        </div>
      ) : null}
    </div>
  );
}
