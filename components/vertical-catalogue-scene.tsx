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
  field: VerticalViewerField;
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
out vec4 oColor;
void main() {
  vec3 tone;
  if (uPlate > 2.5) tone = vec3(0.045, 0.13, 0.135);
  else if (uPlate > 1.5) tone = vec3(0.055, 0.055, 0.058);
  else if (uPlate > 0.5) tone = vec3(0.06, 0.06, 0.063);
  else {
    vec3 n = normalize(vNormal);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    if (dot(n, viewDir) < 0.0) n = -n;
    vec3 key = normalize(vec3(0.28, 0.9, 0.36));
    vec3 fill = normalize(vec3(-0.48, 0.16, 0.22));
    float wrap = clamp((dot(n, key) + 0.38) / 1.38, 0.0, 1.0);
    float bounce = clamp(dot(n, fill), 0.0, 1.0);
    vec3 halfDir = normalize(key + viewDir);
    float spec = pow(clamp(dot(n, halfDir), 0.0, 1.0), 36.0);
    vec3 shadow = vec3(0.62, 0.60, 0.56);
    vec3 body = vec3(0.95, 0.93, 0.89);
    vec3 col = mix(shadow, body, wrap);
    col += vec3(0.96, 0.94, 0.90) * bounce * 0.06;
    col += vec3(1.0) * spec * 0.018;
    float lift = mix(1.14, 0.72, clamp(vShade, 0.0, 1.0));
    if (uSelected > 0.5) lift = 1.16;
    tone = col * lift;
  }
  oColor = vec4(tone * uDim, 1.0);
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
  oColor = vec4(vColor.rgb * uDim, vColor.a * mix(1.0, vignette, vFade) * uDim);
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

function focusPose(ox: number, oy: number, oz: number, camera: Camera, aspect: number, blend: number): FocusPose {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const x1 = ox * cy + oz * sy;
  const z1 = -ox * sy + oz * cy;
  const y2 = oy * cp - z1 * sp;
  const z2 = oy * sp + z1 * cp;
  const x1t = -0.04 * aspect / camera.zoom - camera.panX;
  const y2t = 0.02 / camera.zoom - camera.panY;
  const z2t = z2 + 24;
  const y = y2t * cp + z2t * sp;
  const z1t = z2t * cp - y2t * sp;
  const x = x1t * cy - z1t * sy;
  const z = x1t * sy + z1t * cy;
  return {
    x: ox + (x - ox) * blend,
    y: oy + (y - oy) * blend,
    z: oz + (z - oz) * blend,
    scale: 1 + blend * 0.72,
  };
}

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
  return selected ? [0.06, 0.45, 0.47, 0.92] : [0.7, 0.69, 0.66, 0.14];
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
  const major: [number, number, number, number] = [0.7, 0.7, 0.66, 0.2];
  const minor: [number, number, number, number] = [0.66, 0.66, 0.62, 0.07];
  const pitch = CATALOGUE_PITCH;
  const x0 = Math.max(-360, bounds.x0);
  const x1 = Math.min(360, bounds.x1);
  const z0 = Math.max(-360, bounds.z0);
  const z1 = Math.min(360, bounds.z1);
  const xStart = Math.floor(x0 / pitch) * pitch;
  const zStart = Math.floor(z0 / pitch) * pitch;
  for (let x = xStart; x <= x1 + pitch * 0.5; x += pitch) {
    data.push(x, y, z0, ...major, 1, x, y, z1, ...major, 1);
    const mid = x + pitch * 0.5;
    if (mid < x1) data.push(mid, y, z0, ...minor, 1, mid, y, z1, ...minor, 1);
  }
  for (let z = zStart; z <= z1 + pitch * 0.5; z += pitch) {
    data.push(x0, y, z, ...major, 1, x1, y, z, ...major, 1);
    const mid = z + pitch * 0.5;
    if (mid < z1) data.push(x0, y, mid, ...minor, 1, x1, y, mid, ...minor, 1);
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
  const cameraSnapshot = useRef<Camera | null>(null);
  const exploringSnapshot = useRef(false);
  const composePendingRef = useRef(false);
  const inspectingRef = useRef(inspecting);
  const blendRef = useRef(0);
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
    const pending = modules.filter((item) => item.field.slices.length >= 2 && !meshes.has(item.id));
    let index = 0;
    const step = () => {
      if (cancel) return;
      const item = pending[index];
      if (!item) return;
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
      const hw = Math.max(1, w >> 1);
      const hh = Math.max(1, h >> 1);
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
      const holdCamera = inspectingRef.current || blend > 0.001;
      if (composePendingRef.current) {
        cameraRef.current = composedView(width, height);
        composePendingRef.current = false;
        if (cameraSnapshot.current) {
          cameraSnapshot.current = { ...cameraRef.current };
          exploringSnapshot.current = false;
        }
      } else if (!exploringRef.current && !holdCamera) {
        cameraRef.current = composedView(width, height);
      }
      const camera = cameraRef.current;
      const aspect = width / height;
      const zoom = camera.zoom;
      const shown = modulesRef.current;
      const selected = selectedRef.current;
      const selectedIndex = shown.findIndex((item) => item.id === selected);
      const [stationX, stationY, stationZ] = selectedIndex >= 0 ? catalogueOrigin(selectedIndex) : [0, 0, 0];
      const pose = blend > 0.001 && selectedIndex >= 0
        ? focusPose(stationX, stationY, stationZ, camera, aspect, blend)
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

        const lineData = mode === "field" ? gridLines(ground) : [];
        if (mode === "field") {
          shown.forEach((item, itemIndex) => {
            const [ox, oy, oz] = catalogueOrigin(itemIndex);
            pushBox(lineData, ox, oy, oz, lineColor(item.id === selected));
          });
        } else if (focus) {
          pushBox(lineData, focus.x, focus.y, focus.z, lineColor(true), MODULE_HALF * focus.scale);
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(lines);
        gl.uniform1f(lineYaw, camera.yaw);
        gl.uniform1f(linePitch, camera.pitch);
        gl.uniform1f(lineAspect, aspect);
        gl.uniform1f(lineZoom, zoom);
        gl.uniform2f(linePan, camera.panX, camera.panY);
        gl.uniform1f(lineDim, mode === "field" && blend > 0.001 ? dim * 0.45 : dim);
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
        const drawMesh = (item: CatalogueModule, itemIndex: number, at: FocusPose | null) => {
          const mesh = meshesRef.current.get(item.id);
          if (!mesh || mesh.triangles <= 0) return;
          const [ox, oy, oz] = catalogueOrigin(itemIndex);
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
          gl.uniform3f(clayOffset, at ? at.x : ox, at ? at.y : oy, at ? at.z : oz);
          gl.uniform1f(clayScale, at ? at.scale : 1);
          gl.uniform1f(clayPlate, 0);
          gl.uniform1f(clayShade, at ? 0 : (viewYs[itemIndex] - near) / Math.max(0.001, far - near));
          gl.uniform1f(claySelected, item.id === selected ? 1 : 0);
          gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
        };
        if (mode === "focus" && focus && selectedIndex >= 0) drawMesh(shown[selectedIndex], selectedIndex, focus);
        else shown.forEach((item, itemIndex) => drawMesh(item, itemIndex, null));
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
      if (!pose || !blit || !blitBuffer || !ensureBlur(pixelsW, pixelsH) || !texA || !texB || !fboA || !fboB) {
        paint("field", pose ? 1 - blend * 0.58 : 1);
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
        paint("field", 1 - blend * 0.58);
        gl.disable(gl.DEPTH_TEST);
        gl.disableVertexAttribArray(1);
        gl.disableVertexAttribArray(2);
        gl.useProgram(blit);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(blitTex, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, blitBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
        gl.viewport(0, 0, blurW, blurH);
        gl.bindTexture(gl.TEXTURE_2D, texA);
        gl.uniform2f(blitTexel, 1 / blurW, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, pixelsW, pixelsH);
        gl.bindTexture(gl.TEXTURE_2D, texB);
        gl.uniform2f(blitTexel, 0, 1 / blurH);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        paint("focus", 1);
      }

      const nodes = labels.querySelectorAll<HTMLButtonElement>("[data-module]");
      nodes.forEach((node) => {
        const itemIndex = Number(node.dataset.index);
        const focused = pose != null && shown[itemIndex]?.id === selected;
        const [ox, , oz] = catalogueOrigin(itemIndex);
        const point = project(
          focused && pose ? pose.x : ox,
          focused && pose ? pose.y - MODULE_HALF * pose.scale : -MODULE_HALF,
          focused && pose ? pose.z : oz,
          camera,
          width,
          height,
        );
        node.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -130%)`;
        node.style.opacity = !pose || shown[itemIndex]?.id === selected ? "1" : String(1 - blend * 0.78);
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
    paintRef.current();
  }, [modules, selectedId, inspecting]);

  useEffect(() => {
    if (inspecting) {
      if (!cameraSnapshot.current) {
        cameraSnapshot.current = { ...cameraRef.current };
        exploringSnapshot.current = exploringRef.current;
      }
      return;
    }
    if (!cameraSnapshot.current) return;
    cameraRef.current = { ...cameraSnapshot.current };
    exploringRef.current = exploringSnapshot.current;
    cameraSnapshot.current = null;
    paintRef.current();
  }, [inspecting]);

  useEffect(() => {
    const target = inspecting ? 1 : 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      blendRef.current = target;
      paintRef.current();
      return;
    }
    let frame = 0;
    const tick = () => {
      const delta = target - blendRef.current;
      blendRef.current = Math.abs(delta) < 0.008 ? target : blendRef.current + delta * 0.16;
      paintRef.current();
      if (blendRef.current !== target) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inspecting]);

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
      if (dx !== 0 || dy !== 0) exploringRef.current = true;
      if (Math.hypot(dx, dy) > 3) moved = true;
      lastX = event.clientX;
      lastY = event.clientY;
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
      let best: { id: string; distance: number } | null = null;
      const pose = poseRef.current;
      const selected = selectedRef.current;
      modulesRef.current.forEach((item, itemIndex) => {
        const focused = pose != null && item.id === selected;
        const [ox, oy, oz] = catalogueOrigin(itemIndex);
        const cx = focused && pose ? pose.x : ox;
        const cy = focused && pose ? pose.y : oy;
        const cz = focused && pose ? pose.z : oz;
        const scale = focused && pose ? pose.scale : 1;
        const center = project(cx, cy, cz, cameraRef.current, width, height);
        const edge = project(cx + MODULE_HALF * scale, cy, cz, cameraRef.current, width, height);
        const radius = Math.max(28, Math.hypot(edge.x - center.x, edge.y - center.y) * 1.15);
        const distance = Math.hypot(center.x - x, center.y - y);
        if (distance <= radius && (!best || distance < best.distance)) best = { id: item.id, distance };
      });
      if (best) onSelectRef.current(best.id);
      else if (!inspectingRef.current) onSelectRef.current(null);
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      exploringRef.current = true;
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
