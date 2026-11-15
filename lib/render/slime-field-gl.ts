/**
 * Trail field drawn as a sharp cream network.
 * Each slider changes a different part of that picture: weight, spread,
 * bundling, reach, width, corners, stride, and the resistant patch.
 * Values stay on a fixed scale, so a stronger deposit reads as stronger ink.
 */

export type FieldGraphic = {
  /** 0 is one heavy path. 1 is many fine separate paths. */
  density: number;
  /** 0 is a short look. 1 extends each branch forward. */
  sensor: number;
  /** 0 is a single hair. 1 opens the stroke to the sides. */
  angle: number;
  /** 0 is an even stroke. 1 marks the corners. */
  turn: number;
  /** 0 is a continuous line. 1 breaks it into longer strides. */
  move: number;
  /** 0 is dim ink. 1 is white. */
  deposit: number;
  /** 0 is the ridge only. 1 shows the spread around it. */
  diffusion: number;
  /** 0 keeps every hair. 1 keeps the reinforced trunks. */
  influence: number;
  /** 0 is an even field. 1 thins the resistant patch and dots it. */
  resistance: number;
};

export const NEUTRAL_FIELD_GRAPHIC: FieldGraphic = {
  density: 0.45,
  sensor: 0.4,
  angle: 0.35,
  turn: 0.45,
  move: 0.2,
  deposit: 0.35,
  diffusion: 0.15,
  influence: 0.5,
  resistance: 0,
};

import type { FieldAttractor } from "@/lib/skill1/types";
import { FIELD_SIZE } from "@/lib/skill1/maps";
import { activePhysarumInk, type PhysarumInk } from "@/lib/skill1/physarum-ink";

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform float uTexels;
uniform float uCutoff;
uniform int uCount;
uniform vec4 uAttr[16];
uniform float uKind[16];
uniform float uSearch;
uniform float uVein;
uniform float uCore;
uniform float uDensity;
uniform float uSensor;
uniform float uAngle;
uniform float uTurn;
uniform float uMove;
uniform float uDeposit;
uniform float uDiffusion;
uniform float uInfluence;
uniform float uResist;
in vec2 vUv;
out vec4 oColor;

float tap(vec2 st) {
  return texture(uField, clamp(st, 0.0, 1.0)).r;
}

