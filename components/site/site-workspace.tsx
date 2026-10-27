"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import context from "@/data/skill5/herald-site.json";
import { nextCatalogId, siteLibraryEntries, type CatalogEntry } from "@/lib/skill4/catalog";
import { catalogServerSnapshot, readCatalog, subscribeCatalog, writeCatalog } from "@/lib/skill4/catalog-store";
import { localOnAssembly, worldAnnotations, type SiteAnnotation } from "@/lib/skill5/annotations";
import { assemblyWorldModules, cellToFeet, earlierProposals, explodeShifts, findSentProposal, importAssembly, keepAssemblyInSkill5, markAssemblySent, proposalCatalogEntry, reconcileSentAssemblies, reviseAssemblyMembers, worldToAssemblyLocal, type SiteAssembly } from "@/lib/skill5/assembly";
import brief from "@/data/skill5/workplace-brief.json";
import { PROGRAM_LABEL, SITE_ARCHETYPES, SITE_PROGRAMS, type SiteArchetype } from "@/lib/skill5/catalog";
import { isSkill5MockAssembly } from "@/lib/skill5/mock-assemblies";
import { localDemonstrationBridge, worldSourceBridge } from "@/lib/skill5/mock-bridge";
import { CONFIGURATION_CONTRACT, nextConfigurationId, referenceForModule, type ComparisonPriority, type ConfigurationDocument, type SiteConfiguration } from "@/lib/skill5/configurations";
import { nominalUnionSqFt, programDistribution, scenePlaced } from "@/lib/skill5/metrics";
import { measureSite } from "@/lib/skill5/relations";
import { SKILL5_MODULE_ENVELOPE_FEET, SKILL5_SITE_ID } from "@/lib/skill5/contract";
import { designSiteFromParcel } from "@/lib/skill5/design-site";
import { adoptPresent, beginGesture, emptyEditHistory, endGesture, redoEdit, rememberEdit, undoEdit, type CompositionSnapshot } from "@/lib/skill5/history";
import { loadArchetypeMesh } from "@/lib/skill5/load-module";
import { MODULE_GROUND_Y, NOMINAL_PLAN_EXTENT, boundsOf, extentCorners, footprintCorners, placementWarnings, settleMove, snapModuleOrigin, type PlacedModule } from "@/lib/skill5/placement";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { SiteContext } from "@/lib/skill5/site-model";
import { SiteViewport, type SiteFit, type SiteReadout, type SiteViewMode } from "./site-viewport";

const site = context as SiteContext;
const designSite = designSiteFromParcel(site.site.ring);

function occupiedBounds(instances: readonly PlacedModule[]) {
  return instances.map((instance) => boundsOf(extentCorners(
    NOMINAL_PLAN_EXTENT,
    instance.transform.position,
    instance.transform.rotationY,
    instance.mirror,
  )));
}

function clearOfNeighbors(
  x: number,
  z: number,
  rotationY: number,
  mirror: PlacedModule["mirror"],
  still: ReturnType<typeof occupiedBounds>,
) {
  const parked = snapModuleOrigin(x, z);
  const box = boundsOf(extentCorners(NOMINAL_PLAN_EXTENT, parked, rotationY, mirror));
  const step = settleMove([box], box, still, { dx: 0, dz: 0 }, true);
  return { x: parked.x + step.dx, z: parked.z + step.dz };
}

const MODES: { id: SiteViewMode; label: string }[] = [
  { id: "perspective", label: "Perspective" },
  { id: "plan", label: "Plan" },
  { id: "axon", label: "Axonometric" },
];

const ORTHO_VIEWS = [
  { id: "top", label: "Top" },
  { id: "north", label: "North" },
  { id: "south", label: "South" },
  { id: "east", label: "East" },
  { id: "west", label: "West" },
] as const;

type OrthoView = (typeof ORTHO_VIEWS)[number]["id"];

function placedVertex(item: PlacedModule, x: number, y: number, z: number) {
  let east = x;
  let north = y;
  if (item.mirror === "x") east = -east;
  if (item.mirror === "z") north = -north;
  const ry = -item.transform.rotationY;
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  return {
    east: item.transform.position.x + east * cos + north * sin,
    north: item.transform.position.z - east * sin + north * cos,
    up: z,
  };
}

function viewAxes(point: { east: number; north: number; up: number }, view: OrthoView) {
  if (view === "top") return { x: point.east, y: point.north, z: point.up };
  if (view === "north") return { x: point.east, y: point.up, z: -point.north };
  if (view === "south") return { x: -point.east, y: point.up, z: point.north };
  if (view === "east") return { x: point.north, y: point.up, z: -point.east };
  return { x: -point.north, y: point.up, z: point.east };
}

type OrthoFrame = { minX: number; maxX: number; minY: number; maxY: number };

export function arrangementFrames(modules: readonly PlacedModule[], options?: { pad?: number; minHeight?: number }) {
  let minEast = Infinity;
  let maxEast = -Infinity;
  let minNorth = Infinity;
  let maxNorth = -Infinity;
  let maxUp = options?.minHeight ?? 32;
  for (const item of modules) {
    minEast = Math.min(minEast, item.transform.position.x - 10);
    maxEast = Math.max(maxEast, item.transform.position.x + 10);
    minNorth = Math.min(minNorth, item.transform.position.z - 10);
    maxNorth = Math.max(maxNorth, item.transform.position.z + 10);
    maxUp = Math.max(maxUp, item.transform.position.y + SKILL5_MODULE_ENVELOPE_FEET);
  }
  const pad = options?.pad ?? 28;
  const box = {
    minEast: minEast - pad,
    maxEast: maxEast + pad,
    minNorth: minNorth - pad,
    maxNorth: maxNorth + pad,
    minUp: 0,
    maxUp,
  };
  const frames = {} as Record<OrthoView, OrthoFrame>;
  for (const item of ORTHO_VIEWS) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const east of [box.minEast, box.maxEast]) {
      for (const north of [box.minNorth, box.maxNorth]) {
        for (const up of [box.minUp, box.maxUp]) {
          const point = viewAxes({ east, north, up }, item.id);
          minX = Math.min(minX, point.x);
          maxX = Math.max(maxX, point.x);
          minY = Math.min(minY, point.y);
          maxY = Math.max(maxY, point.y);
        }
      }
    }
    frames[item.id] = { minX, maxX, minY, maxY };
  }
  return frames;
}

export function OrthoCanvas({ modules, meshes, view, label, frame, bridges = [], fitCell = false }: { modules: PlacedModule[]; meshes: Record<string, IsoMesh>; view: OrthoView; label: string; frame?: OrthoFrame; bridges?: IsoMesh[]; fitCell?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameKey = `${fitCell ? "cell" : "span"}|${frame ? `${frame.minX}:${frame.maxX}:${frame.minY}:${frame.maxY}` : ""}`;
  const bridgeKey = bridges.map((bridge) => {
    const sample = bridge.positions;
    return `${sample[0] ?? 0}:${sample[Math.min(6, sample.length - 3)] ?? 0}:${sample[sample.length - 3] ?? 0}`;
  }).join("|");
  const signature = `${frameKey}|${bridgeKey}|${modules.map((item) => {
    const mesh = meshes[item.provenance.moduleId];
    return `${item.instanceId}:${item.transform.position.x}:${item.transform.position.z}:${item.transform.rotationY}:${item.mirror ?? ""}:${mesh?.triangles ?? 0}`;
  }).join("|")}`;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const context2d = canvas.getContext("2d");
      if (!context2d) return;
      const width = Math.max(1, canvas.offsetWidth);
      const height = Math.max(1, canvas.offsetHeight);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context2d.setTransform(1, 0, 0, 1, 0, 0);
      context2d.fillStyle = "#000000";
      context2d.fillRect(0, 0, canvas.width, canvas.height);
      if (modules.length === 0) return;
      const source = modulePreviewSource(canvas.width, canvas.height);
      if (!source || !paintSelectionMass(source, modules, meshes, view, frame, bridges, fitCell)) {
        context2d.fillStyle = "#8d8a84";
        const pad = Math.round(Math.min(canvas.width, canvas.height) * 0.18);
        context2d.fillRect(pad, pad, canvas.width - pad * 2, canvas.height - pad * 2);
        return;
      }
      context2d.drawImage(source, 0, 0);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [bridges, meshes, modules, signature, view]);
  return <canvas ref={canvasRef} aria-label={label} />;
}

const MODULE_PREVIEW_YAW = Math.PI / 4;
const MODULE_PREVIEW_PITCH = 0.62;
const CLAY_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform float uYaw;
uniform float uPitch;
uniform float uAspect;
uniform float uZoom;
uniform vec2 uCenter;
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
  gl_Position = vec4((x1 - uCenter.x) * uZoom / uAspect, (y2 - uCenter.y) * uZoom, -z2 / 720.0, 1.0);
}`;
const CLAY_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
out vec4 oColor;
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
}`;
const centeredPreviews = new WeakMap<IsoMesh, IsoMesh>();

function centeredPreview(mesh: IsoMesh) {
  const cached = centeredPreviews.get(mesh);
  if (cached) return cached;
  const positions = mesh.positions;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const copy = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    copy[index] = positions[index] - centerX;
    copy[index + 1] = positions[index + 1] - centerY;
    copy[index + 2] = positions[index + 2] - centerZ;
  }
  const next = { positions: copy, normals: mesh.normals, indices: mesh.indices, triangles: mesh.triangles };
  centeredPreviews.set(mesh, next);
  return next;
}

