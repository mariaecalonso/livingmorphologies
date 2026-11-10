"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  SRGBColorSpace,
  ShaderMaterial,
  TextureLoader,
  NoToneMapping,
  Vector2,
  Vector3,
  type Camera,
  type Texture,
} from "three";
import type { FaceHighlight } from "@/lib/skill5/face-match";
import {
  clipPath,
  clipPolygon,
  clipRoad,
  flatGeometry,
  inStudy,
  loopAttribute,
  pathAttribute,
  elevatedDeckGeometry,
  ringCentroid,
  displayRoads,
  pruneContextRoads,
  displayBuildingGeometry,
  groundRoadBlocks,
  groundRoadGeometry,
  regularizeRing,
  regularizeRoad,
  tidyLocalRoads,
  metromoverGeometry,
  slabGeometry,
  studyLandRing,
} from "./site-geometry";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { elevatedDeckRoads } from "@/lib/skill5/deck-surface";
import { HERALD_AERIAL } from "@/lib/skill5/aerial";
import { designSiteFromParcel } from "@/lib/skill5/design-site";
import { SITE_GRID_FEET } from "@/lib/skill5/grid";
import { northDegrees, placeAxon, placeModelPerspective, placePerspective, placePlan, placeSection, placeWholeSitePerspective, RENDER_GROUP_SCALE } from "@/lib/skill5/render-frame";
import { analysisTowers, casterBox } from "@/lib/skill5/sun-analysis";
import type { SunSample } from "@/lib/skill5/solar";
import { studyDeckMaterial, studyMassMaterial, studyWaterMaterial, SunLight, SunShadow, sunlitLandMaterial, sunlitRoadMaterial, sunlitSiteMaterial, towerShaft } from "./sun-shadow";
import { WindField } from "./wind-field";
import { SightLines } from "./sight-lines";
import { WalkLines } from "./walk-lines";
import { UseLines } from "./use-lines";
import type { SightSegment } from "@/lib/skill5/views-noise";
import type { WalkSegment } from "@/lib/skill5/pedestrian";
import type { UseSegment } from "@/lib/skill5/urban";
import { ModuleMeshes, useModulePointer, type SitePlacementModel } from "./module-field";
import { SiteAnalysisLayer, type SiteAnalysisLayers } from "./site-analysis-layer";
import type { NetworkNodeKind, SiteNetworkStudy } from "./site-network";
import { SiteNetworkLayer } from "./site-network-layer";
import { SitePocketLayer } from "./site-pocket-layer";
import { SiteZoneLayer, type ZoneTool } from "./site-zone-layer";
import type { NetworkPocket } from "@/lib/skill5/pockets";
import type { ZoneKind, ZonePoint, ZoningRegion } from "@/lib/skill5/zoning";

export type SiteViewMode = "perspective" | "plan" | "axon" | "section";
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
/** The property line is the design rectangle. Its weight is in screen pixels so the presentation scale does not break it into dashes. */
const SITE_EDGE = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  toneMapped: false,
  uniforms: {
    uMin: { value: new Vector2() },
    uMax: { value: new Vector2() },
    uPx: { value: 1.4 },
    uColor: { value: new Vector3(1, 1, 1) },
    uGlow: { value: 0.35 },
  },
  vertexShader: `
    varying vec2 vXZ;
    void main() {
      vXZ = position.xz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec2 uMin;
    uniform vec2 uMax;
    uniform float uPx;
    uniform vec3 uColor;
    uniform float uGlow;
    varying vec2 vXZ;
    void main() {
      vec2 center = (uMin + uMax) * 0.5;
      vec2 halfSize = (uMax - uMin) * 0.5;
      vec2 outside = abs(vXZ - center) - halfSize;
      float dist = length(max(outside, 0.0)) + min(max(outside.x, outside.y), 0.0);
      float pixel = max(length(fwidth(vXZ)), 1e-4);
      float core = 1.0 - smoothstep(0.0, pixel * uPx, abs(dist));
      float glow = (1.0 - smoothstep(0.0, pixel * uPx * 2.6, abs(dist))) * uGlow;
      float line = max(core, glow);
      if (line < 0.03) discard;
      gl_FragColor = vec4(uColor, line);
    }
  `,
});
const COAST_LINE = new LineBasicMaterial({ color: "#4a4a4a", transparent: true, opacity: 0.55 });
/** Every fifth 20 ft line. A display hierarchy only; spacing and snapping stay on the 20 ft grid. */
const GRID_MAJOR_FEET = SITE_GRID_FEET * 5;

/** Grid lines are drawn in device pixels so their weight follows the canvas, not the site's foot coordinates. */
const GRID_SHEET = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  toneMapped: false,
  uniforms: {
    uMinorOpacity: { value: 0.2 },
    uMajorOpacity: { value: 0.32 },
    uMinorPx: { value: 1 },
    uMajorPx: { value: 1.6 },
    uMinorColor: { value: new Vector3(0.42, 0.41, 0.39) },
    uMajorColor: { value: new Vector3(0.72, 0.70, 0.66) },
  },
  vertexShader: `
    varying vec2 vXZ;
    void main() {
      vXZ = position.xz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uMinorOpacity;
    uniform float uMajorOpacity;
    uniform float uMinorPx;
    uniform float uMajorPx;
    uniform vec3 uMinorColor;
    uniform vec3 uMajorColor;
    varying vec2 vXZ;
    float hairline(float stepSize, float px) {
      vec2 cell = vXZ / stepSize;
      vec2 fw = max(fwidth(cell), vec2(1e-4));
      vec2 dist = min(fract(cell), 1.0 - fract(cell));
      float alongX = 1.0 - smoothstep(0.0, min(fw.x * px, 0.42), dist.x);
      float alongZ = 1.0 - smoothstep(0.0, min(fw.y * px, 0.42), dist.y);
      return max(alongX, alongZ);
    }
    void main() {
      float minor = hairline(${SITE_GRID_FEET}.0, uMinorPx);
      float major = hairline(${GRID_MAJOR_FEET}.0, uMajorPx);
      float alpha = max(minor * uMinorOpacity, major * uMajorOpacity);
      if (alpha < 0.015) discard;
      vec3 color = mix(uMinorColor, uMajorColor, major);
      gl_FragColor = vec4(color, alpha);
    }
  `,
});

