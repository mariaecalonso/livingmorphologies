"use client";

import { useEffect, useMemo } from "react";
import { BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, LineBasicMaterial, MeshBasicMaterial, SRGBColorSpace } from "three";
import type { XZ } from "@/lib/skill5/site-model";
import { WIND_ROSE_FULL_SHARE } from "@/components/site/wind-rose";

export type WindOverlaySector = {
  index: number;
  center: number;
  hours: number;
  meanSpeed: number;
};

function point(degrees: number, radius: number, y: number) {
  const radians = (degrees * Math.PI) / 180;
  return [radius * Math.sin(radians), y, radius * Math.cos(radians)] as const;
}

function speedColor(speed: number, slow: number, fast: number, target: Color) {
  const span = fast - slow;
  const t = span <= 0 ? 1 : Math.min(1, Math.max(0, (speed - slow) / span));
  const lift = 0.1;
  const mix = (from: number, to: number) => {
    const channel = from + (to - from) * t;
    return Math.round(channel + (255 - channel) * lift);
  };
  const red = mix(15, 199);
  const green = mix(115, 126);
  const blue = mix(119, 95);
  return target.setStyle(`rgb(${red}, ${green}, ${blue})`);
}

function wedgeGeometry(sectors: readonly WindOverlaySector[], moving: number, radius: number, slow: number, fast: number) {
  const y = 1.22;
  const inner = radius * (16 / 78);
  const steps = 6;
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new Color();
  for (const sector of sectors) {
    if (sector.hours <= 0 || moving <= 0) continue;
    const share = Math.min(sector.hours / moving, WIND_ROSE_FULL_SHARE) / WIND_ROSE_FULL_SHARE;
    const outer = inner + share * (radius - inner);
    const start = sector.center - 11.25;
    const end = sector.center + 11.25;
    speedColor(sector.meanSpeed, slow, fast, color);
    for (let step = 0; step < steps; step += 1) {
      const a0 = start + ((end - start) * step) / steps;
      const a1 = start + ((end - start) * (step + 1)) / steps;
      const quad = [point(a0, inner, y), point(a0, outer, y), point(a1, outer, y), point(a0, inner, y), point(a1, outer, y), point(a1, inner, y)];
      for (const vertex of quad) {
        positions.push(vertex[0], vertex[1], vertex[2]);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

function ringGeometry(radius: number, y: number) {
  const steps = 96;
  const positions = new Float32Array(steps * 3);
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    positions[index * 3] = Math.sin(angle) * radius;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = Math.cos(angle) * radius;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

function outlineGeometry(center: number, inner: number, outer: number, y: number) {
  const steps = 10;
  const start = center - 11.25;
  const end = center + 11.25;
  const positions: number[] = [];
  for (let step = 0; step <= steps; step += 1) positions.push(...point(start + ((end - start) * step) / steps, outer, y));
  for (let step = steps; step >= 0; step -= 1) positions.push(...point(start + ((end - start) * step) / steps, inner, y));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

function labelTexture(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(255, 255, 255, 0.55)";
    context.font = "300 168px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
  }
  return texture;
}

function labelGeometry(size: number, y: number) {
  const half = size / 2;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    -half, y, half, half, y, half, half, y, -half,
    -half, y, half, half, y, -half, -half, y, -half,
  ], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([
    0, 1, 1, 1, 1, 0,
    0, 1, 1, 0, 0, 0,
  ], 2));
  return geometry;
}

/** Area center of the parcel ring. A vertex average pulls this lot toward its west edge. */
function polygonCenter(ring: readonly XZ[]) {
  let area = 0;
  let x = 0;
  let z = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const cross = ring[previous][0] * ring[index][1] - ring[index][0] * ring[previous][1];
    area += cross;
    x += (ring[previous][0] + ring[index][0]) * cross;
    z += (ring[previous][1] + ring[index][1]) * cross;
  }
  if (Math.abs(area) < 1e-6) return ring[0];
  return [x / (3 * area), z / (3 * area)] as const;
}

function edgeClearance(x: number, z: number, ring: readonly XZ[]) {
  let nearest = Infinity;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, z1] = ring[previous];
    const [x2, z2] = ring[index];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    const distance = Math.abs(dx * (z1 - z) - dz * (x1 - x)) / length;
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

/**
 * Outer ring stays centered on the parcel and runs well past the boundary.
 * 3.44 is 60% larger than the previous site-scale rose (2.15 × the nearest-edge distance).
 */
const SITE_ROSE_SCALE = 3.44;

function roseCenter(ring: readonly XZ[]) {
  const [x, z] = polygonCenter(ring);
  const radius = Math.max(24, edgeClearance(x, z, ring) * SITE_ROSE_SCALE);
  return { x, z, radius };
}

const LABELS = [
  { text: "N", x: 0, z: 1 },
  { text: "E", x: 1, z: 0 },
  { text: "S", x: 0, z: -1 },
  { text: "W", x: -1, z: 0 },
] as const;

export function WindField({
  ring,
  sectors,
  movingHours,
  slow,
  fast,
  prevailingIndex,
}: {
  ring: readonly XZ[];
  sectors: readonly WindOverlaySector[];
  movingHours: number;
  slow: number;
  fast: number;
  prevailingIndex: number | null;
}) {
  const origin = useMemo(() => roseCenter(ring), [ring]);
  const wedges = useMemo(() => wedgeGeometry(sectors, movingHours, origin.radius, slow, fast), [fast, movingHours, origin.radius, sectors, slow]);
  const rings = useMemo(() => [0.15, 0.3].map((share) => {
    const inner = origin.radius * (16 / 78);
    const outer = inner + (share / WIND_ROSE_FULL_SHARE) * (origin.radius - inner);
    return ringGeometry(outer, 1.3);
  }), [origin.radius]);
  const prevailing = sectors.find((sector) => sector.index === prevailingIndex && sector.hours > 0) ?? null;
  const outline = useMemo(() => {
    if (!prevailing || movingHours <= 0) return null;
    const inner = origin.radius * (16 / 78);
    const share = Math.min(prevailing.hours / movingHours, WIND_ROSE_FULL_SHARE) / WIND_ROSE_FULL_SHARE;
    return outlineGeometry(prevailing.center, inner, inner + share * (origin.radius - inner), 1.36);
  }, [movingHours, origin.radius, prevailing]);
  const wedgeMaterial = useMemo(() => new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), []);
  const ringMaterial = useMemo(() => new LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }), []);
  const outlineMaterial = useMemo(() => new LineBasicMaterial({ color: "#f7f7f4", transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }), []);
  const labels = useMemo(() => LABELS.map((label) => {
    const texture = labelTexture(label.text);
    return {
      ...label,
      texture,
      geometry: labelGeometry(origin.radius * 0.1, 1.55),
      material: new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: DoubleSide,
      }),
    };
  }), [origin.radius]);

  useEffect(() => () => {
    wedges.dispose();
    rings.forEach((geometry) => geometry.dispose());
    outline?.dispose();
  }, [outline, rings, wedges]);
  useEffect(() => () => {
    wedgeMaterial.dispose();
    ringMaterial.dispose();
    outlineMaterial.dispose();
    labels.forEach((label) => {
      label.texture.dispose();
      label.geometry.dispose();
      label.material.dispose();
    });
  }, [labels, outlineMaterial, ringMaterial, wedgeMaterial]);

  if (movingHours <= 0) return null;
  const labelReach = origin.radius * 0.9;
  return (
    <group position={[origin.x, 0, origin.z]}>
      <mesh geometry={wedges} material={wedgeMaterial} renderOrder={6} raycast={() => null} />
      {rings.map((geometry) => (
        <lineLoop key={geometry.uuid} geometry={geometry} material={ringMaterial} renderOrder={6} raycast={() => null} />
      ))}
      {outline ? <lineLoop geometry={outline} material={outlineMaterial} renderOrder={6} raycast={() => null} /> : null}
      {labels.map((label) => (
        <mesh
          key={label.text}
          geometry={label.geometry}
          position={[label.x * labelReach, 0, label.z * labelReach]}
          material={label.material}
          renderOrder={8}
          raycast={() => null}
        />
      ))}
    </group>
  );
}
