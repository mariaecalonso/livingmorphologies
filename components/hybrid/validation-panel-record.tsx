"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { revealSmooth, validateMeshes, type AssemblyValidation, type ValidationMetrics } from "@/lib/skill4/assembly-validation";
import type { Vec3 } from "@/lib/skill4/contract";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import { IDENTITY_BASIS, rotateByBasis } from "@/lib/skill4/tile-basis";
import { MeshPreview } from "./mesh-preview";

type Phase = "idle" | "scanning" | "analyzing" | "smoothing" | "complete";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Idle",
  scanning: "Scanning",
  analyzing: "Analyzing",
  smoothing: "Smoothing",
  complete: "Complete",
};

const VERDICT_LABEL = {
  clear: "No corrections needed",
  corrected: "Corrected & validated",
  unresolved: "Unresolved issues",
} as const;

const METRICS: { key: keyof ValidationMetrics; label: string; tone: "a" | "b" }[] = [
  { key: "continuity", label: "Continuity", tone: "b" },
  { key: "junction", label: "Junction fit", tone: "a" },
  { key: "smoothness", label: "Surface smoothness", tone: "b" },
  { key: "integrity", label: "Geometry integrity", tone: "a" },
];

export function ValidationPanel({ assembly }: { assembly: readonly PlacedMesh[] }) {
  const solids = useMemo(() => assembly.filter(isSolid), [assembly]);
  const signature = solids.map((item) => `${item.id}:${item.mesh.triangles}:${item.mesh.positions.length}`).join("|");
  const [yaw, setYaw] = useState(0.82);
  const [pitch, setPitch] = useState(0.22);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [scan, setScan] = useState(0);
  const [blend, setBlend] = useState(0);
  const [run, setRun] = useState<Run | null>(null);
  const activeSignature = run?.signature;

  useEffect(() => {
    if (activeSignature && activeSignature !== signature) {
      setPhase("idle");
      setScan(0);
      setBlend(0);
      setRun(null);
    }
  }, [activeSignature, signature]);

  useEffect(() => {
    if (phase === "idle" || phase === "complete") return;
    let frame = 0;
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      elapsed += Math.min(180, now - last);
      last = now;
      if (phase === "scanning") {
        const next = Math.round(Math.min(1, elapsed / 2800) * 24) / 24;
        setScan((current) => current === next ? current : next);
        if (elapsed >= 2800) setPhase("analyzing");
        else frame = requestAnimationFrame(tick);
        return;
      }
      if (phase === "analyzing") {
        if (elapsed >= 900) setPhase("smoothing");
        else frame = requestAnimationFrame(tick);
        return;
      }
      const amount = Math.min(1, elapsed / 2600);
      const nextScan = Math.round((1 - amount) * 24) / 24;
      const nextBlend = Math.round(amount * 8) / 8;
      setScan((current) => current === nextScan ? current : nextScan);
      setBlend((current) => current === nextBlend ? current : nextBlend);
      if (amount >= 1) setPhase("complete");
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const shown = useMemo(() => {
    if (!run || blend <= 0) return solids;
    const order = new Map(run.targets.map((item, index) => [item.id, index]));
    return solids.map((item) => {
      const index = order.get(item.id);
      if (index == null) return item;
      return { ...item, mesh: revealSmooth(run.validation.meshes[index], blend) };
    });
  }, [blend, run, solids]);

  const guides = useMemo(() => {
    if (!run || phase === "idle" || phase === "complete") return [];
    return scanGuides(run.bounds, scan, phase, run.findings);
  }, [phase, run, scan]);

  const orbitDown = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, yaw, pitch };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const orbitMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setYaw(drag.yaw - (event.clientX - drag.x) * 0.008);
    setPitch(Math.min(1.2, Math.max(-1.2, drag.pitch - (event.clientY - drag.y) * 0.008)));
  };
  const orbitUp = () => {
    dragRef.current = null;
  };
  const metrics = displayMetrics(phase, scan, blend, run?.validation ?? null);
  const ready = targetsOf(solids).length > 0;
  const running = phase === "scanning" || phase === "analyzing" || phase === "smoothing";
  const start = () => {
    if (running) return;
    const targets = targetsOf(solids);
    const validation = validateMeshes(targets.map((item) => item.mesh));
    if (!validation) return;
    const findings = validation.meshes.flatMap((item, index) => item.issues.map((issue) => ({
      at: place(targets[index], issue.x, issue.y, issue.z),
      weight: issue.weight,
    })));
    setRun({
      signature,
      validation,
      targets,
      findings,
      bounds: boundsOf(solids),
    });
    setScan(0);
    setBlend(0);
    setPhase("scanning");
  };

  return (
    <Panel className="hybrid-process-card hybrid-validate-card major-section-frame">
      <PanelHeader
        mark="08"
        title="Smoothing & Validation"
        aside={(
          <div className="hybrid-validate-aside">
            <button type="button" className="hybrid-validate-run" disabled={!ready || running} onClick={start}>
              {running ? "Running" : "Run validation"}
            </button>
          </div>
        )}
      />
      <div className="hybrid-validate">
        <div
          className="hybrid-validate-stage"
          data-yaw={yaw}
          data-pitch={pitch}
          onPointerDown={orbitDown}
          onPointerMove={orbitMove}
          onPointerUp={orbitUp}
          onPointerCancel={orbitUp}
        >
          {shown.length > 0 ? (
            <MeshPreview placed={shown} guides={guides} contain fitScale={3.45} yaw={yaw} pitch={pitch} />
          ) : (
            <p className="hybrid-missing">The assembly appears after the tiles are placed.</p>
          )}
        </div>
        <aside className="hybrid-validate-readout">
          <p className="hybrid-validate-status">{PHASE_LABEL[phase]}</p>
          <ul className="hybrid-validate-metrics">
            {METRICS.map((metric) => {
              const value = metrics ? metrics[metric.key] : null;
              return (
                <li key={metric.key} data-tone={metric.tone}>
                  <span>{metric.label}</span>
                  <b>{value == null ? "—" : value.toFixed(2)}</b>
                  <i style={{ width: `${value == null ? 0 : Math.round(value * 100)}%` }} />
                </li>
              );
            })}
          </ul>
          {phase === "complete" && run ? (
            <>
              <p className="hybrid-validate-badge" data-state={run.validation.verdict}>{VERDICT_LABEL[run.validation.verdict]}</p>
              {run.validation.note ? <p className="hybrid-validate-note">{run.validation.note}</p> : null}
            </>
          ) : (
            <p className="hybrid-validate-note">{ready ? "One pass scans the assembly, then resolves only the flagged junctions." : "Generate a hybrid to validate the assembly."}</p>
          )}
        </aside>
      </div>
    </Panel>
  );
}

