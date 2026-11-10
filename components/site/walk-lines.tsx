"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicMaterial } from "three";
import type { WalkSegment } from "@/lib/skill5/pedestrian";

function ribbonGeometry(segments: readonly WalkSegment[]) {
  const positions: number[] = [];
  const half = 4;
  for (const segment of segments) {
    const dx = segment.bx - segment.ax;
    const dz = segment.bz - segment.az;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    const px = (-dz / length) * half;
    const pz = (dx / length) * half;
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

function WalkGroup({ segments, color, opacity }: { segments: readonly WalkSegment[]; color: string; opacity: number }) {
  const geometry = useMemo(() => ribbonGeometry(segments), [segments]);
  const material = useMemo(() => new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide }), [color, opacity]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (segments.length === 0) return null;
  return <mesh geometry={geometry} material={material} raycast={() => null} renderOrder={6} frustumCulled={false} />;
}

export function WalkLines({ segments }: { segments: readonly WalkSegment[] }) {
  const county = useMemo(() => segments.filter((segment) => segment.tone === "county"), [segments]);
  const mapped = useMemo(() => segments.filter((segment) => segment.tone === "mapped"), [segments]);
  const named = useMemo(() => segments.filter((segment) => segment.tone === "named"), [segments]);
  const gap = useMemo(() => segments.filter((segment) => segment.tone === "gap"), [segments]);
  const station = useMemo(() => segments.filter((segment) => segment.tone === "station"), [segments]);
  return (
    <>
      <WalkGroup segments={county} color="#f4f4f0" opacity={0.95} />
      <WalkGroup segments={named} color="#d0d0d0" opacity={0.92} />
      <WalkGroup segments={mapped} color="#7a7a7a" opacity={0.9} />
      <WalkGroup segments={gap} color="#bdbdbd" opacity={0.85} />
      <WalkGroup segments={station} color="#ffffff" opacity={1} />
    </>
  );
}
