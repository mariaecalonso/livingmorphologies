"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
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
  type ProcessSection,
} from "@/lib/skill4/section-hybrid";
import { resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";
import { drawPlacedMeshes, placedAssemblyBounds, type PlacedMesh } from "@/lib/skill4/draw-placed";
import { rotateByBasis, type Mat3 } from "@/lib/skill4/tile-basis";
import { MeshPreview } from "./mesh-preview";

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
}: {
  connection: TileConnection | null;
  tiles: readonly TileInstance[];
  loaded: ReadonlyMap<string, ModuleHandoff>;
  syntheticMode: boolean;
  growth: { connectionId: string; candidateId: string; mesh: IsoMesh; opacity: number } | null;
  sectionPlay?: { connectionId: string; candidateId: string; rings: { x: number; y: number; z: number }[][]; shown: number } | null;
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
  const shownHybrid = generated?.geometry ?? null;
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
  const generationStatus = connection?.generationStatus;
  const generationSeen = useRef(generationStatus);
  const [formationRun, setFormationRun] = useState(0);
  useEffect(() => {
    if (generationSeen.current !== "generating" && generationStatus === "generating") {
      setFormationRun((current) => current + 1);
    }
    generationSeen.current = generationStatus;
  }, [generationStatus, connection?.id]);
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
            yaw={0.7}
            pitch={0.06}
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
  return (
    <div className="hybrid-process-row" data-part="all">
      <Panel className="hybrid-process-card hybrid-process-story major-section-frame">
        <div className="hybrid-story-stage">
          <PanelHeader mark="04" title={`Clipping Planes to Hybrid Sections (${selectedId})`} />
          <FormationStory
            geometryA={readyA?.geometry ?? null}
            geometryB={readyB?.geometry ?? null}
            sectionsA={process?.a ?? []}
            sectionsB={process?.b ?? []}
            storyKey={`${process?.key ?? ""}:${hybrid.length}:${shownHybrid?.triangles ?? 0}:clone`}
            hybrid={stood.filter((_, index) => entries[index].role === "hybrid")}
            hybridMesh={shownHybrid}
            runId={formationRun}
          />
        </div>
        <div className="hybrid-process-join-side hybrid-dna-side">
          <PanelHeader mark="05" title="Sectional DNA — Extracted Profiles" />
          <SectionalDna sectionsA={process?.a ?? []} sectionsB={process?.b ?? []} />
        </div>
      </Panel>
    </div>
  );
}

const STORY_MS = 12000;
const STORY_OPEN = 0.78;
const FORM_MS = 6400;
const HOLD_MS = 1500;
const STORY_TOTAL_MS = STORY_OPEN * STORY_MS + FORM_MS + HOLD_MS;
const STORY_YAW = 0.32;
const STORY_PITCH = 0.1;
const CUT_A: [number, number, number] = [0.38, 0.24, 0.2];
const CUT_B: [number, number, number] = [0.18, 0.3, 0.3];
const HYBRID_WHITE: [number, number, number] = [0.95, 0.94, 0.92];
const LOOP_SAMPLES = 48;

