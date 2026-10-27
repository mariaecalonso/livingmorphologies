"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  LineBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  SRGBColorSpace,
  TextureLoader,
  NoToneMapping,
  Vector3,
  type Camera,
  type Texture,
} from "three";
import {
  clipPath,
  clipPolygon,
  clipRoad,
  flatGeometry,
  gridAttribute,
  inStudy,
  loopAttribute,
  pathAttribute,
  elevatedDeckGeometry,
  ringCentroid,
  displayRoads,
  displayBuildingGeometry,
  groundRoadBlocks,
  groundRoadGeometry,
  regularizeRing,
  regularizeRoad,
  tidyLocalRoads,
  slabGeometry,
  studyLandRing,
} from "./site-geometry";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { elevatedDeckRoads } from "@/lib/skill5/deck-surface";
import { HERALD_AERIAL } from "@/lib/skill5/aerial";
import { designSiteFromParcel } from "@/lib/skill5/design-site";
import { northDegrees, placeAxon, placePerspective, placePlan, RENDER_GROUP_SCALE } from "@/lib/skill5/render-frame";
import { ModuleMeshes, useModulePointer, type SitePlacementModel } from "./module-field";

export type SiteViewMode = "perspective" | "plan" | "axon";
export type SiteFit = "site" | "context";

export type SiteReadout = {
  northDeg: number;
  scaleFeet: number;
  scalePx: number;
};

type Bounds = {
  cx: number;
  cz: number;
  width: number;
  depth: number;
  span: number;
};

const SCALE_STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const SITE_EDGE = new LineBasicMaterial({ color: "#ffffff" });
const COAST_LINE = new LineBasicMaterial({ color: "#4a4a4a", transparent: true, opacity: 0.55 });
const GRID_LINE = new LineBasicMaterial({ color: "#5c5a56", transparent: true, opacity: 0.16 });
const FLAT_LINE = new LineBasicMaterial({ color: "#2e2e2e", transparent: true, opacity: 0.9 });
const CONTEXT_MARGIN_FEET = 460;

function boundsOf(context: SiteContext): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of context.site.ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const width = maxX - minX;
  const depth = maxZ - minZ;
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, width, depth, span: Math.max(width, depth) };
}

/** Context is the parcel plus a fixed margin, so the bay closure does not become the frame. */
function frameOf(bounds: Bounds, fit: SiteFit): Bounds {
  if (fit === "site") return bounds;
  const width = bounds.width + CONTEXT_MARGIN_FEET * 2;
  const depth = bounds.depth + CONTEXT_MARGIN_FEET * 2;
  return { cx: bounds.cx, cz: bounds.cz, width, depth, span: Math.max(width, depth) };
}

function niceScale(feet: number) {
  let best = SCALE_STEPS[0];
  for (const step of SCALE_STEPS) {
    if (Math.abs(Math.log(step / feet)) < Math.abs(Math.log(best / feet))) best = step;
  }
  return best;
}

function lineGeometry(attribute: ReturnType<typeof loopAttribute>) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", attribute);
  return geometry;
}

function skipRaycast() {}

