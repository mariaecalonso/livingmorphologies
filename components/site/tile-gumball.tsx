"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { DoubleSide, Group, Plane, Raycaster, Vector2, Vector3, type OrthographicCamera } from "three";
import type { GumballPose } from "@/lib/skill5/gumball";
import { worldToStored } from "@/lib/skill5/render-frame";

type Axis = "x" | "y" | "z";
type Handle =
  | "mx" | "my" | "mz"
  | "pxy" | "pyz" | "pzx"
  | "rx" | "ry" | "rz"
  | "sx" | "sy" | "sz"
  | "su";

const AXIS: Record<Axis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

const COLOR = { x: "#c77e5f", y: "#49d7de", z: "#d7dde2", u: "#f4f1ea" };

function shown(view: "perspective" | "plan" | "axon" | "section", handle: Handle) {
  if (view === "perspective" || view === "axon") return true;
  if (view === "plan") return ["mx", "mz", "pzx", "ry", "sx", "sz", "su"].includes(handle);
  return ["mx", "my", "pxy", "rz", "sx", "sy", "su"].includes(handle);
}

function snapValue(value: number, step: number, enabled: boolean) {
  if (!enabled) return value;
  return Math.round(value / step) * step;
}

export function TileGumball({
  pose,
  snap,
  view,
  onChange,
  onCommit,
}: {
  pose: GumballPose;
  snap: boolean;
  view: "perspective" | "plan" | "axon" | "section";
  onChange: (pose: GumballPose) => void;
  onCommit: (pose: GumballPose) => void;
}) {
  const { camera, gl } = useThree();
  const root = useRef<Group>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const drag = useRef<{
    handle: Handle;
    axis: Axis;
    start: Vector3;
    origin: Vector3;
    pose: GumballPose;
    pointerId: number;
  } | null>(null);

  useFrame(() => {
    const group = root.current;
    if (!group) return;
    const origin = new Vector3();
    group.getWorldPosition(origin);
    let span = 40;
    if ((camera as OrthographicCamera).isOrthographicCamera) {
      const ortho = camera as OrthographicCamera;
      span = (ortho.top - ortho.bottom) / Math.max(0.001, ortho.zoom);
    } else {
      const distance = Math.max(1, camera.position.distanceTo(origin));
      const fov = "fov" in camera ? camera.fov : 42;
      span = 2 * Math.tan((fov * Math.PI) / 360) * distance;
    }
    const size = Math.max(8, span * 0.16);
    group.scale.setScalar(size / 28);
  });

  const ray = (event: PointerEvent) => {
    const rect = gl.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray;
  };

  const axisWorld = (axis: Axis) => {
    const direction = AXIS[axis].clone();
    root.current?.updateWorldMatrix(true, false);
    return direction.transformDirection(root.current?.matrixWorld ?? direction).normalize();
  };

  const hitOn = (event: PointerEvent, normal: Vector3, origin: Vector3) => {
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const hit = new Vector3();
    return ray(event).intersectPlane(plane, hit) ? hit : null;
  };

  const start = (handle: Handle, axis: Axis, event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const origin = new Vector3();
    root.current?.getWorldPosition(origin);
    const viewDirection = new Vector3();
    camera.getWorldDirection(viewDirection);
    const direction = axisWorld(axis);
    let normal = new Vector3().crossVectors(direction, viewDirection).cross(direction);
    if (normal.lengthSq() < 1e-6) normal = new Vector3(0, 1, 0);
    if (handle.startsWith("r")) normal = direction.clone();
    if (handle === "su") normal = viewDirection.clone();
    if (handle === "pxy") normal = axisWorld("z");
    if (handle === "pyz") normal = axisWorld("x");
    if (handle === "pzx") normal = axisWorld("y");
    const point = hitOn(event.nativeEvent, normal.normalize(), origin) ?? origin.clone();
    const basis = (["x", "y", "z"] as const).map((name) => {
      const world = AXIS[name].clone().transformDirection(root.current?.matrixWorld ?? new Vector3()).normalize();
      return new Vector3(world.x, world.y, -world.z).normalize();
    });
    const storedBasis = { x: basis[0], y: basis[1], z: basis[2] };
    drag.current = { handle, axis, start: point, origin, pose: { ...poseRef.current }, pointerId: event.pointerId };
    const move = (native: PointerEvent) => {
      const active = drag.current;
      if (!active || native.pointerId !== active.pointerId) return;
      const nextHit = hitOn(native, normal, active.origin);
      if (!nextHit) return;
      const next = applyDrag(active.handle, active.axis, active.pose, active.origin, active.start, nextHit, storedBasis, snap);
      poseRef.current = next;
      onChange(next);
    };
    const end = (native: PointerEvent) => {
      if (native.pointerId !== event.pointerId) return;
      gl.domElement.removeEventListener("pointermove", move);
      gl.domElement.removeEventListener("pointerup", end);
      drag.current = null;
      onCommit(poseRef.current);
    };
    gl.domElement.addEventListener("pointermove", move);
    gl.domElement.addEventListener("pointerup", end);
  };

  return (
    <group ref={root} renderOrder={20}>
      {shown(view, "mx") ? <Arrow axis="x" color={COLOR.x} onDown={(event) => start("mx", "x", event)} /> : null}
      {shown(view, "my") ? <Arrow axis="y" color={COLOR.y} onDown={(event) => start("my", "y", event)} /> : null}
      {shown(view, "mz") ? <Arrow axis="z" color={COLOR.z} onDown={(event) => start("mz", "z", event)} /> : null}
      {shown(view, "pxy") ? <PlaneHandle axis="z" color={COLOR.z} onDown={(event) => start("pxy", "z", event)} /> : null}
      {shown(view, "pyz") ? <PlaneHandle axis="x" color={COLOR.x} onDown={(event) => start("pyz", "x", event)} /> : null}
      {shown(view, "pzx") ? <PlaneHandle axis="y" color={COLOR.y} onDown={(event) => start("pzx", "y", event)} /> : null}
      {shown(view, "rx") ? <Ring axis="x" color={COLOR.x} onDown={(event) => start("rx", "x", event)} /> : null}
      {shown(view, "ry") ? <Ring axis="y" color={COLOR.y} onDown={(event) => start("ry", "y", event)} /> : null}
      {shown(view, "rz") ? <Ring axis="z" color={COLOR.z} onDown={(event) => start("rz", "z", event)} /> : null}
      {shown(view, "sx") ? <ScaleBox axis="x" color={COLOR.x} onDown={(event) => start("sx", "x", event)} /> : null}
      {shown(view, "sy") ? <ScaleBox axis="y" color={COLOR.y} onDown={(event) => start("sy", "y", event)} /> : null}
      {shown(view, "sz") ? <ScaleBox axis="z" color={COLOR.z} onDown={(event) => start("sz", "z", event)} /> : null}
      {shown(view, "su") ? <UniformHandle onDown={(event) => start("su", "y", event)} /> : null}
    </group>
  );
}

