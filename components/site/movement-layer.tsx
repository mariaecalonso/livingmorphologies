"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, CanvasTexture, LineBasicMaterial, Plane, Raycaster, SpriteMaterial, SRGBColorSpace, Vector2, Vector3 } from "three";
import { clipPath, STUDY_LIMIT } from "./site-geometry";
import { pointInRing } from "@/lib/skill5/placement";
import {
  closeApproaches,
  countyLinks,
  mappedLinks,
  nearestWalkLine,
  transitStations,
  type LineApproach,
  type LineHit,
  type PedestrianMode,
} from "@/lib/skill5/pedestrian";
import type { SiteRoad, XZ } from "@/lib/skill5/site-model";

const GROUND_Y = 3.2;
const WALK_Y = 4.2;
const COPPER = "#c77e5f";
const WHITE = "#f4f4f0";
const TEAL = "#14999e";
const MAPPED = "#7d9c9e";
const SHORE = "#8a8680";

type Seg = { ax: number; ay: number; az: number; bx: number; by: number; bz: number };

export type RoadSummary = {
  count: number;
  feet: number;
  local: { count: number; feet: number };
  causeway: { count: number; feet: number };
  expressway: { count: number; feet: number };
  ramp: { count: number; feet: number };
  elevated: number;
  deckSamples: number;
  deckVertices: number;
};

function lengthOf(path: readonly XZ[]) {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) length += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
  return length;
}

function tally(roads: readonly SiteRoad[], kind: SiteRoad["kind"]) {
  const chosen = roads.filter((road) => road.kind === kind);
  return { count: chosen.length, feet: chosen.reduce((sum, road) => sum + lengthOf(road.path), 0) };
}

export function roadSummary(roads: readonly SiteRoad[]): RoadSummary {
  let deckSamples = 0;
  let deckVertices = 0;
  for (const road of roads) {
    if (!road.elevated) continue;
    deckVertices += road.deckFeet?.length ?? road.path.length;
    deckSamples += road.deckFeet?.filter((value) => typeof value === "number").length ?? 0;
  }
  return {
    count: roads.length,
    feet: roads.reduce((sum, road) => sum + lengthOf(road.path), 0),
    local: tally(roads, "local"),
    causeway: tally(roads, "causeway"),
    expressway: tally(roads, "expressway"),
    ramp: tally(roads, "ramp"),
    elevated: roads.filter((road) => road.elevated).length,
    deckSamples,
    deckVertices,
  };
}

function deckAt(road: SiteRoad, index: number) {
  if (!road.elevated) return GROUND_Y;
  const height = road.deckFeet?.[index];
  return typeof height === "number" ? height + 0.8 : null;
}

function pushPath(segments: Seg[], path: readonly XZ[], y: number) {
  for (let index = 1; index < path.length; index += 1) {
    segments.push({ ax: path[index - 1][0], ay: y, az: path[index - 1][1], bx: path[index][0], by: y, bz: path[index][1] });
  }
}

function pushRoad(segments: Seg[], road: SiteRoad, offset = 0) {
  for (let index = 1; index < road.path.length; index += 1) {
    const ay = deckAt(road, index - 1);
    const by = deckAt(road, index);
    if (ay === null || by === null) continue;
    const ax = road.path[index - 1][0];
    const az = road.path[index - 1][1];
    const bx = road.path[index][0];
    const bz = road.path[index][1];
    const dx = bx - ax;
    const dz = bz - az;
    const span = Math.hypot(dx, dz) || 1;
    const px = (-dz / span) * offset;
    const pz = (dx / span) * offset;
    segments.push({ ax: ax + px, ay, az: az + pz, bx: bx + px, by, bz: bz + pz });
  }
}

function dashed(segment: Seg, on: number, gap: number) {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const dz = segment.bz - segment.az;
  const span = Math.hypot(dx, dy, dz);
  if (span < 0.5) return [];
  const pieces: Seg[] = [];
  let cursor = 0;
  while (cursor < span) {
    const end = Math.min(span, cursor + on);
    if (end - cursor > 0.4) {
      const t0 = cursor / span;
      const t1 = end / span;
      pieces.push({
        ax: segment.ax + dx * t0,
        ay: segment.ay + dy * t0,
        az: segment.az + dz * t0,
        bx: segment.ax + dx * t1,
        by: segment.ay + dy * t1,
        bz: segment.az + dz * t1,
      });
    }
    cursor = end + gap;
  }
  return pieces;
}

