"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FINAL_CLUSTER_PAIRS,
  type FinalClusterPairId,
  type FinalClusterTilePose,
  type FinalClustersCatalogDocument,
} from "@/lib/skill4/final-cluster-pairs";
import { drawPlacedMeshes, meshSnapshotCanvas, type PlacedMesh } from "@/lib/skill4/draw-placed";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { tileBasis } from "@/lib/skill4/tile-basis";
import { resolveTileModule, tileStep, type TileInstance } from "@/lib/skill4/tiles";
import { useHybrid } from "./hybrid-state";

const ORBIT_YAW = 0.85;
const ORBIT_PITCH = -0.95;

type CatalogResponse = FinalClustersCatalogDocument & {
  batch?: { running: boolean; phase: string };
};

type PackedMesh = { triangles: number; positions: string; normals: string; indices: string };

function unpackMesh(packed: PackedMesh | null | undefined): IsoMesh | null {
  if (!packed || packed.triangles < 1) return null;
  const view = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  };
  return {
    triangles: packed.triangles,
    positions: new Float32Array(view(packed.positions)),
    normals: new Float32Array(view(packed.normals)),
    indices: new Uint32Array(view(packed.indices)),
  };
}

function asTileInstances(tiles: readonly FinalClusterTilePose[]): TileInstance[] {
  return tiles.map((tile) => ({
    instanceId: tile.instanceId,
    archetypeId: tile.archetypeId,
    moduleId: "",
    transform: { ...tile.transform },
    rotationQuarter: tile.rotationQuarter as TileInstance["rotationQuarter"],
    mirror: tile.mirror,
    rotation: tile.rotation ? (tile.rotation as TileInstance["rotation"]) : undefined,
  }));
}

/**
 * One thumbnail draws at a time. The still stays, and the WebGL context is
 * released, so a family of previews does not exhaust the browser.
 */
type ThumbJob = { id: string; run: () => void };
const thumbQueue: ThumbJob[] = [];
let thumbPainting = false;

function enqueueThumb(id: string, run: () => void) {
  const existing = thumbQueue.findIndex((job) => job.id === id);
  if (existing >= 0) thumbQueue.splice(existing, 1);
  thumbQueue.push({ id, run });
  drainThumbs();
}

function drainThumbs() {
  if (thumbPainting) return;
  const job = thumbQueue.shift();
  if (!job) return;
  thumbPainting = true;
  window.requestAnimationFrame(() => {
    try {
      job.run();
    } finally {
      thumbPainting = false;
      drainThumbs();
    }
  });
}

function releaseThumbGl(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2");
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
}

const thumbCache = new Map<string, PlacedMesh[]>();
let thumbSlots = 0;

