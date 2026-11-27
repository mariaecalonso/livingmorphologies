"use client";

import { useEffect, useMemo, useRef } from "react";
import { BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Plane, Quaternion, Raycaster, Shape, ShapeGeometry, ShaderMaterial, Uint32BufferAttribute, Vector2, Vector3 } from "three";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { ClusterSitePose } from "@/lib/skill5/placed-cluster";
import type { GumballPose } from "@/lib/skill5/gumball";
import { TileGumball } from "./tile-gumball";
import { occupancyPoseToGumball } from "./occupancy-solids";
import { polygonCentroid } from "@/lib/skill5/zoning";
import { worldToStored } from "@/lib/skill5/render-frame";
import { ZONE_COLOR } from "./site-zone-layer";
import { setPlacementCameraSuspended } from "./placement-navigation";

export type AssemblySolid = {
  id: string;
  positions: Float32Array;
  indices: Uint32Array;
  /** Smooth mesh normals when available — keeps void curve highlights continuous. */
  normals?: Float32Array;
  color: string;
  opacity: number;
  /** When set, positions are local (centered) and this pose places the solid on site. */
  pose?: ClusterSitePose;
};

export type ClusterAssemblyInteraction = {
  /** Primary cluster — gumball anchor (last click in the selection). */
  selectedId: string | null;
  selectedIds?: readonly string[];
  onSelect: (id: string | null, modifiers?: { shiftKey?: boolean }) => void;
  snap: boolean;
  view: "perspective" | "plan" | "axon" | "section";
  onGumball: (pose: GumballPose & { id: string }, commit: boolean, modifiers?: { shiftKey?: boolean }) => void;
  /** Shift held with a multi-selection — rigid group drag in placement. */
  shiftGroup?: boolean;
  lockedIds?: readonly string[];
  hiddenIds?: readonly string[];
  /** Yaw ring step in radians. Placement uses a quarter turn. */
  yawStep?: number;
  /** Placement limits rotation to these stored axes. Y is vertical. */
  rings?: readonly ("x" | "y" | "z")[];
  gumballLive?: (GumballPose & { id: string }) | null;
  onZone?: (zoneId: string, at?: { x: number; z: number }) => void;
  selectedZoneId?: string | null;
};

export type ClusterAssemblyModel = {
  zoning: boolean;
  clusters: boolean;
  connections: boolean;
  massing: boolean;
  branches: readonly { x0: number; z0: number; x1: number; z1: number }[];
  zones: readonly { id?: string; kind: "lobby" | "gathering" | "workspace"; name?: string; points: readonly { x: number; z: number }[] }[];
  zonePalette?: Record<"lobby" | "gathering" | "workspace", string>;
  zoneFills?: boolean;
  /** Floating zone names. Placement leaves these off. */
  zoneCaptions?: boolean;
  anchors: readonly { id: string; x: number; z: number; tested: boolean }[];
  link: { ax: number; az: number; bx: number; bz: number } | null;
  solids: readonly AssemblySolid[];
  voids: readonly AssemblySolid[];
  hybrid: AssemblySolid | null;
  wrap: AssemblySolid | null;
  interaction?: ClusterAssemblyInteraction | null;
};

const WHITE_VERT = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WHITE_FRAG = `
  precision highp float;
  varying vec3 vNormal;
  uniform float uTint;
  uniform float uLock;
  void main() {
    vec3 n = normalize(vNormal);
    if (dot(n, vec3(0.0, 0.0, 1.0)) < 0.0) n = -n;
    float lambert = clamp(dot(n, normalize(vec3(0.42, 0.74, 0.52))), 0.0, 1.0);
    float shadeLit = 0.38 + lambert * 0.24;
    vec3 body = vec3(1.0) * shadeLit;
    float crease = smoothstep(0.5, 0.95, length(fwidth(n))) * 0.22;
    vec3 lit = mix(body, vec3(0.96), crease);
    vec3 blue = vec3(0.62, 0.78, 0.86) * (0.72 + lambert * 0.28);
    vec3 clay = vec3(0.78, 0.49, 0.37);
    if (uLock > 0.5) {
      gl_FragColor = vec4(mix(lit * 0.82, clay, 0.42), 1.0);
    } else {
      gl_FragColor = vec4(mix(lit, blue, uTint), 1.0);
    }
  }
`;

