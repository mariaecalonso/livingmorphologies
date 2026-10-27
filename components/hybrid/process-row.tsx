"use client";

import { Panel, PanelHeader } from "@/components/hud";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { ModuleHandoff } from "@/lib/skill4/adapt";
import type { TileConnection } from "@/lib/skill4/connections";
import {
  connectionProcess,
  hybridSectionRings,
  loftSectionViews,
  sectionCutGuides,
  sectionPlate,
  separateLoftRings,
  type ProcessSection,
} from "@/lib/skill4/section-hybrid";
import { resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";
import { MeshPreview } from "./mesh-preview";

const PAPER: [number, number, number] = [0.93, 0.93, 0.91];
const SOFT_A: [number, number, number] = [0.84, 0.62, 0.5];
const SOFT_B: [number, number, number] = [0.58, 0.78, 0.76];
const SOFT_MID: [number, number, number] = [0.9, 0.9, 0.91];

export function ProcessRow({
  connection,
  tiles,
  loaded,
  syntheticMode,
  growth,
}: {
  connection: TileConnection | null;
  tiles: readonly TileInstance[];
  loaded: ReadonlyMap<string, ModuleHandoff>;
  syntheticMode: boolean;
  growth: { connectionId: string; candidateId: string; mesh: IsoMesh; opacity: number } | null;
}) {
  const tileA = tiles.find((tile) => tile.instanceId === connection?.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection?.tileBId);
  const moduleA = resolveTileModule(tileA?.archetypeId ?? "", loaded);
  const moduleB = resolveTileModule(tileB?.archetypeId ?? "", loaded);
  const readyA = moduleA.status === "ready" ? moduleA : null;
  const readyB = moduleB.status === "ready" ? moduleB : null;
  const faceA = connection?.faceA;
  const faceB = connection?.faceB;
  const process = readyA && readyB && faceA && faceB ? connectionProcess(readyA, faceA, readyB, faceB) : null;
  const generated = connection?.generatedHybridField?.candidates.find((item) => item.candidateId === connection.selectedMockId) ?? null;
  const loft = generated?.loftRings?.length ? generated.loftRings : hybridSectionRings(generated?.geometry ?? null) ?? [];
  const sequence = loftSectionViews(loft);
  const plates = separateLoftRings(sequence.map((section) => section.outer));
  const selectedId = connection?.selectedMockId || "H—";
  const nameA = moduleA.identity?.name ?? tileA?.archetypeId ?? "Parent A";
  const nameB = moduleB.identity?.name ?? tileB?.archetypeId ?? "Parent B";

  return (
    <div className="hybrid-process-row">
      <Panel className="hybrid-process-card major-section-frame">
        <PanelHeader mark="04" title="Clipping Planes Through Each Tile" />
        <div className="hybrid-process-pair">
          <ParentSample
            title="Parent A"
            name={nameA}
            sections={process?.a ?? []}
            module={readyA}
          />
          <ParentSample
            title="Parent B"
            name={nameB}
            sections={process?.b ?? []}
            module={readyB}
          />
        </div>
      </Panel>
      <Panel className="hybrid-process-card major-section-frame">
        <PanelHeader mark="05" title="Extracted Section Profiles" />
        <div className="hybrid-process-pair hybrid-process-profiles-stack">
          <ProfileStrip sections={process?.a ?? []} color="#d29a7c" empty="Parent A sections appear after the faces are selected." />
          <ProfileStrip sections={process?.b ?? []} color="#8cc4c2" empty="Parent B sections appear after the faces are selected." />
        </div>
      </Panel>
      <Panel className="hybrid-process-card major-section-frame">
        <PanelHeader mark="06" title={`Generate Intermediate Hybrid Sections (${selectedId})`} />
        {sequence.length > 0 ? (
          <div className="hybrid-process-sequence">
            {sequence.map((section, index) => (
              <ProfileFigure
                key={section.label}
                label={section.label}
                outer={section.profile}
                openings={[]}
                color={sequenceColor(index, sequence.length)}
                active={section.label.startsWith("H")}
              />
            ))}
          </div>
        ) : (
          <p className="hybrid-missing">Generate the selected hybrid to see A1 through the intermediate sections to B1.</p>
        )}
      </Panel>
      <Panel className="hybrid-process-card major-section-frame">
        <PanelHeader mark="07" title={`Sectional Evolution of Selected Hybrid (${selectedId})`} />
        <div className="hybrid-process-evolution">
          {plates.length > 0 ? (
            <MeshPreview
              contain
              fill
              yaw={0.42}
              pitch={0.14}
              guides={plates.map((points, index) => ({
                mesh: sectionPlate(points),
                color: plateColor(index, plates.length),
                opacity: 0.42,
              }))}
              mesh={null}
            />
          ) : (
            <p className="hybrid-missing">Select both faces to see the section stack.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function ParentSample({
  title,
  name,
  sections,
  module,
}: {
  title: string;
  name: string;
  sections: ProcessSection[];
  module: Extract<ModuleHandoff, { status: "ready" }> | null;
}) {
  const cut = title.endsWith("B") ? SOFT_B : SOFT_A;
  const guides = sections.flatMap((section) => sectionCutGuides(section, cut));
  return (
    <figure className="hybrid-process-parent" data-side={title.endsWith("B") ? "b" : "a"}>
      <div className="hybrid-process-sample">
        {sections.length > 0 ? (
          <ol className="hybrid-process-tags">
            {sections.map((section) => <li key={section.label}>{section.label}</li>)}
          </ol>
        ) : null}
        <div className="hybrid-process-preview">
          {module?.geometry ? (
            <MeshPreview
              contain
              fitScale={1.55}
              yaw={1.05}
              pitch={0.16}
              mesh={module.geometry}
              color={PAPER}
              guides={guides}
            />
          ) : <p className="hybrid-missing">No geometry</p>}
        </div>
      </div>
      <figcaption>
        <strong>{title}</strong>
        <span>{name}</span>
      </figcaption>
    </figure>
  );
}

function ProfileStrip({ sections, color, empty }: { sections: ProcessSection[]; color: string; empty: string }) {
  if (sections.length === 0) return <p className="hybrid-missing">{empty}</p>;
  return (
    <div className="hybrid-process-profiles">
      {sections.map((section) => (
        <ProfileFigure
          key={section.label}
          label={section.label}
          outer={section.profile}
          openings={section.openingProfiles}
          color={color}
          copied={section.copied}
        />
      ))}
    </div>
  );
}

function ProfileFigure({
  label,
  outer,
  openings,
  color,
  active = false,
  copied = false,
}: {
  label: string;
  outer: { u: number; v: number }[];
  openings: { u: number; v: number }[][];
  color: string;
  active?: boolean;
  copied?: boolean;
}) {
  const points = [outer, ...openings];
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  points.flat().forEach((point) => {
    minU = Math.min(minU, point.u);
    maxU = Math.max(maxU, point.u);
    minV = Math.min(minV, point.v);
    maxV = Math.max(maxV, point.v);
  });
  const pad = Math.max(maxU - minU, maxV - minV, 1e-4) * 0.12;
  const view = `${minU - pad} ${-(maxV + pad)} ${Math.max(maxU - minU, 1e-4) + pad * 2} ${Math.max(maxV - minV, 1e-4) + pad * 2}`;
  return (
    <figure className="hybrid-process-figure" data-active={active || undefined} data-copied={copied || undefined}>
      <svg viewBox={view} role="img" aria-label={label}>
        <g transform="scale(1,-1)">
          <polygon points={outer.map((point) => `${point.u},${point.v}`).join(" ")} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          {openings.map((opening, index) => (
            <polygon key={index} points={opening.map((point) => `${point.u},${point.v}`).join(" ")} fill="none" stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function plateColor(index: number, count: number): [number, number, number] {
  const t = count <= 1 ? 0 : index / (count - 1);
  return t < 0.5 ? mixTuple(SOFT_A, SOFT_MID, t * 2) : mixTuple(SOFT_MID, SOFT_B, (t - 0.5) * 2);
}

function mixTuple(from: [number, number, number], to: [number, number, number], amount: number): [number, number, number] {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

function sequenceColor(index: number, count: number) {
  const t = count <= 1 ? 0 : index / (count - 1);
  const mix = (from: number[], to: number[], amount: number) => from.map((value, channel) => Math.round(value + (to[channel] - value) * amount));
  const orange = [214, 158, 128];
  const paper = [232, 232, 230];
  const teal = [140, 196, 194];
  const rgb = t < 0.5 ? mix(orange, paper, t * 2) : mix(paper, teal, (t - 0.5) * 2);
  return `rgb(${rgb.join(",")})`;
}
