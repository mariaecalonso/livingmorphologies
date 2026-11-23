"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import {
  CanvasTexture,
  DoubleSide,
  MeshBasicMaterial,
  NormalBlending,
  Raycaster,
  RingGeometry,
  SpriteMaterial,
  Vector2,
  type Camera,
} from "three";
import { worldToStored } from "@/lib/skill5/render-frame";
import type { SiteNetworkStudy } from "./site-network";
import { type TypologyAttractor, type TypologyIntent } from "./typology-attractors";

const PLANE_Y = 1.12;
const MARK_Y = 2.55;

export const TYPOLOGY_COLOR: Record<TypologyIntent, string> = {
  lobby: "#b07be0",
  workspace: "#6d97e0",
  gathering: "#e7a0c0",
};

const TYPOLOGY_LABEL: Record<TypologyIntent, string> = {
  lobby: "LOBBY",
  gathering: "GATHERING",
  workspace: "WORKSPACE",
};

function skipRaycast() {}

function storedAt(clientX: number, clientY: number, camera: Camera, element: HTMLCanvasElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const pointer = new Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const { origin, direction } = raycaster.ray;
  if (Math.abs(direction.y) < 1e-6) return null;
  const distance = (PLANE_Y - origin.y) / direction.y;
  if (distance < 0) return null;
  const stored = worldToStored(origin.x + direction.x * distance, PLANE_Y, origin.z + direction.z * distance);
  return { x: stored.x, z: stored.z };
}

function labelMaterial(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 80;
  const context = canvas.getContext("2d");
  const map = new CanvasTexture(canvas);
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.font = "500 34px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    map.needsUpdate = true;
  }
  const material = new SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0.92 });
  material.toneMapped = false;
  return material;
}

function IntentMark({
  point,
  selected,
  hovered,
  onSelect,
  onHover,
  onMove,
  canMove,
}: {
  point: TypologyAttractor;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  canMove: (x: number, z: number) => boolean;
}) {
  const { camera, gl } = useThree();
  const color = TYPOLOGY_COLOR[point.typology];
  const active = selected || hovered;
  const ring = useMemo(() => new RingGeometry(active ? 2.6 : 2.35, active ? 3.7 : 3.25, 40), [active]);
  const material = useMemo(() => {
    const next = new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, opacity: active ? 1 : 0.88, depthWrite: false });
    next.toneMapped = false;
    return next;
  }, [active, color]);
  const core = useMemo(() => {
    const next = new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, opacity: 0.95, depthWrite: false });
    next.toneMapped = false;
    return next;
  }, [color]);
  const glow = useMemo(() => {
    const next = new SpriteMaterial({ color, transparent: true, opacity: active ? 0.28 : 0.16, depthWrite: false, blending: NormalBlending });
    next.toneMapped = false;
    return next;
  }, [active, color]);
  const label = useMemo(() => labelMaterial(TYPOLOGY_LABEL[point.typology], color), [color, point.typology]);
  useEffect(() => () => {
    ring.dispose();
    material.dispose();
    core.dispose();
    glow.dispose();
    label.map?.dispose();
    label.dispose();
  }, [core, glow, label, material, ring]);

  const down = (event: { stopPropagation: () => void; nativeEvent: PointerEvent }) => {
    event.stopPropagation();
    event.nativeEvent.stopPropagation();
    onSelect(point.id);
    const move = (native: PointerEvent) => {
      native.preventDefault();
      const next = storedAt(native.clientX, native.clientY, camera, gl.domElement);
      if (!next || !canMove(next.x, next.z)) return;
      onMove(point.id, next.x, next.z);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <group position={[point.x, MARK_Y, point.z]}>
      <sprite material={glow} scale={[active ? 26 : 20, active ? 26 : 20, 1]} raycast={skipRaycast} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={8} onPointerDown={down} onPointerOver={(event) => { event.stopPropagation(); onHover(point.id); }} onPointerOut={() => onHover(null)}>
        <circleGeometry args={[1.15, 24]} />
        <primitive object={core} attach="material" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={8} raycast={skipRaycast}>
        <primitive object={ring} attach="geometry" />
        <primitive object={material} attach="material" />
      </mesh>
      <sprite material={label} position={[0, 7.5, 0]} scale={[22, 4.6, 1]} raycast={skipRaycast} />
    </group>
  );
}

export function TypologyAttractorLayer({
  study,
  points,
  placing,
  visible,
  types,
  selectedId,
  onSelect,
  onAdd,
  onMove,
}: {
  study: SiteNetworkStudy;
  points: readonly TypologyAttractor[];
  placing: TypologyIntent | null;
  visible: boolean;
  types: Record<TypologyIntent, boolean>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (x: number, z: number) => void;
  onMove: (id: string, x: number, z: number) => void;
}) {
  const { camera, gl } = useThree();
  const cameraRef = useRef(camera);
  const glRef = useRef(gl);
  cameraRef.current = camera;
  glRef.current = gl;
  const [hover, setHover] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; z: number } | null>(null);
  const shown = visible ? points.filter((point) => types[point.typology]) : [];
  const width = study.frame.maxX - study.frame.minX;
  const depth = study.frame.maxZ - study.frame.minZ;
  const allowed = (x: number, z: number) => study.canPlace("attractor", x, z);

  return (
    <group>
      {placing ? (
        <mesh
          position={[(study.frame.minX + study.frame.maxX) / 2, PLANE_Y, (study.frame.minZ + study.frame.maxZ) / 2]}
          rotation={[Math.PI / 2, 0, 0]}
          renderOrder={7}
          onPointerMove={(event) => {
            const point = storedAt(event.nativeEvent.clientX, event.nativeEvent.clientY, cameraRef.current, glRef.current.domElement);
            if (!point || !allowed(point.x, point.z)) {
              setGhost(null);
              return;
            }
            setGhost(point);
          }}
          onPointerOut={() => setGhost(null)}
          onClick={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            const point = storedAt(event.nativeEvent.clientX, event.nativeEvent.clientY, cameraRef.current, glRef.current.domElement);
            if (!point || !allowed(point.x, point.z)) return;
            onAdd(point.x, point.z);
          }}
        >
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh>
      ) : null}
      {ghost && placing ? (
        <mesh position={[ghost.x, MARK_Y, ghost.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={skipRaycast} renderOrder={8}>
          <ringGeometry args={[2.2, 3.1, 32]} />
          <meshBasicMaterial color={TYPOLOGY_COLOR[placing]} transparent opacity={0.7} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      ) : null}
      {shown.map((point) => (
        <IntentMark
          key={point.id}
          point={point}
          selected={point.id === selectedId}
          hovered={point.id === hover}
          onSelect={onSelect}
          onHover={setHover}
          onMove={onMove}
          canMove={allowed}
        />
      ))}
    </group>
  );
}
