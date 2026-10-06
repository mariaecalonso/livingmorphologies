"use client";

import { useLayoutEffect, useRef } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";
import { MOCK_HYBRID_LABEL, mockHybridField, type MockHybrid } from "@/lib/skill4/mock-hybrids";

const images = new Map<string, string>();
let host: HTMLDivElement | null = null;
let shared: HTMLCanvasElement | null = null;

function imageFor(mesh: IsoMesh, key: string, color: [number, number, number]) {
  const cached = images.get(key);
  if (cached) return cached;
  if (!host || !shared) {
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;width:120px;height:120px;pointer-events:none";
    shared = document.createElement("canvas");
    host.appendChild(shared);
    document.body.appendChild(host);
  }
  drawPlacedMeshes(shared, [{ id: key, mesh, translate: { x: 0, y: 0, z: 0 }, selected: false, color, kind: 1 }], 0.8, 0.35, 1);
  const url = shared.toDataURL("image/png");
  images.set(key, url);
  return url;
}

function Thumb({
  mesh,
  cacheKey,
  id,
  active,
  color,
  onSelect,
}: {
  mesh: IsoMesh;
  cacheKey: string;
  id: string;
  active: boolean;
  color: [number, number, number];
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = imageFor(mesh, cacheKey, color);
  }, [cacheKey, color, mesh]);
  return (
    <button type="button" data-mock-id={id} data-active={active || undefined} onClick={() => onSelect(id)}>
      <canvas ref={ref} width={96} height={96} />
      <span>{id}</span>
    </button>
  );
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function MockMatrix({
  signature,
  selectedId,
  onSelect,
  colorA = [0.78, 0.494, 0.373],
  colorB = [0.49, 0.722, 0.722],
}: {
  signature: string;
  selectedId: string;
  onSelect: (id: string) => void;
  colorA?: [number, number, number];
  colorB?: [number, number, number];
}) {
  const field = mockHybridField(signature);
  return (
    <div className="hybrid-matrix" data-mock-matrix={signature}>
      <p className="hybrid-mock-banner">{MOCK_HYBRID_LABEL}</p>
      <div className="hybrid-matrix-grid">
        {field.candidates.map((candidate) => (
          <Thumb
            key={candidate.id}
            mesh={candidate.mesh}
            cacheKey={`${field.version}:${signature}:${candidate.id}:${candidate.column}`}
            id={candidate.id}
            active={candidate.id === selectedId}
            color={mix(colorA, colorB, candidate.column / 4)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export function selectedMock(signature: string, id: string): MockHybrid {
  const field = mockHybridField(signature);
  return field.candidates.find((candidate) => candidate.id === id) ?? field.candidates[12];
}
