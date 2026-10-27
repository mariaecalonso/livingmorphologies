import type { IsoMesh } from "../scan/isomesh";
import { MODULE_SIZE, groundPlaneY, type Vec3 } from "./contract";
import { IDENTITY_BASIS, rotateByBasis, type Mat3 } from "./tile-basis";

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

/** Camera pull-back used by the placed-mesh view. Previews stay at this distance. */
export const CANVAS_EYE = 3.4;
/** Catalog and other placed views. The Aggregation Canvas uses MIN_CAMERA_DISTANCE. */
export const CANVAS_EYE_MIN = 2.05;
export const CANVAS_EYE_MAX = 8.4;
/** Closest Aggregation Canvas pull-back. About 35% of the previous 2.05 limit. */
export const MIN_CAMERA_DISTANCE = 0.72;
const NEAR_PLANE = 0.35;
const FAR_PLANE = 14;

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
out vec3 vObjectN;
out vec3 vLocal;
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
  vObjectN = n;
  vLocal = vec3(rx, spun.y, rz);
  vec3 placed = vec3(rx, spun.y, rz) + uTranslate;
  vRamp = dot(placed - uRampOrigin, uRampDir);
  float nx1 = n.x * cy + n.z * sy;
  float nz1 = -n.x * sy + n.z * cy;
  float ny2 = n.y * cp - nz1 * sp;
  float nz2 = n.y * sp + nz1 * cp;
  vNormal = vec3(nx1, ny2, nz2);
  vec3 view = vec3(x1 * uFit, y2 * uFit * uAspect, -z2 * uFit - uDistance);
  vDepth = -view.z;
  float near = uDistance < ${CANVAS_EYE_MIN} ? uDistance * ${(NEAR_PLANE / CANVAS_EYE_MIN).toFixed(8)} : ${NEAR_PLANE};
  float far = ${FAR_PLANE.toFixed(1)};
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
in vec3 vObjectN;
in vec3 vLocal;
in float vDepth;
in float vRamp;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uPalette;
uniform float uStyle;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oDepth;
float surfaceLine(float coord) {
  float dist = 0.5 - abs(fract(coord) - 0.5);
  float width = min(max(fwidth(coord) * 0.55, 0.0018), 0.07);
  return 1.0 - smoothstep(width, width * 2.1, dist);
}
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
  if (uStyle > 1.5) {
    vec3 surfaceN = normalize(vObjectN);
    vec3 tangent = abs(surfaceN.y) > 0.85 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    tangent = normalize(cross(surfaceN, tangent));
    vec3 bitangent = cross(surfaceN, tangent);
    vec2 uv = vec2(dot(vLocal, tangent), dot(vLocal, bitangent));
    float spacing = 0.52;
    vec2 id = floor(uv / spacing);
    float objDist = length(uv - (id + 0.5) * spacing);
    float pixel = max(length(fwidth(uv)), 0.0012);
    float point = 1.0 - smoothstep(pixel * 1.05, pixel * 2.15, objDist);
    float halo = (1.0 - smoothstep(pixel * 2.0, pixel * 3.6, objDist)) * 0.34;
    vec3 body = tint * (0.26 + lambert * 0.16);
    vec3 glow = min(vec3(0.9), tint * (1.08 + lambert * 0.28) + vec3(0.03));
    col = mix(body, glow, clamp(point + halo, 0.0, 1.0));
  } else if (uStyle > 0.5) {
    vec3 surfaceN = normalize(vObjectN);
    vec3 tangent = abs(surfaceN.y) > 0.85 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    tangent = normalize(cross(surfaceN, tangent));
    vec3 bitangent = cross(surfaceN, tangent);
    float along = dot(vLocal, tangent);
    float across = dot(vLocal, bitangent);
    float rim = pow(1.0 - abs(dot(n, viewDir)), 2.1);
    float crease = smoothstep(0.05, 0.42, length(fwidth(n)));
    float flow = max(surfaceLine(along * 1.8), surfaceLine(across * 1.8));
    float contour = surfaceLine((along + across) * 1.25);
    float ink = clamp(max(rim, crease * 0.7) * 0.5 + max(flow, contour * 0.65) * 0.36, 0.0, 0.52);
    col = mix(col, vec3(0.15, 0.16, 0.17), ink);
  }
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