function SiteContent({
  context,
  showGrid,
  showAerial,
  ground,
}: {
  context: SiteContext;
  showGrid: boolean;
  showAerial: boolean;
  ground?: ReturnType<typeof useModulePointer>["ground"];
}) {
  const [aerialMap, setAerialMap] = useState<Texture | null>(null);
  useEffect(() => {
    if (!showAerial) return;
    const loader = new TextureLoader();
    let active = true;
    let loaded: Texture | null = null;
    loader.load(HERALD_AERIAL.href, (texture) => {
      texture.colorSpace = SRGBColorSpace;
      if (!active) {
        texture.dispose();
        return;
      }
      loaded = texture;
      setAerialMap(texture);
    });
    return () => {
      active = false;
      loaded?.dispose();
      setAerialMap(null);
    };
  }, [showAerial]);
  const geometries = useMemo(() => {
    const visible = context.buildings.filter((building) => {
      const [x, z] = ringCentroid(building.ring);
      return inStudy(x, z);
    });
    const flat = visible.filter((building) => building.heightFeet === null);
    const sourceRoads = tidyLocalRoads(displayRoads(context.roads));
    const clipRoads = (roads: typeof context.roads) => roads.map((road) => regularizeRoad(road)).flatMap((road) => clipRoad(road));
    const elevatedRoads = clipRoads(elevatedDeckRoads(sourceRoads));
    const groundRoads = clipRoads(sourceRoads.filter((road) => !road.elevated));
    const design = designSiteFromParcel(context.site.ring);
    return {
      land: flatGeometry(studyLandRing(context.water.ring), 0),
      water: slabGeometry(clipPolygon(context.water.ring), 0.5, 0),
      siteEdge: lineGeometry(loopAttribute([design.ring], 1.15)),
      coast: lineGeometry(pathAttribute(clipPath(context.coastline.path), 0.2, false)),
      elevated: elevatedDeckGeometry(elevatedRoads),
      groundRoads,
      roadBlocks: groundRoadBlocks(visible, context.water.ring, design.ring),
      flatEdges: lineGeometry(loopAttribute(flat.flatMap((building) => [clipPolygon(regularizeRing(building.ring)), ...(building.holes ?? []).map((hole) => clipPolygon(regularizeRing(hole)))].filter((ring) => ring.length >= 3)), 0.35)),
      grid: lineGeometry(gridAttribute(design.ring, 1.05)),
    };
  }, [context]);

  useEffect(() => () => {
    geometries.land.dispose();
    geometries.water.dispose();
    geometries.siteEdge.dispose();
    geometries.coast.dispose();
    geometries.elevated.dispose();
    geometries.flatEdges.dispose();
    geometries.grid.dispose();
  }, [geometries]);
  const [buildingMesh, setBuildingMesh] = useState<BufferGeometry | null>(null);
  useEffect(() => {
    let cancel = false;
    let installed: BufferGeometry | null = null;
    const visible = context.buildings.filter((building) => {
      const [x, z] = ringCentroid(building.ring);
      return inStudy(x, z);
    });
    displayBuildingGeometry(visible).then((geometry) => {
      if (cancel) {
        geometry.dispose();
        return;
      }
      installed = geometry;
      setBuildingMesh(geometry);
    });
    return () => {
      cancel = true;
      installed?.dispose();
      setBuildingMesh(null);
    };
  }, [context]);
  const [roadMesh, setRoadMesh] = useState<BufferGeometry | null>(null);
  useEffect(() => {
    let cancel = false;
    let installed: BufferGeometry | null = null;
    groundRoadGeometry(geometries.groundRoads, geometries.roadBlocks).then((geometry) => {
      if (cancel) {
        geometry.dispose();
        return;
      }
      installed = geometry;
      setRoadMesh(geometry);
    });
    return () => {
      cancel = true;
      installed?.dispose();
      setRoadMesh(null);
    };
  }, [geometries.groundRoads, geometries.roadBlocks]);

  return (
    <>
      <ambientLight intensity={0.42} color="#ffffff" />
      <hemisphereLight args={["#a3a3a3", "#0a0a0a", 0.22]} />
      <directionalLight position={[820, 1460, -520]} intensity={0.62} color="#ffffff" />
      <directionalLight position={[-380, 720, 640]} intensity={0.16} color="#ffffff" />
      <mesh geometry={geometries.land} raycast={skipRaycast}>
        <meshBasicMaterial color="#070707" side={DoubleSide} />
      </mesh>
      <mesh geometry={geometries.water} raycast={skipRaycast}>
        <meshBasicMaterial color="#30383c" />
      </mesh>
      <lineSegments geometry={geometries.coast} material={COAST_LINE} raycast={skipRaycast} />
      {showAerial && aerialMap ? <mesh
        position={[(HERALD_AERIAL.minX + HERALD_AERIAL.maxX) / 2, 0.12, (HERALD_AERIAL.minZ + HERALD_AERIAL.maxZ) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        raycast={skipRaycast}
      >
        <planeGeometry args={[HERALD_AERIAL.maxX - HERALD_AERIAL.minX, HERALD_AERIAL.maxZ - HERALD_AERIAL.minZ]} />
        <meshBasicMaterial map={aerialMap} side={DoubleSide} />
      </mesh> : null}
      {roadMesh ? <mesh geometry={roadMesh} raycast={skipRaycast}>
        <meshLambertMaterial color="#767676" side={DoubleSide} />
      </mesh> : null}
      <mesh geometry={geometries.elevated} raycast={skipRaycast}>
        <meshLambertMaterial color="#767676" side={DoubleSide} />
      </mesh>
      <lineSegments geometry={geometries.siteEdge} material={SITE_EDGE} raycast={skipRaycast} />
      {showGrid ? <lineSegments geometry={geometries.grid} material={GRID_LINE} raycast={skipRaycast} /> : null}
      <lineSegments geometry={geometries.flatEdges} material={FLAT_LINE} raycast={skipRaycast} />
      {buildingMesh ? <mesh geometry={buildingMesh} raycast={skipRaycast}>
        <meshLambertMaterial color="#2e2e2e" side={DoubleSide} />
      </mesh> : null}
      {ground ? <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.66, 0]} {...ground}>
        <planeGeometry args={[12000, 12000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh> : null}
    </>
  );
}

function CameraRig({
  mode,
  planHeading,
  fit,
  rotateView,
  frameToken,
  bounds,
  onReadout,
}: {
  mode: SiteViewMode;
  planHeading: "north" | "east";
  fit: SiteFit;
  rotateView: boolean;
  frameToken: number;
  bounds: Bounds;
  onReadout: (readout: SiteReadout) => void;
}) {
  const { set, size, gl } = useThree();
  const cameras = useRef<{ persp: PerspectiveCamera; ortho: OrthographicCamera } | null>(null);
  const target = useRef(new Vector3(bounds.cx, 0, -bounds.cz));
  const readout = useRef<SiteReadout>({ northDeg: 999, scaleFeet: 0, scalePx: 0 });
  const poseKey = useRef("");
  const appliedHeading = useRef("");

  useLayoutEffect(() => {
    const pair = cameras.current ?? {
      persp: new PerspectiveCamera(42, 1, 1, 50000),
      ortho: new OrthographicCamera(-1, 1, 1, -1, 1, 50000),
    };
    cameras.current = pair;
    const { persp, ortho } = pair;
    const frame = frameOf(bounds, fit);
    const pad = fit === "site" ? 1.14 : 1.08;
    const camera = mode === "perspective" ? persp : ortho;
    const view = { width: size.width, height: size.height };
    const key = `${mode}|${fit}|${frameToken}|${bounds.cx}|${bounds.cz}|${bounds.width}|${bounds.depth}`;
    const sized = view.width > 1 && view.height > 1;
    const headingKey = `${mode}|${planHeading}`;
    const aimPlan = () => {
      ortho.up.set(planHeading === "east" ? 1 : 0, 0, planHeading === "east" ? 0 : -1);
      ortho.lookAt(target.current);
      ortho.updateMatrixWorld();
      appliedHeading.current = headingKey;
    };
    if (sized && poseKey.current !== key) {
      poseKey.current = key;
      const placed = mode === "plan"
        ? placePlan(ortho, view, frame, pad)
        : mode === "axon"
          ? placeAxon(ortho, view, frame, fit)
          : placePerspective(persp, view, frame, fit);
      target.current.copy(placed);
      if (mode === "plan") aimPlan();
    } else if (sized && mode === "perspective") {
      persp.aspect = view.width / Math.max(1, view.height);
      persp.updateProjectionMatrix();
    } else if (mode === "plan" && sized && appliedHeading.current !== headingKey) aimPlan();
    if (mode !== "plan") appliedHeading.current = "";
    set({ camera });
  }, [bounds, fit, frameToken, gl, mode, planHeading, set, size.height, size.width]);

  useEffect(() => {
    const element = gl.domElement;
    const right = new Vector3();
    const up = new Vector3();
    const offset = new Vector3();
    const pan = new Vector3();
    const maxDistance = frameOf(bounds, "context").span * 6;
    let last: { x: number; y: number } | null = null;

    const activeCamera = () => {
      const pair = cameras.current;
      if (!pair) return null;
      return mode === "perspective" ? pair.persp : pair.ortho;
    };
    const gesture = (event: PointerEvent) => {
      if (event.ctrlKey && event.shiftKey && mode !== "perspective") return "rotate";
      if (event.ctrlKey && !event.shiftKey) return "zoom";
      if (event.shiftKey) return "pan";
      if (mode === "perspective") return "orbit";
      if (rotateView) return "rotate";
      return "pan";
    };
    const panBy = (camera: Camera, dx: number, dy: number) => {
      camera.updateMatrixWorld();
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      const mirrored = camera instanceof OrthographicCamera && camera.left > camera.right;
      const width = camera instanceof OrthographicCamera
        ? Math.abs(camera.right - camera.left) / camera.zoom
        : camera instanceof PerspectiveCamera
          ? 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(target.current) * camera.aspect
          : 1;
      const feetPerPixel = width / Math.max(1, element.clientWidth);
      pan.copy(right).multiplyScalar(-dx * feetPerPixel * (mirrored ? -1 : 1)).addScaledVector(up, dy * feetPerPixel);
      target.current.add(pan);
      camera.position.add(pan);
    };
    const orbitBy = (camera: Camera, dx: number, dy: number) => {
      offset.copy(camera.position).sub(target.current);
      const radius = Math.max(30, offset.length());
      let theta = Math.atan2(offset.x, offset.z);
      let phi = Math.acos(Math.min(1, Math.max(-1, offset.y / radius)));
      theta -= dx * 0.005;
      phi = Math.min(Math.PI / 2.02, Math.max(0.12, phi - dy * 0.005));
      offset.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.cos(theta));
      camera.position.copy(target.current).add(offset);
      camera.up.set(0, 1, 0);
      camera.lookAt(target.current);
    };
    const rotatePlan = (camera: Camera, dx: number) => {
      const angle = -dx * 0.005;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = camera.up.x;
      const z = camera.up.z;
      camera.up.set(x * cos - z * sin, 0, x * sin + z * cos).normalize();
      camera.lookAt(target.current);
    };
    const zoomBy = (camera: Camera, delta: number) => {
      if (camera instanceof OrthographicCamera) {
        camera.zoom = Math.min(80, Math.max(0.08, camera.zoom * Math.exp(-delta)));
        camera.updateProjectionMatrix();
        return;
      }
      if (!(camera instanceof PerspectiveCamera)) return;
      const next = Math.min(maxDistance, Math.max(30, camera.position.distanceTo(target.current) * Math.exp(delta)));
      offset.copy(camera.position).sub(target.current).setLength(next);
      camera.position.copy(target.current).add(offset);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 2) return;
      last = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!last || (event.buttons & 2) === 0) return;
      const camera = activeCamera();
      if (!camera) return;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      last = { x: event.clientX, y: event.clientY };
      const kind = gesture(event);
      if (kind === "zoom") zoomBy(camera, dy * 0.004);
      else if (kind === "orbit") orbitBy(camera, dx, dy);
      else if (kind === "rotate" && mode === "plan") rotatePlan(camera, dx);
      else if (kind === "rotate") orbitBy(camera, dx, dy);
      else panBy(camera, dx, dy);
    };
    const release = (event: PointerEvent) => {
      if (event.type !== "pointercancel" && event.button !== 2) return;
      last = null;
    };
    const wheel = (event: WheelEvent) => {
      const camera = activeCamera();
      if (!camera) return;
      event.preventDefault();
      zoomBy(camera, event.deltaY * 0.0011);
    };
    const menu = (event: Event) => event.preventDefault();
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", release);
    element.addEventListener("pointercancel", release);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("contextmenu", menu);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", release);
      element.removeEventListener("pointercancel", release);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("contextmenu", menu);
    };
  }, [bounds, gl, mode, rotateView]);

  useFrame(() => {
    const pair = cameras.current;
    if (!pair) return;
    const camera = mode === "perspective" ? pair.persp : pair.ortho;
    camera.updateMatrixWorld();
    const northDeg = northDegrees(camera);
    const visible = camera instanceof OrthographicCamera
      ? Math.abs(camera.right - camera.left) / camera.zoom
      : 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(target.current) * camera.aspect;
    const scaleFeet = niceScale((visible / Math.max(1, size.width)) * 220);
    const scalePx = (scaleFeet / visible) * size.width;
    const previous = readout.current;
    if (Math.abs(previous.northDeg - northDeg) > 0.35 || previous.scaleFeet !== scaleFeet || Math.abs(previous.scalePx - scalePx) > 1.5) {
      readout.current = { northDeg, scaleFeet, scalePx };
      onReadout(readout.current);
    }
  });

  return null;
}

