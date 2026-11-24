"use client";

import { useEffect, useMemo, useState } from "react";
import context from "@/data/skill5/herald-site.json";
import { analyzeShrinkwrapVoid } from "@/lib/skill4/cluster-void";
import type { ClusterAssemblyReport } from "@/lib/skill5/cluster-assembly-report";
import type { SiteContext } from "@/lib/skill5/site-model";
import { ClusterAssemblyLayer, type AssemblySolid, type ClusterAssemblyModel } from "./cluster-assembly-layer";
import { SiteViewport, type SiteViewMode } from "./site-viewport";

const site = context as SiteContext;

function unpackF32(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Float32Array(bytes.buffer);
}

function unpackU32(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Uint32Array(bytes.buffer);
}

function solid(id: string, packed: { positions: string; indices: string } | null, color: string, opacity: number): AssemblySolid | null {
  if (!packed) return null;
  return { id, positions: unpackF32(packed.positions), indices: unpackU32(packed.indices), color, opacity };
}

type VoidReading = {
  programId: string;
  floor: number;
  volume: number;
  height: number;
  width: number;
  depth: number;
  solids: AssemblySolid[];
};

function voidSolid(id: string, mesh: { positions: Float32Array; indices: Uint32Array } | null): AssemblySolid | null {
  if (!mesh || mesh.indices.length < 12) return null;
  return { id, positions: mesh.positions, indices: mesh.indices, color: "#49d7de", opacity: 0.85 };
}

function feet(value: number) {
  return `${Math.round(value)} ft`;
}

function point(value: { x: number; y: number; z: number }) {
  return `${Math.round(value.x)}, ${Math.round(value.y)}, ${Math.round(value.z)}`;
}

