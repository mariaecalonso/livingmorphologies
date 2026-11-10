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
import { TYPOLOGIES } from "@/lib/catalog";
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
  | { kind: "aim" | "press"; selector: string; ms: number; act?: "click" }
  | { kind: "ready"; tile: "A" | "B" | null }
  | { kind: "orbit"; ms: number }
  | { kind: "follow"; }
  | { kind: "scrub"; ms: number };

type OpenMenu = { tile: "A" | "B"; typologyId: string | null };

const ROW = 520;
const CLICK = 260;

/** The cursor selects both models, their surfaces, turns the 3D view, then starts the SOM. */
const LAB_BEATS: LabBeat[] = [
  { kind: "ready", tile: "A" },
  { kind: "aim", selector: '[data-menu-trigger="A"]', ms: 640 },
  { kind: "press", selector: '[data-menu-trigger="A"]', ms: CLICK, act: "click" },
  { kind: "aim", selector: '[data-typology="lobby"]', ms: ROW },
  { kind: "aim", selector: '[data-typology="workspace"]', ms: ROW },
  { kind: "aim", selector: '[data-typology="gathering"]', ms: ROW },
  { kind: "press", selector: '[data-typology="gathering"]', ms: CLICK, act: "click" },
  { kind: "aim", selector: '[data-archetype="stepped-amphitheater"]', ms: ROW },
  { kind: "aim", selector: '[data-archetype="void-field"]', ms: ROW },
  { kind: "press", selector: '[data-archetype="void-field"]', ms: CLICK, act: "click" },
  { kind: "ready", tile: "B" },
  { kind: "aim", selector: '[data-menu-trigger="B"]', ms: 640 },
  { kind: "press", selector: '[data-menu-trigger="B"]', ms: CLICK, act: "click" },
  { kind: "aim", selector: '[data-typology="lobby"]', ms: ROW },
  { kind: "aim", selector: '[data-typology="workspace"]', ms: ROW },
  { kind: "aim", selector: '[data-typology="gathering"]', ms: ROW },
  { kind: "press", selector: '[data-typology="gathering"]', ms: CLICK, act: "click" },
  { kind: "aim", selector: '[data-archetype="stepped-amphitheater"]', ms: ROW },
  { kind: "aim", selector: '[data-archetype="void-field"]', ms: ROW },
  { kind: "aim", selector: '[data-archetype="inserted-horizontal-plate"]', ms: ROW },
  { kind: "press", selector: '[data-archetype="inserted-horizontal-plate"]', ms: CLICK, act: "click" },
  { kind: "ready", tile: null },
  { kind: "aim", selector: '[aria-label="A face N"]', ms: 420 },
  { kind: "press", selector: '[aria-label="A face N"]', ms: 220, act: "click" },
  { kind: "aim", selector: '[aria-label="B face S"]', ms: 420 },
  { kind: "press", selector: '[aria-label="B face S"]', ms: 220, act: "click" },
  { kind: "orbit", ms: 2200 },
  { kind: "aim", selector: ".hybrid-generate", ms: 560 },
  { kind: "press", selector: ".hybrid-generate", ms: 320, act: "click" },
  { kind: "follow" },
  { kind: "aim", selector: '[data-mock-id="H10"]', ms: 480 },
  { kind: "press", selector: '[data-mock-id="H10"]', ms: 220, act: "click" },
  { kind: "aim", selector: ".hybrid-morph-toggle", ms: 480 },
  { kind: "press", selector: ".hybrid-morph-toggle", ms: 220, act: "click" },
  { kind: "scrub", ms: 3200 },
  { kind: "aim", selector: ".hybrid-validate-run", ms: 480 },
  { kind: "press", selector: ".hybrid-validate-run", ms: 220, act: "click" },
];

function placeCursor(cursor: HTMLElement, host: HTMLElement, target: HTMLElement, along = 0.42, down = 0.62) {
  const box = host.getBoundingClientRect();
  const scale = box.width / host.offsetWidth || 1;
  const rect = target.getBoundingClientRect();
  const x = (rect.left - box.left + rect.width * along) / scale;
  const y = (rect.top - box.top + rect.height * down) / scale;
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  cursor.dataset.hidden = "false";
}

