"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { revealSmooth, validateMeshes, type AssemblyValidation } from "@/lib/skill4/assembly-validation";
import type { Vec3 } from "@/lib/skill4/contract";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import { filmWrapAssembly, type FilmWrap } from "@/lib/skill4/film-wrap";
import { IDENTITY_BASIS, rotateByBasis } from "@/lib/skill4/tile-basis";

type Phase = "idle" | "scanning" | "analyzing" | "forming" | "filming" | "tightening" | "smoothing" | "complete";

export type FilmSweep = {
  id: number;
  duration: number;
  kind: "scan" | "wrap";
  film: FilmWrap | null;
  bounds: Bounds;
  findings: Finding[];
  step: number;
  veil: PlacedMesh | null;
  guides: PlacedMesh[];
  /** Separate shrink-wraps. Each one keeps its own size, so distant clusters stay apart. */
  clusters?: FilmCluster[];
  veils?: PlacedMesh[];
};

type FilmCluster = {
  film: FilmWrap | null;
  bounds: Bounds;
  guides: PlacedMesh[];
  veil: PlacedMesh | null;
};

const SCAN_MOVE_MS = 2200;
const SCAN_HOLD_MS = 180;
const FILM_MS = 2800;
const TIGHT_MS = 2200;
export const SWEEP_MS = SCAN_MOVE_MS + SCAN_HOLD_MS;
const WRAP_MS = FILM_MS + TIGHT_MS;

export function filmSweepFrame(assembly: readonly PlacedMesh[], sweep: FilmSweep, t: number): PlacedMesh[] {
  if (sweep.clusters?.length) return clusterFrame(assembly, sweep, t);
  if (sweep.kind === "scan" || !sweep.film) {
    const scan = Math.min(1, (t * sweep.duration) / SCAN_MOVE_MS);
    if (sweep.guides.length === 0) sweep.guides = scanGuides(sweep.bounds, 0, "scanning", []).map(guideMesh);
    placeScan(sweep.guides, sweep.bounds, scan);
    return [...assembly, ...sweep.guides];
  }
  const elapsed = t * sweep.duration;
  const filming = elapsed < FILM_MS;
  const along = filming ? elapsed / FILM_MS : (elapsed - FILM_MS) / TIGHT_MS;
  const step = filming ? Math.round(along * 24) : 24 + Math.round(Math.min(1, along) * 24);
  if (sweep.step !== step) {
    sweep.step = step;
    const scan = filming ? step / 24 : 1;
    const puff = filming ? 1 : 1 - (step - 24) / 24;
    const limit = sweep.bounds.minX + (sweep.bounds.maxX - sweep.bounds.minX) * scan;
    const span = Math.max(sweep.bounds.maxX - sweep.bounds.minX, sweep.bounds.maxY - sweep.bounds.minY, sweep.bounds.maxZ - sweep.bounds.minZ);
    sweep.veil = presentFilm(sweep.film, limit, puff, span);
    if (sweep.veil) sweep.veil.opacity = 0.22 + (1 - puff) * 0.78;
    sweep.guides = filming ? scanGuides(sweep.bounds, scan, "filming", sweep.findings).map(guideMesh) : [];
  }
  if (!filming) return sweep.veil ? [sweep.veil] : [];
  const shown = assembly.map((item) => isSolid(item) ? { ...item, opacity: 0.42 } : item);
  return sweep.veil ? [...shown, sweep.veil, ...sweep.guides] : [...shown, ...sweep.guides];
}

