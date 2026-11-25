"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { FinishedIteration, FinishedProgram } from "@/lib/skill4/finished-catalog";
import type { PlacementCluster, PlacementRank } from "@/lib/skill4/cluster-placement-rank";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";
import { fetchFinishedMeshPacked, fetchPlacementRank, type PackedFinishedMesh } from "@/lib/skill4/finished-mesh-client";
import { CLUSTER_PROGRAMS } from "@/lib/skill4/program-tiles";
import { tileStep } from "@/lib/skill4/tiles";
import { polygonAreaSqFt } from "@/lib/skill5/zoning";
import { HybridAssembly } from "@/components/hybrid/hybrid-assembly";
import { HybridState } from "@/components/hybrid/hybrid-state";
import "@/app/lab/hybrid/skill4-interface.css";
import { occupancyInZone, programsForZoneKind, type PlacedCluster } from "@/lib/skill5/placed-cluster";
import { PROGRAM_CLUSTER_2_ARCHIVED } from "@/lib/site-map";
import { ZONE_KINDS, type SiteZone, type SiteZoneKind } from "./site-workflow";

function unpackMesh(packed: PackedFinishedMesh | null): IsoMesh | null {
  if (!packed || (packed.triangles ?? 0) < 1 || !packed.positions || !packed.indices) return null;
  const view = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  };
  return {
    triangles: packed.triangles ?? 0,
    positions: new Float32Array(view(packed.positions)),
    normals: new Float32Array(view(packed.normals || "")),
    indices: new Uint32Array(view(packed.indices)),
  };
}

const STEPS = [
  { id: "compatibility", label: "Tile Compatibility" },
  { id: "placement", label: "Cluster Placement" },
  { id: "morphology", label: "Morphology Review" },
] as const;

const DRAG_THRESHOLD_PX = 6;

export type ClusterDragPayload = {
  programId: string;
  clusterId: string;
  recommended: boolean;
  label: string;
};

function openStep(id: (typeof STEPS)[number]["id"], router: ReturnType<typeof useRouter>) {
  if (id === "placement") return;
  const params = new URLSearchParams(window.location.search);
  params.set("sheet", id);
  router.push(`/lab/site?${params.toString()}`);
}

