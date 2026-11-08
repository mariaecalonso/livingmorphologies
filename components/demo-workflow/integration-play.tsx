"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import contextJson from "@/data/skill5/herald-site.json";
import "@/app/lab/site/site-interface.css";
import { HybridLabPanel, HybridPresentation, SelectedGeometries } from "@/components/home-hybrid-lab-frames";
import { SiteViewport } from "@/components/site/site-viewport";
import type { SitePlacementModel } from "@/components/site/module-field";
import { Missing } from "@/components/demo-workflow/chapter-kit";
import { CONFIGURATIONS, HYBRID } from "@/lib/demo-workflow/chapter-facts";
import type { CatalogEntry } from "@/lib/skill4/catalog";
import { loadFiledFinalCatalog } from "@/lib/skill4/final-catalog";
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
const PARENTS = HYBRID.parents;
const FACE_A = "N";
const FACE_B = "S";

type KeptPlacement = { id: string; tileCount: number; arrangement: string; parents: string };

let keptPlacement: KeptPlacement | null = null;
const keptListeners = new Set<() => void>();

function setKeptPlacement(next: KeptPlacement | null) {
  keptPlacement = next;
  for (const listener of keptListeners) listener();
}

function useKeptPlacement() {
  return useSyncExternalStore(
    (listener) => {
      keptListeners.add(listener);
      return () => keptListeners.delete(listener);
    },
    () => keptPlacement,
    () => null,
  );
}

function useCursor(root: RefObject<HTMLElement | null>, aim: string | null, press: boolean) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const frame = root.current;
    if (!frame || !aim) return;
    let stop = false;
    const place = () => {
      if (stop) return;
      const target = frame.querySelector(aim);
      if (!target) return;
      const box = target.getBoundingClientRect();
      const host = frame.getBoundingClientRect();
      setPoint({ x: box.left - host.left + Math.min(box.width * 0.62, 28), y: box.top - host.top + box.height * 0.55 });
    };
    place();
    const first = requestAnimationFrame(place);
    const later = window.setTimeout(place, 500);
    const settled = window.setTimeout(place, 1400);
    return () => {
      stop = true;
      cancelAnimationFrame(first);
      window.clearTimeout(later);
      window.clearTimeout(settled);
    };
  }, [aim, press, root]);
  if (!point) return null;
  return <i className={styles.cursor} data-press={press || undefined} style={{ left: point.x, top: point.y } as CSSProperties} />;
}

const SELECTION_BEATS = [
  { phase: "modules", aim: `[data-pick="${PARENTS[0]}"]`, pick: [PARENTS[0]], caption: `Fifteen selected modules. ${PARENTS[0]} is the first parent.` },
  { phase: "modules", aim: `[data-pick="${PARENTS[1]}"]`, pick: [...PARENTS], caption: `${PARENTS.join(" and ")} are the stored pair for ${HYBRID.id}.` },
  { phase: "faces", aim: `[aria-label="A face ${FACE_A}"]`, pick: [...PARENTS], caption: `Tile Selection. Face ${FACE_A} on the first module.` },
  { phase: "faces", aim: `[aria-label="B face ${FACE_B}"]`, pick: [...PARENTS], caption: `Face ${FACE_B} on the second module. The stored connection is ${HYBRID.faces}.` },
  { phase: "field", aim: `[data-mock-id="${HYBRID.selected.id}"]`, pick: [...PARENTS], caption: `The modules sit together on the aggregation canvas. Hybrid SOM shows the stored field, with ${HYBRID.selected.id} selected.` },
] as const;

/** Fifteen selected modules, then the stored Hybrid Connection: two parents, their faces, the canvas, and the SOM field. */
export function HybridSelectionPage() {
  return (
    <HybridPresentation onReady={() => undefined}>
      <SelectionPlay />
    </HybridPresentation>
  );
}