function FormationStory({
  geometryA,
  geometryB,
  sectionsA,
  sectionsB,
  hybrid,
  hybridMesh,
  storyKey,
  runId,
}: {
  geometryA: IsoMesh | null;
  geometryB: IsoMesh | null;
  sectionsA: ProcessSection[];
  sectionsB: ProcessSection[];
  hybrid: Vec3[][];
  hybridMesh: IsoMesh | null;
  storyKey: string;
  runId: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(false);
  const clockRef = useRef({ origin: 0, held: 0 });
  const cacheRef = useRef<{ key: string; model: StoryModel | null }>({ key: "", model: null });
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  if (cacheRef.current.key !== storyKey) {
    cacheRef.current = { key: storyKey, model: buildStory(geometryA, geometryB, sectionsA, sectionsB, hybrid, hybridMesh) };
  }
  const model = cacheRef.current.model;
  useEffect(() => {
    if (runId === 0) return;
    clockRef.current = { origin: performance.now(), held: 0 };
    playingRef.current = true;
    setPlaying(true);
    setStarted(true);
  }, [runId]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !model) return;
    let frame = 0;
    const tick = (now: number) => {
      const clock = clockRef.current;
      if (playingRef.current) {
        const raw = now - clock.origin;
        if (raw >= STORY_TOTAL_MS) {
          clock.held = 1;
          playingRef.current = false;
          setPlaying(false);
        } else clock.held = raw / STORY_TOTAL_MS;
      }
      const zoom = poseStory(model, storyPhase(clock.held));
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      const fit = storyFit(model.bounds, aspect) * zoom;
      drawPlacedMeshes(
        canvas,
        model.instances,
        STORY_YAW,
        STORY_PITCH,
        1,
        false,
        undefined,
        false,
        1,
        model.center,
        false,
        false,
        fit,
        2,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [model]);
  if (!model) return <p className="hybrid-missing">Select two geometries and connection faces to see the sections form.</p>;
  return (
    <>
      <div className="hybrid-story-view">
        <canvas ref={canvasRef} className="hybrid-preview-canvas" />
      </div>
      {started ? <div className="hybrid-morph-play">
        <button
          type="button"
          className="hybrid-morph-toggle"
          aria-label={playing ? "Pause formation" : "Play formation"}
          aria-pressed={playing}
          onClick={() => {
            const clock = clockRef.current;
            if (playingRef.current) {
              playingRef.current = false;
              setPlaying(false);
              return;
            }
            clock.origin = performance.now() - clock.held * STORY_TOTAL_MS;
            if (clock.held >= 1) {
              clock.held = 0;
              clock.origin = performance.now();
            }
            playingRef.current = true;
            setPlaying(true);
          }}
        >
          <span className="hybrid-morph-mark" data-state={playing ? "pause" : "play"} />
        </button>
        <input
          className="hybrid-morph-range"
          type="range"
          min={0}
          max={1000}
          defaultValue={0}
          aria-label="Formation sequence"
          onChange={(event) => {
            playingRef.current = false;
            setPlaying(false);
            clockRef.current.held = Number(event.target.value) / 1000;
          }}
        />
        <span className="hybrid-morph-legend">A → sections → H → B</span>
      </div> : null}
    </>
  );
}

type StoryPlane = {
  face: PlacedMesh;
  frame: PlacedMesh;
  depth: number;
  index: number;
  count: number;
  rest: Vec3;
  drop: number;
};

type StoryBounds = { min: Vec3; max: Vec3; center: Vec3 };

type HybridBeat = {
  mesh: PlacedMesh;
  along: number;
  restX: number;
  packedX: number;
  shape: Vec3[];
  from: Vec3[];
  fromAlong: number;
  width: number;
  start: number;
  slot: number;
};

type StoryPhase = { t: number; form: number; hold: number };

type StoryModel = {
  instances: PlacedMesh[];
  solids: PlacedMesh[];
  planes: StoryPlane[];
  cuts: { mesh: PlacedMesh; index: number; count: number; homeX: number; spreadX: number; stackX: number; pairX: number; side: -1 | 1; restBasis: Mat3; restZ: number; role: "fill" | "edge" }[];
  hybrids: PlacedMesh[];
  hybridCuts: PlacedMesh[];
  hybridBeats: HybridBeat[];
  guides: PlacedMesh[];
  hybridBody: PlacedMesh | null;
  hybridShadow: PlacedMesh | null;
  hybridHalf: number;
  bounds: StoryBounds;
  center: Vec3;
};

function buildStory(
  geometryA: IsoMesh | null,
  geometryB: IsoMesh | null,
  sectionsA: ProcessSection[],
  sectionsB: ProcessSection[],
  hybrid: Vec3[][],
  hybridMesh: IsoMesh | null,
): StoryModel | null {
  if (!geometryA || !geometryB || sectionsA.length === 0 || sectionsB.length === 0) return null;
  const sideA = placeSide(geometryA, sectionsA, PLANE_A, CUT_A, 1);
  const sideB = placeSide(geometryB, sectionsB, PLANE_B, CUT_B, -1);
  const halfH = Math.max(sideA.crown, sideB.crown, 0.4);
  const gap = halfH * 1.35;
  shiftSide(sideA, -gap);
  shiftSide(sideB, gap);
  sideA.cuts.forEach((cut) => {
    cut.homeX = cut.mesh.translate.x;
  });
  sideB.cuts.forEach((cut) => {
    cut.homeX = cut.mesh.translate.x;
  });
  spreadStack(sideA.cuts, halfH);
  spreadStack(sideB.cuts, halfH);
  const formed = betweenForm(sideA.cuts, sideB.cuts);
  const hybridBeats: HybridBeat[] = [];
  const hybridCuts = formed.cuts;
  const hybrids = [formed.shadow, formed.body].filter((mesh): mesh is PlacedMesh => mesh !== null);
  const guides: PlacedMesh[] = [];
  const instances = [
    sideA.solid,
    sideB.solid,
    ...sideA.planes.flatMap((plane) => [plane.face, plane.frame]),
    ...sideB.planes.flatMap((plane) => [plane.face, plane.frame]),
    ...hybrids,
    ...hybridCuts,
    ...sideA.cuts.map((cut) => cut.mesh),
    ...sideB.cuts.map((cut) => cut.mesh),
    ...guides,
  ];
  return {
    instances,
    solids: [sideA.solid, sideB.solid],
    planes: [...sideA.planes, ...sideB.planes],
    cuts: [...sideA.cuts, ...sideB.cuts],
    hybrids,
    hybridCuts,
    hybridBeats,
    guides,
    hybridBody: formed.body,
    hybridShadow: formed.shadow,
    hybridHalf: 0,
    ...storyFrame(instances, halfH * 1.45, halfH),
  };
}

function spreadStack(cuts: { index: number; side: -1 | 1; spreadX: number; stackX: number; pairX: number; role: "fill" | "edge"; restBasis: Mat3; mesh: PlacedMesh }[], halfH: number) {
  const left = cuts.some((cut) => cut.side === 1);
  const inner = halfH * (left ? 2.35 : 1.75);
  const outer = halfH * (left ? 7.4 : 7.15);
  const anchor = new Map<number, number>();
  cuts.forEach((cut) => {
    if (cut.role === "edge" || anchor.has(cut.index)) return;
    anchor.set(cut.index, cutAnchorX(cut));
  });
  const ordered = [...anchor.entries()].sort((a, b) => a[1] - b[1]);
  const slot = new Map(ordered.map(([index], place) => [index, place]));
  const last = Math.max(1, ordered.length - 1);
  cuts.forEach((cut) => {
    const place = slot.get(cut.index) ?? 0;
    const fromLeft = place / last;
    const along = left ? 1 - fromLeft : fromLeft;
    const distance = inner + (outer - inner) * along;
    cut.spreadX = (cut.side === 1 ? -1 : 1) * distance;
    cut.stackX = cut.spreadX;
    cut.pairX = cut.spreadX;
  });
}

function cutAnchorX(cut: { restBasis: Mat3; mesh: PlacedMesh }) {
  const positions = cut.mesh.mesh.positions;
  let x = 0;
  let count = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const world = rotateByBasis(cut.restBasis, { x: positions[index], y: positions[index + 1], z: positions[index + 2] });
    x += world.x + cut.mesh.translate.x;
    count += 1;
  }
  return count === 0 ? cut.mesh.translate.x : x / count;
}

function betweenForm(
  cutsA: { index: number; role: "fill" | "edge"; side: -1 | 1; mesh: PlacedMesh; spreadX: number; homeX: number; restZ: number; restBasis: Mat3 }[],
  cutsB: { index: number; role: "fill" | "edge"; side: -1 | 1; mesh: PlacedMesh; spreadX: number; homeX: number; restZ: number; restBasis: Mat3 }[],
): { body: PlacedMesh | null; shadow: PlacedMesh | null; cuts: PlacedMesh[] } {
  const cutA = closestFill(cutsA);
  const cutB = closestFill(cutsB);
  const edgeA = cutsA.find((cut) => cut.role === "edge" && cut.index === cutA.index);
  const zA = cutA.restZ + (cutA.side === 1 ? (cutA.spreadX - cutA.homeX) * Math.tan(STORY_YAW) : 0);
  const zB = cutB.restZ + (cutB.side === 1 ? (cutB.spreadX - cutB.homeX) * Math.tan(STORY_YAW) : 0);
  const steps = 5;
  const cuts: PlacedMesh[] = [];
  for (let index = 0; index < steps; index += 1) {
    const blend = (index + 1) / (steps + 1);
    const translate = {
      x: cutA.spreadX + (cutB.spreadX - cutA.spreadX) * blend,
      y: cutA.mesh.translate.y + (cutB.mesh.translate.y - cutA.mesh.translate.y) * blend,
      z: zA + (zB - zA) * blend,
    };
    cuts.push({
      id: `guide:story-hybrid-cut-${index}`,
      mesh: cutA.mesh.mesh,
      translate,
      selected: false,
      color: HYBRID_WHITE,
      opacity: 0,
      kind: 0,
      basis: cutA.restBasis,
    });
    if (edgeA) {
      cuts.push({
        id: `guide:story-hybrid-edge-${index}`,
        mesh: edgeA.mesh.mesh,
        translate: { ...translate },
        selected: false,
        color: [0.16, 0.15, 0.14],
        opacity: 0,
        kind: 0,
        basis: cutA.restBasis,
      });
    }
  }
  return { body: null, shadow: null, cuts };
}

function closestFill<T extends { spreadX: number; role: "fill" | "edge" }>(cuts: T[]) {
  const fills = cuts.filter((cut) => cut.role === "fill");
  const pool = fills.length > 0 ? fills : cuts;
  return pool.reduce((best, cut) => Math.abs(cut.spreadX) < Math.abs(best.spreadX) ? cut : best);
}

function matchCutFacing(cuts: { mesh: PlacedMesh }[], section: ProcessSection, basisA: Mat3, reference: ProcessSection) {
  const targetUp = rotateByBasis(basisA, unit(reference.planeV));
  const basis = alignedBasis(section.planeNormal, section.planeV, targetUp);
  cuts.forEach((cut) => retargetBasis(cut.mesh, basis));
}

function alignedBasis(normal: Vec3, up: Vec3, targetUp: Vec3): Mat3 {
  const aimed = aimBasis(normal, { x: 1, y: 0, z: 0 });
  const lifted = rotateByBasis(aimed, unit(up));
  const twist = Math.atan2(targetUp.z, targetUp.y) - Math.atan2(lifted.z, lifted.y);
  return multiplyBasis(rotateX(twist), aimed);
}

function rotateX(angle: number): Mat3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [1, 0, 0, 0, cosine, sine, 0, -sine, cosine];
}

