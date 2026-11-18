"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClusterRecord } from "@/lib/skill6/contract";
import { ClusterView, assemblyGeometry, type EncodedAssemblyMesh, type ViewArchetype, type ViewExtra } from "@/components/clustering/cluster-view";
import styles from "@/components/clustering/clustering-workspace.module.css";

export type StoredAssembly = { raw: EncodedAssemblyMesh | null; refined: EncodedAssemblyMesh | null; patches: (EncodedAssemblyMesh | null)[] };

const refinedSurfaces = new Map<string, Promise<ViewExtra[]>>();
const fullAssemblies = new Map<string, Promise<ViewExtra[]>>();

/** The stored refined surface for a catalog card. Fetched once per cluster. */
export function refinedFor(id: string, collection: string | null): Promise<ViewExtra[]> {
  const key = `${collection ?? "catalog"}:${id}`;
  const cached = refinedSurfaces.get(key);
  if (cached) return cached;
  const collectionQuery = collection ? `&collection=${encodeURIComponent(collection)}` : "";
  const pending = fetch(`/api/clustering/assembly?id=${encodeURIComponent(id)}&part=refined${collectionQuery}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(id);
      const body = await response.json() as StoredAssembly;
      return body.refined ? [{ id: "refined", geometry: assemblyGeometry(body.refined), color: "#eceae6" }] : [];
    });
  pending.catch(() => refinedSurfaces.delete(key));
  refinedSurfaces.set(key, pending);
  return pending;
}

/** Raw union, refined surface, and patches for one stored assembly. Fetched once per cluster. */
export function assemblyFor(id: string, collection: string | null): Promise<ViewExtra[]> {
  const key = `${collection ?? "catalog"}:${id}`;
  const cached = fullAssemblies.get(key);
  if (cached) return cached;
  const collectionQuery = collection ? `&collection=${encodeURIComponent(collection)}` : "";
  const pending = fetch(`/api/clustering/assembly?id=${encodeURIComponent(id)}${collectionQuery}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(id);
      const body = await response.json() as StoredAssembly;
      const list: ViewExtra[] = [];
      if (body.raw) list.push({ id: "union", geometry: assemblyGeometry(body.raw), color: "#d5d5d5" });
      if (body.refined) list.push({ id: "refined", geometry: assemblyGeometry(body.refined), color: "#eceae6" });
      for (const patch of body.patches) if (patch) list.push({ id: "patch", geometry: assemblyGeometry(patch), color: "#c77e5f" });
      return list;
    });
  pending.catch(() => fullAssemblies.delete(key));
  fullAssemblies.set(key, pending);
  return pending;
}

/** Tiles at their seated poses when an assembly is stored. */
export function seatedTilesOf(cluster: ClusterRecord) {
  const seated = new Map(cluster.assembly?.seatedTiles.map((item) => [item.instanceId, item.pose]) ?? []);
  return cluster.tiles.map((item) => ({ ...item, pose: seated.get(item.instanceId) ?? item.pose }));
}

const REFINED_ONLY = ["refined"];

export function CardView({ cluster, archetypes, collection }: { cluster: ClusterRecord; archetypes: readonly ViewArchetype[]; collection: string | null }) {
  const [extras, setExtras] = useState<ViewExtra[] | null>(null);
  useEffect(() => {
    let live = true;
    void refinedFor(cluster.id, collection).then((list) => { if (live) setExtras(list); }).catch(() => undefined);
    return () => { live = false; };
  }, [cluster.id, collection]);
  const tiles = useMemo(() => seatedTilesOf(cluster), [cluster]);
  if (!extras) return <span className={styles.miss}>Loading</span>;
  return <ClusterView tiles={tiles} archetypes={archetypes} selectedId={null} interactive={false} extras={extras} shownExtras={REFINED_ONLY} hideTiles floorZ={0} />;
}
