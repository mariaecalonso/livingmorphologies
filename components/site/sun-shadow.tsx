"use client";

import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  RingGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type Mesh,
  PCFShadowMap,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type DirectionalLight,
  type Object3D,
} from "three";
import { markAnalysisWaterShadows } from "@/components/site/analysis-water";
import { prismGeometry } from "@/components/site/site-geometry";
import { storedShadowPoints, type StoredBox } from "@/lib/skill5/sun-analysis";
import { solarAt, type SunSample } from "@/lib/skill5/solar";
import type { XZ } from "@/lib/skill5/site-model";

function toneVector(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

const receiverVertex = `
  #include <common>
  #include <shadowmap_pars_vertex>
  varying vec3 vWorld;
  void main() {
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    #include <worldpos_vertex>
    #include <shadowmap_vertex>
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  }
`;

const flatFragment = `
  #include <common>
  #include <packing>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>
  uniform vec3 uLit;
  uniform vec3 uShade;
  void main() {
    gl_FragColor = vec4(mix(uShade, uLit, getShadowMask()), 1.0);
  }
`;

function flatReceiver(lit: string, shade: string) {
  return new ShaderMaterial({
    lights: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: UniformsUtils.merge([
      UniformsLib.lights,
      { uLit: { value: toneVector(lit) }, uShade: { value: toneVector(shade) } },
    ]),
    vertexShader: receiverVertex,
    fragmentShader: flatFragment,
  });
}

/** Context stays darker than the masses. Shade is a step down, not a black cut. */
export const sunlitLandMaterial = flatReceiver("#242a2e", "#0c1012");
export const sunlitSiteMaterial = flatReceiver("#2c3438", "#101416");
/** The selected parcel, a quiet step above the surrounding ground in both light and shade. */
export const sunlitParcelMaterial = flatReceiver("#323a3e", "#141a1c");
export const sunlitRoadMaterial = flatReceiver("#363e42", "#181e22");

/** Matte mass. Roofs sit a step above the walls, and shadow keeps the face readable. */
export const studyMassMaterial = new ShaderMaterial({
  lights: true,
  side: DoubleSide,
  transparent: false,
  depthWrite: true,
  toneMapped: false,
  shadowSide: FrontSide,
  uniforms: UniformsUtils.merge([UniformsLib.lights, {}]),
  vertexShader: `
    #include <common>
    #include <shadowmap_pars_vertex>
    attribute float aEstimate;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vEstimate;
    void main() {
      vEstimate = aEstimate;
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <begin_vertex>
      #include <project_vertex>
      #include <worldpos_vertex>
      #include <shadowmap_vertex>
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vNormal = mat3(modelMatrix) * normal;
    }
  `,
  fragmentShader: `
    #include <common>
    #include <packing>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vEstimate;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorld);
      if (dot(n, viewDir) < 0.0) discard;
      float roof = smoothstep(0.55, 0.92, abs(n.y));
      float form = 0.82 + 0.18 * clamp(dot(n, normalize(vec3(0.35, 0.86, 0.24))), 0.0, 1.0);
      vec3 wall = mix(vec3(0.30, 0.32, 0.33), vec3(0.25, 0.27, 0.28), vEstimate);
      vec3 roofColor = mix(vec3(0.40, 0.43, 0.44), vec3(0.34, 0.36, 0.37), vEstimate);
      vec3 color = mix(wall, roofColor, roof) * form;
      color = mix(color * 0.38, color, getShadowMask());
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

export const studyDeckMaterial = new ShaderMaterial({
  lights: true,
  side: DoubleSide,
  toneMapped: false,
  uniforms: UniformsUtils.merge([UniformsLib.lights, {}]),
  vertexShader: receiverVertex,
  fragmentShader: `
    #include <common>
    #include <packing>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    varying vec3 vWorld;
    void main() {
      vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      float up = abs(n.y);
      vec3 color = mix(vec3(0.16, 0.17, 0.18), vec3(0.25, 0.27, 0.28), smoothstep(0.45, 0.85, up));
      color = mix(color * 0.50, color, getShadowMask());
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const deckShade = `
  float up = abs(n.y);
  vec3 color = mix(uSide, uTop, smoothstep(0.4, 0.82, up));
  color = mix(color * 0.52, color, getShadowMask());
  gl_FragColor = vec4(color, 1.0);
`;

function tonedDeck(side: [number, number, number], top: [number, number, number]) {
  return new ShaderMaterial({
    lights: true,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: UniformsUtils.merge([
      UniformsLib.lights,
      { uSide: { value: new Vector3(...side) }, uTop: { value: new Vector3(...top) } },
    ]),
    vertexShader: receiverVertex,
    fragmentShader: `
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      uniform vec3 uSide;
      uniform vec3 uTop;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        ${deckShade}
      }
    `,
  });
}

/** Street pavement sits above the ground. Deck tops sit above the streets, and the fascia stays darker. */
export const measuredRoadMaterial = tonedDeck([0.15, 0.16, 0.17], [0.23, 0.25, 0.26]);
export const measuredDeckMaterial = tonedDeck([0.11, 0.12, 0.13], [0.31, 0.33, 0.34]);

export const studyWaterMaterial = new ShaderMaterial({
  lights: true,
  side: DoubleSide,
  toneMapped: false,
  uniforms: UniformsUtils.merge([UniformsLib.lights, { uTime: { value: 0 } }]),
  vertexShader: `
    #include <common>
    #include <shadowmap_pars_vertex>
    varying vec3 vWorld;
    varying float vTop;
    void main() {
      vTop = step(0.49, position.y);
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <begin_vertex>
      #include <project_vertex>
      #include <worldpos_vertex>
      #include <shadowmap_vertex>
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    }
  `,
  fragmentShader: `
    #include <common>
    #include <packing>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    uniform float uTime;
    varying vec3 vWorld;
    varying float vTop;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    void main() {
      if (vTop < 0.5) {
        gl_FragColor = vec4(vec3(0.07, 0.09, 0.10) * mix(0.48, 1.0, getShadowMask()), 1.0);
        return;
      }
      vec2 p = vWorld.xz;
      vec2 drift = vec2(uTime * 0.45, -uTime * 0.28);
      float broad = noise(p * 0.012 + drift * 0.04);
      vec3 color = mix(vec3(0.05, 0.07, 0.08), vec3(0.08, 0.11, 0.12), broad);
      color = mix(color * 0.48, color, getShadowMask());
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const rayMaterial = new MeshBasicMaterial({ color: "#bdbdbd", toneMapped: false, side: DoubleSide });
const solarMarkMaterial = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 1, depthTest: false, depthWrite: false, toneMapped: false, side: DoubleSide });
const solarHaloMaterial = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.28, depthTest: false, depthWrite: false, toneMapped: false, side: DoubleSide });
const solarGroundMaterial = new MeshBasicMaterial({ color: "#f7f7f4", transparent: true, opacity: 0.62, depthTest: false, depthWrite: false, toneMapped: false, side: DoubleSide });
const solarArchMaterial = new MeshBasicMaterial({ color: "#f7f7f4", transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, toneMapped: false, side: DoubleSide });
const solarVeilMaterial = new ShaderMaterial({
  transparent: true,
  depthTest: false,
  depthWrite: false,
  side: DoubleSide,
  toneMapped: false,
  vertexShader: `
    attribute float aAcross;
    attribute float aEnd;
    varying float vAcross;
    varying float vEnd;
    void main() {
      vAcross = aAcross;
      vEnd = aEnd;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying float vAcross;
    varying float vEnd;
    void main() {
      float spine = 1.0 - smoothstep(0.0, 0.85, abs(vAcross));
      float edge = 1.0 - smoothstep(0.82, 1.0, abs(vAcross));
      float alpha = (0.06 + spine * 0.1) * edge;
      if (alpha < 0.004) discard;
      vec3 color = mix(vec3(0.96, 0.96, 0.95), vec3(1.0, 0.95, 0.88), spine * 0.35);
      gl_FragColor = vec4(color, alpha);
    }
  `,
});

function clockTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function pointToward(origin: readonly [number, number], east: number, up: number, north: number, radius: number) {
  return new Vector3(origin[0] + east * radius, up * radius, origin[1] + north * radius);
}

function groundRing(origin: readonly [number, number], radius: number) {
  const stroke = Math.max(1.5, radius * 0.0036);
  const geometry = new RingGeometry(Math.max(radius - stroke, 0.1), radius + stroke, 180);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(origin[0], 2.5, origin[1]);
  return geometry;
}

function northTick(origin: readonly [number, number], radius: number) {
  const length = Math.max(10, radius * 0.04);
  const thickness = Math.max(1.2, radius * 0.0024);
  const geometry = new BoxGeometry(thickness, 1.6, length);
  geometry.translate(origin[0], 3.2, origin[1] + radius + length * 0.15);
  return geometry;
}

const BAND_HALF = 0.26;

function mixOnSphere(from: Vector3, to: Vector3, t: number) {
  return from.clone().lerp(to, t).normalize();
}

/** The sphere point where the great-circle segment crosses the horizon. */
function horizonHit(below: Vector3, above: Vector3) {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step += 1) {
    const mid = (low + high) / 2;
    if (mixOnSphere(below, above, mid).y > 0) high = mid;
    else low = mid;
  }
  const hit = mixOnSphere(below, above, high);
  hit.y = 0;
  return hit.normalize();
}

function offsetFromPole(direction: Vector3, pole: Vector3, angle: number) {
  const toward = pole.clone().addScaledVector(direction, -pole.dot(direction));
  if (toward.lengthSq() < 1e-10) return direction.clone();
  toward.normalize();
  const shifted = direction.clone().multiplyScalar(Math.cos(angle)).addScaledVector(toward, Math.sin(angle)).normalize();
  if (shifted.y >= 0) return shifted;
  if (direction.y <= 0) return horizonHit(shifted, direction.clone().setY(Math.max(direction.y, 0.02)).normalize());
  return horizonHit(shifted, direction);
}

/** One seasonal arc on the celestial sphere, from horizon to horizon. */
function dayDirections(latitude: number, longitude: number, date: string) {
  const directions: Vector3[] = [];
  let previous: Vector3 | null = null;
  for (let minute = 0; minute <= 24 * 60; minute += 4) {
    const sample = solarAt(latitude, longitude, date, clockTime(minute));
    const direction = new Vector3(sample.toSun[0], sample.toSun[1], sample.toSun[2]);
    if (direction.lengthSq() < 1e-8) continue;
    direction.normalize();
    const above = direction.y > 0.0008;
    if (previous && above !== previous.y > 0.0008) {
      directions.push(above ? horizonHit(previous, direction) : horizonHit(direction, previous));
    }
    if (above) directions.push(direction);
    previous = direction;
  }
  if (directions.length >= 2) {
    directions[0] = seatOnRing(directions[0]);
    directions[directions.length - 1] = seatOnRing(directions[directions.length - 1]);
  }
  return directions;
}

/** Drop a direction onto the horizon so the arch ends on the ground ring. */
function seatOnRing(direction: Vector3) {
  const seated = direction.clone();
  seated.y = 0;
  if (seated.lengthSq() < 1e-8) seated.set(1, 0, 0);
  return seated.normalize();
}

/**
 * A regular slice of the sun-path dome: the day's path, widened by a fixed
 * angle toward and away from the celestial pole, and ended on the horizon.
 */
function solarDome(directions: readonly Vector3[], pole: Vector3, origin: readonly [number, number], radius: number) {
  const center = new Vector3(origin[0], 0, origin[1]);
  const acrossSteps = 8;
  const cols = acrossSteps + 1;
  const positions: number[] = [];
  const acrossAttr: number[] = [];
  const endAttr: number[] = [];
  const indices: number[] = [];
  const path: Vector3[] = [];
  const ringY = 2.5;
  const stroke = Math.max(1.5, radius * 0.0036);
  const pinToRing = (x: number, z: number, reach: number) => {
    const radialX = x - center.x;
    const radialZ = z - center.z;
    const span = Math.hypot(radialX, radialZ) || 1;
    return [center.x + (radialX / span) * reach, ringY, center.z + (radialZ / span) * reach];
  };
  directions.forEach((direction, index) => {
    const endT = directions.length > 1 ? index / (directions.length - 1) : 0;
    const atEnd = index === 0 || index === directions.length - 1;
    const onPath = center.clone().addScaledVector(direction, radius);
    const pinnedPath = pinToRing(onPath.x, onPath.z, radius + stroke);
    path.push(atEnd ? new Vector3(pinnedPath[0], pinnedPath[1], pinnedPath[2]) : onPath);
    for (let step = 0; step <= acrossSteps; step += 1) {
      const acrossT = (step / acrossSteps) * 2 - 1;
      const placed = center.clone().addScaledVector(offsetFromPole(direction, pole, -acrossT * BAND_HALF), radius);
      const pinned = atEnd ? pinToRing(placed.x, placed.z, radius + stroke) : [placed.x, placed.y, placed.z];
      positions.push(pinned[0], pinned[1], pinned[2]);
      acrossAttr.push(acrossT);
      endAttr.push(endT);
    }
    if (index === 0) return;
    const previous = (index - 1) * cols;
    const current = index * cols;
    for (let col = 0; col < acrossSteps; col += 1) {
      const a0 = previous + col;
      const a1 = a0 + 1;
      const b0 = current + col;
      const b1 = b0 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  });
  const fill = new BufferGeometry();
  fill.setAttribute("position", new Float32BufferAttribute(positions, 3));
  fill.setAttribute("aAcross", new Float32BufferAttribute(acrossAttr, 1));
  fill.setAttribute("aEnd", new Float32BufferAttribute(endAttr, 1));
  fill.setIndex(indices);
  const arch = new TubeGeometry(
    new CatmullRomCurve3(path, false, "centripetal"),
    Math.max(120, path.length * 2),
    Math.max(1.4, radius * 0.0026),
    6,
    false,
  );
  return { fill, arch };
}

function sunRay(origin: readonly [number, number], east: number, up: number, north: number) {
  const length = 920;
  const half = 3.5;
  const x = origin[0];
  const y = 96;
  const z = origin[1];
  const span = Math.hypot(-north, east) || 1;
  const ox = (-north / span) * half;
  const oz = (east / span) * half;
  const x1 = x + east * length;
  const y1 = y + up * length;
  const z1 = z + north * length;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    x - ox, y, z - oz,
    x + ox, y, z + oz,
    x1 + ox, y1, z1 + oz,
    x - ox, y, z - oz,
    x1 + ox, y1, z1 + oz,
    x1 - ox, y1, z1 - oz,
  ], 3));
  return geometry;
}

function skipRaycast() {}

/** Ramp deck kept off the picture layer so it can cast without a second visible surface. */
export function RampShadowCaster({ geometry }: { geometry: BufferGeometry }) {
  const mesh = useRef<Mesh>(null);
  useLayoutEffect(() => {
    mesh.current?.layers.set(1);
  }, []);
  return (
    <mesh ref={mesh} geometry={geometry} castShadow raycast={skipRaycast}>
      <meshBasicMaterial colorWrite={false} depthWrite side={DoubleSide} />
    </mesh>
  );
}

/** Shaft from the stored podium up to the published architectural height. */
export function towerShaft(ring: readonly XZ[], baseFeet: number, heightFeet: number) {
  const geometry = prismGeometry(ring, Math.max(heightFeet - baseFeet, 0.1));
  geometry.translate(0, baseFeet, 0);
  geometry.setAttribute("aEstimate", new Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count), 1));
  return geometry;
}


/** A round sun mark. A ring would turn edge-on under the mirrored site view. */
function SunCircle({ position, radius }: { position: Vector3; radius: number }) {
  const geometry = useMemo(() => new SphereGeometry(radius, 24, 16), [radius]);
  const halo = useMemo(() => new SphereGeometry(radius * 2.15, 24, 16), [radius]);
  useLayoutEffect(() => () => {
    geometry.dispose();
    halo.dispose();
  }, [geometry, halo]);
  return (
    <group position={position}>
      <mesh geometry={halo} material={solarHaloMaterial} renderOrder={10} raycast={skipRaycast} />
      <mesh geometry={geometry} material={solarMarkMaterial} renderOrder={11} raycast={skipRaycast} />
    </group>
  );
}

/** One seasonal trajectory and the sun at the selected time. The shadow itself is the light's shadow map. */
export function SunShadow({
  sun,
  origin,
  arc,
}: {
  sun: SunSample;
  origin: readonly [number, number];
  arc?: { latitude: number; longitude: number; date: string; radius: number } | null;
}) {
  const [east, up, north] = sun.toSun;
  const ray = useMemo(() => (arc ? null : sunRay(origin, east, up, north)), [arc, east, north, origin, up]);
  const latitude = arc?.latitude;
  const longitude = arc?.longitude;
  const radius = arc?.radius;
  const diagram = useMemo(() => {
    if (latitude == null || longitude == null || radius == null || !arc) return null;
    const directions = dayDirections(latitude, longitude, arc.date);
    if (directions.length < 2) return null;
    const pole = new Vector3(0, Math.sin(latitude * Math.PI / 180), Math.cos(latitude * Math.PI / 180)).normalize();
    return {
      dome: solarDome(directions, pole, origin, radius),
      ground: groundRing(origin, radius),
      north: northTick(origin, radius),
    };
  }, [arc, latitude, longitude, origin, radius]);
  const sunPosition = useMemo(
    () => (arc && sun.above ? pointToward(origin, east, up, north, arc.radius) : null),
    [arc, east, north, origin, sun.above, up],
  );
  useLayoutEffect(() => () => ray?.dispose(), [ray]);
  useLayoutEffect(() => () => {
    diagram?.dome.fill.dispose();
    diagram?.dome.arch.dispose();
    diagram?.ground.dispose();
    diagram?.north.dispose();
  }, [diagram]);
  if (diagram) {
    return (
      <group raycast={skipRaycast}>
        <mesh geometry={diagram.ground} material={solarGroundMaterial} renderOrder={6} raycast={skipRaycast} />
        <mesh geometry={diagram.north} material={solarGroundMaterial} renderOrder={6} raycast={skipRaycast} />
        <mesh geometry={diagram.dome.fill} material={solarVeilMaterial} renderOrder={7} raycast={skipRaycast} />
        <mesh geometry={diagram.dome.arch} material={solarArchMaterial} renderOrder={9} raycast={skipRaycast} />
        {sunPosition && arc ? <SunCircle position={sunPosition} radius={Math.max(14, arc.radius * 0.018)} /> : null}
      </group>
    );
  }
  if (!ray || !sun.above) return null;
  return <mesh geometry={ray} material={rayMaterial} raycast={skipRaycast} />;
}

const viewPoint = new Vector3();
const inverse = new Matrix4();

/** One shadow-casting sun. The camera frame includes every ground projection, with no ray cutoff. */
export function SunLight({
  sun,
  box,
  onTexel,
}: {
  sun: SunSample;
  box: StoredBox;
  onTexel?: (feet: number) => void;
}) {
  const light = useRef<DirectionalLight>(null);
  const target = useRef<Object3D>(null);
  const gl = useThree((state) => state.gl);
  const report = useRef(onTexel);
  report.current = onTexel;
  useLayoutEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = PCFShadowMap;
    const sunLight = light.current;
    const aim = target.current;
    if (!sunLight || !aim) return;
    const center = new Vector3((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, -((box.minZ + box.maxZ) / 2));
    const toward = new Vector3(sun.toSun[0], sun.toSun[1], -sun.toSun[2]).normalize();
    const reach = Math.hypot(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ);
    sunLight.position.copy(center).addScaledVector(toward, reach + 2000);
    aim.position.copy(center);
    aim.updateMatrixWorld();
    sunLight.target = aim;
    sunLight.updateMatrixWorld();
    const camera = sunLight.shadow.camera as OrthographicCamera;
    camera.layers.enable(1);
    camera.position.copy(sunLight.position);
    camera.lookAt(aim.position);
    camera.updateMatrixWorld();
    inverse.copy(camera.matrixWorldInverse);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, y, z] of storedShadowPoints(box, sun.toSun)) {
      viewPoint.set(x, y, -z).applyMatrix4(inverse);
      minX = Math.min(minX, viewPoint.x);
      maxX = Math.max(maxX, viewPoint.x);
      minY = Math.min(minY, viewPoint.y);
      maxY = Math.max(maxY, viewPoint.y);
      minZ = Math.min(minZ, viewPoint.z);
      maxZ = Math.max(maxZ, viewPoint.z);
    }
    const padX = (maxX - minX) * 0.04 + 30;
    const padY = (maxY - minY) * 0.04 + 30;
    camera.left = minX - padX;
    camera.right = maxX + padX;
    camera.bottom = minY - padY;
    camera.top = maxY + padY;
    camera.near = Math.max(1, -maxZ - 80);
    camera.far = Math.max(camera.near + 1, -minZ + 80);
    camera.updateProjectionMatrix();
    const span = Math.max(camera.right - camera.left, camera.top - camera.bottom);
    let size = 2048;
    while (size < 8192 && span / size > 2) size *= 2;
    if (sunLight.shadow.mapSize.x !== size) {
      sunLight.shadow.mapSize.set(size, size);
      sunLight.shadow.map?.dispose();
      sunLight.shadow.map = null;
    }
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 2;
    sunLight.shadow.needsUpdate = true;
    studyMassMaterial.needsUpdate = true;
    studyDeckMaterial.needsUpdate = true;
    studyWaterMaterial.needsUpdate = true;
    markAnalysisWaterShadows();
    measuredRoadMaterial.needsUpdate = true;
    measuredDeckMaterial.needsUpdate = true;
    sunlitLandMaterial.needsUpdate = true;
    sunlitSiteMaterial.needsUpdate = true;
    sunlitRoadMaterial.needsUpdate = true;
    report.current?.(span / size);
    return () => {
      gl.shadowMap.enabled = false;
      report.current?.(0);
    };
  }, [box, gl, sun]);
  return (
    <>
      <directionalLight ref={light} intensity={0} castShadow />
      <object3D ref={target} />
    </>
  );
}
