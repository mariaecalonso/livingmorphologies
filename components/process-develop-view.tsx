"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { MODULE_SIZE_X } from "@/lib/skill3/envelope";
import {
  createProcessIsoCamera,
  orbitProcessIso,
  processIsoFit,
  resetProcessIso,
  zoomProcessIso,
  type ProcessIsoCamera,
} from "@/lib/skill3/process-iso-camera";
import { rasterTrailPlate } from "@/components/vertical-render";

export type DevelopPlate = {
  iteration: number;
  /** 0 at the first retained sample, 1 at the last. Spacing follows iteration distance. */
  z: number;
  trails: ArrayLike<number>;
  trailSize: number;
  peak: number;
};

const HALF = MODULE_SIZE_X / 2;
const ENTER_MS = 760;
const REVEAL_MS = 520;
const HOLD_MS = 440;
const TEAL: readonly [number, number, number] = [126, 214, 208];

const MESH_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform float uYaw;
uniform float uPitch;
uniform float uAspect;
uniform float uFit;
out vec3 vNormal;
out float vHeight;
void main() {
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  float x1 = aPos.x * cy + aPos.z * sy;
  float z1 = -aPos.x * sy + aPos.z * cy;
  float y2 = aPos.y * cp - z1 * sp;
  float z2 = aPos.y * sp + z1 * cp;
  float nx1 = aNormal.x * cy + aNormal.z * sy;
  float nz1 = -aNormal.x * sy + aNormal.z * cy;
  float ny2 = aNormal.y * cp - nz1 * sp;
  float nz2 = aNormal.y * sp + nz1 * cp;
  vNormal = vec3(nx1, ny2, nz2);
  vHeight = aPos.y;
  gl_Position = vec4(x1 * uFit / uAspect, y2 * uFit, z2 * 0.0125, 1.0);
}`;

const MESH_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vHeight;
uniform float uAlpha;
uniform float uClipLo;
uniform float uClipHi;
layout(location = 0) out vec4 oColor;
void main() {
  if (vHeight < uClipLo || vHeight > uClipHi) discard;
  vec3 n = normalize(vNormal);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  if (dot(n, viewDir) < 0.0) n = -n;
  vec3 key = normalize(vec3(0.32, 0.86, 0.4));
  float light = 0.72 + 0.28 * clamp(dot(n, key), 0.0, 1.0);
  float rim = pow(1.0 - abs(dot(n, viewDir)), 1.7);
  vec3 col = vec3(0.94, 0.95, 0.94) * light + vec3(0.72, 0.9, 0.88) * rim * 0.16;
  oColor = vec4(col, uAlpha);
}`;

const PLATE_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;
uniform float uYaw;
uniform float uPitch;
uniform float uAspect;
uniform float uFit;
out vec2 vUv;
void main() {
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  float x1 = aPos.x * cy + aPos.z * sy;
  float z1 = -aPos.x * sy + aPos.z * cy;
  float y2 = aPos.y * cp - z1 * sp;
  float z2 = aPos.y * sp + z1 * cp;
  vUv = aUv;
  gl_Position = vec4(x1 * uFit / uAspect, y2 * uFit, z2 * 0.0125, 1.0);
}`;

const PLATE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPlate;
uniform float uAlpha;
layout(location = 0) out vec4 oColor;
void main() {
  vec4 tex = texture(uPlate, vUv);
  if (tex.a < 0.05) discard;
  oColor = vec4(tex.rgb, tex.a * uAlpha);
}`;

