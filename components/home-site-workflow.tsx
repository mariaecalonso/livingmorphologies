"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import contextJson from "@/data/skill5/herald-site.json";
import { ConfigurationCatalog } from "@/components/site/configuration-catalog";
import { AssemblyGlassPreview, ModuleGlassPreview, assemblyPreviewRadius, clayPreviewRadius } from "@/components/site/site-workspace";
import { SiteViewport } from "@/components/site/site-viewport";
import type { SitePlacementModel } from "@/components/site/module-field";
import { closeWorkflowPanel, markManualHold, PresentControls, usePresentClock, useRevealed } from "@/components/workflow-present";
import { boardLayoutSignature } from "@/lib/home-workflow-camera";
import {
  catalogServerSnapshot,
  finalCatalogServerSnapshot,
  hiddenFinalServerSnapshot,
  readCatalog,
  readFinalCatalog,
  readHiddenFinal,
  readSelectedFinal,
  selectedFinalServerSnapshot,
  subscribeCatalog,
  subscribeFinalCatalog,
  subscribeHiddenFinal,
  subscribeSelectedFinal,
} from "@/lib/skill4/catalog-store";
import { siteLibraryEntries, type CatalogEntry } from "@/lib/skill4/catalog";
import { loadFiledFinalCatalog, mergeFinalCatalog } from "@/lib/skill4/final-catalog";
import { PROGRAM_LABEL, SITE_ARCHETYPES, SITE_PROGRAMS } from "@/lib/skill5/catalog";
import { isSkill5MockAssembly } from "@/lib/skill5/mock-assemblies";
import { assemblyWorldModules } from "@/lib/skill5/assembly";
import { designSiteFromParcel } from "@/lib/skill5/design-site";
import { SITE_GRID_FEET } from "@/lib/skill5/grid";
import { loadArchetypeMesh } from "@/lib/skill5/load-module";
import type { SiteConfiguration } from "@/lib/skill5/configurations";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import type { IsoMesh } from "@/lib/scan/isomesh";
import "../app/lab/site/site-interface.css";

const site = contextJson as SiteContext;
const design = designSiteFromParcel(site.site.ring);
const feet = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
const EAST_WEST = feet(design.widthFeet);
const NORTH_SOUTH = feet(design.depthFeet);
const PREVIEW_COUNT = 5;
const ZOOM_FRAMES = ["2", "3", "4", "5"] as const;
type ZoomId = "modules" | "assemblies" | "grid" | "comparison";

const ZOOM_FOR: Record<string, ZoomId> = { "2": "modules", "3": "assemblies", "4": "grid", "5": "comparison" };
const ZOOM_TITLE: Record<ZoomId, string> = {
  modules: "Module Library",
  assemblies: "Assembly Library",
  grid: "Grid Placement",
  comparison: "Comparison",
};

type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number; w: number };
type Slot = { left: number; top: number; width: number; height: number };
type Layout = {
  width: number;
  height: number;
  slots: Slot[];
  leaders: { x: number; top: number; bottom: number }[];
  feedback: string;
  client: { x: number; y: number };
};

function previewOf(program: (typeof SITE_PROGRAMS)[number]) {
  return SITE_ARCHETYPES.find((entry) => entry.program === program) ?? null;
}

const PREVIEWS = SITE_PROGRAMS.map(previewOf).filter((entry): entry is NonNullable<typeof entry> => entry != null);
const MODULE_CATALOG = SITE_PROGRAMS.flatMap((program) => SITE_ARCHETYPES.filter((entry) => entry.program === program));

function withoutMocks(entries: readonly CatalogEntry[]) {
  return entries.filter((entry) => !isSkill5MockAssembly(entry.id));
}

export function useMeshes(entries: readonly { moduleId: string; archetypeId: string; candidateId: number; continuationId: string }[]) {
  const [meshes, setMeshes] = useState<Record<string, IsoMesh | "missing">>({});
  const key = entries.map((entry) => entry.moduleId).join("|");
  const list = useRef(entries);
  list.current = entries;
  useEffect(() => {
    const cancel = new AbortController();
    for (const entry of list.current) {
      loadArchetypeMesh(entry, cancel.signal).then((mesh) => {
        if (cancel.signal.aborted) return;
        setMeshes((current) => ({ ...current, [entry.moduleId]: mesh ?? "missing" }));
      }).catch(() => {
        if (cancel.signal.aborted) return;
        setMeshes((current) => ({ ...current, [entry.moduleId]: "missing" }));
      });
    }
    return () => cancel.abort();
  }, [key]);
  return meshes;
}