function geometryOf(segments: readonly Seg[]) {
  const positions = new Float32Array(segments.length * 6);
  segments.forEach((segment, index) => {
    const offset = index * 6;
    positions[offset] = segment.ax;
    positions[offset + 1] = segment.ay;
    positions[offset + 2] = segment.az;
    positions[offset + 3] = segment.bx;
    positions[offset + 4] = segment.by;
    positions[offset + 5] = segment.bz;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  return geometry;
}

function clipSegments(segments: readonly Seg[]) {
  const clipped: Seg[] = [];
  for (const segment of segments) {
    const runs = clipPath([[segment.ax, segment.az], [segment.bx, segment.bz]], STUDY_LIMIT);
    for (const run of runs) {
      for (let index = 1; index < run.length; index += 1) {
        const from = run[index - 1];
        const to = run[index];
        const dx = segment.bx - segment.ax;
        const dz = segment.bz - segment.az;
        const span = dx * dx + dz * dz;
        const tAt = (x: number, z: number) => span < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - segment.ax) * dx + (z - segment.az) * dz) / span));
        const t0 = tAt(from[0], from[1]);
        const t1 = tAt(to[0], to[1]);
        clipped.push({
          ax: from[0],
          ay: segment.ay + (segment.by - segment.ay) * t0,
          az: from[1],
          bx: to[0],
          by: segment.ay + (segment.by - segment.ay) * t1,
          bz: to[1],
        });
      }
    }
  }
  return clipped;
}

function LineSet({ segments, color, opacity }: { segments: readonly Seg[]; color: string; opacity: number }) {
  const geometry = useMemo(() => geometryOf(segments), [segments]);
  const material = useMemo(() => new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }), [color, opacity]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (segments.length === 0) return null;
  return <lineSegments geometry={geometry} material={material} raycast={() => null} renderOrder={7} frustumCulled={false} />;
}

function labelTexture(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "500 52px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 8;
    context.strokeStyle = "rgba(0, 0, 0, 0.75)";
    context.strokeText(text, canvas.width / 2, canvas.height / 2);
    context.fillStyle = "rgba(244, 241, 234, 0.92)";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
  }
  return texture;
}

function FootLabel({ text, x, z }: { text: string; x: number; z: number }) {
  const texture = useMemo(() => labelTexture(text), [text]);
  const material = useMemo(() => new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }), [texture]);
  useEffect(() => () => {
    texture.dispose();
    material.dispose();
  }, [material, texture]);
  return <sprite position={[x, WALK_Y + 8, z]} scale={[46, 16, 1]} material={material} renderOrder={9} raycast={() => null} />;
}

function stationMarks(): Seg[] {
  const marks: Seg[] = [];
  for (const station of transitStations) {
    marks.push(
      { ax: station.x - 16, ay: 16, az: station.z, bx: station.x + 16, by: 16, bz: station.z },
      { ax: station.x, ay: 16, az: station.z - 16, bx: station.x, by: 16, bz: station.z + 16 },
    );
  }
  return marks;
}

function approachTicks(approaches: readonly LineApproach[], ring: readonly XZ[]) {
  let cx = 0;
  let cz = 0;
  const count = Math.max(1, ring.length - 1);
  for (let index = 0; index < ring.length - 1; index += 1) {
    cx += ring[index][0];
    cz += ring[index][1];
  }
  cx /= count;
  cz /= count;
  const ticks: Seg[] = [];
  const labels: { text: string; x: number; z: number }[] = [];
  const occupied: XZ[] = [];
  for (const approach of approaches) {
    const dx = approach.boundaryX - cx;
    const dz = approach.boundaryZ - cz;
    const span = Math.hypot(dx, dz) || 1;
    const px = -dz / span;
    const pz = dx / span;
    ticks.push({
      ax: approach.boundaryX - px * 8,
      ay: WALK_Y + 1,
      az: approach.boundaryZ - pz * 8,
      bx: approach.boundaryX + px * 8,
      by: WALK_Y + 1,
      bz: approach.boundaryZ + pz * 8,
    });
    if (approach.authority !== "county") continue;
    const labelX = approach.boundaryX + (dx / span) * 28;
    const labelZ = approach.boundaryZ + (dz / span) * 28;
    if (occupied.some(([x, z]) => Math.hypot(x - labelX, z - labelZ) < 70)) continue;
    occupied.push([labelX, labelZ]);
    labels.push({ text: approach.feet < 10 ? `${approach.feet.toFixed(1)} ft` : `${Math.round(approach.feet)} ft`, x: labelX, z: labelZ });
  }
  return { ticks, labels };
}

