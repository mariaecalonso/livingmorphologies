"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicMaterial } from "three";
import type { SightSegment } from "@/lib/skill5/views-noise";

function ribbonGeometry(segments: readonly SightSegment[]) {
  const positions: number[] = [];
  const half = 4;
  for (const segment of segments) {
    const dx = segment.bx - segment.ax;
    const dz = segment.bz - segment.az;
    const length = Math.hypot(dx, dz);
    const px = length < 0.01 ? half : (-dz / length) * half;
    const pz = length < 0.01 ? 0 : (dx / length) * half;
    positions.push(
      segment.ax + px, segment.ay, segment.az + pz,
      segment.bx + px, segment.by, segment.bz + pz,
      segment.bx - px, segment.by, segment.bz - pz,
      segment.ax + px, segment.ay, segment.az + pz,
      segment.bx - px, segment.by, segment.bz - pz,
      segment.ax - px, segment.ay, segment.az - pz,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

function SightGroup({ segments, color, opacity }: { segments: readonly SightSegment[]; color: string; opacity: number }) {
  const geometry = useMemo(() => ribbonGeometry(segments), [segments]);
  const material = useMemo(() => new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide }), [color, opacity]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (segments.length === 0) return null;
  return <mesh geometry={geometry} material={material} raycast={() => null} renderOrder={6} frustumCulled={false} />;
}

export function SightLines({ segments }: { segments: readonly SightSegment[] }) {
  const open = useMemo(() => segments.filter((segment) => segment.open), [segments]);
  const blocked = useMemo(() => segments.filter((segment) => !segment.open), [segments]);
  return (
    <>
      <SightGroup segments={open} color="#f4f4f0" opacity={0.95} />
      <SightGroup segments={blocked} color="#5c5c5c" opacity={0.8} />
    </>
  );
}
