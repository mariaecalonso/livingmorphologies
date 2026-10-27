import type { IsoMesh } from "./isomesh";
import { moduleViewFit, surfaceFrame, uniformModuleZoom } from "../skill3/view-project";

const VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform float uYaw;
uniform float uPitch;
uniform float uSpin;
uniform float uAspect;
uniform float uFit;
uniform float uOrtho;
uniform vec3 uCenter;
uniform vec2 uPan;
out vec3 vNormal;
out float vDepth;
void main() {
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  float cs = cos(uSpin);
  float ss = sin(uSpin);
  vec3 p = aPos - uCenter;
  p = vec3(p.x * cs + p.z * ss, p.y, -p.x * ss + p.z * cs);
  vec3 n = aNormal;
  n = vec3(n.x * cs + n.z * ss, n.y, -n.x * ss + n.z * cs);
  float x1 = p.x * cy + p.z * sy;
  float z1 = -p.x * sy + p.z * cy;
  float y2 = p.y * cp - z1 * sp;
  float z2 = p.y * sp + z1 * cp;
  float nx1 = n.x * cy + n.z * sy;
  float nz1 = -n.x * sy + n.z * cy;
  float ny2 = n.y * cp - nz1 * sp;
  float nz2 = n.y * sp + nz1 * cp;
  vNormal = vec3(nx1, ny2, nz2);
  if (uOrtho > 0.5) {
    vDepth = 4.2 + z2 * 0.02;
    gl_Position = vec4((x1 + uPan.x) * uFit / uAspect, (y2 + uPan.y) * uFit, z2 * 0.0125, 1.0);
  } else {
    vec3 view = vec3(x1 * uFit, y2 * uFit * uAspect, -z2 * uFit - 3.4);
    vDepth = -view.z;
    float near = 0.35;
    float far = 14.0;
    float f = 1.55;
    gl_Position = vec4(
      view.x * f,
      view.y * f,
      (view.z * (far + near) + 2.0 * far * near) / (near - far),
      -view.z
    );
  }
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vDepth;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oDepth;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  if (dot(n, viewDir) < 0.0) n = -n;
  vec3 key = normalize(vec3(0.42, 0.78, 0.55));
  vec3 fill = normalize(vec3(-0.6, 0.15, 0.35));
  float lambert = clamp(dot(n, key), 0.0, 1.0);
  float bounce = clamp(dot(n, fill), 0.0, 1.0) * 0.28;
  float cavity = pow(1.0 - abs(dot(n, viewDir)), 1.6);
  vec3 deep = vec3(0.16, 0.22, 0.03);
  vec3 hot = vec3(0.98, 0.92, 0.16);
  vec3 col = mix(deep, hot, lambert * 0.82 + bounce);
  col = mix(col, vec3(0.05, 0.07, 0.01), cavity * 0.35);
  float fog = smoothstep(3.0, 8.5, vDepth);
  col = mix(col, vec3(0.0), fog * 0.45);
  oColor = vec4(col, 1.0);
  oDepth = vec4(vDepth, 0.0, 0.0, 1.0);
}`;

const AO_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const AO_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 oColor;

void main() {
  vec3 col = texture(uColor, vUv).rgb;
  float z = texture(uDepth, vUv).r;
  if (z <= 0.001) {
    oColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float ao = 0.0;
  float radius = 14.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 2.399963;
    float r = radius * (0.25 + 0.75 * float(i) / 15.0);
    vec2 off = vec2(cos(a), sin(a)) * r * uTexel;
    float sz = texture(uDepth, vUv + off).r;
    float diff = z - sz;
    ao += step(0.012, diff) * smoothstep(0.55, 0.03, diff);
  }
  ao = clamp(1.0 - ao / 9.0, 0.22, 1.0);
  oColor = vec4(col * ao, 1.0);
}`;

