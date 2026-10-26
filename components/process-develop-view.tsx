"use client";

import { useEffect, useRef, useState } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { MODULE_SIZE_X, moduleEnvelope, moduleViewColumn } from "@/lib/skill3/envelope";
import { moduleViewFit } from "@/lib/skill3/view-project";
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
  vec3 view = vec3(x1 * uFit, y2 * uFit * uAspect, -z2 * uFit - 3.4);
  float near = 0.35;
  float far = 14.0;
  float f = 1.55;
  gl_Position = vec4(view.x * f, view.y * f, (view.z * (far + near) + 2.0 * far * near) / (near - far), -view.z);
}`;

const MESH_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
uniform float uAlpha;
layout(location = 0) out vec4 oColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  if (dot(n, viewDir) < 0.0) n = -n;
  vec3 key = normalize(vec3(0.35, 0.82, 0.48));
  float light = 0.78 + 0.22 * clamp(dot(n, key), 0.0, 1.0);
  vec3 col = vec3(0.95, 0.96, 0.95) * light;
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
  vec3 view = vec3(x1 * uFit, y2 * uFit * uAspect, -z2 * uFit - 3.4);
  float near = 0.35;
  float far = 14.0;
  float f = 1.55;
  gl_Position = vec4(view.x * f, view.y * f, (view.z * (far + near) + 2.0 * far * near) / (near - far), -view.z);
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
  vec3 view = vec3(x1 * uFit, y2 * uFit * uAspect, -z2 * uFit - 3.4);
  float near = 0.35;
  float far = 14.0;
  float f = 1.55;
  gl_Position = vec4(view.x * f, view.y * f, (view.z * (far + near) + 2.0 * far * near) / (near - far), -view.z);
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

/** The mesh stored for this plate count. The last stored prefix is kept only on the final stage. */
function meshFor(stage: number, total: number, meshes: Readonly<Record<number, IsoMesh>>) {
  if (stage < 2) return { mesh: null as IsoMesh | null, carried: false };
  if (meshes[stage]) return { mesh: meshes[stage], carried: false };
  if (stage === total) {
    const earlier = Object.keys(meshes).map(Number).filter((count) => count < stage).sort((a, b) => b - a);
    const last = earlier[0];
    if (last != null) return { mesh: meshes[last], carried: true };
  }
  return { mesh: null, carried: true };
}

export function ProcessDevelop({
  plates,
  meshes,
  autoplay,
  onComplete,
  onEngage,
}: {
  plates: readonly DevelopPlate[];
  meshes: Readonly<Record<number, IsoMesh>>;
  autoplay: boolean;
  onComplete: () => void;
  onEngage: () => void;
}) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const camera = useRef({ yaw: Math.PI / 4, pitch: 0.62, zoom: 1 });
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
      const column = moduleViewColumn(moduleEnvelope(MODULE_SIZE_X)) * 0.72;
      const fit = moduleViewFit(column, aspect) * zoom;
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
        const y = plateHeight(plate.z, entering ? (1 - frame.arrival) * -1.8 : 0);
        const quad = new Float32Array([
          -HALF, y, -HALF, 0, 0,
          HALF, y, -HALF, 1, 0,
          HALF, y, HALF, 1, 1,
          -HALF, y, -HALF, 0, 0,
          HALF, y, HALF, 1, 1,
          -HALF, y, HALF, 0, 1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
        gl.uniform1f(gl.getUniformLocation(plateProg, "uAlpha"), entering ? 0.15 + frame.arrival * 0.55 : 0.7);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(plateProg, "uPlate"), 0);
        gl.depthMask(true);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      const reading = meshFor(shown, frame.plates.length, frame.meshes);
      if (reading.mesh && frame.fade > 0) {
        const key = `${yaw.toFixed(3)}:${pitch.toFixed(3)}`;
        const cached = orderCache.current.get(reading.mesh);
        const indices = cached && cached.key === key ? cached.indices : orderedTriangles(reading.mesh, yaw, pitch);
        if (!cached || cached.key !== key) orderCache.current.set(reading.mesh, { key, indices });
        gl.useProgram(meshProg);
        setCamera(meshProg);
        gl.uniform1f(gl.getUniformLocation(meshProg, "uAlpha"), 0.72 * frame.fade);
        if (uploaded !== reading.mesh) {
          gl.bindBuffer(gl.ARRAY_BUFFER, meshPos);
          gl.bufferData(gl.ARRAY_BUFFER, reading.mesh.positions, gl.STATIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, meshNrm);
          gl.bufferData(gl.ARRAY_BUFFER, reading.mesh.normals, gl.STATIC_DRAW);
          uploaded = reading.mesh;
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
        const entering = index === shown - 1;
        const y = plateHeight(plate.z, entering ? (1 - frame.arrival) * -1.8 : 0);
        const ring = [[-HALF, y, -HALF], [HALF, y, -HALF], [HALF, y, HALF], [-HALF, y, HALF]];
        for (let edge = 0; edge < 4; edge += 1) {
          lines.push(...ring[edge], ...ring[(edge + 1) % 4]);
        }
      }
      const origin: [number, number, number] = [-HALF, -HALF, -HALF];
      const axes: Array<[number, number, number]> = [[4.2, 0, 0], [0, 4.2, 0], [0, 0, 4.2]];
      for (const axis of axes) lines.push(...origin, origin[0] + axis[0], origin[1] + axis[1], origin[2] + axis[2]);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
      gl.depthMask(false);
      gl.drawArrays(gl.LINES, 0, lines.length / 3);
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
  }, [arrival, fade, meshes, plates, stage, viewTick]);

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
      camera.current.yaw += (event.clientX - drag.x) * 0.005;
      camera.current.pitch = Math.min(1.2, Math.max(0.15, camera.current.pitch + (event.clientY - drag.y) * 0.005));
      drag = { x: event.clientX, y: event.clientY };
      setViewTick((value) => value + 1);
    };
    const up = () => {
      drag = null;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = camera.current.zoom * (event.deltaY > 0 ? 0.92 : 1.08);
      camera.current.zoom = Math.min(1.85, Math.max(0.62, next));
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
    setStage(Math.max(1, Math.min(plates.length, next)));
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
    if (!autoplay || plates.length === 0) return;
    playFrom(0);
    return () => stop();
    // playFrom is recreated each render; autoplay is the start signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, plates]);

  const shown = meshFor(stage, plates.length, meshes);
  const current = plates[stage - 1];
  const unavailable = stage === plates.length && plates.length > 0 && shown.carried;
  const resetView = () => {
    camera.current = { yaw: Math.PI / 4, pitch: 0.62, zoom: 1 };
    setViewTick((value) => value + 1);
  };

  return (
    <div className="process-develop">
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
      <div className="process-develop-view">
        <canvas ref={viewRef} aria-label="Retained plates and the stored morphology reconstructions" />
        {unavailable ? <p className="process-develop-note">{plates.length === 6 ? "Six samples retained — intermediate mesh unavailable." : `${plates.length} samples retained — intermediate mesh unavailable.`}</p> : null}
        {plates.length === 0 ? <p className="process-develop-note">Retained plates are not stored for this continuation.</p> : null}
      </div>
      <div className="process-develop-time">
        <div className="process-transport">
          <button type="button" onClick={() => { if (playing) { stop(); onEngage(); return; } onEngage(); playFrom(stage >= plates.length ? 0 : stage === 0 ? 0 : stage); }} disabled={plates.length === 0}>{playing ? "Pause" : "Play"}</button>
          <button type="button" onClick={() => jump(stage - 1)} disabled={stage <= 1}>Previous</button>
          <button type="button" onClick={() => jump(stage + 1)} disabled={stage >= plates.length}>Next</button>
          <button type="button" onClick={() => { onEngage(); playFrom(0); }} disabled={plates.length === 0 || playing}>Replay</button>
          <button type="button" onClick={resetView}>Reset view</button>
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
        <p className="process-develop-status">{stage > 0 && current ? `${stage} ${stage === 1 ? "plate" : "plates"} · iteration ${current.iteration}` : "Retained plates"}</p>
      </div>
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
