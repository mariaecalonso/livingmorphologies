/**
 * Trail-density field → continuous Physarum tissue.
 * Agents are never drawn. Discrete deposits are reconstructed into an
 * implicit surface: membranes where paths reinforce, tubes of varying
 * thickness, and thin peripheral filaments. Edges are geometric
 * (isosurface + 1px AA), not glow.
 *
 * Palette is role-based:
 * white = exploratory protoplasm, terracotta = reinforced veins,
 * teal = slime organized around attractors or densest committed nodes.
 */

import type { FieldAttractor } from "@/lib/skill1/types";
import { FIELD_SIZE } from "@/lib/skill1/maps";

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
uniform float uHairThin;
uniform float uInk;
uniform int uCount;
uniform vec4 uAttr[16];
uniform float uKind[16];
in vec2 vUv;
out vec4 oColor;

float tap(vec2 st) {
  return texture(uField, clamp(st, 0.0, 1.0)).r;
}

float bspline0(float t) { return (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0; }
float bspline1(float t) { return (3.0 * t * t * t - 6.0 * t * t + 4.0) / 6.0; }
float bspline2(float t) { return (-3.0 * t * t * t + 3.0 * t * t + 3.0 * t + 1.0) / 6.0; }
float bspline3(float t) { return t * t * t / 6.0; }

float bilinear(vec2 uv) {
  vec2 p = clamp(uv, 0.0, 1.0) * uTexels - 0.5;
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 d = vec2(1.0) / uTexels;
  float a = tap((i + 0.5) * d);
  float b = tap((i + vec2(1.5, 0.5)) * d);
  float c = tap((i + vec2(0.5, 1.5)) * d);
  float e = tap((i + vec2(1.5, 1.5)) * d);
  return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
}

float fieldAt(vec2 uv) {
  vec2 p = clamp(uv, 0.0, 1.0) * uTexels - 0.5;
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 d = vec2(1.0) / uTexels;
  float wx[4];
  wx[0] = bspline0(f.x);
  wx[1] = bspline1(f.x);
  wx[2] = bspline2(f.x);
  wx[3] = bspline3(f.x);
  float wy[4];
  wy[0] = bspline0(f.y);
  wy[1] = bspline1(f.y);
  wy[2] = bspline2(f.y);
  wy[3] = bspline3(f.y);
  float acc = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      acc += tap((i + vec2(float(x - 1), float(y - 1)) + 0.5) * d) * wx[x] * wy[y];
    }
  }
  return max(0.0, acc);
}

float distToSeg(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float den = dot(ab, ab);
  float t = den > 0.000001 ? clamp(dot(p - a, ab) / den, 0.0, 1.0) : 0.0;
  return length(p - (a + ab * t));
}

float attractorNear(vec2 uv) {
  if (uCount <= 0) return 0.0;
  float best = 1.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    vec4 a = uAttr[i];
    float kind = uKind[i];
    float d = distance(uv, a.xy);
    if (kind > 1.5) d = distToSeg(uv, a.xy, a.zw);
    else if (kind > 0.5) d = abs(distance(uv, a.xy) - a.z);
    best = min(best, d);
  }
  return 1.0 - smoothstep(0.0, 0.16, best);
}

