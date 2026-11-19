"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { LineSegments } from "three";
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, LineBasicMaterial, LineDashedMaterial, MeshBasicMaterial, SpriteMaterial, SRGBColorSpace, Vector3, type Camera } from "three";
import type { Isovist } from "@/lib/skill5/isovist";
import type { XZ } from "@/lib/skill5/site-model";
import type { ViewPhoto } from "@/lib/skill5/view-imagery";
import type { NoiseReading, NoiseSource, ViewReading } from "@/lib/skill5/views-noise";

/** Flat drawing height. The sightline test itself stays at the reading's eye height. */
const GROUND = 2.6;
const OPEN = "#14999e";
const BLOCKED = "#c77e5f";

export type ViewOverlay = {
  mode: "views" | "proximity";
  view: ViewReading | null;
  noise: NoiseReading | null;
  isovist: Isovist | null;
  photos?: Record<string, ViewPhoto | null>;
  onOpen?: (id: string) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
};

type Segment = { ax: number; az: number; bx: number; bz: number };

function lineGeometry(segments: readonly Segment[], y: number) {
  const positions: number[] = [];
  for (const segment of segments) positions.push(segment.ax, y, segment.az, segment.bx, y, segment.bz);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

function ribbonGeometry(segments: readonly Segment[], y: number, half: number) {
  const positions: number[] = [];
  for (const segment of segments) {
    const dx = segment.bx - segment.ax;
    const dz = segment.bz - segment.az;
    const length = Math.hypot(dx, dz);
    const px = length < 0.01 ? half : (-dz / length) * half;
    const pz = length < 0.01 ? 0 : (dx / length) * half;
    positions.push(
      segment.ax + px, y, segment.az + pz,
      segment.bx + px, y, segment.bz + pz,
      segment.bx - px, y, segment.bz - pz,
      segment.ax + px, y, segment.az + pz,
      segment.bx - px, y, segment.bz - pz,
      segment.ax - px, y, segment.az - pz,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

function strokeMaterial(color: string, opacity = 1) {
  return new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
}

function fillMaterial(color: string, opacity: number) {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: DoubleSide });
}

function labelTexture(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "500 72px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 10;
    context.strokeStyle = "rgba(0, 0, 0, 0.72)";
    context.strokeText(text, canvas.width / 2, canvas.height / 2);
    context.fillStyle = "rgba(255, 255, 255, 0.92)";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
  }
  return texture;
}

function roadSegments(noise: NoiseReading) {
  const roads: { source: NoiseSource; segment: Segment }[] = [];
  for (const source of [noise.macarthur, noise.expressway, noise.local]) {
    if (source.feet === null || source.x === null || source.z === null) continue;
    roads.push({
      source,
      segment: { ax: noise.point.x, az: noise.point.z, bx: source.x, bz: source.z },
    });
  }
  return roads;
}

function labelAnchor(segment: Segment, amount: number) {
  const dx = segment.bx - segment.ax;
  const dz = segment.bz - segment.az;
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: (segment.ax + segment.bx) / 2 + (-dz / length) * amount,
    z: (segment.az + segment.bz) / 2 + (dx / length) * amount,
  };
}