function multiplyBasis(left: Mat3, right: Mat3): Mat3 {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3;
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      out[column * 3 + row] = left[row] * right[column * 3] + left[3 + row] * right[column * 3 + 1] + left[6 + row] * right[column * 3 + 2];
    }
  }
  return out;
}

function retargetBasis(mesh: PlacedMesh, basis: Mat3) {
  const current = mesh.basis ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const positions = mesh.mesh.positions;
  let worldX = 0;
  let worldY = 0;
  let worldZ = 0;
  let localX = 0;
  let localY = 0;
  let localZ = 0;
  let count = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const local = { x: positions[index], y: positions[index + 1], z: positions[index + 2] };
    const world = rotateByBasis(current, local);
    worldX += world.x + mesh.translate.x;
    worldY += world.y + mesh.translate.y;
    worldZ += world.z + mesh.translate.z;
    localX += local.x;
    localY += local.y;
    localZ += local.z;
    count += 1;
  }
  if (count === 0) return;
  const placed = rotateByBasis(basis, { x: localX / count, y: localY / count, z: localZ / count });
  mesh.basis = basis;
  mesh.translate = { x: worldX / count - placed.x, y: worldY / count - placed.y, z: worldZ / count - placed.z };
}

function hybridFormation(
  rings: Vec3[][],
  innerA: number,
  innerB: number,
  packedA: number,
  packedB: number,
  halfH: number,
  parentA: Vec3[],
  parentB: Vec3[],
): HybridBeat[] {
  const lined = lineUp(rings.filter((ring) => ring.length >= 3));
  const width = halfH * 0.07;
  let shapes: Vec3[][];
  if (lined.length === 0) {
    if (parentA.length < 3 || parentB.length < 3) return [];
    const steps = 5;
    shapes = Array.from({ length: steps }, (_, index) => blendLoop(parentA, parentB, index / (steps - 1)));
  } else {
    let radius = 0.001;
    lined.forEach((ring) => ring.forEach((point) => {
      radius = Math.max(radius, Math.hypot(point.y, point.z));
    }));
    const scale = (halfH * 0.92) / radius;
    shapes = lined.map((ring) => resampleClosed(ring.map((point) => ({ x: 0, y: point.y * scale, z: point.z * scale })), LOOP_SAMPLES));
  }
  const count = shapes.length;
  const fromIndex = new Array<number>(count).fill(-2);
  let previousA = -2;
  let previousB = -3;
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    fromIndex[low] = previousA;
    previousA = low;
    if (high !== low) {
      fromIndex[high] = previousB;
      previousB = high;
    }
    low += 1;
    high -= 1;
  }
  const revealStart = 0.28;
  const slot = 0.46 / count;
  const starts = new Array<number>(count).fill(revealStart);
  let step = 0;
  low = 0;
  high = count - 1;
  while (low <= high) {
    starts[low] = revealStart + step * slot;
    step += 1;
    if (high !== low) {
      starts[high] = revealStart + step * slot;
      step += 1;
    }
    low += 1;
    high -= 1;
  }
  const alongOf = (index: number) => (count === 1 ? 0.5 : index / (count - 1));
  return shapes.map((shape, index) => {
    const along = alongOf(index);
    const sourceIndex = fromIndex[index];
    const source = sourceIndex === -3 ? parentB : sourceIndex === -2 ? parentA : shapes[sourceIndex];
    const fromAlong = sourceIndex >= 0 ? alongOf(sourceIndex) : sourceIndex === -3 ? 1 : 0;
    const from = alignClosed(source.length === shape.length ? source : resampleClosed(source, LOOP_SAMPLES), shape);
    return {
      mesh: {
        id: `guide:story-hybrid-cut-${index}`,
        mesh: sectionRibbon(from, width),
        translate: { x: innerA + (innerB - innerA) * along, y: 0, z: 0 },
        selected: false,
        color: hybridTint(fromAlong),
        opacity: 0,
        kind: 0 as const,
      },
      along,
      restX: innerA + (innerB - innerA) * along,
      packedX: packedA + (packedB - packedA) * along,
      shape,
      from,
      fromAlong,
      width,
      start: starts[index],
      slot,
    };
  });
}

