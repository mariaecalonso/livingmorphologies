"use client";

import { useEffect, useRef } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { CATALOGUE_COLUMNS, CATALOGUE_PITCH, CATALOGUE_ROWS, catalogueOrigin, MODULE_HALF } from "@/lib/skill3/catalogue";
import { MODULE_SIZE_Z } from "@/lib/skill3/envelope";
import { cachedOpeningMesh } from "@/lib/skill3/opening-mesh-cache";
import type { VerticalViewerField } from "@/lib/skill3/viewer-field";

export type CatalogueModule = {
  id: string;
  label: string;
  cacheIdentity: string;
  field?: VerticalViewerField;
  /** Catalogue stand-in. Drawn only when no continuation field is loaded. */
  placeholder?: boolean;
};

type Camera = {
  yaw: number;
  pitch: number;
  panX: number;
  panY: number;
  zoom: number;
};

const CLAY_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform float uYaw;
uniform float uPitch;
uniform float uAspect;
uniform float uZoom;
uniform vec2 uPan;
uniform vec3 uOffset;
uniform float uScale;
uniform float uShade;
out vec3 vNormal;
out float vShade;
void main() {
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  vec3 p = aPos * uScale + uOffset;
  float x1 = p.x * cy + p.z * sy;
  float z1 = -p.x * sy + p.z * cy;
  float y2 = p.y * cp - z1 * sp;
  float z2 = p.y * sp + z1 * cp;
  vec3 n = aNormal;
  float nx1 = n.x * cy + n.z * sy;
  float nz1 = -n.x * sy + n.z * cy;
  float ny2 = n.y * cp - nz1 * sp;
  float nz2 = n.y * sp + nz1 * cp;
  vNormal = vec3(nx1, ny2, nz2);
  vShade = uShade;
  gl_Position = vec4((x1 + uPan.x) * uZoom / uAspect, (y2 + uPan.y) * uZoom, -z2 / 720.0, 1.0);
}`;

const CLAY_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vShade;
uniform float uSelected;
uniform float uPlate;
uniform float uDim;
uniform float uFill;
out vec4 oColor;
void main() {
  vec3 tone;
  if (uPlate > 0.5) tone = vec3(0.0);
  else {
    vec3 n = normalize(vNormal);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    if (dot(n, viewDir) < 0.0) n = -n;
    vec3 key = normalize(vec3(0.32, 0.86, 0.4));
    vec3 fill = normalize(vec3(-0.62, 0.12, 0.28));
    float wrap = clamp((dot(n, key) + 0.62) / 1.62, 0.0, 1.0);
    float bounce = clamp(dot(n, fill), 0.0, 1.0);
    vec3 shadow = vec3(0.58, 0.58, 0.56);
    vec3 body = vec3(0.97, 0.97, 0.96);
    tone = mix(shadow, body, wrap);
    tone += vec3(0.98, 0.98, 0.97) * bounce * 0.08;
    tone *= mix(1.0, 0.9, clamp(vShade, 0.0, 1.0));
  }
  float shade = mix(0.2, 1.0, uDim);
  oColor = vec4(tone * shade, mix(0.16, 1.0, uDim));
}`;

