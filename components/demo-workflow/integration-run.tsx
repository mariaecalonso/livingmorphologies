"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import contextJson from "@/data/skill5/herald-site.json";
import { HybridPresentation } from "@/components/home-hybrid-lab-frames";
import { HybridAssembly } from "@/components/hybrid/hybrid-assembly";
import { catalogInspectionMeshes } from "@/components/hybrid/catalog-inspect";
import { HybridState, useHybrid } from "@/components/hybrid/hybrid-state";
import { MeshPreview } from "@/components/hybrid/mesh-preview";
import { SiteViewport } from "@/components/site/site-viewport";
import type { SitePlacementModel } from "@/components/site/module-field";
import type { CatalogEntry } from "@/lib/skill4/catalog";
import { catalogServerSnapshot, readCatalog, subscribeCatalog } from "@/lib/skill4/catalog-store";
import { assemblyWorldModules, importAssembly, type SiteAssembly } from "@/lib/skill5/assembly";
import { designSiteFromParcel } from "@/lib/skill5/design-site";
import { loadArchetypeMesh } from "@/lib/skill5/load-module";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { SiteContext } from "@/lib/skill5/site-model";
import styles from "@/components/demo-workflow/integration-chapter.module.css";

const site = contextJson as SiteContext;
const design = designSiteFromParcel(site.site.ring);
const ORIGIN = {
  x: (design.ring[0][0] + design.ring[2][0]) / 2,
  z: (design.ring[0][1] + design.ring[2][1]) / 2,
};
const EMPTY = "Save the current assembly to add it to the catalog.";

type PublishedState = { rows: CatalogEntry[]; selectedId: string | null };

const listeners = new Set<() => void>();
let published: PublishedState = { rows: [], selectedId: null };
let publishedStarted = false;

function emit(next: PublishedState) {
  published = next;
  for (const listener of listeners) listener();
}

function selectHybrid(id: string) {
  emit({ ...published, selectedId: id });
}

function belongsToBatch(entry: unknown, batchId: string): entry is CatalogEntry {
  if (!entry || typeof entry !== "object") return false;
  const record = entry as CatalogEntry;
  if (typeof record.id !== "string" || !Array.isArray(record.tiles)) return false;
  if (record.batchId === batchId) return true;
  return batchId === "TEST_1" && !record.batchId && /^S04 TEST \d+$/.test(record.id);
}

function useHybridCatalog() {
  const stored = useSyncExternalStore(subscribeCatalog, readCatalog, catalogServerSnapshot);
  const extra = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => published,
    () => published,
  );
  useEffect(() => {
    if (publishedStarted) return;
    publishedStarted = true;
    const files = Array.from({ length: 13 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      return { batchId: `TEST_${index + 1}`, file: `/skill4/SKILL04-STRESS-TEST-${number}-catalog.json` };
    });
    Promise.all(files.map(async ({ batchId, file }) => {
      try {
        const response = await fetch(file);
        if (!response.ok) return [];
        const rows: unknown = await response.json();
        if (!Array.isArray(rows)) return [];
        return rows.filter((entry) => belongsToBatch(entry, batchId));
      } catch {
        return [];
      }
    })).then((groups) => {
      emit({ ...published, rows: groups.flat() });
    }).catch(() => undefined);
  }, []);
  const entries = useMemo(() => {
    const ids = new Set(stored.map((entry) => entry.id));
    return [...stored, ...extra.rows.filter((entry) => !ids.has(entry.id))];
  }, [extra.rows, stored]);
  useEffect(() => {
    if (!extra.selectedId && entries[0]) selectHybrid(entries[0].id);
  }, [entries, extra.selectedId]);
  return {
    entries,
    selectedId: extra.selectedId ?? entries[0]?.id ?? null,
    note: entries.length === 0 ? EMPTY : null,
  };
}

type LabBeat =
  | { kind: "aim" | "press"; selector: string; ms: number; act?: "generate" | "click" }
  | { kind: "follow"; }
  | { kind: "scrub"; ms: number };

/** The same kind of pass chapter 02 makes through the lab: the cursor visits each control, then the run plays. */
const LAB_BEATS: LabBeat[] = [
  { kind: "aim", selector: '[aria-label="A face N"]', ms: 900 },
  { kind: "press", selector: '[aria-label="A face N"]', ms: 360 },
  { kind: "aim", selector: '[aria-label="B face S"]', ms: 900 },
  { kind: "press", selector: '[aria-label="B face S"]', ms: 360 },
  { kind: "aim", selector: ".hybrid-matrix", ms: 800 },
  { kind: "press", selector: ".hybrid-matrix", ms: 420, act: "generate" },
  { kind: "follow" },
  { kind: "aim", selector: '[data-mock-id="H10"]', ms: 800 },
  { kind: "press", selector: '[data-mock-id="H10"]', ms: 380, act: "click" },
  { kind: "aim", selector: ".hybrid-morph-toggle", ms: 800 },
  { kind: "press", selector: ".hybrid-morph-toggle", ms: 380, act: "click" },
  { kind: "scrub", ms: 7000 },
  { kind: "aim", selector: ".hybrid-validate-run", ms: 800 },
  { kind: "press", selector: ".hybrid-validate-run", ms: 420, act: "click" },
];