function FinalClusterThumb({
  tiles,
  pairId,
  clusterId,
  catalogHref,
}: {
  tiles: readonly FinalClusterTilePose[];
  pairId: string;
  clusterId: string;
  catalogHref: string;
}) {
  const { loaded } = useHybrid();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [still, setStill] = useState<string | null>(null);
  const [hybrids, setHybrids] = useState<PlacedMesh[] | null>(() => thumbCache.get(clusterId) ?? null);
  const paintSigRef = useRef("");
  const instances = useMemo(() => asTileInstances(tiles), [tiles]);
  const readyKey = instances.map((tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    return handoff.status === "ready" && handoff.geometry ? tile.archetypeId : "";
  }).join("|");

  useEffect(() => {
    const cached = thumbCache.get(clusterId);
    if (cached) {
      setHybrids(cached);
      return;
    }
    let alive = true;
    const load = () => {
      if (!alive) return;
      if (thumbCache.has(clusterId)) {
        setHybrids(thumbCache.get(clusterId) ?? []);
        return;
      }
      if (thumbSlots >= 4) {
        window.setTimeout(load, 180);
        return;
      }
      thumbSlots += 1;
      void fetch(`${catalogHref}?pair=${encodeURIComponent(pairId)}&id=${encodeURIComponent(clusterId)}&connectors=1&thumb=1`)
        .then((response) => response.json() as Promise<{ connections?: { id: string; validatedHybrid: PackedMesh | null }[] }>)
        .then((body) => {
          const drawn = (body.connections ?? []).flatMap((connection) => {
            const mesh = unpackMesh(connection.validatedHybrid);
            if (!mesh) return [];
            return [{
              id: connection.id,
              mesh,
              translate: { x: 0, y: 0, z: 0 },
              selected: false,
              color: [0.78, 0.49, 0.37] as [number, number, number],
              plain: true,
            }];
          });
          thumbCache.set(clusterId, drawn);
          if (alive) setHybrids(drawn);
        })
        .catch(() => {
          if (alive) setHybrids([]);
        })
        .finally(() => {
          thumbSlots = Math.max(0, thumbSlots - 1);
        });
    };
    load();
    return () => {
      alive = false;
    };
  }, [catalogHref, clusterId, pairId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tilesDrawn = instances.flatMap((tile) => {
      const handoff = resolveTileModule(tile.archetypeId, loaded);
      if (handoff.status !== "ready" || !handoff.geometry) return [];
      return [{
        id: tile.instanceId,
        mesh: handoff.geometry,
        translate: tile.transform,
        selected: false,
        basis: tileBasis(tile),
        kind: 0 as const,
        color: [1, 1, 1] as [number, number, number],
        opacity: 0.72,
      }];
    });
    if (tilesDrawn.length !== instances.length) return;
    const hybridKey = hybrids === null ? "pending" : String(hybrids.length);
    const paintSig = `${clusterId}:${readyKey}:${hybridKey}`;
    if (paintSigRef.current === paintSig) return;
    paintSigRef.current = paintSig;
    const drawn = hybrids === null ? tilesDrawn : [...tilesDrawn, ...hybrids];
    let alive = true;
    enqueueThumb(clusterId, () => {
      if (!alive || canvasRef.current !== canvas) return;
      drawPlacedMeshes(canvas, drawn, ORBIT_YAW, ORBIT_PITCH, tileStep() * 8, false, 4.6, false, 0.8, undefined, true, true, undefined, 1, 480, [0, 0, 0, 1], "hybrid");
      try {
        setStill(meshSnapshotCanvas(canvas).toDataURL("image/jpeg", 0.72));
      } catch {
        setStill(null);
      }
      releaseThumbGl(canvas);
    });
    return () => {
      alive = false;
      const index = thumbQueue.findIndex((job) => job.id === clusterId);
      if (index >= 0) thumbQueue.splice(index, 1);
    };
  }, [clusterId, hybrids, instances, loaded, readyKey]);

  return (
    <span className="cluster-thumb final-clusters-thumb">
      {still ? <img src={still} className="final-clusters-thumb-still" alt="" /> : null}
      <canvas ref={canvasRef} data-cluster-id={clusterId} width={440} height={260} aria-hidden="true" hidden={Boolean(still)} />
    </span>
  );
}

function OrbitTilePreview({
  tiles,
  meshKey,
  note,
  hybrids = [],
}: {
  tiles: readonly FinalClusterTilePose[];
  meshKey: string;
  note: string;
  hybrids?: readonly PlacedMesh[];
}) {
  const { loaded, ensureArchetypes } = useHybrid();
  const instances = useMemo(() => {
    return asTileInstances(tiles).flatMap((tile) => {
      const handoff = resolveTileModule(tile.archetypeId, loaded);
      if (handoff.status !== "ready" || !handoff.geometry) return [];
      return [{
        id: tile.instanceId,
        mesh: handoff.geometry,
        translate: tile.transform,
        selected: false,
        basis: tileBasis(tile),
        kind: 0 as const,
        color: [1, 1, 1] as [number, number, number],
        opacity: 0.72,
      }];
    });
  }, [loaded, tiles]);
  const drawn = useMemo(() => [...instances, ...hybrids], [hybrids, instances]);

  useEffect(() => {
    ensureArchetypes(tiles.map((tile) => tile.archetypeId));
  }, [ensureArchetypes, tiles]);

  if (drawn.length === 0) {
    return <p className="hybrid-units">{note}</p>;
  }
  return (
    <>
      <OrbitClusterView instances={drawn} meshKey={`${meshKey}:tiles`} />
      <p className="hybrid-units">{note}</p>
    </>
  );
}