function CatalogCluster({
  solid,
  pickable,
  selected,
  onSelect,
  gumball,
  gumballPrimary = false,
  locked = false,
}: {
  solid: AssemblySolid;
  pickable?: boolean;
  selected?: boolean;
  onSelect?: (id: string, modifiers?: { shiftKey?: boolean }) => void;
  gumball?: ClusterAssemblyInteraction | null;
  gumballPrimary?: boolean;
  locked?: boolean;
}) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(solid.positions, 3));
    next.setIndex(new Uint32BufferAttribute(solid.indices, 1));
    next.computeVertexNormals();
    return next;
  }, [solid.indices, solid.positions]);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: WHITE_VERT,
    fragmentShader: WHITE_FRAG,
    uniforms: { uTint: { value: 0 }, uLock: { value: 0 } },
    transparent: false,
    depthWrite: true,
    opacity: 1,
    side: DoubleSide,
    toneMapped: false,
  }), []);
  useEffect(() => {
    material.uniforms.uTint.value = selected && !locked ? 0.34 : 0;
    material.uniforms.uLock.value = locked ? 1 : 0;
  }, [locked, material, selected]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  const { camera, gl } = useThree();
  const dragPose = useRef<GumballPose | null>(null);
  const pick = (event: ThreeEvent<MouseEvent>) => {
    if (!pickable || !onSelect) return;
    event.stopPropagation();
    if (event.nativeEvent.shiftKey) return;
    onSelect(solid.id, { shiftKey: false });
  };
  const dragBody = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (!selected || !gumball || locked || event.nativeEvent.button !== 0) return;
    const startHit = event.point.clone();
    const startStored = worldToStored(startHit.x, startHit.y, startHit.z);
    const sitePose = solid.pose;
    if (!sitePose) return;
    const base = gumball.gumballLive?.id === solid.id ? gumball.gumballLive : occupancyPoseToGumball(sitePose);
    const plane = new Plane(new Vector3(0, 1, 0), -startHit.y);
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const hit = new Vector3();
    dragPose.current = { ...base };
    setPlacementCameraSuspended(true);
    gumball.onGumball({ ...base, id: solid.id }, false, { shiftKey: event.nativeEvent.shiftKey });
    const pointerId = event.pointerId;
    const originX = event.nativeEvent.clientX;
    const originY = event.nativeEvent.clientY;
    let moved = false;
    const move = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      if (!moved && Math.hypot(native.clientX - originX, native.clientY - originY) < 4) return;
      moved = true;
      const rect = gl.domElement.getBoundingClientRect();
      pointer.set(((native.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -((native.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      const stored = worldToStored(hit.x, hit.y, hit.z);
      const next = { ...base, x: base.x + stored.x - startStored.x, z: base.z + stored.z - startStored.z };
      dragPose.current = next;
      gumball.onGumball({ ...next, id: solid.id }, false, { shiftKey: native.shiftKey });
    };
    const end = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setPlacementCameraSuspended(false);
      if (moved && dragPose.current) gumball.onGumball({ ...dragPose.current, id: solid.id }, true, { shiftKey: native.shiftKey });
      dragPose.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const body = (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={1}
      raycast={pickable ? undefined : () => undefined}
      onClick={pickable ? pick : undefined}
      onPointerDown={pickable ? (event) => {
        event.stopPropagation();
        if (event.nativeEvent.shiftKey) onSelect?.(solid.id, { shiftKey: true });
        dragBody(event);
      } : undefined}
    />
  );

  if (!solid.pose) return body;

  const pose = solid.pose;
  const axes = gumball?.gumballLive?.id === solid.id ? gumball.gumballLive : occupancyPoseToGumball(pose);
  const sx = pose.mirror === "x" ? -1 : 1;
  const sz = pose.mirror === "z" ? -1 : 1;
  const showGumball = Boolean(selected && gumball && gumballPrimary && !locked);
  // Yaw about site Y is outermost, so a plan turn cannot tilt the cluster. Zone fills are drawn above this ground.
  const bodyQuaternion = new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), -axes.rotationY)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), axes.rotationX))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), axes.rotationZ));
  const bodyScale: [number, number, number] = [sx * axes.scaleX, axes.scaleY, sz * axes.scaleZ];

  return (
    <group position={[axes.x, axes.y, axes.z]}>
      <group quaternion={bodyQuaternion} scale={bodyScale}>
        {body}
      </group>
      {showGumball && gumball ? (
        <TileGumball
          pose={axes}
          snap={gumball.snap}
          yawStep={gumball.yawStep}
          handles={{ move: true, rotate: true, scale: false }}
          view={gumball.view}
          rings={gumball.rings}
          onChange={(next, modifiers) => gumball.onGumball({ ...next, id: solid.id }, false, modifiers)}
          onCommit={(next, modifiers) => gumball.onGumball({ ...next, id: solid.id }, true, modifiers)}
        />
      ) : null}
    </group>
  );
}

