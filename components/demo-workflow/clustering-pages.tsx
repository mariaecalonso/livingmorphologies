"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { assemblyFor, refinedFor, seatedTilesOf } from "@/components/clustering/card-view";
import { ClusterView, loadArchetypeGeometry, poseMatrix, type ViewArchetype, type ViewExtra } from "@/components/clustering/cluster-view";
import { Unavailable, useJson } from "@/components/demo-workflow/chapter-kit";
import type { ClusterEngine, ClusterMorphology, ClusterRecord } from "@/lib/skill6/contract";
import styles from "@/components/demo-workflow/clustering-pages.module.css";

type CatalogBody = {
  archetypes: ViewArchetype[];
  clusters: ClusterRecord[];
};

const COLLECTION = "clustering-overnight-v1";
const MORPHOLOGIES: ClusterMorphology[] = ["compact", "branching"];
const CATALOG_SIZES = [2, 3, 4, 5, 6, 7];

type SpinSlot = { canvas: HTMLCanvasElement; scene: THREE.Scene; camera: THREE.PerspectiveCamera };

const LOGICS: { id: ClusterEngine; label: string }[] = [
  { id: "rule-based", label: "Full Build" },
  { id: "graph-based", label: "Graph" },
  { id: "wave-function-collapse", label: "WFC" },
];

const REFINE: { id: string; label: string; shown: string[]; hideTiles: boolean }[] = [
  { id: "tiles", label: "Placed", shown: [], hideTiles: false },
  { id: "patches", label: "Patched", shown: ["patch"], hideTiles: false },
  { id: "union", label: "Union", shown: ["union"], hideTiles: true },
  { id: "refined", label: "Smoothed", shown: ["refined"], hideTiles: true },
];

function isCatalog(value: unknown): value is CatalogBody {
  if (!value || typeof value !== "object") return false;
  const body = value as CatalogBody;
  return Array.isArray(body.archetypes) && Array.isArray(body.clusters);
}

function findCluster(clusters: readonly ClusterRecord[], engine: ClusterEngine, morphology: ClusterMorphology, tiles: number) {
  return clusters.find((cluster) => cluster.search?.engine === engine && cluster.search.organization === morphology && cluster.tiles.length === tiles) ?? null;
}

function searchSide(record: ClusterRecord | null) {
  const search = record?.search;
  const time = search?.milliseconds ?? null;
  return {
    tests: search?.evaluations ?? null,
    accepted: search?.acceptedPoses ?? null,
    backtracks: search?.backtracks ?? null,
    time,
    timeText: time == null ? "—" : time >= 1000 ? `${(time / 1000).toFixed(1)} s` : `${time} ms`,
    refused: search?.geometricRejections ?? null,
    reached: search?.stop === "reached",
    connected: record?.metrics?.connected === true,
    failed: record?.assembly?.counts["failed-patch"] ?? null,
  };
}

function broadcast(group: string, yaw: number, pitch: number, ratio: number) {
  window.dispatchEvent(new CustomEvent("lm-cluster-camera", {
    detail: { group, source: null, yaw, pitch, ratio },
  }));
}

function Reading({ record, archetypes, extras, shown, hideTiles, shownIds, selectedId = null, syncGroup, ground = false, interactive = true, fixedSpan, focus, onSpan }: {
  record: ClusterRecord | null;
  archetypes: readonly ViewArchetype[];
  extras?: readonly ViewExtra[];
  shown?: readonly string[];
  hideTiles?: boolean;
  shownIds?: readonly string[];
  selectedId?: string | null;
  syncGroup?: string;
  ground?: boolean;
  interactive?: boolean;
  fixedSpan?: number;
  focus?: readonly [number, number, number];
  onSpan?: (span: number) => void;
}) {
  const tiles = useMemo(() => (record ? seatedTilesOf(record) : []), [record]);
  if (!record) return <p className={styles.gap}>No stored mesh</p>;
  return (
    <div className={styles.mesh}>
      <ClusterView
        tiles={tiles}
        archetypes={archetypes}
        selectedId={selectedId}
        interactive={interactive}
        extras={extras}
        shownExtras={shown}
        hideTiles={hideTiles}
        shownIds={shownIds}
        floorZ={record.assembly ? 0 : undefined}
        tones="interface"
        presentation
        syncGroup={syncGroup}
        ground={ground}
        fixedSpan={fixedSpan}
        focus={focus}
        onSpan={onSpan}
      />
    </div>
  );
}

function useSharedSpan(fit: number) {
  const seen = useRef(new Map<string, number>());
  const [span, setSpan] = useState<number>();
  const report = useCallback((id: string, value: number) => {
    seen.current.set(id, value);
    const next = Math.max(...seen.current.values()) * fit;
    setSpan((current) => current != null && Math.abs(current - next) < 0.2 ? current : next);
  }, [fit]);
  return [span, report] as const;
}

