"use client";

import { useEffect, useMemo, useState } from "react";
import context from "@/data/skill5/herald-site.json";
import type { PlacedCluster } from "@/lib/skill5/placed-cluster";
import type { SiteContext } from "@/lib/skill5/site-model";
import { loadSelectedClusterAssembly, SELECTED_CLUSTER_ASSEMBLY_EVENT } from "./cluster-assembly-catalog";
import { occupancyModel, fetchOccupancyMesh, occupancyMeshKey } from "./occupancy-solids";
import { ZONE_COLOR } from "./site-zone-layer";
import { SiteViewport, type SiteViewMode } from "./site-viewport";

const site = context as SiteContext;

type NetworkDraw = { id: string; branches: { x0: number; z0: number; x1: number; z1: number }[] };

export function ClusterDownstream({ sheet }: { sheet: "void" | "integrated-massing" }) {
  const [occupancy, setOccupancy] = useState<PlacedCluster[]>([]);
  const [zones, setZones] = useState<{ id: string; kind: "lobby" | "workspace" | "gathering"; name: string; points: { x: number; z: number }[] }[]>([]);
  const [network, setNetwork] = useState<NetworkDraw | null>(null);
  const [assemblyId, setAssemblyId] = useState<string | null>(null);
  const [meshes, setMeshes] = useState<Record<string, { positions: Float32Array; indices: Uint32Array } | null>>({});
  const [mode, setMode] = useState<SiteViewMode>("perspective");
  const [notice, setNotice] = useState("Loading the saved assembly.");

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
        setNotice(`${sheet === "void" ? "Void" : "Integrated Massing"} reads ${assembly.assemblyId}. No generation runs on this sheet.`);
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

  const model = useMemo(() => ({
    ...occupancyModel(occupancy, meshes),
    zoning: true,
    zoneFills: true,
    zonePalette: ZONE_COLOR,
    branches: network?.branches ?? [],
    zones,
    anchors: [],
    link: null,
  }), [meshes, network, occupancy, zones]);

  const title = sheet === "void" ? "Void" : "Integrated Massing";

  return (
    <main className="site-view" data-panels="model" data-sheet={sheet} data-selected-assembly={assemblyId ?? ""}>
      <aside className="site-panel site-panel-library">
        <section className="site-block">
          <h2 className="site-subtitle">{title}</h2>
          <p className="site-note">{notice}</p>
          <p className="site-note">{occupancy.length} positioned clusters. The parcel, selected network, and approved zoning are the frame. Urban context is held back.</p>
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
