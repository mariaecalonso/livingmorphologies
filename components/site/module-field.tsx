"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  BoxGeometry,
  Line,
  LineBasicMaterial,
  MeshLambertMaterial,
  Raycaster,
  Vector2,
} from "three";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { BridgeCloud } from "@/lib/skill5/mock-bridge";
import type { WorldAnnotation } from "@/lib/skill5/annotations";
import { MODULE_GROUND_Y, NOMINAL_PLAN_EXTENT, boundsOf, extentCorners, pointInRing, settleMove, snapModuleOrigin, type ModuleWarning, type PlanExtent, type PlacedModule } from "@/lib/skill5/placement";
import { worldToStored } from "@/lib/skill5/render-frame";
import type { XZ } from "@/lib/skill5/site-model";

export type SitePlacementModel = {
  ring: readonly XZ[];
  armedModuleId: string | null;
  canPlace: boolean;
  meshes: Record<string, IsoMesh>;
  instances: PlacedModule[];
  selectedId: string | null;
  snap: boolean;
  showEnvelope: boolean;
  display: "original" | "archetypes" | "connectors" | "both" | "boxes";
  displayShift: Record<string, { x: number; z: number }>;
  links: { id: string; ax: number; az: number; bx: number; bz: number }[];
  previewParts: { moduleId: string; x: number; y: number; z: number; rotationY: number }[] | null;
  previewBridge: BridgeCloud | null;
  demonstration: { placementId: string; x: number; z: number; rotationY: number; cloud: BridgeCloud }[];
  tool: "move" | "rotate" | "entrance" | "circulation";
  warnings: Record<string, ModuleWarning>;
  annotations: WorldAnnotation[];
  onPlace: (x: number, z: number) => void;
  onAnnotate: (x: number, z: number) => void;
  onSelect: (id: string | null) => void;
  onTranslate: (id: string, x: number, z: number) => void;
  onRotate: (id: string, rotationY: number) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  memberEditId: string | null;
  viewMode: "perspective" | "plan" | "axon";
};

export type DragPose = {
  id: string;
  assemblyId: string | null;
  isolate: boolean;
  originX: number;
  originZ: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
};

type Drag = {
  id: string;
  assemblyId: string | null;
  isolate: boolean;
  mode: "move" | "rotate";
  offsetX: number;
  offsetZ: number;
  yaw: number;
  startX: number;
  startZ: number;
  originX: number;
  originZ: number;
  x: number;
  z: number;
  moved: boolean;
  pointerId: number;
};

const MARK_Y = 0.55;

function geometryFromIso(mesh: IsoMesh) {
  const source = mesh.positions;
  const positions = new Float32Array(source.length);
  let minY = Infinity;
  for (let index = 0; index < source.length; index += 3) {
    positions[index] = source[index];
    positions[index + 1] = source[index + 2];
    positions[index + 2] = source[index + 1];
    if (positions[index + 1] < minY) minY = positions[index + 1];
  }
  if (Number.isFinite(minY)) {
    for (let index = 1; index < positions.length; index += 3) positions[index] -= minY;
  }
  const indices = new Uint32Array(mesh.indices);
  for (let index = 0; index < indices.length; index += 3) {
    const swap = indices[index + 1];
    indices[index + 1] = indices[index + 2];
    indices[index + 2] = swap;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function groundPoint(event: { ray: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } } }) {
  const { origin, direction } = event.ray;
  if (Math.abs(direction.y) < 1e-6) return null;
  const distance = (MODULE_GROUND_Y - origin.y) / direction.y;
  if (distance < 0) return null;
  const hit = worldToStored(origin.x + direction.x * distance, MODULE_GROUND_Y, origin.z + direction.z * distance);
  return { x: hit.x, z: hit.z };
}