const LINE_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;
layout(location = 2) in float aFade;
uniform float uYaw;
uniform float uPitch;
uniform float uAspect;
uniform float uZoom;
uniform vec2 uPan;
out vec4 vColor;
out vec2 vNdc;
out float vFade;
void main() {
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  float x1 = aPos.x * cy + aPos.z * sy;
  float z1 = -aPos.x * sy + aPos.z * cy;
  float y2 = aPos.y * cp - z1 * sp;
  float z2 = aPos.y * sp + z1 * cp;
  vColor = aColor;
  vFade = aFade;
  vNdc = vec2((x1 + uPan.x) * uZoom / uAspect, (y2 + uPan.y) * uZoom);
  gl_Position = vec4(vNdc, -z2 / 720.0, 1.0);
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vNdc;
in float vFade;
uniform vec2 uFieldMin;
uniform vec2 uFieldMax;
uniform float uDim;
out vec4 oColor;
void main() {
  vec2 outside = max(uFieldMin - vNdc, vNdc - uFieldMax);
  float vignette = 1.0 - smoothstep(0.0, 0.62, length(max(outside, 0.0)));
  float edge = max(abs(vNdc.x), abs(vNdc.y));
  float gradient = 1.0 - smoothstep(0.34, 1.02, edge);
  float fade = mix(gradient, vignette, vFade);
  oColor = vec4(vColor.rgb * uDim, vColor.a * fade * uDim);
}`;

const BLIT_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const BLIT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 oColor;
void main() {
  if (uTexel.x == 0.0 && uTexel.y == 0.0) {
    oColor = texture(uTex, vUv);
    return;
  }
  oColor = texture(uTex, vUv) * 0.227027
    + texture(uTex, vUv + uTexel) * 0.1945946
    + texture(uTex, vUv - uTexel) * 0.1945946
    + texture(uTex, vUv + uTexel * 2.0) * 0.1216216
    + texture(uTex, vUv - uTexel * 2.0) * 0.1216216
    + texture(uTex, vUv + uTexel * 3.0) * 0.0702703
    + texture(uTex, vUv - uTexel * 3.0) * 0.0702703;
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function program(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string) {
  const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;
  const shader = gl.createProgram();
  if (!shader) return null;
  gl.attachShader(shader, vert);
  gl.attachShader(shader, frag);
  gl.linkProgram(shader);
  if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) return null;
  return shader;
}

const ISO_YAW = Math.PI / 4;
const ISO_PITCH = 0.62;

function rotateView(x: number, y: number, z: number, yaw: number, pitch: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  return { x: x1, y: y * cp - z1 * sp };
}

type Bounds = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };

function boundsOf(positions: ArrayLike<number> | undefined): Bounds | null {
  if (!positions || positions.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function frameSelection(camera: Camera, ox: number, oy: number, oz: number, scale: number, bounds: Bounds, aspect: number) {
  const oyOff = oy - MODULE_HALF * (1 - scale);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [bounds.minY, bounds.maxY]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const point = rotateView(ox + x * scale, oyOff + y * scale, oz + z * scale, camera.yaw, camera.pitch);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }
  }
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);
  return {
    panX: -((minX + maxX) / 2),
    panY: -((minY + maxY) / 2),
    zoom: Math.min(camera.zoom, (1.35 * aspect) / spanX, 1.22 / spanY),
  };
}

function defaultPitch(aspect: number) {
  const wide = Math.min(1, Math.max(0, (aspect - 1.55) / 1.7));
  return ISO_PITCH - wide * 0.3;
}

function composedView(width: number, height: number): Camera {
  const aspect = width / Math.max(1, height);
  const pitch = defaultPitch(aspect);
  const halfX = ((CATALOGUE_COLUMNS - 1) * CATALOGUE_PITCH) / 2 + MODULE_HALF;
  const halfZ = ((CATALOGUE_ROWS - 1) * CATALOGUE_PITCH) / 2 + MODULE_HALF;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [-halfX, halfX]) {
    for (const z of [-halfZ, halfZ]) {
      for (const y of [-MODULE_HALF, MODULE_HALF]) {
        const point = rotateView(x, y, z, ISO_YAW, pitch);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }
  }
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);
  const zoom = Math.min((1.88 * aspect) / spanX, 1.82 / spanY);
  return {
    yaw: ISO_YAW,
    pitch,
    panX: -((minX + maxX) / 2),
    panY: -((minY + maxY) / 2),
    zoom,
  };
}

type FocusPose = { x: number; y: number; z: number; scale: number };

function project(x: number, y: number, z: number, camera: Camera, width: number, height: number) {
  const aspect = width / Math.max(1, height);
  const point = rotateView(x, y, z, camera.yaw, camera.pitch);
  const ndcX = (point.x + camera.panX) * camera.zoom / aspect;
  const ndcY = (point.y + camera.panY) * camera.zoom;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (1 - (ndcY * 0.5 + 0.5)) * height,
  };
}

function lineColor(selected: boolean): [number, number, number, number] {
  return selected ? [0.9, 0.9, 0.88, 0.42] : [0.7, 0.69, 0.66, 0.14];
}

function pushBox(data: number[], ox: number, oy: number, oz: number, color: [number, number, number, number], half = MODULE_HALF) {
  const h = half;
  const corners: [number, number, number][] = [];
  for (const x of [-h, h]) {
    for (const y of [-h, h]) {
      for (const z of [-h, h]) corners.push([ox + x, oy + y, oz + z]);
    }
  }
  const edges: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (const [a, b] of edges) {
    for (const point of [corners[a], corners[b]]) {
      data.push(point[0], point[1], point[2], color[0], color[1], color[2], color[3], 0);
    }
  }
}

function groundBounds(camera: Camera, aspect: number, zoom: number) {
  const y = -MODULE_HALF;
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const ndcX of [-1.15, 1.15]) {
    for (const ndcY of [-1.15, 1.15]) {
      const viewX = ndcX * aspect / zoom - camera.panX;
      const viewY = ndcY / zoom - camera.panY;
      const zView = (y * cp - viewY) / sp;
      const x = viewX * cy - zView * sy;
      const z = viewX * sy + zView * cy;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  }
  return { x0, x1, z0, z1 };
}

function gridLines(bounds: { x0: number; x1: number; z0: number; z1: number }) {
  const data: number[] = [];
  const y = -MODULE_HALF;
  const major: [number, number, number, number] = [0.78, 0.78, 0.74, 0.62];
  const minor: [number, number, number, number] = [0.7, 0.7, 0.66, 0.28];
  const pitch = CATALOGUE_PITCH;
  const x0 = Math.max(-360, bounds.x0);
  const x1 = Math.min(360, bounds.x1);
  const z0 = Math.max(-360, bounds.z0);
  const z1 = Math.min(360, bounds.z1);
  const xStart = Math.floor(x0 / pitch) * pitch;
  const zStart = Math.floor(z0 / pitch) * pitch;
  for (let x = xStart; x <= x1 + pitch * 0.5; x += pitch) {
    data.push(x, y, z0, ...major, 0, x, y, z1, ...major, 0);
    const mid = x + pitch * 0.5;
    if (mid < x1) data.push(mid, y, z0, ...minor, 0, mid, y, z1, ...minor, 0);
  }
  for (let z = zStart; z <= z1 + pitch * 0.5; z += pitch) {
    data.push(x0, y, z, ...major, 0, x1, y, z, ...major, 0);
    const mid = z + pitch * 0.5;
    if (mid < z1) data.push(x0, y, mid, ...minor, 0, x1, y, mid, ...minor, 0);
  }
  return data;
}

function pushQuad(data: number[], y: number, x0: number, z0: number, x1: number, z1: number) {
  const corners: [number, number, number][] = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
  for (const index of [0, 1, 2, 0, 2, 3]) {
    const point = corners[index];
    data.push(point[0], point[1], point[2], 0, 1, 0);
  }
}

const PLACEHOLDER_HEIGHTS: readonly (readonly (readonly number[])[])[] = [
  [[3, 2], [2, 1]],
  [[4, 2], [2, 2]],
  [[2, 4], [1, 2]],
  [[3, 3], [1, 2]],
  [[2, 1], [4, 2]],
  [[1, 3], [3, 2]],
  [[4, 1], [2, 3]],
  [[2, 3], [3, 1]],
  [[3, 1], [2, 4]],
  [[1, 2], [3, 3]],
  [[2, 2], [4, 1]],
  [[3, 2], [1, 3]],
];

type SolidMesh = { positions: Float32Array; normals: Float32Array; indices: Uint32Array };

function pushCube(
  positions: number[],
  normals: number[],
  indices: number[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
) {
  const faces: { normal: [number, number, number]; corners: [number, number, number][] }[] = [
    { normal: [0, 1, 0], corners: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { normal: [0, -1, 0], corners: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
    { normal: [0, 0, 1], corners: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { normal: [0, 0, -1], corners: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
    { normal: [1, 0, 0], corners: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
    { normal: [-1, 0, 0], corners: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
  ];
  for (const face of faces) {
    const base = positions.length / 3;
    for (const corner of face.corners) {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function placeholderSolid(index: number): SolidMesh {
  const heights = PLACEHOLDER_HEIGHTS[index % PLACEHOLDER_HEIGHTS.length];
  const voxel = 3.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const rows = heights.length;
  const cols = heights[0]?.length ?? 0;
  heights.forEach((row, rz) => {
    row.forEach((height, rx) => {
      for (let layer = 0; layer < height; layer += 1) {
        const x0 = (rx - cols / 2) * voxel;
        const z0 = (rz - rows / 2) * voxel;
        const y0 = -MODULE_HALF + layer * voxel;
        pushCube(positions, normals, indices, x0, y0, z0, x0 + voxel, y0 + voxel, z0 + voxel);
      }
    });
  });
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

const PLACEHOLDER_SOLIDS = PLACEHOLDER_HEIGHTS.map((_, index) => placeholderSolid(index));

export function CatalogueField({
  modules,
  origin,
  selectedId,
  onSelect,
  resetToken,
  inspecting = false,
  onTriangles,
}: {
  modules: readonly CatalogueModule[];
  origin: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  resetToken: number;
  inspecting?: boolean;
  onTriangles?: (id: string, count: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ yaw: ISO_YAW, pitch: ISO_PITCH, panX: 0, panY: 0, zoom: 0.02 });
  const exploringRef = useRef(false);
  const rideFromRef = useRef<Camera | null>(null);
  const composePendingRef = useRef(false);
  const inspectingRef = useRef(inspecting);
  const blendRef = useRef(1);
  const presenceRef = useRef(0);
  const steerRef = useRef(true);
  const poseRef = useRef<FocusPose | null>(null);
  const meshesRef = useRef<Map<string, IsoMesh>>(new Map());
  const paintRef = useRef<() => void>(() => undefined);
  const modulesRef = useRef(modules);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onTrianglesRef = useRef(onTriangles);
  inspectingRef.current = inspecting;
  modulesRef.current = modules;
  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;
  onTrianglesRef.current = onTriangles;

  useEffect(() => {
    let cancel = false;
    const meshes = meshesRef.current;
    const live = new Set(modules.map((item) => item.id));
    for (const id of meshes.keys()) if (!live.has(id)) meshes.delete(id);
    for (const item of modules) {
      const ready = meshes.get(item.id);
      if (ready) onTrianglesRef.current?.(item.id, ready.triangles);
    }
    const pending = modules.filter((item) => (item.field?.slices.length ?? 0) >= 2 && !meshes.has(item.id));
    let index = 0;
    const step = () => {
      if (cancel) return;
      const item = pending[index];
      if (!item?.field) return;
      index += 1;
      try {
        const mesh = cachedOpeningMesh(item.field.slices, {
          identity: item.cacheIdentity,
          sequence: item.field.slices.map((slice) => slice.iteration).join(","),
          field: "network",
          mode: "isomesh",
          iso: 0.48,
          sizeZ: MODULE_SIZE_Z,
        });
        meshes.set(item.id, mesh);
        onTrianglesRef.current?.(item.id, mesh.triangles);
      } catch {
        meshes.delete(item.id);
      }
      paintRef.current();
      if (index < pending.length) window.setTimeout(step, 16);
    };
    const timer = window.setTimeout(step, 16);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [origin, modules]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const labels = labelRef.current;
    if (!canvas || !labels) return;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, depth: true });
    if (!gl) return;
    const clay = program(gl, CLAY_VERT, CLAY_FRAG);
    const lines = program(gl, LINE_VERT, LINE_FRAG);
    const position = gl.createBuffer();
    const normal = gl.createBuffer();
    const index = gl.createBuffer();
    const lineBuffer = gl.createBuffer();
    const plateBuffer = gl.createBuffer();
    if (!clay || !lines || !position || !normal || !index || !lineBuffer || !plateBuffer) return;
    const clayYaw = gl.getUniformLocation(clay, "uYaw");
    const clayPitch = gl.getUniformLocation(clay, "uPitch");
    const clayAspect = gl.getUniformLocation(clay, "uAspect");
    const clayZoom = gl.getUniformLocation(clay, "uZoom");
    const clayPan = gl.getUniformLocation(clay, "uPan");
    const clayOffset = gl.getUniformLocation(clay, "uOffset");
    const claySelected = gl.getUniformLocation(clay, "uSelected");
    const clayShade = gl.getUniformLocation(clay, "uShade");
    const clayPlate = gl.getUniformLocation(clay, "uPlate");
    const clayFill = gl.getUniformLocation(clay, "uFill");
    const lineYaw = gl.getUniformLocation(lines, "uYaw");
    const linePitch = gl.getUniformLocation(lines, "uPitch");
    const lineAspect = gl.getUniformLocation(lines, "uAspect");
    const lineZoom = gl.getUniformLocation(lines, "uZoom");
    const linePan = gl.getUniformLocation(lines, "uPan");
    const lineFieldMin = gl.getUniformLocation(lines, "uFieldMin");
    const lineFieldMax = gl.getUniformLocation(lines, "uFieldMax");
    const clayScale = gl.getUniformLocation(clay, "uScale");
    const clayDim = gl.getUniformLocation(clay, "uDim");
    const lineDim = gl.getUniformLocation(lines, "uDim");
    const blit = program(gl, BLIT_VERT, BLIT_FRAG);
    const blitBuffer = gl.createBuffer();
    const blitTex = blit ? gl.getUniformLocation(blit, "uTex") : null;
    const blitTexel = blit ? gl.getUniformLocation(blit, "uTexel") : null;
    if (blitBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, blitBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    }
    let blurW = 0;
    let blurH = 0;
    let texA: WebGLTexture | null = null;
    let texB: WebGLTexture | null = null;
    let fboA: WebGLFramebuffer | null = null;
    let fboB: WebGLFramebuffer | null = null;
    let depthA: WebGLRenderbuffer | null = null;
    const allocTarget = (w: number, h: number) => {
      const tex = gl.createTexture();
      if (!tex) return null;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    const ensureBlur = (w: number, h: number) => {
      if (!blit || !blitBuffer) return false;
      const hw = Math.max(1, w);
      const hh = Math.max(1, h);
      if (texA && texB && fboA && fboB && blurW === hw && blurH === hh) return true;
      if (texA) gl.deleteTexture(texA);
      if (texB) gl.deleteTexture(texB);
      if (fboA) gl.deleteFramebuffer(fboA);
      if (fboB) gl.deleteFramebuffer(fboB);
      if (depthA) gl.deleteRenderbuffer(depthA);
      texA = allocTarget(hw, hh);
      texB = allocTarget(hw, hh);
      depthA = gl.createRenderbuffer();
      fboA = gl.createFramebuffer();
      fboB = gl.createFramebuffer();
      if (!texA || !texB || !depthA || !fboA || !fboB) return false;
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthA);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, hw, hh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthA);
      const colorA = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texB, 0);
      const colorB = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      blurW = hw;
      blurH = hh;
      return colorA && colorB;
    };
    const draw = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(parent.clientWidth));
      const height = Math.max(1, Math.floor(parent.clientHeight));
      const pixelsW = Math.floor(width * dpr);
      const pixelsH = Math.floor(height * dpr);
      if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
        canvas.width = pixelsW;
        canvas.height = pixelsH;
      }
      const blend = blendRef.current;
      const home = composedView(width, height);
      const aspect = width / height;
      const shown = modulesRef.current;
      const selected = selectedRef.current;
      const selectedIndex = shown.findIndex((item) => item.id === selected);
      const focusing = inspectingRef.current && selectedIndex >= 0;
      const presence = presenceRef.current;
      const [stationX, stationY, stationZ] = selectedIndex >= 0 ? catalogueOrigin(selectedIndex) : [0, 0, 0];
      const heroScale = 1 + presence * 1.85;
      const backScale = 1 - presence * 0.48;
      let camera: Camera;
      if (composePendingRef.current) {
        camera = home;
        composePendingRef.current = false;
        exploringRef.current = false;
        steerRef.current = true;
      } else if (focusing && steerRef.current) {
        const item = shown[selectedIndex];
        const solid = item.placeholder ? PLACEHOLDER_SOLIDS[selectedIndex % PLACEHOLDER_SOLIDS.length] : meshesRef.current.get(item.id);
        const bounds = boundsOf(solid?.positions) ?? {
          minX: -5, maxX: 5, minY: -MODULE_HALF, maxY: -MODULE_HALF + 14, minZ: -5, maxZ: 5,
        };
        const framed = frameSelection(home, stationX, stationY, stationZ, 2.85, bounds, aspect);
        camera = {
          ...home,
          zoom: home.zoom + (framed.zoom - home.zoom) * presence,
          panX: home.panX + (framed.panX - home.panX) * presence,
          panY: home.panY + (framed.panY - home.panY) * presence,
        };
      } else if (!exploringRef.current) {
        camera = home;
      } else {
        camera = cameraRef.current;
      }
      cameraRef.current = camera;
      const zoom = camera.zoom;
      const pose = presence > 0.001 && selectedIndex >= 0
        ? { x: stationX, y: stationY, z: stationZ, scale: heroScale }
        : null;
      poseRef.current = pose;
      const viewYs = shown.map((_, itemIndex) => {
        const [ox, , oz] = catalogueOrigin(itemIndex);
        return rotateView(ox, 0, oz, camera.yaw, camera.pitch).y;
      });
      const near = viewYs.length ? Math.min(...viewYs) : 0;
      const far = viewYs.length ? Math.max(...viewYs) : 1;
      const ground = groundBounds(camera, aspect, zoom);
      let fieldMinX = Infinity;
      let fieldMaxX = -Infinity;
      let fieldMinY = Infinity;
      let fieldMaxY = -Infinity;
      shown.forEach((_, itemIndex) => {
        const [ox, , oz] = catalogueOrigin(itemIndex);
        for (const x of [ox - MODULE_HALF, ox + MODULE_HALF]) {
          for (const z of [oz - MODULE_HALF, oz + MODULE_HALF]) {
            const point = rotateView(x, -MODULE_HALF, z, camera.yaw, camera.pitch);
            const ndcX = (point.x + camera.panX) * zoom / aspect;
            const ndcY = (point.y + camera.panY) * zoom;
            fieldMinX = Math.min(fieldMinX, ndcX);
            fieldMaxX = Math.max(fieldMaxX, ndcX);
            fieldMinY = Math.min(fieldMinY, ndcY);
            fieldMaxY = Math.max(fieldMaxY, ndcY);
          }
        }
      });
      if (!Number.isFinite(fieldMinX)) {
        fieldMinX = -0.45;
        fieldMaxX = 0.45;
        fieldMinY = -0.45;
        fieldMaxY = 0.45;
      }

      const paint = (mode: "field" | "focus", dim: number) => {
        const focus = mode === "focus" ? pose : null;
        if (mode === "focus" && !focus) return;
        const plates: number[] = [];
        let floorCount = 0;
        if (mode === "field") {
          pushQuad(plates, -MODULE_HALF - 0.04, ground.x0, ground.z0, ground.x1, ground.z1);
          floorCount = plates.length / 6;
          shown.forEach((_, itemIndex) => {
            const [ox, , oz] = catalogueOrigin(itemIndex);
            const pad = 5.2;
            pushQuad(plates, -MODULE_HALF + 0.04, ox - pad, oz - pad, ox + pad, oz + pad);
          });
        } else if (focus) {
          const pad = 5.2 * focus.scale;
          pushQuad(plates, focus.y - MODULE_HALF * focus.scale + 0.04, focus.x - pad, focus.z - pad, focus.x + pad, focus.z + pad);
        }
        gl.useProgram(clay);
        gl.uniform1f(clayYaw, camera.yaw);
        gl.uniform1f(clayPitch, camera.pitch);
        gl.uniform1f(clayAspect, aspect);
        gl.uniform1f(clayZoom, zoom);
        gl.uniform2f(clayPan, camera.panX, camera.panY);
        gl.uniform3f(clayOffset, 0, 0, 0);
        gl.uniform1f(clayScale, 1);
        gl.uniform1f(clayShade, 0);
        gl.uniform1f(claySelected, 0);
        gl.uniform1f(clayFill, 0);
        gl.uniform1f(clayDim, dim);
        gl.bindBuffer(gl.ARRAY_BUFFER, plateBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(plates), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        if (mode === "field") {
          gl.uniform1f(clayPlate, 1);
          gl.drawArrays(gl.TRIANGLES, 0, floorCount);
          shown.forEach((item, itemIndex) => {
            gl.uniform1f(clayPlate, item.id === selected ? 3 : 2);
            gl.drawArrays(gl.TRIANGLES, floorCount + itemIndex * 6, 6);
          });
        } else {
          gl.uniform1f(clayPlate, 2);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        const lineData: number[] = [];
        if (mode === "field") {
          shown.forEach((item, itemIndex) => {
            if (pose && item.id === selected) return;
            const [ox, oy, oz] = catalogueOrigin(itemIndex);
            const planted = oy - MODULE_HALF * (1 - backScale);
            pushBox(lineData, ox, planted, oz, lineColor(false), MODULE_HALF * backScale);
          });
        } else if (focus) {
          const planted = focus.y - MODULE_HALF * (1 - focus.scale);
          pushBox(lineData, focus.x, planted, focus.z, lineColor(true), MODULE_HALF * focus.scale);
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(lines);
        gl.uniform1f(lineYaw, camera.yaw);
        gl.uniform1f(linePitch, camera.pitch);
        gl.uniform1f(lineAspect, aspect);
        gl.uniform1f(lineZoom, zoom);
        gl.uniform2f(linePan, camera.panX, camera.panY);
        gl.uniform1f(lineDim, dim);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lineData), gl.DYNAMIC_DRAW);
        gl.uniform2f(lineFieldMin, fieldMinX - 0.06, fieldMinY - 0.06);
        gl.uniform2f(lineFieldMax, fieldMaxX + 0.06, fieldMaxY + 0.06);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
        gl.drawArrays(gl.LINES, 0, lineData.length / 8);
        gl.disableVertexAttribArray(2);
        gl.disable(gl.BLEND);

        gl.useProgram(clay);
        gl.uniform1f(clayYaw, camera.yaw);
        gl.uniform1f(clayPitch, camera.pitch);
        gl.uniform1f(clayAspect, aspect);
        gl.uniform1f(clayZoom, zoom);
        gl.uniform2f(clayPan, camera.panX, camera.panY);
        gl.uniform1f(clayDim, mode === "focus" ? 1 : dim);
        if (mode === "field" && dim < 0.999) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
        const drawMesh = (item: CatalogueModule, itemIndex: number, at: FocusPose | null) => {
          const solid = item.placeholder ? PLACEHOLDER_SOLIDS[itemIndex % PLACEHOLDER_SOLIDS.length] : null;
          const mesh = solid ?? meshesRef.current.get(item.id);
          if (!mesh || ("triangles" in mesh && mesh.triangles <= 0)) return;
          const [ox, oy, oz] = catalogueOrigin(itemIndex);
          const scale = at ? at.scale : 1;
          const plantedY = (at ? at.y : oy) - MODULE_HALF * (1 - scale);
          gl.bindBuffer(gl.ARRAY_BUFFER, position);
          gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, normal);
          gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);
          gl.uniform3f(clayOffset, at ? at.x : ox, plantedY, at ? at.z : oz);
          gl.uniform1f(clayScale, scale);
          gl.uniform1f(clayPlate, 0);
          gl.uniform1f(clayFill, solid ? 1 : 0);
          gl.uniform1f(clayShade, at ? 0 : (viewYs[itemIndex] - near) / Math.max(0.001, far - near));
          gl.uniform1f(claySelected, item.id === selected ? 1 : 0);
          gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
        };
        if (mode === "focus" && focus && selectedIndex >= 0) drawMesh(shown[selectedIndex], selectedIndex, focus);
        else shown.forEach((item, itemIndex) => {
          if (pose && item.id === selected) return;
          const [ox, oy, oz] = catalogueOrigin(itemIndex);
          drawMesh(item, itemIndex, pose ? { x: ox, y: oy, z: oz, scale: backScale } : null);
        });
        if (mode === "field") gl.disable(gl.BLEND);
      };

      const drawGrid = () => {
        const lineData = gridLines(ground);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(lines);
        gl.uniform1f(lineYaw, camera.yaw);
        gl.uniform1f(linePitch, camera.pitch);
        gl.uniform1f(lineAspect, aspect);
        gl.uniform1f(lineZoom, zoom);
        gl.uniform2f(linePan, camera.panX, camera.panY);
        gl.uniform1f(lineDim, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lineData), gl.DYNAMIC_DRAW);
        gl.uniform2f(lineFieldMin, -2, -2);
        gl.uniform2f(lineFieldMax, 2, 2);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
        gl.drawArrays(gl.LINES, 0, lineData.length / 8);
        gl.disableVertexAttribArray(2);
        gl.disable(gl.BLEND);
      };

      const begin = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, pixelsW, pixelsH);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);
      };
      begin();
      const fieldDim = pose ? 1 - presence * 0.82 : 1;
      if (!pose || !blit || !blitBuffer || !ensureBlur(pixelsW, pixelsH) || !texA || !texB || !fboA || !fboB) {
        paint("field", fieldDim);
        drawGrid();
        if (pose) {
          gl.clear(gl.DEPTH_BUFFER_BIT);
          paint("focus", 1);
        }
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
        gl.viewport(0, 0, blurW, blurH);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        paint("field", fieldDim);
        gl.disable(gl.DEPTH_TEST);
        gl.disableVertexAttribArray(1);
        gl.disableVertexAttribArray(2);
        gl.useProgram(blit);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(blitTex, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, blitBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const blurAt = (radius: number, horizontal: boolean, source: WebGLTexture, target: WebGLFramebuffer | null, viewW: number, viewH: number) => {
          gl.bindFramebuffer(gl.FRAMEBUFFER, target);
          gl.viewport(0, 0, viewW, viewH);
          gl.bindTexture(gl.TEXTURE_2D, source);
          gl.uniform2f(blitTexel, horizontal ? radius / blurW : 0, horizontal ? 0 : radius / blurH);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        };
        const radius = 1.6 + presence * 4.4;
        blurAt(radius, true, texA, fboB, blurW, blurH);
        blurAt(radius, false, texB, null, pixelsW, pixelsH);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        drawGrid();
        paint("focus", 1);
      }

      const nodes = labels.querySelectorAll<HTMLButtonElement>("[data-module]");
      nodes.forEach((node) => {
        const itemIndex = Number(node.dataset.index);
        const [ox, , oz] = catalogueOrigin(itemIndex);
        const point = project(ox, -MODULE_HALF, oz, camera, width, height);
        node.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -130%)`;
        node.style.opacity = !pose || shown[itemIndex]?.id === selected ? "1" : String(1 - presence * 0.9);
      });
    };
    paintRef.current = draw;
    draw();
    const observer = new ResizeObserver(() => paintRef.current());
    observer.observe(canvas.parentElement ?? canvas);
    return () => {
      observer.disconnect();
      paintRef.current = () => undefined;
      if (texA) gl.deleteTexture(texA);
      if (texB) gl.deleteTexture(texB);
      if (fboA) gl.deleteFramebuffer(fboA);
      if (fboB) gl.deleteFramebuffer(fboB);
      if (depthA) gl.deleteRenderbuffer(depthA);
      if (blitBuffer) gl.deleteBuffer(blitBuffer);
    };
  }, []);

  useEffect(() => {
    const mounted = rideFromRef.current;
    rideFromRef.current = { ...cameraRef.current };
    steerRef.current = true;
    if (!inspecting) exploringRef.current = false;
    if (!mounted && !inspecting) {
      blendRef.current = 1;
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const presenceStart = presenceRef.current;
    const presenceTarget = inspecting ? 1 : 0;
    if (reduced) {
      blendRef.current = 1;
      presenceRef.current = presenceTarget;
      paintRef.current();
      return;
    }
    blendRef.current = 0;
    const from = performance.now();
    const duration = 780;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - from) / duration);
      const s = t * t * (3 - 2 * t);
      blendRef.current = t;
      presenceRef.current = presenceStart + (presenceTarget - presenceStart) * s;
      paintRef.current();
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inspecting, selectedId]);

  useEffect(() => {
    paintRef.current();
  }, [modules]);

  useEffect(() => {
    exploringRef.current = false;
    composePendingRef.current = true;
    paintRef.current();
  }, [resetToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let button = 0;
    const down = (event: PointerEvent) => {
      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      button = event.button;
      parent.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.hypot(dx, dy) > 3) moved = true;
      lastX = event.clientX;
      lastY = event.clientY;
      if (inspectingRef.current && !moved) return;
      if (dx !== 0 || dy !== 0) exploringRef.current = true;
      if (inspectingRef.current) steerRef.current = false;
      const camera = cameraRef.current;
      const pan = event.shiftKey || button === 1 || button === 2;
      if (pan) {
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        const aspect = width / Math.max(1, height);
        const zoom = Math.max(0.0001, camera.zoom);
        camera.panX = Math.min(200, Math.max(-200, camera.panX + (dx / (width / 2)) * aspect / zoom));
        camera.panY = Math.min(200, Math.max(-200, camera.panY - (dy / (height / 2)) / zoom));
      } else {
        camera.yaw += dx * 0.005;
        camera.pitch = Math.min(1.22, Math.max(0.18, camera.pitch + dy * 0.004));
        if (inspectingRef.current) {
          const selected = selectedRef.current;
          const index = modulesRef.current.findIndex((item) => item.id === selected);
          if (index >= 0) {
            const item = modulesRef.current[index];
            const solid = item.placeholder ? PLACEHOLDER_SOLIDS[index % PLACEHOLDER_SOLIDS.length] : meshesRef.current.get(item.id);
            const bounds = boundsOf(solid?.positions) ?? {
              minX: -5, maxX: 5, minY: -MODULE_HALF, maxY: -MODULE_HALF + 14, minZ: -5, maxZ: 5,
            };
            const [ox, oy, oz] = catalogueOrigin(index);
            const width = parent.clientWidth;
            const height = parent.clientHeight;
            const framed = frameSelection(camera, ox, oy, oz, 2.85, bounds, width / Math.max(1, height));
            camera.panX = framed.panX;
            camera.panY = framed.panY;
            camera.zoom = Math.min(camera.zoom, framed.zoom);
          }
        }
      }
      paintRef.current();
    };
    const up = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (moved || event.button !== 0) return;
      const rect = parent.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      let bestId: string | null = null;
      let bestDistance = Infinity;
      const pose = poseRef.current;
      const selected = selectedRef.current;
      modulesRef.current.forEach((item, itemIndex) => {
        const focused = pose != null && item.id === selected;
        const [ox, oy, oz] = catalogueOrigin(itemIndex);
        const cx = focused && pose ? pose.x : ox;
        const cy = focused && pose ? pose.y : oy;
        const cz = focused && pose ? pose.z : oz;
        const scale = focused && pose ? pose.scale : pose ? 1 - presenceRef.current * 0.48 : 1;
        const center = project(cx, cy, cz, cameraRef.current, width, height);
        const edge = project(cx + MODULE_HALF * scale, cy, cz, cameraRef.current, width, height);
        const radius = Math.max(28, Math.hypot(edge.x - center.x, edge.y - center.y) * 1.15);
        const distance = Math.hypot(center.x - x, center.y - y);
        if (distance <= radius && distance < bestDistance) {
          bestId = item.id;
          bestDistance = distance;
        }
      });
      if (bestId) onSelectRef.current(bestId);
      else onSelectRef.current(null);
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      exploringRef.current = true;
      if (inspectingRef.current) steerRef.current = false;
      const camera = cameraRef.current;
      const frame = composedView(parent.clientWidth, parent.clientHeight);
      camera.zoom = Math.min(frame.zoom * 6, Math.max(frame.zoom * 0.34, camera.zoom * Math.exp(-event.deltaY * 0.0011)));
      paintRef.current();
    };
    const menu = (event: Event) => event.preventDefault();
    parent.addEventListener("pointerdown", down);
    parent.addEventListener("pointermove", move);
    parent.addEventListener("pointerup", up);
    parent.addEventListener("pointercancel", up);
    parent.addEventListener("wheel", wheel, { passive: false });
    parent.addEventListener("contextmenu", menu);
    return () => {
      parent.removeEventListener("pointerdown", down);
      parent.removeEventListener("pointermove", move);
      parent.removeEventListener("pointerup", up);
      parent.removeEventListener("pointercancel", up);
      parent.removeEventListener("wheel", wheel);
      parent.removeEventListener("contextmenu", menu);
    };
  }, []);

  return (
    <div className="vertical-catalogue-stage">
      <canvas ref={canvasRef} aria-label="Isometric catalogue field" />
      <div ref={labelRef} className="vertical-catalogue-labels">
        {modules.map((item, index) => (
          <button
            key={item.id}
            type="button"
            data-module={item.id}
            data-index={index}
            data-active={item.id === selectedId || undefined}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