function pairingGuides(
  meshA: PlacedMesh | undefined,
  meshB: PlacedMesh | undefined,
  pairA: number,
  pairB: number,
  halfH: number,
): PlacedMesh[] {
  if (!meshA || !meshB) return [];
  const loopA = profileSamples(meshA, pairA);
  const loopB = profileSamples(meshB, pairB);
  if (loopA.length < 3 || loopB.length < 3) return [];
  const guides: PlacedMesh[] = [];
  const ink: [number, number, number] = [0.82, 0.84, 0.82];
  let low = Infinity;
  let high = -Infinity;
  loopA.forEach((point) => {
    low = Math.min(low, point.y);
    high = Math.max(high, point.y);
  });
  loopB.forEach((point) => {
    low = Math.min(low, point.y);
    high = Math.max(high, point.y);
  });
  guides.push(guideLine({ x: 0, y: low, z: 0 }, { x: 0, y: high, z: 0 }, halfH * 0.004, ink, "guide:story-pair-axis"));
  [0.18, 0.42, 0.66, 0.88].forEach((mark, index) => {
    const from = loopA[Math.min(loopA.length - 1, Math.round(mark * (loopA.length - 1)))];
    const to = loopB[Math.min(loopB.length - 1, Math.round(mark * (loopB.length - 1)))];
    const span = minus(to, from);
    guides.push(guideLine(from, plus(from, times(span, 0.22)), halfH * 0.0045, ink, `guide:story-pair-hair-a-${index}`));
    guides.push(guideLine(to, plus(to, times(span, -0.22)), halfH * 0.0045, ink, `guide:story-pair-hair-b-${index}`));
    const mid = plus(from, times(span, 0.5));
    guides.push(guideLine(minus(mid, times(span, 0.06)), plus(mid, times(span, 0.06)), halfH * 0.005, ink, `guide:story-pair-mark-${index}`));
  });
  return guides;
}

function profileSamples(mesh: PlacedMesh, x: number): Vec3[] {
  const basis = mesh.basis ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const positions = mesh.mesh.positions;
  const points: Vec3[] = [];
  for (let index = 0; index < positions.length; index += 6) {
    const world = rotateByBasis(basis, { x: positions[index], y: positions[index + 1], z: positions[index + 2] });
    points.push({ x, y: world.y + mesh.translate.y, z: world.z + mesh.translate.z });
  }
  return resampleClosed(points, 28);
}