function SelectionPlay() {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [press, setPress] = useState(false);
  const beat = SELECTION_BEATS[index] ?? SELECTION_BEATS[SELECTION_BEATS.length - 1];
  useEffect(() => {
    const rootNode = root.current;
    if (!rootNode) return;
    for (const figure of rootNode.querySelectorAll("figure")) {
      const name = figure.querySelector("figcaption")?.textContent?.trim() ?? "";
      if (name) figure.setAttribute("data-pick", name);
      figure.toggleAttribute("data-picked", beat.pick.some((item) => item === name));
    }
  }, [beat]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const jump = window.setTimeout(() => setIndex(SELECTION_BEATS.length - 1), 0);
      return () => window.clearTimeout(jump);
    }
    if (index >= SELECTION_BEATS.length - 1) return;
    const release = window.setTimeout(() => setPress(false), 360);
    const down = window.setTimeout(() => setPress(true), 0);
    const next = window.setTimeout(() => setIndex((value) => value + 1), 3800);
    return () => {
      window.clearTimeout(down);
      window.clearTimeout(release);
      window.clearTimeout(next);
    };
  }, [index]);
  const cursor = useCursor(root, beat.aim, press);
  return (
    <div ref={root} className={styles.page} data-phase={beat.phase}>
      <p className={styles.lead}>{beat.caption}</p>
      <div className={styles.moduleBand}>
        <SelectedGeometries />
      </div>
      {beat.phase === "modules" ? null : (
        <div className={styles.stage}>
          {beat.phase === "faces" ? <HybridLabPanel frame="tile" /> : null}
          {beat.phase === "field" ? (
            <>
              <HybridLabPanel frame="canvas" />
              <HybridLabPanel frame="som" />
            </>
          ) : null}
        </div>
      )}
      {cursor}
    </div>
  );
}

/** Clipping planes, extracted profiles, the intermediate sections, and the sectional stack from the stored connection. */
export function HybridSomPage() {
  return (
    <HybridPresentation onReady={() => undefined}>
      <div className={styles.somPage}>
        <HybridLabPanel frame="clipping" />
        <HybridLabPanel frame="descendant" />
      </div>
    </HybridPresentation>
  );
}

type SlimEntry = { id: string; tileCount: number; arrangement: string; parents: string };

function slimOf(entry: CatalogEntry): SlimEntry {
  return {
    id: entry.id,
    tileCount: entry.tileCount,
    arrangement: entry.arrangement,
    parents: entry.tiles.map((tile) => tile.name).filter(Boolean).join(" + "),
  };
}

const SITE_BEATS = ["browse", "first", "rotate", "reject", "second", "keep"] as const;
type SiteBeat = (typeof SITE_BEATS)[number];