function placementPoint(event: { ray: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } } }, ring: readonly XZ[], snap: boolean) {
  const hit = groundPoint(event);
  if (!hit || !pointInRing(hit.x, hit.z, ring)) return null;
  const next = snap ? snapModuleOrigin(hit.x, hit.z) : hit;
  if (!pointInRing(next.x, next.z, ring)) return null;
  return next;
}

export function useModulePointer(model: SitePlacementModel | null) {
  const drag = useRef<Drag | null>(null);
  const moved = useRef(false);
  const modelRef = useRef(model);
  const { camera, gl } = useThree();
  const cameraRef = useRef(camera);
  const glRef = useRef(gl);
  const raycaster = useRef(new Raycaster());
  const pointer = useRef(new Vector2());
  const [preview, setPreview] = useState<{ id: string; x: number; z: number } | null>(null);
  const [pose, setPose] = useState<DragPose | null>(null);
  const finishRef = useRef<() => void>(() => {});
  useEffect(() => {
    modelRef.current = model;
    cameraRef.current = camera;
    glRef.current = gl;
  });

  const hidePreview = () => {
    setPreview((current) => current === null ? current : null);
  };

  const showPreview = (x: number, z: number) => {
    const id = model?.armedModuleId ?? (model?.previewParts ? "assembly" : null);
    if (!id) return;
    setPreview((current) => current && current.id === id && current.x === x && current.z === z ? current : { id, x, z });
  };

  const hitFromClient = (clientX: number, clientY: number) => {
    const element = glRef.current.domElement;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    pointer.current.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.current.setFromCamera(pointer.current, cameraRef.current);
    return groundPoint(raycaster.current);
  };

  const showDrag = (active: Drag) => {
    setPose({
      id: active.id,
      assemblyId: active.assemblyId,
      isolate: active.isolate,
      originX: active.originX,
      originZ: active.originZ,
      x: active.x,
      z: active.z,
      y: MODULE_GROUND_Y,
      yaw: active.yaw,
    });
  };

  const beginDrag = (next: Drag) => {
    moved.current = false;
    drag.current = next;
    modelRef.current?.onGestureStart();
    glRef.current.domElement.style.cursor = "grabbing";
    try {
      glRef.current.domElement.setPointerCapture(next.pointerId);
    } catch {
      /* The canvas can refuse capture when the pointer has already ended. */
    }
  };

  const finishDrag = () => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    const current = modelRef.current;
    const element = glRef.current.domElement;
    element.style.cursor = "";
    try {
      element.releasePointerCapture(active.pointerId);
    } catch {
      /* Capture may already have been released outside the canvas. */
    }
    moved.current = active.moved;
    if (current && active.moved) {
      if (active.mode === "rotate") current.onRotate(active.id, active.yaw);
      else {
        const dragX = active.x - active.originX;
        const dragZ = active.z - active.originZ;
        const travels = (instance: PlacedModule) => instance.instanceId === active.id
          || (!active.isolate && active.assemblyId !== null && instance.assemblyPlacementId === active.assemblyId);
        const boxAt = (instance: PlacedModule, x: number, z: number) => boundsOf(
          extentCorners(NOMINAL_PLAN_EXTENT, { x, z }, instance.transform.rotationY, instance.mirror),
        );
        const movers: PlanExtent[] = [];
        const still: PlanExtent[] = [];
        let anchor: PlanExtent | null = null;
        for (const instance of current.instances) {
          const shift = current.displayShift[instance.instanceId] ?? { x: 0, z: 0 };
          if (instance.instanceId === active.id) {
            anchor = boxAt(instance, active.x, active.z);
            movers.push(anchor);
          } else if (travels(instance)) {
            movers.push(boxAt(instance, instance.transform.position.x + shift.x + dragX, instance.transform.position.z + shift.z + dragZ));
          } else {
            still.push(boxAt(instance, instance.transform.position.x + shift.x, instance.transform.position.z + shift.z));
          }
        }
        const grid = current.snap ? snapModuleOrigin(active.x, active.z) : null;
        const settled = anchor
          ? settleMove(movers, anchor, still, grid ? { dx: grid.x - active.x, dz: grid.z - active.z } : null, current.snap)
          : { dx: grid ? grid.x - active.x : 0, dz: grid ? grid.z - active.z : 0 };
        current.onTranslate(active.id, active.x + settled.dx, active.z + settled.dz);
      }
    }
    current?.onGestureEnd();
    setPose(null);
  };

  useEffect(() => {
    finishRef.current = finishDrag;
  });

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = drag.current;
      if (!active) return;
      if ((event.buttons & 1) === 0) {
        finishRef.current();
        return;
      }
      const hit = hitFromClient(event.clientX, event.clientY);
      if (!hit) return;
      if (Math.hypot(hit.x - active.startX, hit.z - active.startZ) > 0.4) active.moved = true;
      if (active.mode === "rotate") active.yaw += event.movementX * 0.012;
      else {
        active.x = hit.x - active.offsetX;
        active.z = hit.z - active.offsetZ;
      }
      showDrag(active);
    };
    const up = (event: PointerEvent) => {
      if (event.type === "lostpointercapture") {
        if ((event.buttons & 1) !== 0) return;
      } else if (event.type !== "pointercancel" && event.button !== 0) return;
      finishRef.current();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("lostpointercapture", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("lostpointercapture", up);
    };
  }, []);

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (drag.current) return;
    const current = model;
    if (!current) return;
    if (!current.armedModuleId && !current.previewParts) {
      hidePreview();
      return;
    }
    const next = placementPoint(event, current.ring, current.snap);
    if (!next) {
      hidePreview();
      return;
    }
    showPreview(next.x, next.z);
  };

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    const current = model;
    if (!current || event.button !== 0) return;
    if (moved.current) {
      moved.current = false;
      return;
    }
    event.stopPropagation();
    const next = placementPoint(event, current.ring, current.snap);
    if (!next) {
      if (!current.armedModuleId) current.onSelect(null);
      return;
    }
    if (current.tool === "entrance" || current.tool === "circulation") {
      current.onAnnotate(next.x, next.z);
      return;
    }
    if (!current.canPlace) return;
    current.onPlace(next.x, next.z);
  };

  const onModulePointerDown = (id: string, event: ThreeEvent<PointerEvent>) => {
    const current = model;
    if (!current || event.button !== 0) return;
    event.stopPropagation();
    const instance = current.instances.find((item) => item.instanceId === id);
    const hit = hitFromClient(event.nativeEvent.clientX, event.nativeEvent.clientY);
    if (!instance || !hit) return;
    const shift = current.displayShift[id] ?? { x: 0, z: 0 };
    const originX = instance.transform.position.x + shift.x;
    const originZ = instance.transform.position.z + shift.z;
    beginDrag({
      id,
      assemblyId: instance.assemblyPlacementId ?? null,
      isolate: current.memberEditId === instance.assemblyPlacementId,
      mode: current.tool === "rotate" ? "rotate" : "move",
      offsetX: hit.x - originX,
      offsetZ: hit.z - originZ,
      yaw: instance.transform.rotationY,
      startX: hit.x,
      startZ: hit.z,
      originX,
      originZ,
      x: originX,
      z: originZ,
      moved: false,
      pointerId: event.nativeEvent.pointerId,
    });
    current.onSelect(id);
  };

  const onModuleClick = (id: string, event: ThreeEvent<MouseEvent>) => {
    const current = model;
    if (!current) return;
    event.stopPropagation();
    if (moved.current) {
      moved.current = false;
      return;
    }
    current.onSelect(id);
  };

  const shownPreview = preview && preview.id === model?.armedModuleId ? preview : null;

  return {
    preview: shownPreview,
    pose,
    ground: { onPointerMove, onClick },
    onModulePointerDown,
    onModuleClick,
  };
}