function storedPoint(point: Vector3) {
  const stored = worldToStored(point.x, point.y, point.z);
  return new Vector3(stored.x, stored.y, stored.z);
}

function applyDrag(
  handle: Handle,
  axis: Axis,
  startPose: GumballPose,
  origin: Vector3,
  start: Vector3,
  hit: Vector3,
  basis: Record<Axis, Vector3>,
  snap: boolean,
): GumballPose {
  const next = { ...startPose };
  const pivot = storedPoint(origin);
  const from = storedPoint(start).sub(pivot);
  const to = storedPoint(hit).sub(pivot);
  const direction = basis[axis];
  const along = (point: Vector3) => point.dot(direction);
  const place = (shift: Vector3) => {
    next.x = snapValue(startPose.x + shift.x, 1, snap);
    next.y = snapValue(startPose.y + shift.y, 1, snap);
    next.z = snapValue(startPose.z + shift.z, 1, snap);
  };
  if (handle === "mx" || handle === "my" || handle === "mz") {
    place(direction.clone().multiplyScalar(along(to) - along(from)));
    return next;
  }
  if (handle === "pxy" || handle === "pyz" || handle === "pzx") {
    const delta = to.clone().sub(from);
    const first: Axis = handle === "pyz" ? "y" : "x";
    const second: Axis = handle === "pxy" ? "y" : "z";
    const shift = basis[first].clone().multiplyScalar(delta.dot(basis[first])).add(basis[second].clone().multiplyScalar(delta.dot(basis[second])));
    place(shift);
    return next;
  }
  if (handle === "rx" || handle === "ry" || handle === "rz") {
    if (from.lengthSq() < 1e-4 || to.lengthSq() < 1e-4) return next;
    const cross = new Vector3().crossVectors(from, to);
    const angle = Math.atan2(cross.dot(direction), from.dot(to));
    const key = axis === "x" ? "rotationX" : axis === "y" ? "rotationY" : "rotationZ";
    const turns = startPose[key] + (axis === "y" ? -angle : angle);
    next[key] = snapValue(turns, Math.PI / 12, snap);
    return next;
  }
  const factor = handle === "su"
    ? Math.min(20, Math.max(0.05, to.length() / Math.max(0.5, from.length())))
    : Math.min(20, Math.max(0.05, Math.abs(along(to)) / Math.max(0.5, Math.abs(along(from)))));
  if (handle === "su") {
    const uniform = snapValue(startPose.scaleX * factor, 0.1, snap);
    next.scaleX = uniform;
    next.scaleY = uniform;
    next.scaleZ = uniform;
    return next;
  }
  const key = axis === "x" ? "scaleX" : axis === "y" ? "scaleY" : "scaleZ";
  next[key] = snapValue(startPose[key] * factor, 0.1, snap);
  return next;
}

