"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { ModuleHandoff } from "@/lib/skill4/adapt";
import type { TileConnection } from "@/lib/skill4/connections";
import type { Vec3 } from "@/lib/skill4/contract";
import {
  connectionProcess,
  hybridSectionRings,
  loftSectionViews,
  sectionPlate,
  sectionRibbon,
  separateLoftRings,
  type ProcessSection,
} from "@/lib/skill4/section-hybrid";
import { resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";
import { MeshPreview } from "./mesh-preview";

const PAPER: [number, number, number] = [0.93, 0.93, 0.91];
const SOFT_A: [number, number, number] = [0.84, 0.62, 0.5];
const SOFT_B: [number, number, number] = [0.58, 0.78, 0.76];
const SOFT_MID: [number, number, number] = [0.9, 0.9, 0.91];
const PLANE_A = { ink: "#e0a06a", glass: [0.99, 0.93, 0.88] as [number, number, number], edge: [0.90, 0.72, 0.56] as [number, number, number] };
const PLANE_B = { ink: "#9ad8de", glass: [0.90, 0.97, 0.98] as [number, number, number], edge: [0.70, 0.90, 0.92] as [number, number, number] };
const CONTOUR_A: [number, number, number] = [0.86, 0.42, 0.16];
const CONTOUR_B: [number, number, number] = [0.22, 0.72, 0.38];

export function ProcessRow({
  connection,
  tiles,
  loaded,
  syntheticMode,
  growth,
  part = "all",
}: {
  connection: TileConnection | null;
  tiles: readonly TileInstance[];
  loaded: ReadonlyMap<string, ModuleHandoff>;
  syntheticMode: boolean;
  growth: { connectionId: string; candidateId: string; mesh: IsoMesh; opacity: number } | null;
  /** The lab page renders every process frame. A website panel asks for one group. */
  part?: "all" | "clipping" | "descendant";
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
  const plates = standPlates(densifyPlates(separateLoftRings(sequence.map((section) => section.outer))));
  const selectedId = connection?.selectedMockId || "H—";
  const nameA = moduleA.identity?.name ?? tileA?.archetypeId ?? "Parent A";
  const nameB = moduleB.identity?.name ?? tileB?.archetypeId ?? "Parent B";
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const [yaw, setYaw] = useState(1.05);
  const [pitch, setPitch] = useState(0.16);
  const orbitDown = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, yaw, pitch };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const orbitMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    setYaw(drag.yaw - dx * 0.008);
    setPitch(Math.min(1.2, Math.max(-1.2, drag.pitch - dy * 0.008)));
  };
  const orbitUp = () => {
    dragRef.current = null;
  };

  const clipping = (
      <Panel className="hybrid-process-card hybrid-process-joined major-section-frame">
        <div className="hybrid-process-join">
          <div className="hybrid-process-join-side">
            <PanelHeader mark="04" title="Clipping Planes Through Each Tile" />
            <div className="hybrid-process-pair">
              <ParentSample
                title="Parent A"
                name={nameA}
                sections={process?.a ?? []}
                module={readyA}
                yaw={yaw}
                pitch={pitch}
                onPointerDown={orbitDown}
                onPointerMove={orbitMove}
                onPointerUp={orbitUp}
              />
              <ParentSample
                title="Parent B"
                name={nameB}
                sections={process?.b ?? []}
                module={readyB}
                yaw={yaw}
                pitch={pitch}
                onPointerDown={orbitDown}
                onPointerMove={orbitMove}
                onPointerUp={orbitUp}
              />
            </div>
          </div>
          <div className="hybrid-process-join-side">
            <PanelHeader mark="05" title="Extracted Section Profiles" />
            <div className="hybrid-process-pair hybrid-process-profiles-stack">
              <ProfileStrip sections={process?.a ?? []} color="#d29a7c" empty="Parent A sections appear after the faces are selected." />
              <ProfileStrip sections={process?.b ?? []} color="#8cc4c2" empty="Parent B sections appear after the faces are selected." />
            </div>
          </div>
        </div>
      </Panel>
  );
  const sections = (
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
  );
  const evolution = (
      <Panel className="hybrid-process-card major-section-frame">
        <PanelHeader mark="07" title={`Sectional Evolution of Selected Hybrid (${selectedId})`} />
        <div className="hybrid-process-evolution">
          {plates.length > 0 ? (
            <MeshPreview
              contain
              fill
              yaw={0.96}
              pitch={0.4}
              guides={evolutionGuides(plates)}
              mesh={null}
            />
          ) : (
            <p className="hybrid-missing">Select both faces to see the section stack.</p>
          )}
        </div>
      </Panel>
  );
  if (part === "clipping") return <div className="hybrid-process-row" data-part="clipping">{clipping}</div>;
  if (part === "descendant") return <div className="hybrid-process-row" data-part="descendant">{sections}{evolution}</div>;
  return <div className="hybrid-process-row">{clipping}{sections}{evolution}</div>;
}