function TileSelect({
  tile,
  menu,
  onOpen,
  onTypology,
  onArchetype,
}: {
  tile: "A" | "B";
  menu: OpenMenu | null;
  onOpen: () => void;
  onTypology: (id: string) => void;
  onArchetype: (id: string) => void;
}) {
  const open = menu?.tile === tile;
  const typology = open ? TYPOLOGIES.find((item) => item.id === menu.typologyId) ?? null : null;
  return (
    <div className={styles.select}>
      <button type="button" className={styles.trigger} data-menu-trigger={tile} onClick={onOpen}>
        {typology ? typology.label : "Select geometry"}
      </button>
      {open ? (
        <ul className={styles.menu} data-archetype-menu="">
          {typology
            ? typology.archetypes.map((archetype) => (
              <li key={archetype.id}>
                <button type="button" data-archetype={archetype.id} onClick={() => onArchetype(archetype.id)}>
                  {archetype.name}
                </button>
              </li>
            ))
            : TYPOLOGIES.map((item) => (
              <li key={item.id}>
                <button type="button" data-typology={item.id} onClick={() => onTypology(item.id)}>
                  {item.label}
                </button>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

function HybridRun() {
  const { connections, loaded, generateHybridFieldForConnection, chooseArchetype } = useHybrid();
  const started = useRef(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [beat, setBeat] = useState(0);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [selecting, setSelecting] = useState<"A" | "B" | null>(null);
  const chooseRef = useRef(chooseArchetype);
  chooseRef.current = chooseArchetype;
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
    if (step.kind === "ready") {
      if (step.tile === "A") {
        chooseRef.current("A", "");
        chooseRef.current("B", "");
      }
      setMenu(null);
      setSelecting(step.tile);
      setBeat((current) => current + 1);
      return;
    }
    if (step.kind === "orbit") {
      let cancel = false;
      let timer = 0;
      let frame = 0;
      const start = () => {
        if (cancel) return;
        const canvas = host.querySelector<HTMLCanvasElement>(".hybrid-stage-canvas");
        const node = cursor.current;
        if (!canvas || !node) {
          timer = window.setTimeout(start, 400);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const lift = 72;
        const turn = 170;
        const x0 = rect.left + rect.width * 0.46;
        const y0 = rect.top + rect.height * 0.56;
        const pointerId = 7;
        const point = (type: string, x: number, y: number, buttons: number) => {
          canvas.dispatchEvent(new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId,
            clientX: x,
            clientY: y,
            pointerType: "mouse",
            isPrimary: true,
            buttons,
          }));
        };
        const show = (x: number, y: number) => {
          placeCursor(node, host, canvas, (x - rect.left) / rect.width, (y - rect.top) / rect.height);
        };
        show(x0, y0);
        timer = window.setTimeout(() => {
          if (cancel) return;
          canvas.parentElement?.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: 220,
            clientX: x0,
            clientY: y0,
          }));
          node.dataset.drag = "true";
          node.dataset.press = "true";
          point("pointerdown", x0, y0, 1);
          const startedAt = performance.now();
          const tick = (now: number) => {
            if (cancel) return;
            const t = Math.min(1, (now - startedAt) / step.ms);
            const lower = Math.min(1, t / 0.34);
            const turnT = t < 0.46 ? 0 : Math.min(1, (t - 0.46) / 0.54);
            const x = x0 + turn * turnT;
            const y = y0 - lift * lower;
            point("pointermove", x, y, 1);
            show(x, y);
            if (t < 1) frame = window.requestAnimationFrame(tick);
            else {
              point("pointerup", x0 + turn, y0 - lift, 0);
              node.dataset.press = "false";
              node.dataset.drag = "false";
              setBeat((current) => current + 1);
            }
          };
          frame = window.requestAnimationFrame(tick);
        }, 420);
      };
      start();
      return () => {
        cancel = true;
        window.clearTimeout(timer);
        window.cancelAnimationFrame(frame);
        if (cursor.current) cursor.current.dataset.drag = "false";
      };
    }
    if (step.kind === "follow") {
      let done = false;
      let sawGenerating = false;
      const node = cursor.current;
      if (node) node.dataset.press = "false";
      const id = window.setInterval(() => {
        const button = host.querySelector<HTMLElement>(".hybrid-generate");
        if (node && button) placeCursor(node, host, button, 0.55, 0.55);
        const status = host.querySelector(".hybrid-som-mini > .hybrid-units")?.textContent?.trim();
        if (status === "Generating") sawGenerating = true;
        if (sawGenerating && status === "Ready" && !done) {
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
    if (!step || (step.kind !== "aim" && step.kind !== "press")) return;
    const target = host.querySelector<HTMLElement>(step.selector);
    if (!target) {
      node.dataset.hidden = "true";
      return;
    }
    const menuRow = step.selector.includes("data-menu-trigger") || step.selector.includes("data-typology") || step.selector.includes("data-archetype");
    host.querySelectorAll<HTMLElement>("[data-typology], [data-archetype]").forEach((item) => {
      item.dataset.lit = item === target ? "true" : "false";
    });
    node.dataset.press = step.kind === "press" ? "true" : "false";
    placeCursor(node, host, target, menuRow ? 0.2 : 0.42, menuRow ? 0.55 : 0.62);
  }, [beat, host]);
  return (
    <>
      <span ref={anchor} hidden />
      {note ? <p className={styles.note}>{note}</p> : null}
      <HybridAssembly presentation />
      {host && selecting ? createPortal(
        <TileSelect
          tile={selecting}
          menu={menu}
          onOpen={() => setMenu({ tile: selecting, typologyId: null })}
          onTypology={(id) => setMenu({ tile: selecting, typologyId: id })}
          onArchetype={(id) => {
            chooseRef.current(selecting, id);
            setMenu(null);
          }}
        />,
        host.querySelector(`[data-tile="${selecting}"]`) ?? host,
      ) : null}
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