function stop(event: ThreeEvent<PointerEvent>) {
  event.stopPropagation();
}

function Arrow({ axis, color, onDown }: { axis: Axis; color: string; onDown: (event: ThreeEvent<PointerEvent>) => void }) {
  const rotation: [number, number, number] = axis === "x" ? [0, 0, -Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <group rotation={rotation} onPointerDown={onDown} onPointerMove={stop} onClick={stop}>
      <mesh position={[0, 11, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 18, 12]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </mesh>
      <mesh position={[0, 21, 0]}>
        <coneGeometry args={[1.3, 3.4, 16]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  );
}

function PlaneHandle({ axis, color, onDown }: { axis: Axis; color: string; onDown: (event: ThreeEvent<PointerEvent>) => void }) {
  const rotation: [number, number, number] = axis === "y" ? [-Math.PI / 2, 0, 0] : axis === "x" ? [0, Math.PI / 2, 0] : [0, 0, 0];
  const position: [number, number, number] = axis === "y" ? [6, 0, 6] : axis === "x" ? [0, 6, 6] : [6, 6, 0];
  return (
    <mesh position={position} rotation={rotation} onPointerDown={onDown} onPointerMove={stop} onClick={stop}>
      <planeGeometry args={[5, 5]} />
      <meshBasicMaterial color={color} side={DoubleSide} transparent opacity={0.35} depthTest={false} />
    </mesh>
  );
}

function Ring({ axis, color, onDown }: { axis: Axis; color: string; onDown: (event: ThreeEvent<PointerEvent>) => void }) {
  const rotation: [number, number, number] = axis === "y" ? [-Math.PI / 2, 0, 0] : axis === "x" ? [0, 0, Math.PI / 2] : [0, 0, 0];
  return (
    <mesh rotation={rotation} onPointerDown={onDown} onPointerMove={stop} onClick={stop}>
      <torusGeometry args={[16, 0.38, 8, 48]} />
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
    </mesh>
  );
}

function ScaleBox({ axis, color, onDown }: { axis: Axis; color: string; onDown: (event: ThreeEvent<PointerEvent>) => void }) {
  const position: [number, number, number] = axis === "x" ? [24, 0, 0] : axis === "y" ? [0, 24, 0] : [0, 0, 24];
  return (
    <mesh position={position} onPointerDown={onDown} onPointerMove={stop} onClick={stop}>
      <boxGeometry args={[2.2, 2.2, 2.2]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  );
}

function UniformHandle({ onDown }: { onDown: (event: ThreeEvent<PointerEvent>) => void }) {
  return (
    <mesh position={[8, 8, 8]} onPointerDown={onDown} onPointerMove={stop} onClick={stop}>
      <octahedronGeometry args={[1.7, 0]} />
      <meshBasicMaterial color={COLOR.u} depthTest={false} />
    </mesh>
  );
}