export function ClusterAssemblyView() {
  const [report, setReport] = useState<ClusterAssemblyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SiteViewMode>("plan");
  const [frame, setFrame] = useState<"pair" | "site">("site");
  const [layers, setLayers] = useState({ zoning: true, clusters: true, voids: false, connections: true, massing: true });
  const [voidReadings, setVoidReadings] = useState<VoidReading[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/site/cluster-assembly")
      .then(async (response) => {
        const body = await response.json() as ClusterAssemblyReport & { error?: string };
        if (!response.ok) throw new Error(body.error || "Assembly failed.");
        if (live) setReport(body);
      })
      .catch((reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : "Assembly failed.");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!layers.voids || !report || voidReadings) return;
    let cancel = false;
    const clusters = report.meshes.clusters;
    const readings: VoidReading[] = [];
    let index = 0;
    const step = () => {
      if (cancel) return;
      const mesh = clusters[index];
      if (!mesh) {
        setVoidReadings(readings);
        return;
      }
      const positions = unpackF32(mesh.positions);
      const indices = unpackU32(mesh.indices);
      const measured = analyzeShrinkwrapVoid({
        triangles: indices.length / 3,
        positions,
        normals: new Float32Array(positions.length),
        indices,
      });
      const solids = [
        voidSolid(`${mesh.programId}-void`, measured.mesh),
        voidSolid(`${mesh.programId}-pockets`, measured.pocketsMesh),
      ].flatMap((item) => item ? [item] : []);
      readings.push({
        programId: mesh.programId,
        floor: measured.floorSquareFeet,
        volume: measured.volumeCubicFeet,
        height: measured.maxHeightFeet,
        width: measured.widthFeet,
        depth: measured.depthFeet,
        solids,
      });
      index += 1;
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
    return () => {
      cancel = true;
    };
  }, [layers.voids, report, voidReadings]);

  const model = useMemo<ClusterAssemblyModel | null>(() => {
    if (!report) return null;
    const tested = new Set(["primary-lobby", "central-gathering"]);
    return {
      zoning: layers.zoning,
      clusters: layers.clusters,
      connections: layers.connections,
      massing: layers.massing,
      branches: report.branches,
      zones: report.zones,
      anchors: report.anchors.map((anchor) => ({ id: anchor.id, x: anchor.x, z: anchor.z, tested: tested.has(anchor.role) })),
      link: layers.zoning ? {
        ax: report.link.fromAnchor.x,
        az: report.link.fromAnchor.z,
        bx: report.link.toAnchor.x,
        bz: report.link.toAnchor.z,
      } : null,
      solids: report.meshes.clusters.flatMap((mesh) => {
        const item = solid(mesh.programId, mesh, "#f5f5f2", 1);
        return item ? [item] : [];
      }),
      voids: layers.voids && voidReadings ? voidReadings.flatMap((reading) => reading.solids) : [],
      hybrid: solid("hybrid", report.meshes.hybrid, "#49d7de", 0.86),
      wrap: solid("wrap", report.meshes.wrap, "#f5f5f2", 1),
    };
  }, [layers, report, voidReadings]);

  const link = report?.link;
  const focus = useMemo(() => {
    if (frame === "site" || !link) return null;
    const padX = 130;
    const padZ = 150;
    const minX = Math.min(link.fromAnchor.x, link.toAnchor.x) - padX;
    const maxX = Math.max(link.fromAnchor.x, link.toAnchor.x) + padX;
    const minZ = Math.min(link.fromAnchor.z, link.toAnchor.z) - padZ;
    const maxZ = Math.max(link.fromAnchor.z, link.toAnchor.z) + padZ;
    const width = maxX - minX;
    const depth = Math.max(180, maxZ - minZ);
    return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, width, depth, span: Math.max(width, depth) };
  }, [frame, link]);
  const toggle = (key: keyof typeof layers) => setLayers((current) => ({ ...current, [key]: !current[key] }));

  return (
    <main className="site-view" data-panels="model" data-sheet="cluster-assembly">
      <aside className="site-panel site-panel-library" aria-label="Cluster assembly">
        <section className="site-block">
          <h2 className="site-subtitle">Cluster Assembly</h2>
          <p className="site-note">Iteration 101 · City-side experimental lobby · seed 20365850</p>
          {error ? <p className="site-note">{error}</p> : null}
          {!report && !error ? <p className="site-note">Placing each cluster inside a pocket that states its program.</p> : null}
          {link ? (
            <div className="site-specs">
              <p className="site-stat"><span>Public Lobby anchor</span><strong>{Math.round(link.fromAnchor.x)}, {Math.round(link.fromAnchor.z)}</strong></p>
              <p className="site-stat"><span>Central Gathering anchor</span><strong>{Math.round(link.toAnchor.x)}, {Math.round(link.toAnchor.z)}</strong></p>
              <p className="site-stat"><span>Cluster separation</span><strong>{feet(link.separationFt)}</strong></p>
              <p className="site-stat"><span>Portal A</span><strong>{point(link.portalA.center)}</strong><em>{Math.round(link.portalA.areaSqFt)} ft² · r {Math.round(link.portalA.radiusFt)}</em></p>
              <p className="site-stat"><span>Portal B</span><strong>{point(link.portalB.center)}</strong><em>{Math.round(link.portalB.areaSqFt)} ft² · r {Math.round(link.portalB.radiusFt)}</em></p>
              <p className="site-stat"><span>Portal distance</span><strong>{feet(link.distanceFt)}</strong></p>
              <p className="site-stat"><span>Inter-cluster hybrid</span><strong>{link.hybridGenerated ? "Generated" : "Not generated"}</strong></p>
              <p className="site-stat"><span>Validation</span><strong>{link.validationPassed ? "Passed" : "Not passed"}</strong></p>
              <p className="site-stat"><span>Joined solid</span><strong>{link.joinedSolid ? "Yes" : "No"}</strong></p>
              <p className="site-note">{link.fromCluster} · yaw {link.fromPose.yaw}° · shift {link.fromPose.east} east, {link.fromPose.north} north</p>
              <p className="site-note">{link.toCluster} · yaw {link.toPose.yaw}° · shift {link.toPose.east} east, {link.toPose.north} north</p>
              {link.note ? <p className="site-note">{link.note}</p> : null}
              <p className="site-note">{report.placements.length} programs. Each cluster sits in a pocket that states its program. Experimental Lobby has no finished program, so that anchor stays open.</p>
              {layers.voids && !voidReadings ? <p className="site-note">Reading the habitable void of each cluster.</p> : null}
              {report.placements.map((item) => {
                const reading = layers.voids ? voidReadings?.find((entry) => entry.programId === item.programId) : null;
                return (
                  <p key={item.programId} className="site-note">
                    {item.name} · {item.clusterId} · {item.pocket.map((kind) => (kind === "lobby" ? "Lobby" : kind === "gathering" ? "Gathering" : "Workspace")).join(", ")}
                    {reading ? ` · Main void ${Math.round(reading.floor).toLocaleString("en-US")} sf · ${Math.round(reading.volume).toLocaleString("en-US")} cf · ${Math.round(reading.height)} ft high · ${Math.round(reading.width)} × ${Math.round(reading.depth)} ft` : ""}
                  </p>
                );
              })}
              <p className="site-note">The placed clusters go through one shrinkwrap validation. That skin is the final mass. Experimental Lobby still has no finished program.</p>
            </div>
          ) : null}
        </section>
      </aside>
      <section className="site-stage" aria-label="Zoning-driven cluster assembly">
        <div className="site-frame">
          <header className="site-frame-bar">
            <div className="site-frame-name">
              <h2 className="site-subtitle">Public Lobby to Central Gathering</h2>
            </div>
            <div className="site-modes site-network-layers" role="group" aria-label="Assembly layers">
              <button type="button" data-active={layers.zoning || undefined} onClick={() => toggle("zoning")}>Zoning</button>
              <button type="button" data-active={layers.clusters || undefined} onClick={() => toggle("clusters")}>Clusters</button>
              <button type="button" data-active={layers.voids || undefined} onClick={() => toggle("voids")}>Void</button>
              <button type="button" data-active={layers.connections || undefined} onClick={() => toggle("connections")}>Connections</button>
              <button type="button" data-active={layers.massing || undefined} onClick={() => toggle("massing")}>Final Massing</button>
            </div>
            <div className="site-modes site-frame-views" role="group" aria-label="Camera">
              <button type="button" data-active={frame === "pair" || undefined} onClick={() => setFrame("pair")}>Pair</button>
              <button type="button" data-active={frame === "site" || undefined} onClick={() => setFrame("site")}>Site</button>
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
            frameToken={(mode === "plan" ? 1 : 2) + (frame === "pair" ? 10 : 0)}
            focusBounds={focus}
            onReadout={() => {}}
            clusterAssembly={model}
          />
        </div>
      </section>
    </main>
  );
}
