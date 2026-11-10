"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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

function HybridRun() {
  const { connections, loaded, generateHybridFieldForConnection } = useHybrid();
  const started = useRef(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    const connection = connections[0];
    if (!connection) return;
    const result = generateHybridFieldForConnection(connection.id);
    if (result === "Geometry is unavailable for this connection." || result === "The connection tiles are missing.") return;
    started.current = true;
    if (result && result !== "Sensing") setNote(result);
  }, [connections, generateHybridFieldForConnection, loaded]);
  return (
    <>
      {note ? <p className={styles.note}>{note}</p> : null}
      <HybridAssembly presentation />
    </>
  );
}

/** The Hybrid Connection lab, restored from the stored example and run once. Nothing is written to the catalog. */
export function HybridLabPage() {
  return (
    <div className={styles.lab}>
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