const LINE_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform float uYaw;
uniform float uPitch;
uniform float uAspect;
uniform float uFit;
void main() {
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  float x1 = aPos.x * cy + aPos.z * sy;
  float z1 = -aPos.x * sy + aPos.z * cy;
  float y2 = aPos.y * cp - z1 * sp;
  float z2 = aPos.y * sp + z1 * cp;
  gl_Position = vec4(x1 * uFit / uAspect, y2 * uFit, z2 * 0.0125, 1.0);
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec4 uColor;
layout(location = 0) out vec4 oColor;
void main() {
  oColor = uColor;
}`;

type Token = { alive: boolean };

function tintPlate(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const ink = pixels[index] / 255;
    if (ink < 0.04) {
      pixels[index + 3] = 0;
      continue;
    }
    pixels[index] = TEAL[0];
    pixels[index + 1] = TEAL[1];
    pixels[index + 2] = TEAL[2];
    pixels[index + 3] = Math.round(170 * Math.min(1, ink));
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

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

function program(gl: WebGL2RenderingContext, vert: string, frag: string) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vert);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, frag);
  if (!vertex || !fragment) return null;
  const shader = gl.createProgram();
  if (!shader) return null;
  gl.attachShader(shader, vertex);
  gl.attachShader(shader, fragment);
  gl.linkProgram(shader);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) {
    gl.deleteProgram(shader);
    return null;
  }
  return shader;
}

function viewDepth(x: number, y: number, z: number, yaw: number, pitch: number) {
  const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
  const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return y * Math.sin(pitch) + z1 * Math.cos(pitch);
}

function orderedTriangles(mesh: IsoMesh, yaw: number, pitch: number) {
  const count = mesh.indices.length / 3;
  const order = new Array<number>(count);
  for (let triangle = 0; triangle < count; triangle += 1) order[triangle] = triangle;
  order.sort((a, b) => {
    const depth = (triangle: number) => {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = mesh.indices[triangle * 3 + corner] * 3;
        x += mesh.positions[vertex];
        y += mesh.positions[vertex + 1];
        z += mesh.positions[vertex + 2];
      }
      return viewDepth(x / 3, y / 3, z / 3, yaw, pitch);
    };
    return depth(b) - depth(a);
  });
  const indices = new Uint32Array(mesh.indices.length);
  for (let index = 0; index < count; index += 1) {
    const source = order[index] * 3;
    indices[index * 3] = mesh.indices[source];
    indices[index * 3 + 1] = mesh.indices[source + 1];
    indices[index * 3 + 2] = mesh.indices[source + 2];
  }
  return indices;
}

function plateHeight(z: number, lift: number) {
  return (z - 0.5) * MODULE_SIZE_X + lift;
}

function ease(amount: number) {
  const t = Math.max(0, Math.min(1, amount));
  return t * t * (3 - 2 * t);
}

/** Sparse trails through the interval the newest plate opens. They mark inheritance, then leave. */
function bridgeLines(previous: DevelopPlate, current: DevelopPlate, reveal: number) {
  const size = Math.max(1, Math.min(previous.trailSize, current.trailSize));
  const stride = size > 48 ? 5 : 4;
  const y0 = plateHeight(previous.z, 0);
  const y1 = plateHeight(current.z, 0);
  const y = y0 + (y1 - y0) * reveal;
  const peak = current.peak > 0 ? current.peak : 1;
  const lines: number[] = [];
  let count = 0;
  for (let ty = 0; ty < size && count < 96; ty += stride) {
    for (let tx = 0; tx < size && count < 96; tx += stride) {
      const ink = (current.trails[ty * current.trailSize + tx] ?? 0) / peak;
      if (ink < 0.28) continue;
      const x = -HALF + ((tx + 0.5) / size) * MODULE_SIZE_X;
      const z = HALF - ((ty + 0.5) / size) * MODULE_SIZE_X;
      lines.push(x, y0, z, x, y, z);
      count += 1;
    }
  }
  return lines;
}

/** The stored prefix for this plate count. A later stage may hold the last saved prefix. Vertices are never blended. */
function meshFor(stage: number, total: number, meshes: Readonly<Record<number, IsoMesh>>) {
  if (stage < 2) return { mesh: null as IsoMesh | null, carried: false, source: null as number | null };
  if (meshes[stage]) return { mesh: meshes[stage], carried: false, source: stage };
  if (stage === total) {
    const earlier = Object.keys(meshes).map(Number).filter((count) => count < stage && meshes[count]).sort((a, b) => b - a);
    const last = earlier[0];
    if (last != null) return { mesh: meshes[last], carried: true, source: last };
  }
  return { mesh: null, carried: false, source: null };
}

export function ProcessDevelop({
  plates,
  meshes,
  autoplay,
  loading = false,
  isoCamera,
  isoTick = 0,
  onIsoCamera,
  onResetIso,
  onComplete,
  onEngage,
}: {
  plates: readonly DevelopPlate[];
  meshes: Readonly<Record<number, IsoMesh>>;
  autoplay: boolean;
  loading?: boolean;
  isoCamera?: MutableRefObject<ProcessIsoCamera>;
  isoTick?: number;
  onIsoCamera?: () => void;
  onResetIso?: () => void;
  onComplete: () => void;
  onEngage: () => void;
}) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const ownedCamera = useRef<ProcessIsoCamera>(createProcessIsoCamera());
  const camera = isoCamera ?? ownedCamera;
  const onIsoRef = useRef(onIsoCamera);
  onIsoRef.current = onIsoCamera;
  const [viewTick, setViewTick] = useState(0);
  const [stage, setStage] = useState(0);
  const [arrival, setArrival] = useState(1);
  const [fade, setFade] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [rasters, setRasters] = useState<HTMLCanvasElement[]>([]);
  const stopRef = useRef<(() => void) | null>(null);
  const onCompleteRef = useRef(onComplete);
  const meshesRef = useRef(meshes);
  const platesRef = useRef(plates);
  onCompleteRef.current = onComplete;
  meshesRef.current = meshes;
  platesRef.current = plates;
  const orderCache = useRef(new WeakMap<IsoMesh, { key: string; indices: Uint32Array }>());
  const paintRef = useRef<(() => void) | null>(null);
  const live = useRef({ stage, arrival, fade, plates, meshes });
  live.current = { stage, arrival, fade, plates, meshes };

  useEffect(() => {
    setRasters(plates.map((plate) => tintPlate(rasterTrailPlate(plate.trails, plate.trailSize, plate.peak, "raw"))));
  }, [plates]);

  useEffect(() => {
    const canvas = viewRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!gl) return;
    const meshProg = program(gl, MESH_VERT, MESH_FRAG);
    const plateProg = program(gl, PLATE_VERT, PLATE_FRAG);
    const lineProg = program(gl, LINE_VERT, LINE_FRAG);
    if (!meshProg || !plateProg || !lineProg) return;
    const meshPos = gl.createBuffer();
    const meshNrm = gl.createBuffer();
    const meshIdx = gl.createBuffer();
    const plateBuf = gl.createBuffer();
    const lineBuf = gl.createBuffer();
    const textures = rasters.map((raster) => {
      const texture = gl.createTexture();
      if (!texture) return null;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster);
      return texture;
    });
    const parent = canvas.parentElement;
    let uploaded: IsoMesh | null = null;
    const paint = () => {
      if (!parent) return;
      const frame = live.current;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, parent.clientWidth);
      const height = Math.max(1, parent.clientHeight);
      const pixelsW = Math.floor(width * dpr);
      const pixelsH = Math.floor(height * dpr);
      if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
        canvas.width = pixelsW;
        canvas.height = pixelsH;
      }
      const { yaw, pitch, zoom } = camera.current;
      const aspect = width / Math.max(1, height);
      const fit = processIsoFit(pitch, aspect, zoom);
      gl.viewport(0, 0, pixelsW, pixelsH);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const setCamera = (shader: WebGLProgram) => {
        gl.uniform1f(gl.getUniformLocation(shader, "uYaw"), yaw);
        gl.uniform1f(gl.getUniformLocation(shader, "uPitch"), pitch);
        gl.uniform1f(gl.getUniformLocation(shader, "uAspect"), aspect);
        gl.uniform1f(gl.getUniformLocation(shader, "uFit"), fit);
      };

      const shown = Math.max(0, Math.min(frame.stage, frame.plates.length));
      gl.useProgram(plateProg);
      setCamera(plateProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, plateBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      for (let index = 0; index < shown; index += 1) {
        const plate = frame.plates[index];
        const texture = textures[index];
        if (!plate || !texture) continue;
        const entering = index === shown - 1;
        const y = plateHeight(plate.z, 0);
        const quad = new Float32Array([
          -HALF, y, -HALF, 0, 0,
          HALF, y, -HALF, 1, 0,
          HALF, y, HALF, 1, 1,
          -HALF, y, -HALF, 0, 0,
          HALF, y, HALF, 1, 1,
          -HALF, y, HALF, 0, 1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
        gl.uniform1f(gl.getUniformLocation(plateProg, "uAlpha"), entering ? 0.16 + frame.arrival * 0.72 : 0.42);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(plateProg, "uPlate"), 0);
        gl.depthMask(true);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      const drawMesh = (mesh: IsoMesh, clipLo: number, clipHi: number, alpha: number) => {
        if (alpha <= 0 || clipHi <= clipLo) return;
        const key = `${yaw.toFixed(3)}:${pitch.toFixed(3)}`;
        const cached = orderCache.current.get(mesh);
        const indices = cached && cached.key === key ? cached.indices : orderedTriangles(mesh, yaw, pitch);
        if (!cached || cached.key !== key) orderCache.current.set(mesh, { key, indices });
        gl.useProgram(meshProg);
        setCamera(meshProg);
        gl.uniform1f(gl.getUniformLocation(meshProg, "uAlpha"), alpha);
        gl.uniform1f(gl.getUniformLocation(meshProg, "uClipLo"), clipLo);
        gl.uniform1f(gl.getUniformLocation(meshProg, "uClipHi"), clipHi);
        if (uploaded !== mesh) {
          gl.bindBuffer(gl.ARRAY_BUFFER, meshPos);
          gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, meshNrm);
          gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
          uploaded = mesh;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, meshPos);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshNrm);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIdx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);
        gl.depthMask(true);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
      };

      const reading = meshFor(shown, frame.plates.length, frame.meshes);
      const previousPlate = shown >= 2 ? frame.plates[shown - 2] : null;
      const currentPlate = shown > 0 ? frame.plates[shown - 1] : null;
      const reveal = ease(frame.arrival);
      const previousY = previousPlate ? plateHeight(previousPlate.z, 0) : -HALF;
      const currentY = currentPlate ? plateHeight(currentPlate.z, 0) : previousY;
      const sweep = previousY + (currentY - previousY) * reveal;
      if (reading.mesh && reading.carried && reading.source != null) {
        const sourcePlate = frame.plates[reading.source - 1];
        const sourceY = sourcePlate ? plateHeight(sourcePlate.z, 0) : previousY;
        drawMesh(reading.mesh, -MODULE_SIZE_X, sourceY, 0.5);
      } else if (reading.mesh && previousPlate) {
        const prior = meshFor(shown - 1, frame.plates.length, frame.meshes);
        if (prior.mesh && prior.mesh !== reading.mesh) drawMesh(prior.mesh, -MODULE_SIZE_X, previousY, 0.5);
        drawMesh(reading.mesh, previousY, sweep, 0.62 * Math.max(frame.fade, reveal));
      }

      gl.useProgram(lineProg);
      setCamera(lineProg);
      gl.uniform4f(gl.getUniformLocation(lineProg, "uColor"), 0.62, 0.86, 0.84, 0.28);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const lines: number[] = [];
      for (let index = 0; index < shown; index += 1) {
        const plate = frame.plates[index];
        if (!plate) continue;
        const y = plateHeight(plate.z, 0);
        const ring = [[-HALF, y, -HALF], [HALF, y, -HALF], [HALF, y, HALF], [-HALF, y, HALF]];
        for (let edge = 0; edge < 4; edge += 1) {
          lines.push(...ring[edge], ...ring[(edge + 1) % 4]);
        }
      }
      const origin: [number, number, number] = [-HALF, -HALF, -HALF];
      const axes: Array<[number, number, number]> = [[4.2, 0, 0], [0, 4.2, 0], [0, 0, 4.2]];
      for (const axis of axes) lines.push(...origin, origin[0] + axis[0], origin[1] + axis[1], origin[2] + axis[2]);
      gl.disableVertexAttribArray(1);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
      gl.depthMask(false);
      gl.drawArrays(gl.LINES, 0, lines.length / 3);
      if (previousPlate && currentPlate && reveal < 0.98) {
        const bridges = bridgeLines(previousPlate, currentPlate, reveal);
        if (bridges.length > 0) {
          gl.uniform4f(gl.getUniformLocation(lineProg, "uColor"), 0.49, 0.84, 0.82, 0.55 * (1 - reveal));
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bridges), gl.DYNAMIC_DRAW);
          gl.drawArrays(gl.LINES, 0, bridges.length / 3);
        }
      }
      gl.depthMask(true);
    };
    paintRef.current = paint;
    paint();
    const observer = parent ? new ResizeObserver(() => paint()) : null;
    observer?.observe(parent ?? canvas);
    return () => {
      paintRef.current = null;
      observer?.disconnect();
      for (const texture of textures) if (texture) gl.deleteTexture(texture);
      gl.deleteBuffer(meshPos);
      gl.deleteBuffer(meshNrm);
      gl.deleteBuffer(meshIdx);
      gl.deleteBuffer(plateBuf);
      gl.deleteBuffer(lineBuf);
      gl.deleteProgram(meshProg);
      gl.deleteProgram(plateProg);
      gl.deleteProgram(lineProg);
    };
  }, [rasters]);

  useEffect(() => {
    paintRef.current?.();
  }, [arrival, fade, isoTick, meshes, plates, stage, viewTick]);

  useEffect(() => {
    const canvas = viewRef.current;
    if (!canvas) return;
    let drag: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag) return;
      orbitProcessIso(camera.current, event.clientX - drag.x, event.clientY - drag.y);
      drag = { x: event.clientX, y: event.clientY };
      onIsoRef.current?.();
      setViewTick((value) => value + 1);
    };
    const up = () => {
      drag = null;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomProcessIso(camera.current, event.deltaY);
      onIsoRef.current?.();
      setViewTick((value) => value + 1);
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    };
  }, []);

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(false);
  };

  const jump = (next: number) => {
    stop();
    onEngage();
    setStage(Math.max(0, Math.min(plates.length, next)));
    setArrival(1);
    setFade(1);
  };

  const playFrom = (from: number) => {
    stop();
    const token: Token = { alive: true };
    stopRef.current = () => {
      token.alive = false;
    };
    setPlaying(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tween = (ms: number, apply: (amount: number) => void) => new Promise<void>((resolve) => {
      if (reduced) {
        apply(1);
        resolve();
        return;
      }
      const start = performance.now();
      const frame = (now: number) => {
        if (!token.alive) {
          resolve();
          return;
        }
        const amount = Math.min(1, (now - start) / ms);
        apply(amount);
        if (amount < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    const wait = (ms: number) => new Promise<void>((resolve) => {
      const id = window.setTimeout(resolve, reduced ? Math.min(ms, 140) : ms);
      const previous = stopRef.current;
      stopRef.current = () => {
        token.alive = false;
        window.clearTimeout(id);
        previous?.();
      };
    });
    void (async () => {
      const total = platesRef.current.length;
      const begin = from <= 0 ? 1 : from;
      for (let next = begin; next <= total; next += 1) {
        if (!token.alive) return;
        const previous = meshFor(next - 1, total, meshesRef.current).mesh;
        const current = meshFor(next, total, meshesRef.current).mesh;
        setStage(next);
        setArrival(reduced ? 1 : 0);
        if (current !== previous) setFade(0);
        await tween(ENTER_MS, setArrival);
        if (!token.alive) return;
        if (current !== previous) await tween(REVEAL_MS, setFade);
        else setFade(1);
        if (!token.alive) return;
        await wait(HOLD_MS);
      }
      if (!token.alive) return;
      setPlaying(false);
      stopRef.current = null;
      onCompleteRef.current();
    })();
  };

  useEffect(() => {
    stop();
    setArrival(1);
    setFade(1);
    setStage(plates.length);
  }, [plates]);

  useEffect(() => {
    if (!autoplay || plates.length === 0) return;
    playFrom(0);
    return () => stop();
    // playFrom is recreated each render; autoplay is the start signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, plates]);

  const shown = meshFor(stage, plates.length, meshes);
  const current = plates[stage - 1];
  const storedCount = Object.keys(meshes).length;
  const prefix = shown.source != null ? `p${String(shown.source).padStart(2, "0")}` : null;
  const note = loading
    ? null
    : plates.length === 0
      ? "Sampling record unavailable."
      : shown.carried && shown.source != null
        ? `Held at ${shown.source} plates.`
        : storedCount === 0
          ? "Development record unavailable."
          : null;
  const resetView = () => {
    if (onResetIso) {
      onResetIso();
      return;
    }
    resetProcessIso(camera.current);
    setViewTick((value) => value + 1);
  };
  const restart = () => {
    stop();
    onEngage();
    setStage(0);
    setArrival(1);
    setFade(1);
  };

  return (
    <div className="process-develop">
      <div className="process-develop-view">
        <canvas ref={viewRef} aria-label="Retained plates growing the morphology through each new interval" />
        {note ? <p className="process-develop-note">{note}</p> : null}
      </div>
      <ol className="process-develop-samples">
        {plates.map((plate, index) => (
          <li key={plate.iteration}>
            <button type="button" data-on={index < stage ? "true" : "false"} onClick={() => jump(index + 1)}>
              {rasters[index] ? <PlateMark source={rasters[index]} /> : <span className="process-develop-mark" />}
              <span>{plate.iteration}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="process-develop-time">
        <div className="process-transport">
          <button type="button" onClick={() => { if (playing) { stop(); onEngage(); return; } onEngage(); playFrom(stage >= plates.length || stage <= 0 ? 0 : stage); }} disabled={plates.length === 0}>{playing ? "Pause" : "Play"}</button>
          <button type="button" onClick={() => { stop(); onEngage(); }} disabled={!playing}>Pause</button>
          <button type="button" onClick={restart} disabled={plates.length === 0}>Restart</button>
          <button type="button" onClick={() => jump(stage - 1)} disabled={stage <= 1}>Previous</button>
          <button type="button" onClick={() => jump(stage + 1)} disabled={stage >= plates.length || plates.length === 0}>Next</button>
          <button type="button" onClick={resetView}>Reset to isometric</button>
          <label>
            <span>Scrub</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, plates.length)}
              value={Math.min(stage, Math.max(1, plates.length))}
              disabled={plates.length === 0}
              aria-valuetext={current ? `Iteration ${current.iteration}, ${stage} retained` : "Start"}
              onChange={(event) => jump(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="process-develop-track" role="group" aria-label="Retained plate count">
          {plates.map((plate, index) => (
            <span key={plate.iteration} className="process-develop-step">
              {index > 0 ? <span aria-hidden="true">→</span> : null}
              <button type="button" data-on={stage === index + 1 ? "true" : "false"} data-seen={index + 1 < stage ? "true" : "false"} onClick={() => jump(index + 1)}>
                {index + 1} {index === 0 ? "plate" : "plates"}
              </button>
            </span>
          ))}
        </div>
        <p className="process-develop-status">
          {stage > 0 && current
            ? `${current.iteration} · ${stage} retained · body through this plate`
            : loading ? "Reading" : "Retained plates"}
        </p>
      </div>
      <details className="process-technical">
        <summary>Technical details</summary>
        <div className="process-technical-body">
          <p>Each new plate opens the next interval. The body already made stays below that plate, and the new reconstruction grows only through the interval.</p>
          <p>Trail threads mark that interval while it opens, then leave. Vertices are not blended. Step 06 holds the stored Open.</p>
          {prefix ? <p>{shown.carried ? `${prefix} is held. The ${plates.length}-plate mesh is not stored.` : `Current prefix ${prefix}.`}</p> : null}
        </div>
      </details>
    </div>
  );
}

function PlateMark({ source }: { source: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = source.width;
    canvas.height = source.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
  }, [source]);
  return <canvas ref={ref} className="process-develop-mark" />;
}
