"use client";

import { useEffect, useMemo } from "react";
import { DoubleSide, Shape, ShapeGeometry } from "three";
import type { NetworkPocket } from "@/lib/skill5/pockets";
import type { PocketFit } from "@/lib/skill5/pocket-feasibility";
import type { ZoneKind } from "@/lib/skill5/zoning";
import { ZONE_COLOR } from "./site-zone-layer";

const FIT_COLOR: Record<PocketFit, string> = {
  plausible: ZONE_COLOR.lobby,
  marginal: ZONE_COLOR.lobby,
  unsuitable: ZONE_COLOR.workspace,
  remainder: ZONE_COLOR.gathering,
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
  pickKind,
  suggestion,
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
  pickKind: ZoneKind | null;
  suggestion: ZoneKind | null;
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
  // Assigned zones keep their kind color. While choosing, selected / hovered
  // faces use the active program; other open faces use their suggestion.
  const color = kind
    ? ZONE_COLOR[kind]
    : (selected || hovered) && pickKind
      ? ZONE_COLOR[pickKind]
      : suggestion
        ? ZONE_COLOR[suggestion]
        : FIT_COLOR[fit ?? "unsuitable"];
  const fill = kind
    ? (selected ? 0.5 : hovered ? 0.36 : 0.26)
    : selected
      ? 0.48
      : hovered
        ? 0.34
        : fit === "plausible"
          ? 0.22
          : fit === "marginal"
            ? 0.12
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
        <meshBasicMaterial color={color} transparent opacity={opacity ?? fill} depthWrite={false} side={DoubleSide} />
      </mesh>
      <lineSegments raycast={() => null} renderOrder={4}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[line, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={selected ? 1 : hovered ? 0.95 : kind ? 0.7 : 0.4} />
      </lineSegments>
    </group>
  );
}

export function SitePocketLayer({
  pockets,
  kinds,
  pickKind = null,
  suggestions,
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
  /** Active Lobby / Gathering / Workspace while the designer is choosing faces. */
  pickKind?: ZoneKind | null;
  suggestions?: Readonly<Record<string, ZoneKind | null>>;
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
          pickKind={pickKind}
          suggestion={suggestions?.[pocket.id] ?? null}
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
