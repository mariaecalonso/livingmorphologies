"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DoubleSide, ExtrudeGeometry, Shape, Vector2, type BufferGeometry, type Raycaster } from "three";
import { useThree } from "@react-three/fiber";
import { worldToStored } from "@/lib/skill5/render-frame";
import { cleanedRing, polygonCentroid, polygonIssue, type ZoneKind, type ZonePoint, type ZoningRegion } from "@/lib/skill5/zoning";
import type { SiteViewMode } from "./site-viewport";

export const ZONE_COLOR: Record<ZoneKind, string> = {
  lobby: "#c77e5f",
  gathering: "#49d7de",
  workspace: "#7f96a8",
};

export type ZoneTool = "draw" | "select" | "edit" | "move";

type Drag =
  | { kind: "vertex" | "edge" | "body"; index: number; origin: ZonePoint; points: ZonePoint[] }
  | { kind: "top" | "base"; originY: number; baseFt: number; heightFt: number; pointerY: number };

function skipRaycast() {}

function groundPoint(raycaster: Raycaster) {
  const { origin, direction } = raycaster.ray;
  if (Math.abs(direction.y) < 1e-6) return null;
  const distance = (0.5 - origin.y) / direction.y;
  if (distance < 0) return null;
  const hit = origin.clone().addScaledVector(direction, distance);
  const stored = worldToStored(hit.x, hit.y, hit.z);
  return { x: stored.x, z: stored.z };
}

function reverseWinding(geometry: BufferGeometry) {
  const index = geometry.getIndex();
  if (!index) return;
  for (let cursor = 0; cursor < index.count; cursor += 3) {
    const first = index.getX(cursor);
    index.setX(cursor, index.getX(cursor + 2));
    index.setX(cursor + 2, first);
  }
  index.needsUpdate = true;
}

function volumeGeometry(points: readonly ZonePoint[], baseFt: number, heightFt: number) {
  const shape = new Shape();
  shape.moveTo(points[0].x, points[0].z);
  for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index].x, points[index].z);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: heightFt, bevelEnabled: false });
  // The scale that lifts the extrusion above the ground also flips the faces downward.
  // Reverse them so the roof faces the camera and can be picked.
  geometry.rotateX(Math.PI / 2);
  geometry.scale(1, -1, 1);
  reverseWinding(geometry);
  geometry.computeVertexNormals();
  geometry.translate(0, baseFt, 0);
  return geometry;
}

function outlinePositions(points: readonly ZonePoint[], y: number) {
  const positions: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    positions.push(from.x, y, from.z, to.x, y, to.z);
  }
  return new Float32Array(positions);
}