function FillFrame() {
  const gl = useThree((state) => state.gl);
  const setSize = useThree((state) => state.setSize);
  useLayoutEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    const apply = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width > 0 && height > 0) setSize(width, height);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [gl, setSize]);
  return null;
}
export type SiteOverlay = {
  shore: boolean;
  macarthur: boolean;
  highway: boolean;
  streets: boolean;
  distances: boolean;
  shorePath: readonly XZ[];
  macarthurPaths: readonly (readonly XZ[])[];
  highwayPaths: readonly (readonly XZ[])[];
  streetPaths: readonly (readonly XZ[])[];
  leaders: readonly { id: string; ax: number; az: number; bx: number; bz: number }[];
};

function OverlayLines({ paths, y, color, opacity }: { paths: readonly (readonly XZ[])[]; y: number; color: string; opacity: number }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const path of paths) {
      for (let index = 1; index < path.length; index += 1) {
        positions.push(path[index - 1][0], y, path[index - 1][1], path[index][0], y, path[index][1]);
      }
    }
    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    return next;
  }, [paths, y]);
  const material = useMemo(() => new LineBasicMaterial({ color, transparent: true, opacity }), [color, opacity]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (paths.length === 0) return null;
  return <lineSegments geometry={geometry} material={material} />;
}

export function SiteViewport({
  context,
  mode,
  planHeading = "north",
  fit,
  rotateView = false,
  showGrid,
  showAerial,
  frameToken,
  placement = null,
  overlay = null,
  onReadout,
}: {
  context: SiteContext;
  mode: SiteViewMode;
  planHeading?: "north" | "east";
  fit: SiteFit;
  rotateView?: boolean;
  showGrid: boolean;
  showAerial: boolean;
  frameToken: number;
  placement?: SitePlacementModel | null;
  overlay?: SiteOverlay | null;
  onReadout: (readout: SiteReadout) => void;
}) {
  const bounds = useMemo(() => boundsOf(context), [context]);
  return (
    <Canvas
      className="site-canvas"
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      onCreated={(state) => {
        state.gl.setClearColor(new Color("#000000"));
        state.gl.toneMapping = NoToneMapping;
        state.setEvents({
          compute(event, root) {
            const rect = root.gl.domElement.getBoundingClientRect();
            const width = Math.max(1, rect.width);
            const height = Math.max(1, rect.height);
            root.pointer.set(((event.clientX - rect.left) / width) * 2 - 1, -((event.clientY - rect.top) / height) * 2 + 1);
            root.raycaster.setFromCamera(root.pointer, root.camera);
          },
        });
      }}
    >
      <FillFrame />
      <PlacementScene context={context} showGrid={showGrid} showAerial={showAerial} placement={placement} overlay={overlay} />
      <CameraRig mode={mode} planHeading={planHeading} fit={fit} rotateView={rotateView} frameToken={frameToken} bounds={bounds} onReadout={onReadout} />
    </Canvas>
  );
}

