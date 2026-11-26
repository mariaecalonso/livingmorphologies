"use client";

import { useEffect, useRef, useState } from "react";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";
import type { IsoMesh } from "@/lib/scan/isomesh";

const STEPS = [
  "Network domain",
  "Positioned solids",
  "Volumetric occupancy",
  "Accepted voids",
  "Combined volume",
  "Voxel boundary",
  "Continuous boundary",
];

type Study = {
  provisional: boolean;
  missing: { id: string; parameter: string }[];
  parameters: { cell: number; shelter: number; minimumGap: number };
  shrinkWrapTriangles: number;
  occupiedCubicFeet: number;
  voidCubicFeet: number;
  unclaimed: number;
  components: number;
  leaked: number;
  solidConflicts: number;
  processing: string;
  voxelTriangles: number;
  continuousTriangles: number;
  continuousNote: string;
  elapsedMs: number;
  voxel: { triangles: number; positions: string; normals: string; indices: string };
  continuousMesh: { triangles: number; positions: string; normals: string; indices: string } | null;
};

export function NetworkVoidProcess() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; pan: boolean } | null>(null);
  const [step, setStep] = useState(0);
  const [cell, setCell] = useState(2);
  const [shelter, setShelter] = useState(12);
  const [minimumGap, setMinimumGap] = useState(3);
  const [continuous, setContinuous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [study, setStudy] = useState<Study | null>(null);
  const [voxelMesh, setVoxelMesh] = useState<IsoMesh | null>(null);
  const [continuousMesh, setContinuousMesh] = useState<IsoMesh | null>(null);
  const [showVoxel, setShowVoxel] = useState(true);
  const [showContinuous, setShowContinuous] = useState(true);
  const [error, setError] = useState("");
  const [turn, setTurn] = useState({ yaw: 0.8, pitch: -0.5, zoom: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const meshes = [];
    if (showVoxel && voxelMesh) meshes.push({ id: "voxel", mesh: voxelMesh, translate: { x: 0, y: 0, z: 0 }, selected: false, plain: true, color: [0.78, 0.8, 0.82] as [number, number, number] });
    if (showContinuous && continuousMesh) meshes.push({ id: "continuous", mesh: continuousMesh, translate: { x: 0, y: 0, z: 0 }, selected: false, plain: false, color: [0.78, 0.5, 0.37] as [number, number, number] });
    if (meshes.length === 0) return;
    drawPlacedMeshes(canvas, meshes, turn.yaw, turn.pitch, 80, false, 4.4, false, 0.9 / turn.zoom, undefined, true, true, undefined, 1, 1200, [0, 0, 0, 1], "hybrid");
  }, [continuousMesh, showContinuous, showVoxel, turn.pitch, turn.yaw, turn.zoom, voxelMesh]);

  const run = () => {
    setBusy(true);
    setError("");
    void fetch("/api/skill5/network-void", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cell, shelter, minimumGap, continuous }),
    })
      .then(async (response) => {
        const body = await response.json() as Study & { error?: string };
        if (!response.ok) throw new Error(body.error || "The provisional study failed.");
        setStudy(body);
        setVoxelMesh(unpack(body.voxel));
        setContinuousMesh(body.continuousMesh ? unpack(body.continuousMesh) : null);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The provisional study failed."))
      .finally(() => setBusy(false));
  };

  return (
    <main className="network-void-study">
      <div>
      <header>
        <p>Provisional study</p>
        <h1>Network constrained void</h1>
      </header>
      <p>This page does not read Site Strategy, Designer Zoning, or a selected assembly. Corridor width, zone height, and the two cluster poses below are labeled test values.</p>
      <ol>
        {STEPS.map((label, index) => (
          <li key={label}>
            <button type="button" data-active={step === index || undefined} onClick={() => setStep(index)}>{index + 1} {label}</button>
          </li>
        ))}
      </ol>
      <section>
        <h2>{STEPS[step]}</h2>
        {step === 0 ? <p>The domain is the union of a provisional zone polygon and a corridor. A centerline without a width is omitted. The domain limits where a void may be accepted. It is not a building envelope.</p> : null}
        {step === 1 ? <p>Each solid is one frozen Final Cluster: its parent morphologies and its stored connectors, placed in site feet. The shrink-wrap film is not the occupancy.</p> : null}
        {step === 2 ? <p>Occupied cells are the raster shell and the interior of each solid. An opening that reaches the solid’s bounds stays empty. Solids that extend outside the domain are counted as conflicts and are not clipped.</p> : null}
        {step === 3 ? <p>Accepted voids are the air held between the two solids, inside the domain, within the shelter distance and above the minimum gap. The rest of the domain stays unclaimed.</p> : null}
        {step === 4 ? <p>The combined volume is the occupied cells plus the accepted voids. The two masks stay separate.</p> : null}
        {step === 5 ? <p>The voxel boundary is the exposed faces of that combined volume. It is a diagnostic mesh, not Enclosure.</p> : null}
        {step === 6 ? <p>The continuous boundary reuses the distance-field reconstruction at the same cell size, in chunks when the extent requires it. It does not replace the voxel boundary or the occupancy.</p> : null}
        <label>Cell feet <input type="number" min={0.5} step={0.5} value={cell} onChange={(event) => setCell(Number(event.target.value))} /></label>
        <label>Shelter feet <input type="number" min={1} step={1} value={shelter} onChange={(event) => setShelter(Number(event.target.value))} /></label>
        <label>Minimum gap feet <input type="number" min={1} step={1} value={minimumGap} onChange={(event) => setMinimumGap(Number(event.target.value))} /></label>
        <label><input type="checkbox" checked={continuous} onChange={(event) => setContinuous(event.target.checked)} /> Compute continuous boundary</label>
        <label><input type="checkbox" checked={showVoxel} onChange={(event) => setShowVoxel(event.target.checked)} /> Voxel boundary</label>
        <label><input type="checkbox" checked={showContinuous} onChange={(event) => setShowContinuous(event.target.checked)} /> Continuous boundary</label>
        <button type="button" disabled={busy} onClick={run}>{busy ? "Running" : "Run provisional study"}</button>
        {error ? <p>{error}</p> : null}
        {study ? (
          <dl>
            <div><dt>Occupied</dt><dd>{study.occupiedCubicFeet} ft³</dd></div>
            <div><dt>Accepted void</dt><dd>{study.voidCubicFeet} ft³</dd></div>
            <div><dt>Unclaimed cells</dt><dd>{study.unclaimed}</dd></div>
            <div><dt>Components</dt><dd>{study.components}</dd></div>
            <div><dt>Leakage</dt><dd>{study.leaked}</dd></div>
            <div><dt>Solid conflicts</dt><dd>{study.solidConflicts}</dd></div>
            <div><dt>Shrink wrap</dt><dd>{study.shrinkWrapTriangles} tris</dd></div>
            <div><dt>Voxel boundary</dt><dd>{study.voxelTriangles} tris</dd></div>
            <div><dt>Continuous</dt><dd>{study.continuousTriangles} tris</dd></div>
            <div><dt>Processing</dt><dd>{study.processing}</dd></div>
            <div><dt>Runtime</dt><dd>{study.elapsedMs} ms</dd></div>
          </dl>
        ) : null}
        {study ? <p>{study.continuousNote}</p> : null}
        {study && study.missing.length > 0 ? <p>Missing parameters: {study.missing.map((item) => `${item.id} ${item.parameter}`).join("; ")}</p> : null}
      </section>
      </div>
      <div
        className="network-void-view"
        onWheel={(event) => {
          event.preventDefault();
          setTurn((current) => ({ ...current, zoom: Math.min(2.4, Math.max(0.45, current.zoom * Math.exp(-event.deltaY * 0.001))) }));
        }}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY, yaw: turn.yaw, pitch: turn.pitch, pan: event.shiftKey || event.button === 1 || event.button === 2 };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x;
          const dy = event.clientY - drag.current.y;
          if (drag.current.pan) return;
          setTurn({ ...turn, yaw: drag.current.yaw + dx * 0.01, pitch: Math.max(-1.2, Math.min(1.2, drag.current.pitch + dy * 0.01)) });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <canvas ref={canvasRef} />
      </div>
    </main>
  );
}

function unpack(packed: Study["voxel"] | null): IsoMesh | null {
  if (!packed || packed.triangles < 1) return null;
  const view = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  };
  return {
    triangles: packed.triangles,
    positions: new Float32Array(view(packed.positions)),
    normals: new Float32Array(view(packed.normals)),
    indices: new Uint32Array(view(packed.indices)),
  };
}