function guideLine(from: Vec3, to: Vec3, width: number, color: [number, number, number], id: string): PlacedMesh {
  return {
    id,
    mesh: hairMesh(from, to, width),
    translate: { x: 0, y: 0, z: 0 },
    selected: false,
    color,
    opacity: 0,
    kind: 0,
  };
}

function hairMesh(from: Vec3, to: Vec3, width: number): IsoMesh {
  const delta = minus(to, from);
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (length < 1e-5) return quadMesh([from, from, from, from]);
  const dir = times(delta, 1 / length);
  const up = Math.abs(dir.y) > 0.85 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const side = times(unit(cross(dir, up)), width);
  return quadMesh([plus(from, side), minus(from, side), minus(to, side), plus(to, side)]);
}

function facingLoop(section: ProcessSection, mesh: PlacedMesh, radius: number): Vec3[] {
  if (section.outer.length < 3) return [];
  const basis = mesh.basis ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const raw = section.outer.map((point) => {
    const world = rotateByBasis(basis, point);
    return { x: 0, y: world.y + mesh.translate.y, z: world.z + mesh.translate.z };
  });
  return fitLoop(resampleClosed(raw, LOOP_SAMPLES), radius);
}

function resampleClosed(points: Vec3[], count: number): Vec3[] {
  if (points.length === 0 || count < 1) return [];
  if (points.length === 1) return Array.from({ length: count }, () => ({ ...points[0] }));
  const lengths = [0];
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    const current = points[index];
    lengths.push(lengths[index] + Math.hypot(next.x - current.x, next.y - current.y, next.z - current.z));
  }
  const total = lengths[points.length] || 1;
  const out: Vec3[] = [];
  for (let sample = 0; sample < count; sample += 1) {
    const dist = (sample / count) * total;
    let index = 0;
    while (index < points.length - 1 && lengths[index + 1] < dist) index += 1;
    const span = lengths[index + 1] - lengths[index] || 1;
    const blend = (dist - lengths[index]) / span;
    const current = points[index];
    const next = points[(index + 1) % points.length];
    out.push({
      x: current.x + (next.x - current.x) * blend,
      y: current.y + (next.y - current.y) * blend,
      z: current.z + (next.z - current.z) * blend,
    });
  }
  return out;
}

function fitLoop(points: Vec3[], radius: number): Vec3[] {
  if (points.length === 0) return points;
  let y = 0;
  let z = 0;
  points.forEach((point) => {
    y += point.y;
    z += point.z;
  });
  y /= points.length;
  z /= points.length;
  let reach = 0.001;
  points.forEach((point) => {
    reach = Math.max(reach, Math.hypot(point.y - y, point.z - z));
  });
  const scale = radius / reach;
  return points.map((point) => ({ x: 0, y: (point.y - y) * scale, z: (point.z - z) * scale }));
}

function alignClosed(source: Vec3[], target: Vec3[]): Vec3[] {
  if (source.length !== target.length || source.length === 0) return target.map((point) => ({ ...point }));
  const score = (points: Vec3[]) => {
    let best = Infinity;
    for (let shift = 0; shift < points.length; shift += 1) {
      let sum = 0;
      for (let index = 0; index < points.length; index += 3) {
        const point = points[(index + shift) % points.length];
        const aim = target[index];
        sum += (point.y - aim.y) ** 2 + (point.z - aim.z) ** 2;
      }
      if (sum < best) best = sum;
    }
    return best;
  };
  const reversed = [...source].reverse();
  const chosen = score(reversed) < score(source) ? reversed : source;
  let bestShift = 0;
  let best = Infinity;
  for (let shift = 0; shift < chosen.length; shift += 1) {
    let sum = 0;
    for (let index = 0; index < chosen.length; index += 2) {
      const point = chosen[(index + shift) % chosen.length];
      const aim = target[index];
      sum += (point.y - aim.y) ** 2 + (point.z - aim.z) ** 2;
    }
    if (sum < best) {
      best = sum;
      bestShift = shift;
    }
  }
  return chosen.map((_, index) => ({ ...chosen[(index + bestShift) % chosen.length] }));
}

function blendLoop(from: Vec3[], to: Vec3[], amount: number): Vec3[] {
  return to.map((point, index) => {
    const start = from[index] ?? point;
    return {
      x: 0,
      y: start.y + (point.y - start.y) * amount,
      z: start.z + (point.z - start.z) * amount,
    };
  });
}

function paintLoop(mesh: IsoMesh, loop: Vec3[], width: number) {
  const next = sectionRibbon(loop, width);
  if (next.positions.length === mesh.positions.length && next.normals.length === mesh.normals.length) {
    mesh.positions.set(next.positions);
    mesh.normals.set(next.normals);
    return;
  }
  mesh.positions = next.positions;
  mesh.normals = next.normals;
  mesh.indices = next.indices;
  mesh.triangles = next.triangles;
}

