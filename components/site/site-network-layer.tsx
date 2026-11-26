"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  NormalBlending,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  CanvasTexture,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LineBasicMaterial,
  MeshBasicMaterial,
  ShaderMaterial,
  Raycaster,
  RGBAFormat,
  RingGeometry,
  SpriteMaterial,
  UnsignedByteType,
  Vector2,
  type Camera,
} from "three";
import { worldToStored } from "@/lib/skill5/render-frame";
import { trailDisplayAlpha } from "./site-network-display";
import { influenceContours } from "./site-network-contours";
import type { NetworkCandidate, NetworkEdit, NetworkNode, NetworkNodeKind, SiteNetworkStudy } from "./site-network";
import { buildVeinChains, veinHalfWidth, type VeinPoint } from "./site-network-vein-draw";

const TRAIL_Y = 1.5;
const MARK_Y = 2.4;
const PLANE_Y = 0.95;
const EMPTY: NetworkEdit = { nodes: [], selectedId: null, candidates: [], selectedCandidateId: null };

const SOURCE = "#c77e5f";
const ATTRACTOR = "#49d7de";
const WATER = "#e2c27a";
const CANDIDATE = "#f2f2ee";

let nodeGlow: CanvasTexture | null = null;

function nodeGlowMap() {
  if (nodeGlow) return nodeGlow;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.18, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.16)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  nodeGlow = texture;
  return texture;
}

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
  if (typeof document === "undefined") {
    const blank = new SpriteMaterial({ color, transparent: true, depthWrite: false });
    blank.toneMapped = false;
    return blank;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const map = new CanvasTexture(canvas);
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = "600 26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    map.needsUpdate = true;
  }
  const material = new SpriteMaterial({ map, transparent: true, depthWrite: false });
  material.toneMapped = false;
  return material;
}

