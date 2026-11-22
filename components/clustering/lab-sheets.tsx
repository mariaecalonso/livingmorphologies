"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ClusterCatalog } from "@/lib/skill6/catalog";
import type { ClusterEngine, ClusterMorphology, ClusterRecord } from "@/lib/skill6/contract";
import type { LabRunRow } from "@/lib/skill6/experiment-catalog";
import { ClusterView, type ViewArchetype, type ViewExtra } from "@/components/clustering/cluster-view";
import { refinedFor, seatedTilesOf } from "@/components/clustering/card-view";
import jointRecord from "@/data/skill6/assembled/joint-diagram.json";
import { CLUSTER_COLLECTION } from "@/components/clustering/engine-lab";
import styles from "@/components/clustering/lab-sheets.module.css";

const ENGINES: { id: ClusterEngine; key: LabRunRow["engine"]; label: string; method: string }[] = [
  { id: "rule-based", key: "rule", label: "Full Build", method: "Coverage solver, scored selection" },
  { id: "graph-based", key: "graph", label: "Graph Based", method: "Topology first, then realized" },
  { id: "wave-function-collapse", key: "wfc", label: "WFC", method: "Domain propagation, backtracking" },
];

const MORPHOLOGIES: ClusterMorphology[] = ["compact", "branching"];
const TILES = [2, 3, 4, 5, 6, 7];

const JOINT_PLATES = "/clustering/joint";
const JOINT_STEPS = [
  { name: "Tiles placed", plate: `${JOINT_PLATES}/01-tiles.webp`, lines: [`Rigid seating · ${jointRecord.direction} · ${jointRecord.placement}`, `Residual ${jointRecord.residualGap.toFixed(3)} · area ${jointRecord.contactArea.toFixed(1)}`] },
  { name: "Contact region", plate: `${JOINT_PLATES}/02-contact.webp`, lines: [`${jointRecord.sampleCount} samples · ${jointRecord.plane.join("–")} plane`, "Near contact · gap 0.05 – 0.18"] },
  { name: "Patch", plate: `${JOINT_PLATES}/03-patch.webp`, lines: [`Implicit blend · r ${jointRecord.patch.radius} · voxel ${jointRecord.patch.cell}`, `${jointRecord.patch.extent[1].toFixed(1)} × ${jointRecord.patch.extent[2].toFixed(1)} · volume ${jointRecord.patch.volume.toFixed(1)} · ${jointRecord.patch.bodies} body`] },
  { name: "Raw union", plate: `${JOINT_PLATES}/04-union.webp`, lines: [`Tiles + patch · ${jointRecord.union.solids} solid · ${jointRecord.union.cavities} cavities`, `Seam creases ${jointRecord.refined.seamCreasesBefore} · lift ${jointRecord.lift.toFixed(2)}`] },
  { name: "Refined", plate: `${JOINT_PLATES}/05-refined.webp`, lines: [`Seam fillet + rim pass · ${jointRecord.refined.solids} solid`, `Seam creases ${jointRecord.refined.seamCreasesBefore} → ${jointRecord.refined.seamCreasesAfter} · min Z 0`] },
] as const;

type SheetCatalog = ClusterCatalog & { rows?: LabRunRow[] };

function useSheet() {
  const [catalog, setCatalog] = useState<SheetCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/clustering/catalog?collection=${CLUSTER_COLLECTION}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The cluster catalog did not load.");
        return response.json() as Promise<SheetCatalog>;
      })
      .then(setCatalog)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "The cluster catalog did not load.");
      });
    return () => controller.abort();
  }, []);
  return { catalog, error };
}

function rowFor(rows: readonly LabRunRow[], engine: ClusterEngine, morphology: ClusterMorphology, tiles: number) {
  const key = ENGINES.find((item) => item.id === engine)?.key;
  return rows.find((row) => row.engine === key && row.morphology === morphology && row.targetTiles === tiles) ?? null;
}

function recordFor(catalog: SheetCatalog, engine: ClusterEngine, morphology: ClusterMorphology, tiles: number) {
  const row = rowFor(catalog.rows ?? [], engine, morphology, tiles);
  if (row) return catalog.clusters.find((cluster) => cluster.id === row.id) ?? null;
  return catalog.clusters.find((cluster) => cluster.search?.engine === engine && cluster.search.organization === morphology && cluster.tiles.length === tiles) ?? null;
}

