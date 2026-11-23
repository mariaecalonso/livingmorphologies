"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { FinishedIteration, FinishedProgram } from "@/lib/skill4/finished-catalog";
import type { PlacementCluster, PlacementRank } from "@/lib/skill4/cluster-placement-rank";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";
import { CLUSTER_PROGRAMS } from "@/lib/skill4/program-tiles";
import { tileStep } from "@/lib/skill4/tiles";
import { polygonAreaSqFt } from "@/lib/skill5/zoning";
import { HybridAssembly } from "@/components/hybrid/hybrid-assembly";
import { HybridState } from "@/components/hybrid/hybrid-state";
import "@/app/lab/hybrid/skill4-interface.css";
import { ZONE_KINDS, type SiteZone, type SiteZoneKind } from "./site-workflow";

type PackedMesh = { triangles: number; positions: string; normals: string; indices: string };

function unpackMesh(packed: PackedMesh | null): IsoMesh | null {
  if (!packed || packed.triangles < 1 || !packed.positions || !packed.indices) return null;
  const view = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  };
  return {
    triangles: packed.triangles,
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

function openStep(id: (typeof STEPS)[number]["id"], router: ReturnType<typeof useRouter>) {
  if (id === "placement") return;
  const params = new URLSearchParams(window.location.search);
  params.set("sheet", id);
  router.push(`/lab/site?${params.toString()}`);
}

export function ClusterPlacementLibrary({
  zones,
  selectedZoneId,
  onSelectZone,
  onInspect,
}: {
  zones: readonly SiteZone[];
  selectedZoneId: string | null;
  onSelectZone: (kind: SiteZoneKind) => void;
  onInspect: (programId: string, clusterId: string) => void;
}) {
  const router = useRouter();
  const selectZone = useRef(onSelectZone);
  selectZone.current = onSelectZone;
  const [programId, setProgramId] = useState("public-lobby");
  const [rank, setRank] = useState<PlacementRank | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState("");
  const [meshes, setMeshes] = useState<Record<string, IsoMesh | null>>({});

  useEffect(() => {
    if (!programId) {
      setRank(null);
      setNotice("");
      setPending(false);
      return;
    }
    const controller = new AbortController();
    setPending(true);
    setNotice("");
    setOpenId("");
    setRank(null);
    fetch(`/api/skill4/finished-catalog?program=${encodeURIComponent(programId)}&view=placement`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unread");
        return response.json() as Promise<PlacementRank | null>;
      })
      .then((body) => {
        if (!body || body.programId !== programId) {
          setRank(null);
          setNotice("No clusters are stored for this program.");
          return;
        }
        setRank(body);
        if (body.zoneKind) selectZone.current(body.zoneKind);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRank(null);
        setNotice("Clusters for this program could not be read.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [programId]);

  useEffect(() => {
    if (!programId || !rank || rank.programId !== programId) {
      setMeshes({});
      return;
    }
    const controller = new AbortController();
    const ids = rank.clusters.map((cluster) => cluster.id);
    void (async () => {
      for (const id of ids) {
        if (controller.signal.aborted) return;
        try {
          const response = await fetch(`/api/skill4/finished-mesh?program=${encodeURIComponent(programId)}&id=${encodeURIComponent(id)}`, { signal: controller.signal });
          const body = await response.json() as { mesh?: PackedMesh | null } | null;
          if (controller.signal.aborted) return;
          const mesh = unpackMesh(body?.mesh ?? null);
          setMeshes((current) => ({ ...current, [id]: mesh }));
        } catch (error: unknown) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
    })();
    return () => controller.abort();
  }, [programId, rank]);

  const zoneKind = rank?.zoneKind ?? null;
  const zoneLabel = ZONE_KINDS.find((item) => item.id === zoneKind)?.label ?? "";
  const matching = zoneKind ? zones.filter((zone) => zone.kind === zoneKind) : [];
  const selected = matching.find((zone) => zone.id === selectedZoneId) ?? null;
  const programName = CLUSTER_PROGRAMS.find((item) => item.id === programId)?.name ?? rank?.name ?? "";

  const rows = rank ? Math.ceil(rank.clusters.length / 2) : 0;

  return (
    <div className="site-strategy-panel site-cluster-board">
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
          {CLUSTER_PROGRAMS.map((program) => (
            <option key={program.id} value={program.id}>{program.name}</option>
          ))}
        </select>
      </label>
      {programId && zoneLabel ? (
        <p className="site-note">
          {programName} · {zoneLabel} zone{selected ? ` · ${Math.round(polygonAreaSqFt(selected.points)).toLocaleString("en-US")} ft²` : ""}. The recommended cluster is the closest match.
          {programId && !pending && rank && matching.length === 0 ? " No zone of this kind is drawn yet." : ""}
        </p>
      ) : null}
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
              active={cluster.id === openId}
              onOpen={() => setOpenId(cluster.id)}
              onInspect={() => onInspect(programId, cluster.id)}
            />
          ))}
        </div>
      ) : null}
      {rank && rank.clusters.length === 0 ? <p className="site-note">No clusters are stored for this program.</p> : null}
    </div>
  );
}

function ClusterCard({
  cluster,
  index,
  mesh,
  active,
  onOpen,
  onInspect,
}: {
  cluster: PlacementCluster;
  index: number;
  mesh: IsoMesh | null;
  active: boolean;
  onOpen: () => void;
  onInspect: () => void;
}) {
  const label = cluster.recommended ? "Recommended" : `Rank ${index + 1}`;
  return (
    <div className="site-cluster-card" data-active={active || cluster.recommended || undefined} data-recommended={cluster.recommended || undefined}>
      <button
        type="button"
        data-active={active || cluster.recommended || undefined}
        title={`${label}. Iteration ${String(cluster.iteration).padStart(2, "0")}. Match ${cluster.score}. ${cluster.meets} of ${cluster.measured} criteria. ${cluster.tileCount} tiles.`}
        onClick={onOpen}
      >
        <span className="site-module-glass">
          <ClusterForm mesh={mesh} />
        </span>
        <em>{label}</em>
      </button>
      <button type="button" className="site-cluster-plus" aria-label={`Open the analysis for ${label}`} onClick={onInspect}>+</button>
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
    void fetch(`/api/skill4/finished-catalog?program=${encodeURIComponent(programId)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json() as Promise<FinishedProgram | null>)
      .then((program) => {
        if (controller.signal.aborted) return;
        setIteration(program?.iterations.find((item) => item.id === clusterId) ?? null);
      })
      .catch(() => undefined);
    void fetch(`/api/skill4/finished-mesh?program=${encodeURIComponent(programId)}&id=${encodeURIComponent(clusterId)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json() as Promise<{ mesh?: PackedMesh | null } | null>)
      .then((body) => {
        if (controller.signal.aborted) return;
        setMesh(unpackMesh(body?.mesh ?? null));
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