/** Saved hybrid catalog beside the site model. The cursor places one, rejects it, then keeps another. Nothing is written. */
export function SitePlacementPage() {
  const root = useRef<HTMLDivElement>(null);
  const entries = useRef<CatalogEntry[]>([]);
  const [slim, setSlim] = useState<SlimEntry[] | null>(null);
  const [beat, setBeat] = useState<SiteBeat>("browse");
  const [press, setPress] = useState(false);
  const [placed, setPlaced] = useState<SiteAssembly | null>(null);
  const [meshes, setMeshes] = useState<Record<string, IsoMesh>>({});
  const held = useRef(false);

  useEffect(() => {
    let cancel = false;
    loadFiledFinalCatalog().then((rows) => {
      if (cancel) return;
      entries.current = rows;
      setSlim(rows.map(slimOf));
    }).catch(() => {
      if (!cancel) setSlim([]);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const placeEntry = (entry: CatalogEntry | undefined, placementId: string) => {
    if (!entry) {
      setPlaced(null);
      return;
    }
    setPlaced(importAssembly(entry, ORIGIN, placementId));
  };

  useEffect(() => {
    if (!slim || slim.length === 0 || held.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const jump = window.setTimeout(() => {
        const entry = entries.current[Math.min(1, entries.current.length - 1)];
        placeEntry(entry, "keep");
        if (entry) setKeptPlacement(slimOf(entry));
        setBeat("keep");
      }, 0);
      return () => window.clearTimeout(jump);
    }
    const step = SITE_BEATS.indexOf(beat);
    if (step < 0 || step >= SITE_BEATS.length - 1) return;
    const next = SITE_BEATS[step + 1];
    const down = window.setTimeout(() => setPress(true), 0);
    const release = window.setTimeout(() => setPress(false), 360);
    const timer = window.setTimeout(() => {
      if (slim.length < 2 && (next === "reject" || next === "second")) {
        placeEntry(entries.current[0], "keep");
        setKeptPlacement(slim[0] ?? null);
        setBeat("keep");
        return;
      }
      if (next === "first") placeEntry(entries.current[0], "try");
      if (next === "reject") setPlaced(null);
      if (next === "second") placeEntry(entries.current[1], "keep");
      if (next === "keep" && entries.current[1]) setKeptPlacement(slimOf(entries.current[1]));
      setBeat(next);
    }, 4200);
    return () => {
      window.clearTimeout(down);
      window.clearTimeout(release);
      window.clearTimeout(timer);
    };
  }, [beat, slim]);

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

  const activeId = beat === "first" || beat === "rotate" ? slim?.[0]?.id : beat === "second" || beat === "keep" ? (slim?.[1]?.id ?? slim?.[0]?.id) : null;
  const aim = beat === "first" ? `[data-catalog="${slim?.[0]?.id ?? ""}"]`
    : beat === "rotate" ? "[data-decision='rotate']"
    : beat === "reject" ? "[data-decision='reject']"
    : beat === "second" ? `[data-catalog="${slim?.[1]?.id ?? ""}"]`
    : beat === "keep" ? "[data-decision='keep']"
    : null;
  const cursor = useCursor(root, aim, press);
  const caption = !slim ? "Reading the saved hybrid catalog."
    : slim.length === 0 ? "No saved hybrid selection is filed."
    : beat === "browse" ? `${slim.length} saved selections from the hybrid catalog. The site record has no configuration.`
    : beat === "first" || beat === "rotate" ? `${slim[0]?.id} is placed on the site. The model turns so the placement can be read.`
    : beat === "reject" ? `${slim[0]?.id} is set aside. It is not written to the site record.`
    : `${slim[1]?.id ?? slim[0]?.id} stays for this chapter. It is not written to the site record.`;

  const choose = (id: string) => {
    held.current = true;
    const entry = entries.current.find((item) => item.id === id);
    placeEntry(entry, "keep");
    const row = slim?.find((item) => item.id === id);
    if (row) setKeptPlacement(row);
    setBeat("keep");
  };

  return (
    <div ref={root} className={styles.place}>
      <div className={styles.catalogCol}>
        <p className={styles.lead}>{caption}</p>
        {slim && slim.length === 0 ? <Missing>No saved hybrid selection is filed</Missing> : (
          <ol className={styles.catalogList}>
            {(slim ?? []).map((item) => (
              <li key={item.id}>
                <button type="button" data-catalog={item.id} data-active={item.id === activeId || undefined} onClick={() => choose(item.id)}>
                  {item.id}
                  <span>{item.tileCount} · {item.arrangement}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className={styles.siteCol}>
        <div className={styles.siteStage}>
          <SiteViewport
            context={site}
            mode="perspective"
            fit="site"
            rotateView={beat === "rotate"}
            showGrid
            showAerial={false}
            frameToken={0}
            placement={placement}
            onReadout={(readout) => { void readout; }}
          />
        </div>
        <div className={styles.decisions}>
          <span data-decision="rotate" data-on={beat === "rotate" || undefined}>Rotate</span>
          <span data-decision="reject" data-on={beat === "reject" || undefined}>Reject</span>
          <span data-decision="keep" data-on={beat === "keep" || undefined}>Keep</span>
        </div>
      </div>
      {cursor}
    </div>
  );
}

/** The Site Integration matrix. A placement kept in this chapter is named. Occupation is not stored, and no score is added. */
export function ComparativePage() {
  const kept = useKeptPlacement();
  return (
    <div className={styles.eval}>
      <p className={styles.lead}>
        {kept
          ? `${kept.id} · ${kept.tileCount} modules · ${kept.arrangement}. Kept in this chapter only. It is not a saved site configuration.`
          : "No configuration saved. Site occupation and vertical occupation are computed in Site Integration and are not stored."}
      </p>
      <div className={styles.sheetPlain}>
        <span />
        {CONFIGURATIONS.compare.map((column) => (
          <span key={column} className={styles.sheetHead}>{column}</span>
        ))}
        {kept ? (
          <div className={styles.sheetRow}>
            <span className={styles.sheetId}>
              <b>{kept.id}</b>
              {kept.parents || kept.arrangement}
            </span>
            <span className={styles.sheetCell}>
              <b>{kept.tileCount}</b>
              modules
            </span>
            <span className={styles.sheetCell} data-live="">Live</span>
            <span className={styles.sheetCell} data-live="">Live</span>
          </div>
        ) : (
          <Missing>No configuration saved</Missing>
        )}
      </div>
    </div>
  );
}
