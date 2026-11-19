"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { CanvasTexture, DoubleSide, LinearFilter, MeshBasicMaterial, Plane, Raycaster, SRGBColorSpace, Vector2, Vector3, BufferAttribute, BufferGeometry, LineBasicMaterial, SpriteMaterial } from "three";
import { pointInRing } from "@/lib/skill5/placement";
import { centerlineTick, contourSegments, type RoadDistanceField } from "@/lib/skill5/road-distance-field";
import type { SiteRoad, XZ } from "@/lib/skill5/site-model";
import { flatGeometry } from "./site-geometry";
import type { NoiseReading, NoiseSource, NoiseSourceId } from "@/lib/skill5/views-noise";

const FIELD_Y = 0.94;
const LINE_Y = 3.2;
const ACTIVE = "#14999e";
const QUIET = "#d7d3cc";

type Segment = { ax: number; az: number; bx: number; bz: number };

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function fieldTexture(field: RoadDistanceField) {
  const canvas = document.createElement("canvas");
  canvas.width = field.columns;
  canvas.height = field.rows;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  if (!context) return texture;
  const image = context.createImageData(field.columns, field.rows);
  const span = Math.max(1, field.maximum - field.minimum);
  const paint = (index: number, feet: number) => {
    const near = 1 - Math.min(1, Math.max(0, (feet - field.minimum) / span));
    const red = mix(16, 199, near);
    const green = mix(22, 126, near);
    const blue = mix(24, 95, near);
    const alpha = mix(118, 186, near);
    const pixel = index * 4;
    image.data[pixel] = red;
    image.data[pixel + 1] = green;
    image.data[pixel + 2] = blue;
    image.data[pixel + 3] = alpha;
  };
  const finite: number[] = [];
  for (let index = 0; index < field.samples.length; index += 1) {
    if (Number.isFinite(field.samples[index])) finite.push(index);
  }
  for (let iz = 0; iz < field.rows; iz += 1) {
    for (let ix = 0; ix < field.columns; ix += 1) {
      const index = iz * field.columns + ix;
      let feet = field.samples[index];
      if (!Number.isFinite(feet)) {
        let best = Infinity;
        let chosen = field.median;
        for (const other of finite) {
          const ox = other % field.columns;
          const oz = Math.floor(other / field.columns);
          const distance = (ox - ix) * (ox - ix) + (oz - iz) * (oz - iz);
          if (distance < best) {
            best = distance;
            chosen = field.samples[other];
          }
        }
        feet = chosen;
      }
      const canvasRow = field.rows - 1 - iz;
      paint(canvasRow * field.columns + ix, feet);
    }
  }
  context.putImageData(image, 0, 0);
  texture.needsUpdate = true;
  return texture;
}

function fieldGeometry(ring: readonly XZ[], field: RoadDistanceField) {
  const geometry = flatGeometry(ring, FIELD_Y);
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  const spanX = field.columns * field.spacingFeet;
  const spanZ = field.rows * field.spacingFeet;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    uv[index * 2] = (x - field.originX) / spanX;
    uv[index * 2 + 1] = (z - field.originZ) / spanZ;
  }
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  return geometry;
}

