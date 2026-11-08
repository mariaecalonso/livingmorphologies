"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { ModuleHandoff } from "@/lib/skill4/adapt";
import type { TileConnection } from "@/lib/skill4/connections";
import type { Vec3 } from "@/lib/skill4/contract";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import {
  connectionProcess,
  hybridSectionRings,
  loftSectionViews,
  sectionPlate,
  sectionRibbon,
  type ProcessSection,
} from "@/lib/skill4/section-hybrid";
import { resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";
import { MeshPreview } from "./mesh-preview";
import { ValidationPanel } from "./validation-panel";

const PAPER: [number, number, number] = [0.93, 0.93, 0.91];
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
  sectionPlay = null,
  part = "all",
  assembly = [],
}: {
  connection: TileConnection | null;
  tiles: readonly TileInstance[];
  loaded: ReadonlyMap<string, ModuleHandoff>;
  syntheticMode: boolean;
  growth: { connectionId: string; candidateId: string; mesh: IsoMesh; opacity: number } | null;
  sectionPlay?: { connectionId: string; candidateId: string; rings: { x: number; y: number; z: number }[][]; shown: number } | null;
  /** The lab page renders every process frame. A website panel asks for one group. */
  part?: "all" | "clipping" | "descendant";
  assembly?: readonly PlacedMesh[];
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
  const playing = sectionPlay && sectionPlay.connectionId === connection?.id && (!connection.selectedMockId || sectionPlay.candidateId === connection.selectedMockId) ? sectionPlay : null;
  const stored = generated?.loftRings?.length ? generated.loftRings : hybridSectionRings(generated?.geometry ?? null) ?? [];
  const parentA = (process?.a ?? []).filter((section) => section.outer.length >= 3);
  const parentB = (process?.b ?? []).filter((section) => section.outer.length >= 3);
  const loft = playing?.rings.length ? playing.rings : stored;
  const hybrid = loft.length > 2 ? loft.slice(1, -1) : [];
  const hybridViews = loftSectionViews(hybrid);
  const entries: { points: Vec3[]; role: "a" | "hybrid" | "b" }[] = [
    ...parentA.map((section) => ({ points: section.outer, role: "a" as const })),
    ...hybrid.map((points) => ({ points, role: "hybrid" as const })),
    ...parentB.map((section) => ({ points: section.outer, role: "b" as const })),
  ];
  const sequence = [
    ...parentA.map((section) => ({ label: section.label, profile: section.profile, role: "a" as const })),
    ...hybridViews.map((view, index) => ({ label: `H${index + 1}`, profile: view.profile, role: "hybrid" as const })),
    ...parentB.map((section) => ({ label: section.label, profile: section.profile, role: "b" as const })),
  ];
  const generating = connection?.generationStatus === "generating";
  const stood = lineUp(entries.map((entry) => entry.points));
  const grownMax = Math.floor(Math.max(0, stood.length - 1) / 2);
  const growing = (generating || !!playing) && entries.length > 2;
  const trailKey = `${connection?.id ?? ""}:${parentA.length}:${hybrid.length}:${parentB.length}`;
  const [grown, setGrown] = useState(0);
  const grownRef = useRef(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [scrubPlay, setScrubPlay] = useState(false);
  useEffect(() => {
    const max = Math.floor(Math.max(0, stood.length - 1) / 2);
    if (!growing || stood.length < 4) {
      grownRef.current = max;
      setGrown(max);
      return;
    }
    grownRef.current = 0;
    setGrown(0);
    const timer = window.setInterval(() => {
      const next = Math.min(max, grownRef.current + 1);
      grownRef.current = next;
      setGrown(next);
      if (next >= max) window.clearInterval(timer);
    }, 480);
    return () => window.clearInterval(timer);
  }, [trailKey, growing, stood.length]);
  useEffect(() => {
    setScrub(null);
    setScrubPlay(false);
  }, [trailKey]);
  useEffect(() => {
    if (!scrubPlay) return;
    const last = Math.max(0, sequence.length - 1);
    const timer = window.setInterval(() => {
      setScrub((current) => {
        const next = Math.min(last, (current ?? 0) + 1);
        if (next >= last) setScrubPlay(false);
        return next;
      });
    }, 700);
    return () => window.clearInterval(timer);
  }, [scrubPlay, sequence.length]);
  const sourceReach = Math.floor(Math.max(0, sequence.length - 1) / 2);
  const sourceShown = grownMax === 0 ? sourceReach : Math.round((grown / grownMax) * sourceReach);
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
          <div className="hybrid-process-join-side hybrid-dna-side">
            <PanelHeader mark="05" title="Sectional DNA — Extracted Profiles" />
            <SectionalDna sectionsA={process?.a ?? []} sectionsB={process?.b ?? []} />
          </div>
        </div>
      </Panel>
  );
  const sections = (
      <Panel className="hybrid-process-card major-section-frame">
        <PanelHeader mark="06" title={`Generate Intermediate Hybrid Sections (${selectedId})`} />
        {sequence.length > 0 ? (
          <MorphSequence
            plates={stood.map((points, index) => ({ points, role: entries[index].role, label: sequence[index]?.label ?? "" }))}
            shown={scrub}
            reveal={(index) => !growing || Math.min(index, stood.length - 1 - index) <= sourceShown}
            yaw={0.46}
            pitch={0.18}
            playing={scrubPlay}
            onToggle={() => {
              setScrub((current) => (current === null || current >= sequence.length - 1 ? 0 : current));
              setScrubPlay((value) => !value);
            }}
            onScrub={(index) => {
              setScrubPlay(false);
              setScrub(index);
            }}
          />
        ) : (
          <p className="hybrid-missing">{connection?.generationStatus === "generating" ? "The selected hybrid is generating." : "Generate the selected hybrid to see A1 through the intermediate sections to B1."}</p>
        )}
      </Panel>
  );
  if (part === "clipping") return <div className="hybrid-process-row" data-part="clipping">{clipping}</div>;
  if (part === "descendant") return <div className="hybrid-process-row" data-part="descendant">{sections}</div>;
  return <div className="hybrid-process-row" data-part="all">{clipping}{sections}<ValidationPanel assembly={assembly} /></div>;
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

function SectionalDna({ sectionsA, sectionsB }: { sectionsA: ProcessSection[]; sectionsB: ProcessSection[] }) {
  const columns = Math.max(sectionsA.length, sectionsB.length, 1);
  const featuredA = largestProfile(sectionsA)?.label;
  const featuredB = largestProfile(sectionsB)?.label;
  return (
    <div className="hybrid-profile-dna" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {sectionsA.map((section, index) => (
        <div key={section.label} className="hybrid-dna-cell" data-tone="a" style={{ gridColumn: index + 1, gridRow: 1 }}>
          <ProfileFigure
            label={section.label}
            outer={section.profile}
            openings={section.openingProfiles}
            color="#e7b08a"
            copied={section.copied}
            featured={section.label === featuredA}
          />
        </div>
      ))}
      {sectionsA.length === 0 ? <p className="hybrid-missing" style={{ gridColumn: "1 / -1", gridRow: 1 }}>Parent A sections appear after the faces are selected.</p> : null}
      <DnaSpine count={columns} />
      {sectionsB.map((section, index) => (
        <div key={section.label} className="hybrid-dna-cell" data-tone="b" style={{ gridColumn: index + 1, gridRow: 3 }}>
          <ProfileFigure
            label={section.label}
            outer={section.profile}
            openings={section.openingProfiles}
            color="#7ee0e4"
            copied={section.copied}
            featured={section.label === featuredB}
          />
        </div>
      ))}
      {sectionsB.length === 0 ? <p className="hybrid-missing" style={{ gridColumn: "1 / -1", gridRow: 3 }}>Parent B sections appear after the faces are selected.</p> : null}
    </div>
  );
}

function largestProfile(sections: ProcessSection[]) {
  let best: ProcessSection | null = null;
  let area = -1;
  sections.forEach((section) => {
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    section.profile.forEach((point) => {
      minU = Math.min(minU, point.u);
      maxU = Math.max(maxU, point.u);
      minV = Math.min(minV, point.v);
      maxV = Math.max(maxV, point.v);
    });
    const next = Math.max(0, maxU - minU) * Math.max(0, maxV - minV);
    if (next > area) {
      area = next;
      best = section;
    }
  });
  return best;
}

function DnaSpine({ count }: { count: number }) {
  if (count < 1) return <div className="hybrid-dna-spine" style={{ gridColumn: "1 / -1", gridRow: 2 }} />;
  const dots = Array.from({ length: count }, (_, index) => ((index + 0.5) / count) * 100);
  return (
    <div className="hybrid-dna-spine" style={{ gridColumn: "1 / -1", gridRow: 2 }} aria-hidden="true">
      <span className="hybrid-dna-line" />
      {dots.map((at) => <span key={at} className="hybrid-dna-node" style={{ left: `${at}%` }} />)}
    </div>
  );
}

function MorphSequence({
  plates,
  shown,
  reveal,
  yaw,
  pitch,
  playing,
  onToggle,
  onScrub,
}: {
  plates: { points: Vec3[]; role: "a" | "hybrid" | "b"; label: string }[];
  shown: number | null;
  reveal: (index: number) => boolean;
  yaw: number;
  pitch: number;
  playing: boolean;
  onToggle: () => void;
  onScrub: (index: number) => void;
}) {
  const visible = plates.filter((plate, index) => (shown === null ? reveal(index) : index <= shown));
  const staged = stageSequence(visible);
  const head = shown === null ? Math.max(0, visible.length - 1) : shown;
  const marked = new Set<number>();
  staged.forEach((plate, index) => {
    const previous = staged[index - 1]?.role;
    if (index === 0 || index === staged.length - 1 || plate.role !== previous) marked.add(index);
  });
  if (shown !== null) marked.add(Math.min(shown, staged.length - 1));
  const notes = staged.flatMap((plate, index) => {
    if (!marked.has(index)) return [];
    let crown = plate.points[0];
    plate.points.forEach((point) => {
      if (point.y > crown.y) crown = point;
    });
    return [{
      at: crown,
      label: plate.label,
      color: plate.role === "a" ? "#e7b08a" : plate.role === "b" ? "#7ee0e4" : "#f7f7f4",
    }];
  });
  return (
    <div className="hybrid-morph">
      <div className="hybrid-morph-stage">
        {staged.length > 0 ? (
          <MeshPreview
            contain
            fitScale={5.05}
            yaw={yaw}
            pitch={pitch}
            mesh={null}
            guides={[...morphLook(staged), ...projectionGuides(staged.map((plate) => plate.points)), ...sectionCage(staged.map((plate) => plate.points))]}
            notes={notes}
          />
        ) : null}
      </div>
      <div className="hybrid-morph-play">
        <button type="button" className="hybrid-morph-toggle" aria-label={playing ? "Pause sections" : "Play sections"} aria-pressed={playing} onClick={onToggle}>
          <span className="hybrid-morph-mark" data-state={playing ? "pause" : "play"} />
        </button>
        <input
          className="hybrid-morph-range"
          type="range"
          min={0}
          max={Math.max(0, plates.length - 1)}
          value={Math.min(head, Math.max(0, plates.length - 1))}
          aria-label="Section sequence"
          onChange={(event) => onScrub(Number(event.target.value))}
        />
        <span className="hybrid-morph-legend">A → H → B</span>
      </div>
    </div>
  );
}

function stageSequence(plates: { points: Vec3[]; role: "a" | "hybrid" | "b"; label: string }[]) {
  if (plates.length === 0) return plates;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  plates.forEach((plate) => plate.points.forEach((point) => {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }));
  const height = Math.max(0.001, maxY - minY);
  const midZ = (minZ + maxZ) / 2;
  const count = plates.length;
  const length = height * 2.7;
  const mid = (count - 1) / 2;
  return plates.map((plate, index) => {
    const along = mid === 0 ? 0 : (index - mid) / mid;
    const x = mid === 0 ? 0 : (index - mid) * (length / (count - 1));
    const bow = (1 - along * along) * height * 0.34;
    return {
      ...plate,
      points: plate.points.map((point) => ({
        x,
        y: point.y,
        z: (point.z - midZ) * 0.22 - bow,
      })),
    };
  });
}

function projectionGuides(plates: Vec3[][]) {
  if (plates.length === 0) return [];
  let minY = Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  plates.flat().forEach((point) => {
    minY = Math.min(minY, point.y);
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
  });
  const height = Math.max(0.001, plates.flat().reduce((span, point) => Math.max(span, point.y), -Infinity) - minY);
  const floor = minY - height * 0.07;
  const color: [number, number, number] = [0.78, 0.76, 0.72];
  const guides: { mesh: IsoMesh; color: [number, number, number]; opacity: number }[] = [];
  plates.forEach((points) => {
    let foot = points[0];
    points.forEach((point) => {
      if (point.y < foot.y) foot = point;
    });
    if (!foot) return;
    dash(foot, { x: foot.x, y: floor, z: foot.z }, height * 0.004).forEach((mesh) => {
      guides.push({ mesh, color, opacity: 0.34 });
    });
    guides.push({
      mesh: strut({ x: foot.x, y: floor, z: foot.z }, { x: foot.x, y: floor, z: foot.z + height * 0.012 }, height * 0.0035),
      color,
      opacity: 0.5,
    });
  });
  dash({ x: minX, y: floor, z: 0 }, { x: maxX, y: floor, z: 0 }, height * 0.003).forEach((mesh) => {
    guides.push({ mesh, color, opacity: 0.28 });
  });
  return guides;
}

function morphLook(plates: { points: Vec3[]; role: "a" | "hybrid" | "b" }[]) {
  const guides: { mesh: IsoMesh; color: [number, number, number]; opacity: number }[] = [];
  plates.forEach((plate) => {
    const color: [number, number, number] = plate.role === "hybrid" ? [0.98, 0.98, 0.97] : plate.role === "a" ? [0.86, 0.5, 0.34] : [0.28, 0.78, 0.82];
    guides.push({ mesh: thickPlate(plate.points, plateDepth(plate.points) * 0.72), color, opacity: plate.role === "hybrid" ? 0.62 : 0.4 });
    if (plate.points.length >= 3) guides.push({ mesh: outlineHair(plate.points), color, opacity: 0.95 });
  });
  return guides;
}

function sectionCage(plates: Vec3[][]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  plates.flat().forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  });
  if (!Number.isFinite(minX)) return [];
  const pad = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 0.035;
  minX -= pad;
  minY -= pad;
  minZ -= pad;
  maxX += pad;
  maxY += pad;
  maxZ += pad;
  const corner = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
  const corners = [
    corner(minX, minY, minZ), corner(maxX, minY, minZ), corner(maxX, maxY, minZ), corner(minX, maxY, minZ),
    corner(minX, minY, maxZ), corner(maxX, minY, maxZ), corner(maxX, maxY, maxZ), corner(minX, maxY, maxZ),
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  return edges.flatMap(([from, to]) => dash(corners[from], corners[to], span * 0.0035).map((mesh) => ({
    mesh,
    color: [0.72, 0.74, 0.73] as [number, number, number],
    opacity: 0.4,
  })));
}