type ClayGpu = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  position: WebGLBuffer;
  normal: WebGLBuffer;
  index: WebGLBuffer;
  yaw: WebGLUniformLocation;
  pitch: WebGLUniformLocation;
  aspect: WebGLUniformLocation;
  zoom: WebGLUniformLocation;
  center: WebGLUniformLocation;
};

function clayShader(gl: WebGL2RenderingContext, type: number, source: string) {
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

function clayGpu(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, alpha: false, depth: true });
  if (!gl) return null;
  const existing = clayPrograms.get(gl);
  if (existing && !gl.isContextLost()) return existing;
  const vert = clayShader(gl, gl.VERTEX_SHADER, CLAY_VERT);
  const frag = clayShader(gl, gl.FRAGMENT_SHADER, CLAY_FRAG);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  const position = gl.createBuffer();
  const normal = gl.createBuffer();
  const index = gl.createBuffer();
  if (!program || !position || !normal || !index) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const yaw = gl.getUniformLocation(program, "uYaw");
  const pitch = gl.getUniformLocation(program, "uPitch");
  const aspect = gl.getUniformLocation(program, "uAspect");
  const zoom = gl.getUniformLocation(program, "uZoom");
  const center = gl.getUniformLocation(program, "uCenter");
  if (!yaw || !pitch || !aspect || !zoom || !center) return null;
  const gpu: ClayGpu = { gl, program, position, normal, index, yaw, pitch, aspect, zoom, center };
  clayPrograms.set(gl, gpu);
  return gpu;
}

function previewRadius(mesh: IsoMesh) {
  let radius = 0;
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 3) {
    radius = Math.max(radius, Math.hypot(positions[index], positions[index + 1], positions[index + 2]));
  }
  return Math.max(0.001, radius);
}

function modulePreviewSource(width: number, height: number) {
  let host = document.getElementById("site-module-preview-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "site-module-preview-host";
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:-12000px;top:0;overflow:hidden;pointer-events:none";
    host.appendChild(document.createElement("canvas"));
    document.body.appendChild(host);
  }
  const canvas = host.querySelector("canvas");
  if (!canvas) return null;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function paintClayPreview(canvas: HTMLCanvasElement, mesh: IsoMesh, yaw: number, fitRadius?: number) {
  const gpu = clayGpu(canvas);
  if (!gpu) return;
  const { gl } = gpu;
  const centered = centeredPreview(mesh);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(gpu.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gpu.position);
  gl.bufferData(gl.ARRAY_BUFFER, centered.positions, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, gpu.normal);
  gl.bufferData(gl.ARRAY_BUFFER, centered.normals, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, centered.indices, gl.DYNAMIC_DRAW);
  const radius = fitRadius && fitRadius > 0 ? fitRadius : previewRadius(centered);
  const aspect = canvas.width / Math.max(1, canvas.height);
  gl.uniform1f(gpu.yaw, yaw);
  gl.uniform1f(gpu.pitch, MODULE_PREVIEW_PITCH);
  gl.uniform1f(gpu.aspect, aspect);
  gl.uniform1f(gpu.zoom, 0.82 * Math.min(aspect, 1) / radius);
  gl.uniform2f(gpu.center, 0, 0);
  gl.drawElements(gl.TRIANGLES, centered.indices.length, gl.UNSIGNED_INT, 0);
}

function paintSelectionMass(canvas: HTMLCanvasElement, modules: readonly PlacedModule[], meshes: Record<string, IsoMesh>, view: OrthoView, frame?: OrthoFrame, bridges: readonly IsoMesh[] = [], fitCell = false) {
  const parts = modules.flatMap((item) => {
    const mesh = meshes[item.provenance.moduleId];
    if (!mesh || mesh.triangles < 1) return [];
    const positions = new Float32Array(mesh.positions.length);
    const normals = new Float32Array(mesh.normals.length);
    for (let index = 0; index < mesh.positions.length; index += 3) {
      const point = viewAxes(placedVertex(item, mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]), view);
      positions[index] = point.x;
      positions[index + 1] = point.y;
      positions[index + 2] = point.z;
      const normal = viewAxes(placedVertex({ ...item, transform: { ...item.transform, position: { x: 0, y: 0, z: 0 } } }, mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2]), view);
      normals[index] = normal.x;
      normals[index + 1] = normal.y;
      normals[index + 2] = normal.z;
    }
    return [{ positions, normals, indices: mesh.indices }];
  });
  for (const bridge of bridges) {
    const positions = new Float32Array(bridge.positions.length);
    const normals = new Float32Array(bridge.normals.length);
    for (let index = 0; index < bridge.positions.length; index += 3) {
      const point = viewAxes({ east: bridge.positions[index], north: bridge.positions[index + 1], up: bridge.positions[index + 2] }, view);
      positions[index] = point.x;
      positions[index + 1] = point.y;
      positions[index + 2] = point.z;
      const normal = viewAxes({ east: bridge.normals[index], north: bridge.normals[index + 1], up: bridge.normals[index + 2] }, view);
      normals[index] = normal.x;
      normals[index + 1] = normal.y;
      normals[index + 2] = normal.z;
    }
    parts.push({ positions, normals, indices: bridge.indices });
  }
  if (parts.length === 0) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const part of parts) {
    for (let index = 0; index < part.positions.length; index += 3) {
      const x = part.positions[index];
      const y = part.positions[index + 1];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (frame) {
    minX = Math.min(minX, frame.minX);
    maxX = Math.max(maxX, frame.maxX);
    minY = Math.min(minY, frame.minY);
    maxY = Math.max(maxY, frame.maxY);
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  for (const part of parts) {
    for (let index = 0; index < part.positions.length; index += 3) {
      part.positions[index] -= centerX;
      part.positions[index + 1] -= centerY;
    }
  }
  const gpu = clayGpu(canvas);
  if (!gpu) return false;
  const { gl } = gpu;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(gpu.program);
  const aspect = canvas.width / Math.max(1, canvas.height);
  const frameW = Math.max(maxX - minX, 1);
  const frameH = Math.max(maxY - minY, 1);
  gl.uniform1f(gpu.yaw, 0);
  gl.uniform1f(gpu.pitch, 0);
  gl.uniform1f(gpu.aspect, aspect);
  gl.uniform1f(gpu.zoom, fitCell ? 1.72 * Math.min(aspect / frameW, 1 / frameH) : 1.55 * Math.min(aspect, 1) / span);
  gl.uniform2f(gpu.center, 0, 0);
  for (const part of parts) {
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.position);
    gl.bufferData(gl.ARRAY_BUFFER, part.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.normal);
    gl.bufferData(gl.ARRAY_BUFFER, part.normals, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, part.indices.length, gl.UNSIGNED_INT, 0);
  }
  return true;
}

const clayPrograms = new WeakMap<WebGL2RenderingContext, ClayGpu>();

type PreviewMesh = IsoMesh | "missing" | undefined;

function composeAssemblyPreview(entry: CatalogEntry, meshes: Record<string, PreviewMesh>): IsoMesh | null {
  const parts = entry.tiles.flatMap((tile) => {
    const archetype = SITE_ARCHETYPES.find((item) => item.archetypeId === tile.archetypeId);
    const stored = meshes[tile.moduleId];
    if (!archetype || archetype.moduleId !== tile.moduleId || !stored || stored === "missing" || stored.triangles < 1) return [];
    return [{ tile, mesh: stored }];
  });
  if (parts.length === 0) return null;
  const bridge = isSkill5MockAssembly(entry.id) ? localDemonstrationBridge({
    assemblyId: entry.id,
    members: entry.tiles.map((tile) => ({
      tileId: tile.instanceId,
      local: { x: cellToFeet(tile.transform.x), y: cellToFeet(tile.transform.y), z: cellToFeet(tile.transform.z) },
    })),
    connectors: entry.connections.map((link) => ({ id: link.id, tileAId: link.tileAId, tileBId: link.tileBId })),
  }) : null;
  let vertexCount = bridge?.positions.length ?? 0;
  let indexCount = bridge?.indices.length ?? 0;
  for (const part of parts) {
    vertexCount += part.mesh.positions.length;
    indexCount += part.mesh.indices.length;
  }
  const positions = new Float32Array(vertexCount);
  const normals = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  let vertexWrite = 0;
  let indexWrite = 0;
  let base = 0;
  for (const part of parts) {
    const { tile, mesh } = part;
    const angle = tile.rotationQuarter * Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const east = cellToFeet(tile.transform.x);
    const north = cellToFeet(tile.transform.z);
    const lift = cellToFeet(tile.transform.y);
    const mirrorX = tile.mirror === "x" ? -1 : 1;
    const mirrorNorth = tile.mirror === "z" ? -1 : 1;
    const mirrorUp = tile.mirror === "y" ? -1 : 1;
    const source = mesh.positions;
    const sourceNormals = mesh.normals;
    for (let index = 0; index < source.length; index += 3) {
      const x = source[index] * mirrorX;
      const y = source[index + 1] * mirrorNorth;
      const z = source[index + 2] * mirrorUp;
      positions[vertexWrite + index] = east + x * cos - y * sin;
      positions[vertexWrite + index + 1] = north + x * sin + y * cos;
      positions[vertexWrite + index + 2] = lift + z;
      const nx = sourceNormals[index] * mirrorX;
      const ny = sourceNormals[index + 1] * mirrorNorth;
      const nz = sourceNormals[index + 2] * mirrorUp;
      normals[vertexWrite + index] = nx * cos - ny * sin;
      normals[vertexWrite + index + 1] = nx * sin + ny * cos;
      normals[vertexWrite + index + 2] = nz;
    }
    for (let index = 0; index < mesh.indices.length; index += 1) indices[indexWrite + index] = mesh.indices[index] + base;
    base += source.length / 3;
    vertexWrite += source.length;
    indexWrite += mesh.indices.length;
  }
  if (bridge) {
    for (let index = 0; index < bridge.positions.length; index += 3) {
      positions[vertexWrite + index] = bridge.positions[index];
      positions[vertexWrite + index + 1] = bridge.positions[index + 2];
      positions[vertexWrite + index + 2] = bridge.positions[index + 1];
      normals[vertexWrite + index] = bridge.normals[index];
      normals[vertexWrite + index + 1] = bridge.normals[index + 2];
      normals[vertexWrite + index + 2] = bridge.normals[index + 1];
    }
    for (let index = 0; index < bridge.indices.length; index += 1) indices[indexWrite + index] = bridge.indices[index] + base;
  }
  return { positions, normals, indices, triangles: indices.length / 3 };
}

export function composePlacedPreview(modules: readonly PlacedModule[], meshes: Record<string, IsoMesh>, bridges: readonly IsoMesh[] = []): IsoMesh | null {
  const parts = modules.flatMap((item) => {
    const mesh = meshes[item.provenance.moduleId];
    if (!mesh || mesh.triangles < 1) return [];
    return [{ item, mesh }];
  });
  if (parts.length === 0 && bridges.length === 0) return null;
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertexCount += part.mesh.positions.length;
    indexCount += part.mesh.indices.length;
  }
  for (const bridge of bridges) {
    vertexCount += bridge.positions.length;
    indexCount += bridge.indices.length;
  }
  const positions = new Float32Array(vertexCount);
  const normals = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  let vertexWrite = 0;
  let indexWrite = 0;
  let base = 0;
  for (const part of parts) {
    const source = part.mesh.positions;
    const sourceNormals = part.mesh.normals;
    for (let index = 0; index < source.length; index += 3) {
      const point = placedVertex(part.item, source[index], source[index + 1], source[index + 2]);
      positions[vertexWrite + index] = point.east;
      positions[vertexWrite + index + 1] = point.north;
      positions[vertexWrite + index + 2] = point.up;
      const normal = placedVertex(
        { ...part.item, transform: { ...part.item.transform, position: { x: 0, y: 0, z: 0 } } },
        sourceNormals[index],
        sourceNormals[index + 1],
        sourceNormals[index + 2],
      );
      normals[vertexWrite + index] = normal.east;
      normals[vertexWrite + index + 1] = normal.north;
      normals[vertexWrite + index + 2] = normal.up;
    }
    for (let index = 0; index < part.mesh.indices.length; index += 1) indices[indexWrite + index] = part.mesh.indices[index] + base;
    base += source.length / 3;
    vertexWrite += source.length;
    indexWrite += part.mesh.indices.length;
  }
  for (const bridge of bridges) {
    positions.set(bridge.positions, vertexWrite);
    normals.set(bridge.normals, vertexWrite);
    for (let index = 0; index < bridge.indices.length; index += 1) indices[indexWrite + index] = bridge.indices[index] + base;
    base += bridge.positions.length / 3;
    vertexWrite += bridge.positions.length;
    indexWrite += bridge.indices.length;
  }
  return { positions, normals, indices, triangles: indices.length / 3 };
}