function lineGeometry(segments: readonly Segment[], y: number) {
  const positions: number[] = [];
  const distances: number[] = [];
  for (const segment of segments) {
    const length = Math.hypot(segment.bx - segment.ax, segment.bz - segment.az);
    positions.push(segment.ax, y, segment.az, segment.bx, y, segment.bz);
    distances.push(0, length);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("lineDistance", new BufferAttribute(new Float32Array(distances), 1));
  return geometry;
}

function ribbonGeometry(segments: readonly Segment[], y: number, half: number) {
  const positions: number[] = [];
  for (const segment of segments) {
    const dx = segment.bx - segment.ax;
    const dz = segment.bz - segment.az;
    const length = Math.hypot(dx, dz) || 1;
    const px = (-dz / length) * half;
    const pz = (dx / length) * half;
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

function dashed(segment: Segment, dash: number, gap: number): Segment[] {
  const dx = segment.bx - segment.ax;
  const dz = segment.bz - segment.az;
  const length = Math.hypot(dx, dz);
  if (length < 1) return [];
  const pieces: Segment[] = [];
  const period = dash + gap;
  for (let start = 0; start < length; start += period) {
    const end = Math.min(length, start + dash);
    pieces.push({
      ax: segment.ax + (dx / length) * start,
      az: segment.az + (dz / length) * start,
      bx: segment.ax + (dx / length) * end,
      bz: segment.az + (dz / length) * end,
    });
  }
  return pieces;
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
    context.font = "500 54px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 8;
    context.strokeStyle = "rgba(0, 0, 0, 0.7)";
    context.strokeText(text, canvas.width / 2, canvas.height / 2);
    context.fillStyle = "rgba(244, 241, 234, 0.9)";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
  }
  return texture;
}

function sourceOf(noise: NoiseReading, id: NoiseSourceId): NoiseSource {
  if (id === "macarthur") return noise.macarthur;
  if (id === "expressway") return noise.expressway;
  return noise.local;
}

function Foot({ text, x, z }: { text: string; x: number; z: number }) {
  const texture = useMemo(() => labelTexture(text), [text]);
  const material = useMemo(() => new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }), [texture]);
  useEffect(() => () => {
    texture.dispose();
    material.dispose();
  }, [material, texture]);
  return <sprite position={[x, LINE_Y + 6, z]} scale={[42, 16, 1]} material={material} renderOrder={9} raycast={() => null} />;
}

export type RoadProximityView = {
  ring: readonly XZ[];
  roads: readonly SiteRoad[];
  field: RoadDistanceField;
  noise: NoiseReading;
  active: NoiseSourceId;
  placing: boolean;
  onPlace: (x: number, z: number) => void;
};