function mixColor(from: [number, number, number], to: [number, number, number], amount: number): [number, number, number] {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

function hybridTint(along: number): [number, number, number] {
  if (along <= 0.5) return mixColor(CUT_A, HYBRID_WHITE, along / 0.5);
  return mixColor(HYBRID_WHITE, CUT_B, (along - 0.5) / 0.5);
}

function storyFrame(instances: PlacedMesh[], headroom: number, halfH: number) {
  const bounds = placedAssemblyBounds(instances);
  const min = bounds.min ?? { x: -1, y: -1, z: -1 };
  const max = bounds.max ?? { x: 1, y: 1, z: 1 };
  max.y += headroom;
  const reach = halfH * 8.2;
  min.x = Math.min(min.x, -reach);
  max.x = Math.max(max.x, reach);
  return { bounds: { min, max, center: { x: 0, y: bounds.center.y, z: bounds.center.z } }, center: { x: 0, y: bounds.center.y, z: bounds.center.z } };
}

function storyFit(bounds: StoryBounds, aspect: number) {
  const cy = Math.cos(STORY_YAW);
  const sy = Math.sin(STORY_YAW);
  const cp = Math.cos(STORY_PITCH);
  const sp = Math.sin(STORY_PITCH);
  let maxX = 0.001;
  let maxY = 0.001;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const px = x - bounds.center.x;
        const py = y - bounds.center.y;
        const pz = z - bounds.center.z;
        const x1 = px * cy + pz * sy;
        const z1 = -px * sy + pz * cy;
        const y2 = py * cp - z1 * sp;
        maxX = Math.max(maxX, Math.abs(x1));
        maxY = Math.max(maxY, Math.abs(y2));
      }
    }
  }
  const focal = 1.55;
  const eye = 3.4;
  const limit = 2.05;
  return Math.min((limit * eye) / (maxX * focal), (limit * eye) / (maxY * aspect * focal));
}

function placeSide(
  geometry: IsoMesh,
  sections: ProcessSection[],
  tone: typeof PLANE_A,
  contour: [number, number, number],
  sign: -1 | 1,
) {
  const face = sections[0];
  const basis = aimBasis(face.planeNormal, { x: sign, y: 0, z: 0 });
  const origin = rotateByBasis(basis, face.planeOrigin);
  const translate = { x: -origin.x, y: -origin.y, z: -origin.z };
  let reach = 0.4;
  let back = 0.2;
  let crown = 0.4;
  const positions = geometry.positions;
  for (let index = 0; index < positions.length; index += 3) {
    const placed = rotateByBasis(basis, { x: positions[index], y: positions[index + 1], z: positions[index + 2] });
    reach = Math.max(reach, Math.hypot(placed.x - origin.x, placed.y - origin.y, placed.z - origin.z));
    back = Math.max(back, -sign * (placed.x - origin.x));
    crown = Math.max(crown, Math.abs(placed.y - origin.y));
  }
  let height = 0.4;
  sections.forEach((section) => section.outer.forEach((point) => {
    height = Math.max(height, Math.abs(rotateByBasis(basis, point).y - origin.y));
  }));
  const solid: PlacedMesh = {
    id: `story-solid-${sign}`,
    mesh: geometry,
    translate,
    selected: false,
    color: PAPER,
    kind: 0,
    basis,
    opacity: 1,
  };
  const planes: StoryPlane[] = sections.map((section, index) => {
    const sheet = glassSheet(section);
    const rest = { ...translate };
    const faceMesh: PlacedMesh = {
      id: `guide:story-plane-${sign}-${index}`,
      mesh: sheet.face,
      translate: { ...rest },
      selected: false,
      color: tone.glass,
      opacity: 0.1,
      kind: 0,
      basis,
    };
    const frameMesh: PlacedMesh = {
      id: `guide:story-frame-${sign}-${index}`,
      mesh: sheet.frame,
      translate: { ...rest },
      selected: false,
      color: tone.edge,
      opacity: 0.34,
      kind: 0,
      basis,
    };
    return {
      face: faceMesh,
      frame: frameMesh,
      depth: section.depth,
      index,
      count: sections.length,
      rest,
      drop: crown * 1.55,
    };
  });
  const cuts = sections.flatMap((section, index) => storySlices(section, contour).map((cut, cutIndex) => ({
    mesh: {
      id: `guide:story-cut-${sign}-${index}-${cutIndex}`,
      mesh: cut.mesh,
      translate: { ...translate },
      selected: false,
      color: cut.color,
      opacity: 0,
      kind: 0 as const,
      basis,
    },
    index,
    count: sections.length,
    homeX: 0,
    spreadX: 0,
    stackX: 0,
    pairX: 0,
    side: sign,
    restBasis: basis,
    restZ: translate.z,
    role: cut.role,
  })));
  return { solid, planes, cuts, reach, back, crown, height, translate };
}

function shiftSide(side: ReturnType<typeof placeSide>, faceX: number) {
  const dx = faceX - side.translate.x;
  side.translate.x += dx;
  side.planes.forEach((plane) => {
    plane.rest.x += dx;
    plane.face.translate.x += dx;
    plane.frame.translate.x += dx;
  });
  side.cuts.forEach((cut) => {
    cut.mesh.translate.x += dx;
  });
}