export function clayPreviewRadius(mesh: IsoMesh) {
  return previewRadius(centeredPreview(mesh));
}

function GlassThumb({ mesh, interactive = true, fitRadius }: { mesh: IsoMesh | null; interactive?: boolean; fitRadius?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.closest("[data-spin-host]") ?? canvas?.closest("button, article") ?? canvas?.parentElement ?? null;
    if (!canvas || !host) return;
    const yaw = { current: MODULE_PREVIEW_YAW };
    const speed = { current: 0 };
    const hovering = { current: false };
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paint = () => {
      const context2d = canvas.getContext("2d");
      if (!context2d) return;
      const width = Math.max(1, canvas.offsetWidth);
      const height = Math.max(1, canvas.offsetHeight);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context2d.setTransform(1, 0, 0, 1, 0, 0);
      context2d.fillStyle = "#000000";
      context2d.fillRect(0, 0, canvas.width, canvas.height);
      if (!mesh || mesh.triangles < 1) return;
      const source = modulePreviewSource(canvas.width, canvas.height);
      if (!source) return;
      paintClayPreview(source, mesh, yaw.current, fitRadius);
      context2d.drawImage(source, 0, 0);
    };
    if (!interactive) {
      paint();
      const observer = new ResizeObserver(paint);
      observer.observe(canvas.parentElement ?? host);
      return () => observer.disconnect();
    }
    let last = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      const targetSpeed = hovering.current ? 0.95 : 0;
      speed.current += (targetSpeed - speed.current) * Math.min(1, dt * 1.4);
      if (hovering.current) yaw.current += speed.current * dt;
      else {
        const delta = Math.atan2(Math.sin(MODULE_PREVIEW_YAW - yaw.current), Math.cos(MODULE_PREVIEW_YAW - yaw.current));
        yaw.current += delta * Math.min(1, dt * 2.4);
        if (Math.abs(delta) < 0.004 && speed.current < 0.01) {
          yaw.current = MODULE_PREVIEW_YAW;
          speed.current = 0;
          paint();
          frame = 0;
          return;
        }
      }
      paint();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      hovering.current = true;
      if (reduced || frame) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      hovering.current = false;
      if (reduced || frame) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    paint();
    host.addEventListener("pointerenter", start);
    host.addEventListener("pointerleave", stop);
    host.addEventListener("focus", start);
    host.addEventListener("blur", stop);
    const observer = new ResizeObserver(paint);
    observer.observe(canvas.parentElement ?? host);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("pointerenter", start);
      host.removeEventListener("pointerleave", stop);
      host.removeEventListener("focus", start);
      host.removeEventListener("blur", stop);
      observer.disconnect();
    };
  }, [fitRadius, interactive, mesh]);
  return (
    <span className="site-module-glass" data-spin-host={interactive ? "" : undefined}>
      <canvas ref={canvasRef} aria-hidden="true" />
    </span>
  );
}

function ModuleThumb({ mesh }: { mesh: PreviewMesh }) {
  const ready = mesh && mesh !== "missing" && mesh.triangles > 0 ? mesh : null;
  return <GlassThumb mesh={ready} />;
}

const ASSEMBLY_PAGE_SIZE = 10;

function AssemblyThumb({ entry, meshes }: { entry: CatalogEntry; meshes: Record<string, PreviewMesh> }) {
  return <AssemblyGlassPreview entry={entry} meshes={meshes} />;
}

export function AssemblyGlassPreview({ entry, meshes, interactive = true }: { entry: CatalogEntry; meshes: Record<string, PreviewMesh>; interactive?: boolean }) {
  const mesh = useMemo(() => composeAssemblyPreview(entry, meshes), [entry, meshes]);
  return <GlassThumb mesh={mesh} interactive={interactive} />;
}

export function PlacedGlassPreview({ modules, meshes, bridges = [], interactive = true, fitRadius }: { modules: readonly PlacedModule[]; meshes: Record<string, IsoMesh>; bridges?: readonly IsoMesh[]; interactive?: boolean; fitRadius?: number }) {
  const mesh = useMemo(() => composePlacedPreview(modules, meshes, bridges), [bridges, meshes, modules]);
  return <GlassThumb mesh={mesh} interactive={interactive} fitRadius={fitRadius} />;
}