/** Skill 3 Isomesh. Lighting only; the mesh buffers are unchanged. */
const SHELL_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vDepth;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oDepth;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  if (dot(n, viewDir) < 0.0) n = -n;
  vec3 key = normalize(vec3(0.32, 0.74, 0.46));
  vec3 fill = normalize(vec3(-0.62, 0.08, 0.42));
  float wrap = clamp((dot(n, key) + 0.62) / 1.62, 0.0, 1.0);
  float bounce = clamp(dot(n, fill), 0.0, 1.0);
  float facing = abs(dot(n, viewDir));
  vec3 halfDir = normalize(key + viewDir);
  float spec = pow(clamp(dot(n, halfDir), 0.0, 1.0), 56.0);
  float rim = pow(1.0 - facing, 2.8);
  vec3 shadow = vec3(0.27, 0.24, 0.21);
  vec3 body = vec3(0.74, 0.68, 0.62);
  vec3 bronze = vec3(0.66, 0.52, 0.42);
  vec3 col = mix(shadow, body, wrap);
  col += bronze * bounce * 0.14;
  col += vec3(0.86, 0.80, 0.72) * spec * 0.07;
  col += vec3(0.80, 0.74, 0.66) * rim * 0.20;
  float fog = smoothstep(4.4, 11.0, vDepth);
  col = mix(col, vec3(0.0), fog * 0.12);
  oColor = vec4(col * 0.78, 1.0);
  oDepth = vec4(vDepth, 0.0, 0.0, 1.0);
}`;

const SHELL_AO_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 oColor;

void main() {
  vec3 col = texture(uColor, vUv).rgb;
  float z = texture(uDepth, vUv).r;
  if (z <= 0.001) {
    oColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float edge = 0.0;
  vec2 stepUv = uTexel * 1.5;
  float z1 = texture(uDepth, vUv + vec2(stepUv.x, 0.0)).r;
  float z2 = texture(uDepth, vUv - vec2(stepUv.x, 0.0)).r;
  float z3 = texture(uDepth, vUv + vec2(0.0, stepUv.y)).r;
  float z4 = texture(uDepth, vUv - vec2(0.0, stepUv.y)).r;
  edge += step(0.001, z1) * smoothstep(0.015, 0.09, abs(z - z1));
  edge += step(0.001, z2) * smoothstep(0.015, 0.09, abs(z - z2));
  edge += step(0.001, z3) * smoothstep(0.015, 0.09, abs(z - z3));
  edge += step(0.001, z4) * smoothstep(0.015, 0.09, abs(z - z4));
  edge = clamp(edge / 3.0, 0.0, 1.0);
  col = mix(col, vec3(0.84, 0.78, 0.70), edge * 0.28);
  oColor = vec4(col, 1.0);
}`;

const FLOAT_AO_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 oColor;

void main() {
  float z = texture(uDepth, vUv).r;
  if (z <= 0.001) {
    oColor = vec4(0.0);
    return;
  }
  vec3 col = texture(uColor, vUv).rgb;
  oColor = vec4(col, 1.0);
}`;

/** Same clay body as the Skill 3 catalogue field. Lighting only. */
const CLAY_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vDepth;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oDepth;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  if (dot(n, viewDir) < 0.0) n = -n;
  vec3 key = normalize(vec3(0.32, 0.86, 0.4));
  vec3 fill = normalize(vec3(-0.62, 0.12, 0.28));
  float wrap = clamp((dot(n, key) + 0.62) / 1.62, 0.0, 1.0);
  float bounce = clamp(dot(n, fill), 0.0, 1.0);
  vec3 shadow = vec3(0.58, 0.58, 0.56);
  vec3 body = vec3(0.97, 0.97, 0.96);
  vec3 tone = mix(shadow, body, wrap);
  tone += vec3(0.98, 0.98, 0.97) * bounce * 0.08;
  oColor = vec4(tone, 1.0);
  oDepth = vec4(vDepth, 0.0, 0.0, 1.0);
}`;