/** The presentation sheet is scaled to the window. Line weight uses the width the window actually shows. */
function displayedCanvasWidth(canvas: HTMLCanvasElement) {
  const view = canvas.ownerDocument.defaultView;
  const local = canvas.getBoundingClientRect().width;
  const frame = view?.frameElement;
  if (frame instanceof HTMLElement && view && view.innerWidth > 0) {
    return local * (frame.getBoundingClientRect().width / view.innerWidth);
  }
  return local;
}

/** Close in, a 20 ft cell spans many pixels and the lines stay faint. With the whole site in view, the 100 ft lines carry the reading. */
function fadeSiteGrid(feetPerPixel: number, devicePixelsPerPixel: number, grid: ShaderMaterial = GRID_SHEET, edge: ShaderMaterial = SITE_EDGE, quiet = false, focus = false) {
  const cell = SITE_GRID_FEET / Math.max(1e-6, feetPerPixel);
  const far = Math.min(1, Math.max(0, Math.log2(36 / cell) / Math.log2(36 / 8)));
  const dense = cell < 8 ? Math.max(0.15, (cell - 3) / 5) : 1;
  const pixels = Math.max(1, devicePixelsPerPixel);
  if (focus) {
    grid.uniforms.uMinorOpacity.value = (0.025 + 0.01 * far) * dense;
    grid.uniforms.uMajorOpacity.value = 0.055 + 0.02 * far;
    grid.uniforms.uMinorPx.value = 0.35 * pixels;
    grid.uniforms.uMajorPx.value = 0.55 * pixels;
    edge.uniforms.uPx.value = 1.05 * pixels;
    return;
  }
  if (quiet) {
    grid.uniforms.uMinorOpacity.value = (0.045 + 0.02 * far) * dense;
    grid.uniforms.uMajorOpacity.value = 0.2 + 0.08 * far;
    grid.uniforms.uMinorPx.value = (cell < 6 ? 0.4 : 0.6) * pixels;
    grid.uniforms.uMajorPx.value = 0.85 * pixels;
    edge.uniforms.uPx.value = 1.35 * pixels;
    return;
  }
  grid.uniforms.uMinorOpacity.value = (0.2 + 0.34 * far) * dense;
  grid.uniforms.uMajorOpacity.value = 0.32 + 0.5 * far;
  grid.uniforms.uMinorPx.value = (cell < 6 ? 0.55 : 0.9) * pixels;
  grid.uniforms.uMajorPx.value = 1.55 * pixels;
  edge.uniforms.uPx.value = 1.15 * pixels;
}

function sheetGeometry(ring: readonly XZ[], y: number, pad = 0) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    minX - pad, y, minZ - pad, maxX + pad, y, minZ - pad, maxX + pad, y, maxZ + pad,
    minX - pad, y, minZ - pad, maxX + pad, y, maxZ + pad, minX - pad, y, maxZ + pad,
  ], 3));
  return geometry;
}

function gridSheet(ring: readonly XZ[]) {
  return sheetGeometry(ring, 1.08);
}

function siteEdgeSheet(ring: readonly XZ[], edge: ShaderMaterial = SITE_EDGE) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  edge.uniforms.uMin.value.set(minX, minZ);
  edge.uniforms.uMax.value.set(maxX, maxZ);
  return sheetGeometry(ring, 1.2, 24);
}

type SheetSet = { grid: ShaderMaterial; edge: ShaderMaterial; quiet: boolean; focus?: boolean };

function studySheets(): SheetSet {
  const grid = GRID_SHEET.clone();
  const edge = SITE_EDGE.clone();
  (grid.uniforms.uMinorColor.value as Vector3).set(0.72, 0.72, 0.72);
  (grid.uniforms.uMajorColor.value as Vector3).set(1, 1, 1);
  (edge.uniforms.uColor.value as Vector3).set(1, 1, 1);
  edge.uniforms.uGlow.value = 0;
  return { grid, edge, quiet: true };
}

type StudyLook = {
  sheets: SheetSet;
  coast: LineBasicMaterial;
  flat: LineBasicMaterial;
};

function studyLook(): StudyLook {
  return {
    sheets: studySheets(),
    coast: new LineBasicMaterial({ color: "#5c5c5c", transparent: true, opacity: 0.5 }),
    flat: new LineBasicMaterial({ color: "#707070", transparent: true, opacity: 0.68 }),
  };
}

/** Analysis keeps the property rectangle quiet so the measured parcel line can lead. */
function analysisSheets(): SheetSet {
  const grid = GRID_SHEET.clone();
  const edge = SITE_EDGE.clone();
  (grid.uniforms.uMinorColor.value as Vector3).set(0.28, 0.28, 0.28);
  (grid.uniforms.uMajorColor.value as Vector3).set(0.4, 0.4, 0.4);
  (edge.uniforms.uColor.value as Vector3).set(0.55, 0.55, 0.55);
  edge.uniforms.uGlow.value = 0;
  return { grid, edge, quiet: true, focus: true };
}

function analysisLook(): StudyLook {
  return {
    sheets: analysisSheets(),
    coast: new LineBasicMaterial({ color: "#3e3e3e", transparent: true, opacity: 0.32 }),
    flat: new LineBasicMaterial({ color: "#555555", transparent: true, opacity: 0.4 }),
  };
}

function releaseLook(look: StudyLook) {
  look.sheets.grid.dispose();
  look.sheets.edge.dispose();
  look.coast.dispose();
  look.flat.dispose();
}