function ParentSample({
  title,
  name,
  sections,
  module,
  yaw,
  pitch,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  title: string;
  name: string;
  sections: ProcessSection[];
  module: Extract<ModuleHandoff, { status: "ready" }> | null;
  yaw: number;
  pitch: number;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
}) {
  const tone = title.endsWith("B") ? PLANE_B : PLANE_A;
  const contour = title.endsWith("B") ? CONTOUR_B : CONTOUR_A;
  const sheets = sections.map((section) => glassSheet(section));
  const guides = [
    ...sheets.flatMap((sheet) => [
      { mesh: sheet.face, color: tone.glass, opacity: 0.1 },
      { mesh: sheet.frame, color: tone.edge, opacity: 0.34 },
    ]),
    ...sections.flatMap((section) => sectionContours(section, contour)),
  ];
  const notes = sheets.map((sheet, index) => ({
    at: sheet.crown,
    label: sections[index].label,
    color: tone.ink,
  }));
  return (
    <figure className="hybrid-process-parent" data-side={title.endsWith("B") ? "b" : "a"}>
      <div className="hybrid-process-sample">
        <div
          className="hybrid-process-preview"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {module?.geometry ? (
            <MeshPreview
              contain
              fitScale={1.85}
              yaw={yaw}
              pitch={pitch}
              mesh={module.geometry}
              color={PAPER}
              guides={guides}
              notes={notes}
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

function sectionContours(section: ProcessSection, color: [number, number, number]) {
  const normal = unit(section.planeNormal);
  const loops = [section.outer, ...section.openings.filter((opening) => opening.length >= 3)];
  let span = 0.5;
  section.outer.forEach((point) => {
    span = Math.max(span, Math.hypot(point.x - section.planeOrigin.x, point.y - section.planeOrigin.y, point.z - section.planeOrigin.z));
  });
  const width = span * 0.012;
  const lift = span * 0.008;
  return loops.map((loop) => ({
    mesh: sectionRibbon(loop.map((point) => plus(point, times(normal, lift))), width),
    color,
    opacity: 1,
  }));
}

function glassSheet(section: ProcessSection) {
  const axisU = unit(section.planeU);
  const axisV = unit(section.planeV);
  let halfU = 0.5;
  let halfV = 0.5;
  section.outer.forEach((point) => {
    const delta = minus(point, section.planeOrigin);
    halfU = Math.max(halfU, Math.abs(dot(delta, axisU)));
    halfV = Math.max(halfV, Math.abs(dot(delta, axisV)));
  });
  halfU *= 1.48;
  halfV *= 1.48;
  const corner = (u: number, v: number) => plus(section.planeOrigin, plus(times(axisU, u * halfU), times(axisV, v * halfV)));
  const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  const ranked = [...corners].sort((a, b) => b.y - a.y);
  return {
    face: quadMesh(corners),
    frame: sectionRibbon(corners, Math.max(halfU, halfV) * 0.016),
    crown: {
      x: (ranked[0].x + ranked[1].x) / 2,
      y: (ranked[0].y + ranked[1].y) / 2,
      z: (ranked[0].z + ranked[1].z) / 2,
    },
  };
}

function quadMesh(corners: Vec3[]): IsoMesh {
  const normal = unit(cross(minus(corners[1], corners[0]), minus(corners[3], corners[0])));
  const positions = new Float32Array(12);
  const normals = new Float32Array(12);
  corners.forEach((corner, index) => {
    positions[index * 3] = corner.x;
    positions[index * 3 + 1] = corner.y;
    positions[index * 3 + 2] = corner.z;
    normals[index * 3] = normal.x;
    normals[index * 3 + 1] = normal.y;
    normals[index * 3 + 2] = normal.z;
  });
  return { positions, normals, indices: Uint32Array.from([0, 1, 2, 0, 2, 3]), triangles: 2 };
}

function plus(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function minus(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function times(value: Vec3, scale: number): Vec3 {
  return { x: value.x * scale, y: value.y * scale, z: value.z * scale };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function unit(value: Vec3): Vec3 {
  const span = Math.hypot(value.x, value.y, value.z) || 1;
  return times(value, 1 / span);
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

function evolutionGuides(plates: Vec3[][]) {
  const guides: { mesh: IsoMesh; color: [number, number, number]; opacity: number }[] = plates.map((points, index) => ({
    mesh: thickPlate(points, plateDepth(plates, index)),
    color: plateColor(index, plates.length),
    opacity: 0.42,
  }));
  plates.forEach((points) => {
    if (points.length < 3) return;
    guides.push({ mesh: outlineHair(points), color: [0.78, 0.79, 0.77], opacity: 0.48 });
  });
  return guides;
}

function densifyPlates(plates: Vec3[][]): Vec3[][] {
  if (plates.length < 2) return plates;
  const inserts = 2;
  const dense: Vec3[][] = [];
  for (let index = 0; index < plates.length - 1; index += 1) {
    const from = plates[index];
    const to = matchRing(plates[index + 1], from.length);
    dense.push(from);
    for (let step = 1; step <= inserts; step += 1) {
      const t = step / (inserts + 1);
      dense.push(from.map((point, sample) => ({
        x: point.x + (to[sample].x - point.x) * t,
        y: point.y + (to[sample].y - point.y) * t,
        z: point.z + (to[sample].z - point.z) * t,
      })));
    }
  }
  dense.push(plates[plates.length - 1]);
  return dense;
}

function matchRing(points: Vec3[], count: number): Vec3[] {
  if (points.length === count) return points;
  const closed = [...points, points[0]];
  const lengths = [0];
  for (let index = 1; index < closed.length; index += 1) {
    const delta = minus(closed[index], closed[index - 1]);
    lengths.push(lengths[index - 1] + Math.hypot(delta.x, delta.y, delta.z));
  }
  const total = lengths[lengths.length - 1] || 1;
  return Array.from({ length: count }, (_, index) => {
    const target = (index / count) * total;
    let segment = 1;
    while (segment < lengths.length - 1 && lengths[segment] < target) segment += 1;
    const span = lengths[segment] - lengths[segment - 1] || 1;
    const amount = (target - lengths[segment - 1]) / span;
    const start = closed[segment - 1];
    const end = closed[segment];
    return {
      x: start.x + (end.x - start.x) * amount,
      y: start.y + (end.y - start.y) * amount,
      z: start.z + (end.z - start.z) * amount,
    };
  });
}

function outlineHair(points: Vec3[]): IsoMesh {
  const center = mean(points);
  const normal = ringNormal(points);
  let reach = 0;
  points.forEach((point) => {
    reach += Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z);
  });
  reach /= Math.max(1, points.length);
  const stroke = Math.max(reach * 0.0032, 1e-4);
  const outside = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    let outward = unit(cross(normal, minus(next, previous)));
    if (dot(outward, minus(point, center)) < 0) outward = times(outward, -1);
    return plus(point, times(outward, stroke * 2.4));
  });
  return sectionRibbon(outside, stroke * 0.22);
}

function standPlates(plates: Vec3[][]): Vec3[][] {
  if (plates.length === 0) return plates;
  const frames = plates.map((points) => {
    const origin = mean(points);
    const normal = ringNormal(points);
    const upright = Math.abs(normal.y) > 0.72 ? horizontalLongest(points, origin, normal) : inPlane(normal, { x: 0, y: 1, z: 0 });
    const width = unit(cross(normal, upright));
    const height = unit(cross(width, normal));
    return { origin, width, height, points };
  });
  for (let index = 1; index < frames.length; index += 1) {
    if (dot(frames[index].width, frames[index - 1].width) < 0) frames[index].width = times(frames[index].width, -1);
    if (dot(frames[index].height, frames[index - 1].height) < 0) frames[index].height = times(frames[index].height, -1);
  }
  let reach = 0;
  let count = 0;
  frames.forEach((frame) => {
    frame.points.forEach((point) => {
      const delta = minus(point, frame.origin);
      reach += Math.hypot(delta.x, delta.y, delta.z);
      count += 1;
    });
  });
  const step = Math.max((count > 0 ? reach / count : 1) * 0.82, 0.08);
  const mid = (frames.length - 1) / 2;
  return frames.map((frame, index) => frame.points.map((point) => {
    const delta = minus(point, frame.origin);
    return {
      x: (index - mid) * step,
      y: dot(delta, frame.height),
      z: dot(delta, frame.width),
    };
  }));
}

function ringNormal(points: Vec3[]): Vec3 {
  const normal = { x: 0, y: 0, z: 0 };
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    normal.x += (point.y - next.y) * (point.z + next.z);
    normal.y += (point.z - next.z) * (point.x + next.x);
    normal.z += (point.x - next.x) * (point.y + next.y);
  });
  return unit(normal);
}

function inPlane(normal: Vec3, hint: Vec3): Vec3 {
  const rejected = minus(hint, times(normal, dot(hint, normal)));
  const span = Math.hypot(rejected.x, rejected.y, rejected.z);
  if (span < 1e-5) {
    const fallback = Math.abs(normal.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    return inPlane(normal, fallback);
  }
  return times(rejected, 1 / span);
}

function horizontalLongest(points: Vec3[], origin: Vec3, normal: Vec3): Vec3 {
  const across = inPlane(normal, { x: 1, y: 0, z: 0 });
  const along = unit(cross(normal, across));
  let uu = 0;
  let vv = 0;
  let uv = 0;
  points.forEach((point) => {
    const delta = minus(point, origin);
    const x = dot(delta, across);
    const y = dot(delta, along);
    uu += x * x;
    vv += y * y;
    uv += x * y;
  });
  const trace = uu + vv;
  const disc = Math.max(0, trace * trace / 4 - (uu * vv - uv * uv));
  const lambda = trace / 2 + Math.sqrt(disc);
  const x = Math.abs(uv) > 1e-8 ? uv : (uu >= vv ? 1 : 0);
  const y = Math.abs(uv) > 1e-8 ? lambda - uu : (uu >= vv ? 0 : 1);
  const span = Math.hypot(x, y) || 1;
  return unit(plus(times(across, x / span), times(along, y / span)));
}

function plateDepth(plates: Vec3[][], index: number) {
  if (plates.length < 2) return 0.08;
  const centers = plates.map((points) => mean(points));
  const gap = (from: number, to: number) => Math.hypot(
    centers[to].x - centers[from].x,
    centers[to].y - centers[from].y,
    centers[to].z - centers[from].z,
  );
  const neighbor = index < plates.length - 1 ? gap(index, index + 1) : gap(index - 1, index);
  return Math.max(neighbor * 0.46, 0.02);
}

function thickPlate(points: Vec3[], depth: number): IsoMesh {
  if (points.length < 3) return sectionPlate(points);
  const center = mean(points);
  let normal = ringNormal(points);
  if (normal.x < 0) normal = times(normal, -1);
  const shift = times(normal, depth * 0.5);
  const front = points.map((point) => plus(point, shift));
  const back = points.map((point) => minus(point, shift));
  return joinMeshes([sectionPlate(front), sectionPlate(back), slabWall(front, back, center)]);
}

function slabWall(front: Vec3[], back: Vec3[], center: Vec3): IsoMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  front.forEach((point, index) => {
    const next = (index + 1) % front.length;
    const outward = unit(minus(mean([point, front[next]]), center));
    const base = positions.length / 3;
    [point, front[next], back[next], back[index]].forEach((corner) => {
      positions.push(corner.x, corner.y, corner.z);
      normals.push(outward.x, outward.y, outward.z);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

function joinMeshes(parts: IsoMesh[]): IsoMesh {
  let vertexCount = 0;
  let indexCount = 0;
  parts.forEach((part) => {
    vertexCount += part.positions.length;
    indexCount += part.indices.length;
  });
  const positions = new Float32Array(vertexCount);
  const normals = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  let vertex = 0;
  let index = 0;
  let base = 0;
  parts.forEach((part) => {
    positions.set(part.positions, vertex);
    normals.set(part.normals, vertex);
    part.indices.forEach((value) => {
      indices[index] = base + value;
      index += 1;
    });
    base += part.positions.length / 3;
    vertex += part.positions.length;
  });
  return { positions, normals, indices, triangles: indexCount / 3 };
}

function mean(points: Vec3[]): Vec3 {
  const origin = { x: 0, y: 0, z: 0 };
  points.forEach((point) => {
    origin.x += point.x;
    origin.y += point.y;
    origin.z += point.z;
  });
  return times(origin, 1 / Math.max(1, points.length));
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