/** Tint for faces that differ from the comparison mesh. Copper unless a tint is set. */
const ACCENT_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vDepth;
uniform vec3 uTint;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oDepth;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  if (dot(n, viewDir) < 0.0) n = -n;
  vec3 key = normalize(vec3(0.32, 0.86, 0.4));
  float wrap = clamp((dot(n, key) + 0.62) / 1.62, 0.0, 1.0);
  vec3 clay = mix(vec3(0.58, 0.58, 0.56), vec3(0.97, 0.97, 0.96), wrap);
  oColor = vec4(mix(clay, uTint, 0.72), 1.0);
  oDepth = vec4(vDepth, 0.0, 0.0, 1.0);
}`;

export type IsoMeshStyle = "field" | "shell" | "clay";

const DRAW_MESH_GEN = 6;

type MeshGl = {
  gl: WebGL2RenderingContext;
  gen: number;
  program: WebGLProgram;
  aoProgram: WebGLProgram;
  shellProgram: WebGLProgram;
  clayProgram: WebGLProgram;
  shellAoProgram: WebGLProgram;
  floatAoProgram: WebGLProgram;
  accentProgram?: WebGLProgram | null;
  accentGen?: number;
  position: WebGLBuffer;
  normal: WebGLBuffer;
  index: WebGLBuffer;
  quad: WebGLBuffer;
  fbo: WebGLFramebuffer;
  colorTex: WebGLTexture;
  depthTex: WebGLTexture;
  linearTex: WebGLTexture;
  uYaw: WebGLUniformLocation;
  uPitch: WebGLUniformLocation;
  uAspect: WebGLUniformLocation;
  uFit: WebGLUniformLocation;
  uTexel: WebGLUniformLocation;
  width: number;
  height: number;
};

const cache = new WeakMap<HTMLCanvasElement, MeshGl>();

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

function program(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string) {
  const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;
  const shader = gl.createProgram();
  if (!shader) return null;
  gl.attachShader(shader, vert);
  gl.attachShader(shader, frag);
  gl.linkProgram(shader);
  if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) {
    console.warn(gl.getProgramInfoLog(shader));
    return null;
  }
  return shader;
}

function tex(gl: WebGL2RenderingContext, internal: number, format: number, type: number, w: number, h: number) {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  return texture;
}

function resizeTargets(gpu: MeshGl, width: number, height: number) {
  if (gpu.width === width && gpu.height === height) return;
  const { gl } = gpu;
  gl.bindTexture(gl.TEXTURE_2D, gpu.colorTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, gpu.linearTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, gpu.depthTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gpu.width = width;
  gpu.height = height;
}

function setup(canvas: HTMLCanvasElement): MeshGl | null {
  const existing = cache.get(canvas);
  if (existing && existing.gen === DRAW_MESH_GEN && !existing.gl.isContextLost()) return existing;
  const float = canvas.dataset.present === "float";
  const gl = existing?.gl ?? canvas.getContext("webgl2", float
    ? { antialias: true, alpha: true, premultipliedAlpha: false, depth: true, preserveDrawingBuffer: true }
    : { antialias: false, alpha: false, depth: true });
  if (!gl) return null;
  gl.getExtension("EXT_color_buffer_float");
  const meshProgram = program(gl, VERT, FRAG);
  const aoProgram = program(gl, AO_VERT, AO_FRAG);
  const shellProgram = program(gl, VERT, SHELL_FRAG);
  const clayProgram = program(gl, VERT, CLAY_FRAG);
  const shellAoProgram = program(gl, AO_VERT, SHELL_AO_FRAG);
  const floatAoProgram = program(gl, AO_VERT, FLOAT_AO_FRAG);
  if (!meshProgram || !aoProgram || !shellProgram || !clayProgram || !shellAoProgram || !floatAoProgram) return null;
  const position = gl.createBuffer();
  const normal = gl.createBuffer();
  const index = gl.createBuffer();
  const quad = gl.createBuffer();
  const fbo = gl.createFramebuffer();
  const colorTex = tex(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 4, 4);
  const linearTex = tex(gl, gl.R32F, gl.RED, gl.FLOAT, 4, 4);
  const depthTex = tex(gl, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, 4, 4);
  const uYaw = gl.getUniformLocation(meshProgram, "uYaw");
  const uPitch = gl.getUniformLocation(meshProgram, "uPitch");
  const uAspect = gl.getUniformLocation(meshProgram, "uAspect");
  const uFit = gl.getUniformLocation(meshProgram, "uFit");
  const uTexel = gl.getUniformLocation(aoProgram, "uTexel");
  if (!position || !normal || !index || !quad || !fbo || !colorTex || !linearTex || !depthTex) return null;
  if (!uYaw || !uPitch || !uAspect || !uFit || !uTexel) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, linearTex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const state: MeshGl = {
    gl,
    gen: DRAW_MESH_GEN,
    program: meshProgram,
    aoProgram,
    shellProgram,
    clayProgram,
    shellAoProgram,
    floatAoProgram,
    position,
    normal,
    index,
    quad,
    fbo,
    colorTex,
    depthTex,
    linearTex,
    uYaw,
    uPitch,
    uAspect,
    uFit,
    uTexel,
    width: 0,
    height: 0,
  };
  cache.set(canvas, state);
  return state;
}

export function drawIsoMesh(
  canvas: HTMLCanvasElement,
  mesh: IsoMesh | null,
  yaw: number,
  pitch: number,
  column: number,
  style: IsoMeshStyle = "field",
  options?: { transparent?: boolean; uniform?: boolean; fit?: "module" | "bounds"; spin?: number; margin?: number; zoom?: number; pan?: [number, number]; accent?: IsoMesh | null; accentTint?: [number, number, number] },
) {
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
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const gpu = setup(canvas);
  if (!gpu) return;
  const { gl } = gpu;
  resizeTargets(gpu, pixelsW, pixelsH);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gpu.fbo);
  gl.viewport(0, 0, pixelsW, pixelsH);
  const clay = style === "clay";
  const clear = clay || options?.transparent === true;
  gl.clearColor(0, 0, 0, clear ? 0 : 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.disable(gl.CULL_FACE);
  const meshProgram = clay ? gpu.clayProgram : style === "shell" ? gpu.shellProgram : gpu.program;
  const compositeProgram = clear
    ? gpu.floatAoProgram
    : style === "shell" ? gpu.shellAoProgram : gpu.aoProgram;
  if (mesh && mesh.triangles > 0) {
    gl.useProgram(meshProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.position);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.normal);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);
    gl.uniform1f(gl.getUniformLocation(meshProgram, "uYaw"), yaw);
    gl.uniform1f(gl.getUniformLocation(meshProgram, "uSpin"), options?.spin ?? 0);
    gl.uniform1f(gl.getUniformLocation(meshProgram, "uPitch"), pitch);
    const aspect = width / Math.max(1, height);
    const framed = options?.fit === "bounds" ? surfaceFrame(mesh.positions, yaw, pitch, aspect, options.margin) : null;
    const uniform = options?.uniform === true || framed != null;
    const fit = (framed ? framed.fit : uniform ? uniformModuleZoom(pitch, aspect) : moduleViewFit(column, aspect)) * (options?.zoom ?? 1);
    const center = framed?.center ?? [0, 0, 0];
    const pan = options?.pan ?? framed?.pan ?? [0, 0];
    gl.uniform1f(gl.getUniformLocation(meshProgram, "uAspect"), aspect);
    gl.uniform1f(gl.getUniformLocation(meshProgram, "uFit"), fit);
    gl.uniform3f(gl.getUniformLocation(meshProgram, "uCenter"), center[0], center[1], center[2]);
    gl.uniform2f(gl.getUniformLocation(meshProgram, "uPan"), pan[0], pan[1]);
    gl.uniform1f(gl.getUniformLocation(meshProgram, "uOrtho"), uniform ? 1 : 0);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
    const accentMesh = options?.accent;
    if (accentMesh && accentMesh.triangles > 0) {
      if (gpu.accentGen !== 2) {
        gpu.accentProgram = program(gl, VERT, ACCENT_FRAG);
        gpu.accentGen = 2;
      }
      const accentProgram = gpu.accentProgram;
      if (accentProgram) {
        gl.useProgram(accentProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, gpu.position);
        gl.bufferData(gl.ARRAY_BUFFER, accentMesh.positions, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, gpu.normal);
        gl.bufferData(gl.ARRAY_BUFFER, accentMesh.normals, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.index);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, accentMesh.indices, gl.DYNAMIC_DRAW);
        gl.uniform1f(gl.getUniformLocation(accentProgram, "uYaw"), yaw);
        gl.uniform1f(gl.getUniformLocation(accentProgram, "uSpin"), options?.spin ?? 0);
        gl.uniform1f(gl.getUniformLocation(accentProgram, "uPitch"), pitch);
        gl.uniform1f(gl.getUniformLocation(accentProgram, "uAspect"), aspect);
        gl.uniform1f(gl.getUniformLocation(accentProgram, "uFit"), fit);
        gl.uniform3f(gl.getUniformLocation(accentProgram, "uCenter"), center[0], center[1], center[2]);
        gl.uniform2f(gl.getUniformLocation(accentProgram, "uPan"), pan[0], pan[1]);
        gl.uniform1f(gl.getUniformLocation(accentProgram, "uOrtho"), uniform ? 1 : 0);
        const tint = options?.accentTint ?? [0.78, 0.49, 0.37];
        gl.uniform3f(gl.getUniformLocation(accentProgram, "uTint"), tint[0], tint[1], tint[2]);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-1, -1);
        gl.drawElements(gl.TRIANGLES, accentMesh.indices.length, gl.UNSIGNED_INT, 0);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (clear) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(compositeProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, gpu.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gpu.colorTex);
  gl.uniform1i(gl.getUniformLocation(compositeProgram, "uColor"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, gpu.linearTex);
  gl.uniform1i(gl.getUniformLocation(compositeProgram, "uDepth"), 1);
  gl.uniform2f(gl.getUniformLocation(compositeProgram, "uTexel"), 1 / pixelsW, 1 / pixelsH);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
