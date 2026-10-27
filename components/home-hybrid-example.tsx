"use client";

import { useEffect, useMemo, useState } from "react";
import exampleJson from "@/data/skill4/s04-test12-006.json";
import { MeshPreview } from "@/components/hybrid/mesh-preview";
import { catalogInspectionMeshes } from "@/components/hybrid/catalog-inspect";
import {
  connectionsFromCatalog,
  tilesFromCatalog,
  type CatalogEntry,
} from "@/lib/skill4/catalog";
import type { ModuleHandoff } from "@/lib/skill4/adapt";
import type { Skill4ModuleRecord } from "@/lib/skill4/contract";
import { connectionProcess, hybridSectionRings, loftSectionViews } from "@/lib/skill4/section-hybrid";
import { loadSkill4Handoff } from "@/lib/skill4/handoff-client";
import { loadModuleMap, resolveTileModule } from "@/lib/skill4/tiles";

const EXAMPLE = exampleJson as CatalogEntry;
const PARENT_COLOR: [number, number, number] = [0.93, 0.93, 0.91];
const MESH_WHITE: [number, number, number] = [1, 1, 1];

export const HYBRID_EXAMPLE_ID = EXAMPLE.id;

type Profile = { u: number; v: number };
type SectionView = { label: string; profile: Profile[]; openings?: Profile[][] };

export type HybridExample = {
  id: string;
  batch: string;
  connection: string;
  tiles: number;
  layout: string;
  links: string;
  parents: { id: string; name: string; face: string; mesh: NonNullable<Extract<ModuleHandoff, { status: "ready" }>["geometry"]> }[];
  sections: { label: string; color: string; views: SectionView[] }[];
  frames: SectionView[];
  connector: NonNullable<Extract<ModuleHandoff, { status: "ready" }>["geometry"]> | null;
  placed: ReturnType<typeof catalogInspectionMeshes>["meshes"];
};

export function useHybridExample(): { example: HybridExample | null; status: string } {
  const [records, setRecords] = useState<Skill4ModuleRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancel = false;
    const ids = [...new Set(EXAMPLE.tiles.map((tile) => tile.archetypeId))];
    Promise.all(ids.map((id) => loadSkill4Handoff(id))).then((rows) => {
      if (cancel) return;
      const ready = rows.filter((row): row is Skill4ModuleRecord => row != null);
      if (ready.length < ids.length) setFailed(true);
      setRecords(ready);
    }).catch(() => {
      if (!cancel) setFailed(true);
    });
    return () => {
      cancel = true;
    };
  }, []);
  const example = useMemo(() => (records ? buildExample(records) : null), [records]);
  return { example, status: failed ? "The stored modules for S04 TEST12 006 could not be read." : "Reading S04 TEST12 006." };
}

function buildExample(records: Skill4ModuleRecord[]): HybridExample | null {
  const loaded = loadModuleMap(records);
  const tiles = tilesFromCatalog(EXAMPLE);
  const connections = connectionsFromCatalog(EXAMPLE, tiles, loaded);
  const connection = connections[0];
  if (!connection) return null;
  const parents = EXAMPLE.tiles.flatMap((tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    if (handoff.status !== "ready" || !handoff.geometry) return [];
    const face = tile.instanceId === connection.tileAId ? connection.faceA : connection.faceB;
    return [{ id: tile.instanceId, name: tile.name, face, mesh: handoff.geometry }];
  });
  const moduleA = resolveTileModule(EXAMPLE.tiles[0]?.archetypeId ?? "", loaded);
  const moduleB = resolveTileModule(EXAMPLE.tiles[1]?.archetypeId ?? "", loaded);
  const process = moduleA.status === "ready" && moduleB.status === "ready"
    ? connectionProcess(moduleA, connection.faceA, moduleB, connection.faceB)
    : null;
  const saved = connection.generatedHybridField?.candidates.find((item) => item.candidateId === connection.selectedMockId && item.geometry);
  const connector = saved?.geometry ?? null;
  const frames = loftSectionViews(hybridSectionRings(connector) ?? []).map((section) => ({
    label: section.label,
    profile: section.profile,
  }));
  const placed = catalogInspectionMeshes(EXAMPLE, loaded).meshes;
  const batch = EXAMPLE.batchId?.replace("_", " ") ?? "";
  return {
    id: EXAMPLE.id,
    batch,
    connection: placed.some((mesh) => mesh.kind === 1) ? "PLACED" : "NOT PLACED",
    tiles: EXAMPLE.tileCount,
    layout: EXAMPLE.arrangement,
    links: `${connection.tileAId}:${connection.faceA} ↔ ${connection.tileBId}:${connection.faceB} · ${connection.selectedMockId}`,
    parents,
    sections: [
      { label: "A", color: "#c77e5f", views: (process?.a ?? []).map(viewOf) },
      { label: "B", color: "#49d7de", views: (process?.b ?? []).map(viewOf) },
    ],
    frames,
    connector,
    placed,
  };
}