export function MovementLayer({
  mode,
  roads,
  ring,
  showRoads,
  showWalking,
  showStations,
  probe,
}: {
  mode: PedestrianMode;
  roads: readonly SiteRoad[];
  ring: readonly XZ[];
  showRoads: boolean;
  showWalking: boolean;
  showStations: boolean;
  probe: { placing: boolean; point: { x: number; z: number } | null; onPlace: (x: number, z: number) => void } | null;
}) {
  const groups = useMemo(() => {
    const local: Seg[] = [];
    const causeway: Seg[] = [];
    const expressway: Seg[] = [];
    const ramp: Seg[] = [];
    if (mode === "network" && showRoads) {
      for (const road of roads) {
        if (road.kind === "local") pushRoad(local, road);
        else if (road.kind === "causeway") pushRoad(causeway, road);
        else if (road.kind === "expressway") {
          pushRoad(expressway, road, 3.2);
          pushRoad(expressway, road, -3.2);
        } else {
          const solid: Seg[] = [];
          pushRoad(solid, road);
          for (const segment of solid) ramp.push(...dashed(segment, 16, 10));
        }
      }
    }
    const county: Seg[] = [];
    const mapped: Seg[] = [];
    const crossings: Seg[] = [];
    const named: Seg[] = [];
    const shoreline: Seg[] = [];
    if (mode === "baywalk") {
      for (const link of mappedLinks) {
        if (link.name.toLowerCase() === "baywalk") pushPath(named, link.path, WALK_Y + 1);
        else if (link.name === "MacArthur Causeway Path") {
          const solid: Seg[] = [];
          pushPath(solid, link.path, WALK_Y);
          for (const segment of solid) shoreline.push(...dashed(segment, 18, 12));
        }
      }
    } else if (showWalking || mode === "access") {
      for (const link of countyLinks) pushPath(county, link.path, WALK_Y);
      for (const link of mappedLinks) {
        if (link.kind === "steps") continue;
        const solid: Seg[] = [];
        pushPath(solid, link.path, WALK_Y + 0.3);
        if (link.kind === "crossing") crossings.push(...solid);
        else for (const segment of solid) mapped.push(...dashed(segment, 14, 9));
      }
    }
    const stations = mode === "network" && showStations ? stationMarks() : [];
    const approaches = mode === "access" ? closeApproaches(ring, 15) : [];
    const marks = mode === "access" ? approachTicks(approaches, ring) : { ticks: [], labels: [] };
    let probeLine: Seg[] = [];
    let probeMark: Seg[] = [];
    let probeLabel: { text: string; x: number; z: number } | null = null;
    if (mode === "access" && probe?.point) {
      const hit = nearestWalkLine(probe.point.x, probe.point.z);
      probeMark = [
        { ax: probe.point.x - 10, ay: WALK_Y + 2, az: probe.point.z, bx: probe.point.x + 10, by: WALK_Y + 2, bz: probe.point.z },
        { ax: probe.point.x, ay: WALK_Y + 2, az: probe.point.z - 10, bx: probe.point.x, by: WALK_Y + 2, bz: probe.point.z + 10 },
      ];
      if (hit) {
        const solid = { ax: probe.point.x, ay: WALK_Y + 2, az: probe.point.z, bx: hit.lineX, by: WALK_Y + 2, bz: hit.lineZ };
        probeLine = dashed(solid, 8, 6);
        const dx = hit.lineZ - probe.point.z;
        const dz = probe.point.x - hit.lineX;
        const span = Math.hypot(dx, dz) || 1;
        probeMark.push({
          ax: hit.lineX - (dx / span) * 7,
          ay: WALK_Y + 2,
          az: hit.lineZ - (dz / span) * 7,
          bx: hit.lineX + (dx / span) * 7,
          by: WALK_Y + 2,
          bz: hit.lineZ + (dz / span) * 7,
        });
        probeLabel = {
          text: hit.feet < 10 ? `${hit.feet.toFixed(1)} ft` : `${Math.round(hit.feet)} ft`,
          x: (probe.point.x + hit.lineX) / 2,
          z: (probe.point.z + hit.lineZ) / 2,
        };
      }
    }
    const bounded = mode === "network"
      ? { local: clipSegments(local), causeway: clipSegments(causeway), expressway: clipSegments(expressway), ramp: clipSegments(ramp), county: clipSegments(county), mapped: clipSegments(mapped), crossings: clipSegments(crossings), stations: clipSegments(stations) }
      : { local, causeway, expressway, ramp, county, mapped, crossings, stations };
    return { ...bounded, named, shoreline, ticks: marks.ticks, labels: marks.labels, probeLine, probeMark, probeLabel };
  }, [mode, probe, ring, roads, showRoads, showStations, showWalking]);

  return (
    <>
      <LineSet segments={groups.local} color={WHITE} opacity={0.42} />
      <LineSet segments={groups.causeway} color={COPPER} opacity={0.92} />
      <LineSet segments={groups.expressway} color={COPPER} opacity={0.92} />
      <LineSet segments={groups.ramp} color={COPPER} opacity={0.62} />
      <LineSet segments={groups.county} color={TEAL} opacity={0.95} />
      <LineSet segments={groups.mapped} color={MAPPED} opacity={0.38} />
      <LineSet segments={groups.crossings} color={TEAL} opacity={0.9} />
      <LineSet segments={groups.named} color={TEAL} opacity={1} />
      <LineSet segments={groups.shoreline} color={SHORE} opacity={0.4} />
      <LineSet segments={groups.stations} color={WHITE} opacity={0.85} />
      <LineSet segments={groups.ticks} color={WHITE} opacity={0.95} />
      <LineSet segments={groups.probeLine} color={WHITE} opacity={0.8} />
      <LineSet segments={groups.probeMark} color={WHITE} opacity={1} />
      {groups.labels.map((label) => <FootLabel key={`${label.x.toFixed(1)}:${label.z.toFixed(1)}`} text={label.text} x={label.x} z={label.z} />)}
      {groups.probeLabel ? <FootLabel text={groups.probeLabel.text} x={groups.probeLabel.x} z={groups.probeLabel.z} /> : null}
      {mode === "access" && probe ? <WalkProbe ring={ring} placing={probe.placing} point={probe.point} onPlace={probe.onPlace} /> : null}
    </>
  );
}