void main() {
  float t = 1.0 / uTexels;
  float gain = mix(0.75, 1.55, smoothstep(0.0, 0.7, clamp(uDeposit, 0.0, 1.0)));
  float v = tap(vUv) * gain;
  float e = tap(vUv + vec2(t, 0.0)) * gain;
  float w = tap(vUv - vec2(t, 0.0)) * gain;
  float n = tap(vUv + vec2(0.0, t)) * gain;
  float s = tap(vUv - vec2(0.0, t)) * gain;
  float around = 0.25 * (e + w + n + s);
  float ridge = max(0.0, v - around);
  vec2 grad = vec2(e - w, n - s);
  float glen = length(grad);
  vec2 tangent = glen > 0.0008 ? vec2(-grad.y, grad.x) / glen : vec2(1.0, 0.0);
  vec2 normal = vec2(-tangent.y, tangent.x);

  float gate = mix(0.0014, 0.007, clamp(uDensity, 0.0, 1.0));
  float core = smoothstep(gate, gate * 3.0, ridge);

  float reach = tap(vUv + tangent * t * mix(0.0, 4.0, clamp(uSensor, 0.0, 1.0))) * gain;
  core = max(core, smoothstep(0.025, 0.11, reach) * smoothstep(0.4, 0.95, uSensor) * 0.9);

  float flank = max(tap(vUv + normal * t), tap(vUv - normal * t)) * gain;
  core = max(core, smoothstep(gate * 1.5, gate * 4.0, flank * 0.92) * smoothstep(0.35, 1.0, uAngle));

  float curve = abs(e - 2.0 * v + w) + abs(n - 2.0 * v + s);
  float corner = smoothstep(0.014, 0.08, curve);
  core = min(1.0, core + corner * smoothstep(0.3, 1.0, uTurn));

  float along = dot(vUv * uTexels, tangent);
  float period = mix(4.0, 18.0, clamp(uMove, 0.0, 1.0));
  float phase = abs(fract(along / period) - 0.5) * 2.0;
  core *= mix(1.0, smoothstep(0.06, 0.38, phase), smoothstep(0.45, 0.95, uMove));

  float trunk = smoothstep(0.08, 0.22, v);
  core = mix(core, max(trunk, core * 0.22), smoothstep(0.35, 1.0, uInfluence));

  float skirt = smoothstep(0.02, 0.09, v) * (1.0 - smoothstep(0.004, 0.02, ridge));
  skirt *= smoothstep(0.2, 1.0, uDiffusion) * 0.55;

  float nx = vUv.x;
  float ny = vUv.y;
  float patch = exp(-((nx - 0.68) * (nx - 0.68) + (ny - 0.32) * (ny - 0.32)) / 0.06);
  float local = clamp((nx * 0.55 + ny * 0.2) * 0.45 + patch * 0.7, 0.0, 1.0);
  float resist = clamp(uResist, 0.0, 1.0) * local;
  core *= mix(1.0, 0.22, resist);

  float cover = max(core, skirt * 0.72);
  float grain = fract(sin(dot(floor(vUv * uTexels), vec2(12.9898, 78.233))) * 43758.5453);
  float dust = step(0.8, grain) * resist * 0.62;
  if (uCount < 0) cover += uAttr[0].x + uKind[0] + uSearch + uVein + uCore + uCutoff;
  float weight = mix(0.5, 1.0, smoothstep(0.0, 0.45, clamp(uDeposit, 0.0, 1.0)));
  if (cover < 0.02 && dust < 0.02) {
    oColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 hair = vec3(0.90, 0.87, 0.76);
  vec3 trunkColor = vec3(0.99, 0.98, 0.95);
  vec3 ink = mix(hair, trunkColor, clamp(trunk, 0.0, 1.0));
  vec3 rgb = ink * clamp(cover, 0.0, 1.0) * weight;
  rgb += vec3(0.55, 0.38, 0.28) * dust * (1.0 - clamp(cover, 0.0, 1.0));
  oColor = vec4(min(rgb, vec3(1.0)), 1.0);
}`;

type GlState = {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  buffer: WebGLBuffer;
  uTexels: WebGLUniformLocation;
  uCutoff: WebGLUniformLocation;
  uCount: WebGLUniformLocation;
  uAttr: WebGLUniformLocation;
  uKind: WebGLUniformLocation;
  uSearch: WebGLUniformLocation;
  uVein: WebGLUniformLocation;
  uCore: WebGLUniformLocation;
  uDensity: WebGLUniformLocation;
  uSensor: WebGLUniformLocation;
  uAngle: WebGLUniformLocation;
  uTurn: WebGLUniformLocation;
  uMove: WebGLUniformLocation;
  uDeposit: WebGLUniformLocation;
  uDiffusion: WebGLUniformLocation;
  uInfluence: WebGLUniformLocation;
  uResist: WebGLUniformLocation;
  pixels: Float32Array;
};

let state: GlState | null = null;
let failed = false;
const SHADER_GEN = 34;
let builtGen = -1;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createState(): GlState | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;
  const vert = compile(gl, gl.VERTEX_SHADER, VERT);
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const uTexels = gl.getUniformLocation(program, "uTexels");
  const uCutoff = gl.getUniformLocation(program, "uCutoff");
  const uCount = gl.getUniformLocation(program, "uCount");
  const uAttr = gl.getUniformLocation(program, "uAttr");
  const uKind = gl.getUniformLocation(program, "uKind");
  const uSearch = gl.getUniformLocation(program, "uSearch");
  const uVein = gl.getUniformLocation(program, "uVein");
  const uCore = gl.getUniformLocation(program, "uCore");
  const uDensity = gl.getUniformLocation(program, "uDensity");
  const uSensor = gl.getUniformLocation(program, "uSensor");
  const uAngle = gl.getUniformLocation(program, "uAngle");
  const uTurn = gl.getUniformLocation(program, "uTurn");
  const uMove = gl.getUniformLocation(program, "uMove");
  const uDeposit = gl.getUniformLocation(program, "uDeposit");
  const uDiffusion = gl.getUniformLocation(program, "uDiffusion");
  const uInfluence = gl.getUniformLocation(program, "uInfluence");
  const uResist = gl.getUniformLocation(program, "uResist");
  if (
    !buffer || !texture || !uTexels || !uCutoff || !uCount || !uAttr || !uKind ||
    !uSearch || !uVein || !uCore || !uDensity || !uSensor || !uAngle || !uTurn ||
    !uMove || !uDeposit || !uDiffusion || !uInfluence || !uResist
  ) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  return {
    canvas,
    gl,
    program,
    texture,
    buffer,
    uTexels,
    uCutoff,
    uCount,
    uAttr,
    uKind,
    uSearch,
    uVein,
    uCore,
    uDensity,
    uSensor,
    uAngle,
    uTurn,
    uMove,
    uDeposit,
    uDiffusion,
    uInfluence,
    uResist,
    pixels: new Float32Array(0),
  };
}

function ensure(): GlState | null {
  if (failed && builtGen === SHADER_GEN) return null;
  if (state && !state.gl.isContextLost() && builtGen === SHADER_GEN) return state;
  state = createState();
  builtGen = SHADER_GEN;
  if (!state) failed = true;
  else failed = false;
  return state;
}

/** Draws the trail field into `ctx` at the field square. Returns false if WebGL2 is unavailable. */
export function drawSlimeFieldGl(
  ctx: CanvasRenderingContext2D,
  trails: ArrayLike<number>,
  trailSize: number,
  _peak: number,
  fieldW: number,
  fieldH: number,
  cutoff: number,
  attractors?: FieldAttractor[],
  ink: PhysarumInk = activePhysarumInk(),
  graphic: FieldGraphic = NEUTRAL_FIELD_GRAPHIC,
): boolean {
  const gpu = ensure();
  if (!gpu) return false;
  const { gl, canvas } = gpu;
  const dpr = Math.max(1, ctx.getTransform().a || (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1);
  const pixels = Math.max(512, Math.min(2048, Math.round(Math.max(fieldW, fieldH) * dpr)));
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  const count = trailSize * trailSize;
  if (gpu.pixels.length !== count) gpu.pixels = new Float32Array(count);
  const plate = ink ?? activePhysarumInk();
  const inkScale = 0.55;
  for (let i = 0; i < count; i += 1) gpu.pixels[i] = Math.min(1, Math.max(0, trails[i] / inkScale));

  gl.viewport(0, 0, pixels, pixels);
  gl.useProgram(gpu.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gpu.buffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, trailSize, trailSize, 0, gl.RED, gl.FLOAT, gpu.pixels);
  gl.uniform1i(gl.getUniformLocation(gpu.program, "uField"), 0);
  gl.uniform1f(gpu.uTexels, trailSize);
  gl.uniform1f(gpu.uCutoff, cutoff);
  const packed = new Float32Array(64);
  const kinds = new Float32Array(16);
  const list = attractors ?? [];
  const attractorCount = Math.min(16, list.length);
  for (let i = 0; i < attractorCount; i += 1) {
    const item = list[i];
    const x = item.x / FIELD_SIZE;
    const y = item.y / FIELD_SIZE;
    if (item.kind === "line" || item.kind === "curve") {
      packed.set([x, y, (item.x2 ?? item.x) / FIELD_SIZE, (item.y2 ?? item.y) / FIELD_SIZE], i * 4);
      kinds[i] = 2;
    } else if (item.kind === "ring") {
      packed.set([x, y, (item.radius ?? 4) / FIELD_SIZE, 0], i * 4);
      kinds[i] = 1;
    } else {
      packed.set([x, y, 0, 0], i * 4);
    }
  }
  gl.uniform1i(gpu.uCount, attractorCount);
  gl.uniform4fv(gpu.uAttr, packed);
  gl.uniform1fv(gpu.uKind, kinds);
  gl.uniform1f(gpu.uSearch, plate.search);
  gl.uniform1f(gpu.uVein, plate.vein);
  gl.uniform1f(gpu.uCore, plate.core);
  gl.uniform1f(gpu.uDensity, graphic.density);
  gl.uniform1f(gpu.uSensor, graphic.sensor);
  gl.uniform1f(gpu.uAngle, graphic.angle);
  gl.uniform1f(gpu.uTurn, graphic.turn);
  gl.uniform1f(gpu.uMove, graphic.move);
  gl.uniform1f(gpu.uDeposit, graphic.deposit);
  gl.uniform1f(gpu.uDiffusion, graphic.diffusion);
  gl.uniform1f(gpu.uInfluence, graphic.influence);
  gl.uniform1f(gpu.uResist, graphic.resistance);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, fieldW, fieldH);
  ctx.restore();
  return true;
}