function PlacementScene({
  context,
  showGrid,
  showAerial,
  placement,
  overlay,
}: {
  context: SiteContext;
  showGrid: boolean;
  showAerial: boolean;
  placement: SitePlacementModel | null;
  overlay: SiteOverlay | null;
}) {
  const pointer = useModulePointer(placement);
  return (
    <group scale={RENDER_GROUP_SCALE}>
      <SiteContent context={context} showGrid={showGrid} showAerial={showAerial} ground={placement ? pointer.ground : undefined} />
      {placement ? <ModuleMeshes model={placement} pointer={pointer} /> : null}
      {overlay?.shore ? <OverlayLines paths={clipPath(overlay.shorePath)} y={1.1} color="#5c6466" opacity={0.7} /> : null}
      {overlay?.macarthur ? <OverlayLines paths={overlay.macarthurPaths.flatMap((path) => clipPath(path))} y={1.2} color="#c77e5f" opacity={0.7} /> : null}
      {overlay?.highway ? <OverlayLines paths={overlay.highwayPaths.flatMap((path) => clipPath(path))} y={1.15} color="#c77e5f" opacity={0.7} /> : null}
      {overlay?.streets ? <OverlayLines paths={overlay.streetPaths.flatMap((path) => clipPath(path))} y={1.05} color="#8a8680" opacity={0.4} /> : null}
      {overlay?.distances ? <OverlayLines paths={overlay.leaders.flatMap((leader) => clipPath([[leader.ax, leader.az], [leader.bx, leader.bz]]))} y={1.4} color="#c8c4bc" opacity={0.75} /> : null}
    </group>
  );
}
