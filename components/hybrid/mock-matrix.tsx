"use client";

import { useLayoutEffect, useRef } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";
import type { GeneratedHybridField } from "@/lib/skill4/generated-hybrid-field";
import { hybridDisplay, type HybridDisplaySlot } from "@/lib/skill4/hybrid-display";
import { mockHybridField, type MockHybrid } from "@/lib/skill4/mock-hybrids";

const images = new Map<string, string>();
let host: HTMLDivElement | null = null;
let shared: HTMLCanvasElement | null = null;

function centeredMesh(mesh: IsoMesh): IsoMesh {
  const source = mesh.positions;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < source.length; index += 3) {
    minX = Math.min(minX, source[index]);
    minY = Math.min(minY, source[index + 1]);
    minZ = Math.min(minZ, source[index + 2]);
    maxX = Math.max(maxX, source[index]);
    maxY = Math.max(maxY, source[index + 1]);
    maxZ = Math.max(maxZ, source[index + 2]);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const positions = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 3) {
    positions[index] = source[index] - cx;
    positions[index + 1] = source[index + 1] - cy;
    positions[index + 2] = source[index + 2] - cz;
  }
  return { ...mesh, positions };
}

function imageFor(mesh: IsoMesh, key: string, color: [number, number, number]) {
  const storedKey = `${key}:${color.join(",")}`;
  const cached = images.get(storedKey);
  if (cached) return cached;
  if (!host || !shared) {
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;width:176px;height:176px;pointer-events:none";
    shared = document.createElement("canvas");
    host.appendChild(shared);
    document.body.appendChild(host);
  }
  drawPlacedMeshes(shared, [{ id: key, mesh: centeredMesh(mesh), translate: { x: 0, y: 0, z: 0 }, selected: false, color, kind: 0 }], 0.8, 0.35, 1, true, undefined, false, 1.6);
  const url = shared.toDataURL("image/png");
  images.set(storedKey, url);
  return url;
}

function StatusCard({
  slot,
  active,
  onSelect,
  onHover,
  lane = false,
}: {
  slot: HybridDisplaySlot;
  active: boolean;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  lane?: boolean;
}) {
  return (
    <button
      type="button"
      data-mock-id={slot.id}
      data-hybrid-status={slot.source}
      data-active={active || undefined}
      data-lane={lane || undefined}
      onClick={() => onSelect(slot.id)}
      onMouseEnter={() => onHover?.(slot.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <span>{slot.label}</span>
      <span>{slot.id}</span>
    </button>
  );
}

function Thumb({
  mesh,
  cacheKey,
  id,
  active,
  color,
  onSelect,
  onHover,
  lane = false,
}: {
  mesh: IsoMesh;
  cacheKey: string;
  id: string;
  active: boolean;
  color: [number, number, number];
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  lane?: boolean;
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
    <button
      type="button"
      data-mock-id={id}
      data-active={active || undefined}
      data-lane={lane || undefined}
      onClick={() => onSelect(id)}
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <canvas ref={ref} width={176} height={176} />
      <span>{id}</span>
    </button>
  );
}

function laneAt(index: number, emphasis: { row?: number | null; column?: number | null } | null) {
  if (!emphasis) return false;
  const row = Math.floor(index / 5);
  const column = index % 5;
  return emphasis.row === row || emphasis.column === column;
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function HybridMatrixGrid({
  signature,
  selectedId,
  generatedField = null,
  onSelect,
  onHover,
  emphasis = null,
  colorA = [0.78, 0.494, 0.373],
  colorB = [0.49, 0.722, 0.722],
}: {
  signature: string;
  selectedId: string;
  generatedField?: GeneratedHybridField | null;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  emphasis?: { row?: number | null; column?: number | null } | null;
  colorA?: [number, number, number];
  colorB?: [number, number, number];
}) {
  const display = hybridDisplay({ signature, selectedMockId: selectedId, generatedHybridField: generatedField ?? null });
  return (
    <div className="hybrid-matrix-grid">
      {display.slots.map((slot, index) => (
        slot.mesh ? (
          <Thumb
            key={slot.id}
            mesh={slot.mesh}
            cacheKey={`${display.source}:${signature}:${slot.id}:${slot.mesh.triangles}:${slot.mesh.positions.length}`}
            id={slot.id}
            active={slot.id === selectedId}
            color={slot.id === selectedId ? mix(colorA, colorB, (index % 5) / 4) : [1, 1, 1]}
            onSelect={onSelect}
            onHover={onHover}
            lane={laneAt(index, emphasis)}
          />
        ) : (
          <StatusCard key={slot.id} slot={slot} active={slot.id === selectedId} onSelect={onSelect} onHover={onHover} lane={laneAt(index, emphasis)} />
        )
      ))}
    </div>
  );
}

export function MockMatrix({
  signature,
  selectedId,
  generatedField = null,
  onSelect,
  onOpen,
  colorA = [0.78, 0.494, 0.373],
  colorB = [0.49, 0.722, 0.722],
}: {
  signature: string;
  selectedId: string;
  generatedField?: GeneratedHybridField | null;
  onSelect: (id: string) => void;
  onOpen?: () => void;
  colorA?: [number, number, number];
  colorB?: [number, number, number];
}) {
  const display = hybridDisplay({ signature, selectedMockId: selectedId, generatedHybridField: generatedField ?? null });
  return (
    <div
      className="hybrid-matrix"
      data-mock-matrix={signature}
      data-hybrid-source={display.source}
      onClick={() => onOpen?.()}
    >
      <p className="hybrid-mock-banner">{display.banner}</p>
      <HybridMatrixGrid
        signature={signature}
        selectedId={selectedId}
        generatedField={generatedField}
        onSelect={onSelect}
        colorA={colorA}
        colorB={colorB}
      />
    </div>
  );
}

export function selectedMock(signature: string, id: string): MockHybrid {
  const field = mockHybridField(signature);
  return field.candidates.find((candidate) => candidate.id === id) ?? field.candidates[12];
}
