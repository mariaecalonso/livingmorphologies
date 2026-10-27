"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { DevelopPlate } from "@/components/process-develop-view";
import { rasterTrailPlate } from "@/components/vertical-render";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { MODULE_SIZE_X } from "@/lib/skill3/envelope";
import {
  orbitProcessIso,
  processIsoFit,
  resetProcessIso,
  zoomProcessIso,
  type ProcessIsoCamera,
} from "@/lib/skill3/process-iso-camera";

const HALF = MODULE_SIZE_X / 2;
const GRID = 72;
const DENSITY_SLICES = 56;
const FIELD_PREFIXES = [2, 3, 4, 5, 6] as const;
const TEAL: [number, number, number] = [38, 188, 184];
const STAGES = ["plates", "xyt", "macro", "processed", "surface"] as const;
type StageName = (typeof STAGES)[number];

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
  if (tex.a < 0.04) discard;
  oColor = vec4(tex.rgb, tex.a * uAlpha);
}`;

const VOLUME_FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
uniform sampler3D uField;
uniform sampler3D uFrom;
uniform float uSlice;
uniform float uMix;
uniform float uAlpha;
uniform float uProcessed;
layout(location = 0) out vec4 oColor;
void main() {
  vec3 coord = vec3(vUv, uSlice);
  float value = mix(texture(uFrom, coord).r, texture(uField, coord).r, uMix);
  float presence = smoothstep(0.02, 0.42, value);
  if (presence < 0.02) discard;
  vec3 teal = vec3(0.22, 0.74, 0.72);
  vec3 mass = vec3(0.80, 0.87, 0.85);
  oColor = vec4(mix(teal, mass, uProcessed), presence * presence * uAlpha);
}`;

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
  oColor = vec4(vec3(0.94, 0.95, 0.94) * light, uAlpha);
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec4 uColor;
layout(location = 0) out vec4 oColor;
void main() { oColor = uColor; }`;

type Token = { alive: boolean };

const STAGE_LABEL: Record<StageName, string> = {
  plates: "Retained plates",
  xyt: "XYT field",
  macro: "Macro field",
  processed: "Processed field",
  surface: "Extracted surface",
};

const STAGE_CAPTION: Record<StageName, string> = {
  plates: "Retained samples, each held at its moment.",
  xyt: "The samples become one interpolated density.",
  macro: "That density, read as a continuous field.",
  processed: "The field, prepared as a volume.",
  surface: "The white surface is drawn from that volume.",
};

const STEPS: readonly { stage: StageName }[] = STAGES.map((stage) => ({ stage }));

function storedPrefix(count: number) {
  let prefix = 0;
  for (const item of FIELD_PREFIXES) if (item <= count) prefix = item;
  return prefix;
}

function fadeMs(stage: StageName) {
  if (stage === "plates") return 1200;
  if (stage === "surface") return 900;
  return 780;
}

function holdMs(stage: StageName) {
  if (stage === "plates") return 420;
  if (stage === "processed") return 640;
  if (stage === "surface") return 860;
  return 480;
}

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
    pixels[index + 3] = Math.round(186 * Math.min(1, ink));
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
  if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) return null;
  return shader;
}

export function ProcessGeneration({
  plates,
  meshes,
  autoplay,
  loading = false,
  isoCamera,
  isoTick = 0,
  onIsoCamera,
  onResetIso,
  onEngage,
  onComplete,
}: {
  plates: readonly DevelopPlate[];
  meshes: Readonly<Record<number, IsoMesh>>;
  autoplay: boolean;
  loading?: boolean;
  isoCamera?: MutableRefObject<ProcessIsoCamera>;
  isoTick?: number;
  onIsoCamera?: () => void;
  onResetIso?: () => void;
  onEngage: () => void;
  onComplete: () => void;
}) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const ownedCamera = useRef<ProcessIsoCamera>({ yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2), zoom: 1 });
  const camera = isoCamera ?? ownedCamera;
  const onIsoRef = useRef(onIsoCamera);
  onIsoRef.current = onIsoCamera;
  const [viewTick, setViewTick] = useState(0);
  const [step, setStep] = useState(0);
  const [fade, setFade] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [rasters, setRasters] = useState<HTMLCanvasElement[]>([]);
  const [fields, setFields] = useState<Map<string, Uint8Array>>(() => new Map());
  const [fieldState, setFieldState] = useState<"loading" | "ready" | "missing">("loading");
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const stopRef = useRef<(() => void) | null>(null);
  const paintRef = useRef<(() => void) | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const prefix = storedPrefix(plates.length);
  const live = useRef({ step, fade, rasters, meshes, prefix });
  live.current = { step, fade, rasters, meshes, prefix };

  useEffect(() => {
    const controller = new AbortController();
    const prefixes = [2, 3, 4, 5, 6];
    const stages = ["xyt", "macro", "processed"] as const;
    Promise.all(prefixes.flatMap((retained) => stages.map(async (stage) => {
      const params = new URLSearchParams({
        archetype: "vertical-void",
        candidate: "351",
        continuation: "N24",
        retained: String(retained),
        stage,
      });
      const response = await fetch(`/api/vertical/process-generation/field?${params}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(stage);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== GRID * GRID * GRID) throw new Error("size");
      return [`${retained}:${stage}`, bytes] as const;
    }))).then((entries) => {
      if (controller.signal.aborted) return;
      setFields(new Map(entries));
      setFieldState("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setFieldState("missing");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setRasters(plates.map((plate) => tintPlate(rasterTrailPlate(plate.trails, plate.trailSize, plate.peak, "raw"))));
  }, [plates]);

  useEffect(() => {
    const canvas = viewRef.current;
    const gl = canvas?.getContext("webgl2", { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!canvas || !gl) return;
    const plateProg = program(gl, PLATE_VERT, PLATE_FRAG);
    const volumeProg = program(gl, PLATE_VERT, VOLUME_FRAG);
    const meshProg = program(gl, MESH_VERT, MESH_FRAG);
    const lineProg = program(gl, PLATE_VERT, LINE_FRAG);
    if (!plateProg || !meshProg || !lineProg) return;
    const plateBuf = gl.createBuffer();
    const meshPos = gl.createBuffer();
    const meshNor = gl.createBuffer();
    const meshIdx = gl.createBuffer();
    const lineBuf = gl.createBuffer();
    const volumeTex = gl.createTexture();
    const fromTex = gl.createTexture();
    const bindVolume = (texture: WebGLTexture | null) => {
      if (!texture) return;
      gl.bindTexture(gl.TEXTURE_3D, texture);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    };
    if (fromTex) {
      bindVolume(fromTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, 1, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    }
    const plateTextures = rasters.map((raster) => {
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
    let volumeKey = "";
    let fromKey = "";
    let meshKey = "";
    const paint = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const frame = live.current;
      const current = STEPS[frame.step];
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
      const uploadField = (texture: WebGLTexture | null, key: string, slot: "to" | "from") => {
        const bytes = key ? fieldsRef.current.get(key) : undefined;
        if (!texture || !bytes) return false;
        const currentKey = slot === "to" ? volumeKey : fromKey;
        if (currentKey === key) return true;
        bindVolume(texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, GRID, GRID, GRID, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
        if (slot === "to") volumeKey = key;
        else fromKey = key;
        return true;
      };
      const stage = current?.stage;
      const showVolume = stage === "xyt" || stage === "macro" || stage === "processed" || stage === "surface";
      if (volumeProg && showVolume && volumeTex && fromTex && frame.prefix >= 2) {
        const toName = stage === "surface" ? "processed" : stage;
        const fromName = stage === "macro" ? "xyt" : stage === "processed" || stage === "surface" ? "macro" : "";
        if (!fromName && fromKey !== "zero") {
          bindVolume(fromTex);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
          gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, 1, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
          fromKey = "zero";
        }
        const toReady = uploadField(volumeTex, `${frame.prefix}:${toName}`, "to");
        const fromReady = fromName ? uploadField(fromTex, `${frame.prefix}:${fromName}`, "from") : fromKey === "zero";
        if (toReady && fromReady) {
          const mix = stage === "surface" ? 1 : frame.fade;
          const processed = stage === "xyt" ? 0 : stage === "macro" ? mix * 0.4 : stage === "processed" ? 0.4 + mix * 0.6 : 1;
          const alpha = (stage === "surface" ? 1 - frame.fade : stage === "xyt" ? frame.fade : 1) * 0.22;
          gl.useProgram(volumeProg);
          setCamera(volumeProg);
          gl.uniform1i(gl.getUniformLocation(volumeProg, "uField"), 0);
          gl.uniform1i(gl.getUniformLocation(volumeProg, "uFrom"), 1);
          gl.uniform1f(gl.getUniformLocation(volumeProg, "uMix"), mix);
          gl.uniform1f(gl.getUniformLocation(volumeProg, "uAlpha"), alpha);
          gl.uniform1f(gl.getUniformLocation(volumeProg, "uProcessed"), processed);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_3D, volumeTex);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_3D, fromTex);
          gl.depthMask(false);
          const order = Array.from({ length: DENSITY_SLICES }, (_, index) => (index + 0.5) / DENSITY_SLICES);
          order.sort((a, b) => (b - a) * Math.sin(pitch));
          gl.bindBuffer(gl.ARRAY_BUFFER, plateBuf);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
          for (const slice of order) {
            const y = (slice - 0.5) * MODULE_SIZE_X;
            const quad = new Float32Array([
              -HALF, y, -HALF, 0, 0,
              HALF, y, -HALF, 1, 0,
              HALF, y, HALF, 1, 1,
              -HALF, y, -HALF, 0, 0,
              HALF, y, HALF, 1, 1,
              -HALF, y, HALF, 0, 1,
            ]);
            gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
            gl.uniform1f(gl.getUniformLocation(volumeProg, "uSlice"), slice);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }
          gl.depthMask(true);
        }
      }
      if (stage === "plates" || stage === "xyt") {
        gl.useProgram(plateProg);
        setCamera(plateProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, plateBuf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
        gl.depthMask(false);
        const count = plates.length;
        for (let index = 0; index < count; index += 1) {
          const plate = plates[index];
          const texture = plateTextures[index];
          if (!plate || !texture) continue;
          const arrival = stage === "plates" ? Math.min(1, Math.max(0, frame.fade * count - index)) : 1 - frame.fade;
          if (arrival <= 0.01) continue;
          const y = (plate.z - 0.5) * MODULE_SIZE_X;
          const quad = new Float32Array([
            -HALF, y, -HALF, 0, 1,
            HALF, y, -HALF, 1, 1,
            HALF, y, HALF, 1, 0,
            -HALF, y, -HALF, 0, 1,
            HALF, y, HALF, 1, 0,
            -HALF, y, HALF, 0, 0,
          ]);
          gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
          gl.uniform1f(gl.getUniformLocation(plateProg, "uAlpha"), 0.92 * arrival);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.uniform1i(gl.getUniformLocation(plateProg, "uPlate"), 0);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        gl.depthMask(true);
      }
      if (stage === "surface" && frame.fade > 0 && frame.prefix >= 2) {
        const mesh = frame.meshes[frame.prefix];
        if (mesh && mesh.triangles > 0) {
          gl.useProgram(meshProg);
          setCamera(meshProg);
          if (meshKey !== String(frame.prefix)) {
            gl.bindBuffer(gl.ARRAY_BUFFER, meshPos);
            gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, meshNor);
            gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIdx);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
            meshKey = String(frame.prefix);
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, meshPos);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, meshNor);
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIdx);
          gl.uniform1f(gl.getUniformLocation(meshProg, "uAlpha"), 0.92 * frame.fade);
          gl.uniform1f(gl.getUniformLocation(meshProg, "uClipLo"), -MODULE_SIZE_X);
          gl.uniform1f(gl.getUniformLocation(meshProg, "uClipHi"), MODULE_SIZE_X);
          gl.depthMask(true);
          gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
        }
      }
      gl.useProgram(lineProg);
      setCamera(lineProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(1);
      const origin = -HALF;
      const axis = 4.2;
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        origin, origin, origin, origin + axis, origin, origin,
        origin, origin, origin, origin, origin + axis, origin,
        origin, origin, origin, origin, origin, origin + axis,
      ]), gl.STATIC_DRAW);
      gl.uniform4f(gl.getUniformLocation(lineProg, "uColor"), 0.55, 0.78, 0.76, 0.35);
      gl.drawArrays(gl.LINES, 0, 6);
    };
    paintRef.current = paint;
    paint();
    const parent = canvas.parentElement;
    const observer = parent ? new ResizeObserver(() => paint()) : null;
    observer?.observe(parent ?? canvas);
    return () => {
      paintRef.current = null;
      observer?.disconnect();
      gl.deleteTexture(volumeTex);
      if (fromTex) gl.deleteTexture(fromTex);
      for (const texture of plateTextures) if (texture) gl.deleteTexture(texture);
    };
  }, [camera, plates, rasters]);

  useEffect(() => {
    paintRef.current?.();
  }, [fade, fields, fieldState, isoTick, meshes, step, viewTick]);

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
  }, [camera]);

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(false);
  };

  const jump = (next: number) => {
    stop();
    onEngage();
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
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
    const wait = (ms: number) => new Promise<void>((resolve) => {
      const id = window.setTimeout(resolve, reduced ? 80 : ms);
      const previous = stopRef.current;
      stopRef.current = () => {
        token.alive = false;
        window.clearTimeout(id);
        previous?.();
      };
    });
    void (async () => {
      for (let index = from; index < STEPS.length; index += 1) {
        if (!token.alive) return;
        const stage = STEPS[index].stage;
        setStep(index);
        setFade(reduced ? 1 : 0);
        const start = performance.now();
        const duration = reduced ? 1 : fadeMs(stage);
        await new Promise<void>((resolve) => {
          const frame = (now: number) => {
            if (!token.alive) {
              resolve();
              return;
            }
            const amount = Math.min(1, (now - start) / duration);
            setFade(amount);
            if (amount < 1) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        if (!token.alive) return;
        await wait(holdMs(stage));
      }
      if (!token.alive) return;
      setPlaying(false);
      stopRef.current = null;
      onCompleteRef.current();
    })();
  };

  useEffect(() => {
    if (!autoplay || fieldState !== "ready" || STEPS.length === 0) return;
    playFrom(0);
    return () => stop();
    // Playback starts once, when the verified fields are ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, fieldState]);

  const current = STEPS[step];
  const resetView = () => {
    if (onResetIso) {
      onResetIso();
      return;
    }
    resetProcessIso(camera.current);
    setViewTick((value) => value + 1);
  };

  return (
    <div className="process-develop">
      <div className="process-develop-view">
        <canvas ref={viewRef} aria-label="Retained plates becoming a continuous field, then a surface" />
        {fieldState === "missing" ? <p className="process-develop-note">Generation record unavailable.</p> : null}
      </div>
      <p className="process-develop-status">
        {current
          ? STAGE_LABEL[current.stage]
          : loading || fieldState === "loading" ? "Reading" : "Retained plates"}
      </p>
      {current ? <p className="process-develop-method">{STAGE_CAPTION[current.stage]}</p> : null}
      <div className="process-develop-track" role="group" aria-label="Computational stage">
        {STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            data-on={current?.stage === stage ? "true" : "false"}
            disabled={stage !== "plates" && fieldState !== "ready"}
            onClick={() => jump(STAGES.indexOf(stage))}
          >
            {STAGE_LABEL[stage]}
          </button>
        ))}
      </div>
      <div className="process-develop-time">
        <div className="process-transport">
          <button type="button" onClick={() => { if (playing) { stop(); onEngage(); return; } onEngage(); playFrom(step); }} disabled={fieldState !== "ready"}>{playing ? "Pause" : "Play"}</button>
          <button type="button" onClick={() => { stop(); onEngage(); }} disabled={!playing}>Pause</button>
          <button type="button" onClick={() => jump(0)} disabled={fieldState !== "ready"}>Restart</button>
          <button type="button" onClick={() => jump(step - 1)} disabled={step <= 0}>Previous</button>
          <button type="button" onClick={() => jump(step + 1)} disabled={step >= STEPS.length - 1}>Next</button>
          <button type="button" onClick={resetView}>Reset to isometric</button>
          <label>
            <span>Scrub</span>
            <input
              type="range"
              min={0}
              max={STEPS.length - 1}
              value={step}
              disabled={fieldState !== "ready"}
              aria-valuetext={current ? STAGE_LABEL[current.stage] : "Start"}
              onChange={(event) => jump(Number(event.target.value))}
            />
          </label>
        </div>
      </div>
      <details className="process-technical">
        <summary>Technical details</summary>
        <div className="process-technical-body">
          <p>Retained samples are held at their moments, then fade as the stored XYT density fills the module. The density is the interpolated field between those samples.</p>
          <p>The macro field is that density read continuously. The processed field is the volume. The white surface is drawn only after that volume is shown.</p>
          <p>Vertical Void N24. Stored 72³ scalar fields, same isometric view as Step 06. Generation data and the Open morphology are unchanged.</p>
        </div>
      </details>
    </div>
  );
}