const SHADER_VERSION = 14;

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
  uStyle: WebGLUniformLocation;
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
  const uStyle = gl.getUniformLocation(meshProgram, "uStyle");
  const uRampOrigin = gl.getUniformLocation(meshProgram, "uRampOrigin");
  const uRampDir = gl.getUniformLocation(meshProgram, "uRampDir");
  const uTexel = gl.getUniformLocation(aoProgram, "uTexel");
  if (!position || !normal || !index || !quad || !fbo || !colorTex || !linearTex || !depthTex) return null;
  if (!uYaw || !uPitch || !uAspect || !uFit || !uDistance || !uTranslate || !uCenter || !uBasis || !uSpin || !uMirror || !uColor || !uAlpha || !uPalette || !uStyle || !uRampOrigin || !uRampDir || !uTexel) return null;
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
    uStyle,
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

const GRID_CELL = MODULE_SIZE / 4;
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

/** World bounds of placed meshes. The camera uses this. The meshes are not resized. */
export function placedAssemblyBounds(instances: readonly PlacedMesh[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let found = false;
  for (const instance of instances) {
    if (instance.id.startsWith("guide:") || instance.mesh.triangles < 1) continue;
    const positions = instance.mesh.positions;
    for (let index = 0; index < positions.length; index += 3) {
      const point = placeVertex(instance, positions[index], positions[index + 1], positions[index + 2]);
      found = true;
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.z < minZ) minZ = point.z;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
      if (point.z > maxZ) maxZ = point.z;
    }
  }
  if (!found) return { center: { x: 0, y: 0, z: 0 }, span: 1, height: 1, min: null, max: null };
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    span: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1),
    height: Math.max(maxY - minY, 1),
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
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

const VIEW_FOCAL = 1.55;

function rotatedToWorld(x1: number, y2: number, z2: number, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const py = y2 * cp + z2 * sp;
  const z1 = -y2 * sp + z2 * cp;
  return {
    x: x1 * cy - z1 * sy,
    y: py,
    z: x1 * sy + z1 * cy,
  };
}

/** Ray through a canvas pixel. Matches the placed-mesh projection. */
export function placementCameraRay(
  x: number,
  y: number,
  width: number,
  height: number,
  center: Vec3,
  yaw: number,
  pitch: number,
  fit: number,
  eye = CANVAS_EYE,
) {
  const aspect = width / Math.max(1, height);
  const ndcX = (x / Math.max(1, width)) * 2 - 1;
  const ndcY = 1 - (y / Math.max(1, height)) * 2;
  const originOffset = rotatedToWorld(0, 0, -eye / fit, yaw, pitch);
  const direction = rotatedToWorld(ndcX / (fit * VIEW_FOCAL), ndcY / (fit * aspect * VIEW_FOCAL), 1 / fit, yaw, pitch);
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return {
    origin: { x: center.x + originOffset.x, y: center.y + originOffset.y, z: center.z + originOffset.z },
    direction: { x: direction.x / length, y: direction.y / length, z: direction.z / length },
  };
}

function placeVertex(instance: PlacedMesh, x: number, y: number, z: number): Vec3 {
  let placed = rotateByBasis(instance.basis ?? IDENTITY_BASIS, { x, y, z });
  const mirror = instance.mirror ?? 0;
  if (mirror === 1) placed = { ...placed, x: -placed.x };
  if (mirror === 2) placed = { ...placed, y: -placed.y };
  if (mirror === 3) placed = { ...placed, z: -placed.z };
  const spin = instance.spin ?? 0;
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  return {
    x: placed.x * cs + placed.z * sn + instance.translate.x,
    y: placed.y + instance.translate.y,
    z: -placed.x * sn + placed.z * cs + instance.translate.z,
  };
}

function nearestMeshHit(
  instances: readonly PlacedMesh[],
  origin: Vec3,
  direction: Vec3,
) {
  let best = Number.POSITIVE_INFINITY;
  for (const instance of instances) {
    if (instance.id.startsWith("guide:") || instance.mesh.triangles < 1) continue;
    const positions = instance.mesh.positions;
    const world = new Float32Array(positions.length);
    for (let index = 0; index < positions.length; index += 3) {
      const point = placeVertex(instance, positions[index], positions[index + 1], positions[index + 2]);
      world[index] = point.x;
      world[index + 1] = point.y;
      world[index + 2] = point.z;
    }
    const indices = instance.mesh.indices;
    for (let index = 0; index < indices.length; index += 3) {
      const hit = rayTriangle(origin, direction, world, indices[index] * 3, indices[index + 1] * 3, indices[index + 2] * 3);
      if (hit != null && hit < best) best = hit;
    }
  }
  return Number.isFinite(best) ? best : null;
}