function latestMatrixCell(root: ParentNode) {
  const buttons = [...root.querySelectorAll<HTMLElement>(".hybrid-matrix-grid button")];
  return buttons.filter((button) => button.querySelector("canvas")).at(-1) ?? buttons.at(-1) ?? root.querySelector<HTMLElement>(".hybrid-matrix");
}

function placeCursor(cursor: HTMLElement, host: HTMLElement, target: HTMLElement, along = 0.42) {
  const box = host.getBoundingClientRect();
  const scale = box.width / host.offsetWidth || 1;
  const rect = target.getBoundingClientRect();
  const x = (rect.left - box.left + rect.width * along) / scale;
  const y = (rect.top - box.top + rect.height * 0.62) / scale;
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  cursor.dataset.hidden = "false";
}

function HybridRun() {
  const { connections, loaded, generateHybridFieldForConnection } = useHybrid();
  const started = useRef(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [beat, setBeat] = useState(0);
  const reduced = useRef(false);
  const begin = () => {
    if (started.current) return;
    const connection = connections[0];
    if (!connection) return;
    const result = generateHybridFieldForConnection(connection.id);
    if (result === "Geometry is unavailable for this connection." || result === "The connection tiles are missing.") return;
    started.current = true;
    if (result && result !== "Sensing") setNote(result);
  };
  const beginRef = useRef(begin);
  beginRef.current = begin;
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) begin();
  }, [connections, generateHybridFieldForConnection, loaded]);
  useEffect(() => {
    setHost(anchor.current?.closest<HTMLElement>("[data-hybrid-lab]") ?? null);
  }, []);
  useEffect(() => {
    if (reduced.current || !host || beat >= LAB_BEATS.length) return;
    const step = LAB_BEATS[beat];
    if (step.kind === "follow") {
      let done = false;
      const id = window.setInterval(() => {
        const node = cursor.current;
        const cell = latestMatrixCell(host);
        if (node && cell) placeCursor(node, host, cell);
        const status = host.querySelector(".hybrid-som-mini > .hybrid-units")?.textContent?.trim();
        if (status === "Ready" && !done) {
          done = true;
          setBeat((current) => current + 1);
        }
      }, 280);
      return () => window.clearInterval(id);
    }
    if (step.kind === "scrub") {
      const startedAt = performance.now();
      let frame = 0;
      const tick = (now: number) => {
        const node = cursor.current;
        const range = host.querySelector<HTMLInputElement>(".hybrid-morph-range");
        if (node && range) {
          const max = Number(range.max) || 1;
          placeCursor(node, host, range, Math.max(0, Math.min(1, Number(range.value) / max)));
        }
        if (now - startedAt < step.ms) frame = window.requestAnimationFrame(tick);
        else setBeat((current) => current + 1);
      };
      frame = window.requestAnimationFrame(tick);
      return () => window.cancelAnimationFrame(frame);
    }
    let cancel = false;
    let timer = 0;
    const attempt = () => {
      if (cancel) return;
      if (!host.querySelector(step.selector)) {
        timer = window.setTimeout(attempt, 400);
        return;
      }
      if (step.act === "generate") {
        beginRef.current();
        if (!started.current) {
          timer = window.setTimeout(attempt, 400);
          return;
        }
      }
      if (step.act === "click") {
        const control = host.querySelector<HTMLButtonElement>(step.selector);
        if (!control || control.disabled) {
          timer = window.setTimeout(attempt, 400);
          return;
        }
        control.click();
      }
      setBeat((current) => current + 1);
    };
    timer = window.setTimeout(attempt, step.ms);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [beat, host]);
  useLayoutEffect(() => {
    const node = cursor.current;
    if (!node || !host || reduced.current) return;
    const step = LAB_BEATS[beat];
    if (!step || step.kind === "follow" || step.kind === "scrub") return;
    const target = host.querySelector<HTMLElement>(step.selector);
    if (!target) {
      node.dataset.hidden = "true";
      return;
    }
    node.dataset.press = step.kind === "press" ? "true" : "false";
    placeCursor(node, host, target, 0.42);
  }, [beat, host]);
  return (
    <>
      <span ref={anchor} hidden />
      {note ? <p className={styles.note}>{note}</p> : null}
      <HybridAssembly presentation />
      {host ? createPortal(
        <span ref={cursor} className={styles.pointer} data-hidden="true" aria-hidden="true">
          <svg viewBox="0 0 18 22">
            <path d="M1 1v17l4.6-4.2 3.2 7 3-1.4-3.2-6.8 6.4-.2z" />
          </svg>
        </span>,
        host,
      ) : null}
    </>
  );
}