function WalkProbe({
  ring,
  placing,
  point,
  onPlace,
}: {
  ring: readonly XZ[];
  placing: boolean;
  point: { x: number; z: number } | null;
  onPlace: (x: number, z: number) => void;
}) {
  const { camera, gl } = useThree();
  const placingRef = useRef(placing);
  const pointRef = useRef(point);
  const onPlaceRef = useRef(onPlace);
  placingRef.current = placing;
  pointRef.current = point;
  onPlaceRef.current = onPlace;
  useEffect(() => {
    const element = gl.domElement;
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const plane = new Plane(new Vector3(0, 1, 0), 0);
    const hit = new Vector3();
    let dragging = false;
    const storedAt = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return null;
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      const stored = { x: hit.x, z: -hit.z };
      if (!pointInRing(stored.x, stored.z, ring)) return null;
      return stored;
    };
    const onMarker = (event: PointerEvent) => {
      const current = pointRef.current;
      if (!current) return false;
      const rect = element.getBoundingClientRect();
      const world = new Vector3(current.x, WALK_Y, -current.z);
      world.project(camera);
      const sx = rect.left + (world.x * 0.5 + 0.5) * rect.width;
      const sy = rect.top + (-world.y * 0.5 + 0.5) * rect.height;
      return Math.hypot(event.clientX - sx, event.clientY - sy) <= 22;
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!placingRef.current && !onMarker(event)) return;
      const stored = storedAt(event);
      if (!stored) return;
      dragging = true;
      onPlaceRef.current(stored.x, stored.z);
    };
    const move = (event: PointerEvent) => {
      if (!dragging || (event.buttons & 1) === 0) return;
      const stored = storedAt(event);
      if (stored) onPlaceRef.current(stored.x, stored.z);
    };
    const up = () => {
      dragging = false;
    };
    if (placing) element.style.cursor = "crosshair";
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      if (placing) element.style.cursor = "";
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [camera, gl, placing, ring]);
  return null;
}

export type { LineHit };
