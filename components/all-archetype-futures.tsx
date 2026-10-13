"use client";

import { useEffect, useState } from "react";
import { drawClay } from "@/components/experiment-clay-render";
import type { IsoMesh } from "@/lib/scan/isomesh";

type PackedMesh = { encoding: "isomesh-base64"; positions: string; normals: string; indices: string; triangles: number } | null;
type Point = [number, number, number];
type Filter = "all" | "healthy" | "flagged";

type Source = {
  category: string;
  categoryLabel: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
};

type Entry = {
  continuationId: string;
  moduleId: string;
  continuationSeed: number;
  z0Iteration: number;
  parentChecksum: string;
  solidFraction: number;
  components: number;
  openingSize: number;
  centroid: Point;
  wall: Point;
  flags: string[];
  mesh: IsoMesh | null;
};

type ManifestModule = {
  archetypeId: string;
  candidateId: number;
  flags: string[];
  solidFraction: number;
};

type Payload = {
  sources: Source[];
  manifest: { blur: number; modules: ManifestModule[] };
};

function unpack(mesh: PackedMesh): IsoMesh | null {
  if (!mesh) return null;
  const positions = new Float32Array(Uint8Array.from(atob(mesh.positions), (char) => char.charCodeAt(0)).buffer);
  const normals = new Float32Array(Uint8Array.from(atob(mesh.normals), (char) => char.charCodeAt(0)).buffer);
  const indices = new Uint32Array(Uint8Array.from(atob(mesh.indices), (char) => char.charCodeAt(0)).buffer);
  return { positions, normals, indices, triangles: mesh.triangles };
}

function ClayCanvas({ mesh, yaw, pitch }: { mesh: IsoMesh; yaw: number; pitch: number }) {
  const [node, setNode] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!node) return;
    drawClay(node, mesh, yaw, pitch, true);
  }, [node, mesh, yaw, pitch]);
  return <canvas ref={setNode} />;
}

export function AllArchetypeFutures() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [boards, setBoards] = useState<Record<string, Entry[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vertical/experiments/carved-mass/dataset")
      .then(async (response) => {
        const body = (await response.json()) as Payload & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "The dataset manifest did not load.");
        if (cancelled) return;
        setPayload(body);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "The dataset manifest did not load.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    const load = async () => {
      for (const source of payload.sources) {
        if (cancelled) return;
        const key = `${source.archetypeId}:${source.candidateId}`;
        const response = await fetch(`/api/vertical/experiments/carved-mass/dataset?archetype=${source.archetypeId}&candidate=${source.candidateId}`);
        const body = (await response.json()) as { entries?: Array<Omit<Entry, "mesh"> & { mesh: PackedMesh }>; error?: string };
        if (!response.ok) throw new Error(body.error ?? `${source.archetypeName} did not load.`);
        if (cancelled) return;
        setBoards((current) => ({
          ...current,
          [key]: (body.entries ?? []).map((entry) => ({ ...entry, mesh: unpack(entry.mesh) })),
        }));
      }
    };
    load().catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "An archetype board did not load.");
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const yaw = 0.62;
  const pitch = 0.42;
  const categories = ["Lobby", "Workspace", "Gathering"] as const;

  return (
    <div className="carved-mass">
      <div className="carved-mass-frame">
        <h1>ALL ARCHETYPES · 24 TEMPORAL FUTURES</h1>
        <p className="carved-mass-note">
          {payload
            ? `Fifteen verified Z0 states. Shared blur ${payload.manifest.blur.toFixed(2)}. ${payload.manifest.modules.length} modules.`
            : "Fifteen verified Z0 states. Shared blur 0.24."}
        </p>
        <div className="carved-mass-toggles">
          {(["all", "healthy", "flagged"] as const).map((item) => (
            <button key={item} type="button" data-on={filter === item ? "true" : "false"} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
        {error ? <p>{error}</p> : null}
        {!payload && !error ? <p className="carved-mass-note">Reading the manifest.</p> : null}
        {payload
          ? categories.map((label) => (
            <section key={label}>
              <h2>{label}</h2>
              {payload.sources.filter((source) => source.categoryLabel === label).map((source) => {
                const key = `${source.archetypeId}:${source.candidateId}`;
                const entries = (boards[key] ?? []).filter((entry) => {
                  if (filter === "flagged") return entry.flags.length > 0;
                  if (filter === "healthy") return entry.flags.length === 0;
                  return true;
                });
                const checksum = boards[key]?.[0]?.parentChecksum;
                const z0 = boards[key]?.[0]?.z0Iteration;
                return (
                  <section key={key} className="carved-mass-case">
                    <h2>{source.archetypeName} · {source.candidateId}</h2>
                    <p className="carved-mass-note">
                      {z0 ? `Verified Z0 ${z0} ${checksum}. ` : ""}
                      {boards[key] ? `${entries.length} shown.` : "Loading the 24 futures."}
                    </p>
                    <div className="blur-grid">
                      {entries.map((entry) => (
                        <section key={entry.moduleId} className={entry.flags.length ? "audit-shared" : undefined}>
                          <h2>{entry.continuationId}</h2>
                          <div className="carved-mass-well">
                            {entry.mesh ? <ClayCanvas mesh={entry.mesh} yaw={yaw} pitch={pitch} /> : null}
                            <span>iso</span>
                          </div>
                          <p className="carved-mass-meta">
                            solid {entry.solidFraction.toFixed(2)} · {entry.components} body · opening {entry.openingSize}
                          </p>
                          <p className="carved-mass-meta">
                            centroid {entry.centroid.map((value) => value.toFixed(2)).join(", ")}
                          </p>
                          <p className="carved-mass-meta">seed {entry.continuationSeed}</p>
                          {entry.flags.length ? <p className="carved-mass-meta">{entry.flags.join(", ")}</p> : null}
                        </section>
                      ))}
                    </div>
                  </section>
                );
              })}
            </section>
          ))
          : null}
      </div>
    </div>
  );
}
