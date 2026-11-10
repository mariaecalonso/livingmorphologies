"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicMaterial } from "three";
import type { UrbanTone, UseSegment } from "@/lib/skill5/urban";

const TONE: Record<UrbanTone, { color: string; opacity: number; y: number; half: number }> = {
  residential: { color: "#c8c8c8", opacity: 0.9, y: 2.2, half: 3 },
  commercial: { color: "#848484", opacity: 0.9, y: 2.25, half: 3 },
  office: { color: "#e4e4e0", opacity: 0.95, y: 2.3, half: 3 },
  cultural: { color: "#686868", opacity: 0.95, y: 2.35, half: 3 },
  hospitality: { color: "#a3a3a3", opacity: 0.92, y: 2.3, half: 3 },
  public: { color: "#ffffff", opacity: 1, y: 2.45, half: 3.5 },
  mixed: { color: "#909090", opacity: 0.85, y: 2.2, half: 3 },
  other: { color: "#4e4e4e", opacity: 0.75, y: 2.1, half: 2.5 },
  leader: { color: "#f4f4f0", opacity: 0.95, y: 3.2, half: 4 },
  marker: { color: "#ffffff", opacity: 1, y: 3.6, half: 3.5 },
};

function ribbonGeometry(segments: readonly UseSegment[], y: number, half: number) {
  const positions: number[] = [];
  for (const segment of segments) {
    const dx = segment.bx - segment.ax;
    const dz = segment.bz - segment.az;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
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

function UseGroup({ segments, tone }: { segments: readonly UseSegment[]; tone: UrbanTone }) {
  const style = TONE[tone];
  const geometry = useMemo(() => ribbonGeometry(segments, style.y, style.half), [segments, style.y, style.half]);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false, side: DoubleSide }),
    [style.color, style.opacity],
  );
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (segments.length === 0) return null;
  return <mesh geometry={geometry} material={material} raycast={() => null} renderOrder={6} frustumCulled={false} />;
}

export function UseLines({ segments }: { segments: readonly UseSegment[] }) {
  const tones = (Object.keys(TONE) as UrbanTone[]).map((tone) => ({
    tone,
    segments: segments.filter((segment) => segment.tone === tone),
  }));
  return (
    <group>
      {tones.map((entry) => <UseGroup key={entry.tone} tone={entry.tone} segments={entry.segments} />)}
    </group>
  );
}