function stepLine(engine: ClusterEngine, placement: string | undefined, direction: string | null | undefined, index: number, total: number) {
  const count = `${index} of ${total}`;
  if (!placement) return "No stored growth";
  if (placement === "seed") return `${count} · Seed`;
  const way = direction ?? "next";
  if (engine === "rule-based") return `${count} · Scored ${way}`;
  if (engine === "graph-based") return `${count} · Tree ${way}`;
  return `${count} · Collapsed ${way}`;
}

function seatedSteps(record: ClusterRecord | null) {
  const placements = record?.search?.placements ?? [];
  const chosen = new Map<number, { options: number }>();
  for (const item of placements) chosen.set(item.step, { options: item.alternatives.length + 1 });
  return [...chosen.entries()].sort((left, right) => left[0] - right[0]).map(([step, value]) => ({ step, options: value.options }));
}

/** The chosen pass at each step, taken from the stored scored selection. */
function ScoreLogic({ record }: { record: ClusterRecord | null }) {
  const steps = useMemo(() => seatedSteps(record), [record]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (steps.length === 0) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % steps.length), 1100);
    return () => window.clearInterval(timer);
  }, [steps.length]);
  if (steps.length === 0) return <p className={styles.gap}>No stored scores</p>;
  return (
    <svg className={styles.diagram} viewBox="0 0 120 168" role="img" aria-label="Scored selection">
      {steps.map((step, index) => {
        const count = Math.min(step.options, 7);
        const y = 18 + index * (136 / Math.max(1, steps.length - 1));
        return (
          <g key={step.step}>
            <text x="2" y={y + 3} className={styles.diagramText}>{step.step}</text>
            {Array.from({ length: count }, (_, dot) => {
              const chosen = dot === count - 1;
              const cx = 18 + (dot * 72) / Math.max(1, count - 1);
              return (
                <g key={dot}>
                  <circle cx={cx} cy={y} r="3.2" fill={chosen ? "#49d7de" : "rgba(242,242,238,0.28)"} />
                  {chosen && index === active ? <circle cx={cx} cy={y} r="6" fill="none" stroke="#49d7de" strokeWidth="1.2" /> : null}
                </g>
              );
            })}
            {index === active ? <text x="96" y={y + 3} className={styles.diagramText}>Chosen</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

const TILE_TONE: Record<string, string> = { lobby: "#c77e5f", workspace: "#f2f2ee", gathering: "#7db8b8" };

/** The stored growth tree, drawn in the order it was seated. */
function TreeLogic({ record }: { record: ClusterRecord | null }) {
  const layout = useMemo(() => {
    const growth = record?.assembly?.growth ?? [];
    const tone = new Map(record?.tiles.map((tile) => [tile.instanceId, TILE_TONE[tile.typologyId] ?? "#f2f2ee"]) ?? []);
    const depthOf = new Map<string, number>();
    const rowOf = new Map<number, number>();
    return growth.map((step) => {
      const depth = step.hostInstanceId ? (depthOf.get(step.hostInstanceId) ?? 0) + 1 : 0;
      depthOf.set(step.instanceId, depth);
      const row = rowOf.get(depth) ?? 0;
      rowOf.set(depth, row + 1);
      return { id: step.instanceId, host: step.hostInstanceId, depth, row, color: tone.get(step.instanceId) ?? "#f2f2ee", direction: step.direction };
    });
  }, [record]);
  const [grown, setGrown] = useState(1);
  useEffect(() => {
    if (layout.length < 2) return;
    const timer = window.setInterval(() => setGrown((value) => value >= layout.length ? 1 : value + 1), 900);
    return () => window.clearInterval(timer);
  }, [layout.length]);
  if (layout.length === 0) return <p className={styles.gap}>No stored tree</p>;
  const at = new Map(layout.map((node) => [node.id, node]));
  const columns = Math.max(...layout.map((node) => node.depth), 1);
  const rows = Math.max(...layout.map((node) => node.row), 1);
  const point = (node: { depth: number; row: number }) => ({ x: 24 + (node.row * 72) / rows, y: 16 + (node.depth * 132) / columns });
  return (
    <svg className={styles.diagram} viewBox="0 0 120 168" role="img" aria-label="Connectivity tree">
      {layout.map((node, index) => {
        const host = node.host ? at.get(node.host) : null;
        if (!host || index >= grown) return null;
        const from = point(host);
        const to = point(node);
        return (
          <g key={`${host.id}-${node.id}`}>
            <line className={styles.edge} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
            {node.direction ? <text x={(from.x + to.x) / 2 + 8} y={(from.y + to.y) / 2} className={styles.diagramText}>{node.direction}</text> : null}
          </g>
        );
      })}
      {layout.map((node, index) => {
        if (index >= grown) return null;
        const spot = point(node);
        return <circle key={node.id} cx={spot.x} cy={spot.y} r={index === 0 ? 7 : 6} fill={node.color} stroke={index === grown - 1 ? "#49d7de" : "none"} strokeWidth="1.4" />;
      })}
    </svg>
  );
}

/** Domain collapse and one reopen. The counts are this run's stored search. */
function CollapseLogic({ record }: { record: ClusterRecord | null }) {
  const backtracks = record?.search?.backtracks ?? 0;
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setPhase((value) => (value + 1) % 6), 700);
    return () => window.clearInterval(timer);
  }, []);
  const tones = ["#f2f2ee", "#c77e5f", "#7db8b8", "#f2f2ee"];
  const phaseName = phase < 4 ? "Collapse" : phase === 4 ? "Backtrack" : "Seated";
  return (
    <svg className={styles.diagram} viewBox="0 0 120 168" role="img" aria-label={`Domain collapse, ${backtracks} backtracks`}>
      {[0, 1, 2, 3].map((slot) => {
        const open = phase < slot || (slot === 3 && phase === 4);
        const x = 8 + slot * 29;
        return (
          <g key={slot}>
            <text x={x + 4} y="16" className={styles.diagramText}>{slot + 1}</text>
            {open
              ? [0, 1, 2].map((line) => <rect key={line} x={x} y={28 + line * 36} width="22" height="22" fill="rgba(242,242,238,0.28)" />)
              : <rect x={x} y="36" width="22" height="88" fill={tones[slot]} stroke={slot === 3 && phase === 4 ? "#c77e5f" : "none"} strokeWidth="1.5" />}
          </g>
        );
      })}
      <text x="60" y="158" textAnchor="middle" className={styles.diagramText}>{phaseName}</text>
    </svg>
  );
}

/** Adds one stored tile at a time, in the order that engine seated it. */
function Formation({ record, archetypes, engine }: { record: ClusterRecord | null; archetypes: readonly ViewArchetype[]; engine: ClusterEngine }) {
  const order = record?.assembly?.growth ?? [];
  const [step, setStep] = useState(1);
  const [span, setSpan] = useState<number>();
  const report = useCallback((value: number) => {
    const next = value * 1.85;
    setSpan((current) => current != null && Math.abs(current - next) < 0.3 ? current : next);
  }, []);
  useEffect(() => {
    if (order.length < 2) return;
    const timer = window.setInterval(() => setStep((value) => value >= order.length ? 1 : value + 1), 1400);
    return () => window.clearInterval(timer);
  }, [order.length]);
  const shown = Math.min(step, Math.max(order.length, 1));
  const current = order[shown - 1];
  const shownIds = useMemo(() => order.slice(0, shown).map((item) => item.instanceId), [order, shown]);
  if (order.length === 0) return <p className={styles.gap}>No stored growth</p>;
  const diagram = engine === "rule-based" ? <ScoreLogic record={record} /> : engine === "graph-based" ? <TreeLogic record={record} /> : <CollapseLogic record={record} />;
  return (
    <>
      <div className={styles.logicSplit}>
        {diagram}
        <Reading record={record} archetypes={archetypes} interactive={false} shownIds={shownIds} selectedId={current?.instanceId ?? null} fixedSpan={span} onSpan={report} />
      </div>
      <p className={styles.method}>{stepLine(engine, current?.placement, current?.direction, shown, order.length)}</p>
    </>
  );
}

/** Three tested searches, the compact and branching runs, then patching and smoothing. */
export function ClusteringDevelopmentPage() {
  const load = useJson(`/api/clustering/catalog?collection=${encodeURIComponent(COLLECTION)}`, isCatalog);
  const sample = load.status === "ready" ? findCluster(load.data.clusters, "graph-based", "compact", 4) : null;
  const [extras, setExtras] = useState<ViewExtra[] | null>(null);
  useEffect(() => {
    if (!sample) return;
    let live = true;
    void assemblyFor(sample.id, COLLECTION).then((list) => {
      if (live) setExtras(list.map((extra) => extra.id === "patch" ? { ...extra, color: "#8d8d8d" } : extra));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [sample]);
  const [runSpan, reportRun] = useSharedSpan(1.72);
  const joint = useMemo(() => {
    const joints = (sample?.assembly?.joints ?? []).filter((item) => item.primary && item.classification === "patched-near-contact" && item.patch?.footprint);
    const seam = joints.map((item) => {
      const extent = item.patch?.footprint?.extent ?? [0, 0, 0];
      return { item, thin: Math.min(...extent), wide: Math.max(...extent) };
    }).filter((item) => item.wide >= 4).sort((left, right) => left.thin - right.thin || left.wide - right.wide);
    return seam[0]?.item ?? joints[0] ?? null;
  }, [sample]);
  const jointFocus = joint?.patch?.footprint?.center;
  const jointSpan = joint?.patch?.footprint ? Math.max(...joint.patch.footprint.extent, 1) * 2.6 : undefined;
  if (load.status !== "ready") return <Unavailable status={load.status} what="the clustering engines" />;
  const { archetypes, clusters } = load.data;
  const shown = (engine: ClusterEngine, morphology: ClusterMorphology) => findCluster(clusters, engine, morphology, 4);
  return (
    <div className={styles.page}>
      <div className={styles.progress}>
        <section className={styles.stage} aria-label="Logics">
          <header className={styles.stageHead}>
            <p className={styles.index}>01</p>
            <p className={styles.kicker}>Logics</p>
          </header>
          <p className={styles.sentence}>Each search seats one tile at a time. Full Build scores the next tile, Graph follows the tree, and WFC collapses the next slot.</p>
          <div className={styles.logicRow}>
            {LOGICS.map((logic) => (
              <article key={logic.id} className={styles.logic}>
                <p className={styles.kicker}>{logic.label}</p>
                <Formation record={shown(logic.id, "compact")} archetypes={archetypes} engine={logic.id} />
              </article>
            ))}
          </div>
        </section>
        <section className={styles.stage} aria-label="Runs">
          <header className={styles.stageHead}>
            <p className={styles.index}>02</p>
            <p className={styles.kicker}>Runs</p>
          </header>
          <p className={styles.sentence}>Full Build lost branching at four tiles. Graph and WFC held both morphologies through seven. Compact stays gathered. Branching spreads.</p>
          <div className={styles.runBoard}>
            <span />
            {LOGICS.map((logic) => (
              <p key={logic.id} className={styles.kicker}>
                {logic.label}
                <span data-state={logic.id === "rule-based" ? "failed" : "held"}>{logic.id === "rule-based" ? "Branching failed" : "Held"}</span>
              </p>
            ))}
            {MORPHOLOGIES.map((morphology) => (
              <div key={morphology} className={styles.runGroup}>
                <p className={styles.kicker}>{morphology}</p>
                {LOGICS.map((logic) => {
                  const record = shown(logic.id, morphology);
                  return (
                    <div key={logic.id} className={styles.run} data-status={record?.status ?? "missing"}>
                      <Reading record={record} archetypes={archetypes} interactive={false} fixedSpan={runSpan} onSpan={(value) => reportRun(`${logic.id}-${morphology}`, value)} />
                      {record?.status === "unsuccessful" ? <p className={styles.fail}>Failed</p> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <ul className={styles.legend}>
            <li><i data-tone="lobby" />Lobby</li>
            <li><i data-tone="workspace" />Workspace</li>
            <li><i data-tone="gathering" />Gathering</li>
          </ul>
        </section>
        <section className={styles.stage} aria-label="Refine">
          <header className={styles.stageHead}>
            <p className={styles.index}>03</p>
            <p className={styles.kicker}>Refine</p>
          </header>
          <p className={styles.sentence}>One joint, from the placed gap through the patch, the union, and the smoothed seam.</p>
          <div className={styles.refineGrid}>
            {REFINE.map((step) => (
              <article key={step.id} className={styles.logic}>
                <p className={styles.kicker}>{step.label}</p>
                <Reading record={sample} archetypes={archetypes} extras={extras ?? undefined} shown={step.shown} hideTiles={Boolean(extras) && step.hideTiles} interactive={false} fixedSpan={jointSpan} focus={jointFocus} />
              </article>
            ))}
          </div>
          <ul className={styles.legend}>
            <li><i data-tone="patch" />Patch</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function pointOn(host: HTMLElement, el: HTMLElement, along: number, down: number) {
  const frame = host.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const scaleX = frame.width === 0 ? 1 : host.offsetWidth / frame.width;
  const scaleY = frame.height === 0 ? 1 : host.offsetHeight / frame.height;
  return {
    x: (box.left - frame.left + box.width * along) * scaleX,
    y: (box.top - frame.top + box.height * down) * scaleY,
  };
}

const COMPARED = [
  { id: "graph-based" as const, label: "Graph Based", method: "Topology first, then realized" },
  { id: "wave-function-collapse" as const, label: "Wave Function Collapse", method: "Domain propagation, backtracking" },
];
const TILE_OPTIONS = [2, 3, 4, 5, 6, 7] as const;

/** Graph and WFC side by side. Playback visits 2 and 4. Any size from 2 through 7 can be opened by hand. */
export function GraphWfcPage() {
  const load = useJson(`/api/clustering/catalog?collection=${encodeURIComponent(COLLECTION)}`, isCatalog);
  const lab = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const hands = useRef(false);
  const place = useRef({ x: 120, y: 36 });
  const [count, setCount] = useState<(typeof TILE_OPTIONS)[number]>(2);
  useEffect(() => {
    const host = lab.current;
    if (!host) return;
    const take = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-size], canvas")) hands.current = true;
    };
    host.addEventListener("pointerdown", take);
    host.addEventListener("wheel", take, { passive: true });
    const root = document.querySelector("[data-demo-root]");
    let playing = root?.hasAttribute("data-playing") ?? false;
    const observer = new MutationObserver(() => {
      const next = root?.hasAttribute("data-playing") ?? false;
      if (next && !playing) hands.current = false;
      playing = next;
    });
    if (root) observer.observe(root, { attributes: true, attributeFilter: ["data-playing"] });
    return () => {
      host.removeEventListener("pointerdown", take);
      host.removeEventListener("wheel", take);
      observer.disconnect();
    };
  }, [load.status]);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    let shown: (typeof TILE_OPTIONS)[number] = 2;
    const glide = (mark: HTMLSpanElement, target: { x: number; y: number }, amount: number) => {
      place.current.x += (target.x - place.current.x) * amount;
      place.current.y += (target.y - place.current.y) * amount;
      mark.style.left = `${place.current.x}px`;
      mark.style.top = `${place.current.y}px`;
    };
    const tick = (now: number) => {
      const beat = ((now - start) / 1000) % 24;
      const mark = cursor.current;
      const host = lab.current;
      const arm = beat < 12 ? { size: 2 as const, local: beat } : { size: 4 as const, local: beat - 12 };
      if (mark && host) {
        if (hands.current) {
          mark.dataset.off = "true";
        } else {
          mark.dataset.off = "false";
          const chip = host.querySelector<HTMLElement>(`[data-size="${arm.size}"]`);
          const mesh = host.querySelector<HTMLElement>("[aria-label='Graph Based'] canvas");
          if (chip && arm.local < 1.35) {
            glide(mark, pointOn(host, chip, 0.5, 0.62), 0.22);
            mark.dataset.down = arm.local > 0.72 ? "true" : "false";
            if (arm.local > 0.9 && shown !== arm.size) {
              shown = arm.size;
              setCount(arm.size);
            }
          } else if (mesh) {
            const drag = arm.local < 5.4;
            const turn = drag ? Math.max(0, (arm.local - 1.35) / 4.05) : 1;
            const along = 0.34 + Math.sin(turn * Math.PI) * 0.3;
            const down = 0.48 + Math.sin(turn * Math.PI * 2) * 0.07;
            glide(mark, pointOn(host, mesh, along, down), drag ? 0.35 : 0.12);
            mark.dataset.down = drag && arm.local > 1.5 ? "true" : "false";
            const zoomIn = Math.min(1, Math.max(0, (arm.local - 5.4) / 2.2));
            const zoomOut = Math.min(1, Math.max(0, (arm.local - 7.8) / 2.6));
            const ratio = 1 - zoomIn * 0.42 + zoomOut * 0.42;
            broadcast(
              "wf-cluster-lab",
              Math.PI / 4 + Math.sin(turn * Math.PI) * 0.95,
              0.52 + Math.sin(turn * Math.PI * 2) * 0.14,
              Math.min(1.15, Math.max(0.5, ratio)),
            );
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  if (load.status !== "ready") return <Unavailable status={load.status} what="the Graph and WFC clusters" />;
  const { archetypes, clusters } = load.data;
  return (
    <div ref={lab} className={styles.lab}>
      <div className={styles.sizeRow}>
        <p className={styles.group}>Tiles</p>
        <div className={styles.choices} role="group" aria-label="Cluster size">
          {TILE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              data-size={size}
              data-on={count === size ? "true" : "false"}
              aria-pressed={count === size}
              onClick={() => { hands.current = true; setCount(size); }}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.compare}>
        {COMPARED.map((column) => {
          const record = findCluster(clusters, column.id, "compact", count);
          return (
            <article key={column.id} className={styles.frame} aria-label={column.label}>
              <header className={styles.benchHead}>
                <p className={styles.engine}>{column.label}</p>
                <p className={styles.method}>{column.method}</p>
              </header>
              <div className={styles.bench}>
                <RefinedReading record={record} archetypes={archetypes} syncGroup="wf-cluster-lab" ground />
                <StudyPlates record={record} archetypes={archetypes} />
              </div>
            </article>
          );
        })}
        <SearchReading
          left={findCluster(clusters, "graph-based", "compact", count)}
          right={findCluster(clusters, "wave-function-collapse", "compact", count)}
        />
      </div>
      <span ref={cursor} className={styles.cursor} aria-hidden="true">
        <svg viewBox="0 0 18 22"><path d="M1 1v17l4.6-4.2 3.2 7 3-1.4-3.2-6.8 6.4-.2z" /></svg>
      </span>
    </div>
  );
}

function radarPoint(index: number, count: number, radius: number, unit: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return [Math.cos(angle) * radius * unit, Math.sin(angle) * radius * unit] as const;
}

function SearchReading({ left, right }: { left: ClusterRecord | null; right: ClusterRecord | null }) {
  const graph = searchSide(left);
  const wfc = searchSide(right);
  const axes = [
    { label: "Tests", graph: graph.tests, wfc: wfc.tests, graphText: graph.tests == null ? "—" : String(graph.tests), wfcText: wfc.tests == null ? "—" : String(wfc.tests) },
    { label: "Accepted", graph: graph.accepted, wfc: wfc.accepted, graphText: graph.accepted == null ? "—" : String(graph.accepted), wfcText: wfc.accepted == null ? "—" : String(wfc.accepted) },
    { label: "Refused", graph: graph.refused, wfc: wfc.refused, graphText: graph.refused == null ? "—" : String(graph.refused), wfcText: wfc.refused == null ? "—" : String(wfc.refused) },
    { label: "Backtracks", graph: graph.backtracks, wfc: wfc.backtracks, graphText: graph.backtracks == null ? "—" : String(graph.backtracks), wfcText: wfc.backtracks == null ? "—" : String(wfc.backtracks) },
    { label: "Time", graph: graph.time, wfc: wfc.time, graphText: graph.timeText, wfcText: wfc.timeText },
  ];
  const radius = 92;
  const outline = (pick: (axis: (typeof axes)[number]) => number | null) => axes.map((axis, index) => {
    const amount = pick(axis) ?? 0;
    const peak = Math.max(axis.graph ?? 0, axis.wfc ?? 0, 1);
    const [x, y] = radarPoint(index, axes.length, radius, amount / peak);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <aside className={styles.frame} aria-label="Search reading">
      <header className={styles.benchHead}>
        <p className={styles.engine}>Reading</p>
        <p className={styles.key}>
          <span><i data-engine="graph" />Graph</span>
          <span><i data-engine="wfc" />WFC</span>
        </p>
      </header>
      <div className={styles.ledger}>
        <svg className={styles.radar} viewBox="-150 -158 300 316" role="img" aria-label="Graph and WFC on a shared scale" preserveAspectRatio="xMidYMid meet">
          {[0.34, 0.67, 1].map((ring) => <circle key={ring} r={radius * ring} fill="none" stroke={ring === 1 ? "rgba(242,242,238,0.32)" : "rgba(242,242,238,0.14)"} strokeWidth="1" />)}
          {axes.map((axis, index) => {
            const [x, y] = radarPoint(index, axes.length, radius, 1);
            return <line key={axis.label} x1="0" y1="0" x2={x} y2={y} stroke="rgba(242,242,238,0.16)" strokeWidth="1" />;
          })}
          <path d={`${outline((axis) => axis.graph)} Z`} fill="rgba(73,215,222,0.2)" stroke="#49d7de" strokeWidth="1.25" strokeLinejoin="round" />
          <path d={`${outline((axis) => axis.wfc)} Z`} fill="none" stroke="#c77e5f" strokeWidth="1.6" strokeDasharray="4 3" strokeLinejoin="round" />
          {axes.map((axis, index) => {
            const [x, y] = radarPoint(index, axes.length, radius + 28, 1);
            const anchor = Math.abs(x) < radius * 0.35 ? "middle" : x > 0 ? "start" : "end";
            return <text key={axis.label} x={x} y={y} textAnchor={anchor}>{axis.label}</text>;
          })}
        </svg>
        <dl className={styles.measures}>
          {axes.map((axis) => (
            <div key={axis.label}>
              <dt>{axis.label}</dt>
              <dd>{axis.graphText}</dd>
              <dd>{axis.wfcText}</dd>
            </div>
          ))}
          <div>
            <dt>Reached</dt>
            <dd>{graph.reached ? "Yes" : "No"}</dd>
            <dd>{wfc.reached ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Connected</dt>
            <dd>{graph.connected ? "Yes" : "No"}</dd>
            <dd>{wfc.connected ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Failed</dt>
            <dd>{graph.failed == null ? "—" : String(graph.failed)}</dd>
            <dd>{wfc.failed == null ? "—" : String(wfc.failed)}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}

const TYPOLOGY: Record<string, string> = { lobby: "#c77e5f", workspace: "#f2f2ee", gathering: "#7db8b8" };
const PLATES = [
  { id: "axon", label: "Axon" },
  { id: "top", label: "Top" },
  { id: "front", label: "Front" },
  { id: "right", label: "Right" },
  { id: "back", label: "Back" },
  { id: "left", label: "Left" },
] as const;
type PlateId = (typeof PLATES)[number]["id"];

/** Plan, four elevations, and a colored axon. One renderer draws every plate. */
function StudyPlates({ record, archetypes }: { record: ClusterRecord | null; archetypes: readonly ViewArchetype[] }) {
  const nodes = useRef<(HTMLCanvasElement | null)[]>([]);
  useEffect(() => {
    if (!record) return;
    let live = true;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 1);
    const solidScene = new THREE.Scene();
    const tileScene = new THREE.Scene();
    const solidRoot = new THREE.Group();
    const tileRoot = new THREE.Group();
    solidScene.add(solidRoot);
    tileScene.add(tileRoot);
    const light = (scene: THREE.Scene) => {
      scene.add(new THREE.HemisphereLight(0xf2f2f0, 0x1a1a1a, 0.72));
      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const key = new THREE.DirectionalLight(0xfff8f2, 1.15);
      key.position.set(18, -14, 22);
      scene.add(key);
    };
    light(solidScene);
    light(tileScene);
    const materials: THREE.Material[] = [];
    const cameras = new Map<PlateId, THREE.OrthographicCamera>();
    for (const plate of PLATES) cameras.set(plate.id, new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000));
    let solidBox: THREE.Box3 | null = null;
    let tileBox: THREE.Box3 | null = null;
    const aim = (camera: THREE.OrthographicCamera, box: THREE.Box3, id: PlateId, aspect: number) => {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z, 1);
      const dir = id === "top" ? new THREE.Vector3(0, 0, 1)
        : id === "front" ? new THREE.Vector3(0, -1, 0)
          : id === "right" ? new THREE.Vector3(1, 0, 0)
            : id === "back" ? new THREE.Vector3(0, 1, 0)
              : id === "left" ? new THREE.Vector3(-1, 0, 0)
                : new THREE.Vector3(1, -1, 0.72).normalize();
      camera.position.copy(center).add(dir.clone().multiplyScalar(span * 3));
      camera.up.copy(id === "top" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const corner = new THREE.Vector3();
      let maxX = 0.5;
      let maxY = 0.5;
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            corner.set(x, y, z).sub(center);
            maxX = Math.max(maxX, Math.abs(corner.dot(right)));
            maxY = Math.max(maxY, Math.abs(corner.dot(camUp)));
          }
        }
      }
      let halfW = maxX * 1.16;
      let halfH = maxY * 1.16;
      if (halfW / halfH > aspect) halfH = halfW / aspect;
      else halfW = halfH * aspect;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.near = 0.1;
      camera.far = span * 10;
      camera.updateProjectionMatrix();
    };
    const paint = () => {
      for (const [index, plate] of PLATES.entries()) {
        const canvas = nodes.current[index];
        const box = plate.id === "axon" ? tileBox : solidBox;
        const camera = cameras.get(plate.id);
        if (!canvas || !box || !camera || box.isEmpty()) continue;
        const width = Math.max(1, Math.round(canvas.clientWidth));
        const height = Math.max(1, Math.round(canvas.clientHeight));
        if (width < 2 || height < 2) continue;
        canvas.width = width;
        canvas.height = height;
        aim(camera, box, plate.id, width / height);
        renderer.setSize(width, height, false);
        renderer.render(plate.id === "axon" ? tileScene : solidScene, camera);
        canvas.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
      }
    };
    const tiles = seatedTilesOf(record);
    const lookup = new Map(archetypes.map((item) => [item.archetypeId, item]));
    void Promise.all([
      refinedFor(record.id, COLLECTION),
      Promise.all(tiles.map(async (tile) => {
        const source = lookup.get(tile.archetypeId);
        if (!source) return null;
        return { tile, geometry: await loadArchetypeGeometry(source) };
      })),
    ]).then(([solids, loaded]) => {
      if (!live) return;
      const solid = solids.find((item) => item.id === "refined");
      if (solid) {
        const material = new THREE.MeshLambertMaterial({ color: solid.color });
        materials.push(material);
        solidRoot.add(new THREE.Mesh(solid.geometry, material));
        solidRoot.updateMatrixWorld(true);
        solidBox = new THREE.Box3().setFromObject(solidRoot);
      }
      for (const item of loaded) {
        if (!item) continue;
        const material = new THREE.MeshLambertMaterial({ color: TYPOLOGY[item.tile.typologyId] ?? "#f2f2ee" });
        materials.push(material);
        const mesh = new THREE.Mesh(item.geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(poseMatrix(item.tile.pose));
        tileRoot.add(mesh);
      }
      tileRoot.updateMatrixWorld(true);
      if (tileRoot.children.length > 0) tileBox = new THREE.Box3().setFromObject(tileRoot);
      paint();
    }).catch(() => undefined);
    const observer = new ResizeObserver(() => paint());
    for (const canvas of nodes.current) if (canvas) observer.observe(canvas);
    return () => {
      live = false;
      observer.disconnect();
      for (const material of materials) material.dispose();
      renderer.dispose();
    };
  }, [record, archetypes]);
  return (
    <div className={styles.plates}>
      {PLATES.map((plate, index) => (
        <div key={plate.id} className={styles.plate}>
          <span>{plate.label}</span>
          <i><canvas ref={(node) => { nodes.current[index] = node; }} /></i>
        </div>
      ))}
    </div>
  );
}

/** The stored refined solid. The process page keeps the separate tiles. */
function RefinedReading({ record, archetypes, syncGroup, ground }: {
  record: ClusterRecord | null;
  archetypes: readonly ViewArchetype[];
  syncGroup?: string;
  ground?: boolean;
}) {
  const [extras, setExtras] = useState<ViewExtra[] | null>(null);
  useEffect(() => {
    if (!record) return;
    let live = true;
    setExtras(null);
    void refinedFor(record.id, COLLECTION).then((list) => { if (live) setExtras(list); }).catch(() => undefined);
    return () => { live = false; };
  }, [record]);
  return <Reading record={record} archetypes={archetypes} extras={extras ?? undefined} shown={["refined"]} hideTiles syncGroup={syncGroup} ground={ground} />;
}

function SpinCell({ record, register }: {
  record: ClusterRecord | null;
  register: (slot: SpinSlot) => () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !record) return;
    let live = true;
    let unregister = () => {};
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 800);
    const root = new THREE.Group();
    scene.add(root);
    scene.add(new THREE.HemisphereLight(0xf2f2f0, 0x1a1a1a, 0.62));
    scene.add(new THREE.AmbientLight(0xffffff, 0.38));
    const key = new THREE.DirectionalLight(0xfff8f2, 1.65);
    const fill = new THREE.DirectionalLight(0xc77e5f, 0.28);
    scene.add(key);
    scene.add(key.target);
    scene.add(fill);
    void refinedFor(record.id, COLLECTION).then((list) => {
      if (!live) return;
      const solid = list.find((item) => item.id === "refined");
      if (!solid) return;
      const mesh = new THREE.Mesh(solid.geometry, new THREE.MeshStandardMaterial({ color: solid.color, roughness: 0.62, metalness: 0.02 }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z, 1);
      key.castShadow = true;
      key.shadow.mapSize.set(512, 512);
      key.shadow.bias = -0.0004;
      key.position.set(center.x + span * 0.22, center.y - span * 0.42, box.max.z + span * 0.55);
      key.target.position.copy(center);
      key.target.updateMatrixWorld();
      const shadow = key.shadow.camera;
      shadow.near = 0.5;
      shadow.far = span * 4;
      shadow.left = -span * 0.55;
      shadow.right = span * 0.55;
      shadow.top = span * 0.55;
      shadow.bottom = -span * 0.55;
      shadow.updateProjectionMatrix();
      fill.position.set(center.x - span * 0.4, center.y + span * 0.2, box.max.z);
      camera.userData.center = center;
      camera.userData.fitHeight = Math.max(size.z, 0.5);
      camera.userData.fitWidth = Math.max(Math.hypot(size.x, size.y), 0.5);
      unregister = register({ canvas, scene, camera });
    }).catch(() => undefined);
    return () => {
      live = false;
      unregister();
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
    };
  }, [record, register]);
  if (!record) return <p className={styles.gap}>No stored mesh</p>;
  return <canvas ref={canvasRef} />;
}

/** Graph and WFC refined solids. One shared spin turns every mesh together. */
export function ClusterCatalogPage() {
  const load = useJson(`/api/clustering/catalog?collection=${encodeURIComponent(COLLECTION)}`, isCatalog);
  const slots = useRef<SpinSlot[]>([]);
  const register = useCallback((slot: SpinSlot) => {
    slots.current.push(slot);
    return () => { slots.current = slots.current.filter((item) => item !== slot); };
  }, []);
  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const yaw = Math.PI / 4 + ((now - start) / 1000) * 0.09;
      const pitch = 0.58;
      const cos = Math.cos(pitch);
      let fitHeight = 0;
      let fitWidth = 0;
      for (const slot of slots.current) {
        fitHeight = Math.max(fitHeight, slot.camera.userData.fitHeight as number);
        fitWidth = Math.max(fitWidth, slot.camera.userData.fitWidth as number);
      }
      for (const slot of slots.current) {
        const width = Math.max(1, slot.canvas.clientWidth);
        const height = Math.max(1, slot.canvas.clientHeight);
        renderer.setSize(width, height, false);
        const center = slot.camera.userData.center as THREE.Vector3;
        const vertical = (slot.camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * (width / height));
        const seenHeight = Math.max(fitHeight, fitHeight * Math.cos(pitch) + fitWidth * Math.sin(pitch) * 0.35);
        const distance = Math.max(seenHeight / (2 * Math.tan(vertical)), fitWidth / (2 * Math.tan(horizontal))) * 1.22;
        slot.camera.aspect = width / height;
        slot.camera.position.set(
          center.x + distance * cos * Math.sin(yaw),
          center.y - distance * cos * Math.cos(yaw),
          center.z + distance * Math.sin(pitch),
        );
        slot.camera.up.set(0, 0, 1);
        slot.camera.lookAt(center);
        slot.camera.updateProjectionMatrix();
        renderer.render(slot.scene, slot.camera);
        const context = slot.canvas.getContext("2d");
        if (!context) continue;
        if (slot.canvas.width !== width || slot.canvas.height !== height) {
          slot.canvas.width = width;
          slot.canvas.height = height;
        }
        context.drawImage(renderer.domElement, 0, 0, width, height);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      renderer.dispose();
    };
  }, []);
  if (load.status !== "ready") return <Unavailable status={load.status} what="the Graph and WFC catalog" />;
  const { clusters } = load.data;
  const columns = [
    { id: "graph-based" as const, label: "Graph" },
    { id: "wave-function-collapse" as const, label: "WFC" },
  ];
  return (
    <div className={styles.catalog}>
      <div className={styles.sheet}>
      <div className={styles.board}>
        <div className={styles.head}>
          <span />
          {CATALOG_SIZES.map((size) => <p key={size} className={styles.kicker}>{size}</p>)}
        </div>
        {columns.flatMap((column) => MORPHOLOGIES.map((morphology) => (
          <div key={`${column.id}-${morphology}`} className={styles.row}>
            <p className={styles.kicker}>{column.label}<span>{morphology}</span></p>
            {CATALOG_SIZES.map((size) => (
              <div key={size} className={styles.cell}>
                <SpinCell record={findCluster(clusters, column.id, morphology, size)} register={register} />
              </div>
            ))}
          </div>
        )))}
      </div>
      </div>
    </div>
  );
}