function Stroke({ segments, color, opacity = 1 }: { segments: readonly Segment[]; color: string; opacity?: number }) {
  const geometry = useMemo(() => lineGeometry(segments, GROUND), [segments]);
  const material = useMemo(() => strokeMaterial(color, opacity), [color, opacity]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (segments.length === 0) return null;
  return <lineSegments geometry={geometry} material={material} raycast={() => null} renderOrder={7} frustumCulled={false} />;
}

function Ribbon({ segments, color, opacity, half, lift = 0 }: { segments: readonly Segment[]; color: string; opacity: number; half: number; lift?: number }) {
  const geometry = useMemo(() => ribbonGeometry(segments, GROUND + lift, half), [half, lift, segments]);
  const material = useMemo(() => fillMaterial(color, opacity), [color, opacity]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (segments.length === 0) return null;
  return <mesh geometry={geometry} material={material} raycast={() => null} renderOrder={6} frustumCulled={false} />;
}

function DashedRoad({ segment }: { segment: Segment }) {
  const ref = useRef<LineSegments>(null);
  const geometry = useMemo(() => {
    const next = lineGeometry([segment], GROUND);
    const length = Math.hypot(segment.bx - segment.ax, segment.bz - segment.az);
    next.setAttribute("lineDistance", new BufferAttribute(new Float32Array([0, length]), 1));
    return next;
  }, [segment]);
  const material = useMemo(() => new LineDashedMaterial({ color: "#f4f1ea", dashSize: 8, gapSize: 5, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }), []);
  useLayoutEffect(() => {
    ref.current?.computeLineDistances();
  }, [geometry]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  return <lineSegments ref={ref} geometry={geometry} material={material} raycast={() => null} renderOrder={7} frustumCulled={false} />;
}

function Tag({ text, x, y, z, scale = 1 }: { text: string; x: number; y: number; z: number; scale?: number }) {
  const texture = useMemo(() => labelTexture(text), [text]);
  const material = useMemo(() => new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }), [texture]);
  useEffect(() => () => {
    texture.dispose();
    material.dispose();
  }, [material, texture]);
  const width = Math.min(168, Math.max(36, text.length * 3.15)) * scale;
  return <sprite position={[x, y, z]} scale={[width, 11 * scale, 1]} material={material} renderOrder={9} raycast={() => null} />;
}

function PointMark({ x, z, eye }: { x: number; z: number; eye: number | null }) {
  const tick = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([x, GROUND, z, x, eye ?? GROUND, z]), 3));
    return geometry;
  }, [eye, x, z]);
  const material = useMemo(() => strokeMaterial("#f4f1ea", 0.9), []);
  useEffect(() => () => {
    tick.dispose();
    material.dispose();
  }, [material, tick]);
  return (
    <group>
      <mesh position={[x, GROUND, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={8}>
        <ringGeometry args={[3.4, 4.5, 48]} />
        <meshBasicMaterial color="#f4f1ea" transparent opacity={0.92} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      {eye !== null ? (
        <mesh position={[x, GROUND + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={8}>
          <ringGeometry args={[5.8, 6.15, 64]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.96} depthWrite={false} depthTest={false} toneMapped={false} side={DoubleSide} />
        </mesh>
      ) : null}
      {eye !== null ? <lineSegments geometry={tick} material={material} raycast={() => null} renderOrder={8} frustumCulled={false} /> : null}
      {eye !== null ? <Tag text={`${eye.toFixed(1)} ft eye`} x={x} y={eye + 7} z={z} /> : null}
    </group>
  );
}

function dashedSegments(segments: readonly Segment[], dash: number, gap: number): Segment[] {
  const drawn: Segment[] = [];
  const period = dash + gap;
  let along = 0;
  for (const segment of segments) {
    const dx = segment.bx - segment.ax;
    const dz = segment.bz - segment.az;
    const length = Math.hypot(dx, dz);
    if (length < 0.5) continue;
    const ux = dx / length;
    const uz = dz / length;
    let traveled = 0;
    while (traveled < length - 0.01) {
      const phase = (along + traveled) % period;
      const remain = phase < dash ? dash - phase : period - phase;
      const step = Math.min(length - traveled, remain);
      if (phase < dash) {
        drawn.push({
          ax: segment.ax + ux * traveled,
          az: segment.az + uz * traveled,
          bx: segment.ax + ux * (traveled + step),
          bz: segment.az + uz * (traveled + step),
        });
      }
      traveled += step;
    }
    along += length;
  }
  return drawn;
}

function boundaryOf(samples: Isovist["samples"]) {
  const obstacle: Segment[] = [];
  const windowEdge: Segment[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const next = samples[(index + 1) % samples.length];
    const segment = { ax: current.x, az: current.z, bx: next.x, bz: next.z };
    if (current.kind === "obstacle" || next.kind === "obstacle") obstacle.push(segment);
    else windowEdge.push(segment);
  }
  return { obstacle, windowEdge: dashedSegments(windowEdge, 28, 16) };
}

function IsovistField({ isovist }: { isovist: Isovist }) {
  const edges = useMemo(() => boundaryOf(isovist.samples), [isovist]);
  const fill = useMemo(() => {
    const positions: number[] = [];
    const { origin, samples } = isovist;
    const y = GROUND + 0.15;
    for (let index = 0; index < samples.length; index += 1) {
      const next = samples[(index + 1) % samples.length];
      positions.push(origin.x, y, origin.z, samples[index].x, y, samples[index].z, next.x, y, next.z);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    return geometry;
  }, [isovist]);
  const fillMaterial = useMemo(() => fillMaterialColor(OPEN, 0.16), []);
  useEffect(() => () => {
    fill.dispose();
    fillMaterial.dispose();
  }, [fill, fillMaterial]);
  if (isovist.samples.length < 3) return null;
  return (
    <group>
      <mesh geometry={fill} material={fillMaterial} raycast={() => null} renderOrder={4} frustumCulled={false} />
      <Ribbon segments={edges.obstacle} color="#d7f4f4" opacity={0.92} half={7} lift={0.32} />
      <Ribbon segments={edges.windowEdge} color="#8fd4d6" opacity={0.38} half={3.2} lift={0.26} />
    </group>
  );
}

function fillMaterialColor(color: string, opacity: number) {
  return fillMaterial(color, opacity);
}

export function SightLines({ overlay }: { overlay: ViewOverlay }) {
  const drawn = useMemo(() => {
    const roads = overlay.mode === "proximity" && overlay.noise ? roadSegments(overlay.noise) : [];
    return {
      roads,
      macarthur: roads.filter((road) => road.source.id === "macarthur").map((road) => road.segment),
      expressway: roads.filter((road) => road.source.id === "expressway").map((road) => road.segment),
      local: roads.filter((road) => road.source.id === "local"),
    };
  }, [overlay]);
  const { roads, macarthur, expressway, local } = drawn;
  const point = overlay.isovist?.origin ?? overlay.view?.point ?? null;
  if (!point) return null;
  return (
    <group>
      <PointMark x={point.x} z={point.z} eye={overlay.mode === "views" ? overlay.isovist?.eyeHeight ?? null : null} />
      {overlay.mode === "views" && overlay.isovist ? <IsovistField isovist={overlay.isovist} /> : null}
      <Ribbon segments={macarthur} color={OPEN} opacity={0.9} half={1.35} />
      <Ribbon segments={expressway} color={BLOCKED} opacity={0.82} half={1.2} />
      <Stroke segments={macarthur} color={OPEN} />
      <Stroke segments={expressway} color={BLOCKED} />
      {local.map((road) => <DashedRoad key={road.source.id} segment={road.segment} />)}
      {roads.map((road) => {
        const amount = road.source.id === "macarthur" ? 24 : road.source.id === "expressway" ? -24 : 42;
        const anchor = labelAnchor(road.segment, amount);
        const name = road.source.name ?? road.source.label;
        const feet = road.source.feet === null ? "" : `${Math.round(road.source.feet).toLocaleString("en-US")} ft`;
        return <Tag key={road.source.id} text={`${name}  ${feet}`} x={anchor.x} y={8} z={anchor.z} />;
      })}
    </group>
  );
}

function projectStored(vector: Vector3, camera: Camera, x: number, y: number, z: number, width: number, height: number) {
  vector.set(x, y, -z);
  const east = vector.x;
  const up = vector.y;
  const north = vector.z;
  vector.applyMatrix4(camera.matrixWorldInverse);
  const inFront = vector.z < -0.5;
  vector.set(east, up, north);
  vector.project(camera);
  return {
    x: (vector.x * 0.5 + 0.5) * width,
    y: (-vector.y * 0.5 + 0.5) * height,
    inFront,
  };
}

function markerOnScreen(point: { x: number; y: number; inFront: boolean }, width: number, height: number, insets: { left: number; right: number; bottom: number }) {
  return point.inFront
    && point.x >= insets.left + 8
    && point.x <= width - insets.right - 8
    && point.y >= 8
    && point.y <= height - 8;
}

function frameInsets(canvas: HTMLCanvasElement) {
  const frame = canvas.getBoundingClientRect();
  const view = canvas.closest(".site-view");
  const left = view?.querySelector(".site-analysis-context")?.getBoundingClientRect();
  const right = view?.querySelector(".site-analysis-column")?.getBoundingClientRect();
  const bars = [".site-orient", ".site-frame-views"].map((selector) => view?.querySelector(selector)?.getBoundingClientRect());
  let bottom = 0;
  for (const bar of bars) {
    if (!bar || bar.height < 2) continue;
    bottom = Math.max(bottom, frame.bottom - bar.top);
  }
  return {
    left: left ? Math.max(0, left.right - frame.left) : 0,
    right: right ? Math.max(0, frame.right - right.left) : 0,
    bottom,
  };
}

/** CSS pixels inside the lab, divided into the size they occupy on the presentation frame. */
function frameScale() {
  const frame = window.frameElement;
  if (!frame || window.parent === window) return 1;
  const shown = frame.getBoundingClientRect().width;
  const laid = window.innerWidth;
  if (shown < 8 || laid < 8) return 1;
  return shown / laid;
}

/** Plain numbers at the calculated highlight targets. Offscreen targets stay unmarked. */
export function ViewCalloutProjector({ overlay, root }: { overlay: ViewOverlay; root: RefObject<HTMLDivElement | null>; ring: readonly XZ[] }) {
  const { camera, gl } = useThree();
  const vector = useMemo(() => new Vector3(), []);
  useEffect(() => {
    return () => {
      const host = root.current;
      if (!host) return;
      host.replaceChildren();
      delete host.dataset.signature;
      delete host.dataset.active;
    };
  }, [root]);
  useFrame(() => {
    const host = root.current;
    if (!host || overlay.mode !== "views" || !overlay.isovist) {
      if (host?.childElementCount) {
        host.replaceChildren();
        delete host.dataset.signature;
      }
      return;
    }
    const width = gl.domElement.clientWidth;
    const height = gl.domElement.clientHeight;
    if (width < 2 || height < 2) return;
    const insets = frameInsets(gl.domElement);
    const callouts = overlay.isovist.highlights;
    const signature = callouts.map((item) => item.id).join("|");
    const scale = frameScale();
    host.style.setProperty("--marker-size", `${20 / scale}px`);
    host.style.setProperty("--marker-font", `${11 / scale}px`);
    host.style.setProperty("--marker-border", `${1 / scale}px`);
    if (host.dataset.signature !== signature) {
      host.dataset.signature = signature;
      host.replaceChildren();
      callouts.forEach((callout, index) => {
        const mark = document.createElement("button");
        mark.type = "button";
        mark.className = "site-view-index";
        mark.dataset.id = callout.id;
        mark.textContent = String(index + 1);
        mark.setAttribute("aria-label", `Highlight ${index + 1}, ${callout.title}`);
        mark.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          overlay.onSelect?.(callout.id);
        });
        host.append(mark);
      });
    }
    const selected = overlay.selectedId ?? "";
    callouts.forEach((callout) => {
      const mark = host.querySelector<HTMLElement>(`.site-view-index[data-id="${CSS.escape(callout.id)}"]`);
      if (!mark) return;
      if (selected === callout.id) mark.dataset.on = "";
      else delete mark.dataset.on;
      const end = projectStored(vector, camera, callout.x, GROUND + 0.5, callout.z, width, height);
      if (!markerOnScreen(end, width, height, insets)) {
        mark.style.display = "none";
        return;
      }
      mark.style.display = "";
      mark.style.left = `${end.x}px`;
      mark.style.top = `${end.y}px`;
    });
  });
  return null;
}