function hybridPlates(groups: Vec3[][], gap: number, height: number) {
  const plates = groups.filter((points) => points.length >= 3);
  if (plates.length === 0 || height <= 0) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  plates.forEach((points) => points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }));
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  const scale = (height * 1.7) / Math.max(0.001, maxY - minY);
  const span = Math.max(0.001, maxX - minX);
  return plates.map((points, index) => {
    const shaped = points.map((point) => ({
      x: span < 0.001 ? 0 : ((point.x - center.x) / span) * gap * 1.65,
      y: (point.y - center.y) * scale,
      z: (point.z - center.z) * scale,
    }));
    return {
      id: `story-hybrid-${index}`,
      mesh: thickPlate(shaped, plateDepth(shaped) * 0.72),
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
      color: [0.93, 0.92, 0.9] as [number, number, number],
      opacity: 0,
      kind: 0 as const,
    };
  });
}

function storyPhase(held: number): StoryPhase {
  const ms = Math.min(1, Math.max(0, held)) * STORY_TOTAL_MS;
  const openMs = STORY_OPEN * STORY_MS;
  if (ms <= openMs) return { t: ms / STORY_MS, form: 0, hold: 0 };
  const formed = ms - openMs;
  if (formed <= FORM_MS) return { t: STORY_OPEN, form: formed / FORM_MS, hold: 0 };
  return { t: STORY_OPEN, form: 1, hold: Math.min(1, (formed - FORM_MS) / HOLD_MS) };
}

function poseStory(model: StoryModel, phase: StoryPhase) {
  const { t, form, hold } = phase;
  const clear = smooth((t - 0.56) / 0.1);
  model.solids.forEach((solid) => {
    solid.opacity = 1 - clear;
  });
  model.planes.forEach((plane) => {
    const shown = planeArrive(t, plane.index, plane.count);
    const y = plane.rest.y + (1 - shown) * plane.drop;
    plane.face.translate.x = plane.rest.x;
    plane.frame.translate.x = plane.rest.x;
    plane.face.translate.y = y;
    plane.frame.translate.y = y;
    const appear = smooth(shown / 0.18) * (1 - clear);
    plane.face.opacity = 0.22 * appear;
    plane.frame.opacity = 0.7 * appear;
  });
  const spread = smooth((t - 0.64) / 0.14);
  model.cuts.forEach((cut) => {
    const shown = planeArrive(t, cut.index, cut.count);
    const base = smooth((shown - 0.72) / 0.28);
    const x = cut.homeX + (cut.spreadX - cut.homeX) * spread;
    const tone = cut.side === 1 ? CUT_A : CUT_B;
    cut.mesh.color = cut.role === "edge" ? [tone[0] * 0.38, tone[1] * 0.38, tone[2] * 0.38] : tone;
    cut.mesh.opacity = base * 0.98;
    cut.mesh.translate.x = x;
    cut.mesh.translate.z = cut.restZ + (cut.side === 1 ? (x - cut.homeX) * Math.tan(STORY_YAW) : 0);
    cut.mesh.basis = cut.restBasis;
  });
  model.guides.forEach((guide) => {
    guide.opacity = 0;
  });
  const veil = form === 0 && hold === 0 ? 0 : smooth((form - 0.18) / 0.28);
  const firm = form === 0 && hold === 0 ? 0 : smooth((form - 0.58) / 0.32) * (1 - hold) + hold;
  if (model.hybridBody) {
    model.hybridBody.opacity = veil === 0 && firm === 0 ? 0 : 0.07 * veil * (1 - firm) + firm * 0.3;
    model.hybridBody.clipX = 1e9;
    model.hybridBody.color = HYBRID_WHITE;
  }
  if (model.hybridShadow) {
    model.hybridShadow.opacity = veil * 0.62;
    model.hybridShadow.color = [0.03, 0.028, 0.025];
  }
  model.hybridCuts.forEach((cut) => {
    const shown = form === 0 && hold === 0 ? 0 : smooth((form - 0.12) / 0.22);
    cut.opacity = shown * 0.98;
  });
  model.hybrids.forEach((item) => {
    if (item === model.hybridBody || item === model.hybridShadow) return;
    item.opacity = 0.9 * firm;
    item.color = HYBRID_WHITE;
  });
  return 1;
}

