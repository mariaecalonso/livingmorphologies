"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { bakePositions, boundsOf, identityEdit } from "@/lib/interpretation/edits";
import type { ElementEdit } from "@/lib/interpretation/types";

export type ViewPart = {
  id: string;
  positions: Float32Array;
  indices: Uint32Array;
  color: string;
  opacity: number;
  selectable: boolean;
};

export type Orbit = {
  yaw: number;
  pitch: number;
  distance: number;
  home: number;
  look: [number, number, number];
};

type Tool = "orbit" | "move" | "rotate" | "scale";

export function InterpretationView({
  parts,
  selectedId,
  tool,
  orbit,
  interactive,
  floorPlane,
  revision,
  onSelect,
  onOrbit,
  onCommit,
}: {
  parts: readonly ViewPart[];
  selectedId: string | null;
  tool: Tool;
  orbit: Orbit | null;
  interactive: boolean;
  floorPlane: number;
  revision: number;
  onSelect?: (id: string) => void;
  onOrbit?: (orbit: Orbit) => void;
  onCommit?: (id: string, delta: ElementEdit) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<() => void>(() => {});
  const partsRef = useRef(parts);
  const selectedRef = useRef(selectedId);
  const toolRef = useRef(tool);
  const orbitRef = useRef(orbit);
  const selectRef = useRef(onSelect);
  const orbitOutRef = useRef(onOrbit);
  const commitRef = useRef(onCommit);
  partsRef.current = parts;
  selectedRef.current = selectedId;
  toolRef.current = tool;
  orbitRef.current = orbit;
  selectRef.current = onSelect;
  orbitOutRef.current = onOrbit;
  commitRef.current = onCommit;

  const signature = parts.map((part) => `${part.id}:${part.positions.byteLength}:${part.positions[0] ?? 0}:${part.positions[part.positions.length - 1] ?? 0}`).join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    const parts = partsRef.current;
    if (!canvas || parts.length === 0) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 800);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xf2f2f0, 0x1a1a1a, 0.62));
    scene.add(new THREE.AmbientLight(0xffffff, 0.38));
    const key = new THREE.DirectionalLight(0xfff8f2, 1.45);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc77e5f, 0.22);
    scene.add(fill);
    const root = new THREE.Group();
    scene.add(root);
    const ground = new THREE.Group();
    scene.add(ground);

    const meshes: THREE.Mesh[] = [];
    const bases = new Map<string, Float32Array>();
    for (const part of parts) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(part.positions);
      bases.set(part.id, positions);
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(part.indices), 1));
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: part.color,
        roughness: 0.62,
        metalness: 0.02,
        transparent: part.opacity < 1,
        opacity: part.opacity,
        depthWrite: part.opacity >= 0.7,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.id = part.id;
      mesh.userData.selectable = part.selectable;
      if (!part.selectable) mesh.raycast = () => {};
      root.add(mesh);
      meshes.push(mesh);
    }

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    const home = span * 1.22;
    const controls = {
      yaw: orbit?.yaw ?? Math.PI / 4,
      pitch: orbit?.pitch ?? 0.62,
      distance: orbit?.distance ?? home,
      home,
      look: new THREE.Vector3(...(orbit?.look ?? [center.x, center.y, center.z])),
      dragging: false,
      moved: false,
      button: 0,
      startX: 0,
      startY: 0,
      anchor: new THREE.Vector3(),
      down: new THREE.Vector3(),
      delta: identityEdit(),
    };

    const floor = floorPlane;
    const gridSpan = Math.max(size.x, size.y, 12) * 2.2;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(gridSpan, gridSpan),
      new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1, metalness: 0 }),
    );
    plane.position.set(center.x, center.y, floor);
    ground.add(plane);
    const grid = new THREE.GridHelper(gridSpan, 8, 0x24383a, 0x1c1c1c);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(center.x, center.y, floor + 0.04);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.28;
    }
    ground.add(grid);
    key.position.set(center.x + span * 0.22, center.y - span * 0.42, box.max.z + span * 0.55);
    fill.position.set(center.x - span * 0.4, center.y + span * 0.2, box.max.z);

    const placeCamera = () => {
      const shared = orbitRef.current;
      if (shared && !controls.dragging) {
        controls.yaw = shared.yaw;
        controls.pitch = shared.pitch;
        controls.distance = shared.distance;
        controls.look.set(...shared.look);
      }
      const cos = Math.cos(controls.pitch);
      camera.position.set(
        controls.look.x + controls.distance * cos * Math.sin(controls.yaw),
        controls.look.y - controls.distance * cos * Math.cos(controls.yaw),
        controls.look.z + controls.distance * Math.sin(controls.pitch),
      );
      camera.lookAt(controls.look);
    };
    const paint = () => {
      for (const mesh of meshes) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissive.set(mesh.userData.id === selectedRef.current ? 0x123436 : 0x000000);
      }
      placeCamera();
      renderer.render(scene, camera);
    };
    paintRef.current = paint;

    const resize = () => {
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      paint();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    if (!orbit) {
      orbitOutRef.current?.({
        yaw: controls.yaw,
        pitch: controls.pitch,
        distance: controls.distance,
        home,
        look: [controls.look.x, controls.look.y, controls.look.z],
      });
    }

    const publish = () => {
      orbitOutRef.current?.({
        yaw: controls.yaw,
        pitch: controls.pitch,
        distance: controls.distance,
        home: controls.home,
        look: [controls.look.x, controls.look.y, controls.look.z],
      });
    };
    const preview = (id: string, delta: ElementEdit) => {
      const mesh = meshes.find((item) => item.userData.id === id);
      const base = bases.get(id);
      if (!mesh || !base) return;
      const next = bakePositions(base, boundsOf(base).origin, delta);
      const attribute = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      (attribute.array as Float32Array).set(next);
      attribute.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    };
    const planeOf = (z: number) => new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
    const rayPoint = (event: PointerEvent, z: number) => {
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hit = new THREE.Vector3();
      return raycaster.ray.intersectPlane(planeOf(z), hit) ? hit : null;
    };

    const onWheel = (event: WheelEvent) => {
      if (!interactive) return;
      event.preventDefault();
      controls.distance = Math.min(controls.home * 6, Math.max(controls.home * 0.34, controls.distance * Math.exp(event.deltaY * 0.0011)));
      paint();
      publish();
    };
    const onDown = (event: PointerEvent) => {
      if (!interactive) return;
      controls.dragging = true;
      controls.moved = false;
      controls.button = event.button;
      controls.startX = event.clientX;
      controls.startY = event.clientY;
      controls.delta = identityEdit();
      const selected = meshes.find((mesh) => mesh.userData.id === selectedRef.current);
      const base = selected ? bases.get(String(selected.userData.id)) : null;
      if (base) {
        const origin = boundsOf(base).origin;
        controls.anchor.set(...origin);
        const hit = rayPoint(event, origin[2]);
        if (hit) controls.down.copy(hit);
        else controls.down.copy(controls.anchor);
      }
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!interactive || !controls.dragging) return;
      const dx = event.clientX - controls.startX;
      const dy = event.clientY - controls.startY;
      if (Math.hypot(dx, dy) > 2) controls.moved = true;
      const editing = toolRef.current !== "orbit" && controls.button === 0 && !event.altKey && selectedRef.current;
      if (!editing) {
        if (event.shiftKey || controls.button === 1 || controls.button === 2) {
          placeCamera();
          const width = canvas.clientWidth || 1;
          const height = canvas.clientHeight || 1;
          const aspect = width / Math.max(1, height);
          const worldHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * controls.distance;
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
          const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
          const stepX = event.movementX || 0;
          const stepY = event.movementY || 0;
          controls.look.addScaledVector(right, -(stepX / width) * worldHeight * aspect);
          controls.look.addScaledVector(up, (stepY / height) * worldHeight);
        } else {
          controls.yaw -= (event.movementX || 0) * 0.005;
          controls.pitch = Math.min(1.22, Math.max(0.18, controls.pitch + (event.movementY || 0) * 0.004));
        }
        paint();
        publish();
        return;
      }
      const id = selectedRef.current;
      if (!id) return;
      controls.delta = identityEdit();
      if (toolRef.current === "move") {
        if (event.shiftKey) {
          const worldHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * controls.distance;
          controls.delta.translation[2] = -(dy / (canvas.clientHeight || 1)) * worldHeight;
        } else {
          const hit = rayPoint(event, controls.anchor.z);
          if (hit) {
            controls.delta.translation[0] = hit.x - controls.down.x;
            controls.delta.translation[1] = hit.y - controls.down.y;
          }
        }
      } else if (toolRef.current === "rotate") {
        controls.delta.rotation[2] = -dx * 0.35;
      } else {
        const factor = Math.min(4, Math.max(0.2, Math.exp(dx * 0.004)));
        if (event.shiftKey) controls.delta.scale[2] = factor;
        else {
          controls.delta.scale[0] = factor;
          controls.delta.scale[1] = factor;
        }
      }
      preview(id, controls.delta);
      paint();
    };
    const onUp = () => {
      if (!controls.dragging) return;
      controls.dragging = false;
      const id = selectedRef.current;
      const delta = controls.delta;
      const changed = delta.translation.some((value) => Math.abs(value) > 1e-4)
        || delta.rotation.some((value) => Math.abs(value) > 1e-4)
        || delta.scale.some((value) => Math.abs(value - 1) > 1e-4);
      if (id && changed && controls.moved) commitRef.current?.(id, { ...delta, translation: [...delta.translation], rotation: [...delta.rotation], scale: [...delta.scale] });
    };
    const onClick = (event: MouseEvent) => {
      if (!interactive || controls.moved) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes, false).find((item) => item.object.userData.selectable);
      const id = hit?.object.userData.id;
      if (typeof id === "string") selectRef.current?.(id);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);
    canvas.addEventListener("contextmenu", prevent);
    canvas.addEventListener("click", onClick);
    function prevent(event: Event) {
      event.preventDefault();
    }

    return () => {
      paintRef.current = () => {};
      observer.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onUp);
      canvas.removeEventListener("contextmenu", prevent);
      canvas.removeEventListener("click", onClick);
      renderer.dispose();
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (!Array.isArray(material)) material?.dispose();
      });
      ground.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
    };
  }, [signature, interactive, floorPlane, revision]);

  useEffect(() => {
    paintRef.current();
  }, [selectedId, orbit, tool]);

  return <canvas ref={canvasRef} />;
}
