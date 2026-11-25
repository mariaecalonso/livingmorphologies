"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FINAL_CLUSTER_PAIRS,
  type FinalClusterKind,
  type FinalClusterPairId,
  type FinalClusterSummary,
  type FinalClusterTilePose,
  type FinalClustersCatalogDocument,
} from "@/lib/skill4/final-cluster-pairs";
import { drawPlacedMeshes, type PlacedMesh } from "@/lib/skill4/draw-placed";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { tileBasis } from "@/lib/skill4/tile-basis";
import { resolveTileModule, tileStep, type TileInstance } from "@/lib/skill4/tiles";
import { useHybrid } from "./hybrid-state";

const KIND_LABEL: Record<FinalClusterKind, string> = {
  workspace: "Workspace",
  lobby: "Lobby",
  gathering: "Gathering",
};

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
 * One WebGL canvas per thumb. Keep at most one family mounted so the browser
 * does not run out of WebGL contexts (white / blank canvases).
 */
function FinalClusterThumb({ tiles }: { tiles: readonly FinalClusterTilePose[] }) {
  const { loaded } = useHybrid();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instances = useMemo(() => asTileInstances(tiles), [tiles]);
  const readyKey = instances.map((tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    return handoff.status === "ready" && handoff.geometry ? tile.archetypeId : "";
  }).join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drawn = instances.flatMap((tile) => {
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
      }];
    });
    if (drawn.length === 0) return;
    const reach = instances.reduce(
      (max, tile) => Math.max(max, Math.abs(tile.transform.x), Math.abs(tile.transform.y), Math.abs(tile.transform.z)),
      0,
    );
    drawPlacedMeshes(canvas, drawn, ORBIT_YAW, ORBIT_PITCH, Math.max(reach * 2.4, tileStep() * 1.6), true, 4.6, false, 1.12);
  }, [instances, loaded, readyKey]);

  return (
    <span className="cluster-thumb final-clusters-thumb">
      <canvas ref={canvasRef} width={440} height={260} aria-hidden="true" />
    </span>
  );
}

