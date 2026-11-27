"use client";

import { useEffect, useMemo, useState } from "react";
import context from "@/data/skill5/herald-site.json";
import type { PlacedCluster } from "@/lib/skill5/placed-cluster";
import type { SiteContext } from "@/lib/skill5/site-model";
import { loadSelectedClusterAssembly, SELECTED_CLUSTER_ASSEMBLY_EVENT } from "./cluster-assembly-catalog";
import type { AssemblySolid } from "./cluster-assembly-layer";
import { occupancyModel, fetchOccupancyMesh, occupancyMeshKey } from "./occupancy-solids";
import { buildVeinChains } from "./site-network-vein-draw";
import { ZONE_COLOR } from "./site-zone-layer";
import { SiteViewport, type SiteViewMode } from "./site-viewport";

const site = context as SiteContext;

type NetworkDraw = { id: string; branches: { x0: number; z0: number; x1: number; z1: number }[] };

type VoidStudy = {
  assemblyId: string;
  selectedNetworkId: string;
  solidCount: number;
  pocketCount: number;
  offsetFt: number;
  voidCubicFeet: number;
  occupiedCubicFeet: number;
  voidComponents: number;
  minSolidGapFt: number;
  processing: string;
  elapsedMs: number;
};

type PackedVoid = {
  triangles: number;
  positions: string;
  normals: string;
  indices: string;
};

/** Solid = void only. Void = clusters only. Both = clusters and void together. */
type LayerFocus = "solid" | "void" | "both";

type VoidCacheEntry = {
  key: string;
  promise: Promise<{ study: VoidStudy; solid: AssemblySolid | null; notice: string }>;
  result?: { study: VoidStudy; solid: AssemblySolid | null; notice: string };
};

/** Bump when the server void path changes so a stuck in-flight request is not reused. */
const VOID_CACHE_VERSION = "shell-wall-v39";

type VoidResult = { study: VoidStudy; solid: AssemblySolid | null; notice: string };

/**
 * Survive remounts AND Fast Refresh — module `let` resets on HMR and blanked BOTH.
 * Keep the in-flight job and last good mesh on globalThis.
 */
const voidRuntime = globalThis as typeof globalThis & {
  __lmVoidCache?: VoidCacheEntry | null;
  __lmLastGoodVoid?: VoidResult | null;
};
if (!("__lmVoidCache" in voidRuntime)) voidRuntime.__lmVoidCache = null;
if (!("__lmLastGoodVoid" in voidRuntime)) voidRuntime.__lmLastGoodVoid = null;

function getVoidCache() {
  return voidRuntime.__lmVoidCache ?? null;
}
function setVoidCache(next: VoidCacheEntry | null) {
  voidRuntime.__lmVoidCache = next;
}
function getLastGoodVoid() {
  return voidRuntime.__lmLastGoodVoid ?? null;
}
function setLastGoodVoid(next: VoidResult | null) {
  voidRuntime.__lmLastGoodVoid = next;
}