function NodeMark({
  node,
  selected,
  reached,
  visiting,
  onPointerDown,
  onDelete,
  interactive,
  showGlow = true,
}: {
  node: NetworkNode;
  selected: boolean;
  reached: boolean;
  visiting: boolean;
  onPointerDown: (node: NetworkNode, event: { stopPropagation: () => void; nativeEvent: PointerEvent }) => void;
  onDelete: (id: string) => void;
  interactive: boolean;
  showGlow?: boolean;
}) {
  const [hot, setHot] = useState(false);
  const water = node.surface === "water";
  const color = node.kind === "source" ? SOURCE : water ? WATER : ATTRACTOR;
  const label = `${node.id} · ${node.kind === "source" ? "Source" : water ? "Water" : "Attractor"}`;
  const ring = useMemo(() => new RingGeometry(selected ? 5.2 : 6.4, selected ? 8.6 : 8.0, 32), [selected]);
  const material = useMemo(() => {
    const next = new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, opacity: 0.95, depthWrite: false });
    next.toneMapped = false;
    return next;
  }, [color]);
  const sprite = useMemo(() => labelMaterial(label, color), [label, color]);
  const glow = useMemo(() => {
    const next = new SpriteMaterial({ map: nodeGlowMap() ?? undefined, color, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending });
    next.toneMapped = false;
    return next;
  }, [color]);
  useEffect(() => () => {
    ring.dispose();
    material.dispose();
    sprite.map?.dispose();
    sprite.dispose();
    glow.dispose();
  }, [ring, material, sprite, glow]);
  return (
    <group position={[node.x, MARK_Y, node.z]}>
      {showGlow ? <sprite material={glow} scale={[selected ? 92 : 74, selected ? 92 : 74, 1]} raycast={skipRaycast} /> : null}
      {showGlow ? <sprite material={glow} scale={[selected ? 46 : 34, selected ? 46 : 34, 1]} raycast={skipRaycast} /> : null}
      <mesh
        geometry={ring}
        material={material}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={interactive ? undefined : skipRaycast}
        onPointerOver={interactive ? (event) => { event.stopPropagation(); setHot(true); } : undefined}
        onPointerOut={interactive ? () => setHot(false) : undefined}
        onPointerDown={interactive ? (event) => onPointerDown(node, event) : undefined}
      />
      {interactive && (hot || selected) ? (
        <mesh
          position={[12, 4, 0]}
          onPointerOver={(event) => { event.stopPropagation(); setHot(true); }}
          onPointerDown={(event) => {
            event.stopPropagation();
            onDelete(node.id);
          }}
        >
          <boxGeometry args={[5, 1.2, 5]} />
          <meshBasicMaterial color="#c77e5f" depthWrite={false} toneMapped={false} />
        </mesh>
      ) : null}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} raycast={skipRaycast}>
        <circleGeometry args={[4.4, 28]} />
        <meshBasicMaterial color="#ffffff" depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, node.kind === "source" ? Math.PI / 4 : 0]} raycast={skipRaycast}>
        {node.kind === "source" ? <circleGeometry args={[3.6, 4]} /> : <circleGeometry args={[3.8, 28]} />}
        <meshBasicMaterial color={color} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      {water ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={skipRaycast}>
          <ringGeometry args={[selected ? 8.2 : 7.6, selected ? 9.4 : 8.6, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      ) : null}
      {reached ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={skipRaycast}>
          <ringGeometry args={[8.4, 9.2, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      ) : visiting ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={skipRaycast}>
          <ringGeometry args={[7.6, 8.1, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      ) : null}
      <sprite material={sprite} position={[0, 14, 0]} scale={[56, 11, 1]} raycast={skipRaycast} />
    </group>
  );
}

export function SiteNetworkLayer({
  study,
  running,
  tool,
  onSettle,
  preview,
  colored,
  showField,
  showTrails,
  branches = null,
  fieldNodes = null,
  interactive = true,
  quiet = false,
  glow = true,
}: {
  study: SiteNetworkStudy;
  running: boolean;
  tool: NetworkNodeKind;
  onSettle: () => void;
  preview?: Float32Array | null;
  colored?: Uint8Array | null;
  showField: boolean;
  showTrails: boolean;
  /** Saved iteration branches. These replace the conductivity raster. */
  branches?: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[] | null;
  /** When set (viewing a saved iteration), these are the field points drawn on the site. */
  fieldNodes?: readonly NetworkNode[] | null;
  /** Node placement stays on Site Strategy. Other steps only draw the network. */
  interactive?: boolean;
  /** Massing views keep the network, drawn lighter so the building reads first. */
  quiet?: boolean;
  /** Soft additive halo around veins. Default on for the porous-network look. */
  glow?: boolean;
}) {
  const told = useRef(false);
  const seen = useRef(-1);
  const reachedRef = useRef("");
  const visitRef = useRef("");
  const [reachedKey, setReachedKey] = useState("");
  const [visitKey, setVisitKey] = useState("");
  const dragging = useRef(false);
  const nodeGesture = useRef(0);
  const { camera, gl } = useThree();
  const cameraRef = useRef(camera);
  const glRef = useRef(gl);
  cameraRef.current = camera;
  glRef.current = gl;
  const edit = useSyncExternalStore(
    (listener) => study.subscribe(listener),
    () => study.edit,
    () => EMPTY,
  );
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const texture = useMemo(() => {
    const next = new DataTexture(study.pixels, study.inkSize, study.inkSize, RGBAFormat, UnsignedByteType);
    next.flipY = false;
    next.generateMipmaps = false;
    next.magFilter = LinearFilter;
    next.minFilter = LinearFilter;
    next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    next.needsUpdate = true;
    return next;
  }, [study, gl]);
  const saved = useMemo(() => {
    const pixels = new Uint8Array(study.inkSize * study.inkSize * 4);
    const next = new DataTexture(pixels, study.inkSize, study.inkSize, RGBAFormat, UnsignedByteType);
    next.flipY = false;
    next.generateMipmaps = false;
    next.magFilter = LinearFilter;
    next.minFilter = LinearFilter;
    next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return { pixels, texture: next };
  }, [study, gl]);
  const ink = useMemo(() => {
    const next = new ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uTexel: { value: new Vector2(1 / study.inkSize, 1 / study.inkSize) },
        uTint: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      side: DoubleSide,
      toneMapped: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec2 uTexel;
        uniform float uTint;
        varying vec2 vUv;
        float tap(vec2 offset) {
          return texture2D(uMap, vUv + offset * uTexel).a;
        }
        void main() {
          if (uTint > 0.5) {
            vec4 best = texture2D(uMap, vUv);
            vec2 step = uTexel * 3.0;
            vec4 a = texture2D(uMap, vUv + vec2(step.x, 0.0));
            vec4 b = texture2D(uMap, vUv + vec2(-step.x, 0.0));
            vec4 c = texture2D(uMap, vUv + vec2(0.0, step.y));
            vec4 d = texture2D(uMap, vUv + vec2(0.0, -step.y));
            vec4 e = texture2D(uMap, vUv + vec2(step.x, step.y));
            vec4 f = texture2D(uMap, vUv + vec2(-step.x, step.y));
            vec4 g = texture2D(uMap, vUv + vec2(step.x, -step.y));
            vec4 h = texture2D(uMap, vUv + vec2(-step.x, -step.y));
            if (a.a > best.a) best = a;
            if (b.a > best.a) best = b;
            if (c.a > best.a) best = c;
            if (d.a > best.a) best = d;
            if (e.a > best.a) best = e;
            if (f.a > best.a) best = f;
            if (g.a > best.a) best = g;
            if (h.a > best.a) best = h;
            step = uTexel * 6.0;
            a = texture2D(uMap, vUv + vec2(step.x, 0.0));
            b = texture2D(uMap, vUv + vec2(-step.x, 0.0));
            c = texture2D(uMap, vUv + vec2(0.0, step.y));
            d = texture2D(uMap, vUv + vec2(0.0, -step.y));
            if (a.a > best.a) best = a;
            if (b.a > best.a) best = b;
            if (c.a > best.a) best = c;
            if (d.a > best.a) best = d;
            if (best.a < 0.04) discard;
            gl_FragColor = vec4(best.rgb, min(1.0, best.a * 1.35));
            return;
          }
          float center = tap(vec2(0.0));
          float near = tap(vec2(1.0, 0.0)) + tap(vec2(-1.0, 0.0)) + tap(vec2(0.0, 1.0)) + tap(vec2(0.0, -1.0));
          float ring = tap(vec2(3.0, 0.0)) + tap(vec2(-3.0, 0.0)) + tap(vec2(0.0, 3.0)) + tap(vec2(0.0, -3.0));
          ring += tap(vec2(2.0, 2.0)) + tap(vec2(-2.0, 2.0)) + tap(vec2(2.0, -2.0)) + tap(vec2(-2.0, -2.0));
          float far = tap(vec2(6.0, 0.0)) + tap(vec2(-6.0, 0.0)) + tap(vec2(0.0, 6.0)) + tap(vec2(0.0, -6.0));
          float soft = center * 0.58 + near * 0.055 + ring * 0.02 + far * 0.01;
          float core = smoothstep(0.38, 0.82, soft);
          float film = smoothstep(0.05, 0.24, soft) * (1.0 - smoothstep(0.36, 0.72, soft));
          float hair = smoothstep(0.02, 0.12, soft) * (1.0 - smoothstep(0.14, 0.4, soft));
          float alpha = max(core, max(film * 0.42, hair * 0.18));
          if (alpha < 0.022) discard;
          gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
        }
      `,
    });
    return next;
  }, [texture, study]);
  const { minX, maxX, minZ, maxZ } = study.frame;

  useEffect(() => () => {
    ink.dispose();
    texture.dispose();
    saved.texture.dispose();
  }, [ink, texture, saved]);
  useEffect(() => {
    const pixels = saved.pixels;
    const count = study.inkSize * study.inkSize;
    if (colored && colored.length === count * 4) {
      pixels.set(colored);
      saved.texture.needsUpdate = true;
      ink.uniforms.uMap.value = saved.texture;
      ink.uniforms.uTint.value = 1;
      ink.blending = NormalBlending;
      ink.needsUpdate = true;
      return;
    }
    ink.uniforms.uTint.value = 0;
    ink.blending = NormalBlending;
    ink.needsUpdate = true;
    if (!preview || preview.length !== count) {
      ink.uniforms.uMap.value = texture;
      return;
    }
    for (let index = 0; index < preview.length; index += 1) {
      const write = index * 4;
      pixels[write] = 255;
      pixels[write + 1] = 255;
      pixels[write + 2] = 255;
      pixels[write + 3] = trailDisplayAlpha(preview[index]);
    }
    saved.texture.needsUpdate = true;
    ink.uniforms.uMap.value = saved.texture;
  }, [preview, colored, ink, saved, study.inkSize, texture]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const selected = study.edit.selectedId;
      if (!selected) return;
      event.preventDefault();
      study.remove(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [study]);

  useFrame(() => {
    if (running) {
      if (!study.canRun || study.settled) {
        if (!told.current) {
          told.current = true;
          onSettle();
        }
      } else {
        told.current = false;
        study.step(study.generator === "flow" ? (study.exploring ? 8 : 3) : 3);
      }
    }
    const arrived = study.status.reachedIds.join(",");
    if (arrived !== reachedRef.current) {
      reachedRef.current = arrived;
      setReachedKey(arrived);
    }
    const visiting = study.status.visitIds.join(",");
    if (visiting !== visitRef.current) {
      visitRef.current = visiting;
      setVisitKey(visiting);
    }
    if (study.revision === seen.current) return;
    seen.current = study.revision;
    texture.needsUpdate = true;
  });
  const reached = useMemo(() => new Set(reachedKey ? reachedKey.split(",") : []), [reachedKey]);
  const visiting = useMemo(() => new Set(visitKey ? visitKey.split(",") : []), [visitKey]);

  const pointFromEvent = (event: { nativeEvent: { clientX: number; clientY: number } }) => (
    storedAt(event.nativeEvent.clientX, event.nativeEvent.clientY, cameraRef.current, glRef.current.domElement)
  );

  const onNodeDown = (node: NetworkNode, event: { stopPropagation: () => void; nativeEvent: PointerEvent }) => {
    event.stopPropagation();
    nodeGesture.current = performance.now();
    study.select(node.id);
    dragging.current = true;
    let moved = false;
    const move = (native: PointerEvent) => {
      const point = storedAt(native.clientX, native.clientY, cameraRef.current, glRef.current.domElement);
      if (!point) return;
      if (study.move(node.id, point.x, point.z)) moved = true;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      dragging.current = false;
      if (moved) study.commit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onLandingDown = (id: string, event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    nodeGesture.current = performance.now();
    dragging.current = true;
    let moved = false;
    const move = (native: PointerEvent) => {
      const point = storedAt(native.clientX, native.clientY, cameraRef.current, glRef.current.domElement);
      if (!point) return;
      if (study.setGrowthLanding(id, point.x, point.z)) moved = true;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      dragging.current = false;
      if (moved) study.commit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <group>
      {showField ? <InfluenceField study={study} nodes={edit.nodes} /> : null}
      {showTrails && branches && branches.length > 0 ? (
        <TubeMeshes
          edges={branches}
          quiet={quiet}
          showGlow={glow}
          pins={(fieldNodes && fieldNodes.length > 0 ? fieldNodes : edit.nodes).map((node) => ({ x: node.x, z: node.z }))}
        />
      ) : showTrails && study.generator === "flow" && !preview && !colored ? <FlowTubes study={study} /> : null}
      <mesh
        visible={showTrails && !(branches && branches.length > 0) && (study.generator !== "flow" || preview != null || colored != null)}
        position={[(minX + maxX) / 2, TRAIL_Y, (minZ + maxZ) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        material={ink}
        renderOrder={4}
        raycast={skipRaycast}
      >
        <planeGeometry args={[maxX - minX, maxZ - minZ]} />
      </mesh>
      <mesh
        position={[(minX + maxX) / 2, PLANE_Y, (minZ + maxZ) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        raycast={interactive ? undefined : skipRaycast}
        onPointerMove={interactive ? (event) => {
          if (dragging.current) return;
          const point = pointFromEvent(event);
          if (!point || !study.canPlace(tool, point.x, point.z)) {
            setHover((current) => current === null ? current : null);
            return;
          }
          setHover((current) => current && current.x === point.x && current.z === point.z ? current : point);
        } : undefined}
        onPointerOut={interactive ? () => setHover(null) : undefined}
        onClick={interactive ? (event) => {
          if (event.button !== 0 || dragging.current) return;
          if (performance.now() - nodeGesture.current < 400) return;
          const point = pointFromEvent(event);
          if (!point) return;
          event.stopPropagation();
          study.place(tool, point.x, point.z);
        } : undefined}
      >
        <planeGeometry args={[maxX - minX, maxZ - minZ]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh>
      {showTrails || interactive ? (fieldNodes && fieldNodes.length > 0 ? fieldNodes : edit.nodes).map((node) => (
        <NodeMark
          key={node.id}
          node={node}
          selected={!fieldNodes && node.id === edit.selectedId}
          reached={reached.has(node.id) || Boolean(fieldNodes)}
          visiting={visiting.has(node.id)}
          onPointerDown={onNodeDown}
          onDelete={(id) => study.remove(id)}
          interactive={interactive && !fieldNodes}
          showGlow={false}
        />
      )) : null}
      {interactive && !fieldNodes ? edit.nodes.map((node) => node.water && node.id === edit.selectedId ? (
        <mesh
          key={`landing-${node.id}`}
          position={[node.water.landX, MARK_Y, node.water.landZ]}
          onPointerDown={(event) => onLandingDown(node.id, event)}
        >
          <sphereGeometry args={[4.2, 16, 16]} />
          <meshBasicMaterial color={WATER} depthWrite={false} toneMapped={false} />
        </mesh>
      ) : null) : null}
      {showTrails || interactive ? edit.candidates.map((candidate) => (
        <CandidateMark
          key={candidate.id}
          candidate={candidate}
          selected={candidate.id === edit.selectedCandidateId}
          approved={edit.nodes.find((node) => node.id === candidate.id) ?? null}
          interactive={interactive}
          onPointerDown={(item, event) => {
            if (!interactive) return;
            event.stopPropagation();
            nodeGesture.current = performance.now();
            study.selectCandidate(item.id);
          }}
        />
      )) : null}
      {hover && (showTrails || interactive) ? <HoverMark position={hover} kind={tool} water={tool === "attractor" && study.onWater(hover.x, hover.z)} /> : null}
    </group>
  );
}

const TUBE_VERTEX = `
  varying float vEdge;
  void main() {
    vEdge = clamp(uv.x, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Flat white stroke — same opacity across the whole ribbon. */
const TUBE_BODY = `
  uniform float uAlpha;
  varying float vEdge;
  void main() {
    float edge = clamp(vEdge, 0.0, 1.0);
    float alpha = (1.0 - smoothstep(0.92, 1.0, edge)) * uAlpha;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

const TUBE_GLOW = `
  uniform float uAlpha;
  varying float vEdge;
  void main() {
    float edge = clamp(vEdge, 0.0, 1.0);
    float halo = pow(1.0 - edge, 1.5);
    float alpha = halo * 0.08 * uAlpha;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

const TUBE_HAIR = `
  uniform float uAlpha;
  varying float vEdge;
  void main() {
    float edge = clamp(vEdge, 0.0, 1.0);
    float alpha = pow(1.0 - edge, 1.8) * 0.03 * uAlpha;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

function buildTube(
  edges: ReturnType<SiteNetworkStudy["flowAppearance"]>,
  widthScale: number,
  y: number,
  pins: readonly { x: number; z: number }[] = [],
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const half = veinHalfWidth(1, widthScale);
  const push = (ax: number, az: number, as: number, bx: number, bz: number, bs: number, cx: number, cz: number, cs: number) => {
    positions.push(ax, y, az, bx, y, bz, cx, y, cz);
    uvs.push(as, 0, bs, 0, cs, 0);
  };
  const stroke = (from: VeinPoint, to: VeinPoint) => {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz) || 1;
    const leftX = -dz / length;
    const leftZ = dx / length;
    const fromLeftX = from.x + leftX * half;
    const fromLeftZ = from.z + leftZ * half;
    const fromRightX = from.x - leftX * half;
    const fromRightZ = from.z - leftZ * half;
    const toLeftX = to.x + leftX * half;
    const toLeftZ = to.z + leftZ * half;
    const toRightX = to.x - leftX * half;
    const toRightZ = to.z - leftZ * half;
    push(fromLeftX, fromLeftZ, 1, from.x, from.z, 0, toLeftX, toLeftZ, 1);
    push(from.x, from.z, 0, toLeftX, toLeftZ, 1, to.x, to.z, 0);
    push(from.x, from.z, 0, fromRightX, fromRightZ, 1, to.x, to.z, 0);
    push(fromRightX, fromRightZ, 1, toRightX, toRightZ, 1, to.x, to.z, 0);
  };
  // Same surviving edges — drawn as softened organic chains, uniform width.
  const chains = buildVeinChains(edges, widthScale, 3, pins);
  for (const chain of chains) {
    for (let index = 0; index < chain.points.length - 1; index += 1) {
      stroke(chain.points[index], chain.points[index + 1]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** Single soft porous vein pass — same structure shaping as the reference plates. */
function CoreVeinMeshes({
  edges,
  quiet = false,
  pins = [],
}: {
  edges: ReturnType<SiteNetworkStudy["flowAppearance"]>;
  quiet?: boolean;
  pins?: readonly { x: number; z: number }[];
}) {
  const core = useMemo(() => buildTube(edges, 1.2, 1.72, pins), [edges, pins]);
  const coreMaterial = useMemo(() => new ShaderMaterial({
    vertexShader: TUBE_VERTEX,
    fragmentShader: TUBE_BODY,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: { uAlpha: { value: 1 } },
  }), []);
  useEffect(() => {
    coreMaterial.uniforms.uAlpha.value = quiet ? 0.1 : 1;
  }, [coreMaterial, quiet]);
  useEffect(() => () => {
    core.dispose();
    coreMaterial.dispose();
  }, [core, coreMaterial]);
  if (core.getAttribute("position").count === 0) return null;
  return <mesh geometry={core} material={coreMaterial} renderOrder={6} raycast={skipRaycast} />;
}

function TubeMeshes({
  edges,
  quiet = false,
  showGlow = true,
  pins = [],
}: {
  edges: ReturnType<SiteNetworkStudy["flowAppearance"]>;
  quiet?: boolean;
  showGlow?: boolean;
  pins?: readonly { x: number; z: number }[];
}) {
  // Glow on uses the porous reference stack; glow off keeps a lighter single soft vein.
  if (!showGlow) return <CoreVeinMeshes edges={edges} quiet={quiet} pins={pins} />;
  return <VeinTubeMeshes edges={edges} quiet={quiet} pins={pins} />;
}

function VeinTubeMeshes({
  edges,
  quiet = false,
  pins = [],
}: {
  edges: ReturnType<SiteNetworkStudy["flowAppearance"]>;
  quiet?: boolean;
  pins?: readonly { x: number; z: number }[];
}) {
  // One uniform body for every branch — same width, same paint.
  const core = useMemo(() => buildTube(edges, 1.2, 1.72, pins), [edges, pins]);
  const coreMaterial = useMemo(() => new ShaderMaterial({
    vertexShader: TUBE_VERTEX,
    fragmentShader: TUBE_BODY,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: { uAlpha: { value: 1 } },
  }), []);
  useEffect(() => {
    coreMaterial.uniforms.uAlpha.value = quiet ? 0.1 : 1;
  }, [coreMaterial, quiet]);
  useEffect(() => () => {
    core.dispose();
    coreMaterial.dispose();
  }, [core, coreMaterial]);
  if (core.getAttribute("position").count === 0) return null;
  return <mesh geometry={core} material={coreMaterial} renderOrder={6} raycast={skipRaycast} />;
}

function FlowTubes({ study }: { study: SiteNetworkStudy }) {
  const [revision, setRevision] = useState(study.revision);
  useFrame(() => {
    if (study.revision !== revision) setRevision(study.revision);
  });
  const edges = useMemo(() => study.flowAppearance(), [revision, study]);
  const pins = useMemo(
    () => study.edit.nodes.map((node) => ({ x: node.x, z: node.z })),
    [revision, study],
  );
  return <TubeMeshes edges={edges} pins={pins} />;
}

function ContourMesh({ positions, color }: { positions: Float32Array; color: string }) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    const coordinates = new Float32Array((positions.length / 2) * 3);
    for (let index = 0; index < positions.length; index += 2) {
      const write = (index / 2) * 3;
      coordinates[write] = positions[index];
      coordinates[write + 1] = 1.28;
      coordinates[write + 2] = positions[index + 1];
    }
    next.setAttribute("position", new BufferAttribute(coordinates, 3));
    return next;
  }, [positions]);
  const material = useMemo(() => new LineBasicMaterial({ color, transparent: true, opacity: 0.28 }), [color]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (positions.length < 4) return null;
  return <lineSegments geometry={geometry} material={material} renderOrder={3} raycast={skipRaycast} />;
}

function InfluenceField({ study, nodes }: { study: SiteNetworkStudy; nodes: readonly NetworkNode[] }) {
  const lines = useMemo(
    () => influenceContours(study.frame, nodes, (east, north) => study.insideField(east, north)),
    [study, nodes],
  );
  return (
    <group>
      <ContourMesh positions={lines.attractor} color="#49d7de" />
      <ContourMesh positions={lines.source} color="#c77e5f" />
    </group>
  );
}

function segmentPositions(pairs: readonly [number, number, number, number][]) {
  const coordinates = new Float32Array(pairs.length * 6);
  pairs.forEach(([x0, z0, x1, z1], index) => {
    const write = index * 6;
    coordinates[write] = x0;
    coordinates[write + 1] = 1.35;
    coordinates[write + 2] = z0;
    coordinates[write + 3] = x1;
    coordinates[write + 4] = 1.35;
    coordinates[write + 5] = z1;
  });
  return coordinates;
}

function CandidateLines({ positions }: { positions: Float32Array }) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(positions, 3));
    return next;
  }, [positions]);
  const material = useMemo(() => new LineBasicMaterial({ color: CANDIDATE, transparent: true, opacity: 0.85 }), []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (positions.length < 6) return null;
  return <lineSegments geometry={geometry} material={material} renderOrder={5} raycast={skipRaycast} />;
}

function CandidateMark({
  candidate,
  selected,
  approved,
  onPointerDown,
  interactive,
}: {
  candidate: NetworkCandidate;
  selected: boolean;
  approved: NetworkNode | null;
  onPointerDown: (candidate: NetworkCandidate, event: { stopPropagation: () => void }) => void;
  interactive: boolean;
}) {
  const ring = useMemo(() => new RingGeometry(selected ? 3.4 : 4.6, selected ? 5.2 : 5.6, 28), [selected]);
  const material = useMemo(() => {
    const next = new MeshBasicMaterial({ color: CANDIDATE, side: DoubleSide, transparent: true, opacity: approved ? 0.45 : 0.9, depthWrite: false });
    next.toneMapped = false;
    return next;
  }, [approved]);
  const sprite = useMemo(() => labelMaterial(candidate.label, CANDIDATE), [candidate.label]);
  const lines = useMemo(() => {
    const pairs: [number, number, number, number][] = [];
    if (candidate.sidewalkX != null && candidate.sidewalkZ != null) {
      pairs.push([candidate.sidewalkX, candidate.sidewalkZ, candidate.measuredX, candidate.measuredZ]);
    }
    for (let index = 1; index < candidate.path.length; index += 1) {
      const previous = candidate.path[index - 1];
      const point = candidate.path[index];
      pairs.push([previous.x, previous.z, point.x, point.z]);
    }
    if (approved && (Math.abs(approved.x - candidate.measuredX) > 0.05 || Math.abs(approved.z - candidate.measuredZ) > 0.05)) {
      pairs.push([candidate.measuredX, candidate.measuredZ, approved.x, approved.z]);
    }
    return segmentPositions(pairs);
  }, [approved, candidate]);
  useEffect(() => () => {
    ring.dispose();
    material.dispose();
    sprite.map?.dispose();
    sprite.dispose();
  }, [ring, material, sprite]);
  return (
    <group>
      <CandidateLines positions={lines} />
      <group position={[candidate.measuredX, MARK_Y, candidate.measuredZ]}>
        <mesh
          geometry={ring}
          material={material}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={interactive ? undefined : skipRaycast}
          onPointerDown={(event) => onPointerDown(candidate, event)}
        />
        <sprite material={sprite} position={[0, 12, 0]} scale={[64, 14, 1]} raycast={skipRaycast} />
      </group>
    </group>
  );
}

function HoverMark({ position, kind, water = false }: { position: { x: number; z: number }; kind: NetworkNodeKind; water?: boolean }) {
  const color = kind === "source" ? SOURCE : water ? WATER : ATTRACTOR;
  return (
    <mesh position={[position.x, MARK_Y, position.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={skipRaycast}>
      <ringGeometry args={[4.6, 5.8, 28]} />
      <meshBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} side={DoubleSide} toneMapped={false} />
    </mesh>
  );
}
