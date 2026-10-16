import type { IsoMesh } from "../scan/isomesh";
import { groundPlaneY, type Vec3 } from "./contract";
import { IDENTITY_BASIS, type Mat3 } from "./tile-basis";

export type PlacedMesh = {
  id: string;
  mesh: IsoMesh;
  translate: Vec3;
  selected: boolean;
  spin?: number;
  mirror?: 0 | 1 | 2 | 3;
  /** Full local-to-world rotation. Applied before the optional yaw and mirror. */
  basis?: Mat3;
  kind?: 0 | 1;
  color?: [number, number, number];
  /** Development overlap debug. Production meshes leave this unset and stay opaque. */
  opacity?: number;
  /** Aggregation-canvas hybrid only. Teal at one end, orange at the other. */
  palette?: boolean;
};

const VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform float uYaw;
uniform float uPitch;
uniform float uAspect;
uniform float uFit;
uniform float uDistance;
uniform vec3 uTranslate;
uniform vec3 uCenter;
uniform mat3 uBasis;
uniform float uSpin;
uniform float uMirror;
uniform vec3 uRampOrigin;
uniform vec3 uRampDir;
out vec3 vNormal;
out float vDepth;
out float vRamp;
void main() {
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  vec3 spun = uBasis * aPos;
  if (uMirror > 0.5 && uMirror < 1.5) spun.x = -spun.x;
  if (uMirror > 1.5 && uMirror < 2.5) spun.y = -spun.y;
  if (uMirror > 2.5) spun.z = -spun.z;
  float cs = cos(uSpin);
  float sn = sin(uSpin);
  float rx = spun.x * cs + spun.z * sn;
  float rz = -spun.x * sn + spun.z * cs;
  vec3 p = vec3(rx, spun.y, rz) + uTranslate - uCenter;
  float x1 = p.x * cy + p.z * sy;
  float z1 = -p.x * sy + p.z * cy;
  float y2 = p.y * cp - z1 * sp;
  float z2 = p.y * sp + z1 * cp;
  vec3 n = uBasis * aNormal;
  if (uMirror > 0.5 && uMirror < 1.5) n.x = -n.x;
  if (uMirror > 1.5 && uMirror < 2.5) n.y = -n.y;
  if (uMirror > 2.5) n.z = -n.z;
  float nrx = n.x * cs + n.z * sn;
  float nrz = -n.x * sn + n.z * cs;
  n = vec3(nrx, n.y, nrz);
  vec3 placed = vec3(rx, spun.y, rz) + uTranslate;
  vRamp = dot(placed - uRampOrigin, uRampDir);
  float nx1 = n.x * cy + n.z * sy;
  float nz1 = -n.x * sy + n.z * cy;
  float ny2 = n.y * cp - nz1 * sp;
  float nz2 = n.y * sp + nz1 * cp;
  vNormal = vec3(nx1, ny2, nz2);
  vec3 view = vec3(x1 * uFit, y2 * uFit * uAspect, -z2 * uFit - uDistance);
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
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vDepth;
in float vRamp;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uPalette;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oDepth;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  if (dot(n, viewDir) < 0.0) n = -n;
  vec3 key = normalize(vec3(0.35, 0.82, 0.45));
  vec3 fill = normalize(vec3(-0.55, 0.2, 0.4));
  float lambert = clamp(dot(n, key), 0.0, 1.0);
  float bounce = clamp(dot(n, fill), 0.0, 1.0);
  float shade = 0.9 + lambert * 0.08 + bounce * 0.02;
  vec3 green = vec3(0.058824, 0.450980, 0.466667);
  vec3 orange = vec3(0.780392, 0.494118, 0.372549);
  vec3 tint = mix(green, orange, clamp(vRamp, 0.0, 1.0));
  vec3 col = uPalette > 0.5 ? tint : uColor * shade;
  oColor = vec4(col, uAlpha);
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
  ao = clamp(1.0 - ao / 28.0, 0.92, 1.0);
  oColor = vec4(col * ao, 1.0);
}`;

const SHADER_VERSION = 4;

type Gpu = {
  gl: WebGL2RenderingContext;
  shaderVersion: number;
  program: WebGLProgram;
  aoProgram: WebGLProgram;
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
  uDistance: WebGLUniformLocation;
  uTranslate: WebGLUniformLocation;
  uCenter: WebGLUniformLocation;
  uBasis: WebGLUniformLocation;
  uSpin: WebGLUniformLocation;
  uMirror: WebGLUniformLocation;
  uColor: WebGLUniformLocation;
  uAlpha: WebGLUniformLocation;
  uPalette: WebGLUniformLocation;
  uRampOrigin: WebGLUniformLocation;
  uRampDir: WebGLUniformLocation;
  uTexel: WebGLUniformLocation;
  width: number;
  height: number;
};

const cache = new WeakMap<HTMLCanvasElement, Gpu>();

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

function link(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string) {
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

function tex(gl: WebGL2RenderingContext, internal: number, format: number, type: number) {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, type, null);
  return texture;
}

function setup(canvas: HTMLCanvasElement): Gpu | null {
  const existing = cache.get(canvas);
  if (existing && existing.shaderVersion === SHADER_VERSION && !existing.gl.isContextLost()) return existing;
  const gl = existing && !existing.gl.isContextLost()
    ? existing.gl
    : canvas.getContext("webgl2", { antialias: false, alpha: false, depth: true });
  if (!gl) return null;
  gl.getExtension("EXT_color_buffer_float");
  const meshProgram = link(gl, VERT, FRAG);
  const aoProgram = link(gl, AO_VERT, AO_FRAG);
  if (!meshProgram || !aoProgram) return null;
  const position = gl.createBuffer();
  const normal = gl.createBuffer();
  const index = gl.createBuffer();
  const quad = gl.createBuffer();
  const fbo = gl.createFramebuffer();
  const colorTex = tex(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  const linearTex = tex(gl, gl.R32F, gl.RED, gl.FLOAT);
  const depthTex = tex(gl, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
  const uYaw = gl.getUniformLocation(meshProgram, "uYaw");
  const uPitch = gl.getUniformLocation(meshProgram, "uPitch");
  const uAspect = gl.getUniformLocation(meshProgram, "uAspect");
  const uFit = gl.getUniformLocation(meshProgram, "uFit");
  const uDistance = gl.getUniformLocation(meshProgram, "uDistance");
  const uTranslate = gl.getUniformLocation(meshProgram, "uTranslate");
  const uCenter = gl.getUniformLocation(meshProgram, "uCenter");
  const uBasis = gl.getUniformLocation(meshProgram, "uBasis");
  const uSpin = gl.getUniformLocation(meshProgram, "uSpin");
  const uMirror = gl.getUniformLocation(meshProgram, "uMirror");
  const uColor = gl.getUniformLocation(meshProgram, "uColor");
  const uAlpha = gl.getUniformLocation(meshProgram, "uAlpha");
  const uPalette = gl.getUniformLocation(meshProgram, "uPalette");
  const uRampOrigin = gl.getUniformLocation(meshProgram, "uRampOrigin");
  const uRampDir = gl.getUniformLocation(meshProgram, "uRampDir");
  const uTexel = gl.getUniformLocation(aoProgram, "uTexel");
  if (!position || !normal || !index || !quad || !fbo || !colorTex || !linearTex || !depthTex) return null;
  if (!uYaw || !uPitch || !uAspect || !uFit || !uDistance || !uTranslate || !uCenter || !uBasis || !uSpin || !uMirror || !uColor || !uAlpha || !uPalette || !uRampOrigin || !uRampDir || !uTexel) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, linearTex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const gpu: Gpu = {
    gl,
    shaderVersion: SHADER_VERSION,
    program: meshProgram,
    aoProgram,
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
    uDistance,
    uTranslate,
    uCenter,
    uBasis,
    uSpin,
    uMirror,
    uColor,
    uAlpha,
    uPalette,
    uRampOrigin,
    uRampDir,
    uTexel,
    width: 0,
    height: 0,
  };
  cache.set(canvas, gpu);
  return gpu;
}

function resize(gpu: Gpu, width: number, height: number) {
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

/** Camera pull-back used by the placed-mesh view. Previews stay at this distance. */
export const CANVAS_EYE = 3.4;
export const CANVAS_EYE_MIN = 2.05;
export const CANVAS_EYE_MAX = 8.4;

const GRID_CELL = 0.25;
const GRID_COLOR: [number, number, number] = [0.3, 0.3, 0.28];
const AXIS_COLOR: [number, number, number] = [0.46, 0.45, 0.42];

export function placementFit(span: number, aspect: number) {
  return Math.min(1.05, 1.35 / Math.max(1, span * 0.42 * Math.max(1, aspect * 0.35)));
}

/** Fit one preview mesh inside the frame. The scene fit used by the aggregation canvas is unchanged. */
function containedFit(instances: readonly PlacedMesh[], aspect: number) {
  let radius = 0;
  for (const instance of instances) {
    const positions = instance.mesh.positions;
    for (let index = 0; index < positions.length; index += 3) {
      const extent = Math.hypot(positions[index], positions[index + 1], positions[index + 2]);
      if (extent > radius) radius = extent;
    }
  }
  if (radius < 1e-4) radius = 0.5;
  const focal = 1.55;
  const depth = 3.4;
  const limit = 0.82;
  const fitX = (limit * depth) / (radius * (focal + limit));
  return Math.min(fitX, fitX / Math.max(0.2, aspect));
}

export function placementCenter(instances: readonly PlacedMesh[]): Vec3 {
  if (!instances.length) return { x: 0, y: 0, z: 0 };
  const sum = instances.reduce(
    (acc, item) => ({
      x: acc.x + item.translate.x,
      y: acc.y + item.translate.y,
      z: acc.z + item.translate.z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  return { x: sum.x / instances.length, y: sum.y / instances.length, z: sum.z / instances.length };
}

/** Screen position of an instance origin, in canvas pixels. Matches the placed-mesh shader. */
export function projectPlacement(
  point: Vec3,
  center: Vec3,
  yaw: number,
  pitch: number,
  fit: number,
  width: number,
  height: number,
  eye = CANVAS_EYE,
) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const p = { x: point.x - center.x, y: point.y - center.y, z: point.z - center.z };
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const y2 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  const aspect = width / Math.max(1, height);
  const viewZ = -z2 * fit - eye;
  const f = 1.55;
  const clipX = x1 * fit * f;
  const clipY = y2 * fit * aspect * f;
  const clipW = -viewZ;
  return {
    x: (clipX / clipW * 0.5 + 0.5) * width,
    y: (-clipY / clipW * 0.5 + 0.5) * height,
  };
}

function meshRamp(mesh: IsoMesh, translate: Vec3) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  const span = Math.max(spanX, spanY, spanZ, 1e-6);
  return {
    origin: { x: minX + translate.x, y: minY + translate.y, z: minZ + translate.z },
    dir: {
      x: spanX >= spanY && spanX >= spanZ ? 1 / span : 0,
      y: spanY > spanX && spanY >= spanZ ? 1 / span : 0,
      z: spanZ > spanX && spanZ > spanY ? 1 / span : 0,
    },
  };
}

export function drawPlacedMeshes(
  canvas: HTMLCanvasElement,
  instances: readonly PlacedMesh[],
  yaw: number,
  pitch: number,
  span: number,
  contain = false,
  eye = CANVAS_EYE,
  ground = false,
  fitScale = 1,
) {
  const parent = canvas.parentElement;
  if (!parent) return null;
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
  if (!gpu) return null;
  const { gl } = gpu;
  resize(gpu, pixelsW, pixelsH);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gpu.fbo);
  gl.viewport(0, 0, pixelsW, pixelsH);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.disable(gl.CULL_FACE);
  const aspect = width / Math.max(1, height);
  const fit = (contain ? containedFit(instances, aspect) : placementFit(span, aspect)) * fitScale;
  const center = placementCenter(instances);
  gl.useProgram(gpu.program);
  gl.uniform1f(gpu.uYaw, yaw);
  gl.uniform1f(gpu.uPitch, pitch);
  gl.uniform1f(gpu.uAspect, aspect);
  gl.uniform1f(gpu.uFit, fit);
  gl.uniform1f(gpu.uDistance, eye);
  gl.uniform3f(gpu.uCenter, center.x, center.y, center.z);
  const drawInstance = (instance: PlacedMesh) => {
    if (instance.mesh.triangles < 1) return;
    const opacity = instance.opacity ?? 1;
    if (opacity < 1) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    } else {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
    gl.uniform1f(gpu.uAlpha, opacity);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.position);
    gl.bufferData(gl.ARRAY_BUFFER, instance.mesh.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.normal);
    gl.bufferData(gl.ARRAY_BUFFER, instance.mesh.normals, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, instance.mesh.indices, gl.DYNAMIC_DRAW);
    gl.uniform3f(gpu.uTranslate, instance.translate.x, instance.translate.y, instance.translate.z);
    gl.uniformMatrix3fv(gpu.uBasis, false, new Float32Array(instance.basis ?? IDENTITY_BASIS));
    gl.uniform1f(gpu.uSpin, instance.spin ?? 0);
    gl.uniform1f(gpu.uMirror, instance.mirror ?? 0);
    const color = instance.color ?? [1.0, 1.0, 1.0];
    gl.uniform3f(gpu.uColor, color[0], color[1], color[2]);
    gl.uniform1f(gpu.uPalette, instance.palette ? 1 : 0);
    const ramp = instance.palette ? meshRamp(instance.mesh, instance.translate) : null;
    gl.uniform3f(gpu.uRampOrigin, ramp?.origin.x ?? 0, ramp?.origin.y ?? 0, ramp?.origin.z ?? 0);
    gl.uniform3f(gpu.uRampDir, ramp?.dir.x ?? 0, ramp?.dir.y ?? 0, ramp?.dir.z ?? 0);
    const count = instance.mesh.indices.length;
    if (!instance.palette) {
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
      return;
    }
    gl.enable(gl.DEPTH_TEST);
    gl.colorMask(false, false, false, false);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
    gl.colorMask(true, true, true, true);
    gl.depthFunc(gl.EQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
    gl.depthFunc(gl.LEQUAL);
  };
  for (const instance of instances) {
    if ((instance.opacity ?? 1) >= 1) drawInstance(instance);
  }
  for (const instance of instances) {
    if ((instance.opacity ?? 1) < 1 && instance.palette) drawInstance(instance);
  }
  gl.disable(gl.DEPTH_TEST);
  for (const instance of instances) {
    if ((instance.opacity ?? 1) < 1 && !instance.palette) drawInstance(instance);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  if (ground) drawGroundGrid(gpu, instances);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(gpu.aoProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, gpu.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gpu.colorTex);
  gl.uniform1i(gl.getUniformLocation(gpu.aoProgram, "uColor"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, gpu.linearTex);
  gl.uniform1i(gl.getUniformLocation(gpu.aoProgram, "uDepth"), 1);
  gl.uniform2f(gpu.uTexel, 1 / pixelsW, 1 / pixelsH);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return { fit, center, width, height };
}

/** Display-only XZ lines on the registration ground. Not a placed instance, so it cannot be picked. */
function drawGroundGrid(gpu: Gpu, instances: readonly PlacedMesh[]) {
  const bodies = instances.filter((instance) => !instance.id.startsWith("guide:"));
  if (!bodies.length) return;
  const half = 0.5;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const instance of bodies) {
    minX = Math.min(minX, instance.translate.x - half);
    maxX = Math.max(maxX, instance.translate.x + half);
    minZ = Math.min(minZ, instance.translate.z - half);
    maxZ = Math.max(maxZ, instance.translate.z + half);
  }
  const pad = GRID_CELL * 4;
  minX = Math.floor((minX - pad) / GRID_CELL) * GRID_CELL;
  maxX = Math.ceil((maxX + pad) / GRID_CELL) * GRID_CELL;
  minZ = Math.floor((minZ - pad) / GRID_CELL) * GRID_CELL;
  maxZ = Math.ceil((maxZ + pad) / GRID_CELL) * GRID_CELL;
  const y = groundPlaneY();
  const grid: number[] = [];
  const axis: number[] = [];
  const push = (bucket: number[], x0: number, z0: number, x1: number, z1: number) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const length = Math.hypot(dx, dz) || 1;
    const ox = (-dz / length) * 0.004;
    const oz = (dx / length) * 0.004;
    const ax = x0 + ox;
    const az = z0 + oz;
    const bx = x1 + ox;
    const bz = z1 + oz;
    const cx = x1 - ox;
    const cz = z1 - oz;
    const dx2 = x0 - ox;
    const dz2 = z0 - oz;
    bucket.push(ax, y, az, bx, y, bz, cx, y, cz, ax, y, az, cx, y, cz, dx2, y, dz2);
  };
  for (let x = minX; x <= maxX + GRID_CELL * 0.25; x += GRID_CELL) {
    push(Math.abs(x) < GRID_CELL * 0.2 ? axis : grid, x, minZ, x, maxZ);
  }
  for (let z = minZ; z <= maxZ + GRID_CELL * 0.25; z += GRID_CELL) {
    push(Math.abs(z) < GRID_CELL * 0.2 ? axis : grid, minX, z, maxX, z);
  }
  paintLines(gpu, grid, GRID_COLOR);
  paintLines(gpu, axis, AXIS_COLOR);
}

function paintLines(gpu: Gpu, positions: number[], color: [number, number, number]) {
  if (positions.length < 6) return;
  const { gl } = gpu;
  const normals = new Float32Array(positions.length);
  for (let index = 1; index < normals.length; index += 3) normals[index] = 1;
  gl.bindBuffer(gl.ARRAY_BUFFER, gpu.position);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, gpu.normal);
  gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.uniform3f(gpu.uTranslate, 0, 0, 0);
  gl.uniformMatrix3fv(gpu.uBasis, false, new Float32Array(IDENTITY_BASIS));
  gl.uniform1f(gpu.uSpin, 0);
  gl.uniform1f(gpu.uMirror, 0);
  gl.uniform3f(gpu.uColor, color[0], color[1], color[2]);
  gl.uniform1f(gpu.uAlpha, 1);
  gl.uniform1f(gpu.uPalette, 0);
  gl.uniform3f(gpu.uRampOrigin, 0, 0, 0);
  gl.uniform3f(gpu.uRampDir, 0, 0, 0);
  gl.disable(gl.CULL_FACE);
  gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);
}