function boundsOf(rings: readonly (readonly XZ[])[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const ring of rings) {
    for (const [x, z] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

function drawRing(context2d: CanvasRenderingContext2D, ring: readonly XZ[], project: (x: number, z: number) => [number, number], close = true) {
  if (ring.length < 2) return;
  context2d.beginPath();
  ring.forEach(([x, z], index) => {
    const [px, py] = project(x, z);
    if (index === 0) context2d.moveTo(px, py);
    else context2d.lineTo(px, py);
  });
  if (close) context2d.closePath();
}

function PlanCanvas({ mode }: { mode: "context" | "grid" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context2d = canvas.getContext("2d");
      if (!context2d) return;
      context2d.setTransform(ratio, 0, 0, ratio, 0, 0);
      context2d.fillStyle = "#000000";
      context2d.fillRect(0, 0, width, height);
      const pad = 10;
      const parcel = boundsOf([site.site.ring]);
      const bounds = mode === "context"
        ? {
            minX: parcel.minX - 380,
            maxX: parcel.maxX + 420,
            minZ: parcel.minZ - 180,
            maxZ: parcel.maxZ + 180,
          }
        : boundsOf([design.ring]);
      const spanX = Math.max(1, bounds.maxX - bounds.minX);
      const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
      const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanZ);
      const ox = (width - spanX * scale) / 2;
      const oy = (height - spanZ * scale) / 2;
      const project = (x: number, z: number): [number, number] => [
        ox + (x - bounds.minX) * scale,
        height - (oy + (z - bounds.minZ) * scale),
      ];
      if (mode === "context") {
        drawRing(context2d, site.water.ring, project);
        context2d.fillStyle = "rgba(255,255,255,0.08)";
        context2d.fill();
        context2d.strokeStyle = "rgba(255,255,255,0.28)";
        context2d.lineWidth = 1;
        for (const road of site.roads) {
          drawRing(context2d, road.path, project, false);
          context2d.stroke();
        }
        context2d.fillStyle = "rgba(255,255,255,0.34)";
        for (const building of site.buildings) {
          drawRing(context2d, building.ring, project);
          context2d.fill();
        }
        drawRing(context2d, site.coastline.path, project, false);
        context2d.strokeStyle = "rgba(255,255,255,0.55)";
        context2d.stroke();
      }
      if (mode === "grid") {
        context2d.strokeStyle = "rgba(255,255,255,0.18)";
        context2d.lineWidth = 1;
        const [minX, minZ] = design.ring[0];
        const [maxX, maxZ] = design.ring[2];
        for (let x = Math.ceil(minX / SITE_GRID_FEET) * SITE_GRID_FEET; x <= maxX; x += SITE_GRID_FEET) {
          const major = Math.round(x / SITE_GRID_FEET) % 5 === 0;
          context2d.strokeStyle = major ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)";
          context2d.beginPath();
          const [x0, y0] = project(x, minZ);
          const [, y1] = project(x, maxZ);
          context2d.moveTo(x0, y0);
          context2d.lineTo(x0, y1);
          context2d.stroke();
        }
        for (let z = Math.ceil(minZ / SITE_GRID_FEET) * SITE_GRID_FEET; z <= maxZ; z += SITE_GRID_FEET) {
          const major = Math.round(z / SITE_GRID_FEET) % 5 === 0;
          context2d.strokeStyle = major ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)";
          context2d.beginPath();
          const [x0, y0] = project(minX, z);
          const [x1] = project(maxX, z);
          context2d.moveTo(x0, y0);
          context2d.lineTo(x1, y0);
          context2d.stroke();
        }
      }
      drawRing(context2d, site.site.ring, project);
      context2d.strokeStyle = "#ffffff";
      context2d.lineWidth = mode === "context" ? 1.4 : 1.2;
      context2d.stroke();
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [mode]);
  return <canvas ref={ref} className="wf-site-plan" aria-label={mode === "context" ? "Site context plan" : "Placement grid"} />;
}