function viewOf(section: { label: string; profile: Profile[]; openingProfiles: Profile[][] }): SectionView {
  return { label: section.label, profile: section.profile, openings: section.openingProfiles };
}

export function HybridDiagram({ example, kind, compact = false }: { example: HybridExample; kind: "parents" | "sections" | "frames" | "descendant" | "assembly"; compact?: boolean }) {
  if (kind === "parents") {
    return (
      <div className="wf-hyb-stage">
        {example.parents.map((parent) => (
          <figure key={parent.id} className="wf-hyb-mesh">
            <div className="wf-hyb-view">
              <MeshPreview mesh={parent.mesh} color={PARENT_COLOR} contain={compact} fill={!compact} fitScale={compact ? 1.7 : 1} yaw={0.9} pitch={0.2} />
            </div>
            <figcaption>{parent.id}:{parent.face} {parent.name}</figcaption>
          </figure>
        ))}
      </div>
    );
  }
  if (kind === "sections") {
    return (
      <div className="wf-hyb-stage">
        {example.sections.map((group) => (
          <ProfileRow key={group.label} views={group.views} color={group.color} tight={!compact} />
        ))}
      </div>
    );
  }
  if (kind === "frames") {
    return example.frames.length > 0
      ? <ProfileRow views={example.frames} color="#f2f2ee" sequence tight={!compact} />
      : <p className="wf-frame-body">H10 has no stored section frames.</p>;
  }
  if (kind === "descendant") {
    return example.connector
      ? (
        <div className="wf-hyb-mesh">
          <div className="wf-hyb-view">
            <MeshPreview mesh={example.connector} color={MESH_WHITE} contain={compact} fill={!compact} fitScale={compact ? 1.5 : 1} yaw={0.96} pitch={0.4} kind={1} />
          </div>
        </div>
      )
      : <p className="wf-frame-body">H10 mesh is not stored.</p>;
  }
  return (
    <div className="wf-hyb-assembly" data-compact={compact || undefined}>
      <div className="wf-hyb-mesh">
        <div className="wf-hyb-view">
          <MeshPreview placed={example.placed} contain turn fitScale={1.6} />
        </div>
      </div>
      {compact ? null : <dl>
        <div><dt>Assembly</dt><dd>{example.id}</dd></div>
        <div><dt>Batch</dt><dd>{example.batch}</dd></div>
        <div><dt>Connection</dt><dd>{example.connection}</dd></div>
        <div><dt>Archetypes</dt><dd>{example.parents.map((parent) => parent.name).join(" · ")}</dd></div>
        <div><dt>Tiles</dt><dd>{example.tiles}</dd></div>
        <div><dt>Layout</dt><dd>{example.layout}</dd></div>
        <div><dt>Connections</dt><dd>{EXAMPLE.connections.length}<br />{example.links}</dd></div>
      </dl>}
    </div>
  );
}

function ProfileRow({ views, color, sequence = false, tight = false }: { views: SectionView[]; color: string; sequence?: boolean; tight?: boolean }) {
  if (views.length === 0) return <p className="wf-frame-body">Sections are not stored for this face.</p>;
  return (
    <div className="wf-hyb-profiles">
      {views.map((view, index) => (
        <ProfileGlyph key={view.label} view={view} color={sequence ? frameColor(index, views.length) : color} pad={tight ? 0.04 : 0.16} />
      ))}
    </div>
  );
}

function ProfileGlyph({ view, color, pad: margin }: { view: SectionView; color: string; pad: number }) {
  const loops = [view.profile, ...(view.openings ?? [])];
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  loops.flat().forEach((point) => {
    minU = Math.min(minU, point.u);
    maxU = Math.max(maxU, point.u);
    minV = Math.min(minV, point.v);
    maxV = Math.max(maxV, point.v);
  });
  const pad = Math.max(maxU - minU, maxV - minV, 1e-4) * margin;
  const viewBox = `${minU - pad} ${-(maxV + pad)} ${Math.max(maxU - minU, 1e-4) + pad * 2} ${Math.max(maxV - minV, 1e-4) + pad * 2}`;
  return (
    <figure>
      <svg viewBox={viewBox} role="img" aria-label={view.label}>
        <g transform="scale(1,-1)">
          <polygon points={view.profile.map((point) => `${point.u},${point.v}`).join(" ")} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      <figcaption>{view.label}</figcaption>
    </figure>
  );
}

function frameColor(index: number, count: number) {
  const t = count <= 1 ? 0 : index / (count - 1);
  const mix = (from: number[], to: number[], amount: number) => from.map((value, channel) => Math.round(value + (to[channel] - value) * amount));
  const copper = [199, 126, 95];
  const paper = [242, 242, 238];
  const cyan = [73, 215, 222];
  const rgb = t < 0.5 ? mix(copper, paper, t * 2) : mix(paper, cyan, (t - 0.5) * 2);
  return `rgb(${rgb.join(",")})`;
}