function orientHybrid(mesh: IsoMesh | null, fromX: number, toX: number, crown: number): { mesh: PlacedMesh; half: number } | null {
  const target = toX - fromX;
  if (!mesh || mesh.positions.length < 9 || target <= 0.05 || crown <= 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < mesh.positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = mesh.positions[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  const span = [0, 1, 2].map((axis) => Math.max(max[axis] - min[axis], 1e-4));
  const long = span[0] >= span[1] && span[0] >= span[2] ? 0 : span[1] >= span[2] ? 1 : 2;
  const rest = [0, 1, 2].filter((axis) => axis !== long);
  const tall = span[rest[0]] >= span[rest[1]] ? rest[0] : rest[1];
  const wide = rest[0] === tall ? rest[1] : rest[0];
  const fitCross = (crown * 2.15) / Math.max(span[tall], span[wide]);
  const fitLong = target / span[long];
  const scaleLong = fitLong;
  const scaleCross = Math.min(fitLong, fitCross);
  const mid = [long, tall, wide].map((axis) => (min[axis] + max[axis]) / 2);
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    positions[index] = (mesh.positions[index + long] - mid[0]) * scaleLong;
    positions[index + 1] = (mesh.positions[index + tall] - mid[1]) * scaleCross;
    positions[index + 2] = (mesh.positions[index + wide] - mid[2]) * scaleCross;
    if (index + 2 < mesh.normals.length) {
      normals[index] = mesh.normals[index + long];
      normals[index + 1] = mesh.normals[index + tall];
      normals[index + 2] = mesh.normals[index + wide];
    }
  }
  const half = (span[long] * scaleLong) / 2;
  return {
    half,
    mesh: {
      id: "guide:story-hybrid-body",
      mesh: { positions, normals, indices: mesh.indices, triangles: mesh.triangles },
      translate: { x: (fromX + toX) / 2, y: 0, z: 0 },
      selected: false,
      color: [0.93, 0.92, 0.9],
      opacity: 0,
      kind: 0,
      clipX: -half,
    },
  };
}

function planeArrive(t: number, index: number, count: number) {
  const slot = 0.46 / Math.max(1, count);
  const start = 0.05 + index * slot;
  return smooth((t - start) / (slot * 0.86));
}

function smooth(value: number) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function aimBasis(from: Vec3, to: Vec3): Mat3 {
  const source = unit(from);
  const target = unit(to);
  const cosine = Math.max(-1, Math.min(1, dot(source, target)));
  const crossed = cross(source, target);
  const sine = Math.hypot(crossed.x, crossed.y, crossed.z);
  if (sine < 1e-6) {
    if (cosine > 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const pivot = unit(Math.abs(source.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 });
    return axes((vector) => rotateAround(pivot, Math.PI, vector));
  }
  const angle = Math.atan2(sine, cosine);
  const axis = times(crossed, 1 / sine);
  return axes((vector) => rotateAround(axis, angle, vector));
}

function axes(spin: (vector: Vec3) => Vec3): Mat3 {
  const x = spin({ x: 1, y: 0, z: 0 });
  const y = spin({ x: 0, y: 1, z: 0 });
  const z = spin({ x: 0, y: 0, z: 1 });
  return [x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z];
}

function rotateAround(axis: Vec3, angle: number, vector: Vec3): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return plus(
    plus(times(vector, cosine), times(cross(axis, vector), sine)),
    times(axis, dot(axis, vector) * (1 - cosine)),
  );
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

function storySlices(section: ProcessSection, color: [number, number, number]) {
  const outer = resampleClosed(section.outer, 96);
  let span = 0.5;
  outer.forEach((point) => {
    span = Math.max(span, Math.hypot(point.x, point.y, point.z));
  });
  const edge: [number, number, number] = [color[0] * 0.38, color[1] * 0.38, color[2] * 0.38];
  const parts: { mesh: IsoMesh; color: [number, number, number]; role: "fill" | "edge" }[] = [
    { mesh: thickPlate(outer, span * 0.055), color, role: "fill" },
    { mesh: sectionRibbon(outer, span * 0.0065), color: edge, role: "edge" },
  ];
  section.openings.filter((opening) => opening.length >= 3).forEach((opening) => {
    parts.push({ mesh: sectionRibbon(resampleClosed(opening, 64), span * 0.0055), color: edge, role: "edge" });
  });
  return parts;
}

function sectionContours(section: ProcessSection, color: [number, number, number], widthScale = 1) {
  const normal = unit(section.planeNormal);
  const loops = [section.outer, ...section.openings.filter((opening) => opening.length >= 3)];
  let span = 0.5;
  section.outer.forEach((point) => {
    span = Math.max(span, Math.hypot(point.x - section.planeOrigin.x, point.y - section.planeOrigin.y, point.z - section.planeOrigin.z));
  });
  const width = span * 0.012 * widthScale;
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
  for (const section of sections) {
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const point of section.profile) {
      minU = Math.min(minU, point.u);
      maxU = Math.max(maxU, point.u);
      minV = Math.min(minV, point.v);
      maxV = Math.max(maxV, point.v);
    }
    const next = Math.max(0, maxU - minU) * Math.max(0, maxV - minV);
    if (next > area) {
      area = next;
      best = section;
    }
  }
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
  const guides = morphLook(staged);
  const notes = staged.flatMap((plate, index) => {
    if (!marked.has(index)) return [];
    let crown = plate.points[0];
    plate.points.forEach((point) => {
      if (point.y > crown.y) crown = point;
    });
    return [{
      at: crown,
      label: plate.label,
      color: plate.role === "a" ? "#d9b5a4" : plate.role === "b" ? "#a9cecc" : "#f3f1ee",
    }];
  });
  return (
    <div className="hybrid-morph">
      <div className="hybrid-morph-stage">
        {staged.length > 0 ? (
          <MeshPreview
            fill
            steer
            fitScale={1}
            yaw={yaw}
            pitch={pitch}
            mesh={null}
            guides={guides}
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
  const length = height * 6.7;
  const mid = (count - 1) / 2;
  return plates.map((plate, index) => {
    const along = mid === 0 ? 0 : (index - mid) / mid;
    const x = mid === 0 ? 0 : (index - mid) * (length / (count - 1));
    const bow = (1 - along * along) * height * 0.12;
    return {
      ...plate,
      points: plate.points.map((point) => ({
        x,
        y: point.y,
        z: (point.z - midZ) * 0.36 - bow,
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
    const color: [number, number, number] = plate.role === "hybrid" ? [0.93, 0.92, 0.9] : plate.role === "a" ? [0.84, 0.66, 0.56] : [0.58, 0.76, 0.74];
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