/** Detail view: drag to orbit. Same pointer pattern as the cluster study canvas. */
function OrbitClusterView({
  instances,
  meshKey,
}: {
  instances: readonly PlacedMesh[];
  meshKey: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number; button: number; shift: boolean } | null>(null);
  const fitCache = useRef<{ width: number; height: number; signature: string; fit: number; center: { x: number; y: number; z: number } } | null>(null);
  const turnRef = useRef({ yaw: ORBIT_YAW, pitch: ORBIT_PITCH, zoom: 1, panX: 0, panY: 0, panZ: 0, meshKey });
  const [turn, setTurn] = useState({ yaw: ORBIT_YAW, pitch: ORBIT_PITCH, zoom: 1, panX: 0, panY: 0, panZ: 0, meshKey });
  if (turn.meshKey !== meshKey) {
    setTurn({ yaw: ORBIT_YAW, pitch: ORBIT_PITCH, zoom: 1, panX: 0, panY: 0, panZ: 0, meshKey });
    fitCache.current = null;
  }
  turnRef.current = turn;
  const reach = instances.reduce(
    (max, item) => Math.max(max, Math.abs(item.translate.x), Math.abs(item.translate.y), Math.abs(item.translate.z)),
    0,
  );
  const span = Math.max(reach * 2.4, tileStep() * 1.8, 8);
  const paint = useMemo(() => {
    return () => {
      const canvas = canvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent || instances.length === 0) return;
      const { yaw, pitch, zoom, panX, panY, panZ } = turnRef.current;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width < 8 || height < 8) return;
      const signature = `${span}:${meshKey}`;
      const cached = fitCache.current;
      if (cached && cached.width === width && cached.height === height && cached.signature === signature) {
        const look = { x: cached.center.x + panX, y: cached.center.y + panY, z: cached.center.z + panZ };
        drawPlacedMeshes(canvas, instances, yaw, pitch, span, false, 4.2, false, 0.82, look, false, false, cached.fit * zoom, 1, 1600, [0, 0, 0, 1], "hybrid");
        return;
      }
      const frame = drawPlacedMeshes(canvas, instances, yaw, pitch, span, false, 4.2, false, 0.82, undefined, true, true, undefined, 1, 1600, [0, 0, 0, 1], "hybrid");
      if (frame) fitCache.current = { width, height, signature, fit: frame.fit, center: frame.center };
    };
  }, [instances, meshKey, span]);

  useEffect(() => {
    paint();
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    let frameId = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(paint);
    });
    observer.observe(parent);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [paint]);

  useEffect(() => {
    paint();
  }, [paint, turn]);

  return (
    <div className="hybrid-preview final-clusters-film-preview" data-orbit="true">
      <canvas
        ref={canvasRef}
        className="hybrid-stage-canvas"
        data-orbit-yaw={turn.yaw.toFixed(3)}
        data-orbit-pitch={turn.pitch.toFixed(3)}
        onWheel={(event) => {
          event.preventDefault();
          const next = Math.min(2.4, Math.max(0.45, turn.zoom * Math.exp(-event.deltaY * 0.0011)));
          setTurn({ ...turn, zoom: next });
        }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          dragRef.current = { x: event.clientX, y: event.clientY, yaw: turn.yaw, pitch: turn.pitch, button: event.button, shift: event.shiftKey };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Drag still receives move events without capture.
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          const pan = drag.shift || drag.button === 1 || drag.button === 2;
          if (pan) {
            const scale = span * 0.0022 / turn.zoom;
            setTurn({
              ...turn,
              panX: turn.panX - dx * scale,
              panY: turn.panY + dy * scale * 0.35,
              panZ: turn.panZ - dy * scale,
            });
            dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
            return;
          }
          setTurn({
            ...turn,
            yaw: drag.yaw - dx * 0.008,
            pitch: Math.min(1.2, Math.max(-1.2, drag.pitch - dy * 0.008)),
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />
    </div>
  );
}

export function FinalClustersCatalog({
  catalogHref = "/api/skill4/final-clusters",
  review = false,
}: {
  catalogHref?: string;
  review?: boolean;
}) {
  const { ensureArchetypes } = useHybrid();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [pairId, setPairId] = useState<FinalClusterPairId>(FINAL_CLUSTER_PAIRS[0].id);
  const [openId, setOpenId] = useState("");
  const [film, setFilm] = useState<IsoMesh | null>(null);
  const [hybrids, setHybrids] = useState<PlacedMesh[]>([]);
  const [filmLoading, setFilmLoading] = useState(false);
  const [shrinkWrap, setShrinkWrap] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const load = () => {
      void fetch(catalogHref, { cache: "no-store" })
        .then((response) => response.json() as Promise<CatalogResponse>)
        .then((body) => {
          if (!alive) return;
          setCatalog((prev) => {
            if (
              prev
              && prev.clusters?.length === body.clusters?.length
              && prev.batch?.running === body.batch?.running
              && prev.batch?.phase === body.batch?.phase
            ) {
              return prev;
            }
            return body;
          });
          if (body.batch?.running && !timer) timer = window.setInterval(load, 8000);
          if (!body.batch?.running && timer) {
            window.clearInterval(timer);
            timer = 0;
          }
        })
        .catch(() => {
          if (!alive) return;
          setCatalog(null);
        });
    };
    load();
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [catalogHref]);

  const pair = FINAL_CLUSTER_PAIRS.find((item) => item.id === pairId) ?? FINAL_CLUSTER_PAIRS[0];
  const clusters = useMemo(
    () => (catalog?.clusters ?? []).filter((cluster) => cluster.pairId === pair.id),
    [catalog, pair.id],
  );

  useEffect(() => {
    if (!clusters.length) return;
    ensureArchetypes([...new Set(clusters.flatMap((cluster) => cluster.tiles.map((tile) => tile.archetypeId)))]);
  }, [clusters, ensureArchetypes]);

  const open = clusters.find((cluster) => cluster.id === openId) ?? null;

  useEffect(() => {
    setOpenId("");
  }, [pairId]);

  useEffect(() => {
    if (!open) {
      setFilm(null);
      setHybrids([]);
      setFilmLoading(false);
      return;
    }
    let alive = true;
    setFilm(null);
    setHybrids([]);
    setFilmLoading(true);
    void fetch(
      `${catalogHref}?pair=${encodeURIComponent(open.pairId)}&id=${encodeURIComponent(open.id)}`,
      { cache: "no-store" },
    )
      .then((response) => response.json() as Promise<{ mesh?: PackedMesh | null; connections?: { id: string; validatedHybrid: PackedMesh | null }[] }>)
      .then((body) => {
        if (!alive) return;
        setFilm(unpackMesh(body.mesh));
        setHybrids((body.connections ?? []).flatMap((connection) => {
          const mesh = unpackMesh(connection.validatedHybrid);
          if (!mesh || mesh.triangles < 1) return [];
          return [{
            id: connection.id,
            mesh,
            translate: { x: 0, y: 0, z: 0 },
            selected: false,
            color: [0.78, 0.49, 0.37] as [number, number, number],
            plain: true,
          }];
        }));
        setFilmLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setFilm(null);
        setHybrids([]);
        setFilmLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [catalogHref, open]);

  const phase = catalog?.batch?.running ? catalog.batch.phase : "";
  const reviewOpen = open as (typeof open & {
    assignedBias?: string;
    realizedPrimary?: string;
    realizedSecondary?: string[];
    measures?: {
      registration: { x: number; y: number; z: number; balance: number; dispersion: number };
      morphologyMesh: { x: number; y: number; z: number; balance: number } | null;
      shrinkWrap: { enclosedVolume: number; enclosureRatio: number; boxVolume: number } | null;
    };
  }) | null;
  const counts = new Map<string, number>();
  for (const cluster of catalog?.clusters ?? []) {
    counts.set(cluster.pairId, (counts.get(cluster.pairId) ?? 0) + 1);
  }
  const quotaFor = (pairId: string) => review ? 3 : (counts.get(pairId) ?? 0);

  return (
    <main className="hybrid-view hybrid-catalog hybrid-final-clusters">
      <div className="hybrid-catalog-body">
        <div className="hybrid-catalog-main final-clusters-shell">
          <nav className="final-clusters-families panel" aria-label="Pair families">
            <div className="frame-title">
              <h2 className="panel-title">Family</h2>
            </div>
            <div className="final-clusters-family-list">
              {FINAL_CLUSTER_PAIRS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-active={item.id === pair.id || undefined}
                  onClick={() => setPairId(item.id)}
                >
                  <span className="hybrid-identity">{item.label}</span>
                  <span className="hybrid-units">{counts.get(item.id) ?? 0}/{quotaFor(item.id)}</span>
                </button>
              ))}
            </div>
          </nav>

          {open ? (
            <div className="final-clusters-detail panel">
              <div className="frame-title">
                <div>
                  <h2 className="panel-title">{open.label}</h2>
                  <p className="eyebrow">{pair.label}</p>
                </div>
              </div>
              <div className="final-clusters-detail-stage">
                <aside className="final-clusters-dna" aria-label="Cluster DNA">
                  <button
                    type="button"
                    className="final-clusters-back-arrow"
                    onClick={() => setOpenId("")}
                    aria-label={`Back to ${pair.label} catalog`}
                    title={`Back to ${pair.label}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M14.5 5.5 L8 12 l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <p className="final-clusters-dna-title">Cluster DNA</p>
                  <p className="final-clusters-dna-line">{open.label}</p>
                  <p className="final-clusters-dna-line">{pair.label}</p>
                  <p className="final-clusters-dna-line">{open.tileCount} tiles</p>
                  <p className="final-clusters-dna-line">Seed {open.seed}</p>
                  <p className="final-clusters-dna-line">{open.validated ? "Validated" : "Not validated"}</p>
                  {(open.assignedBias ?? reviewOpen?.assignedBias) ? (
                    <p className="final-clusters-dna-line">Bias {open.assignedBias ?? reviewOpen?.assignedBias}</p>
                  ) : null}
                  {(open.realizedPrimary ?? reviewOpen?.realizedPrimary) ? (
                    <p className="final-clusters-dna-line">
                      Topology {open.realizedPrimary ?? reviewOpen?.realizedPrimary}
                      {(open.realizedSecondary ?? reviewOpen?.realizedSecondary)?.length
                        ? ` · ${(open.realizedSecondary ?? reviewOpen?.realizedSecondary)?.join(", ")}`
                        : ""}
                    </p>
                  ) : null}
                  {(open.balance != null || reviewOpen?.measures) ? (
                    <p className="final-clusters-dna-line">
                      Balance {open.balance ?? reviewOpen?.measures?.registration.balance}
                    </p>
                  ) : null}
                  {reviewOpen?.measures ? (
                    <>
                      <p className="final-clusters-dna-line">
                        Registration {reviewOpen.measures.registration.x} × {reviewOpen.measures.registration.y} × {reviewOpen.measures.registration.z}
                      </p>
                      {reviewOpen.measures.morphologyMesh ? (
                        <p className="final-clusters-dna-line">
                          Mesh {reviewOpen.measures.morphologyMesh.x} × {reviewOpen.measures.morphologyMesh.y} × {reviewOpen.measures.morphologyMesh.z}
                        </p>
                      ) : null}
                      {reviewOpen.measures.shrinkWrap ? (
                        <p className="final-clusters-dna-line">
                          Enclosed {reviewOpen.measures.shrinkWrap.enclosedVolume} · ratio {reviewOpen.measures.shrinkWrap.enclosureRatio}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="final-clusters-dna-line"
                    onClick={() => setShrinkWrap((value) => !value)}
                  >
                    Shrink wrap: {shrinkWrap ? "On" : "Off"}
                  </button>
                  <div className="final-clusters-dna-tiles">
                    {open.names.map((name, index) => (
                      <p key={`${open.id}:${index}:${name}`} className="final-clusters-dna-line">
                        {String(index + 1).padStart(2, "0")} · {name}
                      </p>
                    ))}
                  </div>
                </aside>
                <div className="final-clusters-detail-preview">
                  {shrinkWrap && film ? (
                    <OrbitClusterView
                      meshKey={open.id}
                      instances={[{
                        id: "film-wrap",
                        mesh: film,
                        translate: { x: 0, y: 0, z: 0 },
                        selected: false,
                        plain: true,
                        color: [0.78, 0.8, 0.82],
                      }]}
                    />
                  ) : (
                    <OrbitTilePreview
                      tiles={open.tiles}
                      hybrids={hybrids}
                      meshKey={open.id}
                      note={filmLoading ? "Loading validated assembly… drag to rotate" : "Tiles · hybrid connectors · drag to rotate"}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="final-clusters-family-panel panel" data-pair={pair.id} data-kind-a={pair.a} data-kind-b={pair.b}>
              <div className="frame-title">
                <div>
                  <h2 className="panel-title">{pair.label}</h2>
                  <p className="eyebrow">Final clusters{phase ? ` · ${phase}` : ""}</p>
                </div>
                <p className="hybrid-units final-clusters-count">
                  {clusters.length}/{quotaFor(pair.id)}
                </p>
              </div>
              {clusters.length === 0 ? (
                <p className="hybrid-units">No clusters yet</p>
              ) : (
                <div className="final-clusters-grid">
                  {clusters.map((cluster) => (
                    <button
                      key={cluster.id}
                      type="button"
                      data-catalog-card=""
                      onClick={() => setOpenId(cluster.id)}
                    >
                      <FinalClusterThumb tiles={cluster.tiles} pairId={cluster.pairId} clusterId={cluster.id} catalogHref={catalogHref} />
                      <span className="final-clusters-spec">
                        <span>{cluster.label}</span>
                        <span>{cluster.tileCount} · {cluster.seed}{cluster.validated ? " · validated" : ""}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