function MeasureDiagram() {
  const eastShare = design.widthFeet / design.depthFeet;
  const rectWidth = 18;
  const rectHeight = rectWidth * (design.depthFeet / design.widthFeet);
  return (
    <div className="wf-site-measure" role="img" aria-label={`Design site ${NORTH_SOUTH} feet north to south, ${EAST_WEST} feet east to west`}>
      <svg className="wf-site-north" viewBox={`0 0 36 ${rectHeight + 16}`} aria-hidden="true">
        <path d={`M18 1 L21.2 7 H19.4 V11 H16.6 V7 H14.8 Z`} fill="#ffffff" />
        <text x="18" y="6.2" textAnchor="middle" fill="#49d7de" fontSize="5">N</text>
        <rect x={(36 - rectWidth) / 2} y="14" width={rectWidth} height={rectHeight} fill="none" stroke="#ffffff" strokeWidth="1" />
      </svg>
      <div className="wf-opt-eval">
        <dl>
          <div style={{ "--tone": "#ffffff", "--share": "100%" } as React.CSSProperties}>
            <dt>North–south</dt>
            <dd>{NORTH_SOUTH} ft</dd>
            <i />
          </div>
          <div style={{ "--tone": "#49d7de", "--share": `${eastShare * 100}%` } as React.CSSProperties}>
            <dt>East–west</dt>
            <dd>{EAST_WEST} ft</dd>
            <i />
          </div>
        </dl>
      </div>
    </div>
  );
}

/** Draws the library models larger in the glass. One shared radius keeps their proportions. */
function panelFit(radius: number | undefined, factor: number) {
  return radius && radius > 0 ? radius * factor : undefined;
}

function moduleScale(meshes: Record<string, IsoMesh | "missing">, ids: readonly string[]) {
  let radius = 0;
  for (const id of ids) {
    const mesh = readyMesh(meshes[id]);
    if (mesh) radius = Math.max(radius, clayPreviewRadius(mesh));
  }
  return radius > 0 ? radius : undefined;
}