/** Smoked glass on the existing prisms. One outward shell, a fine floor etching, no reflection. */
const MODEL_MASS = new ShaderMaterial({
  side: DoubleSide,
  transparent: true,
  depthWrite: true,
  toneMapped: false,
  vertexShader: `
    varying vec3 vWorld;
    varying vec3 vNormal;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vNormal = mat3(modelMatrix) * normal;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
    varying vec3 vWorld;
    varying vec3 vNormal;
    float hairline(float coord, float stepSize) {
      float cell = coord / stepSize;
      float fw = max(fwidth(cell), 1e-4);
      float dist = min(fract(cell), 1.0 - fract(cell));
      return 1.0 - smoothstep(0.0, min(fw * 0.75, 0.07), dist);
    }
    void main() {
      vec3 n = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorld);
      if (dot(n, viewDir) < 0.0) discard;
      float up = abs(n.y);
      float wall = 1.0 - smoothstep(0.62, 0.9, up);
      float floors = hairline(vWorld.y, 18.0) * wall;
      float shade = 0.9 + 0.1 * clamp(dot(n, normalize(vec3(0.42, 0.86, 0.28))), 0.0, 1.0);
      vec3 color = mix(vec3(0.42), vec3(0.56), smoothstep(0.55, 0.92, up));
      color = mix(color, vec3(0.84), floors * 0.5);
      float alpha = mix(0.82, 0.92, smoothstep(0.55, 0.92, up));
      gl_FragColor = vec4(color * shade, alpha);
    }
  `,
});