function toneOf(row: LabRunRow | null, record: ClusterRecord | null) {
  if (!row && !record) return "none";
  if (row?.validated) return "ok";
  if (row?.partial) return "short";
  if (row?.status === "unsuccessful" || record?.status === "unsuccessful") return "fail";
  if (record) return "ok";
  return "none";
}

function countText(row: LabRunRow | null, record: ClusterRecord | null, tiles: number) {
  if (!record && (!row || row.tiles === 0)) return "Not stored";
  const placed = record?.tiles.length ?? row?.tiles ?? 0;
  return `${placed} of ${row?.targetTiles ?? tiles}`;
}

function timeText(value: number | null | undefined) {
  if (value == null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`;
}

function Choices<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className={styles.choice}>
      <p>{label}</p>
      <div>
        {options.map((option) => (
          <button key={String(option.id)} type="button" data-on={option.id === value ? "true" : "false"} aria-pressed={option.id === value} onClick={() => onChange(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Mesh({ record, archetypes, extras, shown, hideTiles, syncGroup, interactive = true }: {
  record: ClusterRecord | null;
  archetypes: readonly ViewArchetype[];
  extras?: readonly ViewExtra[];
  shown?: readonly string[];
  hideTiles?: boolean;
  syncGroup?: string;
  interactive?: boolean;
}) {
  const tiles = useMemo(() => (record ? seatedTilesOf(record) : []), [record]);
  if (!record) return <p className={styles.gap}>No stored mesh</p>;
  return (
    <ClusterView
      tiles={tiles}
      archetypes={archetypes}
      selectedId={null}
      interactive={interactive}
      extras={extras}
      shownExtras={shown}
      hideTiles={hideTiles}
      floorZ={record.assembly ? 0 : undefined}
      presentation
      tones="interface"
      syncGroup={syncGroup}
      ground
    />
  );
}

function RefinedMesh({ record, archetypes, syncGroup }: { record: ClusterRecord | null; archetypes: readonly ViewArchetype[]; syncGroup: string }) {
  const [extras, setExtras] = useState<ViewExtra[] | null>(null);
  useEffect(() => {
    if (!record) return;
    let live = true;
    setExtras(null);
    void refinedFor(record.id, CLUSTER_COLLECTION).then((list) => { if (live) setExtras(list); }).catch(() => undefined);
    return () => { live = false; };
  }, [record]);
  return <Mesh record={record} archetypes={archetypes} extras={extras ?? undefined} shown={extras ? ["refined"] : undefined} hideTiles={Boolean(extras)} syncGroup={syncGroup} />;
}

/** Three engines at one tile count. The Initial Cluster lab stays the working selection. */
export function EngineBench() {
  const { catalog, error } = useSheet();
  const [morphology, setMorphology] = useState<ClusterMorphology>("compact");
  const [tiles, setTiles] = useState(7);
  if (error) return <p className={styles.gap}>{error}</p>;
  if (!catalog) return <p className={styles.gap}>Loading</p>;
  const columns = ENGINES.map((engine) => {
    const row = rowFor(catalog.rows ?? [], engine.id, morphology, tiles);
    const record = recordFor(catalog, engine.id, morphology, tiles);
    return { engine, row, record };
  });
  return (
    <div className={styles.sheet}>
      <div className={styles.bench}>
        <aside className={styles.frame}>
          <Choices label="Morphology" value={morphology} options={MORPHOLOGIES.map((item) => ({ id: item, label: item }))} onChange={setMorphology} />
          <p className={styles.note}>Full Build, Graph, and WFC at one size. Orbit one mesh and the other two follow.</p>
        </aside>
        <div className={styles.stage}>
          <Choices label="Tiles" value={tiles} options={TILES.map((item) => ({ id: item, label: String(item) }))} onChange={setTiles} />
          <div className={styles.columns}>
            {columns.map(({ engine, row, record }) => (
              <article key={engine.id} className={styles.frame}>
                <header>
                  <p className={styles.kicker}>{engine.label}</p>
                  <p className={styles.method}>{engine.method}</p>
                  <p className={styles.count} data-tone={toneOf(row, record)}>{countText(row, record, tiles)}</p>
                </header>
                <div className={styles.mesh}>
                  <RefinedMesh record={record} archetypes={catalog.archetypes} syncGroup="lab-engines" />
                </div>
              </article>
            ))}
          </div>
        </div>
        <aside className={styles.frame}>
          <p className={styles.kicker}>Search reading</p>
          <p className={styles.legend}><span>Full</span><span>Graph</span><span>WFC</span></p>
          <dl className={styles.reading}>
            {(["Tests", "Accepted", "Refused", "Backtracks", "Time"] as const).map((label) => (
              <div key={label}>
                <dt>{label}</dt>
                {columns.map(({ engine, record }) => {
                  const search = record?.search;
                  const value = label === "Tests" ? search?.evaluations
                    : label === "Accepted" ? search?.acceptedPoses
                      : label === "Refused" ? search?.geometricRejections
                        : label === "Backtracks" ? search?.backtracks
                          : timeText(search?.milliseconds);
                  return <dd key={engine.id}>{value ?? "—"}</dd>;
                })}
              </div>
            ))}
          </dl>
          <p className={styles.note}>Search time. Assembly time is separate. {CLUSTER_COLLECTION}.</p>
        </aside>
      </div>
    </div>
  );
}

type CatalogThumb = { canvas: HTMLCanvasElement; scene: THREE.Scene; camera: THREE.PerspectiveCamera };

function paintThumbs(renderer: THREE.WebGLRenderer, thumbs: readonly CatalogThumb[]) {
  for (const thumb of thumbs) {
    const center = thumb.camera.userData.center as THREE.Vector3 | undefined;
    const span = thumb.camera.userData.span as number | undefined;
    if (!center || !span) continue;
    const width = Math.max(1, Math.round(thumb.canvas.clientWidth));
    const height = Math.max(1, Math.round(thumb.canvas.clientHeight));
    renderer.setSize(width, height, false);
    const vertical = (thumb.camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * (width / height));
    const distance = Math.max(span / (2 * Math.tan(vertical)), span / (2 * Math.tan(horizontal))) * 1.28;
    const pitch = 0.62;
    const cos = Math.cos(pitch);
    thumb.camera.aspect = width / height;
    thumb.camera.position.set(
      center.x + distance * cos * Math.sin(Math.PI / 4),
      center.y - distance * cos * Math.cos(Math.PI / 4),
      center.z + distance * Math.sin(pitch),
    );
    thumb.camera.lookAt(center);
    thumb.camera.updateProjectionMatrix();
    renderer.render(thumb.scene, thumb.camera);
    const context = thumb.canvas.getContext("2d");
    if (!context) continue;
    if (thumb.canvas.width !== width || thumb.canvas.height !== height) {
      thumb.canvas.width = width;
      thumb.canvas.height = height;
    }
    context.drawImage(renderer.domElement, 0, 0, width, height);
  }
}

function CatalogThumb({ id, register }: { id: string; register: (thumb: CatalogThumb) => () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let live = true;
    let unregister = () => {};
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 800);
    camera.up.set(0, 0, 1);
    const root = new THREE.Group();
    scene.add(root);
    scene.add(new THREE.HemisphereLight(0xf2f2f0, 0x1a1a1a, 0.72));
    scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    const key = new THREE.DirectionalLight(0xfff8f2, 1.45);
    scene.add(key);
    void refinedFor(id, CLUSTER_COLLECTION).then((list) => {
      if (!live) return;
      const solid = list.find((item) => item.id === "refined");
      if (!solid) return;
      root.add(new THREE.Mesh(solid.geometry, new THREE.MeshStandardMaterial({ color: solid.color, roughness: 0.62, metalness: 0.02 })));
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      key.position.set(center.x + size.x, center.y - size.y, center.z + size.z);
      camera.userData.center = center;
      camera.userData.span = Math.max(size.x, size.y, size.z, 1);
      unregister = register({ canvas, scene, camera });
    }).catch(() => undefined);
    return () => {
      live = false;
      unregister();
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
    };
  }, [id, register]);
  return <canvas ref={canvasRef} />;
}

/** Stored overnight field. Each cell draws its refined cluster. One mesh stays open beside the grid. */
export function ClusterCatalogSheet() {
  const { catalog, error } = useSheet();
  const [selected, setSelected] = useState<string | null>(null);
  const thumbs = useRef<CatalogThumb[]>([]);
  const paint = useRef<(() => void) | null>(null);
  const matrixRef = useRef<HTMLDivElement>(null);
  const register = useCallback((thumb: CatalogThumb) => {
    thumbs.current.push(thumb);
    paint.current?.();
    return () => { thumbs.current = thumbs.current.filter((item) => item !== thumb); };
  }, []);
  const cells = useMemo(() => {
    if (!catalog) return [];
    return ENGINES.flatMap((engine) => MORPHOLOGIES.map((morphology) => ({
      engine,
      morphology,
      sizes: TILES.map((tiles) => {
        const row = rowFor(catalog.rows ?? [], engine.id, morphology, tiles);
        const record = recordFor(catalog, engine.id, morphology, tiles);
        return { tiles, row, record };
      }),
    })));
  }, [catalog]);
  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(1);
    const draw = () => paintThumbs(renderer, thumbs.current);
    paint.current = draw;
    draw();
    const observed = matrixRef.current;
    const observer = new ResizeObserver(() => draw());
    if (observed) observer.observe(observed);
    return () => {
      paint.current = null;
      observer.disconnect();
      renderer.dispose();
    };
  }, [catalog]);
  const open = catalog?.clusters.find((cluster) => cluster.id === selected)
    ?? cells.flatMap((group) => group.sizes).find((cell) => cell.record)?.record
    ?? null;
  if (error) return <p className={styles.gap}>{error}</p>;
  if (!catalog) return <p className={styles.gap}>Loading</p>;
  return (
    <div className={styles.sheet}>
      <div className={styles.catalog}>
        <article className={styles.frame}>
          <p className={styles.kicker}>{open?.id ?? "No stored mesh"}</p>
          <div className={styles.mesh}>
            <RefinedMesh record={open} archetypes={catalog.archetypes} syncGroup="lab-catalog" />
          </div>
        </article>
        <div ref={matrixRef} className={styles.matrix} role="grid" aria-label="Stored clusters">
          <span />
          {TILES.map((tiles) => <p key={tiles} className={styles.kicker}>{tiles}</p>)}
          {cells.map((group) => (
            <div key={`${group.engine.id}-${group.morphology}`} className={styles.matrixRow}>
              <p className={styles.kicker}>{group.engine.label}<span>{group.morphology}</span></p>
              {group.sizes.map((cell) => {
                const id = cell.record?.id ?? cell.row?.id ?? "";
                return (
                  <button
                    key={cell.tiles}
                    type="button"
                    title={id || "Not stored"}
                    data-tone={toneOf(cell.row, cell.record)}
                    data-on={open?.id === cell.record?.id && cell.record ? "true" : "false"}
                    disabled={!cell.record}
                    onClick={() => cell.record && setSelected(cell.record.id)}
                  >
                    {cell.record ? <CatalogThumb id={cell.record.id} register={register} /> : null}
                    <b>{countText(cell.row, cell.record, cell.tiles)}</b>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The archived Chapter 04 joint. The playhead walks the stored plates. */
export function RefineSheet() {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setAt((current) => (current + 1) % JOINT_STEPS.length), 1600);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className={styles.sheet}>
      <p className={styles.kicker}>Joint refinement · flat deep plan × inserted horizontal plate</p>
      <ol className={styles.joint}>
        {JOINT_STEPS.map((step, index) => (
          <li key={step.name} data-on={index === at ? "true" : "false"}>
            <p className={styles.kicker}><b>{String(index + 1).padStart(2, "0")}</b> {step.name}</p>
            <div className={styles.frame}>
              <img src={step.plate} alt="" />
            </div>
            <p className={styles.caption}>
              {step.lines.map((line) => <span key={line}>{line}</span>)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