/**
 * Teal + orange void — no ground-up gradient, no contour lines.
 * Both colors follow world-space bumps/slopes so form reads through the hue.
 */
const VOID_VERT = `
  varying vec3 vWorld;
  varying vec3 vWorldNormal;
  void main() {
    vWorld = position;
    vec3 n = mat3(modelMatrix) * normal;
    float len = length(n);
    vWorldNormal = len > 1e-5 ? n / len : vec3(0.0, 1.0, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VOID_FRAG = `
  precision highp float;
  varying vec3 vWorld;
  varying vec3 vWorldNormal;
  uniform float uAlpha;
  void main() {
    vec3 teal = vec3(0.058824, 0.450980, 0.466667);
    vec3 orange = vec3(0.780392, 0.494118, 0.372549);
    vec3 n = normalize(vWorldNormal);
    float slope = clamp(1.0 - abs(n.y), 0.0, 1.0);
    /** Form field from bumps + slopes — not height from the ground. */
    float bump = 0.5
      + 0.24 * sin(vWorld.x * 0.09 + vWorld.z * 0.07)
      + 0.18 * sin(vWorld.y * 0.14 - vWorld.x * 0.05)
      + 0.14 * sin((vWorld.x + vWorld.z) * 0.045 + vWorld.y * 0.08);
    bump = clamp(bump, 0.22, 0.9);
    float form = clamp(mix(bump, slope, 0.45), 0.0, 1.0);
    /** Orange on ridges/slopes, teal in softer recesses. */
    vec3 hue = mix(teal, orange, form);
    float shade = mix(0.78, 1.06, form);
    float alpha = mix(0.94, 0.99, form) * uAlpha;
    gl_FragColor = vec4(hue * shade, clamp(alpha, 0.0, 0.99));
  }