export type ModulePointer = ReturnType<typeof useModulePointer>;

function useMarkGeometry() {
  const footprint = useMemo(() => {
    const half = 10;
    const corners: Array<[number, number]> = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
      [-half, -half],
    ];
    const positions = new Float32Array(corners.length * 3);
    corners.forEach(([x, z], index) => {
      positions[index * 3] = x;
      positions[index * 3 + 1] = MARK_Y;
      positions[index * 3 + 2] = z;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    return geometry;
  }, []);
  const envelope = useMemo(() => new EdgesGeometry(new BoxGeometry(20, 20, 20)), []);
  const volume = useMemo(() => new BoxGeometry(20, 20, 20), []);
  const materials = useMemo(() => ({
    white: new LineBasicMaterial({ color: "#f4f1ea" }),
    copper: new LineBasicMaterial({ color: "#c77e5f" }),
    faint: new LineBasicMaterial({ color: "#f4f1ea", transparent: true, opacity: 0.45 }),
    guide: new LineBasicMaterial({ color: "#f4f1ea", transparent: true, opacity: 0.62 }),
  }), []);
  useEffect(() => () => {
    footprint.dispose();
    envelope.dispose();
    volume.dispose();
    materials.white.dispose();
    materials.copper.dispose();
    materials.faint.dispose();
    materials.guide.dispose();
  }, [envelope, footprint, materials, volume]);
  return { footprint, envelope, volume, materials };
}

function Footprint({ geometry, material }: { geometry: BufferGeometry; material: LineBasicMaterial }) {
  const line = useMemo(() => new Line(geometry, material), [geometry, material]);
  return <primitive object={line} />;
}

function AnnotationMarks({ notes, selectedId, pose }: { notes: WorldAnnotation[]; selectedId: string | null; pose: DragPose | null }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const note of notes) {
      const x = pose?.id === note.id ? pose.x : note.world.x;
      const z = pose?.id === note.id ? pose.z : note.world.z;
      const y = pose?.id === note.id ? pose.y : MODULE_GROUND_Y;
      positions.push(x, y, z, x, y + 8, z);
      if (note.worldEnd) {
        positions.push(x, y + 1, z, note.worldEnd.x, MODULE_GROUND_Y + 1, note.worldEnd.z);
      }
    }
    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    return next;
  }, [notes, pose]);
  const material = useMemo(() => new LineBasicMaterial({ color: "#c77e5f" }), []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (notes.length === 0) return null;
  return <lineSegments geometry={geometry} material={material} userData={{ selectedId }} />;
}

