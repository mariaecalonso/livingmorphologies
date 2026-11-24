"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import context from "@/data/skill5/herald-site.json";
import type { ClusterAssemblyRecord, PlacedCluster } from "@/lib/skill5/placed-cluster";
import { readOccupancyList } from "@/lib/skill5/placed-cluster";
import type { SiteContext } from "@/lib/skill5/site-model";
import {
  announceWorkingOccupancy,
  loadClusterAssemblies,
  loadDevelopmentCheckpoint,
  readWorkingOccupancy,
  saveClusterAssemblyRecord,
  SELECTED_CLUSTER_ASSEMBLY_EVENT,
  sendAssemblyForDevelopment,
  WORKING_OCCUPANCY_EVENT,
} from "./cluster-assembly-catalog";
import { SELECTED_SITE_NETWORK_EVENT } from "./site-network-archive";
import { occupancyModel, fetchOccupancyMesh, occupancyMeshKey } from "./occupancy-solids";
import { SiteViewport, type SiteViewMode } from "./site-viewport";

const site = context as SiteContext;

function roleOf(id: string, selectedId: string | null, viewingId: string | null) {
  if (id === selectedId) return "Development";
  if (id === viewingId) return "Preview";
  return "Saved";
}

export function ClusterAssemblyView() {
  const [assemblies, setAssemblies] = useState<ClusterAssemblyRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [working, setWorking] = useState<PlacedCluster[]>([]);
  const [meshes, setMeshes] = useState<Record<string, { positions: Float32Array; indices: Uint32Array } | null>>({});
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<SiteViewMode>("plan");
  const [name, setName] = useState("");
  const [checkpointId, setCheckpointId] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    const document = await loadClusterAssemblies();
    setAssemblies(document.assemblies);
    setSelectedId(document.selectedAssemblyId);
    return document;
  }, []);

  const refreshCheckpoint = useCallback(async () => {
    const checkpoint = await loadDevelopmentCheckpoint();
    setCheckpointId(checkpoint.selectedAssemblyId);
    return checkpoint;
  }, []);

  useEffect(() => {
    let live = true;
    void refreshCatalog().then((document) => {
      if (!live) return;
      if (document.selectedAssemblyId) setViewingId(document.selectedAssemblyId);
    }).catch((error: unknown) => {
      if (live) setNotice(error instanceof Error ? error.message : "The Cluster Assembly catalog could not be read.");
    });
    void refreshCheckpoint().catch(() => undefined);
    setWorking(readOccupancyList(readWorkingOccupancy()));
    const onSelected = () => {
      void refreshCatalog();
      void refreshCheckpoint();
    };
    const onWorking = (event: Event) => {
      const occupancy = (event as CustomEvent<{ occupancy?: unknown }>).detail?.occupancy;
      setWorking(readOccupancyList(occupancy ?? readWorkingOccupancy()));
    };
    window.addEventListener(SELECTED_CLUSTER_ASSEMBLY_EVENT, onSelected);
    window.addEventListener(WORKING_OCCUPANCY_EVENT, onWorking);
    window.addEventListener(SELECTED_SITE_NETWORK_EVENT, onSelected);
    return () => {
      live = false;
      window.removeEventListener(SELECTED_CLUSTER_ASSEMBLY_EVENT, onSelected);
      window.removeEventListener(WORKING_OCCUPANCY_EVENT, onWorking);
      window.removeEventListener(SELECTED_SITE_NETWORK_EVENT, onSelected);
    };
  }, [refreshCatalog, refreshCheckpoint]);

  const viewing = assemblies.find((item) => item.assemblyId === viewingId) ?? null;
  const occupancy = viewing?.occupancy ?? working;
  const zones = viewing?.zones ?? [];

  useEffect(() => {
    const controller = new AbortController();
    const missing = occupancy.filter((record) => meshes[occupancyMeshKey(record)] === undefined);
    if (missing.length === 0) return;
    void (async () => {
      for (const record of missing) {
        if (controller.signal.aborted) return;
        const key = occupancyMeshKey(record);
        try {
          const mesh = await fetchOccupancyMesh(record.programId, record.finishedClusterId, controller.signal);
          if (controller.signal.aborted) return;
          setMeshes((current) => (current[key] === undefined ? { ...current, [key]: mesh } : current));
        } catch (error: unknown) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setMeshes((current) => (current[key] === undefined ? { ...current, [key]: null } : current));
        }
      }
    })();
    return () => controller.abort();
  }, [meshes, occupancy]);

  const model = useMemo(() => ({
    ...occupancyModel(occupancy, meshes),
    zoning: zones.length > 0,
    zones: zones.map((zone) => ({ kind: zone.kind, points: zone.points })),
  }), [meshes, occupancy, zones]);

  const saveWorking = async () => {
    const records = readOccupancyList(working);
    if (records.length === 0) {
      setNotice("Place at least one finished cluster in Cluster Placement before saving.");
      return;
    }
    try {
      const saved = await saveClusterAssemblyRecord({
        name: name.trim() || undefined,
        selectedNetworkId: records[0].selectedNetworkId,
        zoningSignature: records[0].zoningSignature,
        zones: [],
        occupancy: records,
        savedFrom: "catalog",
      });
      announceWorkingOccupancy(records);
      setNotice(`Saved ${saved.assemblyId}. Preview does not send it for Development.`);
      await refreshCatalog();
      setViewingId(saved.assemblyId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Cluster Assembly could not be saved.");
    }
  };

  const send = async (assemblyId: string) => {
    try {
      await sendAssemblyForDevelopment(assemblyId);
      setNotice(`${assemblyId} is the Selected Assembly for Development.`);
      await refreshCatalog();
      await refreshCheckpoint();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Cluster Assembly could not be sent for Development.");
    }
  };

  const development = assemblies.find((item) => item.assemblyId === selectedId) ?? null;

  return (
    <main
      className="site-view"
      data-panels="model"
      data-sheet="cluster-assembly"
      data-selected-assembly={selectedId ?? ""}
      data-preview-assembly={viewingId ?? ""}
      data-development-assembly={checkpointId ?? ""}
      data-working-occupancy={String(working.length)}
      data-occupancy-authority={viewing ? "saved" : "working"}
    >
      <aside className="site-panel site-panel-library" aria-label="Cluster assembly catalog">
        <section className="site-block">
          <h2 className="site-subtitle">Cluster Assembly Catalog</h2>
          <p className="site-note">
            {development ? `Development ${development.assemblyId}` : "No assembly is selected for Development."}
            {viewing && viewing.assemblyId !== selectedId ? ` · Preview ${viewing.assemblyId}` : ""}
          </p>
          <input aria-label="Assembly name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Assembly name" />
          <div className="site-modes">
            <button type="button" onClick={() => void saveWorking()}>Save assembly</button>
            <button type="button" disabled={!viewing || viewing.assemblyId === selectedId} onClick={() => viewing && void send(viewing.assemblyId)}>Send for Development</button>
          </div>
          {notice ? <p className="site-note">{notice}</p> : null}
          <p className="site-note">Preview shows a saved assembly. Send for Development is the only action that replaces the canonical selected assembly. Film wrap and joined mass stay outside this checkpoint.</p>
        </section>
        <section className="site-block site-specs" aria-label="Saved assemblies">
          <h2 className="site-subtitle">Assemblies {assemblies.length > 0 ? <span>{assemblies.length}</span> : null}</h2>
          {assemblies.length === 0 ? <p className="site-note">No Cluster Assemblies are saved yet. Place finished clusters, then Save assembly.</p> : (
            <div className="site-gallery" aria-label="Cluster assemblies">
              {assemblies.map((item) => {
                const role = roleOf(item.assemblyId, selectedId, viewingId);
                return (
                  <article
                    key={item.assemblyId}
                    className="site-iteration-card"
                    data-assembly-id={item.assemblyId}
                    data-active={item.assemblyId === viewingId || undefined}
                    data-massing={item.assemblyId === selectedId || undefined}
                    data-assembly-role={role.toLowerCase()}
                  >
                    <button type="button" aria-pressed={item.assemblyId === viewingId} title={role === "Development" ? "Development assembly" : "Preview this assembly"} onClick={() => setViewingId(item.assemblyId)}>
                      <span className="site-iteration-meta">
                        <b>{item.assemblyId} · {role}</b>
                      </span>
                      <span className="site-iteration-meta">
                        <b>{item.name}</b>
                      </span>
                      <span className="site-iteration-meta">
                        <b>Zones</b>
                        <b>{item.occupancy.length}</b>
                      </span>
                      <span className="site-iteration-meta">
                        <b>Clusters</b>
                        <b>{item.sourceFinishedClusterIds.length}</b>
                      </span>
                    </button>
                    <div className="site-modes">
                      <button type="button" disabled={item.assemblyId === selectedId} onClick={() => void send(item.assemblyId)}>Send for Development</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <section className="site-block">
          <h2 className="site-subtitle">Occupancy</h2>
          {occupancy.length === 0 ? <p className="site-note">No finished cluster occupies a zone in this view.</p> : occupancy.map((record) => (
            <p key={record.occupancyId} className="site-note">
              {record.zoneId} · {record.programId} · {record.finishedClusterId} · {record.provenance}
            </p>
          ))}
        </section>
      </aside>
      <section className="site-stage" aria-label="Cluster assembly">
        <div className="site-frame">
          <header className="site-frame-bar">
            <div className="site-frame-name">
              <h2 className="site-subtitle">{viewing ? viewing.assemblyId : "Working occupancy"}</h2>
              <p className="site-note">{viewing ? `${roleOf(viewing.assemblyId, selectedId, viewingId)} · ${viewing.occupancy.length} occupied zones` : `${working.length} occupied working zones`}</p>
            </div>
            <div className="site-modes site-frame-views" role="group" aria-label="Camera">
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
            frameToken={mode === "plan" ? 1 : 2}
            onReadout={() => {}}
            clusterAssembly={model}
          />
        </div>
      </section>
    </main>
  );
}
