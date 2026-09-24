/**
 * One shared WebGL2 quad. The trail grid is a float texture; a fragment
 * shader keeps vein edges about one pixel wide and grades them yellow-green
 * on black, closer to a photographed Physarum network.
 */

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
in vec2 vUv;
out vec4 oColor;

float tap(vec2 st) {
  return texture(uField, st).r;
}

float curve(float a, float b, float c, float d, float t) {
  return b + 0.5 * t * (c - a + t * (2.0 * a - 5.0 * b + 4.0 * c - d + t * (3.0 * (b - c) + d - a)));
}

float fieldAt(vec2 uv) {
  vec2 p = clamp(uv, 0.0, 1.0) * uTexels - 0.5;
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 d = vec2(1.0) / uTexels;
  float rows[4];
  for (int y = -1; y <= 2; y++) {
    float cols[4];
    for (int x = -1; x <= 2; x++) {
      cols[x + 1] = tap((i + vec2(float(x), float(y)) + 0.5) * d);
    }
    rows[y + 1] = curve(cols[0], cols[1], cols[2], cols[3], f.x);
  }
  return max(0.0, curve(rows[0], rows[1], rows[2], rows[3], f.y));
}

void main() {
  float n = fieldAt(vUv);
  vec2 e = vec2(1.6 / uTexels);
  float blur = (
    fieldAt(vUv + vec2(e.x, 0.0)) +
    fieldAt(vUv - vec2(e.x, 0.0)) +
    fieldAt(vUv + vec2(0.0, e.y)) +
    fieldAt(vUv - vec2(0.0, e.y)) +
    fieldAt(vUv + e) +
    fieldAt(vUv - e) +
    fieldAt(vUv + vec2(e.x, -e.y)) +
    fieldAt(vUv + vec2(-e.x, e.y))
  ) * 0.125;
  float ridge = max(0.0, n - blur);
  float w = max(fwidth(ridge) * 1.25, 0.0015);
  float vein = smoothstep(0.018, 0.018 + w, ridge) * smoothstep(uCutoff * 0.35, uCutoff * 0.35 + w, n);
  float core = smoothstep(0.7, 0.88, n);
  float mask = clamp(max(vein, core), 0.0, 1.0);

  vec3 filament = vec3(0.62, 0.86, 0.1);
  vec3 lace = vec3(0.86, 0.95, 0.18);
  vec3 trunk = vec3(0.98, 0.88, 0.08);
  vec3 mass = vec3(1.0, 0.78, 0.05);
  float tone = clamp(ridge * 6.0 + n * 0.35, 0.0, 1.0);
  vec3 col = mix(filament, lace, smoothstep(0.15, 0.45, tone));
  col = mix(col, trunk, smoothstep(0.4, 0.7, n));
  col = mix(col, mass, core);
  float pore = smoothstep(0.9, 0.62, n) * smoothstep(0.25, 0.55, blur);
  col = mix(col, vec3(0.42, 0.14, 0.03), pore * core);

  oColor = vec4(col * mask, mask);
}`;

type GlState = {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  buffer: WebGLBuffer;
  uTexels: WebGLUniformLocation;
  uCutoff: WebGLUniformLocation;
  pixels: Float32Array;
};

let state: GlState | null = null;
let failed = false;

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

function createState(): GlState | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
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
  if (!buffer || !texture || !uTexels || !uCutoff) return null;
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
    pixels: new Float32Array(0),
  };
}

function ensure(): GlState | null {
  if (failed) return null;
  if (state && !state.gl.isContextLost()) return state;
  state = createState();
  if (!state) failed = true;
  return state;
}

/** Draws the trail field into `ctx` at the field square. Returns false if WebGL2 is unavailable. */
export function drawSlimeFieldGl(
  ctx: CanvasRenderingContext2D,
  trails: ArrayLike<number>,
  trailSize: number,
  peak: number,
  fieldH: number,
  cutoff: number,
): boolean {
  const gpu = ensure();
  if (!gpu) return false;
  const { gl, canvas } = gpu;
  const dpr = ctx.getTransform().a || 1;
  const pixels = Math.max(64, Math.min(2048, Math.round(fieldH * dpr)));
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  const count = trailSize * trailSize;
  if (gpu.pixels.length !== count) gpu.pixels = new Float32Array(count);
  const inv = 1 / Math.max(peak, 0.0001);
  for (let i = 0; i < count; i += 1) gpu.pixels[i] = Math.sqrt(Math.max(0, trails[i] * inv));

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
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, fieldH, fieldH);
  ctx.restore();
  return true;
}