function OrbitTilePreview({
  tiles,
  meshKey,
  note,
}: {
  tiles: readonly FinalClusterTilePose[];
  meshKey: string;
  note: string;
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
      }];
    });
  }, [loaded, tiles]);

  useEffect(() => {
    ensureArchetypes(tiles.map((tile) => tile.archetypeId));
  }, [ensureArchetypes, tiles]);

  if (instances.length === 0) {
    return <p className="hybrid-units">{note}</p>;
  }
  return (
    <>
      <OrbitClusterView instances={instances} meshKey={`${meshKey}:tiles`} />
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
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const fitCache = useRef<{ width: number; height: number; signature: string; fit: number; center: { x: number; y: number; z: number } } | null>(null);
  const [turn, setTurn] = useState({ yaw: ORBIT_YAW, pitch: ORBIT_PITCH, meshKey });
  if (turn.meshKey !== meshKey) setTurn({ yaw: ORBIT_YAW, pitch: ORBIT_PITCH, meshKey });
  const reach = instances.reduce(
    (max, item) => Math.max(max, Math.abs(item.translate.x), Math.abs(item.translate.y), Math.abs(item.translate.z)),
    0,
  );
  const span = Math.max(reach * 2.4, tileStep() * 1.8, 8);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || instances.length === 0) return;
    const signature = `${span}:${meshKey}`;
    const draw = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width < 8 || height < 8) return;
      const cached = fitCache.current;
      if (cached && cached.width === width && cached.height === height && cached.signature === signature) {
        drawPlacedMeshes(canvas, instances, turn.yaw, turn.pitch, span, false, 4.2, false, 1, cached.center, false, false, cached.fit, 1, 1600);
        return;
      }
      const frame = drawPlacedMeshes(canvas, instances, turn.yaw, turn.pitch, span, false, 4.2, false, 1.08, undefined, true, true, undefined, 1, 1600);
      if (frame) fitCache.current = { width, height, signature, fit: frame.fit, center: frame.center };
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [instances, meshKey, span, turn.pitch, turn.yaw]);

  return (
    <div className="hybrid-preview final-clusters-film-preview" data-orbit="true">
      <canvas
        ref={canvasRef}
        className="hybrid-stage-canvas"
        data-orbit-yaw={turn.yaw.toFixed(3)}
        data-orbit-pitch={turn.pitch.toFixed(3)}
        onPointerDown={(event) => {
          dragRef.current = { x: event.clientX, y: event.clientY, yaw: turn.yaw, pitch: turn.pitch };
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
          setTurn({
            yaw: drag.yaw - dx * 0.008,
            pitch: Math.min(1.2, Math.max(-1.2, drag.pitch - dy * 0.008)),
            meshKey,
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

export function FinalClustersCatalog() {
  const { ensureArchetypes } = useHybrid();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [pairId, setPairId] = useState<FinalClusterPairId>(FINAL_CLUSTER_PAIRS[0].id);
  const [openId, setOpenId] = useState("");
  const [film, setFilm] = useState<IsoMesh | null>(null);
  const [filmLoading, setFilmLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetch("/api/skill4/final-clusters", { cache: "no-store" })
        .then((response) => response.json() as Promise<CatalogResponse>)
        .then((body) => {
          if (!alive) return;
          setCatalog(body);
        })
        .catch(() => {
          if (!alive) return;
          setCatalog(null);
        });
    };
    load();
    const timer = window.setInterval(load, 8000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

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
      setFilmLoading(false);
      return;
    }
    let alive = true;
    setFilm(null);
    setFilmLoading(true);
    void fetch(
      `/api/skill4/final-clusters?pair=${encodeURIComponent(open.pairId)}&id=${encodeURIComponent(open.id)}`,
      { cache: "no-store" },
    )
      .then((response) => response.json() as Promise<{ mesh?: PackedMesh | null }>)
      .then((body) => {
        if (!alive) return;
        setFilm(unpackMesh(body.mesh));
        setFilmLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setFilm(null);
        setFilmLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const phase = catalog?.batch?.running ? catalog.batch.phase : "";
  const counts = new Map<string, number>();
  for (const cluster of catalog?.clusters ?? []) {
    counts.set(cluster.pairId, (counts.get(cluster.pairId) ?? 0) + 1);
  }

  return (
    <main className="hybrid-view hybrid-catalog hybrid-final-clusters">
      <div className="hybrid-catalog-body">
        <div className="hybrid-catalog-main">
          <div className="hybrid-catalog-bar">
            <p className="hybrid-identity">Final Clusters</p>
            <p className="hybrid-units">
              {pair.label} · {clusters.length}/10
              {phase ? ` · ${phase}` : ""}
              {open ? ` · ${open.label}` : ""}
            </p>
          </div>

          <nav className="final-clusters-families" aria-label="Pair families">
            {FINAL_CLUSTER_PAIRS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-active={item.id === pair.id || undefined}
                onClick={() => setPairId(item.id)}
              >
                <span className="hybrid-identity">{item.label}</span>
                <span className="hybrid-units">
                  {KIND_LABEL[item.a]} · {KIND_LABEL[item.b]} · {counts.get(item.id) ?? 0}/10
                </span>
              </button>
            ))}
          </nav>

          {open ? (
            <div className="final-clusters-detail">
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
                  <div className="final-clusters-dna-tiles">
                    {open.names.map((name, index) => (
                      <p key={`${open.id}:${index}:${name}`} className="final-clusters-dna-line">
                        {String(index + 1).padStart(2, "0")} · {name}
                      </p>
                    ))}
                  </div>
                </aside>
                <div className="final-clusters-detail-preview">
                  {film ? (
                    <OrbitClusterView
                      meshKey={open.id}
                      instances={[{
                        id: "film-wrap",
                        mesh: film,
                        translate: { x: 0, y: 0, z: 0 },
                        selected: false,
                        color: [1, 1, 1],
                        plain: true,
                      }]}
                    />
                  ) : (
                    <OrbitTilePreview tiles={open.tiles} meshKey={open.id} note={filmLoading ? "Loading validated film… drag to rotate" : "Tile seating · drag to rotate"} />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="final-clusters-family-panel" data-pair={pair.id} data-kind-a={pair.a} data-kind-b={pair.b}>
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
                      <FinalClusterThumb tiles={cluster.tiles} />
                      <span className="hybrid-units">
                        {cluster.label}
                        <br />
                        {cluster.tileCount} tiles · seed {cluster.seed}
                        {cluster.validated ? <><br />Validated</> : null}
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