export function SiteZoneLayer({
  zones,
  draft,
  tool,
  mode,
  active,
  selectedId,
  onDraftPoint,
  onCloseDraft,
  onSelect,
  onCommitPoints,
  onCommitElevation,
  onReject,
}: {
  zones: readonly ZoningRegion[];
  draft: readonly ZonePoint[];
  tool: ZoneTool;
  mode: SiteViewMode;
  active: boolean;
  selectedId: string | null;
  onDraftPoint: (point: ZonePoint) => void;
  onCloseDraft: () => void;
  onSelect: (id: string | null) => void;
  onCommitPoints: (id: string, points: ZonePoint[]) => boolean;
  onCommitElevation: (id: string, baseFt: number, heightFt: number) => boolean;
  onReject: (message: string) => void;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const raycaster = useThree((state) => state.raycaster);
  const cameraRef = useRef(camera);
  const glRef = useRef(gl);
  const rayRef = useRef(raycaster);
  cameraRef.current = camera;
  glRef.current = gl;
  rayRef.current = raycaster;
  const drag = useRef<Drag | null>(null);
  const moved = useRef(false);
  const [override, setOverride] = useState<ZoningRegion | null>(null);
  const [hover, setHover] = useState<ZonePoint | null>(null);
  const overrideRef = useRef(override);
  overrideRef.current = override;

  const readGround = (event: { clientX: number; clientY: number }) => {
    const rect = glRef.current.domElement.getBoundingClientRect();
    const pointer = new Vector2(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    rayRef.current.setFromCamera(pointer, cameraRef.current);
    return groundPoint(rayRef.current);
  };
  const pointFromEvent = (event: { point: { x: number; y: number; z: number }; nativeEvent: { clientX: number; clientY: number } }) => {
    if (Number.isFinite(event.point.x) && Number.isFinite(event.point.z)) {
      const stored = worldToStored(event.point.x, event.point.y, event.point.z);
      return { x: stored.x, z: stored.z };
    }
    return readGround(event.nativeEvent);
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || (event.buttons & 1) === 0) return;
      const zoneId = selectedId;
      if (!zoneId) return;
      const zone = zones.find((item) => item.id === zoneId);
      if (!zone) return;
      if (current.kind === "top" || current.kind === "base") {
        const dy = event.clientY - current.pointerY;
        const feet = -dy * 0.45;
        if (Math.abs(feet) > 0.4) moved.current = true;
        const next = current.kind === "top"
          ? { baseFt: current.baseFt, heightFt: current.heightFt + feet }
          : { baseFt: current.baseFt + feet, heightFt: current.heightFt - feet };
        const lifted = { ...zone, ...next };
        overrideRef.current = lifted;
        setOverride(lifted);
        return;
      }
      const point = readGround(event);
      if (!point) return;
      const dx = point.x - current.origin.x;
      const dz = point.z - current.origin.z;
      if (Math.hypot(dx, dz) > 0.6) moved.current = true;
      let points = current.points.map((item) => ({ ...item }));
      if (current.kind === "body") points = points.map((item) => ({ x: item.x + dx, z: item.z + dz }));
      if (current.kind === "vertex") points[current.index] = { x: current.points[current.index].x + dx, z: current.points[current.index].z + dz };
      if (current.kind === "edge") {
        const next = (current.index + 1) % points.length;
        points[current.index] = { x: current.points[current.index].x + dx, z: current.points[current.index].z + dz };
        points[next] = { x: current.points[next].x + dx, z: current.points[next].z + dz };
      }
      const shaped = { ...zone, points };
      overrideRef.current = shaped;
      setOverride(shaped);
    };
    const up = () => {
      const current = drag.current;
      const zoneId = selectedId;
      drag.current = null;
      const next = overrideRef.current;
      setOverride(null);
      if (!current || !zoneId || !moved.current || !next || next.id !== zoneId) {
        moved.current = false;
        return;
      }
      moved.current = false;
      if (current.kind === "top" || current.kind === "base") {
        if (!onCommitElevation(zoneId, next.baseFt, next.heightFt)) onReject("That height is not valid. The previous volume stays.");
        return;
      }
      if (!onCommitPoints(zoneId, next.points)) onReject("That outline is not valid. The previous region stays.");
    };
    gl.domElement.addEventListener("pointermove", move);
    gl.domElement.addEventListener("pointerup", up);
    return () => {
      gl.domElement.removeEventListener("pointermove", move);
      gl.domElement.removeEventListener("pointerup", up);
    };
  }, [gl, onCommitElevation, onCommitPoints, onReject, selectedId, zones]);

  const shown = zones.map((zone) => override?.id === zone.id ? override : zone);
  const plan = mode === "plan";
  const draw = active && plan && tool === "draw";
  const cursor = hover ?? (draft.length > 0 ? draft[draft.length - 1] : null);

  return (
    <group>
      {shown.filter((zone) => zone.visible).map((zone) => (
        <ZoneBody
          key={zone.id}
          zone={zone}
          selected={zone.id === selectedId}
          active={active}
          tool={tool}
          plan={plan}
          onSelect={() => onSelect(zone.id)}
          onBegin={(dragState) => {
            if (!active || draw) return;
            drag.current = dragState;
            moved.current = false;
          }}
          capture={active && !draw && !(tool === "edit" && zone.id === selectedId)}
        />
      ))}
      {draft.length > 0 ? <DraftLine points={draft} cursor={draw ? cursor : null} /> : null}
      {active && !draw ? (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.2, 0]}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            onSelect(null);
          }}
        >
          <planeGeometry args={[12000, 12000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh>
      ) : null}
      {draw ? (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 1.35, 0]}
          onPointerMove={(event) => {
            const point = pointFromEvent(event);
            if (!point) return;
            setHover((current) => current && Math.hypot(current.x - point.x, current.z - point.z) < 0.4 ? current : point);
          }}
          onPointerOut={() => setHover(null)}
          onPointerDown={(event) => {
            if (event.button !== 0 || !plan) return;
            event.stopPropagation();
            const point = pointFromEvent(event);
            if (point) onDraftPoint(point);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onCloseDraft();
          }}
        >
          <planeGeometry args={[12000, 12000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh>
      ) : null}
    </group>
  );
}

function DraftLine({ points, cursor }: { points: readonly ZonePoint[]; cursor: ZonePoint | null }) {
  const chain = cursor && (points.length === 0 || Math.hypot(cursor.x - points[points.length - 1].x, cursor.z - points[points.length - 1].z) > 0.8)
    ? [...points, cursor]
    : points;
  const positions = useMemo(() => {
    const next: number[] = [];
    for (let index = 0; index < chain.length - 1; index += 1) {
      next.push(chain[index].x, 1.8, chain[index].z, chain[index + 1].x, 1.8, chain[index + 1].z);
    }
    return new Float32Array(next);
  }, [chain]);
  return (
    <group>
      {positions.length > 0 ? (
        <lineSegments raycast={skipRaycast}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#f2f2ee" transparent opacity={0.9} />
        </lineSegments>
      ) : null}
      {points.map((point, index) => (
        <mesh key={`${point.x.toFixed(2)}-${point.z.toFixed(2)}-${index}`} position={[point.x, 1.8, point.z]} raycast={skipRaycast}>
          <sphereGeometry args={[3.2, 16, 12]} />
          <meshBasicMaterial color="#f2f2ee" />
        </mesh>
      ))}
    </group>
  );
}