function Adjacency({ links }: { links: SitePlacementModel["links"] }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(links.length * 6);
    links.forEach((link, index) => {
      positions[index * 6] = link.ax;
      positions[index * 6 + 1] = MODULE_GROUND_Y + 10;
      positions[index * 6 + 2] = link.az;
      positions[index * 6 + 3] = link.bx;
      positions[index * 6 + 4] = MODULE_GROUND_Y + 10;
      positions[index * 6 + 5] = link.bz;
    });
    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(positions, 3));
    return next;
  }, [links]);
  const material = useMemo(() => new LineBasicMaterial({ color: "#c77e5f" }), []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (links.length === 0) return null;
  return <lineSegments geometry={geometry} material={material} />;
}

function DemonstrationJoin({ cloud, material }: { cloud: BridgeCloud; material: MeshLambertMaterial }) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(cloud.positions, 3));
    next.setAttribute("normal", new BufferAttribute(cloud.normals, 3));
    next.setIndex(new BufferAttribute(cloud.indices, 1));
    return next;
  }, [cloud]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} raycast={() => null} />;
}

export function ModuleMeshes({ model, pointer }: { model: SitePlacementModel; pointer: ModulePointer }) {
  const marks = useMarkGeometry();
  const materials = useMemo(() => ({
    body: new MeshLambertMaterial({ color: "#b7b2aa", side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    selected: new MeshLambertMaterial({ color: "#f7f4ee", side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    teal: new MeshLambertMaterial({ color: "#8fb8b4", side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    preview: new MeshLambertMaterial({ color: "#f4f1ea", transparent: true, opacity: 0.42, depthWrite: false, side: DoubleSide }),
    pending: new MeshLambertMaterial({ color: "#f4f1ea", transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }),
    missing: new MeshLambertMaterial({ color: "#c77e5f", transparent: true, opacity: 0.2, depthWrite: false, side: DoubleSide }),
  }), []);
  const geometries = useMemo(() => {
    const map = new Map<string, BufferGeometry>();
    for (const [moduleId, mesh] of Object.entries(model.meshes)) map.set(moduleId, geometryFromIso(mesh));
    return map;
  }, [model.meshes]);

  useEffect(() => () => {
    geometries.forEach((geometry) => geometry.dispose());
  }, [geometries]);

  useEffect(() => () => {
    materials.body.dispose();
    materials.selected.dispose();
    materials.teal.dispose();
    materials.preview.dispose();
    materials.pending.dispose();
    materials.missing.dispose();
  }, [materials]);

  const armedGeometry = model.armedModuleId ? geometries.get(model.armedModuleId) ?? null : null;

  return (
    <>
      {model.instances.map((instance) => {
        const geometry = instance.geometryState === "available" ? geometries.get(instance.provenance.moduleId) : undefined;
        const warning = model.warnings[instance.instanceId];
        const alert = Boolean(warning?.outside || warning?.overlap);
        const selected = instance.instanceId === model.selectedId || instance.assemblyPlacementId === model.selectedId;
        const highlight = model.display === "archetypes" || model.display === "both";
        const axonBox = selected && model.viewMode === "axon";
        const assemblyHandle = model.instances.find((item) => item.assemblyPlacementId === model.selectedId)?.instanceId;
        const showHandle = instance.instanceId === model.selectedId || instance.instanceId === assemblyHandle;
        const mark = alert ? marks.materials.copper : marks.materials.white;
        const shift = model.displayShift[instance.instanceId] ?? { x: 0, z: 0 };
        const mirror = instance.mirror;
        const live = pointer.pose;
        const grabbed = live?.id === instance.instanceId;
        const carried = Boolean(live && !live.isolate && live.assemblyId && instance.assemblyPlacementId === live.assemblyId);
        const slideX = carried && live ? live.x - live.originX : 0;
        const slideZ = carried && live ? live.z - live.originZ : 0;
        return (
          <group
            key={instance.instanceId}
            position={[
              grabbed && live ? live.x : instance.transform.position.x + shift.x + slideX,
              grabbed && live ? live.y : instance.transform.position.y,
              grabbed && live ? live.z : instance.transform.position.z + shift.z + slideZ,
            ]}
            rotation={[0, -(grabbed && live ? live.yaw : instance.transform.rotationY), 0]}
          >
            {geometry ? (
              <mesh
                geometry={geometry}
                material={selected ? materials.selected : highlight ? materials.teal : materials.body}
                scale={[mirror === "x" ? -1 : 1, mirror === "y" ? -1 : 1, mirror === "z" ? -1 : 1]}
                userData={{ instanceId: instance.instanceId, moduleId: instance.provenance.moduleId }}
                onPointerDown={(event) => pointer.onModulePointerDown(instance.instanceId, event)}
                onPointerMove={pointer.ground.onPointerMove}
                onPointerOver={(event) => {
                  const element = event.nativeEvent.currentTarget;
                  if (element instanceof HTMLElement) element.style.cursor = "grab";
                }}
                onPointerOut={(event) => {
                  if (pointer.pose) return;
                  const element = event.nativeEvent.currentTarget;
                  if (element instanceof HTMLElement) element.style.cursor = "";
                }}
                onClick={(event) => pointer.onModuleClick(instance.instanceId, event)}
              />
            ) : (
              <mesh
                geometry={marks.volume}
                material={instance.geometryState === "pending" ? materials.pending : materials.missing}
                position={[0, 10, 0]}
                userData={{ instanceId: instance.instanceId, moduleId: instance.provenance.moduleId }}
                onPointerDown={(event) => pointer.onModulePointerDown(instance.instanceId, event)}
                onPointerMove={pointer.ground.onPointerMove}
                onPointerOver={(event) => {
                  const element = event.nativeEvent.currentTarget;
                  if (element instanceof HTMLElement) element.style.cursor = "grab";
                }}
                onPointerOut={(event) => {
                  if (pointer.pose) return;
                  const element = event.nativeEvent.currentTarget;
                  if (element instanceof HTMLElement) element.style.cursor = "";
                }}
                onClick={(event) => pointer.onModuleClick(instance.instanceId, event)}
              />
            )}
            {(selected || alert) && !axonBox ? <Footprint geometry={marks.footprint} material={mark} /> : null}
            {model.showEnvelope || model.display === "boxes" || alert || !geometry || axonBox ? (
              <lineSegments
                geometry={marks.envelope}
                material={alert ? marks.materials.copper : axonBox ? marks.materials.guide : marks.materials.faint}
                position={[0, 10, 0]}
              />
            ) : null}
            {showHandle ? (
              <mesh
                position={[13.2, 1.6, 13.2]}
                rotation={[-Math.PI / 2, 0, 0]}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const quarter = Math.PI / 2;
                  const yaw = Math.round(instance.transform.rotationY / quarter) * quarter + quarter;
                  model.onGestureStart();
                  model.onRotate(instance.instanceId, yaw);
                  model.onGestureEnd();
                }}
                onClick={(event) => event.stopPropagation()}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  const element = event.nativeEvent.currentTarget;
                  if (element instanceof HTMLElement) element.style.cursor = "pointer";
                }}
                onPointerOut={(event) => {
                  if (pointer.pose) return;
                  const element = event.nativeEvent.currentTarget;
                  if (element instanceof HTMLElement) element.style.cursor = "";
                }}
              >
                <ringGeometry args={[2.15, 3.15, 40]} />
                <meshBasicMaterial color="#f4f1ea" side={DoubleSide} />
              </mesh>
            ) : null}
          </group>
        );
      })}
      <Adjacency links={model.display === "connectors" || model.display === "both" ? model.links : []} />
      {model.demonstration.map((item) => {
        const live = pointer.pose;
        const carried = Boolean(live && !live.isolate && live.assemblyId === item.placementId);
        const slideX = carried && live ? live.x - live.originX : 0;
        const slideZ = carried && live ? live.z - live.originZ : 0;
        const selected = item.placementId === model.selectedId;
        const highlight = model.display === "archetypes" || model.display === "both";
        return (
          <group key={item.placementId} position={[item.x + slideX, MODULE_GROUND_Y, item.z + slideZ]} rotation={[0, -item.rotationY, 0]}>
            <DemonstrationJoin cloud={item.cloud} material={selected ? materials.selected : highlight ? materials.teal : materials.body} />
          </group>
        );
      })}
      <AnnotationMarks notes={model.annotations} selectedId={model.selectedId} pose={pointer.pose} />
      <group visible={pointer.preview !== null} position={[pointer.preview?.x ?? 0, MODULE_GROUND_Y, pointer.preview?.z ?? 0]}>
        {model.previewParts ? model.previewParts.map((part, index) => {
          const geometry = geometries.get(part.moduleId);
          if (!geometry) return null;
          return (
            <mesh key={`${part.moduleId}-${index}`} geometry={geometry} material={materials.preview} position={[part.x, part.y, part.z]} rotation={[0, -part.rotationY, 0]} />
          );
        }) : armedGeometry ? <mesh geometry={armedGeometry} material={materials.preview} /> : null}
        {model.previewBridge ? <DemonstrationJoin cloud={model.previewBridge} material={materials.preview} /> : null}
        <Footprint geometry={marks.footprint} material={marks.materials.white} />
      </group>
    </>
  );
}