function ModuleRow({ meshes, spin = false, fitRadius }: { meshes: Record<string, IsoMesh | "missing">; spin?: boolean; fitRadius?: number }) {
  return (
    <div className="wf-site-row">
      {PREVIEWS.map((entry) => {
        const stored = meshes[entry.moduleId];
        const mesh = stored && stored !== "missing" ? stored : null;
        return (
          <figure key={entry.moduleId} className="wf-site-glass">
            {mesh ? <ModuleGlassPreview mesh={mesh} spin={spin} fitRadius={fitRadius} /> : <figcaption>{stored === "missing" ? "Mesh not stored" : "Reading"}</figcaption>}
            <figcaption>{PROGRAM_LABEL[entry.program ?? "unassigned"]}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function readyMesh(stored: IsoMesh | "missing" | undefined) {
  return stored && stored !== "missing" ? stored : null;
}

function GridStage({ open }: { open: boolean }) {
  const [configurations, setConfigurations] = useState<SiteConfiguration[] | null>(null);
  useEffect(() => {
    if (!open) return;
    const cancel = new AbortController();
    fetch("/api/site/configurations", { signal: cancel.signal })
      .then((response) => response.json())
      .then((body: { configurations?: SiteConfiguration[] }) => {
        if (!cancel.signal.aborted) setConfigurations(body.configurations ?? []);
      })
      .catch(() => {
        if (!cancel.signal.aborted) setConfigurations([]);
      });
    return () => cancel.abort();
  }, [open]);
  const placed = useMemo(() => {
    const entry = configurations?.[0];
    if (!entry) return [];
    return [...entry.modules, ...entry.assemblies.flatMap((assembly) => assemblyWorldModules(assembly))];
  }, [configurations]);
  const sources = useMemo(() => {
    const ids = new Set(placed.map((item) => item.provenance.moduleId));
    return SITE_ARCHETYPES.filter((entry) => ids.has(entry.moduleId));
  }, [placed]);
  const meshes = useMeshes(open ? sources : []);
  const loaded = useMemo(() => {
    const next: Record<string, IsoMesh> = {};
    for (const [id, mesh] of Object.entries(meshes)) {
      if (mesh !== "missing") next[id] = mesh;
    }
    return next;
  }, [meshes]);
  const placement = useMemo<SitePlacementModel | null>(() => {
    if (!configurations) return null;
    const idle = () => undefined;
    return {
      ring: design.ring,
      armedModuleId: null,
      canPlace: false,
      meshes: loaded,
      instances: placed,
      selectedId: null,
      snap: true,
      showEnvelope: false,
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
  }, [configurations, loaded, placed]);
  const saved = configurations?.[0];
  return (
    <div className="wf-site-stage">
      {open && placement ? (
        <SiteViewport
          context={site}
          mode="perspective"
          fit="site"
          showGrid
          showAerial={false}
          frameToken={0}
          placement={placement}
          onReadout={() => undefined}
        />
      ) : null}
      <p className="wf-site-stage-note">
        {configurations == null
          ? "Reading saved configurations."
          : saved
            ? `${saved.name}. ${placed.length} placed ${placed.length === 1 ? "piece" : "pieces"}. Grid ${SITE_GRID_FEET} ft.`
            : `No saved configuration. Grid ${SITE_GRID_FEET} ft.`}
      </p>
    </div>
  );
}

function SitePanel({ id, open, origin, sequence, onClose, modules, assemblies }: {
  id: ZoomId | null;
  open: boolean;
  origin: { x: number; y: number } | null;
  sequence: boolean;
  onClose: () => void;
  modules: Record<string, IsoMesh | "missing">;
  assemblies: { entries: CatalogEntry[]; meshes: Record<string, IsoMesh | "missing">; note: string };
}) {
  const clock = usePresentClock(sequence && open, onClose);
  const shown = assemblies.entries.slice(0, PREVIEW_COUNT * 2);
  return (
    <section
      className="wf-opt-zoom"
      data-open={open || undefined}
      data-site-panel={id ?? undefined}
      aria-hidden={!open}
      onPointerDown={clock.hold}
      style={origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : undefined}
    >
      <p className="wf-opt-trail">Site Integration <span aria-hidden="true">›</span> {id ? ZOOM_TITLE[id] : ""}</p>
      <div className="wf-site-panel">
        {open && id === "modules" ? (
          <div className="wf-site-catalog">
            {MODULE_CATALOG.map((entry) => {
              const mesh = readyMesh(modules[entry.moduleId]);
              return (
                <figure key={entry.moduleId} className="wf-site-glass">
                  {mesh ? <ModuleGlassPreview mesh={mesh} spin fitRadius={panelFit(clayPreviewRadius(mesh), 0.86)} /> : <figcaption>{modules[entry.moduleId] === "missing" ? "Mesh not stored" : "Reading"}</figcaption>}
                  <figcaption>{entry.name}</figcaption>
                </figure>
              );
            })}
          </div>
        ) : null}
        {open && id === "assemblies" ? (
          shown.length === 0 ? (
            <p className="wf-frame-body wf-site-empty">No assemblies are selected in Hybrid Connection. Select one there to import it here.</p>
          ) : (
            <div className="wf-site-assembly">
              <p className="wf-frame-body">{assemblies.note}</p>
              <div
                className="wf-site-assembly-grid"
                style={{ gridTemplateColumns: `repeat(${Math.min(5, shown.length)}, max-content)` }}
              >
                {shown.map((entry) => (
                  <figure key={entry.id} className="wf-site-glass">
                    <AssemblyGlassPreview entry={entry} meshes={assemblies.meshes} spin fitRadius={panelFit(assemblyPreviewRadius(entry, assemblies.meshes), 0.82)} />
                    <figcaption>{entry.id}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )
        ) : null}
        {id === "grid" ? <GridStage open={open && id === "grid"} /> : null}
        {open && id === "comparison" ? <ConfigurationCatalog /> : null}
      </div>
      <PresentControls run={sequence && open} clock={clock} onClose={onClose} open={open} />
    </section>
  );
}

export function SiteWorkflowLayer() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const revealed = useRevealed(lit);
  const litRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState<ZoomId | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [sequence, setSequence] = useState(false);
  const stored = useSyncExternalStore(subscribeCatalog, readCatalog, catalogServerSnapshot);
  const savedFinal = useSyncExternalStore(subscribeFinalCatalog, readFinalCatalog, finalCatalogServerSnapshot);
  const hiddenFinal = useSyncExternalStore(subscribeHiddenFinal, readHiddenFinal, hiddenFinalServerSnapshot);
  const selectedFinal = useSyncExternalStore(subscribeSelectedFinal, readSelectedFinal, selectedFinalServerSnapshot);
  const [filedFinal, setFiledFinal] = useState<CatalogEntry[]>([]);
  useEffect(() => {
    let cancel = false;
    void loadFiledFinalCatalog().then((rows) => {
      if (!cancel) setFiledFinal(rows);
    });
    return () => {
      cancel = true;
    };
  }, []);
  const selectedAssemblies = useMemo(() => {
    const working = withoutMocks(siteLibraryEntries(stored));
    const ids = new Set(working.map((entry) => entry.id));
    const chosen = new Set(selectedFinal);
    const filed = withoutMocks(mergeFinalCatalog(filedFinal, savedFinal, hiddenFinal)).filter((entry) => chosen.has(entry.id) && !ids.has(entry.id));
    return [...filed, ...working];
  }, [filedFinal, hiddenFinal, savedFinal, selectedFinal, stored]);
  const assemblies = selectedAssemblies.length > 0 ? selectedAssemblies : withoutMocks(mergeFinalCatalog(filedFinal, savedFinal, hiddenFinal));
  const assemblyNote = selectedAssemblies.length > 0
    ? `${selectedAssemblies.length} selected in Hybrid Connection.`
    : assemblies.length > 0
      ? `${assemblies.length} assemblies from the Skill 4 catalog.`
      : "No Skill 4 assemblies are filed.";
  const libraryMeshes = useMeshes(SITE_ARCHETYPES);
  const previewRadius = moduleScale(libraryMeshes, PREVIEWS.map((entry) => entry.moduleId));
  const assemblySources = useMemo(() => {
    const ids = new Set(assemblies.slice(0, PREVIEW_COUNT * 2).flatMap((entry) => entry.tiles.map((tile) => tile.moduleId)));
    return SITE_ARCHETYPES.filter((entry) => ids.has(entry.moduleId));
  }, [assemblies]);
  const assemblyMeshes = useMeshes(assemblySources);
  const assemblyRadius = useMemo(() => {
    const radius = assemblies.slice(0, PREVIEW_COUNT * 2).reduce((largest, entry) => Math.max(largest, assemblyPreviewRadius(entry, assemblyMeshes)), 0);
    return radius > 0 ? radius : undefined;
  }, [assemblies, assemblyMeshes]);
  const boardOf = () => svgRef.current?.parentElement ?? null;
  const closeZoom = () => {
    closeWorkflowPanel(boardOf());
    setSequence(false);
    setZoom(null);
  };

  useEffect(() => {
    const board = svgRef.current?.parentElement;
    if (!board) return;
    const tracked = () => board.querySelectorAll<HTMLElement>(".wf-board > span.wf-frame[data-frame]");
    let signature = "";
    const measure = () => {
      signature = boardLayoutSignature(board, tracked());
      const width = board.clientWidth;
      const height = board.clientHeight;
      const box = board.getBoundingClientRect();
      if (width < 2 || height < 2 || box.width < 2) return;
      const scale = box.width / width;
      const local = (node: Element): Box => {
        const rect = node.getBoundingClientRect();
        const l = (rect.left - box.left) / scale;
        const t = (rect.top - box.top) / scale;
        const r = l + rect.width / scale;
        const b = t + rect.height / scale;
        return { l, t, r, b, cx: (l + r) / 2, cy: (t + b) / 2, w: r - l };
      };
      const frames = [...tracked()].map(local);
      if (frames.length < 6) return;
      const ceiling = height * 0.06;
      const gap = height * 0.04;
      const slots = frames.map((frame) => {
        const room = Math.max(36, frame.t - gap - ceiling);
        const slotHeight = Math.min(room, frame.w * 0.92);
        return { left: frame.l, top: frame.t - gap - slotHeight, width: frame.w, height: slotHeight };
      });
      const first = frames[0];
      const last = frames[5];
      const lowest = Math.max(...frames.map((frame) => frame.b));
      const y = Math.min(height * 0.93, lowest + height * 0.11);
      setLayout({
        width,
        height,
        slots,
        leaders: frames.map((frame, index) => ({ x: frame.cx, top: slots[index].top + slots[index].height, bottom: frame.t })),
        feedback: `M ${last.cx} ${last.b} L ${last.cx} ${y} L ${first.cx} ${y} L ${first.cx} ${first.b}`,
        client: { x: (first.cx + last.cx) / 2, y },
      });
    };
    measure();
    void document.fonts.ready.then(measure);
    const resize = new ResizeObserver(measure);
    resize.observe(board);
    tracked().forEach((node) => resize.observe(node));
    const follow = window.setInterval(() => {
      if (boardLayoutSignature(board, tracked()) !== signature) measure();
    }, 150);
    const read = () => {
      const node = board.querySelector<HTMLElement>(".wf-frame.is-lit[data-frame]");
      const next = node ? Number(node.dataset.frame) : null;
      if (next == null || !Number.isFinite(next) || next === litRef.current) return;
      litRef.current = next;
      setLit(next);
    };
    const watch = new MutationObserver(read);
    watch.observe(board, { subtree: true, attributes: true, attributeFilter: ["class"] });
    const clicks = ZOOM_FRAMES.flatMap((frame) => {
      const node = board.querySelector<HTMLElement>(`.wf-frame[data-frame="${frame}"]`);
      if (!node) return [];
      const open = (event: MouseEvent) => {
        event.stopPropagation();
        setSequence(false);
        markManualHold(board);
        const box = board.getBoundingClientRect();
        const rect = node.getBoundingClientRect();
        const scale = box.width / board.clientWidth || 1;
        setOrigin({ x: (rect.left + rect.width / 2 - box.left) / scale, y: (rect.top + rect.height / 2 - box.top) / scale });
        setZoom(ZOOM_FOR[frame]);
      };
      node.setAttribute("data-zoomable", "");
      node.addEventListener("click", open);
      return [{ node, open }];
    });
    const onArrive = (event: Event) => {
      const frame = String((event as CustomEvent<{ frame: string }>).detail.frame);
      const next = ZOOM_FOR[frame];
      if (!next) return;
      const node = board.querySelector<HTMLElement>(`[data-frame="${frame}"]`);
      if (!node) return;
      const box = board.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      const scale = box.width / board.clientWidth || 1;
      setOrigin({ x: (rect.left + rect.width / 2 - box.left) / scale, y: (rect.top + rect.height / 2 - box.top) / scale });
      setSequence(true);
      setZoom(next);
    };
    board.addEventListener("wf-frame-arrive", onArrive);
    return () => {
      window.clearInterval(follow);
      resize.disconnect();
      watch.disconnect();
      clicks.forEach((item) => item.node.removeEventListener("click", item.open));
      board.removeEventListener("wf-frame-arrive", onArrive);
    };
  }, []);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeZoom();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoom]);

  const previewAssembly = assemblies[0] ?? null;

  return (
    <>
      <p className="wf-site-note">Example shown: One Herald Plaza</p>
      <svg ref={svgRef} className="wf-site-links" viewBox={layout ? `0 0 ${layout.width} ${layout.height}` : undefined} aria-hidden="true">
        {layout ? (
          <>
            <path className="wf-site-feedback" d={layout.feedback} />
            {layout.leaders.map((leader, index) => (
              <path key={index} className="wf-opt-leader" data-on={revealed >= index || undefined} d={`M ${leader.x} ${leader.top} L ${leader.x} ${leader.bottom}`} />
            ))}
          </>
        ) : null}
      </svg>
      {layout ? layout.slots.map((slot, index) => (
        <div
          key={index}
          className="wf-opt-visual"
          data-on={revealed >= index || undefined}
          style={{
            left: `${(slot.left / layout.width) * 100}%`,
            top: `${(slot.top / layout.height) * 100}%`,
            width: `${(slot.width / layout.width) * 100}%`,
            height: `${(slot.height / layout.height) * 100}%`,
          }}
        >
          <div className="wf-opt-visual-play">
            {index === 0 ? <PlanCanvas mode="context" /> : null}
            {index === 1 ? <MeasureDiagram /> : null}
            {index === 2 ? <ModuleRow meshes={libraryMeshes} spin fitRadius={previewRadius} /> : null}
            {index === 3 ? (
              previewAssembly ? (
                <figure className="wf-site-glass">
                  <AssemblyGlassPreview entry={previewAssembly} meshes={assemblyMeshes} spin fitRadius={assemblyRadius} />
                  <figcaption>{previewAssembly.id}</figcaption>
                </figure>
              ) : <p className="wf-frame-body">None selected</p>
            ) : null}
            {index === 4 ? <PlanCanvas mode="grid" /> : null}
            {index === 5 ? <p className="wf-frame-body">Saved configurations</p> : null}
          </div>
        </div>
      )) : null}
      {layout ? (
        <div className="wf-site-client" style={{ left: `${(layout.client.x / layout.width) * 100}%`, top: `${(layout.client.y / layout.height) * 100}%` }}>
          <p className="wf-proto-label">Client</p>
          <p className="wf-frame-body">Requirements return to the site. This is not a search.</p>
        </div>
      ) : null}
      <SitePanel
        id={zoom}
        open={zoom != null}
        origin={origin}
        sequence={sequence}
        onClose={closeZoom}
        modules={libraryMeshes}
        assemblies={{ entries: assemblies, meshes: assemblyMeshes, note: assemblyNote }}
      />
    </>
  );
}