function rayTriangle(origin: Vec3, direction: Vec3, positions: Float32Array, a: number, b: number, c: number) {
  const ax = positions[a];
  const ay = positions[a + 1];
  const az = positions[a + 2];
  const abx = positions[b] - ax;
  const aby = positions[b + 1] - ay;
  const abz = positions[b + 2] - az;
  const acx = positions[c] - ax;
  const acy = positions[c + 1] - ay;
  const acz = positions[c + 2] - az;
  const px = direction.y * acz - direction.z * acy;
  const py = direction.z * acx - direction.x * acz;
  const pz = direction.x * acy - direction.y * acx;
  const det = abx * px + aby * py + abz * pz;
  if (Math.abs(det) < 1e-8) return null;
  const inverse = 1 / det;
  const sx = origin.x - ax;
  const sy = origin.y - ay;
  const sz = origin.z - az;
  const u = (sx * px + sy * py + sz * pz) * inverse;
  if (u < 0 || u > 1) return null;
  const qx = sy * abz - sz * aby;
  const qy = sz * abx - sx * abz;
  const qz = sx * aby - sy * abx;
  const v = (direction.x * qx + direction.y * qy + direction.z * qz) * inverse;
  if (v < 0 || u + v > 1) return null;
  const t = (acx * qx + acy * qy + acz * qz) * inverse;
  return t > 1e-4 ? t : null;
}

/**
 * World point under the cursor: nearest visible assembly surface, otherwise the
 * registration ground, otherwise the current orbit target.
 */
export function cursorZoomPoint(
  instances: readonly PlacedMesh[],
  x: number,
  y: number,
  width: number,
  height: number,
  center: Vec3,
  yaw: number,
  pitch: number,
  fit: number,
  eye = CANVAS_EYE,
): { point: Vec3; source: "mesh" | "ground" | "target" } {
  const ray = placementCameraRay(x, y, width, height, center, yaw, pitch, fit, eye);
  const meshDistance = nearestMeshHit(instances, ray.origin, ray.direction);
  if (meshDistance != null) {
    return { point: pointAlong(ray.origin, ray.direction, meshDistance), source: "mesh" };
  }
  const groundDistance = ray.direction.y < -1e-4 || ray.direction.y > 1e-4
    ? (groundPlaneY() - ray.origin.y) / ray.direction.y
    : null;
  if (groundDistance != null && groundDistance > 1e-4 && groundDistance < 48) {
    return { point: pointAlong(ray.origin, ray.direction, groundDistance), source: "ground" };
  }
  return { point: center, source: "target" };
}