export function RoadProximityLayer({
  ring,
  roads,
  field,
  noise,
  active,
  placing,
  onPlace,
}: RoadProximityView) {
  const { camera, gl } = useThree();
  const placingRef = useRef(placing);
  const onPlaceRef = useRef(onPlace);
  const pointRef = useRef(noise.point);
  placingRef.current = placing;
  onPlaceRef.current = onPlace;
  pointRef.current = noise.point;
  const geometry = useMemo(() => fieldGeometry(ring, field), [field, ring]);
  const texture = useMemo(() => fieldTexture(field), [field]);
  const material = useMemo(() => new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
  }), [texture]);
  useEffect(() => () => {
    geometry.dispose();
    texture.dispose();
    material.dispose();
  }, [geometry, material, texture]);

  const contours = useMemo(() => contourSegments(field), [field]);
  const contourGeometry = useMemo(() => lineGeometry(contours, LINE_Y - 1.4), [contours]);
  const contourMaterial = useMemo(() => new LineBasicMaterial({ color: "#efeae4", transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => {
    contourGeometry.dispose();
    contourMaterial.dispose();
  }, [contourGeometry, contourMaterial]);
  const contourLabels = useMemo(() => {
    const labels: { feet: number; x: number; z: number }[] = [];
    const seen = new Set<number>();
    for (const segment of contours) {
      if (seen.has(segment.feet)) continue;
      const x = (segment.ax + segment.bx) / 2;
      const z = (segment.az + segment.bz) / 2;
      if (!pointInRing(x, z, ring)) continue;
      seen.add(segment.feet);
      labels.push({ feet: segment.feet, x, z });
    }
    return labels;
  }, [contours, ring]);

  const connectors = useMemo(() => {
    const point = noise.point;
    return (["macarthur", "expressway", "local"] as const).flatMap((id) => {
      const source = sourceOf(noise, id);
      if (source.x === null || source.z === null) return [];
      return [{
        id,
        source,
        segment: { ax: point.x, az: point.z, bx: source.x, bz: source.z },
        tick: centerlineTick(roads, id, source.x, source.z),
      }];
    });
  }, [noise, roads]);
  const activeRibbon = useMemo(() => ribbonGeometry(connectors.filter((item) => item.id === active).map((item) => item.segment), LINE_Y, 4.5), [active, connectors]);
  const quietSegments = useMemo(() => connectors.filter((item) => item.id !== active).flatMap((item) => dashed(item.segment, 10, 7)), [active, connectors]);
  const quietGeometry = useMemo(() => lineGeometry(quietSegments, LINE_Y), [quietSegments]);
  const tickGeometry = useMemo(() => lineGeometry(connectors.flatMap((item) => item.tick ? [item.tick] : []), LINE_Y + 0.15), [connectors]);
  const activeMaterial = useMemo(() => new MeshBasicMaterial({ color: ACTIVE, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, toneMapped: false, side: DoubleSide }), []);
  const quietMaterial = useMemo(() => new LineBasicMaterial({ color: QUIET, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false, toneMapped: false }), []);
  const tickMaterial = useMemo(() => new LineBasicMaterial({ color: "#f4f1ea", transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, toneMapped: false }), []);
  useEffect(() => () => {
    activeRibbon.dispose();
    quietGeometry.dispose();
    tickGeometry.dispose();
    activeMaterial.dispose();
    quietMaterial.dispose();
    tickMaterial.dispose();
  }, [activeMaterial, activeRibbon, quietGeometry, quietMaterial, tickGeometry, tickMaterial]);

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
      const rect = element.getBoundingClientRect();
      const current = pointRef.current;
      const world = new Vector3(current.x, LINE_Y, -current.z);
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
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [camera, gl, ring]);
  useEffect(() => {
    const element = gl.domElement;
    element.style.cursor = placing ? "crosshair" : "";
    return () => {
      element.style.cursor = "";
    };
  }, [gl, placing]);

  const point = noise.point;
  return (
    <group>
      <mesh geometry={geometry} material={material} renderOrder={2} raycast={() => null} frustumCulled={false} />
      {contours.length > 0 ? <lineSegments geometry={contourGeometry} material={contourMaterial} renderOrder={5} raycast={() => null} frustumCulled={false} /> : null}
      {contourLabels.map((label) => <Foot key={label.feet} text={`${label.feet}`} x={label.x} z={label.z} />)}
      <mesh geometry={activeRibbon} material={activeMaterial} renderOrder={6} raycast={() => null} frustumCulled={false} />
      <lineSegments geometry={quietGeometry} material={quietMaterial} renderOrder={6} raycast={() => null} frustumCulled={false} />
      <lineSegments geometry={tickGeometry} material={tickMaterial} renderOrder={7} raycast={() => null} frustumCulled={false} />
      {connectors.map((item) => (
        <Foot key={`${item.id}-feet`} text={`${Math.round(item.source.feet ?? 0)} ft`} x={(item.segment.ax + item.segment.bx) / 2} z={(item.segment.az + item.segment.bz) / 2} />
      ))}
      {connectors.map((item) => (
        <mesh key={item.id} position={[item.segment.bx, LINE_Y + 0.2, item.segment.bz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={8} raycast={() => null}>
          <ringGeometry args={item.id === active ? [7, 10, 32] : [5, 7, 24]} />
          <meshBasicMaterial color={item.id === active ? ACTIVE : QUIET} transparent opacity={item.id === active ? 0.95 : 0.75} depthWrite={false} depthTest={false} toneMapped={false} side={DoubleSide} />
        </mesh>
      ))}
      <mesh position={[point.x, LINE_Y + 0.35, point.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={9} raycast={() => null}>
        <ringGeometry args={[11, 14.5, 40]} />
        <meshBasicMaterial color="#f4f1ea" transparent opacity={0.95} depthWrite={false} depthTest={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      <mesh position={[point.x, LINE_Y + 0.4, point.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={9} raycast={() => null}>
        <circleGeometry args={[4.2, 20]} />
        <meshBasicMaterial color={ACTIVE} transparent opacity={0.95} depthWrite={false} depthTest={false} toneMapped={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}