function clusterFrame(assembly: readonly PlacedMesh[], sweep: FilmSweep, t: number): PlacedMesh[] {
  const clusters = sweep.clusters ?? [];
  const wrapping = sweep.kind === "wrap" && clusters.some((cluster) => cluster.film);
  if (!wrapping) {
    const scan = Math.min(1, (t * sweep.duration) / SCAN_MOVE_MS);
    const guides: PlacedMesh[] = [];
    clusters.forEach((cluster, index) => {
      if (cluster.guides.length === 0) {
        cluster.guides = scanGuides(cluster.bounds, 0, "scanning", []).map((guide, echo) => {
          const mesh = guideMesh(guide, echo);
          mesh.id = `guide:${index}:${echo}`;
          return mesh;
        });
      }
      placeScan(cluster.guides, cluster.bounds, scan);
      guides.push(...cluster.guides);
    });
    return [...assembly, ...guides];
  }
  const elapsed = t * sweep.duration;
  const filming = elapsed < FILM_MS;
  const along = filming ? elapsed / FILM_MS : (elapsed - FILM_MS) / TIGHT_MS;
  const step = filming ? Math.round(along * 24) : 24 + Math.round(Math.min(1, along) * 24);
  if (sweep.step !== step) {
    sweep.step = step;
    const puff = filming ? 1 : 1 - (step - 24) / 24;
    const scan = filming ? step / 24 : 1;
    const veils: PlacedMesh[] = [];
    const guides: PlacedMesh[] = [];
    clusters.forEach((cluster, index) => {
      if (!cluster.film) return;
      const span = Math.max(cluster.bounds.maxX - cluster.bounds.minX, cluster.bounds.maxY - cluster.bounds.minY, cluster.bounds.maxZ - cluster.bounds.minZ);
      const limit = cluster.bounds.minX + (cluster.bounds.maxX - cluster.bounds.minX) * scan;
      const veil = presentFilm(cluster.film, limit, puff, span);
      veil.id = `film-wrap:${index}`;
      veil.opacity = 0.22 + (1 - puff) * 0.78;
      cluster.veil = veil;
      veils.push(veil);
      if (filming) {
        scanGuides(cluster.bounds, scan, "filming", []).forEach((guide, echo) => {
          const mesh = guideMesh(guide, echo);
          mesh.id = `guide:${index}:${echo}`;
          guides.push(mesh);
        });
      }
    });
    sweep.veils = veils;
    sweep.guides = guides;
    sweep.veil = veils[0] ?? null;
  }
  const veils = sweep.veils ?? [];
  if (!filming) return veils;
  const shown = assembly.map((item) => isSolid(item) ? { ...item, opacity: 0.42 } : item);
  return [...shown, ...veils, ...sweep.guides];
}

