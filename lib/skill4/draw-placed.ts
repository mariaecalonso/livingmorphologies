import type { IsoMesh } from "../scan/isomesh";
import type { Vec3 } from "./contract";

export type PlacedMesh = {
  id: string;
  mesh: IsoMesh;
  translate: Vec3;
  selected: boolean;
  spin?: number;
  mirror?: 0 | 1 | 2 | 3;
  kind?: 0 | 1;
  color?: [number, number, number];
};

const VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform float uYaw;
uniform float uPitch;
uniform float uAspect;
uniform float uFit;
uniform vec3 uTranslate;
uniform vec3 uCenter;
uniform float uSpin;
uniform float uMirror;
out vec3 vNormal;
out float vDepth;
void main() {
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  vec3 spun = aPos;
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
  vec3 n = aNormal;
  if (uMirror > 0.5 && uMirror < 1.5) n.x = -n.x;
  if (uMirror > 1.5 && uMirror < 2.5) n.y = -n.y;
  if (uMirror > 2.5) n.z = -n.z;
  float nrx = n.x * cs + n.z * sn;
  float nrz = -n.x * sn + n.z * cs;
  n = vec3(nrx, n.y, nrz);
  float nx1 = n.x * cy + n.z * sy;
  float nz1 = -n.x * sy + n.z * cy;
  float ny2 = n.y * cp - nz1 * sp;
  float nz2 = n.y * sp + nz1 * cp;
  vNormal = vec3(nx1, ny2, nz2);
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
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vDepth;
uniform float uSelected;
uniform float uKind;
uniform vec3 uColor;
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
  vec3 col = uColor * (0.28 + lambert * 0.72 + bounce);
  col = mix(col, uColor * 0.35, cavity * 0.35);
  col = mix(col, vec3(1.0), uSelected * 0.22);
  col = mix(col, vec3(0.96, 0.78, 0.62), uKind * 0.35);
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

type Gpu = {
  gl: WebGL2RenderingContext;
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
  uTranslate: WebGLUniformLocation;
  uCenter: WebGLUniformLocation;
  uSpin: WebGLUniformLocation;
  uMirror: WebGLUniformLocation;
  uSelected: WebGLUniformLocation;
  uKind: WebGLUniformLocation;
  uColor: WebGLUniformLocation;
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
  if (existing && !existing.gl.isContextLost()) return existing;
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: true });
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
  const uTranslate = gl.getUniformLocation(meshProgram, "uTranslate");
  const uCenter = gl.getUniformLocation(meshProgram, "uCenter");
  const uSpin = gl.getUniformLocation(meshProgram, "uSpin");
  const uMirror = gl.getUniformLocation(meshProgram, "uMirror");
  const uSelected = gl.getUniformLocation(meshProgram, "uSelected");
  const uKind = gl.getUniformLocation(meshProgram, "uKind");
  const uColor = gl.getUniformLocation(meshProgram, "uColor");
  const uTexel = gl.getUniformLocation(aoProgram, "uTexel");
  if (!position || !normal || !index || !quad || !fbo || !colorTex || !linearTex || !depthTex) return null;
  if (!uYaw || !uPitch || !uAspect || !uFit || !uTranslate || !uCenter || !uSpin || !uMirror || !uSelected || !uKind || !uColor || !uTexel) return null;
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
    uTranslate,
    uCenter,
    uSpin,
    uMirror,
    uSelected,
    uKind,
    uColor,
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

export function placementFit(span: number, aspect: number) {
  return Math.min(1.05, 1.35 / Math.max(1, span * 0.42 * Math.max(1, aspect * 0.35)));
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
  const viewZ = -z2 * fit - 3.4;
  const f = 1.55;
  const clipX = x1 * fit * f;
  const clipY = y2 * fit * aspect * f;
  const clipW = -viewZ;
  return {
    x: (clipX / clipW * 0.5 + 0.5) * width,
    y: (-clipY / clipW * 0.5 + 0.5) * height,
  };
}

export function drawPlacedMeshes(
  canvas: HTMLCanvasElement,
  instances: readonly PlacedMesh[],
  yaw: number,
  pitch: number,
  span: number,
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
  const fit = placementFit(span, aspect);
  const center = placementCenter(instances);
  gl.useProgram(gpu.program);
  gl.uniform1f(gpu.uYaw, yaw);
  gl.uniform1f(gpu.uPitch, pitch);
  gl.uniform1f(gpu.uAspect, aspect);
  gl.uniform1f(gpu.uFit, fit);
  gl.uniform3f(gpu.uCenter, center.x, center.y, center.z);
  for (const instance of instances) {
    if (instance.mesh.triangles < 1) continue;
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
    gl.uniform1f(gpu.uSpin, instance.spin ?? 0);
    gl.uniform1f(gpu.uMirror, instance.mirror ?? 0);
    gl.uniform1f(gpu.uSelected, instance.selected ? 1 : 0);
    gl.uniform1f(gpu.uKind, instance.kind ?? 0);
    const color = instance.color ?? [0.78, 0.494, 0.373];
    gl.uniform3f(gpu.uColor, color[0], color[1], color[2]);
    gl.drawElements(gl.TRIANGLES, instance.mesh.indices.length, gl.UNSIGNED_INT, 0);
  }
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