function pointAlong(origin: Vec3, direction: Vec3, distance: number): Vec3 {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
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

/** Largest view that keeps every vertex inside the frame. */
function frameFit(instances: readonly PlacedMesh[], aspect: number, eye: number) {
  const focal = 1.55;
  const limit = 0.99;
  const points: Vec3[] = [];
  for (const instance of instances) {
    const positions = instance.mesh.positions;
    for (let index = 0; index < positions.length; index += 3) {
      points.push(placeVertex(instance, positions[index], positions[index + 1], positions[index + 2]));
    }
  }
  if (points.length === 0) return { fit: 1, center: { x: 0, y: 0, z: 0 }, yaw: 0.42, pitch: 0.14 };
  let best = { fit: 0, center: { x: 0, y: 0, z: 0 }, yaw: 0.42, pitch: 0.14, cover: -1 };
  for (let yaw = 0; yaw < Math.PI; yaw += 0.22) {
    for (let pitch = -0.5; pitch <= 0.7; pitch += 0.16) {
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      let center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }), { x: 0, y: 0, z: 0 });
      center = { x: center.x / points.length, y: center.y / points.length, z: center.z / points.length };
      let fit = 0.02;
      let cover = 0;
      for (let pass = 0; pass < 6; pass += 1) {
        const samples = points.map((point) => {
          const x = point.x - center.x;
          const y = point.y - center.y;
          const z = point.z - center.z;
          const x1 = x * cy + z * sy;
          const z1 = -x * sy + z * cy;
          return { x1, y2: y * cp - z1 * sp, z2: y * sp + z1 * cp };
        });
        const inside = (scale: number) => samples.every((sample) => {
          const depth = sample.z2 * scale + eye;
          return depth > 0.05
            && Math.abs(sample.x1 * scale * focal) <= limit * depth
            && Math.abs(sample.y2 * scale * aspect * focal) <= limit * depth;
        });
        let low = 0.02;
        let high = 0.02;
        for (let step = 0; step < 24 && inside(high); step += 1) {
          low = high;
          high *= 1.5;
        }
        for (let step = 0; step < 16; step += 1) {
          const mid = (low + high) * 0.5;
          if (inside(mid)) low = mid;
          else high = mid;
        }
        fit = low;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const sample of samples) {
          const depth = sample.z2 * fit + eye;
          minX = Math.min(minX, sample.x1 * fit * focal / depth);
          maxX = Math.max(maxX, sample.x1 * fit * focal / depth);
          minY = Math.min(minY, sample.y2 * fit * aspect * focal / depth);
          maxY = Math.max(maxY, sample.y2 * fit * aspect * focal / depth);
        }
        cover = (maxX - minX) * (maxY - minY);
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        if (Math.abs(midX) < 0.015 && Math.abs(midY) < 0.015) break;
        const shift = rotatedToWorld(midX * eye / (fit * focal), midY * eye / (fit * aspect * focal), 0, yaw, pitch);
        center = { x: center.x + shift.x, y: center.y + shift.y, z: center.z + shift.z };
      }
      if (cover > best.cover) best = { fit, center, yaw, pitch, cover };
    }
  }
  return best;
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
  lookAt?: Vec3,
  fill = false,
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
  const framed = fill ? frameFit(instances, aspect, eye) : null;
  const center = framed?.center ?? lookAt ?? placementCenter(instances);
  const fit = framed?.fit ?? (contain ? containedFit(instances, aspect) : placementFit(span, aspect)) * fitScale;
  gl.useProgram(gpu.program);
  gl.uniform1f(gpu.uYaw, framed?.yaw ?? yaw);
  gl.uniform1f(gpu.uPitch, framed?.pitch ?? pitch);
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
    const whiteParent = !instance.palette
      && !instance.id.startsWith("guide:")
      && instance.id !== "joined-assembly"
      && (instance.id === "preview" || !instance.id.includes(":"))
      && color[0] > 0.96 && color[1] > 0.96 && color[2] > 0.96;
    gl.uniform1f(gpu.uStyle, instance.palette ? 2 : whiteParent ? 1 : 0);
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
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  for (const instance of instances) {
    if ((instance.opacity ?? 1) < 1 && !instance.palette && instance.id.startsWith("guide:")) {
      gl.polygonOffset(-1, -1);
      drawInstance(instance);
    }
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.disable(gl.DEPTH_TEST);
  for (const instance of instances) {
    if ((instance.opacity ?? 1) < 1 && !instance.palette && !instance.id.startsWith("guide:")) drawInstance(instance);
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
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  if (!bodies.length) {
    minX = -MODULE_SIZE / 2;
    maxX = MODULE_SIZE / 2;
    minZ = -MODULE_SIZE / 2;
    maxZ = MODULE_SIZE / 2;
  }
  for (const instance of bodies) {
    const positions = instance.mesh.positions;
    for (let index = 0; index < positions.length; index += 3) {
      const point = placeVertex(instance, positions[index], positions[index + 1], positions[index + 2]);
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
  }
  const pad = MODULE_SIZE;
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
    const ox = (-dz / length) * 0.08;
    const oz = (dx / length) * 0.08;
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
  const moduleLine = (value: number) => Math.abs(value / MODULE_SIZE - Math.round(value / MODULE_SIZE)) < 0.08;
  for (let x = minX; x <= maxX + GRID_CELL * 0.25; x += GRID_CELL) {
    push(moduleLine(x) ? axis : grid, x, minZ, x, maxZ);
  }
  for (let z = minZ; z <= maxZ + GRID_CELL * 0.25; z += GRID_CELL) {
    push(moduleLine(z) ? axis : grid, minX, z, maxX, z);
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
  gl.uniform1f(gpu.uStyle, 0);
  gl.uniform3f(gpu.uRampOrigin, 0, 0, 0);
  gl.uniform3f(gpu.uRampDir, 0, 0, 0);
  gl.disable(gl.CULL_FACE);
  gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);
}