/** The Hybrid Connection lab, restored from the stored example and run once. Nothing is written to the catalog. */
export function HybridLabPage() {
  return (
    <div className={styles.lab} data-hybrid-lab="">
      <HybridPresentation onReady={() => undefined}>
        <HybridRun />
      </HybridPresentation>
    </div>
  );
}

function CatalogCard({ entry, active, onSelect }: { entry: CatalogEntry; active: boolean; onSelect: () => void }) {
  const { skillModules, ensureArchetypes } = useHybrid();
  const ref = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    ensureArchetypes(entry.tiles.map((tile) => tile.archetypeId));
  }, [ensureArchetypes, entry]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((rows) => {
      setShown(rows.some((row) => row.isIntersecting));
    }, { rootMargin: "120px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const preview = shown ? catalogInspectionMeshes(entry, skillModules).meshes : [];
  return (
    <button ref={ref} type="button" className={styles.card} data-active={active || undefined} onClick={onSelect}>
      <span className={styles.preview}>
        {preview.length > 0 ? <MeshPreview placed={preview} contain turn fitScale={1.12} /> : null}
      </span>
      <b>{entry.id}</b>
      <span>
        <span>{entry.tileCount} tiles</span>
        <span>{entry.arrangement}</span>
      </span>
    </button>
  );
}

export function HybridCatalogPage() {
  const chapter = useHybridCatalog();
  return (
    <HybridState syntheticStorage={false}>
      <div className={styles.catalog}>
        {chapter.note ? <p className={styles.note}>{chapter.note}</p> : null}
        <div className={styles.grid}>
          {chapter.entries.map((entry) => (
            <CatalogCard key={entry.id} entry={entry} active={entry.id === chapter.selectedId} onSelect={() => selectHybrid(entry.id)} />
          ))}
        </div>
      </div>
    </HybridState>
  );
}

export function HybridSitePage() {
  const chapter = useHybridCatalog();
  const [placed, setPlaced] = useState<SiteAssembly | null>(null);
  const [meshes, setMeshes] = useState<Record<string, IsoMesh>>({});
  const selected = chapter.entries.find((entry) => entry.id === chapter.selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setPlaced(null);
      return;
    }
    setPlaced(importAssembly(selected, ORIGIN, "chapter"));
  }, [selected]);

  useEffect(() => {
    if (!placed) return;
    const controller = new AbortController();
    for (const item of assemblyWorldModules(placed)) {
      const provenance = item.provenance;
      if (!provenance.moduleId || provenance.candidateId == null || !provenance.continuationId) continue;
      loadArchetypeMesh({
        archetypeId: provenance.archetypeId,
        candidateId: provenance.candidateId,
        continuationId: provenance.continuationId,
        moduleId: provenance.moduleId,
      }, controller.signal).then((mesh) => {
        if (controller.signal.aborted || !mesh) return;
        setMeshes((current) => (current[provenance.moduleId] ? current : { ...current, [provenance.moduleId]: mesh }));
      }).catch(() => undefined);
    }
    return () => controller.abort();
  }, [placed]);

  const placement = useMemo<SitePlacementModel>(() => {
    const idle = () => undefined;
    return {
      ring: design.ring,
      armedModuleId: null,
      canPlace: false,
      meshes,
      instances: placed ? assemblyWorldModules(placed) : [],
      selectedId: null,
      snap: true,
      showEnvelope: true,
      display: "original",
      displayShift: {},
      links: [],
      previewParts: null,
      previewBridge: null,
      demonstration: [],
      tool: "move",
      warnings: {},
      annotations: [],
      onPlace: idle,
      onAnnotate: idle,
      onSelect: idle,
      onTranslate: idle,
      onRotate: idle,
      onGestureStart: idle,
      onGestureEnd: idle,
      memberEditId: null,
      viewMode: "perspective",
    };
  }, [meshes, placed]);

  return (
    <div className={styles.place}>
      <div className={styles.stage}>
        <SiteViewport
          context={site}
          mode="perspective"
          fit="site"
          rotateView
          showGrid
          showAerial={false}
          frameToken={0}
          placement={placement}
          onReadout={() => undefined}
        />
      </div>
      <aside className={styles.panel}>
        <p className={styles.kicker}>Catalog</p>
        <h2 className={styles.title}>On the site</h2>
        {chapter.note ? <p className={styles.note}>{chapter.note}</p> : null}
        <ol className={styles.list}>
          {chapter.entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" className={styles.row} data-active={entry.id === chapter.selectedId || undefined} onClick={() => selectHybrid(entry.id)}>
                <b>{entry.id}</b>
                <span>
                  <span>{entry.tileCount} tiles</span>
                  <span>{entry.arrangement}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
