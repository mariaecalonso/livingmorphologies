"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import context from "@/data/skill5/herald-site.json";
import type { CatalogEntry } from "@/lib/skill4/catalog";
import { PROGRAM_LABEL, SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { SKILL5_MODULE_ENVELOPE_FEET } from "@/lib/skill5/contract";
import { configurationStats, type ConfigurationDocument, type SiteConfiguration } from "@/lib/skill5/configurations";
import { designSiteFromParcel } from "@/lib/skill5/design-site";
import { importAssembly } from "@/lib/skill5/assembly";
import { loadArchetypeMesh } from "@/lib/skill5/load-module";
import { programDistribution, scenePlaced } from "@/lib/skill5/metrics";
import { SKILL5_MOCK_ASSEMBLIES } from "@/lib/skill5/mock-assemblies";
import { localDemonstrationBridge, worldSourceBridge } from "@/lib/skill5/mock-bridge";
import { footprintCorners, type PlacedModule } from "@/lib/skill5/placement";
import type { SiteContext } from "@/lib/skill5/site-model";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { AssemblyGlassPreview, OrthoCanvas, PlacedGlassPreview, arrangementFrames, clayPreviewRadius, composePlacedPreview } from "@/components/site/site-workspace";

const site = context as SiteContext;
const designSite = designSiteFromParcel(site.site.ring);
const PAGE_SIZE = 10;
const COMPARE_ROWS = 2;
const VOLUME_HEIGHT = 100;
const BANDS = [0, 20, 40, 60, 80];

type PreviewMesh = IsoMesh | "missing" | undefined;
type Card = { entry: SiteConfiguration; placeholder: boolean; source: CatalogEntry | null };

const centerX = (designSite.ring[0][0] + designSite.ring[1][0]) / 2;
const centerZ = (designSite.ring[0][1] + designSite.ring[3][1]) / 2;

const MOCK_CARDS: Card[] = SKILL5_MOCK_ASSEMBLIES.map((source) => ({
  placeholder: true,
  source,
  entry: {
    id: source.id,
    name: source.id,
    parentConfigurationId: null,
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:00.000Z",
    modules: [],
    assemblies: [importAssembly(source, { x: centerX, z: centerZ }, source.id)],
    annotations: [],
  },
}));

function placedOf(entry: SiteConfiguration) {
  return scenePlaced(entry.modules, entry.assemblies);
}

function bridgesOf(entry: SiteConfiguration) {
  return entry.assemblies.flatMap((assembly) => {
    const cloud = localDemonstrationBridge(assembly);
    if (!cloud) return [];
    return [worldSourceBridge(cloud, {
      x: assembly.transform.position.x,
      z: assembly.transform.position.z,
      rotationY: assembly.transform.rotationY,
    })];
  });
}

function designShare(area: number) {
  return designSite.areaSqFt > 0 ? area / designSite.areaSqFt * 100 : 0;
}

function bandMass(placed: readonly PlacedModule[]) {
  return BANDS.map((base) => {
    let mass = 0;
    for (const item of placed) {
      const bottom = item.transform.position.y;
      const top = bottom + SKILL5_MODULE_ENVELOPE_FEET;
      const overlap = Math.min(top, base + SKILL5_MODULE_ENVELOPE_FEET) - Math.max(bottom, base);
      if (overlap > 0) mass += overlap / SKILL5_MODULE_ENVELOPE_FEET;
    }
    return { base, mass };
  });
}

function envelopeVolumeShare(placed: readonly PlacedModule[]) {
  const capacity = designSite.areaSqFt * VOLUME_HEIGHT;
  let occupied = 0;
  for (const item of placed) {
    const bottom = Math.max(0, item.transform.position.y);
    const top = Math.min(VOLUME_HEIGHT, item.transform.position.y + SKILL5_MODULE_ENVELOPE_FEET);
    occupied += Math.max(0, top - bottom) * SKILL5_MODULE_ENVELOPE_FEET * SKILL5_MODULE_ENVELOPE_FEET;
  }
  return capacity > 0 ? occupied / capacity * 100 : 0;
}

function crownFeet(placed: readonly PlacedModule[]) {
  return placed.reduce((max, item) => Math.max(max, item.transform.position.y + SKILL5_MODULE_ENVELOPE_FEET), 0);
}

function CardPreview({ card, meshes, interactive = true }: { card: Card; meshes: Record<string, PreviewMesh>; interactive?: boolean }) {
  const loaded = useMemo(() => {
    const next: Record<string, IsoMesh> = {};
    for (const [id, mesh] of Object.entries(meshes)) {
      if (mesh && mesh !== "missing") next[id] = mesh;
    }
    return next;
  }, [meshes]);
  const bridges = useMemo(() => bridgesOf(card.entry), [card.entry]);
  if (card.source) return <AssemblyGlassPreview entry={card.source} meshes={meshes} interactive={interactive} />;
  return <PlacedGlassPreview modules={placedOf(card.entry)} meshes={loaded} bridges={bridges} interactive={interactive} />;
}

function ShareMeters({ entry }: { entry: SiteConfiguration }) {
  const placed = placedOf(entry);
  const stats = configurationStats(entry, site.site.ring, site.site.ringAreaSqFt);
  const counts = programDistribution(placed);
  const available = stats.connectors - stats.unresolved;
  const connectorLabel = stats.connectors === 0 ? "—" : available > 0 ? `${Math.round(available / stats.connectors * 100)}%` : "Pending";
  const rows = (["workspace", "lobby", "gathering"] as const).map((program) => {
    const share = stats.modules > 0 ? counts[program] / stats.modules * 100 : 0;
    return { program, label: PROGRAM_LABEL[program], count: counts[program], share };
  });
  return (
    <div className="site-meters" aria-label="Program shares">
      {rows.map((row) => (
        <div key={row.program} className="site-meter">
          <span>{row.label}</span>
          <i><b data-program={row.program} style={{ width: `${row.share}%` }} /></i>
          <strong>{row.count}</strong>
          <em>{row.share.toFixed(0)}%</em>
        </div>
      ))}
      <div className="site-meter">
        <span>Connectors</span>
        <i><b data-program="connectors" style={{ width: stats.connectors > 0 && available > 0 ? `${available / stats.connectors * 100}%` : "0%" }} /></i>
        <strong>{stats.connectors}</strong>
        <em>{connectorLabel}</em>
      </div>
    </div>
  );
}

function OccupationAxon({ placed }: { placed: readonly PlacedModule[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const context2d = canvas.getContext("2d");
      if (!context2d) return;
      const width = Math.max(1, canvas.offsetWidth);
      const height = Math.max(1, canvas.offsetHeight);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context2d.setTransform(ratio, 0, 0, ratio, 0, 0);
      context2d.fillStyle = "#000000";
      context2d.fillRect(0, 0, width, height);
      const yaw = -0.7;
      const cosine = Math.cos(yaw);
      const sine = Math.sin(yaw);
      const raw = (x: number, z: number, y: number) => {
        const east = (x - centerX) * cosine - (z - centerZ) * sine;
        const north = (x - centerX) * sine + (z - centerZ) * cosine;
        return { sx: east, sy: north * 0.42 - y };
      };
      const levels = [0, 20, 40, 60, 80, VOLUME_HEIGHT];
      const samples = levels.flatMap((level) => designSite.ring.map(([x, z]) => raw(x, z, level)));
      for (const item of placed) {
        for (const level of [item.transform.position.y, item.transform.position.y + SKILL5_MODULE_ENVELOPE_FEET]) {
          for (const corner of footprintCorners(item.transform.position, item.transform.rotationY)) samples.push(raw(corner.x, corner.z, level));
        }
      }
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const sample of samples) {
        minX = Math.min(minX, sample.sx);
        maxX = Math.max(maxX, sample.sx);
        minY = Math.min(minY, sample.sy);
        maxY = Math.max(maxY, sample.sy);
      }
      const pad = 8;
      const project = (x: number, z: number, y: number) => {
        const point = raw(x, z, y);
        return {
          x: pad + (point.sx - minX) / Math.max(1, maxX - minX) * (width - pad * 2),
          y: pad + (maxY - point.sy) / Math.max(1, maxY - minY) * (height - pad * 2),
        };
      };
      const stroke = Math.max(width, height);
      context2d.lineJoin = "round";
      context2d.strokeStyle = "rgba(255, 255, 255, 0.35)";
      context2d.lineWidth = stroke * 0.004;
      for (const [x, z] of designSite.ring) {
        const ground = project(x, z, 0);
        const crown = project(x, z, VOLUME_HEIGHT);
        context2d.beginPath();
        context2d.moveTo(ground.x, ground.y);
        context2d.lineTo(crown.x, crown.y);
        context2d.stroke();
      }
      for (const level of levels) {
        context2d.beginPath();
        designSite.ring.forEach(([x, z], index) => {
          const point = project(x, z, level);
          if (index === 0) context2d.moveTo(point.x, point.y);
          else context2d.lineTo(point.x, point.y);
        });
        context2d.closePath();
        if (level === 0) {
          context2d.fillStyle = "rgba(255, 255, 255, 0.08)";
          context2d.fill();
        }
        context2d.strokeStyle = level === 0 ? "rgba(255, 255, 255, 0.92)" : "rgba(255, 255, 255, 0.4)";
        context2d.lineWidth = level === 0 ? stroke * 0.012 : stroke * 0.004;
        context2d.stroke();
      }
      context2d.fillStyle = "rgba(232, 228, 220, 0.92)";
      for (const item of placed) {
        const footprint = footprintCorners(item.transform.position, item.transform.rotationY);
        context2d.beginPath();
        footprint.forEach((corner, index) => {
          const point = project(corner.x, corner.z, item.transform.position.y + SKILL5_MODULE_ENVELOPE_FEET);
          if (index === 0) context2d.moveTo(point.x, point.y);
          else context2d.lineTo(point.x, point.y);
        });
        context2d.closePath();
        context2d.fill();
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [placed]);
  return <canvas ref={canvasRef} aria-label="Site volume, ground to 100 feet" />;
}

function VerticalBands({ placed, scale }: { placed: readonly PlacedModule[]; scale: number }) {
  const bands = bandMass(placed);
  const height = crownFeet(placed);
  const volume = envelopeVolumeShare(placed);
  return (
    <div className="site-compare-bands">
      <div className="site-meters" aria-label="Envelope occupation from the ground to 100 feet">
        {bands.map((band) => (
          <div key={band.base} className="site-meter">
            <span>{band.base}–{band.base + 20}</span>
            <i><b style={{ width: `${scale > 0 ? Math.min(100, band.mass / scale * 100) : 0}%` }} /></i>
            <em>{band.mass > 0 ? band.mass.toFixed(1) : "0"}</em>
          </div>
        ))}
      </div>
      <p className="site-note">{height > 0 ? `${Math.round(height)} ft high. ` : ""}Envelope occupies {volume.toFixed(2)}% of the 100 ft site volume.</p>
    </div>
  );
}

function SiteFigures({ entry }: { entry: SiteConfiguration }) {
  const placed = useMemo(() => placedOf(entry), [entry]);
  const stats = configurationStats(entry, site.site.ring, site.site.ringAreaSqFt);
  const occupied = stats.area;
  const open = Math.max(0, designSite.areaSqFt - occupied);
  const plan = designShare(occupied);
  const openShare = Math.max(0, 100 - plan);
  return (
    <div className="site-compare-site">
      <figure className="site-compare-diagram">
        <OccupationAxon placed={placed} />
      </figure>
      <p className="site-note">{Math.round(occupied).toLocaleString("en-US")} ft² occupied · {plan.toFixed(1)}%</p>
      <p className="site-note">{Math.round(open).toLocaleString("en-US")} ft² open · {openShare.toFixed(1)}%</p>
    </div>
  );
}

function MatrixLine({ entry, meshes, frames, fitRadius }: { entry: SiteConfiguration; meshes: Record<string, IsoMesh>; frames?: ReturnType<typeof arrangementFrames>; fitRadius?: number }) {
  const placed = useMemo(() => placedOf(entry), [entry]);
  const bridges = useMemo(() => bridgesOf(entry), [entry]);
  return (
    <>
      <div className="site-compare-cell" role="cell">
        <div className="site-compare-view">
          <PlacedGlassPreview modules={placed} meshes={meshes} bridges={bridges} interactive={false} fitRadius={fitRadius} />
        </div>
      </div>
      <div className="site-compare-cell" role="cell">
        <div className="site-compare-view">
          <OrthoCanvas modules={placed} meshes={meshes} view="top" frame={frames?.top} bridges={bridges} fitCell label={`${entry.name} plan`} />
        </div>
      </div>
      <div className="site-compare-cell" role="cell">
        <div className="site-compare-elevations">
          {([
            ["north", "North"],
            ["south", "South"],
            ["east", "East"],
            ["west", "West"],
          ] as const).map(([view, label]) => (
            <figure key={view}>
              <div className="site-compare-view">
                <OrthoCanvas modules={placed} meshes={meshes} view={view} frame={frames?.[view]} bridges={bridges} fitCell label={`${entry.name} ${label} elevation`} />
              </div>
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </>
  );
}

export function ConfigurationCatalog() {
  const router = useRouter();
  const [saved, setSaved] = useState<SiteConfiguration[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [comparePage, setComparePage] = useState(0);
  const [meshes, setMeshes] = useState<Record<string, PreviewMesh>>({});
  const cards = useMemo<Card[]>(() => {
    const savedIds = new Set(saved.map((entry) => entry.id));
    const mocks = MOCK_CARDS.filter((card) => !savedIds.has(card.entry.id));
    const records = saved
      .filter((entry) => !mocks.some((card) => card.entry.id === entry.id))
      .map((entry) => ({ entry, placeholder: false, source: null }));
    return [...mocks, ...records];
  }, [saved]);
  const pageCount = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const visible = cards.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);
  const loadedMeshes = useMemo(() => {
    const next: Record<string, IsoMesh> = {};
    for (const [id, mesh] of Object.entries(meshes)) {
      if (mesh && mesh !== "missing") next[id] = mesh;
    }
    return next;
  }, [meshes]);

  useEffect(() => {
    const cancel = new AbortController();
    fetch("/api/site/configurations", { signal: cancel.signal })
      .then((response) => response.json())
      .then((body: ConfigurationDocument) => {
        if (!cancel.signal.aborted) setSaved(body.configurations ?? []);
      })
      .catch(() => {
        if (!cancel.signal.aborted) setSaved([]);
      });
    return () => cancel.abort();
  }, []);

  useEffect(() => {
    const cancel = new AbortController();
    for (const entry of SITE_ARCHETYPES) {
      loadArchetypeMesh(entry, cancel.signal).then((mesh) => {
        if (cancel.signal.aborted) return;
        setMeshes((current) => ({ ...current, [entry.moduleId]: mesh ?? "missing" }));
      }).catch(() => {
        if (cancel.signal.aborted) return;
        setMeshes((current) => ({ ...current, [entry.moduleId]: "missing" }));
      });
    }
    return () => cancel.abort();
  }, []);

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const chosen = useMemo(() => selected.flatMap((id) => {
    const card = cards.find((item) => item.entry.id === id);
    return card ? [card] : [];
  }), [cards, selected]);
  const compareCount = Math.max(1, Math.ceil(chosen.length / COMPARE_ROWS));
  const compareIndex = Math.min(comparePage, compareCount - 1);
  const compareRows = chosen.slice(compareIndex * COMPARE_ROWS, compareIndex * COMPARE_ROWS + COMPARE_ROWS);
  const compareFit = useMemo(() => {
    let max = 0;
    for (const card of chosen) {
      const mesh = composePlacedPreview(placedOf(card.entry), loadedMeshes, bridgesOf(card.entry));
      if (mesh) max = Math.max(max, clayPreviewRadius(mesh));
    }
    return max > 0 ? max * 0.72 : undefined;
  }, [chosen, loadedMeshes]);
  const sharedFrames = useMemo(() => {
    const placed = chosen.flatMap((card) => placedOf(card.entry));
    return placed.length > 0 ? arrangementFrames(placed, { pad: 8, minHeight: 8 }) : undefined;
  }, [chosen]);
  const bandScale = useMemo(() => {
    let max = 0;
    for (const card of chosen) {
      for (const band of bandMass(placedOf(card.entry))) max = Math.max(max, band.mass);
    }
    return max;
  }, [chosen]);
  const demonstration = chosen.some((card) => card.placeholder);
  const openOnSite = (id: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("open", id);
    router.push(`/lab/site?${params.toString()}`);
  };

  return (
    <main className="site-catalog">
      <div className="site-catalog-split">
        <div className="site-catalog-stage">
          <div className="site-catalog-row">
            {visible.map((card) => {
              const stats = configurationStats(card.entry, site.site.ring, site.site.ringAreaSqFt);
              const active = selected.includes(card.entry.id);
              return (
                <article
                  key={card.entry.id}
                  className="site-catalog-card"
                  data-selected={active || undefined}
                  onClick={() => toggle(card.entry.id)}
                >
                  <header className="site-catalog-card-head">
                    <p className="site-identity">{card.entry.name}</p>
                  </header>
                  <div className="site-catalog-body">
                    <div className="site-catalog-preview">
                      <CardPreview card={card} meshes={meshes} />
                    </div>
                    <p className="site-note">{stats.modules} modules</p>
                    <ShareMeters entry={card.entry} />
                  </div>
                  {card.placeholder ? null : (
                    <footer className="site-catalog-foot">
                      <button type="button" className="site-catalog-action" onClick={(event) => { event.stopPropagation(); openOnSite(card.entry.id); }}>Open</button>
                    </footer>
                  )}
                </article>
              );
            })}
          </div>
          <div className="site-pages" aria-label="Configuration pages">
            <button type="button" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>Previous</button>
            <span>{pageIndex + 1} / {pageCount}</span>
            <button type="button" disabled={pageIndex >= pageCount - 1} onClick={() => setPage(pageIndex + 1)}>Next</button>
          </div>
        </div>
        <aside className="site-catalog-select" aria-label="Configuration selection">
          <div className="site-catalog-select-head">
            <h2 className="site-subtitle">Selection</h2>
            <button type="button" className="site-catalog-remove" disabled={chosen.length === 0} onClick={() => setSelected([])}>Clear</button>
          </div>
          <p className="site-note">{chosen.length === 0 ? "Select configurations to compare." : `${chosen.length} selected`}</p>
          <div className="site-catalog-picks">
            {chosen.map((card) => (
              <div key={card.entry.id} className="site-catalog-pick">
                <CardPreview card={card} meshes={meshes} interactive={false} />
                <p className="site-identity">{card.entry.name}</p>
                <button type="button" className="site-catalog-remove" aria-label={`Remove ${card.entry.name}`} onClick={() => toggle(card.entry.id)}>×</button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="site-catalog-compare"
            disabled={chosen.length === 0}
            onClick={() => { setComparePage(0); setComparing(true); }}
          >
            Compare
          </button>
        </aside>
      </div>
      {comparing ? (
        <div className="site-compare-overlay" role="dialog" aria-label="Comparison">
          <div className="site-compare-bar">
            <p className="site-note">{demonstration ? "Demonstration configurations are test catalog content. They are not saved records." : "Saved configurations."}</p>
            {compareCount > 1 ? (
              <div className="site-pages" aria-label="Comparison pages">
                <button type="button" disabled={compareIndex === 0} onClick={() => setComparePage(compareIndex - 1)}>Previous</button>
                <span>{compareIndex + 1} / {compareCount}</span>
                <button type="button" disabled={compareIndex >= compareCount - 1} onClick={() => setComparePage(compareIndex + 1)}>Next</button>
              </div>
            ) : null}
            <button type="button" className="site-catalog-action site-catalog-close" onClick={() => setComparing(false)}>Close</button>
          </div>
          <div className="site-compare-sheet">
            <div className="site-compare-line site-compare-columns" role="row">
              {["Configuration", "Axonometric", "Plan", "Elevations", "Module distribution", "Site occupation", "Vertical occupation"].map((label) => (
                <div key={label} role="columnheader">{label}</div>
              ))}
            </div>
            <div className="site-compare-rows" style={{ "--compare-rows": String(COMPARE_ROWS) } as CSSProperties}>
              {compareRows.map((card) => {
                const stats = configurationStats(card.entry, site.site.ring, site.site.ringAreaSqFt);
                return (
                  <div key={card.entry.id} className="site-compare-line" role="row">
                    <div className="site-compare-cell" role="rowheader">
                      <p className="site-identity">{card.entry.name}</p>
                    </div>
                    <MatrixLine entry={card.entry} meshes={loadedMeshes} frames={sharedFrames} fitRadius={compareFit} />
                    <div className="site-compare-cell" role="cell">
                      <p className="site-identity">{stats.modules} modules</p>
                      <ShareMeters entry={card.entry} />
                    </div>
                    <div className="site-compare-cell" role="cell">
                      <SiteFigures entry={card.entry} />
                    </div>
                    <div className="site-compare-cell" role="cell">
                      <VerticalBands placed={placedOf(card.entry)} scale={bandScale} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
