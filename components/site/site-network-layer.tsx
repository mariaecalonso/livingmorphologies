"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  NormalBlending,
  BufferAttribute,
  BufferGeometry,
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
import type { NetworkNode, NetworkNodeKind, SiteNetworkStudy } from "./site-network";

const TRAIL_Y = 1.5;
const MARK_Y = 2.4;
const PLANE_Y = 0.95;
const EMPTY = { nodes: [] as readonly NetworkNode[], selectedId: null as string | null };

const SOURCE = "#c77e5f";
const ATTRACTOR = "#49d7de";

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
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const map = new CanvasTexture(canvas);
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = "500 28px sans-serif";
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
}: {
  node: NetworkNode;
  selected: boolean;
  reached: boolean;
  visiting: boolean;
  onPointerDown: (node: NetworkNode, event: { stopPropagation: () => void; nativeEvent: PointerEvent }) => void;
}) {
  const color = node.kind === "source" ? SOURCE : ATTRACTOR;
  const label = node.kind === "source" ? "Source" : "Attractor";
  const ring = useMemo(() => new RingGeometry(selected ? 4.2 : 5.4, selected ? 7.4 : 6.8, 32), [selected]);
  const material = useMemo(() => {
    const next = new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, opacity: 0.95, depthWrite: false });
    next.toneMapped = false;
    return next;
  }, [color]);
  const sprite = useMemo(() => labelMaterial(label, color), [label, color]);
  const glow = useMemo(() => {
    const next = new SpriteMaterial({ map: nodeGlowMap() ?? undefined, color, transparent: true, depthWrite: false, blending: AdditiveBlending });
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
      <sprite material={glow} scale={[54, 54, 1]} raycast={skipRaycast} />
      <mesh
        geometry={ring}
        material={material}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event) => onPointerDown(node, event)}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={skipRaycast}>
        <circleGeometry args={[2.4, 24]} />
        <meshBasicMaterial color={color} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
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
      <sprite material={sprite} position={[0, 14, 0]} scale={[52, 12, 1]} raycast={skipRaycast} />
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
}: {
  study: SiteNetworkStudy;
  running: boolean;
  tool: NetworkNodeKind;
  onSettle: () => void;
  preview?: Float32Array | null;
  colored?: Uint8Array | null;
  showField: boolean;
  showTrails: boolean;
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
          float soft = center * 0.62 + near * 0.06 + ring * 0.018 + far * 0.008;
          float core = smoothstep(0.34, 0.72, soft);
          float film = smoothstep(0.04, 0.18, soft) * (1.0 - smoothstep(0.28, 0.55, soft));
          float alpha = max(core, film * 0.5);
          if (alpha < 0.028) discard;
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
        study.step(3);
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

  return (
    <group>
      {showField ? <InfluenceField study={study} nodes={edit.nodes} /> : null}
      <mesh
        visible={showTrails}
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
        onPointerMove={(event) => {
          if (dragging.current) return;
          const point = pointFromEvent(event);
          if (!point || !study.insideField(point.x, point.z)) {
            setHover((current) => current === null ? current : null);
            return;
          }
          setHover((current) => current && current.x === point.x && current.z === point.z ? current : point);
        }}
        onPointerOut={() => setHover(null)}
        onClick={(event) => {
          if (event.button !== 0 || dragging.current) return;
          if (performance.now() - nodeGesture.current < 400) return;
          const point = pointFromEvent(event);
          if (!point) return;
          event.stopPropagation();
          study.place(tool, point.x, point.z);
        }}
      >
        <planeGeometry args={[maxX - minX, maxZ - minZ]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh>
      {edit.nodes.map((node) => (
        <NodeMark key={node.id} node={node} selected={node.id === edit.selectedId} reached={reached.has(node.id)} visiting={visiting.has(node.id)} onPointerDown={onNodeDown} />
      ))}
      {hover ? <HoverMark position={hover} kind={tool} /> : null}
    </group>
  );
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
  const material = useMemo(() => new LineBasicMaterial({ color, transparent: true, opacity: 0.62 }), [color]);
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

function HoverMark({ position, kind }: { position: { x: number; z: number }; kind: NetworkNodeKind }) {
  const color = kind === "source" ? SOURCE : ATTRACTOR;
  return (
    <mesh position={[position.x, MARK_Y, position.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={skipRaycast}>
      <ringGeometry args={[4.6, 5.8, 28]} />
      <meshBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} side={DoubleSide} toneMapped={false} />
    </mesh>
  );
}