function dash(from: Vec3, to: Vec3, width: number): IsoMesh[] {
  const parts: IsoMesh[] = [];
  const steps = 7;
  for (let step = 0; step < steps; step += 2) {
    const start = step / steps;
    const end = (step + 1) / steps;
    const a = mixPoint(from, to, start);
    const b = mixPoint(from, to, end);
    parts.push(strut(a, b, width));
  }
  return parts;
}

function mixPoint(from: Vec3, to: Vec3, t: number): Vec3 {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

function strut(a: Vec3, b: Vec3, width: number): IsoMesh {
  const dir = unit(minus(b, a));
  const hint = Math.abs(dir.y) > 0.85 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const side = times(unit(cross(dir, hint)), width);
  return quadMesh([plus(a, side), plus(b, side), minus(b, side), minus(a, side)]);
}

function ProfileFigure({
  label,
  outer,
  openings,
  color,
  active = false,
  copied = false,
  featured = false,
}: {
  label: string;
  outer: { u: number; v: number }[];
  openings: { u: number; v: number }[][];
  color: string;
  active?: boolean;
  copied?: boolean;
  featured?: boolean;
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
  const pad = Math.max(maxU - minU, maxV - minV, 1e-4) * 0.04;
  const path = outer.map((point) => `${point.u},${point.v}`).join(" ");
  const grad = `dna-glow-${label.replace(/[^a-z0-9]+/gi, "")}`;
  const view = `${minU - pad} ${-(maxV + pad)} ${Math.max(maxU - minU, 1e-4) + pad * 2} ${Math.max(maxV - minV, 1e-4) + pad * 2}`;
  return (
    <figure className="hybrid-process-figure" data-active={active || undefined} data-copied={copied || undefined} data-featured={featured || undefined} style={featured ? { ["--dna-fill" as string]: `url(#${grad})` } : undefined}>
      <svg viewBox={view} role="img" aria-label={label}>
        {featured ? (
          <defs>
            <radialGradient id={grad} cx="50%" cy="50%" r="58%">
              <stop offset="0%" stopColor={color} stopOpacity="0.78" />
              <stop offset="62%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0.04" />
            </radialGradient>
          </defs>
        ) : null}
        <g transform="scale(1,-1)">
          <polygon className="hybrid-dna-shell" points={path} fill="none" stroke={color} strokeWidth={featured ? 2.2 : 1.35} vectorEffect="non-scaling-stroke" />
          {openings.map((opening, index) => (
            <polygon key={index} points={opening.map((point) => `${point.u},${point.v}`).join(" ")} fill="none" stroke={color} strokeWidth={1.15} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function lineUp(plates: Vec3[][]): Vec3[][] {
  if (plates.length === 0) return plates;
  const frames = plates.map((points) => {
    const origin = mean(points);
    const normal = ringNormal(points);
    const upright = inPlane(normal, { x: 0, y: 1, z: 0 });
    const width = unit(cross(normal, upright));
    const height = unit(cross(width, normal));
    return { origin, width, height, points };
  });
  for (let index = 1; index < frames.length; index += 1) {
    if (dot(frames[index].width, frames[index - 1].width) < 0) frames[index].width = times(frames[index].width, -1);
    if (dot(frames[index].height, frames[index - 1].height) < 0) frames[index].height = times(frames[index].height, -1);
  }
  let reach = 0;
  let samples = 0;
  frames.forEach((frame) => {
    frame.points.forEach((point) => {
      const delta = minus(point, frame.origin);
      reach += Math.hypot(dot(delta, frame.width), dot(delta, frame.height));
      samples += 1;
    });
  });
  const step = Math.max((samples > 0 ? reach / samples : 1) * 1.2, 0.08);
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

function inPlane(normal: Vec3, hint: Vec3): Vec3 {
  const rejected = minus(hint, times(normal, dot(hint, normal)));
  const span = Math.hypot(rejected.x, rejected.y, rejected.z);
  if (span < 1e-5) {
    const fallback = Math.abs(normal.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    return inPlane(normal, fallback);
  }
  return times(rejected, 1 / span);
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

function plateDepth(points: Vec3[]) {
  const center = mean(points);
  let reach = 0;
  points.forEach((point) => {
    reach += Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z);
  });
  reach /= Math.max(1, points.length);
  return Math.max(reach * 0.1, 0.02);
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