type Finding = { at: Vec3; weight: number };
type Bounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
type Run = {
  signature: string;
  validation: AssemblyValidation;
  targets: PlacedMesh[];
  findings: Finding[];
  bounds: Bounds;
};

function displayMetrics(phase: Phase, _scan: number, blend: number, validation: AssemblyValidation | null): ValidationMetrics | null {
  if (!validation || phase === "idle") return null;
  if (phase === "scanning" || phase === "analyzing") return validation.before;
  if (phase === "smoothing") return mixMetrics(validation.before, validation.after, blend);
  return validation.after;
}

function mixMetrics(from: ValidationMetrics, to: ValidationMetrics, amount: number): ValidationMetrics {
  const mix = (a: number, b: number) => a + (b - a) * amount;
  return {
    continuity: mix(from.continuity, to.continuity),
    junction: mix(from.junction, to.junction),
    smoothness: mix(from.smoothness, to.smoothness),
    integrity: mix(from.integrity, to.integrity),
  };
}

function isSolid(instance: PlacedMesh) {
  return !instance.id.startsWith("guide:") && !instance.id.startsWith("contact:") && instance.mesh.triangles > 0;
}

function targetsOf(solids: readonly PlacedMesh[]) {
  const hybrids = solids.filter((item) => item.palette);
  return hybrids.length > 0 ? hybrids : solids.filter((item) => item.id === "joined-assembly");
}

function place(instance: PlacedMesh, x: number, y: number, z: number): Vec3 {
  let placed = rotateByBasis(instance.basis ?? IDENTITY_BASIS, { x, y, z });
  const mirror = instance.mirror ?? 0;
  if (mirror === 1) placed = { ...placed, x: -placed.x };
  if (mirror === 2) placed = { ...placed, y: -placed.y };
  if (mirror === 3) placed = { ...placed, z: -placed.z };
  const spin = instance.spin ?? 0;
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  return {
    x: placed.x * cs + placed.z * sn + instance.translate.x,
    y: placed.y + instance.translate.y,
    z: -placed.x * sn + placed.z * cs + instance.translate.z,
  };
}

function boundsOf(solids: readonly PlacedMesh[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  solids.forEach((instance) => {
    const step = Math.max(1, Math.floor(instance.mesh.positions.length / 3 / 800));
    for (let index = 0; index < instance.mesh.positions.length; index += step * 3) {
      const point = place(instance, instance.mesh.positions[index], instance.mesh.positions[index + 1], instance.mesh.positions[index + 2]);
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      minZ = Math.min(minZ, point.z);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      maxZ = Math.max(maxZ, point.z);
    }
  });
  if (!Number.isFinite(minX)) return { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };
  const pad = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 0.04;
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

function scanGuides(bounds: Bounds, scan: number, phase: Phase, findings: Finding[]) {
  const span = Math.max(0.001, bounds.maxX - bounds.minX);
  const x = bounds.minX + span * scan;
  const travel = phase === "smoothing" ? -1 : 1;
  const guides: { mesh: IsoMesh; color: [number, number, number]; opacity?: number }[] = [
    { mesh: sheet(x, bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ), color: [1, 0.93, 0.86], opacity: 0.78 },
  ];
  for (let echo = 1; echo <= 3; echo += 1) {
    const at = x - travel * span * 0.045 * echo;
    guides.push({
      mesh: sheet(at, bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ),
      color: [0.86, 0.48, 0.3],
      opacity: 0.2 - echo * 0.04,
    });
  }
  const near = findings.filter((finding) => Math.abs(finding.at.x - x) < span * 0.08).slice(0, 48);
  const marks = ticks(near.map((finding) => finding.at), span * 0.011);
  if (marks) guides.push({ mesh: marks, color: [0.98, 0.72, 0.48], opacity: phase === "complete" ? 0 : 0.9 });
  return guides;
}

function sheet(x: number, y0: number, y1: number, z0: number, z1: number): IsoMesh {
  return {
    positions: new Float32Array([x, y0, z0, x, y1, z0, x, y1, z1, x, y0, z1]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    triangles: 2,
  };
}

function ticks(points: Vec3[], size: number): IsoMesh | null {
  if (points.length === 0) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  points.forEach((point) => {
    const start = positions.length / 3;
    const corners = [
      [point.x, point.y - size, point.z],
      [point.x, point.y + size, point.z],
      [point.x, point.y, point.z - size],
      [point.x, point.y, point.z + size],
    ];
    corners.forEach((corner) => {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(0, 0, 1);
    });
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  });
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}