void main() {
  float t = 1.0 / uTexels;
  float vSmooth = fieldAt(vUv);
  float vSharp = bilinear(vUv);
  float v = uHairThin > 0.5 && vSmooth < 0.14 ? vSharp : vSmooth;
  float e = uHairThin > 0.5 ? bilinear(vUv + vec2(t, 0.0)) : fieldAt(vUv + vec2(t, 0.0));
  float w = uHairThin > 0.5 ? bilinear(vUv - vec2(t, 0.0)) : fieldAt(vUv - vec2(t, 0.0));
  float n = uHairThin > 0.5 ? bilinear(vUv + vec2(0.0, t)) : fieldAt(vUv + vec2(0.0, t));
  float s = uHairThin > 0.5 ? bilinear(vUv - vec2(0.0, t)) : fieldAt(vUv - vec2(0.0, t));
  float ne = uHairThin > 0.5 ? bilinear(vUv + vec2(t, t)) : fieldAt(vUv + vec2(t, t));
  float nw = uHairThin > 0.5 ? bilinear(vUv + vec2(-t, t)) : fieldAt(vUv + vec2(-t, t));
  float se = uHairThin > 0.5 ? bilinear(vUv + vec2(t, -t)) : fieldAt(vUv + vec2(t, -t));
  float sw = uHairThin > 0.5 ? bilinear(vUv + vec2(-t, -t)) : fieldAt(vUv + vec2(-t, -t));
  float around = 0.125 * (e + w + n + s + ne + nw + se + sw);
  float ridge = max(0.0, v - around * 0.62);
  vec2 g = vec2(e - w, n - s);
  float glen = length(g);
  vec2 along = glen > 1.0e-6 ? vec2(-g.y, g.x) / glen : vec2(1.0, 0.0);
  float tissue = v;
  bool link = uHairThin > 0.5 ? (v > 0.12 || ridge > 0.02) : (v > 0.04 || ridge > 0.005);
  if (link) {
    float linked = v;
    for (int i = 1; i <= 8; i++) {
      float step = float(i) * t * 1.6;
      linked = max(linked, fieldAt(vUv + along * step));
      linked = max(linked, fieldAt(vUv - along * step));
    }
    tissue = max(v, linked * 0.96);
  }

  float membrane = smoothstep(0.14, 0.28, tissue);
  float tube = smoothstep(0.045, 0.12, tissue) * smoothstep(0.004, 0.016, ridge);
  float hair = uHairThin > 0.5
    ? smoothstep(0.010, 0.020, v) * (1.0 - smoothstep(0.070, 0.140, v)) * smoothstep(max(fwidth(v), t) * 0.35, max(fwidth(v), t) * 1.4, ridge)
    : smoothstep(0.018, 0.04, tissue) * smoothstep(0.008, 0.02, ridge);
  float mask = max(membrane, max(tube, hair));
  if (mask < 0.02) {
    oColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float aa = max(fwidth(mask), 0.008);
  float cover = smoothstep((uHairThin > 0.5 ? 0.12 : 0.22) - aa, (uHairThin > 0.5 ? 0.12 : 0.22) + aa, mask);
  if (cover < 0.03) {
    oColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float body = clamp(tissue, 0.0, 1.0);
  float depth = pow(body, 0.68);
  float membraneTone = 0.88 + 0.12 * smoothstep(0.0, 0.08, ridge);
  float anchor = attractorNear(vUv);
  vec3 search = vec3(1.0, 1.0, 1.0);
  vec3 vein = vec3(0.780, 0.494, 0.373);
  vec3 organized = vec3(0.059, 0.451, 0.467);
  vec3 ink = mix(search, vein, smoothstep(0.08, 0.34, body));
  float core = max(anchor * smoothstep(0.08, 0.32, body), smoothstep(0.48, 0.82, body));
  ink = mix(ink, organized, core * mix(0.35, 0.72, body));
  ink *= depth * membraneTone * uInk;
  oColor = vec4(ink * cover, 1.0);
}`;

type GlState = {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  buffer: WebGLBuffer;
  uTexels: WebGLUniformLocation;
  uCutoff: WebGLUniformLocation | null;
  uHairThin: WebGLUniformLocation;
  uInk: WebGLUniformLocation;
  uCount: WebGLUniformLocation;
  uAttr: WebGLUniformLocation;
  uKind: WebGLUniformLocation;
  pixels: Float32Array;
  blit: HTMLCanvasElement;
  blitCtx: CanvasRenderingContext2D;
  read: Uint8Array;
  flip: Uint8ClampedArray;
};

let state: GlState | null = null;
let failed = false;
const SHADER_GEN = 30;
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
  const uHairThin = gl.getUniformLocation(program, "uHairThin");
  const uInk = gl.getUniformLocation(program, "uInk");
  const uCount = gl.getUniformLocation(program, "uCount");
  const uAttr = gl.getUniformLocation(program, "uAttr");
  const uKind = gl.getUniformLocation(program, "uKind");
  if (!buffer || !texture || !uTexels || !uHairThin || !uInk || !uCount || !uAttr || !uKind) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const blit = document.createElement("canvas");
  const blitCtx = blit.getContext("2d", { alpha: false });
  if (!blitCtx) return null;
  return {
    canvas,
    gl,
    program,
    texture,
    buffer,
    uTexels,
    uCutoff,
    uHairThin,
    uInk,
    uCount,
    uAttr,
    uKind,
    pixels: new Float32Array(0),
    blit,
    blitCtx,
    read: new Uint8Array(0),
    flip: new Uint8ClampedArray(0),
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
  peak: number,
  fieldW: number,
  fieldH: number,
  cutoff: number,
  attractors?: FieldAttractor[],
  hairThin = false,
  maxResolution?: number,
  inkGain = 1,
): boolean {
  const gpu = ensure();
  if (!gpu) return false;
  const { gl, canvas } = gpu;
  const dpr = Math.max(1, ctx.getTransform().a || (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1);
  const pixels = maxResolution
    ? Math.max(256, Math.min(4096, Math.round(maxResolution)))
    : Math.max(256, Math.min(8192, Math.round(Math.max(fieldW, fieldH) * dpr * 2)));
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  const count = trailSize * trailSize;
  if (gpu.pixels.length !== count) gpu.pixels = new Float32Array(count);
  const inv = 1 / Math.max(peak, 0.0001);
  for (let i = 0; i < count; i += 1) gpu.pixels[i] = Math.pow(Math.max(0, trails[i] * inv), 0.82);

  gl.viewport(0, 0, pixels, pixels);
  gl.useProgram(gpu.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gpu.buffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, trailSize, trailSize, 0, gl.RED, gl.FLOAT, new Float32Array(gpu.pixels));
  gl.uniform1i(gl.getUniformLocation(gpu.program, "uField"), 0);
  gl.uniform1f(gpu.uTexels, trailSize);
  if (gpu.uCutoff) gl.uniform1f(gpu.uCutoff, cutoff);
  gl.uniform1f(gpu.uHairThin, hairThin ? 1 : 0);
  gl.uniform1f(gpu.uInk, inkGain);
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
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const bytes = pixels * pixels * 4;
  if (gpu.read.length !== bytes) gpu.read = new Uint8Array(bytes);
  gl.readPixels(0, 0, pixels, pixels, gl.RGBA, gl.UNSIGNED_BYTE, gpu.read);
  const flipped = new Uint8ClampedArray(bytes);
  const row = pixels * 4;
  for (let y = 0; y < pixels; y += 1) {
    flipped.set(gpu.read.subarray((pixels - 1 - y) * row, (pixels - y) * row), y * row);
  }
  const scratch = document.createElement("canvas");
  scratch.width = pixels;
  scratch.height = pixels;
  const scratchCtx = scratch.getContext("2d", { alpha: false });
  if (!scratchCtx) return false;
  scratchCtx.putImageData(new ImageData(flipped, pixels, pixels), 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(scratch, 0, 0, fieldW, fieldH);
  ctx.restore();
  return true;
}
