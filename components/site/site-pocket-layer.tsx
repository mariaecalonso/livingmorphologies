"use client";

import { useEffect, useMemo } from "react";
import { DoubleSide, Shape, ShapeGeometry } from "three";
import type { NetworkPocket } from "@/lib/skill5/pockets";
import type { PocketFit } from "@/lib/skill5/pocket-feasibility";
import type { ZoneKind } from "@/lib/skill5/zoning";
import { ZONE_COLOR } from "./site-zone-layer";

const FIT_COLOR: Record<PocketFit, string> = {
  plausible: "#c77e5f",
  marginal: "#c77e5f",
  unsuitable: "#f2f2ee",
  remainder: "#49d7de",
};

function outlinePositions(points: NetworkPocket["points"], y: number) {
  const positions: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    positions.push(from.x, y, from.z, to.x, y, to.z);
  }
  return new Float32Array(positions);
}

function PocketFill({
  pocket,
  kind,
  fit,
  hovered,
  selected,
  onHover,
  onPick,
  listen,
  opacity,
}: {
  pocket: NetworkPocket;
  kind: ZoneKind | null;
  fit: PocketFit | null;
  hovered: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onPick: (id: string, shift: boolean) => void;
  listen: boolean;
  opacity: number | null;
}) {
  const geometry = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(pocket.points[0].x, pocket.points[0].z);
    for (let index = 1; index < pocket.points.length; index += 1) shape.lineTo(pocket.points[index].x, pocket.points[index].z);
    shape.closePath();
    const next = new ShapeGeometry(shape);
    next.rotateX(Math.PI / 2);
    next.translate(0, 0.42, 0);
    return next;
  }, [pocket.points]);
  const line = useMemo(() => outlinePositions(pocket.points, selected || hovered ? 1.15 : 0.7), [hovered, pocket.points, selected]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const color = kind ? ZONE_COLOR[kind] : FIT_COLOR[fit ?? "unsuitable"];
  const fill = kind
    ? (selected ? 0.42 : hovered ? 0.3 : 0.22)
    : fit === "plausible"
      ? (selected ? 0.55 : hovered ? 0.42 : 0.4)
      : fit === "marginal"
        ? (selected ? 0.2 : 0.1)
        : fit === "remainder"
          ? 0.08
          : 0.03;
  return (
    <group>
      <mesh
        geometry={geometry}
        renderOrder={1}
        onPointerOver={listen ? (event) => {
          event.stopPropagation();
          onHover(pocket.id);
        } : undefined}
        onPointerOut={listen ? () => onHover(null) : undefined}
        onPointerDown={listen ? (event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          onPick(pocket.id, true);
        } : undefined}
      >
        <meshBasicMaterial color={color} transparent opacity={opacity ?? (kind ? (selected ? 0.42 : hovered ? 0.3 : 0.22) : (selected || hovered ? 0.08 : 0))} depthWrite={false} side={DoubleSide} />
      </mesh>
      <lineSegments raycast={() => null} renderOrder={4}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[line, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={selected ? 1 : hovered ? 0.9 : kind ? 0.55 : 0.28} />
      </lineSegments>
    </group>
  );
}

export function SitePocketLayer({
  pockets,
  kinds,
  fits,
  hoverId,
  selectedIds,
  onHover,
  onPick,
  listen = true,
  opacity = null,
}: {
  pockets: readonly NetworkPocket[];
  kinds: Readonly<Record<string, ZoneKind | null>>;
  fits?: Readonly<Record<string, PocketFit>>;
  hoverId: string | null;
  selectedIds: readonly string[];
  onHover: (id: string | null) => void;
  onPick: (id: string, shift: boolean) => void;
  listen?: boolean;
  opacity?: number | null;
}) {
  return (
    <group>
      {pockets.map((pocket) => (
        <PocketFill
          key={pocket.id}
          pocket={pocket}
          kind={kinds[pocket.id] ?? null}
          fit={fits?.[pocket.id] ?? null}
          hovered={pocket.id === hoverId}
          selected={selectedIds.includes(pocket.id)}
          onHover={onHover}
          onPick={onPick}
          listen={listen}
          opacity={opacity}
        />
      ))}
    </group>
  );
}
