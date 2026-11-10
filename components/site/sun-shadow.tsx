"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  PCFShadowMap,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type DirectionalLight,
  type Object3D,
} from "three";
import { prismGeometry } from "@/components/site/site-geometry";
import { storedShadowPoints, type StoredBox } from "@/lib/skill5/sun-analysis";
import { SHADOW_TONE, SUNLIT_LAND, SUNLIT_SITE, type SunSample } from "@/lib/skill5/solar";
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

function flatReceiver(hex: string) {
  return new ShaderMaterial({
    lights: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: UniformsUtils.merge([
      UniformsLib.lights,
      { uLit: { value: toneVector(hex) }, uShade: { value: toneVector(SHADOW_TONE) } },
    ]),
    vertexShader: receiverVertex,
    fragmentShader: flatFragment,
  });
}

export const sunlitLandMaterial = flatReceiver(SUNLIT_LAND);
export const sunlitSiteMaterial = flatReceiver(SUNLIT_SITE);
export const sunlitRoadMaterial = flatReceiver("#3c3c3c");

/** Same glass as the site model, plus surface shadows and a darker body where the height is not tagged. */
export const studyMassMaterial = new ShaderMaterial({
  lights: true,
  side: DoubleSide,
  transparent: true,
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
    float hairline(float coord, float stepSize) {
      float cell = coord / stepSize;
      float fw = max(fwidth(cell), 1e-4);
      float dist = min(fract(cell), 1.0 - fract(cell));
      return 1.0 - smoothstep(0.0, min(fw * 0.55, 0.045), dist);
    }
    void main() {
      vec3 n = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorld);
      if (dot(n, viewDir) < 0.0) discard;
      float up = abs(n.y);
      float wall = 1.0 - smoothstep(0.62, 0.9, up);
      float floors = hairline(vWorld.y, 72.0) * wall;
      float shade = 0.94 + 0.06 * clamp(dot(n, normalize(vec3(0.42, 0.86, 0.28))), 0.0, 1.0);
      vec3 color = mix(mix(vec3(0.30), vec3(0.24), vEstimate), mix(vec3(0.42), vec3(0.36), vEstimate), smoothstep(0.55, 0.92, up));
      color = mix(color, vec3(0.48), floors * 0.16);
      color *= shade;
      color = mix(color * 0.14, color, getShadowMask());
      float alpha = mix(0.68, 0.82, smoothstep(0.55, 0.92, up));
      gl_FragColor = vec4(color, alpha);
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
      vec3 color = mix(vec3(0.24), vec3(0.58), smoothstep(0.45, 0.85, up));
      color = mix(color * 0.18, color, getShadowMask());
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

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
        gl_FragColor = vec4(vec3(0.165) * mix(0.18, 1.0, getShadowMask()), 1.0);
        return;
      }
      vec2 p = vWorld.xz;
      vec2 drift = vec2(uTime * 0.45, -uTime * 0.28);
      float broad = noise(p * 0.012 + drift * 0.04);
      vec3 color = mix(vec3(0.09), vec3(0.15), broad);
      color = mix(color * 0.22, color, getShadowMask());
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const rayMaterial = new MeshBasicMaterial({ color: "#bdbdbd", toneMapped: false, side: DoubleSide });

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

/** Shaft from the stored podium up to the published architectural height. */
export function towerShaft(ring: readonly XZ[], baseFeet: number, heightFeet: number) {
  const geometry = prismGeometry(ring, Math.max(heightFeet - baseFeet, 0.1));
  geometry.translate(0, baseFeet, 0);
  geometry.setAttribute("aEstimate", new Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count), 1));
  return geometry;
}

/** Direction mark toward the sun. The shadow itself is the light's shadow map. */
export function SunShadow({
  sun,
  origin,
}: {
  sun: SunSample;
  origin: readonly [number, number];
}) {
  const [east, up, north] = sun.toSun;
  const ray = useMemo(() => sunRay(origin, east, up, north), [east, north, origin, up]);
  useLayoutEffect(() => () => ray.dispose(), [ray]);
  if (!sun.above) return null;
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