export function useAssemblyFilm(assembly: readonly PlacedMesh[], keepFilm = false, clusterIds?: readonly (readonly string[])[]) {
  const solids = useMemo(() => assembly.filter(isSolid), [assembly]);
  const signature = solids.map((item) => `${item.id}:${item.mesh.triangles}:${item.mesh.positions.length}`).join("|");
  const [phase, setPhase] = useState<Phase>("idle");
  const [blend, setBlend] = useState(0);
  const [sweep, setSweep] = useState<FilmSweep | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const stageRef = useRef(phase);
  stageRef.current = phase;
  const boundsRef = useRef<Bounds | null>(null);
  const findingsRef = useRef<Finding[]>([]);
  const activeSignature = run?.signature;

  useEffect(() => {
    if (activeSignature && activeSignature !== signature) {
      setPhase("idle");
      setBlend(0);
      setSweep(null);
      setRun(null);
    }
  }, [activeSignature, signature]);

  useEffect(() => {
    if (phase !== "smoothing") return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const amount = Math.min(1, (now - started) / 1600);
      const nextBlend = Math.round(amount * 8) / 8;
      setBlend((current) => current === nextBlend ? current : nextBlend);
      if (amount >= 1) setPhase("complete");
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const solidsRef = useRef(solids);
  solidsRef.current = solids;
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const clusterRef = useRef(clusterIds);
  clusterRef.current = clusterIds;
  useEffect(() => {
    if (phase !== "forming") return;
    let cancel = false;
    const timer = window.setTimeout(() => {
      if (cancel) return;
      const source = solidsRef.current;
      const lists = clusterRef.current;
      if (lists?.length) {
        const clusters: FilmCluster[] = [];
        for (const ids of lists) {
          const members = new Set(ids);
          const items = source.filter((item) => members.has(item.id));
          if (items.length === 0) continue;
          let wrapped: FilmWrap | null = null;
          try {
            wrapped = filmWrapAssembly(items.map(worldOf));
          } catch {
            wrapped = null;
          }
          if (!wrapped) continue;
          clusters.push({ film: wrapped, bounds: boundsOf(items), guides: [], veil: null });
        }
        if (cancel) return;
        if (!clusters.length || !boundsRef.current) {
          setPhase("complete");
          return;
        }
        setRun({
          signature: signatureRef.current,
          validation: null,
          targets: source,
          findings: [],
          bounds: boundsRef.current,
          worlds: source.map(worldOf),
          film: clusters[0].film,
          clusters: clusters.flatMap((cluster) => cluster.film ? [{ film: cluster.film, bounds: cluster.bounds }] : []),
        });
        setSweep({
          id: performance.now(),
          duration: WRAP_MS,
          kind: "wrap",
          film: clusters[0].film,
          bounds: boundsRef.current,
          findings: [],
          step: -1,
          veil: null,
          guides: [],
          clusters,
        });
        setPhase("filming");
        return;
      }
      const targets = targetsOf(source);
      const worlds = source.map(worldOf);
      let film: FilmWrap | null = null;
      try {
        film = filmWrapAssembly(worlds);
      } catch {
        film = null;
      }
      if (cancel) return;
      const bounds = boundsRef.current;
      if (!bounds) {
        setPhase("complete");
        return;
      }
      if (!film || (!film.check.adopted && !keepFilm)) {
        const validation = validateMeshes(targets.map((item) => item.mesh));
        if (!validation) {
          setPhase("complete");
          return;
        }
        const findings = validation.meshes.flatMap((item, index) => item.issues.map((issue) => ({
          at: place(targets[index], issue.x, issue.y, issue.z),
          weight: issue.weight,
        })));
        setRun({
          signature: signatureRef.current,
          validation,
          targets,
          findings,
          bounds,
          worlds,
          film: null,
        });
        setBlend(0);
        setPhase("smoothing");
        return;
      }
      setRun({
        signature: signatureRef.current,
        validation: null,
        targets,
        findings: [],
        bounds,
        worlds,
        film,
      });
      setSweep(wrapSweep(film, bounds, []));
      setPhase("filming");
    }, 32);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [keepFilm, phase]);

  const instances = useMemo(() => {
    if (!run || phase === "idle" || phase === "scanning" || phase === "forming" || phase === "filming") return assembly;
    if (phase === "complete" && run.clusters?.length && keepFilm) {
      return run.clusters.map((cluster, index) => ({ ...filmPlace(cluster.film, 1), id: `film-wrap:${index}` }));
    }
    if (phase === "complete") return run.film && (run.film.check.adopted || keepFilm) ? [filmPlace(run.film, 1)] : assembly;
    if (phase === "smoothing" && blend > 0 && run.validation) {
      const order = new Map(run.targets.map((item, index) => [item.id, index]));
      return solids.map((item) => {
        const index = order.get(item.id);
        if (index == null) return item;
        return { ...item, mesh: revealSmooth(run.validation.meshes[index], blend) };
      });
    }
    return assembly;
  }, [assembly, blend, keepFilm, phase, run, solids]);

  const ready = targetsOf(solids).length > 0;
  const running = phase === "scanning" || phase === "analyzing" || phase === "forming" || phase === "filming" || phase === "tightening" || phase === "smoothing";
  const start = () => {
    if (running) return;
    const bounds = boundsOf(solids);
    boundsRef.current = bounds;
    findingsRef.current = [];
    setBlend(0);
    const lists = clusterRef.current;
    const clusters = lists?.length ? lists.flatMap((ids) => {
      const members = new Set(ids);
      const items = solids.filter((item) => members.has(item.id));
      return items.length ? [{ film: null, bounds: boundsOf(items), guides: [], veil: null }] : [];
    }) : undefined;
    setSweep({ id: performance.now(), duration: SWEEP_MS, kind: "scan", film: null, bounds, findings: [], step: -1, veil: null, guides: [], clusters });
    setPhase("scanning");
  };
  const finishSweep = () => {
    if (stageRef.current === "scanning") {
      setSweep(null);
      setPhase("forming");
      return;
    }
    setSweep(null);
    setPhase("complete");
  };

  const kept = Boolean((run?.clusters?.length && keepFilm) || (run?.film && (run.film.check.adopted || keepFilm)));
  const status = phase === "complete" ? (kept ? "VALIDATED" : "ISSUES DETECTED") : null;
  return { instances, start, running, ready, status, phase, sweep, finishSweep };
}

type Finding = { at: Vec3; weight: number };
type Bounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
type Run = {
  signature: string;
  validation: AssemblyValidation | null;
  targets: PlacedMesh[];
  findings: Finding[];
  bounds: Bounds;
  worlds: { positions: Float32Array; indices: Uint32Array }[];
  film: FilmWrap | null;
  clusters?: { film: FilmWrap; bounds: Bounds }[];
};

function placeScan(guides: readonly PlacedMesh[], bounds: Bounds, scan: number) {
  const span = Math.max(0.001, bounds.maxX - bounds.minX);
  const x = bounds.minX + span * scan;
  guides.forEach((guide, echo) => {
    const at = x - span * 0.045 * echo;
    const positions = guide.mesh.positions;
    for (let index = 0; index < positions.length; index += 3) positions[index] = at;
  });
}

function guideMesh(guide: { mesh: IsoMesh; color: [number, number, number]; opacity?: number }, index: number): PlacedMesh {
  return {
    id: `guide:scan-${index}`,
    mesh: guide.mesh,
    translate: { x: 0, y: 0, z: 0 },
    selected: false,
    color: guide.color,
    opacity: guide.opacity,
  };
}

function worldOf(instance: PlacedMesh) {
  const source = instance.mesh.positions;
  const positions = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 3) {
    const point = place(instance, source[index], source[index + 1], source[index + 2]);
    positions[index] = point.x;
    positions[index + 1] = point.y;
    positions[index + 2] = point.z;
  }
  return { positions, indices: instance.mesh.indices };
}

function wrapSweep(film: FilmWrap, bounds: Bounds, findings: Finding[]): FilmSweep {
  return {
    id: performance.now(),
    duration: WRAP_MS,
    kind: "wrap",
    film,
    bounds,
    findings,
    step: -1,
    veil: null,
    guides: [],
  };
}

function presentFilm(film: FilmWrap, limit: number, puff: number, span: number): PlacedMesh {
  const source = film.mesh;
  const positions = new Float32Array(source.positions.length);
  const push = Math.max(0, puff) * span * 0.035;
  for (let index = 0; index < source.positions.length; index += 3) {
    positions[index] = source.positions[index] + source.normals[index] * push;
    positions[index + 1] = source.positions[index + 1] + source.normals[index + 1] * push;
    positions[index + 2] = source.positions[index + 2] + source.normals[index + 2] * push;
  }
  const indices: number[] = [];
  for (let triangle = 0; triangle < source.indices.length; triangle += 3) {
    const a = source.indices[triangle] * 3;
    const b = source.indices[triangle + 1] * 3;
    const c = source.indices[triangle + 2] * 3;
    const x = (positions[a] + positions[b] + positions[c]) / 3;
    if (x <= limit) indices.push(source.indices[triangle], source.indices[triangle + 1], source.indices[triangle + 2]);
  }
  return filmPlace({
    ...film,
    mesh: {
      positions,
      normals: source.normals,
      indices: Uint32Array.from(indices),
      triangles: indices.length / 3,
    },
  }, 0.22 + (1 - Math.min(1, puff)) * 0.55);
}

function filmPlace(film: FilmWrap, opacity: number): PlacedMesh {
  return {
    id: "film-wrap",
    mesh: film.mesh,
    translate: { x: 0, y: 0, z: 0 },
    selected: false,
    color: [0.78, 0.94, 0.93],
    opacity,
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
  if (marks) guides.push({ mesh: marks, color: [0.98, 0.72, 0.48], opacity: 0.9 });
  return guides;
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

function sheet(x: number, y0: number, y1: number, z0: number, z1: number): IsoMesh {
  return {
    positions: new Float32Array([x, y0, z0, x, y1, z0, x, y1, z1, x, y0, z1]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    triangles: 2,
  };
}

export { ValidationPanel } from "./validation-panel-record";