export function ClusterPlacementLibrary({
  zones,
  selectedZoneId,
  occupancy,
  assist = "manual",
  pocketReady = false,
  onSelectZone,
  onInspect,
  onPlace,
  onDragMove,
  onDragEnd,
}: {
  zones: readonly SiteZone[];
  selectedZoneId: string | null;
  occupancy: readonly PlacedCluster[];
  assist?: "manual" | "ranked";
  /** True when a network pocket is selected so Place can bind that pocket as a zone. */
  pocketReady?: boolean;
  onSelectZone: (kind: SiteZoneKind) => void;
  onInspect: (programId: string, clusterId: string) => void;
  onPlace: (programId: string, clusterId: string, recommended: boolean) => void;
  /** While dragging a catalog cluster over the site. */
  onDragMove?: (payload: ClusterDragPayload, clientX: number, clientY: number) => void;
  /** Drop a catalog cluster at a screen point over the site. */
  onDragEnd?: (payload: ClusterDragPayload, clientX: number, clientY: number) => void;
}) {
  const router = useRouter();
  const selectZone = useRef(onSelectZone);
  selectZone.current = onSelectZone;
  const selectedZoneIdRef = useRef(selectedZoneId);
  selectedZoneIdRef.current = selectedZoneId;
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const compatibleIds = selectedZone ? programsForZoneKind(selectedZone.kind) : CLUSTER_PROGRAMS.map((item) => item.id);
  const [programId, setProgramId] = useState("public-lobby");
  const [rank, setRank] = useState<PlacementRank | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState("");
  const [meshes, setMeshes] = useState<Record<string, IsoMesh | null>>({});
  const [ghost, setGhost] = useState<{ label: string; x: number; y: number } | null>(null);
  const dragMove = useRef(onDragMove);
  dragMove.current = onDragMove;
  const dragEnd = useRef(onDragEnd);
  dragEnd.current = onDragEnd;

  useEffect(() => {
    if (!programId) {
      setRank(null);
      setNotice("");
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    setNotice("");
    setOpenId("");
    setRank(null);
    void fetchPlacementRank(programId)
      .then((body) => {
        if (cancelled) return;
        const rankBody = body as PlacementRank | null;
        if (!rankBody || rankBody.programId !== programId) {
          setRank(null);
          setNotice("No clusters are stored for this program.");
          return;
        }
        setRank(rankBody);
        if (rankBody.zoneKind && !selectedZoneIdRef.current) selectZone.current(rankBody.zoneKind);
      })
      .catch(() => {
        if (cancelled) return;
        setRank(null);
        setNotice("Clusters for this program could not be read.");
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  useEffect(() => {
    if (!programId || !rank || rank.programId !== programId) return;
    let cancelled = false;
    const ids = rank.clusters.map((cluster) => cluster.id);
    void Promise.all(ids.map(async (id) => {
      const packed = await fetchFinishedMeshPacked(programId, id);
      return [id, unpackMesh(packed)] as const;
    })).then((entries) => {
      if (cancelled) return;
      setMeshes((current) => {
        const next = { ...current };
        for (const [id, mesh] of entries) next[id] = mesh;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [programId, rank]);

  useEffect(() => {
    if (!selectedZone) return;
    const ids = programsForZoneKind(selectedZone.kind);
    if (!ids.includes(programId)) setProgramId(ids[0] ?? programId);
  }, [programId, selectedZone]);

  useEffect(() => {
    if (assist !== "ranked" || !rank?.clusters[0]) return;
    setOpenId(rank.clusters[0].id);
  }, [assist, rank]);

  useEffect(() => {
    const kind = selectedZone?.kind ?? rank?.zoneKind;
    if (!kind || selectedZoneId) return;
    if (zones.some((zone) => zone.kind === kind)) selectZone.current(kind);
  }, [rank?.zoneKind, selectedZone, selectedZoneId, zones]);

  const zoneKind = selectedZone?.kind ?? rank?.zoneKind ?? null;
  const zoneLabel = ZONE_KINDS.find((item) => item.id === zoneKind)?.label ?? "";
  const matching = zoneKind ? zones.filter((zone) => zone.kind === zoneKind) : [];
  const selected = selectedZone ?? matching.find((zone) => zone.id === selectedZoneId) ?? null;
  const programName = CLUSTER_PROGRAMS.find((item) => item.id === programId)?.name ?? rank?.name ?? "";
  const placed = selected ? occupancyInZone(occupancy, selected.id) : null;
  const programOptions = CLUSTER_PROGRAMS.filter((program) => compatibleIds.includes(program.id));

  const rows = rank ? Math.ceil(rank.clusters.length / 2) : 0;

  const beginDrag = (payload: ClusterDragPayload, event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    const onMove = (next: PointerEvent) => {
      const dx = next.clientX - startX;
      const dy = next.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      setGhost({ label: payload.label, x: next.clientX, y: next.clientY });
      dragMove.current?.(payload, next.clientX, next.clientY);
    };
    const onUp = (next: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setGhost(null);
      if (!dragging) {
        setOpenId(payload.clusterId);
        return;
      }
      dragEnd.current?.(payload, next.clientX, next.clientY);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  if (PROGRAM_CLUSTER_2_ARCHIVED) return null;

  return (
    <div
      className="site-strategy-panel site-cluster-board"
      data-authority-class="working"
      data-occupancy-authority="working"
      data-zone-occupied={placed ? "true" : undefined}
    >
      <nav className="site-kind-toggle site-cluster-steps" aria-label="Cluster placement pages">
        {STEPS.map((step) => (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={step.id === "placement"}
            data-active={step.id === "placement" || undefined}
            onClick={() => openStep(step.id, router)}
          >
            {step.label}
          </button>
        ))}
      </nav>
      <label className="site-connection-field site-cluster-program">
        Program
        <select
          aria-label="Program"
          value={programId}
          onChange={(event) => setProgramId(event.target.value)}
        >
          {programOptions.map((program) => (
            <option key={program.id} value={program.id}>{program.name}</option>
          ))}
        </select>
      </label>
      {programId && zoneLabel ? (
        <p className="site-note">
          {programName} · {zoneLabel}. Drag a cluster onto a pocket on the site. Place still uses the selected pocket.
          {!pocketReady && !selected ? " Or click a pocket first, then Place." : ""}
          {placed ? ` ${placed.finishedClusterId} occupies this zone.` : ""}
        </p>
      ) : (
        <p className="site-note">Drag a cluster onto a pocket on the site.</p>
      )}
      {pending ? <p className="site-note">Reading clusters</p> : null}
      {notice ? <p className="site-note">{notice}</p> : null}
      {rank && rank.clusters.length > 0 ? (
        <div className="site-gallery site-gallery-clusters" aria-label="Ranked clusters" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
          {rank.clusters.map((cluster, index) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              index={index}
              mesh={meshes[cluster.id] ?? null}
              active={cluster.id === openId || placed?.finishedClusterId === cluster.id}
              occupied={placed?.finishedClusterId === cluster.id}
              canPlace={Boolean(selected) || pocketReady}
              replace={Boolean(placed) && placed?.finishedClusterId !== cluster.id}
              onInspect={() => onInspect(programId, cluster.id)}
              onPlace={() => onPlace(programId, cluster.id, cluster.recommended)}
              onDragStart={(event) => beginDrag({
                programId,
                clusterId: cluster.id,
                recommended: cluster.recommended,
                label: cluster.recommended ? "Recommended" : `Rank ${index + 1}`,
              }, event)}
            />
          ))}
        </div>
      ) : null}
      {rank && rank.clusters.length === 0 ? <p className="site-note">No clusters are stored for this program.</p> : null}
      {ghost ? (
        <div className="site-cluster-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          {ghost.label}
        </div>
      ) : null}
    </div>
  );
}

function ClusterCard({
  cluster,
  index,
  mesh,
  active,
  occupied,
  canPlace,
  replace,
  onInspect,
  onPlace,
  onDragStart,
}: {
  cluster: PlacementCluster;
  index: number;
  mesh: IsoMesh | null;
  active: boolean;
  occupied: boolean;
  canPlace: boolean;
  replace: boolean;
  onInspect: () => void;
  onPlace: () => void;
  onDragStart: (event: ReactPointerEvent) => void;
}) {
  const label = cluster.recommended ? "Recommended" : `Rank ${index + 1}`;
  const placeLabel = occupied ? "Placed" : replace ? "Replace" : "Place";
  return (
    <div className="site-cluster-card" data-active={active || cluster.recommended || undefined} data-recommended={cluster.recommended || undefined} data-occupied={occupied || undefined}>
      <button
        type="button"
        data-active={active || cluster.recommended || undefined}
        title={`Drag onto a pocket. ${label}. Iteration ${String(cluster.iteration).padStart(2, "0")}. Match ${cluster.score}%. ${cluster.meets} of ${cluster.measured} criteria. ${cluster.tileCount} tiles. ${Math.round(cluster.habitableArea)} ft².`}
        onPointerDown={onDragStart}
      >
        <span className="site-module-glass">
          <ClusterForm mesh={mesh} />
        </span>
        <em>{label} · {cluster.score}% · {cluster.tileCount} tiles · {Math.round(cluster.habitableArea)} ft²</em>
      </button>
      <button type="button" className="site-cluster-plus" aria-label={`Open the analysis for ${label}`} onClick={onInspect}>+</button>
      <button
        type="button"
        className="site-cluster-place"
        disabled={!canPlace || occupied}
        aria-label={`${placeLabel} ${label} in the selected zone`}
        onClick={onPlace}
      >
        {placeLabel}
      </button>
    </div>
  );
}

export function ClusterInspect({
  programId,
  clusterId,
  onClose,
}: {
  programId: string;
  clusterId: string;
  onClose: () => void;
}) {
  const [iteration, setIteration] = useState<FinishedIteration | null>(null);
  const [mesh, setMesh] = useState<IsoMesh | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setIteration(null);
    setMesh(null);
    void fetch(`/api/skill4/finished-catalog?program=${encodeURIComponent(programId)}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<FinishedProgram | null>)
      .then((program) => {
        if (controller.signal.aborted) return;
        setIteration(program?.iterations.find((item) => item.id === clusterId) ?? null);
      })
      .catch(() => undefined);
    void fetchFinishedMeshPacked(programId, clusterId)
      .then((packed) => {
        if (controller.signal.aborted) return;
        setMesh(unpackMesh(packed));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [programId, clusterId]);
  return (
    <div className="site-cluster-inspect" data-cluster-inspect="">
      <button type="button" className="site-cluster-back" onClick={onClose}>Back to Cluster Placement</button>
      <div className="cluster-placement-work">
        {mesh ? (
          <HybridState>
            <HybridAssembly frame="canvas" assemblyFilm={mesh} clusterValidated studyProgramId={programId} studyIteration={iteration} />
          </HybridState>
        ) : (
          <p className="site-note">Reading this cluster.</p>
        )}
      </div>
    </div>
  );
}

function ClusterForm({ mesh }: { mesh: IsoMesh | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = canvas?.parentElement;
    if (!canvas || !frame) return;
    canvas.getContext("webgl2", { antialias: true, alpha: true, depth: true, premultipliedAlpha: true });
    const paint = () => {
      if (!mesh || mesh.triangles < 1 || frame.clientHeight < 2) return;
      drawPlacedMeshes(canvas, [{
        id: "shrinkwrap",
        mesh,
        translate: { x: 0, y: 0, z: 0 },
        selected: false,
        color: [1, 1, 1] as [number, number, number],
        opacity: 1,
        plain: true,
      }], 0.8, -1.05, tileStep() * 8, false, 4.2, false, 1, undefined, true, false, undefined, 1, 480, [0, 0, 0, 0]);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [mesh]);
  return <canvas ref={canvasRef} width={440} height={240} aria-hidden="true" />;
}