export function ClusterDownstream({ sheet }: { sheet: "void" | "integrated-massing" }) {
  const [occupancy, setOccupancy] = useState<PlacedCluster[]>([]);
  const [zones, setZones] = useState<{ id: string; kind: "lobby" | "workspace" | "gathering"; name: string; points: { x: number; z: number }[] }[]>([]);
  const [network, setNetwork] = useState<NetworkDraw | null>(null);
  const [assemblyId, setAssemblyId] = useState<string | null>(null);
  const [meshes, setMeshes] = useState<Record<string, { positions: Float32Array; indices: Uint32Array } | null>>({});
  const [mode, setMode] = useState<SiteViewMode>("perspective");
  const [notice, setNotice] = useState("Loading the saved assembly.");
  const [layer, setLayer] = useState<LayerFocus>("void");
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidStudy, setVoidStudy] = useState<VoidStudy | null>(null);
  const [voidSolid, setVoidSolid] = useState<AssemblySolid | null>(null);
  const [voidError, setVoidError] = useState("");

  useEffect(() => {
    let cancel = false;
    const load = () => {
      void loadSelectedClusterAssembly().then(async (body) => {
        if (cancel) return;
        const assembly = body.assembly;
        setAssemblyId(body.selectedAssemblyId);
        setOccupancy(assembly?.occupancy ?? []);
        setZones((assembly?.zones ?? []).map((zone) => ({ id: zone.id, kind: zone.kind, name: zone.name, points: zone.points })));
        if (!assembly) {
          setNetwork(null);
          setNotice("No saved assembly is active. Save from Cluster Placement.");
          return;
        }
        const archive = await fetch("/api/site/strategy-archive", { cache: "no-store" }).then((response) => response.json()) as {
          iterations?: { id?: string; branches?: NetworkDraw["branches"] }[];
        };
        if (cancel) return;
        const iteration = archive.iterations?.find((item) => item.id === assembly.selectedNetworkId);
        setNetwork(iteration?.id ? { id: iteration.id, branches: iteration.branches ?? [] } : null);
        setNotice(
          sheet === "void"
            ? `${assembly.assemblyId} · network void on the selected assembly.`
            : `Integrated Massing reads ${assembly.assemblyId}. No generation runs on this sheet.`,
        );
      }).catch(() => {
        if (!cancel) setNotice("The saved assembly could not be read.");
      });
    };
    load();
    window.addEventListener(SELECTED_CLUSTER_ASSEMBLY_EVENT, load);
    return () => {
      cancel = true;
      window.removeEventListener(SELECTED_CLUSTER_ASSEMBLY_EVENT, load);
    };
  }, [sheet]);

  useEffect(() => {
    const missing = occupancy.filter((record) => meshes[occupancyMeshKey(record)] === undefined);
    if (missing.length === 0) return;
    let cancel = false;
    void Promise.all(missing.map(async (record) => {
      try {
        return [occupancyMeshKey(record), await fetchOccupancyMesh(record.programId, record.finishedClusterId)] as const;
      } catch {
        return [occupancyMeshKey(record), null] as const;
      }
    })).then((entries) => {
      if (cancel) return;
      setMeshes((current) => {
        const next = { ...current };
        for (const [key, mesh] of entries) if (next[key] === undefined) next[key] = mesh;
        return next;
      });
    });
    return () => { cancel = true; };
  }, [meshes, occupancy]);

  useEffect(() => {
    if (sheet !== "void") return;
    if (!assemblyId || occupancy.length < 2) {
      setVoidStudy(null);
      setVoidSolid(null);
      setVoidError(occupancy.length > 0 && occupancy.length < 2 ? "Network void needs at least two placed clusters." : "");
      return;
    }
    let alive = true;
    setVoidError("");

    const cacheKey = `${VOID_CACHE_VERSION}:${assemblyId}`;
    const cached = getVoidCache();
    if (cached?.key === cacheKey && cached.result) {
      setLastGoodVoid(cached.result);
      setVoidStudy(cached.result.study);
      setVoidSolid(cached.result.solid);
      setLayer("both");
      setNotice(cached.result.notice);
      setVoidBusy(false);
      return;
    }

    /** Keep the previous gel visible — remounts must not blank the viewport for ~2 min. */
    const prior = getLastGoodVoid();
    if (prior?.solid) {
      setVoidStudy(prior.study);
      setVoidSolid(prior.solid);
      setLayer("both");
    }

    setVoidBusy(true);
    setNotice(`Computing network void for ${assemblyId}…`);

    if (!cached || cached.key !== cacheKey) {
      const promise = fetch("/api/skill5/placement-void", { method: "POST" })
        .then(async (response) => {
          const body = await response.json() as VoidStudy & { error?: string; voidMesh?: PackedVoid };
          if (!response.ok) throw new Error(body.error || "Placement void failed.");
          const study: VoidStudy = {
            assemblyId: body.assemblyId,
            selectedNetworkId: body.selectedNetworkId,
            solidCount: body.solidCount,
            pocketCount: body.pocketCount,
            offsetFt: body.offsetFt,
            voidCubicFeet: body.voidCubicFeet,
            occupiedCubicFeet: body.occupiedCubicFeet,
            voidComponents: body.voidComponents,
            minSolidGapFt: body.minSolidGapFt,
            processing: body.processing,
            elapsedMs: body.elapsedMs,
          };
          const solid = body.voidMesh ? unpackVoid(body.voidMesh) : null;
          const gapLabel = Number.isFinite(body.minSolidGapFt)
            ? ` · solid gap ${body.minSolidGapFt.toFixed(2)} ft`
            : "";
          const notice = body.voidMesh && body.voidMesh.triangles > 0
            ? `Void ready · ${body.voidComponents} pockets · ${Math.round(body.voidCubicFeet).toLocaleString()} ft³ · offset ${body.offsetFt} ft from network${gapLabel}.`
            : "Void finished with no accepted volume. Try denser placement or a smaller line offset.";
          const result: VoidResult = { study, solid, notice };
          const entry = getVoidCache();
          if (entry?.key === cacheKey) entry.result = result;
          if (solid) setLastGoodVoid(result);
          return result;
        });
      setVoidCache({ key: cacheKey, promise });
      promise.catch(() => {
        if (getVoidCache()?.key === cacheKey) setVoidCache(null);
      });
    }

    const active = getVoidCache();
    if (!active) return;

    void active.promise
      .then((result) => {
        if (!alive) return;
        if (result.solid) setLastGoodVoid(result);
        setVoidStudy(result.study);
        setVoidSolid(result.solid);
        setLayer("both");
        setNotice(result.notice);
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        const fallback = getLastGoodVoid();
        if (fallback?.solid) {
          setVoidStudy(fallback.study);
          setVoidSolid(fallback.solid);
          setLayer("both");
          setNotice(fallback.notice);
        } else {
          setVoidStudy(null);
          setVoidSolid(null);
        }
        setVoidError(reason instanceof Error ? reason.message : "Placement void failed.");
        if (!fallback?.solid) setNotice("Void could not be measured for this assembly.");
      })
      .finally(() => {
        if (alive) setVoidBusy(false);
      });

    return () => { alive = false; };
  }, [assemblyId, occupancy.length, sheet]);

  const model = useMemo(() => {
    const base = occupancyModel(occupancy, meshes);
    const showClusters = sheet !== "void" || layer === "void" || layer === "both";
    const showVoid = sheet === "void" && (layer === "solid" || layer === "both") && voidSolid;
    const rawBranches = network?.branches ?? [];
    // Void sheet draws the same fluid vein chains as Strategy — not the raw straight edges.
    const branches = sheet === "void"
      ? fluidNetworkBranches(rawBranches)
      : rawBranches;
    const voidForLayer = showVoid && voidSolid
      ? [{
          ...voidSolid,
          // BOTH: gel over clusters. SOLID: denser gel alone.
          opacity: layer === "both" ? 0.98 : 1,
        }]
      : [];
    return {
      ...base,
      zoning: true,
      zoneFills: sheet !== "void",
      zonePalette: ZONE_COLOR,
      branches,
      zones: sheet === "void" ? [] : zones,
      anchors: [],
      link: null,
      clusters: showClusters,
      voids: voidForLayer,
    };
  }, [layer, meshes, network, occupancy, sheet, voidSolid, zones]);

  const title = sheet === "void" ? "Void" : "Integrated Massing";

  return (
    <main className="site-view" data-panels="model" data-sheet={sheet} data-selected-assembly={assemblyId ?? ""}>
      <aside className="site-panel site-panel-library">
        <section className="site-block">
          <h2 className="site-subtitle">{title}</h2>
          <p className="site-note">{notice}</p>
          {sheet === "void" ? (
            <>
              <div className="site-modes" role="group" aria-label="Solid or void">
                <button type="button" data-active={layer === "solid" || undefined} disabled={!voidSolid} onClick={() => setLayer("solid")}>
                  SOLID
                </button>
                <button type="button" data-active={layer === "void" || undefined} onClick={() => setLayer("void")}>
                  VOID
                </button>
                <button type="button" data-active={layer === "both" || undefined} disabled={!voidSolid} onClick={() => setLayer("both")}>
                  BOTH
                </button>
              </div>
              <p className="site-note">
                SOLID shows only the void. VOID shows only the clusters. BOTH shows them together.
              </p>
              {voidBusy ? <p className="site-note">Measuring open space inside the network…</p> : null}
              {voidError ? <p className="site-note">{voidError}</p> : null}
              {voidStudy ? (
                <p className="site-note">
                  {voidStudy.solidCount} clusters · {voidStudy.pocketCount} inset pockets · {voidStudy.voidComponents} void components · {Math.round(voidStudy.voidCubicFeet).toLocaleString()} ft³ · solid gap {voidStudy.minSolidGapFt.toFixed(2)} ft · {voidStudy.elapsedMs} ms
                </p>
              ) : null}
            </>
          ) : (
            <p className="site-note">{occupancy.length} positioned clusters. The parcel, selected network, and approved zoning are the frame. Urban context is held back.</p>
          )}
          {sheet === "void" ? (
            <p className="site-note">{occupancy.length} positioned clusters. Network shell is a stop only — void morphology follows the solids.</p>
          ) : null}
        </section>
      </aside>
      <section className="site-stage" aria-label={title}>
        <div className="site-frame">
          <header className="site-frame-bar">
            <p className="site-note">{assemblyId ?? "No active assembly"}</p>
            <div className="site-modes" role="group" aria-label="Camera">
              <button type="button" data-active={mode === "plan" || undefined} onClick={() => setMode("plan")}>Plan</button>
              <button type="button" data-active={mode === "perspective" || undefined} onClick={() => setMode("perspective")}>View</button>
            </div>
            {sheet === "void" ? (
              <div className="site-modes" role="group" aria-label="Layer">
                <button type="button" data-active={layer === "solid" || undefined} disabled={!voidSolid} onClick={() => setLayer("solid")}>
                  SOLID
                </button>
                <button type="button" data-active={layer === "void" || undefined} onClick={() => setLayer("void")}>
                  VOID
                </button>
                <button type="button" data-active={layer === "both" || undefined} disabled={!voidSolid} onClick={() => setLayer("both")}>
                  BOTH
                </button>
              </div>
            ) : null}
          </header>
          <SiteViewport
            context={site}
            mode={mode}
            fit="site"
            showGrid={false}
            showAerial={false}
            parcelOnly
            frameToken={mode === "plan" ? 1 : 2}
            onReadout={() => {}}
            clusterAssembly={model}
          />
        </div>
      </section>
    </main>
  );
}