const MODEL_EDGE = new LineBasicMaterial({
  color: "#b4b4b4",
  transparent: true,
  opacity: 1,
  depthWrite: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

/** Charcoal bay on the existing slab. Fine ripples move in the shade; the mesh stays put. */
const WATER = new ShaderMaterial({
  side: DoubleSide,
  toneMapped: false,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `
    varying vec3 vWorld;
    varying float vTop;
    void main() {
      vTop = step(0.49, position.y);
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
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
        gl_FragColor = vec4(vec3(0.165), 1.0);
        return;
      }
      vec2 p = vWorld.xz;
      float pixel = max(length(fwidth(p)), 1e-3);
      vec2 drift = vec2(uTime * 1.8, -uTime * 1.15);
      vec2 bend = vec2(noise(p * 0.02 + drift * 0.08), noise(p * 0.017 + vec2(5.1, 2.4) - drift * 0.07));
      vec2 q = p + (bend - 0.5) * 16.0 + drift;
      float broad = noise(q * 0.09);
      float detailWeight = smoothstep(12.0, 2.2, pixel);
      float detail = noise(q * 0.22) * detailWeight;
      float grainWeight = smoothstep(6.0, 1.4, pixel);
      float grain = noise(q * 0.5) * grainWeight;
      float crest = clamp(broad * 0.22 + detail * 0.46 + grain * 0.32, 0.0, 1.0);
      float eps = 3.0;
      float dx = noise((q + vec2(eps, 0.0)) * 0.15) - noise(q * 0.15);
      float dz = noise((q + vec2(0.0, eps)) * 0.15) - noise(q * 0.15);
      vec3 n = normalize(vec3(-dx * 0.55, 1.0, -dz * 0.55));
      vec3 viewDir = normalize(cameraPosition - vWorld);
      float fresnel = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 2.8);
      vec3 color = mix(vec3(0.125), vec3(0.22), crest);
      color = mix(color, vec3(0.32), fresnel * 0.28);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

function WaterSurface({ geometry, receive, calm = false }: { geometry: BufferGeometry; receive: boolean; calm?: boolean }) {
  const material = receive ? studyWaterMaterial : calm ? ANALYSIS_WATER : WATER;
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  return <mesh geometry={geometry} material={material} receiveShadow={receive} raycast={skipRaycast} />;
}

/** Solid matte deck. Tops are a little lighter than the sides, and the slab stays opaque. */
const MODEL_DECK = new ShaderMaterial({
  side: DoubleSide,
  toneMapped: false,
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
    varying vec3 vWorld;
    void main() {
      vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      float up = abs(n.y);
      vec3 color = mix(vec3(0.40), vec3(0.56), smoothstep(0.45, 0.85, up));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

/** Analysis glass. Fewer, fainter floor lines, so the façade stays quiet. */
const ANALYSIS_MASS = new ShaderMaterial({
  side: DoubleSide,
  transparent: true,
  depthWrite: true,
  toneMapped: false,
  vertexShader: MODEL_MASS.vertexShader,
  fragmentShader: `
    varying vec3 vWorld;
    varying vec3 vNormal;
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
      vec3 color = mix(vec3(0.30), vec3(0.42), smoothstep(0.55, 0.92, up));
      color = mix(color, vec3(0.48), floors * 0.16);
      float alpha = mix(0.68, 0.82, smoothstep(0.55, 0.92, up));
      gl_FragColor = vec4(color, alpha);
    }
  `,
});

const ANALYSIS_EDGE = new LineBasicMaterial({
  color: "#8f8f8f",
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

/** Opaque slab, lighter on top, so a deck does not read as smoked glass. */
const ANALYSIS_DECK = new ShaderMaterial({
  side: DoubleSide,
  toneMapped: false,
  vertexShader: MODEL_DECK.vertexShader,
  fragmentShader: `
    varying vec3 vWorld;
    void main() {
      vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      float up = abs(n.y);
      vec3 color = mix(vec3(0.24), vec3(0.58), smoothstep(0.45, 0.85, up));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

/** Bay with a slow, broad shade. The surface stays in place. */
const ANALYSIS_WATER = new ShaderMaterial({
  side: DoubleSide,
  toneMapped: false,
  uniforms: { uTime: { value: 0 } },
  vertexShader: WATER.vertexShader,
  fragmentShader: `
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
        gl_FragColor = vec4(vec3(0.12), 1.0);
        return;
      }
      vec2 p = vWorld.xz;
      vec2 drift = vec2(uTime * 0.45, -uTime * 0.28);
      float broad = noise(p * 0.012 + drift * 0.04);
      vec3 color = mix(vec3(0.09), vec3(0.15), broad);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const PARCEL_LINE = new MeshBasicMaterial({
  color: "#f4f4f0",
  transparent: true,
  opacity: 0.96,
  depthWrite: false,
  toneMapped: false,
  side: DoubleSide,
});

function boundaryRibbon(ring: readonly XZ[], y: number, half: number) {
  const closed = ring.length > 1 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
    ? [...ring, ring[0]]
    : ring;
  const positions: number[] = [];
  for (let index = 1; index < closed.length; index += 1) {
    const ax = closed[index - 1][0];
    const az = closed[index - 1][1];
    const bx = closed[index][0];
    const bz = closed[index][1];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    const px = (-dz / length) * half;
    const pz = (dx / length) * half;
    positions.push(ax + px, y, az + pz, bx + px, y, bz + pz, bx - px, y, bz - pz, ax + px, y, az + pz, bx - px, y, bz - pz, ax - px, y, az - pz);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

function MassEdges({ geometry, material = MODEL_EDGE, threshold = 28 }: { geometry: BufferGeometry; material?: LineBasicMaterial; threshold?: number }) {
  const edges = useMemo(() => new EdgesGeometry(geometry, threshold), [geometry, threshold]);
  useEffect(() => () => edges.dispose(), [edges]);
  return <lineSegments geometry={edges} material={material} renderOrder={4} raycast={skipRaycast} />;
}
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
  showSunPath = true,
  ground,
  appearance,
  presentation = "model",
  sheetsRef,
  sun,
  linework,
  showContext,
}: {
  context: SiteContext;
  showGrid: boolean;
  showAerial: boolean;
  showSunPath?: boolean;
  ground?: ReturnType<typeof useModulePointer>["ground"];
  appearance: "record" | "model";
  presentation?: "model" | "analysis";
  sheetsRef: { current: SheetSet };
  sun: SunSample | null;
  linework: boolean;
  showContext: boolean;
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
  const study = appearance === "model";
  const focused = presentation === "analysis";
  const [look, setLook] = useState<StudyLook | null>(() => (appearance === "model" ? (presentation === "analysis" ? analysisLook() : studyLook()) : null));
  useEffect(() => {
    if (appearance !== "model") {
      setLook(null);
      return;
    }
    const next = focused ? analysisLook() : studyLook();
    setLook(next);
    return () => releaseLook(next);
  }, [appearance, focused]);
  const sheets = look?.sheets ?? { grid: GRID_SHEET, edge: SITE_EDGE, quiet: false };
  const coastLine = look?.coast ?? COAST_LINE;
  const flatLine = look?.flat ?? FLAT_LINE;
  sheetsRef.current = sheets;
  const parcel = useMemo(() => (focused ? boundaryRibbon(context.site.ring, 1.55, 5) : null), [context.site.ring, focused]);
  useEffect(() => () => parcel?.dispose(), [parcel]);
  const sunOrigin = useMemo(() => ringCentroid(designSiteFromParcel(context.site.ring).ring), [context]);
  const sunlit = Boolean(sun?.above);
  const studyHeights = sun !== null;
  const geometries = useMemo(() => {
    const visible = context.buildings.filter((building) => {
      const [x, z] = ringCentroid(building.ring);
      return inStudy(x, z);
    });
    const flat = visible.filter((building) => building.heightFeet === null);
    const sourceRoads = tidyLocalRoads(pruneContextRoads(displayRoads(context.roads)));
    const clipRoads = (roads: typeof context.roads) => roads.map((road) => regularizeRoad(road)).flatMap((road) => clipRoad(road));
    const elevatedRoads = clipRoads(elevatedDeckRoads(sourceRoads));
    const groundRoads = clipRoads(sourceRoads.filter((road) => !road.elevated));
    const design = designSiteFromParcel(context.site.ring);
    return {
      land: flatGeometry(studyLandRing(context.water.ring), 0),
      water: slabGeometry(clipPolygon(context.water.ring), 0.5, 0),
      siteEdge: siteEdgeSheet(design.ring, sheets.edge),
      siteFill: study ? flatGeometry(design.ring, 0.86) : null,
      coast: lineGeometry(pathAttribute(clipPath(context.coastline.path), 0.2, false)),
      elevated: elevatedDeckGeometry(elevatedRoads),
      guideway: metromoverGeometry(context.origin),
      groundRoads,
      roadBlocks: groundRoadBlocks(visible, context.water.ring, design.ring),
      roadLimits: [clipPolygon(context.water.ring), design.ring],
      flatEdges: lineGeometry(loopAttribute(flat.flatMap((building) => [clipPolygon(regularizeRing(building.ring)), ...(building.holes ?? []).map((hole) => clipPolygon(regularizeRing(hole)))].filter((ring) => ring.length >= 3)), 0.35)),
      grid: gridSheet(design.ring),
    };
  }, [context, sheets.edge, study]);

  useEffect(() => () => {
    geometries.land.dispose();
    geometries.water.dispose();
    geometries.siteEdge.dispose();
    geometries.siteFill?.dispose();
    geometries.coast.dispose();
    geometries.elevated.dispose();
    geometries.guideway.dispose();
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
    displayBuildingGeometry(visible, { roads: geometries.groundRoads, blocked: geometries.roadBlocks, limits: geometries.roadLimits }, studyHeights).then((geometry) => {
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
  }, [context, geometries.groundRoads, geometries.roadBlocks, geometries.roadLimits, studyHeights]);
  const towerGeometries = useMemo(() => {
    if (!studyHeights) return [];
    return analysisTowers(context.buildings)
      .filter((tower) => tower.heightFeet > tower.baseFeet + 1)
      .map((tower) => ({ id: tower.id, geometry: towerShaft(tower.ring, tower.baseFeet, tower.heightFeet) }));
  }, [context.buildings, studyHeights]);
  useEffect(() => () => {
    towerGeometries.forEach((tower) => tower.geometry.dispose());
  }, [towerGeometries]);
  const [roadMesh, setRoadMesh] = useState<BufferGeometry | null>(null);
  useEffect(() => {
    let cancel = false;
    let installed: BufferGeometry | null = null;
    groundRoadGeometry(geometries.groundRoads, geometries.roadBlocks, geometries.roadLimits).then((geometry) => {
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
  }, [geometries.groundRoads, geometries.roadBlocks, geometries.roadLimits]);

  if (linework) {
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
          <meshBasicMaterial color="#071c1e" />
        </mesh>
        {showContext ? <lineSegments geometry={geometries.coast} raycast={skipRaycast}>
          <lineBasicMaterial color="#1f6d72" transparent opacity={0.85} />
        </lineSegments> : null}
        {showAerial && aerialMap ? <mesh
          position={[(HERALD_AERIAL.minX + HERALD_AERIAL.maxX) / 2, 0.12, (HERALD_AERIAL.minZ + HERALD_AERIAL.maxZ) / 2]}
          rotation={[Math.PI / 2, 0, 0]}
          raycast={skipRaycast}
        >
          <planeGeometry args={[HERALD_AERIAL.maxX - HERALD_AERIAL.minX, HERALD_AERIAL.maxZ - HERALD_AERIAL.minZ]} />
          <meshBasicMaterial map={aerialMap} side={DoubleSide} />
        </mesh> : null}
        {showContext ? <RoadCenterlines roads={geometries.groundRoads} /> : null}
        {showContext ? <mesh geometry={geometries.elevated} raycast={skipRaycast}>
          <meshLambertMaterial color="#3c4144" side={DoubleSide} />
        </mesh> : null}
        {showContext ? <mesh geometry={geometries.guideway} raycast={skipRaycast}>
          <meshLambertMaterial color="#5c6366" side={DoubleSide} />
        </mesh> : null}
        <mesh geometry={geometries.siteEdge} material={SITE_EDGE} raycast={skipRaycast} />
        {showGrid ? <mesh geometry={geometries.grid} material={GRID_SHEET} raycast={skipRaycast} /> : null}
        {showContext ? <lineSegments geometry={geometries.flatEdges} raycast={skipRaycast}>
          <lineBasicMaterial color="#8d9294" transparent opacity={0.7} />
        </lineSegments> : null}
        {showContext && buildingMesh ? <mesh geometry={buildingMesh} position={[0, 0.8, 0]} raycast={skipRaycast}>
          <meshBasicMaterial color="#a7adb1" side={DoubleSide} />
        </mesh> : null}
        {ground ? <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.66, 0]} {...ground}>
          <planeGeometry args={[12000, 12000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh> : null}
      </>
    );
  }

  return (
    <>
      {study ? (
        <>
          <ambientLight intensity={0.28} color="#ffffff" />
          <hemisphereLight args={["#ffffff", "#0a0a0a", 0.16]} />
          <directionalLight position={[980, 1680, -240]} intensity={0.95} color="#ffffff" />
          <directionalLight position={[-520, 540, 780]} intensity={0.1} color="#ffffff" />
        </>
      ) : (
        <>
          <ambientLight intensity={0.42} color="#ffffff" />
          <hemisphereLight args={["#a3a3a3", "#0a0a0a", 0.22]} />
          <directionalLight position={[820, 1460, -520]} intensity={0.62} color="#ffffff" />
          <directionalLight position={[-380, 720, 640]} intensity={0.16} color="#ffffff" />
        </>
      )}
      <mesh geometry={geometries.land} receiveShadow={sunlit} raycast={skipRaycast}>
        {sunlit ? <primitive object={sunlitLandMaterial} attach="material" dispose={null} /> : study ? <meshBasicMaterial color="#000000" side={DoubleSide} /> : <meshBasicMaterial color="#070707" side={DoubleSide} />}
      </mesh>
      <WaterSurface geometry={geometries.water} receive={sunlit} calm={focused} />
      <lineSegments geometry={geometries.coast} material={coastLine} raycast={skipRaycast} />
      {showAerial && aerialMap ? <mesh
        position={[(HERALD_AERIAL.minX + HERALD_AERIAL.maxX) / 2, 0.12, (HERALD_AERIAL.minZ + HERALD_AERIAL.maxZ) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        raycast={skipRaycast}
      >
        <planeGeometry args={[HERALD_AERIAL.maxX - HERALD_AERIAL.minX, HERALD_AERIAL.maxZ - HERALD_AERIAL.minZ]} />
        <meshBasicMaterial map={aerialMap} side={DoubleSide} />
      </mesh> : null}
      {roadMesh ? <mesh geometry={roadMesh} receiveShadow={sunlit} raycast={skipRaycast}>
        {sunlit ? <primitive object={sunlitRoadMaterial} attach="material" dispose={null} /> : study ? <meshBasicMaterial color={focused ? "#3c3c3c" : "#686868"} side={DoubleSide} /> : <meshLambertMaterial color="#767676" side={DoubleSide} />}
      </mesh> : null}
      <mesh geometry={geometries.elevated} receiveShadow={sunlit} raycast={skipRaycast}>
        {sunlit ? <primitive object={studyDeckMaterial} attach="material" dispose={null} /> : focused ? <primitive object={ANALYSIS_DECK} attach="material" dispose={null} /> : study ? <primitive object={MODEL_DECK} attach="material" dispose={null} /> : <meshLambertMaterial color="#767676" side={DoubleSide} />}
      </mesh>
      <mesh geometry={geometries.guideway} receiveShadow={sunlit} raycast={skipRaycast}>
        {sunlit ? <primitive object={studyDeckMaterial} attach="material" dispose={null} /> : focused ? <primitive object={ANALYSIS_DECK} attach="material" dispose={null} /> : study ? <primitive object={MODEL_DECK} attach="material" dispose={null} /> : <meshLambertMaterial color="#8a8a8a" side={DoubleSide} />}
      </mesh>
      {geometries.siteFill ? <mesh geometry={geometries.siteFill} receiveShadow={sunlit} raycast={skipRaycast}>
        {sunlit ? <primitive object={sunlitSiteMaterial} attach="material" dispose={null} /> : <meshBasicMaterial color="#101010" side={DoubleSide} />}
      </mesh> : null}
      <mesh geometry={geometries.siteEdge} material={sheets.edge} raycast={skipRaycast} />
      {showGrid ? <mesh geometry={geometries.grid} material={sheets.grid} raycast={skipRaycast} /> : null}
      {parcel ? <mesh geometry={parcel} material={PARCEL_LINE} renderOrder={5} raycast={skipRaycast} /> : null}
      <lineSegments geometry={geometries.flatEdges} material={flatLine} raycast={skipRaycast} />
      {buildingMesh ? (
        <>
          <mesh geometry={buildingMesh} renderOrder={study ? 2 : 0} castShadow={sunlit} receiveShadow={sunlit} raycast={skipRaycast}>
            {studyHeights ? <primitive object={studyMassMaterial} attach="material" dispose={null} /> : focused ? <primitive object={ANALYSIS_MASS} attach="material" dispose={null} /> : study ? <primitive object={MODEL_MASS} attach="material" dispose={null} /> : <meshLambertMaterial color="#2e2e2e" side={DoubleSide} />}
          </mesh>
          {study ? <MassEdges geometry={buildingMesh} material={focused ? ANALYSIS_EDGE : MODEL_EDGE} threshold={focused ? 46 : 28} /> : null}
          {towerGeometries.map((tower) => (
            <mesh key={tower.id} geometry={tower.geometry} renderOrder={2} castShadow={sunlit} receiveShadow={sunlit} raycast={skipRaycast}>
              <primitive object={studyMassMaterial} attach="material" dispose={null} />
            </mesh>
          ))}
          {study ? towerGeometries.map((tower) => <MassEdges key={`${tower.id}-edge`} geometry={tower.geometry} material={focused ? ANALYSIS_EDGE : MODEL_EDGE} threshold={focused ? 46 : 28} />) : null}
          {sun && showSunPath ? <SunShadow sun={sun} origin={sunOrigin} /> : null}
        </>
      ) : null}
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
  framing,
  frameWholeSite,
  sheetsRef,
}: {
  mode: SiteViewMode;
  planHeading: "north" | "east";
  fit: SiteFit;
  rotateView: boolean;
  frameToken: number;
  bounds: Bounds;
  onReadout: (readout: SiteReadout) => void;
  framing: "record" | "model";
  frameWholeSite: boolean;
  sheetsRef: { current: SheetSet };
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
    const key = `${mode}|${fit}|${framing}|${frameWholeSite ? "whole" : "near"}|${frameToken}|${bounds.cx}|${bounds.cz}|${bounds.width}|${bounds.depth}`;
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
        : mode === "section"
          ? placeSection(ortho, view, frame, pad)
          : mode === "axon"
            ? placeAxon(ortho, view, frame, fit)
            : frameWholeSite
              ? placeWholeSitePerspective(persp, view, frame)
              : framing === "model"
                ? placeModelPerspective(persp, view, frame, fit)
                : placePerspective(persp, view, frame, fit);
      target.current.copy(placed);
      if (mode === "plan") aimPlan();
    } else if (sized && mode === "perspective") {
      persp.aspect = view.width / Math.max(1, view.height);
      persp.updateProjectionMatrix();
    } else if (mode === "plan" && sized && appliedHeading.current !== headingKey) aimPlan();
    if (mode !== "plan") appliedHeading.current = "";
    set({ camera });
  }, [bounds, fit, frameToken, frameWholeSite, framing, gl, mode, planHeading, set, size.height, size.width]);

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
    const canvas = gl.domElement;
    const screen = Math.max(1, displayedCanvasWidth(canvas));
    const sheets = sheetsRef.current;
    fadeSiteGrid(visible / screen, canvas.width / screen, sheets.grid, sheets.edge, sheets.quiet, sheets.focus);
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

function RoadCenterlines({ roads }: { roads: readonly { path: readonly XZ[] }[] }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const road of roads) {
      for (let index = 1; index < road.path.length; index += 1) {
        positions.push(road.path[index - 1][0], 1.02, road.path[index - 1][1], road.path[index][0], 1.02, road.path[index][1]);
      }
    }
    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    return next;
  }, [roads]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} raycast={skipRaycast}>
      <lineBasicMaterial color="#8a9094" transparent opacity={0.55} />
    </lineSegments>
  );
}

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

function JoinOverlay({
  highlights,
  passages,
}: {
  highlights: readonly FaceHighlight[];
  passages: readonly { id: string; positions: number[]; indices: number[]; preview: boolean }[];
}) {
  const confirmed = useMemo(() => joinGeometry(passages.filter((item) => !item.preview)), [passages]);
  const preview = useMemo(() => joinGeometry(passages.filter((item) => item.preview)), [passages]);
  useEffect(() => () => {
    confirmed.dispose();
    preview.dispose();
  }, [confirmed, preview]);
  return (
    <group>
      {highlights.map((mark, index) => (
        <mesh
          key={`${mark.kind}-${index}`}
          position={[mark.east, mark.up, mark.north]}
          rotation={mark.axis === "x" ? [0, Math.PI / 2, 0] : mark.axis === "y" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
          renderOrder={8}
          raycast={skipRaycast}
        >
          <planeGeometry args={[mark.width, mark.height]} />
          <meshBasicMaterial color={mark.compatible ? "#49d7de" : "#c77e5f"} transparent opacity={mark.kind === "opening" ? 0.78 : 0.18} side={DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {confirmed.getAttribute("position") ? (
        <mesh geometry={confirmed} renderOrder={7} raycast={skipRaycast}>
          <meshBasicMaterial color="#49d7de" transparent opacity={0.72} side={DoubleSide} depthWrite={false} />
        </mesh>
      ) : null}
      {preview.getAttribute("position") ? (
        <mesh geometry={preview} renderOrder={7} raycast={skipRaycast}>
          <meshBasicMaterial color="#49d7de" transparent opacity={0.34} side={DoubleSide} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

function joinGeometry(passages: readonly { positions: number[]; indices: number[] }[]) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const passage of passages) {
    const base = positions.length / 3;
    positions.push(...passage.positions);
    for (const index of passage.indices) indices.push(base + index);
  }
  const geometry = new BufferGeometry();
  if (positions.length > 0) {
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
  }
  return geometry;
}

function ConnectionMarks({ links }: { links: readonly { id: string; ax: number; az: number; bx: number; bz: number; mode: "direct" | "hybrid" }[] }) {
  const direct = useMemo(() => new LineBasicMaterial({ color: "#49d7de", transparent: true, opacity: 0.9 }), []);
  const hybrid = useMemo(() => new LineBasicMaterial({ color: "#c77e5f", transparent: true, opacity: 0.9 }), []);
  const geometry = useMemo(() => {
    const directPositions: number[] = [];
    const hybridPositions: number[] = [];
    for (const link of links) {
      const target = link.mode === "hybrid" ? hybridPositions : directPositions;
      target.push(link.ax, 3, link.az, link.bx, 3, link.bz);
    }
    const build = (positions: number[]) => {
      const next = new BufferGeometry();
      next.setAttribute("position", new Float32BufferAttribute(positions, 3));
      return next;
    };
    return { direct: build(directPositions), hybrid: build(hybridPositions) };
  }, [links]);
  useEffect(() => () => {
    geometry.direct.dispose();
    geometry.hybrid.dispose();
    direct.dispose();
    hybrid.dispose();
  }, [direct, geometry, hybrid]);
  if (links.length === 0) return null;
  return (
    <group>
      <lineSegments geometry={geometry.direct} material={direct} raycast={skipRaycast} />
      <lineSegments geometry={geometry.hybrid} material={hybrid} raycast={skipRaycast} />
    </group>
  );
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
  analysis = null,
  appearance = "record",
  framing,
  frameWholeSite = false,
  presentation = "model",
  showSunPath = true,
  showShadows = true,
  sun = null,
  wind = null,
  sight = null,
  walk = null,
  uses = null,
  onShadowTexel,
  network = null,
  zones = null,
  zoning = null,
  connections = null,
  joins = null,
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
  analysis?: SiteAnalysisLayers | null;
  appearance?: "record" | "model";
  framing?: "record" | "model";
  frameWholeSite?: boolean;
  presentation?: "model" | "analysis";
  showSunPath?: boolean;
  showShadows?: boolean;
  sun?: SunSample | null;
  wind?: { fromDegrees: number; density: number; motion: number } | null;
  sight?: readonly SightSegment[] | null;
  walk?: readonly WalkSegment[] | null;
  uses?: readonly UseSegment[] | null;
  onShadowTexel?: (feet: number) => void;
  network?: { study: SiteNetworkStudy; running: boolean; tool: NetworkNodeKind; onSettle: () => void; preview?: Float32Array | null; colored?: Uint8Array | null; showField: boolean; showTrails: boolean; showContext: boolean; branches?: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[] | null; interactive?: boolean; studyTone?: boolean } | null;
  zones?: readonly ZoningRegion[] | null;
  zoning?: {
    tool: ZoneTool;
    mode: SiteViewMode;
    active: boolean;
    draft: readonly ZonePoint[];
    selectedId: string | null;
    onDraftPoint: (point: ZonePoint) => void;
    onCloseDraft: () => void;
    onSelect: (id: string | null) => void;
    onCommitPoints: (id: string, points: ZonePoint[]) => boolean;
    onCommitElevation: (id: string, baseFt: number, heightFt: number) => boolean;
    onReject: (message: string) => void;
    pockets?: {
      items: readonly NetworkPocket[];
      kinds: Readonly<Record<string, ZoneKind | null>>;
      hoverId: string | null;
      selectedIds: readonly string[];
      onHover: (id: string | null) => void;
      onPick: (id: string, shift: boolean) => void;
      listen?: boolean;
      opacity?: number | null;
    } | null;
  } | null;
  connections?: readonly { id: string; ax: number; az: number; bx: number; bz: number; mode: "direct" | "hybrid" }[] | null;
  joins?: { highlights: readonly FaceHighlight[]; passages: readonly { id: string; positions: number[]; indices: number[]; preview: boolean }[] } | null;
  onReadout: (readout: SiteReadout) => void;
}) {
  const bounds = useMemo(() => boundsOf(context), [context]);
  const cameraFraming = framing ?? appearance;
  const sheetsRef = useRef<SheetSet>({ grid: GRID_SHEET, edge: SITE_EDGE, quiet: false });
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
      <PlacementScene context={context} showGrid={showGrid} showAerial={showAerial} showSunPath={showSunPath} showShadows={showShadows} placement={placement} overlay={overlay} analysis={analysis} appearance={appearance} presentation={presentation} sheetsRef={sheetsRef} sun={sun} wind={wind} sight={sight} walk={walk} uses={uses} onShadowTexel={onShadowTexel} network={network} zones={zones} zoning={zoning} connections={connections} joins={joins} />
      <CameraRig mode={mode} planHeading={planHeading} fit={fit} rotateView={rotateView} frameToken={frameToken} bounds={bounds} onReadout={onReadout} framing={cameraFraming} frameWholeSite={frameWholeSite} sheetsRef={sheetsRef} />
    </Canvas>
  );
}

function PlacementScene({
  context,
  showGrid,
  showAerial,
  showSunPath,
  showShadows,
  placement,
  overlay,
  analysis,
  appearance,
  presentation,
  sheetsRef,
  sun,
  wind,
  sight,
  walk,
  uses,
  onShadowTexel,
  network,
  zones,
  zoning,
  connections,
  joins,
}: {
  context: SiteContext;
  showGrid: boolean;
  showAerial: boolean;
  showSunPath: boolean;
  showShadows: boolean;
  placement: SitePlacementModel | null;
  overlay: SiteOverlay | null;
  analysis: SiteAnalysisLayers | null;
  appearance: "record" | "model";
  presentation: "model" | "analysis";
  sheetsRef: { current: SheetSet };
  sun: SunSample | null;
  wind: { fromDegrees: number; density: number; motion: number } | null;
  sight: readonly SightSegment[] | null;
  walk: readonly WalkSegment[] | null;
  uses: readonly UseSegment[] | null;
  onShadowTexel?: (feet: number) => void;
  network: { study: SiteNetworkStudy; running: boolean; tool: NetworkNodeKind; onSettle: () => void; preview?: Float32Array | null; colored?: Uint8Array | null; showField: boolean; showTrails: boolean; showContext: boolean; branches?: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[] | null; interactive?: boolean; studyTone?: boolean } | null;
  zones: readonly ZoningRegion[] | null;
  zoning: {
    tool: ZoneTool;
    mode: SiteViewMode;
    active: boolean;
    draft: readonly ZonePoint[];
    selectedId: string | null;
    onDraftPoint: (point: ZonePoint) => void;
    onCloseDraft: () => void;
    onSelect: (id: string | null) => void;
    onCommitPoints: (id: string, points: ZonePoint[]) => boolean;
    onCommitElevation: (id: string, baseFt: number, heightFt: number) => boolean;
    onReject: (message: string) => void;
    pockets?: {
      items: readonly NetworkPocket[];
      kinds: Readonly<Record<string, ZoneKind | null>>;
      hoverId: string | null;
      selectedIds: readonly string[];
      onHover: (id: string | null) => void;
      onPick: (id: string, shift: boolean) => void;
      listen?: boolean;
      opacity?: number | null;
    } | null;
  } | null;
  connections: readonly { id: string; ax: number; az: number; bx: number; bz: number; mode: "direct" | "hybrid" }[] | null;
  joins: { highlights: readonly FaceHighlight[]; passages: readonly { id: string; positions: number[]; indices: number[]; preview: boolean }[] } | null;
}) {
  const pointer = useModulePointer(placement);
  const shadowBox = useMemo(() => (sun?.above ? casterBox(context.buildings, analysisTowers(context.buildings)) : null), [context.buildings, sun]);
  return (
    <>
      {showShadows && sun?.above && shadowBox ? <SunLight sun={sun} box={shadowBox} onTexel={onShadowTexel} /> : null}
      <group scale={RENDER_GROUP_SCALE}>
      <SiteContent context={context} showGrid={showGrid} showAerial={showAerial} showSunPath={showSunPath} ground={zoning?.active || !placement ? undefined : pointer.ground} appearance={appearance} presentation={presentation} sheetsRef={sheetsRef} sun={sun} linework={network?.studyTone !== false && network !== null} showContext={!network || network.showContext} />
      {placement ? <ModuleMeshes model={placement} pointer={pointer} listen={!zoning?.active} /> : null}
      {overlay?.shore ? <OverlayLines paths={clipPath(overlay.shorePath)} y={1.1} color="#5c6466" opacity={0.7} /> : null}
      {overlay?.macarthur ? <OverlayLines paths={overlay.macarthurPaths.flatMap((path) => clipPath(path))} y={1.2} color="#c77e5f" opacity={0.7} /> : null}
      {overlay?.highway ? <OverlayLines paths={overlay.highwayPaths.flatMap((path) => clipPath(path))} y={1.15} color="#c77e5f" opacity={0.7} /> : null}
      {overlay?.streets ? <OverlayLines paths={overlay.streetPaths.flatMap((path) => clipPath(path))} y={1.05} color="#8a8680" opacity={0.4} /> : null}
      {overlay?.distances ? <OverlayLines paths={overlay.leaders.flatMap((leader) => clipPath([[leader.ax, leader.az], [leader.bx, leader.bz]]))} y={1.4} color="#c8c4bc" opacity={0.75} /> : null}
      {analysis ? <SiteAnalysisLayer context={context} layers={analysis} /> : null}
      {wind ? <WindField fromDegrees={wind.fromDegrees} density={wind.density} motion={wind.motion} /> : null}
      {sight && sight.length > 0 ? <SightLines segments={sight} /> : null}
      {walk && walk.length > 0 ? <WalkLines segments={walk} /> : null}
      {uses && uses.length > 0 ? <UseLines segments={uses} /> : null}
      {network ? <SiteNetworkLayer study={network.study} running={network.running} tool={network.tool} onSettle={network.onSettle} preview={network.preview} colored={network.colored} showField={network.showField} showTrails={network.showTrails} branches={network.branches} interactive={network.interactive !== false} /> : null}
      {zoning?.pockets && (zoning.tool !== "draw" || !zoning.active) ? (
        <SitePocketLayer
          pockets={zoning.pockets.items}
          kinds={zoning.pockets.kinds}
          hoverId={zoning.pockets.hoverId}
          selectedIds={zoning.pockets.selectedIds}
          onHover={zoning.pockets.onHover}
          onPick={zoning.pockets.onPick}
          listen={zoning.pockets.listen !== false}
          opacity={zoning.pockets.opacity}
        />
      ) : null}
      {zones ? (
        <SiteZoneLayer
          zones={zones}
          draft={zoning?.draft ?? []}
          tool={zoning?.tool ?? "select"}
          mode={zoning?.mode ?? "plan"}
          active={zoning?.active ?? false}
          selectedId={zoning?.selectedId ?? null}
          onDraftPoint={zoning?.onDraftPoint ?? (() => {})}
          onCloseDraft={zoning?.onCloseDraft ?? (() => {})}
          onSelect={zoning?.onSelect ?? (() => {})}
          onCommitPoints={zoning?.onCommitPoints ?? (() => false)}
          onCommitElevation={zoning?.onCommitElevation ?? (() => false)}
          onReject={zoning?.onReject ?? (() => {})}
        />
      ) : null}
      {connections ? <ConnectionMarks links={connections} /> : null}
      {joins ? <JoinOverlay highlights={joins.highlights} passages={joins.passages} /> : null}
      </group>
    </>
  );
}