function ZoneBody({
  zone,
  selected,
  active,
  tool,
  plan,
  onSelect,
  onBegin,
  capture,
}: {
  zone: ZoningRegion;
  selected: boolean;
  active: boolean;
  tool: ZoneTool;
  plan: boolean;
  onSelect: () => void;
  onBegin: (drag: Drag) => void;
  capture: boolean;
}) {
  const [hover, setHover] = useState(false);
  const geometry = useMemo(() => volumeGeometry(zone.points, zone.baseFt, zone.heightFt), [zone.baseFt, zone.heightFt, zone.points]);
  const baseLine = useMemo(() => outlinePositions(zone.points, zone.baseFt + 0.4), [zone.baseFt, zone.points]);
  const topLine = useMemo(() => outlinePositions(zone.points, zone.baseFt + zone.heightFt), [zone.baseFt, zone.heightFt, zone.points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const center = polygonCentroid(zone.points);
  const color = ZONE_COLOR[zone.kind];
  const canShape = active && selected && plan && (tool === "edit" || tool === "move");
  const canLift = active && selected && !plan;
  return (
    <group>
      <mesh
        geometry={geometry}
        renderOrder={2}
        onPointerOver={capture ? (event) => {
          event.stopPropagation();
          setHover(true);
        } : undefined}
        onPointerOut={capture ? () => setHover(false) : undefined}
        onPointerDown={capture ? (event) => {
          if (event.button !== 0 || !active) return;
          event.stopPropagation();
          onSelect();
          if (tool !== "move") return;
          const point = worldToStored(event.point.x, event.point.y, event.point.z);
          onBegin({ kind: "body", index: 0, origin: { x: point.x, z: point.z }, points: zone.points.map((item) => ({ ...item })) });
        } : undefined}
      >
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.46 : hover ? 0.34 : 0.22} depthWrite={false} side={DoubleSide} />
      </mesh>
      <lineSegments raycast={skipRaycast}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[baseLine, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={selected ? 1 : 0.7} />
      </lineSegments>
      <lineSegments raycast={skipRaycast}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[topLine, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.45} />
      </lineSegments>
      {canShape && tool === "edit" ? zone.points.map((point, index) => (
        <mesh
          key={`${zone.id}-v-${index}`}
          position={[point.x, zone.baseFt + 1.1, point.z]}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            const origin = worldToStored(event.point.x, event.point.y, event.point.z);
            onBegin({ kind: "vertex", index, origin: { x: origin.x, z: origin.z }, points: zone.points.map((item) => ({ ...item })) });
          }}
        >
          <boxGeometry args={[4.5, 4.5, 4.5]} />
          <meshBasicMaterial color="#f2f2ee" />
        </mesh>
      )) : null}
      {canShape && tool === "edit" ? zone.points.map((point, index) => {
        const next = zone.points[(index + 1) % zone.points.length];
        return (
          <mesh
            key={`${zone.id}-e-${index}`}
            position={[(point.x + next.x) / 2, zone.baseFt + 1.1, (point.z + next.z) / 2]}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              const origin = worldToStored(event.point.x, event.point.y, event.point.z);
              onBegin({ kind: "edge", index, origin: { x: origin.x, z: origin.z }, points: zone.points.map((item) => ({ ...item })) });
            }}
          >
            <sphereGeometry args={[2.4, 12, 12]} />
            <meshBasicMaterial color={color} />
          </mesh>
        );
      }) : null}
      {canLift ? (
        <group>
          <mesh
            position={[center.x, zone.baseFt + zone.heightFt, center.z]}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              onBegin({ kind: "top", originY: zone.baseFt + zone.heightFt, baseFt: zone.baseFt, heightFt: zone.heightFt, pointerY: event.nativeEvent.clientY });
            }}
          >
            <boxGeometry args={[6, 2.2, 6]} />
            <meshBasicMaterial color="#f2f2ee" />
          </mesh>
          <mesh
            position={[center.x, zone.baseFt, center.z]}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              onBegin({ kind: "base", originY: zone.baseFt, baseFt: zone.baseFt, heightFt: zone.heightFt, pointerY: event.nativeEvent.clientY });
            }}
          >
            <boxGeometry args={[6, 2.2, 6]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

export function closeDraft(points: readonly ZonePoint[]) {
  return polygonIssue(cleanedRing(points)) === null;
}