/** Expand straight archive edges into short segments along the shaped vein paths. */
function fluidNetworkBranches(branches: NetworkDraw["branches"]) {
  if (branches.length === 0) return [];
  const chains = buildVeinChains(
    branches.map((branch) => ({
      x0: branch.x0,
      z0: branch.z0,
      x1: branch.x1,
      z1: branch.z1,
      conductivity: 1,
    })),
    1,
    3,
  );
  const segments: NetworkDraw["branches"] = [];
  for (const chain of chains) {
    for (let index = 0; index < chain.points.length - 1; index += 1) {
      const from = chain.points[index];
      const to = chain.points[index + 1];
      if (Math.hypot(to.x - from.x, to.z - from.z) < 0.2) continue;
      segments.push({ x0: from.x, z0: from.z, x1: to.x, z1: to.z });
    }
  }
  return segments;
}

function unpackVoid(packed: PackedVoid): AssemblySolid | null {
  if (!(packed.triangles > 0) || !packed.positions || !packed.indices) return null;
  const unpack = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  };
  const positionBytes = unpack(packed.positions);
  const indexBytes = unpack(packed.indices);
  const positions = new Float32Array(positionBytes.buffer, positionBytes.byteOffset, positionBytes.byteLength / 4);
  const indices = new Uint32Array(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength / 4);
  if (positions.length < 9 || indices.length < 3) return null;
  let normals: Float32Array | undefined;
  if (packed.normals) {
    const normalBytes = unpack(packed.normals);
    const next = new Float32Array(normalBytes.buffer, normalBytes.byteOffset, normalBytes.byteLength / 4);
    if (next.length === positions.length) normals = next;
  }
  return {
    id: "habitable-void",
    positions,
    indices,
    normals,
    color: "#0f7377",
    opacity: 1,
  };
}