function OrthoSet({ modules, meshes, bridges = [], caption }: { modules: PlacedModule[]; meshes: Record<string, IsoMesh>; bridges?: IsoMesh[]; caption: string }) {
  return (
    <div className="site-ortho">
      {ORTHO_VIEWS.map((item) => (
        <figure key={item.id}>
          <OrthoCanvas modules={modules} meshes={meshes} view={item.id} bridges={bridges} fitCell label={`${caption} ${item.label} view`} />
          <figcaption>{item.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function AssemblyRerun({ assembly, records, onKeep, onSend }: { assembly: SiteAssembly; records: readonly CatalogEntry[]; onKeep: () => void; onSend: () => void }) {
  const sent = findSentProposal(records, assembly);
  const earlier = earlierProposals(records, assembly);
  if (!assembly.possibleRerunNeeded && !sent && earlier.length === 0) return null;
  const unresolved = assembly.connectors.filter((connector) => connector.invalidated).length;
  const sentId = sent?.id ?? null;
  return (
    <>
      {assembly.possibleRerunNeeded ? <p className="site-note">Possible rerun needed.{unresolved > 0 ? ` ${unresolved} connector${unresolved === 1 ? "" : "s"} unresolved.` : ""}</p> : null}
      {sentId ? <p className="site-note">Sent to Skill 4 as {sentId}. That rerun record stays linked to this proposal, and {assembly.assemblyId} is unchanged.</p> : null}
      {!sentId && assembly.rerunDecision === "keep" ? <p className="site-note">Kept in Skill 5. The proposed geometry stays here, and the Skill 4 source is unchanged.</p> : null}
      {earlier.length > 0 ? <p className="site-note">{earlier.map((entry) => entry.id).join(", ")} remains in Skill 4 for an earlier proposal. Nothing was deleted.</p> : null}
      {sentId ? null : (
        <div className="site-modes">
          {assembly.possibleRerunNeeded ? <button type="button" onClick={onKeep}>Keep in Skill 5</button> : null}
          {assembly.possibleRerunNeeded ? <button type="button" onClick={onSend}>Send to Skill 4</button> : null}
        </div>
      )}
    </>
  );
}

export function SiteWorkspace() {
  const [mode, setMode] = useState<SiteViewMode>("perspective");
  const [planHeading, setPlanHeading] = useState<"north" | "east">("north");
  const [showGrid, setShowGrid] = useState(true);
  const [showAerial] = useState(false);
  const [fit] = useState<SiteFit>("site");
  const [rotateView] = useState(false);
  const [frameToken] = useState(0);
  const [readout, setReadout] = useState<SiteReadout>({ northDeg: 0, scaleFeet: 100, scalePx: 96 });
  const [snap, setSnap] = useState(true);
  const [showEnvelope] = useState(false);
  const [tool] = useState<"move" | "rotate" | "entrance" | "circulation">("move");
  const [armedId, setArmedId] = useState<string | null>(null);
  const [meshes, setMeshes] = useState<Record<string, IsoMesh | "missing">>({});
  const [, setLoadingId] = useState<string | null>(null);
  const [instances, setInstances] = useState<PlacedModule[]>([]);
  const [assemblies, setAssemblies] = useState<SiteAssembly[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberEditId, setMemberEditId] = useState<string | null>(null);
  const storedCatalog = useSyncExternalStore(subscribeCatalog, readCatalog, catalogServerSnapshot);
  const catalog = useMemo(() => siteLibraryEntries(storedCatalog), [storedCatalog]);
  const [assemblyPage, setAssemblyPage] = useState(0);
  const assemblyPageCount = Math.max(1, Math.ceil(catalog.length / ASSEMBLY_PAGE_SIZE));
  const assemblyPageIndex = Math.min(assemblyPage, assemblyPageCount - 1);
  const assemblyPageEntries = catalog.slice(assemblyPageIndex * ASSEMBLY_PAGE_SIZE, assemblyPageIndex * ASSEMBLY_PAGE_SIZE + ASSEMBLY_PAGE_SIZE);
  const [armedAssemblyId, setArmedAssemblyId] = useState<string | null>(null);
  const display = "original" as const;
  const [exploded] = useState(false);
  const [configurations, setConfigurations] = useState<SiteConfiguration[]>([]);
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  const [configName, setConfigName] = useState("Untitled");
  const [annotations, setAnnotations] = useState<SiteAnnotation[]>([]);
  const historyRef = useRef(emptyEditHistory());
  const [history, setHistory] = useState(emptyEditHistory);
  const publish = useCallback((next: ReturnType<typeof emptyEditHistory>) => {
    const assemblies = reconcileSentAssemblies(next.present.assemblies, readCatalog());
    const resolved = assemblies === next.present.assemblies ? next : { ...next, present: { ...next.present, assemblies } };
    historyRef.current = resolved;
    setHistory(resolved);
    setInstances(resolved.present.instances);
    setAssemblies(resolved.present.assemblies);
    setAnnotations(resolved.present.annotations);
  }, []);
  const commit = useCallback((recipe: (present: CompositionSnapshot) => CompositionSnapshot) => {
    publish(rememberEdit(historyRef.current, recipe(historyRef.current.present)));
  }, [publish]);
  const startGesture = useCallback(() => {
    publish(beginGesture(historyRef.current));
  }, [publish]);
  const finishGesture = useCallback(() => {
    publish(endGesture(historyRef.current));
  }, [publish]);
  const [circulationStart, setCirculationStart] = useState<{ x: number; z: number; attachment: SiteAnnotation["attachment"]; assemblyPlacementId: string | null } | null>(null);
  const [attachToAssembly] = useState(false);
  const [priorities, setPriorities] = useState<ComparisonPriority[]>([]);
  const [showShore] = useState(false);
  const [showMacarthur] = useState(false);
  const [showHighway] = useState(false);
  const [showStreets] = useState(false);
  const [showDistances] = useState(false);
  const applyHistory = (next: ReturnType<typeof emptyEditHistory>) => {
    publish(next);
    const snapshot = next.present;
    setCirculationStart(null);
    setSelectedId((current) => {
      if (!current) return current;
      const alive = snapshot.instances.some((item) => item.instanceId === current)
        || snapshot.annotations.some((item) => item.id === current)
        || snapshot.assemblies.some((assembly) => assembly.placementId === current || assembly.members.some((member) => member.instanceId === current));
      return alive ? current : null;
    });
    setMemberEditId((current) => current && snapshot.assemblies.some((assembly) => assembly.placementId === current) ? current : null);
  };
  const undo = () => {
    const next = undoEdit(historyRef.current);
    if (!next) return;
    applyHistory(next);
  };
  const redo = () => {
    const next = redoEdit(historyRef.current);
    if (!next) return;
    applyHistory(next);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          undo();
        } else if ((key === "z" && event.shiftKey) || key === "y") {
          event.preventDefault();
          redo();
        }
        return;
      }
      if (event.altKey || event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      deleteModule();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const serial = useRef(1);
  const assemblySerial = useRef(1);
  const noteSerial = useRef(1);
  const loadAbort = useRef(new Map<string, AbortController>());
  const onReadout = useCallback((next: SiteReadout) => setReadout(next), []);
  const armed = SITE_ARCHETYPES.find((entry) => entry.archetypeId === armedId) ?? null;
  const selectedAssembly = assemblies.find((assembly) => assembly.placementId === selectedId) ?? null;
  const memberHost = assemblies.find((assembly) => assembly.members.some((member) => member.instanceId === selectedId)) ?? null;
  const selectedMember = memberHost?.members.find((member) => member.instanceId === selectedId) ?? null;
  const selectedMemberWorld = memberHost && selectedMember ? assemblyWorldModules(memberHost).find((member) => member.instanceId === selectedMember.instanceId) ?? null : null;
  const selected = instances.find((entry) => entry.instanceId === selectedId) ?? null;
  const visibleAssemblies = useMemo(() => assemblies.flatMap((assembly) => assemblyWorldModules(assembly)), [assemblies]);
  const sceneInstances = useMemo(() => [...instances, ...visibleAssemblies], [instances, visibleAssemblies]);
  const warnings = useMemo(() => placementWarnings(sceneInstances, site.site.ring), [sceneInstances]);
  const displayShift = useMemo(() => {
    if (!exploded) return {};
    return Object.assign({}, ...assemblies.map((assembly) => explodeShifts(assembly, 14)));
  }, [assemblies, exploded]);
  const links = useMemo(() => assemblies.flatMap((assembly) => assembly.connectors.flatMap((connector) => {
    const a = assembly.members.find((member) => member.tileId === connector.tileAId);
    const b = assembly.members.find((member) => member.tileId === connector.tileBId);
    if (!a || !b) return [];
    const worldA = assemblyWorldModules({ ...assembly, members: [a] })[0];
    const worldB = assemblyWorldModules({ ...assembly, members: [b] })[0];
    if (!worldA || !worldB) return [];
    const shiftA = displayShift[a.instanceId] ?? { x: 0, z: 0 };
    const shiftB = displayShift[b.instanceId] ?? { x: 0, z: 0 };
    return [{
      id: `${assembly.placementId}-${connector.id}`,
      ax: worldA.transform.position.x + shiftA.x,
      az: worldA.transform.position.z + shiftA.z,
      bx: worldB.transform.position.x + shiftB.x,
      bz: worldB.transform.position.z + shiftB.z,
    }];
  })), [assemblies, displayShift]);
  const loadedMeshes = useMemo(() => {
    const next: Record<string, IsoMesh> = {};
    for (const [id, mesh] of Object.entries(meshes)) {
      if (mesh !== "missing") next[id] = mesh;
    }
    return next;
  }, [meshes]);
  const noteGeometry = useCallback((moduleId: string, state: "available" | "unavailable") => {
    const present = historyRef.current.present;
    const next = {
      instances: present.instances.map((item) => item.provenance.moduleId === moduleId ? { ...item, geometryState: state } : item),
      assemblies: present.assemblies.map((assembly) => ({
        ...assembly,
        members: assembly.members.map((member) => member.provenance.moduleId === moduleId ? { ...member, geometryState: state } : member),
      })),
      annotations: present.annotations,
    };
    publish(adoptPresent(historyRef.current, next));
  }, [publish]);
  const requestMesh = useCallback((entry: { archetypeId: string; candidateId: number; continuationId: string; moduleId: string }) => {
    if (meshes[entry.moduleId] && meshes[entry.moduleId] !== "missing") {
      noteGeometry(entry.moduleId, "available");
      return;
    }
    if (loadAbort.current.has(entry.moduleId)) return;
    const controller = new AbortController();
    loadAbort.current.set(entry.moduleId, controller);
    setLoadingId(entry.moduleId);
    loadArchetypeMesh(entry, controller.signal).then((mesh) => {
      loadAbort.current.delete(entry.moduleId);
      if (controller.signal.aborted) return;
      setMeshes((current) => ({ ...current, [entry.moduleId]: mesh ?? "missing" }));
      noteGeometry(entry.moduleId, mesh ? "available" : "unavailable");
      setLoadingId((current) => current === entry.moduleId ? null : current);
    }).catch(() => {
      loadAbort.current.delete(entry.moduleId);
      if (controller.signal.aborted) return;
      setMeshes((current) => ({ ...current, [entry.moduleId]: "missing" }));
      noteGeometry(entry.moduleId, "unavailable");
      setLoadingId((current) => current === entry.moduleId ? null : current);
    });
  }, [meshes, noteGeometry]);
  const preloadMesh = useCallback((entry: { archetypeId: string; candidateId: number; continuationId: string; moduleId: string }) => {
    if (meshes[entry.moduleId] || loadAbort.current.has(entry.moduleId)) return;
    const controller = new AbortController();
    loadAbort.current.set(entry.moduleId, controller);
    loadArchetypeMesh(entry, controller.signal).then((mesh) => {
      loadAbort.current.delete(entry.moduleId);
      if (controller.signal.aborted) return;
      setMeshes((current) => ({ ...current, [entry.moduleId]: mesh ?? "missing" }));
      noteGeometry(entry.moduleId, mesh ? "available" : "unavailable");
    }).catch(() => {
      loadAbort.current.delete(entry.moduleId);
      if (controller.signal.aborted) return;
      setMeshes((current) => ({ ...current, [entry.moduleId]: "missing" }));
      noteGeometry(entry.moduleId, "unavailable");
    });
  }, [meshes, noteGeometry]);
  useEffect(() => {
    for (const entry of SITE_ARCHETYPES) preloadMesh(entry);
  }, [preloadMesh]);
  const placeModule = useCallback((x: number, z: number) => {
    if (memberEditId && armedId && !armedAssemblyId) {
      const source = SITE_ARCHETYPES.find((entry) => entry.archetypeId === armedId);
      const host = assemblies.find((assembly) => assembly.placementId === memberEditId);
      if (!source || !host) return;
      const stored = meshes[source.moduleId];
      const tileId = `add${serial.current}`;
      serial.current += 1;
      const local = worldToAssemblyLocal({
        x: host.transform.position.x,
        z: host.transform.position.z,
        rotationY: host.transform.rotationY,
      }, { x, z, rotationY: 0 });
      const member = {
        instanceId: `${host.placementId}-${tileId}`,
        tileId,
        name: source.name,
        status: source.status,
        geometryState: stored && stored !== "missing" ? "available" as const : "pending" as const,
        program: source.program ?? "unassigned" as const,
        programSource: "suggested" as const,
        provenance: {
          moduleId: source.moduleId,
          archetypeId: source.archetypeId,
          source: "skill3" as const,
          candidateId: source.candidateId,
          continuationId: source.continuationId,
        },
        catalogModuleId: source.moduleId,
        meshModuleId: source.moduleId,
        local: { x: local.x, y: 0, z: local.z, rotationY: local.rotationY },
        mirror: null,
      };
      commit((present) => ({
        ...present,
        assemblies: present.assemblies.map((assembly) => assembly.placementId === host.placementId ? reviseAssemblyMembers(assembly, [...assembly.members, member]) : assembly),
      }));
      setSelectedId(member.instanceId);
      if (!stored || stored === "missing") requestMesh(source);
      return;
    }
    if (armedAssemblyId) {
      const entry = catalog.find((item) => item.id === armedAssemblyId);
      if (!entry) return;
      const placementId = `p${assemblySerial.current}`;
      assemblySerial.current += 1;
      const imported = importAssembly(entry, { x, z }, placementId);
      commit((present) => ({ ...present, assemblies: [...present.assemblies, imported] }));
      setSelectedId(placementId);
      for (const member of imported.members) {
        const ref = referenceForModule(member.provenance.moduleId, member.provenance.archetypeId, member.provenance.candidateId, member.provenance.continuationId);
        if (ref) requestMesh(ref);
      }
      return;
    }
    const source = SITE_ARCHETYPES.find((entry) => entry.archetypeId === armedId);
    if (!source) return;
    const stored = meshes[source.moduleId];
    const instanceId = `m${serial.current}`;
    serial.current += 1;
    const instance: PlacedModule = {
      instanceId,
      kind: "archetype",
      name: source.name,
      status: source.status,
      geometryState: stored && stored !== "missing" ? "available" : "pending",
      program: source.program ?? "unassigned",
      programSource: "suggested",
      provenance: {
        moduleId: source.moduleId,
        archetypeId: source.archetypeId,
        source: "skill3",
        candidateId: source.candidateId,
        continuationId: source.continuationId,
      },
      transform: {
        position: { x, y: MODULE_GROUND_Y, z },
        rotationY: 0,
      },
    };
    commit((present) => ({ ...present, instances: [...present.instances, instance] }));
    setSelectedId(instanceId);
    if (!stored || stored === "missing") requestMesh(source);
  }, [armedAssemblyId, armedId, assemblies, catalog, commit, memberEditId, meshes, requestMesh]);
  const translateModule = useCallback((id: string, x: number, z: number) => {
    commit((present) => {
      const note = present.annotations.find((item) => item.id === id);
      if (note) {
        return {
          ...present,
          annotations: present.annotations.map((item) => {
            if (item.id !== id) return item;
            if (item.attachment === "assembly") {
              const host = present.assemblies.find((assembly) => assembly.placementId === item.assemblyPlacementId);
              if (!host) return item;
              return { ...item, position: localOnAssembly({ x, z }, host) };
            }
            return { ...item, position: { x, z } };
          }),
        };
      }
      const host = present.assemblies.find((assembly) => assembly.members.some((member) => member.instanceId === id));
      if (host) {
        if (memberEditId === host.placementId) {
          const local = worldToAssemblyLocal({
            x: host.transform.position.x,
            z: host.transform.position.z,
            rotationY: host.transform.rotationY,
          }, { x, z, rotationY: 0 });
          return {
            ...present,
            assemblies: present.assemblies.map((assembly) => assembly.placementId === host.placementId ? reviseAssemblyMembers(assembly, assembly.members.map((member) => member.instanceId === id ? {
              ...member,
              local: { ...member.local, x: local.x, z: local.z },
            } : member)) : assembly),
          };
        }
        const world = assemblyWorldModules(host).find((member) => member.instanceId === id);
        if (!world) return present;
        const dx = x - world.transform.position.x;
        const dz = z - world.transform.position.z;
        return {
          ...present,
          assemblies: present.assemblies.map((assembly) => assembly.placementId === host.placementId ? {
            ...assembly,
            transform: {
              ...assembly.transform,
              position: { ...assembly.transform.position, x: assembly.transform.position.x + dx, z: assembly.transform.position.z + dz },
            },
          } : assembly),
        };
      }
      return {
        ...present,
        instances: present.instances.map((instance) => instance.instanceId === id ? {
          ...instance,
          transform: { ...instance.transform, position: { x, y: MODULE_GROUND_Y, z } },
        } : instance),
      };
    });
  }, [commit, memberEditId]);
  const rotateModule = useCallback((id: string, rotationY: number) => {
    commit((present) => {
      const host = present.assemblies.find((assembly) => assembly.members.some((member) => member.instanceId === id));
      if (host) {
        const member = host.members.find((item) => item.instanceId === id);
        if (!member) return present;
        if (memberEditId === host.placementId) {
          const localYaw = rotationY - host.transform.rotationY;
          return {
            ...present,
            assemblies: present.assemblies.map((assembly) => assembly.placementId === host.placementId ? reviseAssemblyMembers(assembly, assembly.members.map((item) => item.instanceId === id ? {
              ...item,
              local: { ...item.local, rotationY: localYaw },
            } : item)) : assembly),
          };
        }
        return {
          ...present,
          assemblies: present.assemblies.map((assembly) => assembly.placementId === host.placementId ? {
            ...assembly,
            transform: { ...assembly.transform, rotationY: rotationY - member.local.rotationY },
          } : assembly),
        };
      }
      return {
        ...present,
        instances: present.instances.map((instance) => instance.instanceId === id ? {
          ...instance,
          transform: { ...instance.transform, rotationY },
        } : instance),
      };
    });
  }, [commit, memberEditId]);
  const chooseSelection = useCallback((id: string | null) => {
    if (!id) {
      setSelectedId(null);
      return;
    }
    if (annotations.some((item) => item.id === id)) {
      setSelectedId(id);
      return;
    }
    const host = assemblies.find((assembly) => assembly.placementId === id || assembly.members.some((member) => member.instanceId === id));
    if (host && memberEditId === host.placementId && host.members.some((member) => member.instanceId === id)) {
      setSelectedId(id);
      return;
    }
    if (memberEditId && host?.placementId !== memberEditId) setMemberEditId(null);
    setSelectedId(host ? host.placementId : id);
  }, [annotations, assemblies, memberEditId]);
  const duplicateModule = () => {
    if (selectedAssembly) {
      const placementId = `p${assemblySerial.current}`;
      assemblySerial.current += 1;
      const copy = structuredClone(selectedAssembly);
      copy.placementId = placementId;
      copy.members = copy.members.map((member) => ({ ...member, instanceId: `${placementId}-${member.tileId}` }));
      copy.transform = {
        ...copy.transform,
        position: { ...copy.transform.position, x: copy.transform.position.x + SKILL5_MODULE_ENVELOPE_FEET },
      };
      commit((present) => ({ ...present, assemblies: [...present.assemblies, copy] }));
      setSelectedId(placementId);
      return;
    }
    if (!selected) return;
    const instanceId = `m${serial.current}`;
    serial.current += 1;
    const parked = clearOfNeighbors(
      selected.transform.position.x + SKILL5_MODULE_ENVELOPE_FEET,
      selected.transform.position.z,
      selected.transform.rotationY,
      selected.mirror,
      occupiedBounds(sceneInstances),
    );
    const copy = {
      ...selected,
      instanceId,
      transform: {
        rotationY: selected.transform.rotationY,
        position: {
          x: parked.x,
          y: MODULE_GROUND_Y,
          z: parked.z,
        },
      },
    };
    commit((present) => ({ ...present, instances: [...present.instances, copy] }));
    setSelectedId(instanceId);
  };
  const deleteModule = () => {
    if (!selectedId) return;
    if (annotations.some((item) => item.id === selectedId)) {
      commit((present) => ({ ...present, annotations: present.annotations.filter((item) => item.id !== selectedId) }));
      setSelectedId(null);
      return;
    }
    if (memberHost && memberEditId === memberHost.placementId && selectedMember) {
      commit((present) => ({
        ...present,
        assemblies: present.assemblies.map((assembly) => assembly.placementId === memberHost.placementId ? reviseAssemblyMembers(assembly, assembly.members.filter((member) => member.instanceId !== selectedMember.instanceId)) : assembly),
      }));
      setSelectedId(memberHost.placementId);
      return;
    }
    if (selectedAssembly) {
      commit((present) => ({
        ...present,
        assemblies: present.assemblies.filter((assembly) => assembly.placementId !== selectedId),
        annotations: present.annotations.filter((item) => item.assemblyPlacementId !== selectedId),
      }));
      if (memberEditId === selectedAssembly.placementId) setMemberEditId(null);
      setSelectedId(null);
      return;
    }
    commit((present) => ({ ...present, instances: present.instances.filter((instance) => instance.instanceId !== selectedId) }));
    setSelectedId(null);
  };
  const armModule = (entry: SiteArchetype) => {
    if (armedId === entry.archetypeId) {
      setArmedId(null);
      return;
    }
    setArmedAssemblyId(null);
    setArmedId(entry.archetypeId);
    requestMesh(entry);
  };
  const armAssembly = (entry: CatalogEntry) => {
    if (armedAssemblyId === entry.id) {
      setArmedAssemblyId(null);
      return;
    }
    setArmedId(null);
    setArmedAssemblyId(entry.id);
    for (const tile of entry.tiles) {
      const archetype = SITE_ARCHETYPES.find((item) => item.archetypeId === tile.archetypeId);
      if (archetype && archetype.moduleId === tile.moduleId) requestMesh(archetype);
    }
  };
  const writeConfigurations = async (next: SiteConfiguration[], nextPriorities = priorities) => {
    setConfigurations(next);
    setPriorities(nextPriorities);
    const response = await fetch("/api/site/configurations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract: CONFIGURATION_CONTRACT, siteId: SKILL5_SITE_ID, configurations: next, priorities: nextPriorities }),
    });
    if (!response.ok) return;
    const body = await response.json() as ConfigurationDocument;
    setConfigurations(body.configurations);
    setPriorities(body.priorities ?? []);
  };
  const sendProposal = (assembly: SiteAssembly) => {
    const existing = findSentProposal(readCatalog(), assembly);
    const id = existing?.id ?? nextCatalogId(readCatalog());
    if (!existing) {
      try {
        writeCatalog([proposalCatalogEntry(assembly, id, currentConfigId), ...readCatalog()]);
      } catch {
        return;
      }
    }
    publish(adoptPresent(historyRef.current, {
      ...historyRef.current.present,
      assemblies: historyRef.current.present.assemblies.map((item) => item.placementId === assembly.placementId ? markAssemblySent(item, id) : item),
    }));
  };
  const saveConfiguration = (asNew: boolean) => {
    const now = new Date().toISOString();
    const name = configName.trim() || "Untitled";
    if (!asNew && currentConfigId) {
      void writeConfigurations(configurations.map((entry) => entry.id === currentConfigId ? {
        ...entry,
        name,
        updatedAt: now,
        modules: structuredClone(instances),
        assemblies: structuredClone(assemblies),
        annotations: structuredClone(annotations),
      } : entry));
      return;
    }
    const id = nextConfigurationId(configurations);
    const created: SiteConfiguration = {
      id,
      name,
      parentConfigurationId: currentConfigId,
      createdAt: now,
      updatedAt: now,
      modules: structuredClone(instances),
      assemblies: structuredClone(assemblies),
      annotations: structuredClone(annotations),
    };
    setCurrentConfigId(id);
    setConfigName(name);
    void writeConfigurations([...configurations, created]);
  };
  const openConfiguration = (entry: SiteConfiguration) => {
    const nextModules = structuredClone(entry.modules);
    const nextAssemblies = structuredClone(entry.assemblies);
    const nextNotes = structuredClone(entry.annotations ?? []);
    publish(emptyEditHistory({ instances: nextModules, assemblies: nextAssemblies, annotations: nextNotes }));
    setCirculationStart(null);
    setSelectedId(null);
    setMemberEditId(null);
    setCurrentConfigId(entry.id);
    setConfigName(entry.name);
    for (const item of nextModules) {
      const match = /^m(\d+)$/.exec(item.instanceId);
      if (match) serial.current = Math.max(serial.current, Number(match[1]) + 1);
      const ref = referenceForModule(item.provenance.moduleId, item.provenance.archetypeId, item.provenance.candidateId, item.provenance.continuationId);
      if (ref) requestMesh(ref);
    }
    for (const assembly of nextAssemblies) {
      const match = /^p(\d+)$/.exec(assembly.placementId);
      if (match) assemblySerial.current = Math.max(assemblySerial.current, Number(match[1]) + 1);
      for (const member of assembly.members) {
        const ref = referenceForModule(member.provenance.moduleId, member.provenance.archetypeId, member.provenance.candidateId, member.provenance.continuationId);
        if (ref) requestMesh(ref);
      }
    }
    for (const note of nextNotes) {
      const match = /^n(\d+)$/.exec(note.id);
      if (match) noteSerial.current = Math.max(noteSerial.current, Number(match[1]) + 1);
    }
  };
  const openLatest = useRef<(entry: SiteConfiguration) => void>(() => {});
  useEffect(() => {
    openLatest.current = openConfiguration;
  });
  useEffect(() => {
    let cancel = false;
    fetch("/api/site/configurations").then((response) => response.json()).then((body: ConfigurationDocument) => {
      if (cancel) return;
      const list = body.configurations ?? [];
      setConfigurations(list);
      setPriorities(body.priorities ?? []);
      const id = new URLSearchParams(window.location.search).get("open");
      const entry = id ? list.find((item) => item.id === id) : undefined;
      if (entry) openLatest.current(entry);
    }).catch(() => {
      if (!cancel) setConfigurations([]);
    });
    return () => {
      cancel = true;
    };
  }, []);
  const duplicateConfiguration = (entry: SiteConfiguration) => {
    const now = new Date().toISOString();
    const id = nextConfigurationId(configurations);
    const copy: SiteConfiguration = {
      ...structuredClone(entry),
      id,
      name: `${entry.name} copy`,
      parentConfigurationId: entry.id,
      createdAt: now,
      updatedAt: now,
    };
    setConfigName(copy.name);
    void writeConfigurations([...configurations, copy]);
  };
  const armedAssembly = catalog.find((entry) => entry.id === armedAssemblyId) ?? null;
  const previewAssembly = armedAssembly ? importAssembly(armedAssembly, { x: 0, z: 0 }, "preview") : null;
  const previewParts = previewAssembly ? previewAssembly.members.flatMap((member) => member.meshModuleId ? [{
    moduleId: member.meshModuleId,
    x: member.local.x,
    y: member.local.y,
    z: member.local.z,
    rotationY: member.local.rotationY,
  }] : []) : null;
  const previewBridge = previewAssembly ? localDemonstrationBridge(previewAssembly) : null;
  const demonstration = useMemo(() => assemblies.flatMap((assembly) => {
    const cloud = localDemonstrationBridge(assembly);
    if (!cloud) return [];
    const group = { x: assembly.transform.position.x, z: assembly.transform.position.z, rotationY: assembly.transform.rotationY };
    return [{ placementId: assembly.placementId, ...group, cloud, world: worldSourceBridge(cloud, group) }];
  }), [assemblies]);
  const configurationBridges = useMemo(() => demonstration.map((item) => item.world), [demonstration]);
  const selectedAssemblyBridges = useMemo(() => demonstration.flatMap((item) => item.placementId === selectedAssembly?.placementId ? [item.world] : []), [demonstration, selectedAssembly]);
  const selectedNote = annotations.find((item) => item.id === selectedId) ?? null;
  const drawnNotes = useMemo(() => worldAnnotations(annotations, assemblies), [annotations, assemblies]);
  const savedConfiguration = configurations.find((entry) => entry.id === currentConfigId) ?? null;
  const unsavedChanges = useMemo(() => {
    if (!savedConfiguration) return instances.length > 0 || assemblies.length > 0 || annotations.length > 0;
    return configName !== savedConfiguration.name
      || JSON.stringify(instances) !== JSON.stringify(savedConfiguration.modules)
      || JSON.stringify(assemblies) !== JSON.stringify(savedConfiguration.assemblies)
      || JSON.stringify(annotations) !== JSON.stringify(savedConfiguration.annotations ?? []);
  }, [annotations, assemblies, configName, instances, savedConfiguration]);
  const placed = useMemo(() => scenePlaced(instances, assemblies), [instances, assemblies]);
  const distribution = useMemo(() => programDistribution(placed), [placed]);
  const occupiedSqFt = useMemo(() => nominalUnionSqFt(placed, site.site.ring), [placed]);
  const designShare = designSite.areaSqFt > 0 ? occupiedSqFt / designSite.areaSqFt * 100 : 0;
  const spatial = useMemo(() => measureSite(placed, annotations, assemblies, site), [placed, annotations, assemblies]);
  const leaders = useMemo(() => {
    if (!showDistances) return [];
    const records = [
      ...(showShore ? spatial.bay.records.map((record) => ({ source: "bay", record })) : []),
      ...(showMacarthur ? spatial.macarthur.records.map((record) => ({ source: "macarthur", record })) : []),
      ...(showHighway ? spatial.highway.records.map((record) => ({ source: "highway", record })) : []),
      ...(showStreets ? [...spatial.urban.records, ...spatial.entranceAccess.records].map((record) => ({ source: "street", record })) : []),
    ];
    const memberIds = new Set(selectedAssembly?.members.map((member) => member.instanceId) ?? []);
    return records.filter((item) => item.record.id === selectedId || memberIds.has(item.record.id)).map((item) => ({
      id: `${item.source}-${item.record.id}-${item.record.to.x}-${item.record.to.z}`,
      ax: item.record.from.x,
      az: item.record.from.z,
      bx: item.record.to.x,
      bz: item.record.to.z,
    }));
  }, [selectedAssembly, selectedId, showDistances, showHighway, showMacarthur, showShore, showStreets, spatial]);
  const connectorCount = assemblies.reduce((sum, assembly) => sum + assembly.connectors.length, 0);
  const availableConnectors = assemblies.reduce((sum, assembly) => sum + assembly.connectors.filter((connector) => connector.geometryState === "available").length, 0);
  const annotate = (x: number, z: number) => {
    const host = attachToAssembly ? selectedAssembly : null;
    const attachment = host ? "assembly" as const : "site" as const;
    const point = host ? localOnAssembly({ x, z }, host) : { x, z };
    const assemblyPlacementId = host?.placementId ?? null;
    if (tool === "entrance") {
      const id = `n${noteSerial.current}`;
      noteSerial.current += 1;
      commit((present) => ({ ...present, annotations: [...present.annotations, { id, kind: "entrance", attachment, assemblyPlacementId, label: "Entrance", position: point, end: null }] }));
      setSelectedId(id);
      return;
    }
    if (!circulationStart || circulationStart.attachment !== attachment || circulationStart.assemblyPlacementId !== assemblyPlacementId) {
      setCirculationStart({ x: point.x, z: point.z, attachment, assemblyPlacementId });
      return;
    }
    const id = `n${noteSerial.current}`;
    noteSerial.current += 1;
    const note = {
      id,
      kind: "circulation" as const,
      attachment,
      assemblyPlacementId,
      label: "Circulation",
      position: { x: circulationStart.x, z: circulationStart.z },
      end: point,
    };
    commit((present) => ({ ...present, annotations: [...present.annotations, note] }));
    setCirculationStart(null);
    setSelectedId(id);
  };
  const chooseMode = (next: SiteViewMode) => {
    setMode(next);
  };
  void duplicateModule;
  void duplicateConfiguration;

  return (
    <main className="site-view">
      <aside className="site-panel site-panel-library" aria-label="Library and project">
            <section className="site-block">
              <h2 className="site-subtitle">Geometry Library</h2>
              <h3 className="site-subtitle">Assemblies</h3>
              {catalog.length === 0 ? <p className="site-note">No assemblies are selected in Hybrid Connection. Select one there to import it here.</p> : (
                <>
                  <div className="site-gallery site-gallery-assemblies">
                    {assemblyPageEntries.map((entry) => (
                      <button key={entry.id} type="button" data-active={armedAssemblyId === entry.id || undefined} onClick={() => armAssembly(entry)}>
                        <AssemblyThumb entry={entry} meshes={meshes} />
                        <span>{entry.id}</span>
                      </button>
                    ))}
                  </div>
                  {catalog.length > ASSEMBLY_PAGE_SIZE ? (
                    <div className="site-pages" aria-label="Assembly pages">
                      <button type="button" disabled={assemblyPageIndex === 0} onClick={() => setAssemblyPage(assemblyPageIndex - 1)}>Previous</button>
                      <span>{assemblyPageIndex + 1} / {assemblyPageCount}</span>
                      <button type="button" disabled={assemblyPageIndex >= assemblyPageCount - 1} onClick={() => setAssemblyPage(assemblyPageIndex + 1)}>Next</button>
                    </div>
                  ) : null}
                </>
              )}
              <h3 className="site-subtitle">Modules</h3>
              <div className="site-module-rows">
              {SITE_PROGRAMS.map((program) => {
                const entries = SITE_ARCHETYPES.filter((entry) => entry.program === program);
                if (entries.length === 0) return null;
                return (
                  <div key={program}>
                    <h4 className="site-gallery-label">{PROGRAM_LABEL[program]}</h4>
                    <div className="site-gallery site-gallery-modules">
                      {entries.map((entry) => {
                        const stored = meshes[entry.moduleId];
                        const missing = stored === "missing";
                        return (
                          <button
                            key={entry.moduleId}
                            type="button"
                            data-active={armedId === entry.archetypeId || undefined}
                            onClick={() => armModule(entry)}
                          >
                            <ModuleThumb mesh={stored} />
                            <span>{entry.name}</span>
                            {missing ? <em>Unavailable</em> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              </div>
              {armed && meshes[armed.moduleId] === "missing" ? (
                <p className="site-note site-alert">This mesh is not stored. Another archetype is not substituted.</p>
              ) : null}
            </section>

      </aside>
      <section className="site-stage" aria-label="Current configuration">
        <div className="site-frame">
          <header className="site-frame-bar">
            <div className="site-frame-name">
              <h2 className="site-subtitle">Current configuration</h2>
              <input aria-label="Configuration name" value={configName} onChange={(event) => setConfigName(event.target.value)} />
              {unsavedChanges ? <span className="site-pending">Unsaved</span> : null}
              <div className="site-modes">
                <button type="button" onClick={() => saveConfiguration(false)}>Save</button>
              </div>
            </div>
            <div className="site-modes site-frame-tools">
              <button type="button" aria-pressed={snap} data-active={snap || undefined} onClick={() => setSnap((value) => !value)}>Snap</button>
              <button type="button" aria-pressed={showGrid} data-active={showGrid || undefined} onClick={() => setShowGrid((value) => !value)}>Grid</button>
              <button type="button" disabled={history.undo.length === 0} onClick={undo}>Undo</button>
              <button type="button" disabled={history.redo.length === 0} onClick={redo}>Redo</button>
            </div>
          </header>
          <div className="site-viewport">
            <SiteViewport
              context={site}
              mode={mode}
              planHeading={planHeading}
              fit={fit}
              rotateView={rotateView}
              showGrid={showGrid}
              showAerial={showAerial}
              frameToken={frameToken}
              onReadout={onReadout}
              overlay={{
                shore: showShore,
                macarthur: showMacarthur,
                highway: showHighway,
                streets: showStreets,
                distances: showDistances,
                shorePath: spatial.shorePath,
                macarthurPaths: spatial.macarthurPaths,
                highwayPaths: spatial.highwayPaths,
                streetPaths: spatial.streetPaths,
                leaders,
              }}
              placement={{
                ring: designSite.ring,
                armedModuleId: armed ? armed.moduleId : armedAssembly ? "assembly" : null,
                canPlace: Boolean(armed || armedAssembly),
                meshes: loadedMeshes,
                instances: sceneInstances,
                selectedId,
                snap,
                showEnvelope,
                display,
                displayShift,
                links,
                previewParts,
                previewBridge,
                demonstration,
                tool,
                warnings,
                annotations: drawnNotes,
                onPlace: placeModule,
                onAnnotate: annotate,
                onSelect: chooseSelection,
                onTranslate: translateModule,
                onRotate: rotateModule,
                onGestureStart: startGesture,
                onGestureEnd: finishGesture,
                memberEditId,
                viewMode: mode,
              }}
            />
            <div className="site-orient">
              <button
                type="button"
                className="site-north"
                data-active={mode === "plan" || undefined}
                style={{ transform: `rotate(${readout.northDeg}deg)` }}
                aria-label={mode === "plan" ? (planHeading === "north" ? "North up. Click for east up." : "East up. Click for north up.") : "Geographic north, marked N"}
                onClick={() => {
                  if (mode === "plan") setPlanHeading((heading) => heading === "north" ? "east" : "north");
                }}
              >
                <svg viewBox="0 0 48 64" aria-hidden="true">
                  <path d="M24 2 L34 30 H27 V60 H21 V30 H14 Z" />
                </svg>
                <span>N</span>
              </button>
              <div className="site-scale" aria-label={`${readout.scaleFeet} foot scale`}>
                <span style={{ width: `${Math.max(36, readout.scalePx)}px` }} />
                <p>{readout.scaleFeet.toLocaleString("en-US")} ft</p>
              </div>
            </div>
            <div className="site-modes site-frame-views" role="group" aria-label="Camera">
              {MODES.map((item) => (
                <button key={item.id} type="button" data-active={mode === item.id || undefined} onClick={() => chooseMode(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="site-help">
          {mode === "plan"
            ? "Plan starts north-up. Click the north arrow to switch between north-up and east-up. Right-drag pans. Ctrl+Shift+right turns the plan. Ctrl+right or the wheel zooms."
            : mode === "axon"
              ? "Parallel view. Right-drag pans. Ctrl+Shift+right turns it. Ctrl+right or the wheel zooms."
              : "Right-drag orbits. Shift+right pans. Ctrl+right or the wheel zooms."}
          {" "}
          Click a module in the library to add it to the site. Left-click selects a placed module. Left-drag {tool === "rotate" ? "turns the selection about vertical." : "moves the selection on the site."}
        </p>
      </section>
    
      <aside className="site-panel site-panel-analysis">
            <section className="site-block site-specs">
              <h2 className="site-subtitle">Live Analysis</h2>
              <h3 className="site-subtitle">Module count</h3>
              <div className="site-count-row">
                <div className="site-stat">
                  <span>Original modules</span>
                  <strong>{placed.length}</strong>
                </div>
                <div className="site-stat">
                  <span>Connectors</span>
                  <strong>{connectorCount}</strong>
                </div>
                <div className="site-stat">
                  <span>Total</span>
                  <strong>{placed.length + connectorCount}</strong>
                </div>
              </div>
              <div className="site-meters" aria-label="Program distribution">
                {(["workspace", "lobby", "gathering"] as const).map((program) => {
                  const count = distribution[program];
                  const share = placed.length > 0 ? count / placed.length * 100 : 0;
                  return (
                    <div key={program} className="site-meter">
                      <span>{PROGRAM_LABEL[program]}</span>
                      <i><b data-program={program} style={{ width: `${share}%` }} /></i>
                      <strong>{count}</strong>
                      <em>{share.toFixed(0)}%</em>
                    </div>
                  );
                })}
                <div className="site-meter">
                  <span>Connectors</span>
                  <i><b data-program="connectors" style={{ width: availableConnectors > 0 ? `${availableConnectors / connectorCount * 100}%` : "0%" }} /></i>
                  <strong>{connectorCount}</strong>
                  <em>{connectorCount === 0 ? "—" : availableConnectors > 0 ? `${Math.round(availableConnectors / connectorCount * 100)}%` : "Pending"}</em>
                </div>
              </div>
              {connectorCount > 0 && availableConnectors === 0 ? <p className="site-note">Connector meshes are pending from Skill 4. No connector percentage is measured.</p> : null}
              <div className="site-coverage-panel">
                <span>Current site configuration coverage</span>
                <i className="site-coverage" aria-hidden="true"><b style={{ width: `${Math.min(100, designShare)}%` }} /></i>
                <div className="site-stat-pair">
                  <div className="site-stat">
                    <span>Design site</span>
                    <strong>{Math.round(designSite.areaSqFt).toLocaleString("en-US")} ft²</strong>
                  </div>
                  <div className="site-stat">
                    <span>Occupied</span>
                    <strong>{Math.round(occupiedSqFt).toLocaleString("en-US")} ft²</strong>
                  </div>
                </div>
                <div className="site-stat-pair">
                  <div className="site-stat">
                    <span>Open</span>
                    <strong>{Math.max(0, Math.round(designSite.areaSqFt - occupiedSqFt)).toLocaleString("en-US")} ft²</strong>
                  </div>
                  <div className="site-stat">
                    <span>Share</span>
                    <strong>{designShare.toFixed(1)}% occupied · {(100 - designShare).toFixed(1)}% open</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="site-block site-specs" aria-label="Selected object">
              <h2 className="site-subtitle">Selected Object</h2>
              {selected ? (
                <div className="site-inspector">
                  <p className="site-identity">{selected.name}</p>
                  <OrthoSet modules={[selected]} meshes={loadedMeshes} caption="Selected" />
                  {warnings[selected.instanceId]?.outside ? (
                    <p className="site-note site-alert">The 20 ft footprint crosses the parcel boundary.</p>
                  ) : null}
                  {warnings[selected.instanceId]?.overlap ? (
                    <p className="site-note site-alert">The 20 ft footprint overlaps another module.</p>
                  ) : null}
                </div>
              ) : selectedAssembly ? (
                <div className="site-inspector">
                  <p className="site-identity">{selectedAssembly.name}</p>
                  <OrthoSet modules={assemblyWorldModules(selectedAssembly)} meshes={loadedMeshes} bridges={selectedAssemblyBridges} caption="Selected assembly" />
                  <AssemblyRerun assembly={selectedAssembly} records={storedCatalog} onKeep={() => commit((present) => ({ ...present, assemblies: present.assemblies.map((item) => item.placementId === selectedAssembly.placementId ? keepAssemblyInSkill5(item) : item) }))} onSend={() => sendProposal(selectedAssembly)} />
                  <div className="site-modes site-tool-row">
                    <button type="button" aria-pressed={memberEditId === selectedAssembly.placementId} data-active={memberEditId === selectedAssembly.placementId || undefined} onClick={() => setMemberEditId((current) => current === selectedAssembly.placementId ? null : selectedAssembly.placementId)}>
                      Edit members
                    </button>
                  </div>
                </div>
              ) : selectedMember && selectedMemberWorld && memberHost ? (
                <div className="site-inspector">
                  <p className="site-identity">{selectedMember.name}</p>
                  <OrthoSet modules={[selectedMemberWorld]} meshes={loadedMeshes} caption="Selected member" />
                  <AssemblyRerun assembly={memberHost} records={storedCatalog} onKeep={() => commit((present) => ({ ...present, assemblies: present.assemblies.map((item) => item.placementId === memberHost.placementId ? keepAssemblyInSkill5(item) : item) }))} onSend={() => sendProposal(memberHost)} />
                  <div className="site-modes">
                    <button type="button" onClick={() => setSelectedId(memberHost.placementId)}>Whole assembly</button>
                  </div>
                </div>
              ) : selectedNote ? (
                <div className="site-inspector">
                  <p className="site-identity">{selectedNote.label}</p>
                  <p className="site-note">{selectedNote.attachment === "assembly" ? `Attached to ${selectedNote.assemblyPlacementId}` : "Fixed on the site"}</p>
                  <div className="site-fields">
                    <label>
                      Label
                      <input value={selectedNote.label} onChange={(event) => { const label = event.target.value; commit((present) => ({ ...present, annotations: present.annotations.map((item) => item.id === selectedNote.id ? { ...item, label } : item) })); }} />
                    </label>
                  </div>
                </div>
              ) : (
                <>
                  <p className="site-note">Select an object.</p>
                  <OrthoSet modules={[]} meshes={loadedMeshes} caption="Selected" />
                </>
              )}
            </section>

            <section className="site-block site-specs" aria-label="Configuration">
              <h2 className="site-subtitle">Configuration</h2>
              {placed.length === 0 ? <p className="site-note">No geometry is placed on the site.</p> : null}
              <OrthoSet modules={placed} meshes={loadedMeshes} bridges={configurationBridges} caption="Configuration" />
            </section>

            <section className="site-block site-specs site-dossier" aria-label="Project specs">
              <h2 className="site-subtitle">Project Specs</h2>
              <div className="site-spec-columns">
                <div className="site-stat">
                  <span>Client</span>
                  <strong>Living Morphologies Studio</strong>
                </div>
                <div className="site-stat">
                  <span>Site dimensions</span>
                  <strong>{designSite.widthFeet.toLocaleString("en-US", { maximumFractionDigits: 0 })} ft × {designSite.depthFeet.toLocaleString("en-US", { maximumFractionDigits: 0 })} ft</strong>
                </div>
                <div className="site-stat">
                  <span>Project</span>
                  <strong>{brief.title}</strong>
                </div>
                <div className="site-stat">
                  <span>Design site area</span>
                  <strong>{Math.round(designSite.areaSqFt).toLocaleString("en-US")} ft²</strong>
                </div>
                <div className="site-stat">
                  <span>Address</span>
                  <strong>{site.site.address}, {site.site.city.toUpperCase()}</strong>
                </div>
                <div className="site-stat">
                  <span>Occupancy</span>
                  <strong className="site-spec-occupancy">
                    <b>
                      <svg viewBox="0 0 24 24" role="img" aria-label="Day">
                        <g fill="currentColor">
                          <circle cx="12" cy="12" r="4" />
                          <rect x="11.15" y="1.2" width="1.7" height="3.3" rx="0.85" />
                          <rect x="11.15" y="19.5" width="1.7" height="3.3" rx="0.85" />
                          <rect x="1.2" y="11.15" width="3.3" height="1.7" rx="0.85" />
                          <rect x="19.5" y="11.15" width="3.3" height="1.7" rx="0.85" />
                          <rect x="11.15" y="1.2" width="1.7" height="3.3" rx="0.85" transform="rotate(45 12 12)" />
                          <rect x="11.15" y="1.2" width="1.7" height="3.3" rx="0.85" transform="rotate(135 12 12)" />
                          <rect x="11.15" y="19.5" width="1.7" height="3.3" rx="0.85" transform="rotate(45 12 12)" />
                          <rect x="11.15" y="19.5" width="1.7" height="3.3" rx="0.85" transform="rotate(135 12 12)" />
                        </g>
                      </svg>
                      {brief.occupancy.daytimeWork}
                    </b>
                    <b>
                      <svg viewBox="0 0 24 24" role="img" aria-label="Evening">
                        <path fill="currentColor" d="M15.2 3.1a7.4 7.4 0 1 0 5.7 12.2A6.1 6.1 0 0 1 15.2 3.1z" />
                      </svg>
                      {brief.occupancy.eveningGathering}
                    </b>
                  </strong>
                </div>
              </div>
            </section>
      </aside>
    </main>
  );
}
