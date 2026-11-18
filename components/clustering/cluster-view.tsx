"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { sourcePointToSkill6, type ClusterTile, type ContactRelation, type Skill6Pose } from "@/lib/skill6/contract";
import type { EncodedSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
import { decodeSolidifiedMesh } from "@/lib/skill3/solidified-mesh";

export type ViewArchetype = {
  archetypeId: string;
  candidateId: number;
  continuationId: string;
  typologyId: string;
};

const COLOR: Record<string, string> = {
  lobby: "#49d7de",
  workspace: "#7eb8c4",
  gathering: "#c77e5f",
};

/** Lobby terracotta, workspace white, gathering cyan. Same tokens as the morphology drawings and hybrid modules. */
const INTERFACE_COLOR: Record<string, string> = {
  lobby: "#c77e5f",
  workspace: "#f2f2ee",
  gathering: "#7db8b8",
};

const geometries = new Map<string, Promise<THREE.BufferGeometry>>();

function geometryFor(archetype: ViewArchetype): Promise<THREE.BufferGeometry> {
  const cached = geometries.get(archetype.archetypeId);
  if (cached) return cached;
  const pending = fetch(`/api/vertical/solidified?archetype=${encodeURIComponent(archetype.archetypeId)}&candidate=${archetype.candidateId}&continuation=${encodeURIComponent(archetype.continuationId)}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(archetype.archetypeId);
      const body = await response.json() as { geometry?: EncodedSolidifiedMesh };
      if (!body.geometry) throw new Error(archetype.archetypeId);
      const mesh = decodeSolidifiedMesh(body.geometry);
      const positions = new Float32Array(mesh.positions.length);
      const normals = new Float32Array(mesh.normals.length);
      for (let index = 0; index < mesh.positions.length; index += 3) {
        const point = sourcePointToSkill6(mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]);
        const normal = sourcePointToSkill6(mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2]);
        positions[index] = point[0];
        positions[index + 1] = point[1];
        positions[index + 2] = point[2];
        normals[index] = normal[0];
        normals[index + 1] = normal[1];
        normals[index + 2] = normal[2];
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      geometry.computeBoundingBox();
      return geometry;
    });
  geometries.set(archetype.archetypeId, pending);
  return pending;
}

export type EncodedAssemblyMesh = { positions: string; indices: string; triangles: number };

export type ViewExtra = { id: string; geometry: THREE.BufferGeometry; color: string };

/** Stored assembly mesh, already in Skill 6 coordinates and seated on Z = 0. */
export function assemblyGeometry(encoded: EncodedAssemblyMesh): THREE.BufferGeometry {
  const bytes = (value: string) => {
    const raw = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return copy.buffer;
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bytes(encoded.positions)), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(bytes(encoded.indices)), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function poseMatrix(pose: Skill6Pose) {
  const basis = pose.basis;
  const matrix = new THREE.Matrix4();
  matrix.set(
    basis[0], basis[3], basis[6], pose.translation[0],
    basis[1], basis[4], basis[7], pose.translation[1],
    basis[2], basis[5], basis[8], pose.translation[2],
    0, 0, 0, 1,
  );
  return matrix;
}

export function ClusterView({
  tiles,
  archetypes,
  contacts,
  showContacts = false,
  selectedId,
  interactive,
  onSelect,
  marker,
  extras,
  shownExtras,
  hideTiles = false,
  floorZ,
  syncGroup,
  fixedSpan,
  onSpan,
  ink = "typology",
  presentation = false,
  tones = "lab",
}: {
  tiles: readonly ClusterTile[];
  archetypes: readonly ViewArchetype[];
  contacts?: readonly ContactRelation[];
  showContacts?: boolean;
  selectedId: string | null;
  interactive: boolean;
  onSelect?: (instanceId: string) => void;
  marker?: string;
  /** Patches or a union solid drawn with the tiles, shaded like the tiles. */
  extras?: readonly ViewExtra[];
  /** Ids of the extras to draw. Switching keeps the camera where it is. */
  shownExtras?: readonly string[];
  hideTiles?: boolean;
  /** A seated assembly sits on this plane. Otherwise the floor sits just under the lowest tile. */
  floorZ?: number;
  /** Views with the same group share orbit and zoom. Pan stays local. */
  syncGroup?: string;
  /** Frame every view in a group to this span so the clusters read at one scale. */
  fixedSpan?: number;
  /** Largest extent of the drawn cluster, reported once it loads. */
  onSpan?: (span: number) => void;
  /** Fit Tiles can be drawn as one white body. The assembly reading keeps typology color. */
  ink?: "typology" | "white";
  /** Softer, brighter light for the main architectural solid. */
  presentation?: boolean;
  /** The assembly reading uses the interface typology colors. Fit Tiles keeps the lab tones. */
  tones?: "lab" | "interface";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  const contactsRef = useRef(contacts);
  const showContactsRef = useRef(showContacts);
  const shownRef = useRef(shownExtras);
  const hideTilesRef = useRef(hideTiles);
  const syncRef = useRef(syncGroup);
  const spanRef = useRef(onSpan);
  syncRef.current = syncGroup;
  spanRef.current = onSpan;
  shownRef.current = shownExtras;
  hideTilesRef.current = hideTiles;
  selectRef.current = onSelect;
  selectedRef.current = selectedId;
  contactsRef.current = contacts;
  showContactsRef.current = showContacts;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tiles.length === 0) return;
    let renderer: THREE.WebGLRenderer | null = null;
    let size = { width: 1, height: 1 };
    /** The stage keeps one live context. A card draws offscreen, keeps the frame as its background, and releases the context. */
    const open = () => {
      if (renderer) return renderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas: interactive ? canvas : document.createElement("canvas"), antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: !interactive });
      } catch {
        return null;
      }
      renderer.setClearColor(0x000000, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, interactive ? 1.5 : 1));
      if (interactive) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      renderer.setSize(size.width, size.height, false);
      return renderer;
    };
    if (interactive) open();
    let redraw: (() => void) | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 800);
    const hemi = new THREE.HemisphereLight(0xf2f2f0, 0x1a1a1a, presentation ? 0.62 : 0.28);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight(0xffffff, presentation ? 0.38 : 0.04));
    const key = new THREE.DirectionalLight(0xfff8f2, presentation ? 1.65 : 3.2);
    key.castShadow = interactive;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    scene.add(key);
    scene.add(key.target);
    const fill = new THREE.DirectionalLight(0xc77e5f, presentation ? 0.28 : 0.22);
    scene.add(fill);
    const root = new THREE.Group();
    scene.add(root);
    const ground = new THREE.Group();
    scene.add(ground);
    const marks = new THREE.Group();
    scene.add(marks);
    let disposed = false;
    let detach = () => {};
    const controls = { yaw: Math.PI / 4, pitch: 0.62, distance: 48, homeDistance: 48, dragging: false, moved: false, button: 0, x: 0, y: 0 };

    const resize = () => {
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      size = { width, height };
      renderer?.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      redraw?.();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const fit = (box: THREE.Box3) => {
      const size = box.getSize(new THREE.Vector3());
      const span = fixedSpan ?? Math.max(size.x, size.y, size.z, 1);
      controls.homeDistance = span * (presentation ? 1.62 : 1.85);
      controls.distance = controls.homeDistance;
      controls.yaw = Math.PI / 4;
      controls.pitch = 0.62;
    };

    const seatGround = (box: THREE.Box3) => {
      ground.clear();
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.y, 12) * 2.4;
      const center = box.getCenter(new THREE.Vector3());
      const floor = floorZ ?? box.min.z - Math.max(0.35, size.z * 0.02);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(span, span),
        new THREE.MeshStandardMaterial({ color: presentation ? 0x141414 : 0x0a0a0a, roughness: 1, metalness: 0 }),
      );
      plane.position.set(center.x, center.y, floor);
      plane.receiveShadow = true;
      ground.add(plane);
      const grid = new THREE.GridHelper(span, 8, 0x24383a, 0x1c1c1c);
      grid.rotation.x = Math.PI / 2;
      grid.position.set(center.x, center.y, floor + Math.max(0.04, span * 0.001));
      const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
      for (const material of gridMaterials) {
        material.transparent = true;
        material.opacity = 0.28;
      }
      ground.add(grid);
      const arm = Math.min(span * 0.1, Math.max(size.x, size.y) * 0.28);
      const thickness = Math.max(0.06, span * 0.0014);
      const originX = box.min.x - arm * 0.2;
      const originY = box.min.y - arm * 0.2;
      const bar = (width: number, depth: number, height: number, color: number, x: number, y: number, z: number) => {
        const mark = new THREE.Mesh(
          new THREE.BoxGeometry(width, depth, height),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32 }),
        );
        mark.position.set(x, y, z);
        ground.add(mark);
      };
      bar(arm, thickness, thickness, 0x9a9a9a, originX + arm / 2, originY, floor + thickness * 0.5);
      bar(thickness, arm, thickness, 0x6e6e6e, originX, originY + arm / 2, floor + thickness * 0.5);
      bar(thickness, thickness, arm * 0.7, 0x2f6d70, originX, originY, floor + arm * 0.35);
      key.position.set(center.x + span * 0.22, center.y - span * 0.42, box.max.z + span * 0.55);
      key.target.position.set(center.x, center.y, center.z);
      key.target.updateMatrixWorld();
      const shadow = key.shadow.camera;
      shadow.near = 0.5;
      shadow.far = span * 4;
      shadow.left = -span * 0.55;
      shadow.right = span * 0.55;
      shadow.top = span * 0.55;
      shadow.bottom = -span * 0.55;
      shadow.updateProjectionMatrix();
      fill.position.set(center.x - span * 0.4, center.y + span * 0.2, box.max.z);
    };

    const placeCamera = (look: THREE.Vector3) => {
      const cos = Math.cos(controls.pitch);
      camera.position.set(
        look.x + controls.distance * cos * Math.sin(controls.yaw),
        look.y - controls.distance * cos * Math.cos(controls.yaw),
        look.z + controls.distance * Math.sin(controls.pitch),
      );
      camera.up.set(0, 0, 1);
      camera.lookAt(look);
    };

    const lookup = new Map(archetypes.map((item) => [item.archetypeId, item]));
    const meshes: THREE.Mesh[] = [];
    void Promise.all(tiles.map(async (tile) => {
      const source = lookup.get(tile.archetypeId);
      if (!source) return null;
      const geometry = await geometryFor(source);
      if (disposed) return null;
      const material = new THREE.MeshStandardMaterial({
        color: ink === "white" ? "#f4f4f4" : ((tones === "interface" ? INTERFACE_COLOR : COLOR)[tile.typologyId] ?? "#ffffff"),
        roughness: 0.62,
        metalness: 0.02,
        side: THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = interactive;
      mesh.receiveShadow = interactive;
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(poseMatrix(tile.pose));
      mesh.userData.instanceId = tile.instanceId;
      root.add(mesh);
      meshes.push(mesh);
      return mesh;
    })).then(() => {
      if (disposed) return;
      const extraMeshes: THREE.Mesh[] = [];
      for (const extra of extras ?? []) {
        const solid = new THREE.Mesh(extra.geometry, new THREE.MeshStandardMaterial({ color: extra.color, roughness: 0.62, metalness: 0.02 }));
        solid.castShadow = interactive;
        solid.receiveShadow = interactive;
        solid.userData.extraId = extra.id;
        root.add(solid);
        extraMeshes.push(solid);
      }
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const home = box.getCenter(new THREE.Vector3());
      const look = home.clone();
      seatGround(box);
      fit(box);
      const extent = box.getSize(new THREE.Vector3());
      spanRef.current?.(Math.max(extent.x, extent.y, extent.z, 1));
      const paintContacts = () => {
        while (marks.children.length > 0) {
          const child = marks.children.pop();
          if (!child) break;
          const line = child as THREE.LineSegments;
          line.geometry?.dispose();
          const material = line.material;
          if (!Array.isArray(material)) material?.dispose();
        }
        if (!showContactsRef.current) return;
        const gaps: number[] = [];
        const normals: number[] = [];
        const rejected: number[] = [];
        const mark = 4.5;
        for (const contact of contactsRef.current ?? []) {
          const origin = contact.samples[0]?.host;
          const guest = contact.samples[0]?.guest;
          if (origin && guest) {
            const mid = [(origin[0] + guest[0]) / 2, (origin[1] + guest[1]) / 2, (origin[2] + guest[2]) / 2];
            gaps.push(
              mid[0] - contact.hostNormal[0] * mark, mid[1] - contact.hostNormal[1] * mark, mid[2] - contact.hostNormal[2] * mark,
              mid[0] + contact.hostNormal[0] * mark, mid[1] + contact.hostNormal[1] * mark, mid[2] + contact.hostNormal[2] * mark,
            );
            normals.push(
              origin[0], origin[1], origin[2],
              origin[0] + contact.hostNormal[0] * mark, origin[1] + contact.hostNormal[1] * mark, origin[2] + contact.hostNormal[2] * mark,
              guest[0], guest[1], guest[2],
              guest[0] + contact.guestNormal[0] * mark, guest[1] + contact.guestNormal[1] * mark, guest[2] + contact.guestNormal[2] * mark,
            );
          }
          for (const candidate of contact.rejected) {
            rejected.push(
              candidate.point[0], candidate.point[1], candidate.point[2],
              candidate.point[0] + candidate.normal[0] * mark * 0.65, candidate.point[1] + candidate.normal[1] * mark * 0.65, candidate.point[2] + candidate.normal[2] * mark * 0.65,
            );
          }
        }
        const addLines = (values: number[], color: number, opacity: number) => {
          if (values.length < 6) return;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(values), 3));
          const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
          const lines = new THREE.LineSegments(geometry, material);
          lines.renderOrder = 2;
          marks.add(lines);
        };
        addLines(gaps, 0x49d7de, 0.9);
        addLines(normals, 0xd8d8d8, 0.7);
        addLines(rejected, 0xc77e5f, 0.45);
      };
      const draw = () => {
        if (disposed) return;
        for (const mesh of meshes) {
          const lit = mesh.userData.instanceId === selectedRef.current;
          const material = mesh.material as THREE.MeshStandardMaterial;
          material.emissive.set(lit ? 0x123436 : 0x000000);
          mesh.visible = !hideTilesRef.current;
        }
        for (const mesh of extraMeshes) mesh.visible = shownRef.current?.includes(mesh.userData.extraId) ?? false;
        paintContacts();
        placeCamera(look);
        const active = open();
        if (!active) return;
        active.render(scene, camera);
        if (interactive) return;
        canvas.style.backgroundImage = `url(${active.domElement.toDataURL()})`;
        canvas.style.backgroundSize = "100% 100%";
        active.forceContextLoss();
        active.dispose();
        renderer = null;
      };
      redraw = draw;
      draw();
      const onDraw = () => draw();
      const onFit = () => {
        look.copy(home);
        fit(box);
        draw();
      };
      canvas.addEventListener("lm-cluster-draw", onDraw);
      canvas.addEventListener("lm-cluster-fit", onFit);
      if (!interactive) {
        detach = () => {
          canvas.removeEventListener("lm-cluster-draw", onDraw);
          canvas.removeEventListener("lm-cluster-fit", onFit);
        };
        return;
      }
      const share = () => {
        if (!syncRef.current) return;
        window.dispatchEvent(new CustomEvent("lm-cluster-camera", {
          detail: { group: syncRef.current, source: canvas, yaw: controls.yaw, pitch: controls.pitch, ratio: controls.distance / controls.homeDistance },
        }));
      };
      const onShared = (event: Event) => {
        const detail = (event as CustomEvent<{ group: string; source: HTMLCanvasElement; yaw: number; pitch: number; ratio: number }>).detail;
        if (!detail || detail.source === canvas || detail.group !== syncRef.current) return;
        controls.yaw = detail.yaw;
        controls.pitch = detail.pitch;
        controls.distance = controls.homeDistance * detail.ratio;
        draw();
      };
      window.addEventListener("lm-cluster-camera", onShared);
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const homeDistance = controls.homeDistance;
        controls.distance = Math.min(homeDistance * 6, Math.max(homeDistance * 0.34, controls.distance * Math.exp(event.deltaY * 0.0011)));
        draw();
        share();
      };
      const onDown = (event: PointerEvent) => {
        controls.dragging = true;
        controls.moved = false;
        controls.button = event.button;
        controls.x = event.clientX;
        controls.y = event.clientY;
        canvas.setPointerCapture(event.pointerId);
      };
      const onMove = (event: PointerEvent) => {
        if (!controls.dragging) return;
        const dx = event.clientX - controls.x;
        const dy = event.clientY - controls.y;
        if (Math.hypot(dx, dy) > 3) controls.moved = true;
        controls.x = event.clientX;
        controls.y = event.clientY;
        if (event.shiftKey || controls.button === 1 || controls.button === 2) {
          placeCamera(look);
          const width = canvas.clientWidth || 1;
          const height = canvas.clientHeight || 1;
          const aspect = width / Math.max(1, height);
          const worldHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * controls.distance;
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
          const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
          look.addScaledVector(right, -(dx / width) * worldHeight * aspect);
          look.addScaledVector(up, (dy / height) * worldHeight);
        } else {
          controls.yaw -= dx * 0.005;
          controls.pitch = Math.min(1.22, Math.max(0.18, controls.pitch + dy * 0.004));
        }
        draw();
        share();
      };
      const onUp = () => {
        controls.dragging = false;
      };
      const onClick = (event: MouseEvent) => {
        if (controls.moved) return;
        const rect = canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(meshes, false)[0];
        const instanceId = hit?.object.userData.instanceId;
        if (typeof instanceId === "string") selectRef.current?.(instanceId);
      };
      const onMenu = (event: Event) => event.preventDefault();
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("contextmenu", onMenu);
      canvas.addEventListener("click", onClick);
      detach = () => {
        window.removeEventListener("lm-cluster-camera", onShared);
        canvas.removeEventListener("lm-cluster-draw", onDraw);
        canvas.removeEventListener("lm-cluster-fit", onFit);
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("contextmenu", onMenu);
        canvas.removeEventListener("click", onClick);
      };
    }).catch(() => undefined);

    return () => {
      disposed = true;
      detach();
      observer.disconnect();
      ground.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      renderer?.dispose();
      root.clear();
      ground.clear();
      marks.traverse((node) => {
        const line = node as THREE.LineSegments;
        line.geometry?.dispose();
      });
      marks.clear();
    };
  }, [tiles, archetypes, interactive, extras, floorZ, fixedSpan, ink, presentation, tones]);

  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event("lm-cluster-draw"));
  }, [selectedId, showContacts, contacts, shownExtras, hideTiles]);

  return <canvas ref={canvasRef} className="cluster-canvas" data-cluster-view={marker} />;
}