`;

function VoidVolume({ solid }: { solid: AssemblySolid }) {
  const parts = useMemo(() => {
    if (!solid.positions?.length || !solid.indices?.length) return [];
    const positions = new Float32Array(solid.positions);
    const indices = new Uint32Array(solid.indices);
    const normals = solid.normals && solid.normals.length === positions.length
      ? new Float32Array(solid.normals)
      : smoothNormals(positions, indices);
    const triCount = indices.length / 3;
    const chunkTris = 80_000;
    const out: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }[] = [];
    for (let start = 0; start < triCount; start += chunkTris) {
      const count = Math.min(chunkTris, triCount - start);
      const remap = new Map<number, number>();
      const localIndex: number[] = [];
      const localPos: number[] = [];
      const localNor: number[] = [];
      for (let t = 0; t < count; t += 1) {
        for (let k = 0; k < 3; k += 1) {
          const src = indices[(start + t) * 3 + k];
          let next = remap.get(src);
          if (next === undefined) {
            next = remap.size;
            remap.set(src, next);
            const at = src * 3;
            localPos.push(positions[at], positions[at + 1], positions[at + 2]);
            localNor.push(normals[at], normals[at + 1], normals[at + 2]);
          }
          localIndex.push(next);
        }
      }
      out.push({
        positions: new Float32Array(localPos),
        normals: new Float32Array(localNor),
        indices: new Uint32Array(localIndex),
      });
    }
    return out;
  }, [solid.indices, solid.normals, solid.positions]);
  const alpha = Math.min(1, Math.max(0.65, solid.opacity || 1));
  return (
    <group>
      {parts.map((part, index) => (
        <VoidShell
          key={`void-shell-v2-${index}-${part.positions.length}`}
          positions={part.positions}
          normals={part.normals}
          indices={part.indices}
          alpha={alpha}
        />
      ))}
    </group>
  );
}

function smoothNormals(positions: Float32Array, indices: Uint32Array) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ax = positions[ib] - positions[ia];
    const ay = positions[ib + 1] - positions[ia + 1];
    const az = positions[ib + 2] - positions[ia + 2];
    const bx = positions[ic] - positions[ia];
    const by = positions[ic + 1] - positions[ia + 1];
    const bz = positions[ic + 2] - positions[ia + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const at of [ia, ib, ic]) {
      normals[at] += nx;
      normals[at + 1] += ny;
      normals[at + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }
  return normals;
}

function VoidShell({
  positions,
  normals,
  indices,
  alpha,
}: {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  alpha: number;
}) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(positions, 3));
    next.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    next.setIndex(new Uint32BufferAttribute(indices, 1));
    return next;
  }, [indices, normals, positions]);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: VOID_VERT,
    fragmentShader: VOID_FRAG,
    uniforms: {
      uAlpha: { value: alpha },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
  }), [alpha]);
  useEffect(() => () => {
    material.dispose();
  }, [material]);
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={10} raycast={() => undefined} />;
}

function SolidMesh({ solid }: { solid: AssemblySolid }) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(solid.positions, 3));
    next.setIndex(new Uint32BufferAttribute(solid.indices, 1));
    next.computeVertexNormals();
    return next;
  }, [solid.indices, solid.positions]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => undefined}>
      <meshStandardMaterial color={solid.color} transparent={solid.opacity < 0.98} opacity={solid.opacity} depthWrite={solid.opacity >= 0.98} side={DoubleSide} roughness={0.62} metalness={0.02} />
    </mesh>
  );
}

function ZoneCaption({ name, color, x, z }: { name: string; color: string; x: number; z: number }) {
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(8, 20, canvas.width - 16, canvas.height - 40);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 20, canvas.width - 16, canvas.height - 40);
    ctx.fillStyle = "#f4f1ea";
    ctx.font = "600 44px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = name.length > 28 ? `${name.slice(0, 26)}…` : name;
    ctx.fillText(label.toUpperCase(), canvas.width / 2, canvas.height / 2);
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, [color, name]);
  useEffect(() => () => map?.dispose(), [map]);
  if (!map) return null;
  return (
    <sprite position={[x, 5, z]} scale={[72, 18, 1]} renderOrder={12}>
      <spriteMaterial map={map} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

function ZoneFill({
  kind,
  points,
  color,
  active,
}: {
  kind: "lobby" | "gathering" | "workspace";
  points: readonly { x: number; z: number }[];
  color: string;
  active?: boolean;
}) {
  const geometry = useMemo(() => {
    const shape = new Shape();
    points.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, point.z);
      else shape.lineTo(point.x, point.z);
    });
    const next = new ShapeGeometry(shape);
    next.rotateX(Math.PI / 2);
    return next;
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[0, 1.8, 0]} raycast={() => undefined}>
      <meshBasicMaterial color={color} transparent opacity={active ? 0.34 : kind === "workspace" ? 0.16 : 0.22} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

function ZonePick({ id, points, onZone }: { id: string; points: readonly { x: number; z: number }[]; onZone: (zoneId: string, at?: { x: number; z: number }) => void }) {
  const geometry = useMemo(() => {
    const shape = new Shape();
    points.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, point.z);
      else shape.lineTo(point.x, point.z);
    });
    const next = new ShapeGeometry(shape);
    next.rotateX(Math.PI / 2);
    return next;
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[0, 2.4, 0]} onClick={(event) => {
      event.stopPropagation();
      const stored = worldToStored(event.point.x, event.point.y, event.point.z);
      onZone(id, { x: stored.x, z: stored.z });
    }}>
      <meshBasicMaterial transparent opacity={0.01} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

export function ClusterAssemblyLayer({ model }: { model: ClusterAssemblyModel }) {
  const branches = useMemo(() => {
    const positions = new Float32Array(model.branches.length * 6);
    model.branches.forEach((branch, index) => {
      const offset = index * 6;
      positions[offset] = branch.x0;
      positions[offset + 1] = 1.4;
      positions[offset + 2] = branch.z0;
      positions[offset + 3] = branch.x1;
      positions[offset + 4] = 1.4;
      positions[offset + 5] = branch.z1;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geometry;
  }, [model.branches]);
  const palette = model.zonePalette ?? ZONE_COLOR;
  const zones = useMemo(() => model.zones.map((zone, zoneIndex) => {
    const positions = new Float32Array(zone.points.length * 6);
    zone.points.forEach((point, index) => {
      const next = zone.points[(index + 1) % zone.points.length];
      const offset = index * 6;
      positions[offset] = point.x;
      positions[offset + 1] = 2.2;
      positions[offset + 2] = point.z;
      positions[offset + 3] = next.x;
      positions[offset + 4] = 2.2;
      positions[offset + 5] = next.z;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const color = palette[zone.kind];
    const center = polygonCentroid(zone.points);
    return { id: zone.id ?? `${zone.kind}-${zoneIndex}`, geometry, color, kind: zone.kind, points: zone.points, name: zone.name, center };
  }), [model.zones, palette]);
  const link = useMemo(() => {
    if (!model.link) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([
      model.link.ax, 8, model.link.az,
      model.link.bx, 8, model.link.bz,
    ], 3));
    return geometry;
  }, [model.link]);
  useEffect(() => () => {
    branches.dispose();
    link?.dispose();
    zones.forEach((zone) => zone.geometry.dispose());
  }, [branches, link, zones]);
  const showClusters = model.clusters || model.connections;
  const interaction = model.interaction ?? null;
  return (
    <group>
      {model.zoning && model.zoneFills ? zones.map((zone) => (
        <ZoneFill
          key={`${zone.id}-fill`}
          kind={zone.kind}
          points={zone.points}
          color={zone.color}
          active={interaction?.selectedZoneId === zone.id}
        />
      )) : null}
      {model.zoning ? zones.map((zone) => (
        <lineSegments key={zone.id} geometry={zone.geometry} raycast={() => undefined}>
          <lineBasicMaterial color={zone.color} transparent opacity={interaction?.selectedZoneId === zone.id ? 1 : 0.9} />
        </lineSegments>
      )) : null}
      {model.zoning && model.zoneFills && model.zoneCaptions !== false ? zones.map((zone) => (
        zone.name && interaction?.selectedZoneId === zone.id
          ? <ZoneCaption key={`${zone.id}-caption`} name={zone.name} color={zone.color} x={zone.center.x} z={zone.center.z} />
          : null
      )) : null}
      {model.zoning ? <lineSegments geometry={branches} raycast={() => undefined}><lineBasicMaterial color="#49d7de" transparent opacity={0.45} /></lineSegments> : null}
      {model.zoning && link ? <lineSegments geometry={link} raycast={() => undefined}><lineBasicMaterial color="#c77e5f" /></lineSegments> : null}
      {interaction?.onZone ? model.zones.map((zone, index) => {
        const id = zone.id ?? `${zone.kind}-${index}`;
        return <ZonePick key={id} id={id} points={zone.points} onZone={interaction.onZone!} />;
      }) : null}
      {model.zoning ? model.anchors.map((anchor) => (
        <mesh key={anchor.id} position={[anchor.x, 6, anchor.z]} raycast={() => undefined}>
          <sphereGeometry args={[anchor.tested ? 7 : 4.5, 12, 8]} />
          <meshBasicMaterial color={anchor.tested ? "#c77e5f" : "#49d7de"} />
        </mesh>
      )) : null}
      {model.massing && model.wrap ? <CatalogCluster solid={model.wrap} /> : null}
      {showClusters ? model.solids.map((item) => {
        if (interaction?.hiddenIds?.includes(item.id)) return null;
        const ids = interaction?.selectedIds?.length
          ? interaction.selectedIds
          : interaction?.selectedId
            ? [interaction.selectedId]
            : [];
        const picked = ids.includes(item.id);
        const locked = interaction?.lockedIds?.includes(item.id) ?? false;
        return (
          <CatalogCluster
            key={item.id}
            solid={item}
            pickable={Boolean(interaction)}
            selected={picked}
            locked={locked}
            gumballPrimary={item.id === interaction?.selectedId}
            onSelect={interaction?.onSelect}
            gumball={interaction}
          />
        );
      }) : null}
      {model.connections && model.hybrid ? <SolidMesh solid={model.hybrid} /> : null}
      {/* Transparent void after opaque clusters so BOTH keeps the solids readable. */}
      {model.voids.map((item) => (
        <VoidVolume key={`${item.id}-${item.positions.length}-${item.indices.length}`} solid={item} />
      ))}
    </group>
  );
}
