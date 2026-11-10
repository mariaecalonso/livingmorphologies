"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import context from "@/data/skill5/herald-site.json";
import { nextCatalogId, siteLibraryEntries, type CatalogEntry } from "@/lib/skill4/catalog";
import {
  catalogServerSnapshot,
  finalCatalogServerSnapshot,
  hiddenFinalServerSnapshot,
  readCatalog,
  readFinalCatalog,
  readHiddenFinal,
  readSelectedFinal,
  selectedFinalServerSnapshot,
  subscribeCatalog,
  subscribeFinalCatalog,
  subscribeHiddenFinal,
  subscribeSelectedFinal,
  writeCatalog,
} from "@/lib/skill4/catalog-store";
import { loadFiledFinalCatalog, mergeFinalCatalog } from "@/lib/skill4/final-catalog";
import { localOnAssembly, worldAnnotations, type SiteAnnotation } from "@/lib/skill5/annotations";
import { assemblyWorldModules, cellToFeet, earlierProposals, explodeShifts, findSentProposal, importAssembly, keepAssemblyInSkill5, markAssemblySent, proposalCatalogEntry, reconcileSentAssemblies, reviseAssemblyMembers, worldToAssemblyLocal, type SiteAssembly } from "@/lib/skill5/assembly";
import brief from "@/data/skill5/workplace-brief.json";
import { PROGRAM_LABEL, SITE_ARCHETYPES, SITE_PROGRAMS, type SiteArchetype } from "@/lib/skill5/catalog";
import { isSkill5MockAssembly } from "@/lib/skill5/mock-assemblies";
import { localDemonstrationBridge, worldSourceBridge } from "@/lib/skill5/mock-bridge";
import { CONFIGURATION_CONTRACT, nextConfigurationId, referenceForModule, type ComparisonPriority, type ConfigurationDocument, type ConfigurationView, type SiteConfiguration } from "@/lib/skill5/configurations";
import { iterationMetrics, keptJoins, nominalUnionSqFt, programDistribution, scenePlaced } from "@/lib/skill5/metrics";
import { measureSite } from "@/lib/skill5/relations";
import { SKILL5_MODULE_ENVELOPE_FEET, SKILL5_SITE_ID } from "@/lib/skill5/contract";
import { designSiteFromParcel } from "@/lib/skill5/design-site";
import { adoptPresent, beginGesture, emptyEditHistory, endGesture, redoEdit, rememberEdit, undoEdit, type CompositionSnapshot } from "@/lib/skill5/history";
import { loadArchetypeMesh } from "@/lib/skill5/load-module";
import { joinSummary, proposeDirectJoin } from "@/lib/skill5/direct-join";
import { SITE_FACES, buildHybridOffer, placeHybridCandidate, siteFaceLabel, suggestedSiteFaces, type HybridOffer, type HybridPlacement, type SiteFace } from "@/lib/skill5/hybrid-join";
import type { Skill4ModuleRecord } from "@/lib/skill4/contract";
import { loadModuleMap } from "@/lib/skill4/tiles";
import type { FaceMatch, TilePose } from "@/lib/skill5/face-match";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT, NOMINAL_PLAN_EXTENT, boundsOf, extentCorners, footprintCorners, placementWarnings, pointInRing, settleMove, snapModuleOrigin, type PlacedModule } from "@/lib/skill5/placement";
import { reportTiles } from "@/lib/skill5/tile-placement";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { SiteContext } from "@/lib/skill5/site-model";
import { clipPolygon } from "./site-geometry";
import { SOURCE_CONTOUR_NOTE } from "./site-network-contours";
import { clearNetworkIterations, loadNetworkIterations, saveNetworkIteration } from "./site-network-archive";
import { analyzeNetwork, networkFigures, type NetworkAnalysisMode } from "./site-network-analysis";
import { SiteNetworkAnalysisPanel } from "./site-network-analysis-panel";
import { SiteNetworkIterations, type IterationBatch } from "./site-network-gallery";
import { captureNetworkIteration, createSiteNetworkStudy, runNetworkIteration, type NetworkIteration, type NetworkNodeKind, type SiteNetworkStudy } from "./site-network";
import { SiteStrategyAnalysis, SiteStrategyPanel, STRATEGY_MODES, type StrategyMode } from "./site-strategy";
import { SiteAnalysisWorkspace } from "./site-analysis-workspace";
import { SiteViewport, type SiteFit, type SiteReadout, type SiteViewMode } from "./site-viewport";
import { readSiteWorkflowState, writeSiteWorkflowState, ZONE_KINDS, type SiteConnection, type SiteWorkflowId, type SiteZone, type SiteZoneKind } from "./site-workflow";
import { SiteAssemblyStep, SiteWorkflowNav, SiteZoningInspector, SiteZoningPanel } from "./site-workflow-panels";
import { detectPockets } from "@/lib/skill5/pockets";
import { cleanedRing, distanceToRing, elevationIssue, nearestDistance, networkSamples, polygonAreaSqFt, polygonCentroid, polygonIssue, translatePolygon, zoneFacing, zoneSiteFlags, type ZonePoint, type ZoningRegion } from "@/lib/skill5/zoning";
import { ZONE_COLOR, type ZoneTool } from "./site-zone-layer";
import { FLOW_SURVIVE } from "./site-network-flow";

const site = context as SiteContext;
const designSite = designSiteFromParcel(site.site.ring);
/** Same polygon the viewport draws. The stored bay ring is left unchanged. */
const visibleWater = clipPolygon(site.water.ring);

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

/** Site Network opens in plan. Assembly Network opens in perspective. Axonometric stays available from the camera control. */
function strategyCamera(mode: StrategyMode): SiteViewMode {
  return mode === "assemblies-network" ? "perspective" : "plan";
}

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
    up: item.transform.position.y + z,
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
    return `${item.instanceId}:${item.transform.position.x}:${item.transform.position.y}:${item.transform.position.z}:${item.transform.rotationY}:${item.mirror ?? ""}:${mesh?.triangles ?? 0}`;
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

function GlassThumb({ mesh, interactive = true, fitRadius, spin = false }: { mesh: IsoMesh | null; interactive?: boolean; fitRadius?: number; spin?: boolean }) {
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
    if (spin && !reduced) {
      let last = 0;
      const turn = (now: number) => {
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
        last = now;
        yaw.current += 0.35 * dt;
        paint();
        frame = requestAnimationFrame(turn);
      };
      paint();
      frame = requestAnimationFrame(turn);
      const observer = new ResizeObserver(paint);
      observer.observe(canvas.parentElement ?? host);
      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
      };
    }
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
  }, [fitRadius, interactive, mesh, spin]);
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

export function assemblyPreviewRadius(entry: CatalogEntry, meshes: Record<string, PreviewMesh>) {
  const mesh = composeAssemblyPreview(entry, meshes);
  return mesh ? clayPreviewRadius(mesh) : 0;
}

export function AssemblyGlassPreview({ entry, meshes, interactive = true, spin = false, fitRadius }: { entry: CatalogEntry; meshes: Record<string, PreviewMesh>; interactive?: boolean; spin?: boolean; fitRadius?: number }) {
  const mesh = useMemo(() => composeAssemblyPreview(entry, meshes), [entry, meshes]);
  return <GlassThumb mesh={mesh} interactive={interactive && !spin} spin={spin} fitRadius={fitRadius} />;
}

export function ModuleGlassPreview({ mesh, spin = false, fitRadius }: { mesh: IsoMesh | null; spin?: boolean; fitRadius?: number }) {
  return <GlassThumb mesh={mesh} interactive={!spin} spin={spin} fitRadius={fitRadius} />;
}

export function PlacedGlassPreview({ modules, meshes, bridges = [], interactive = true, fitRadius }: { modules: readonly PlacedModule[]; meshes: Record<string, IsoMesh>; bridges?: readonly IsoMesh[]; interactive?: boolean; fitRadius?: number }) {
  const mesh = useMemo(() => composePlacedPreview(modules, meshes, bridges), [bridges, meshes, modules]);
  return <GlassThumb mesh={mesh} interactive={interactive} fitRadius={fitRadius} />;
}

function ComparisonPlan({
  modules,
  zones,
  branches,
  bounds,
  showZones,
  showNetwork,
  label,
}: {
  modules: readonly PlacedModule[];
  zones: readonly ZoningRegion[];
  branches: readonly { x0: number; z0: number; x1: number; z1: number }[];
  bounds: { minEast: number; maxEast: number; minNorth: number; maxNorth: number };
  showZones: boolean;
  showNetwork: boolean;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signature = `${showZones}|${showNetwork}|${bounds.minEast}:${bounds.maxEast}:${bounds.minNorth}:${bounds.maxNorth}|${modules.map((item) => item.instanceId).join(",")}|${zones.length}|${branches.length}`;
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const width = 280;
    const height = 160;
    const dpr = 2;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    const spanX = Math.max(bounds.maxEast - bounds.minEast, 1);
    const spanZ = Math.max(bounds.maxNorth - bounds.minNorth, 1);
    const scale = Math.min((width - 24) / spanX, (height - 24) / spanZ);
    const originX = (width - spanX * scale) / 2;
    const originY = (height - spanZ * scale) / 2;
    const project = (east: number, north: number) => ({
      x: originX + (east - bounds.minEast) * scale,
      y: originY + (bounds.maxNorth - north) * scale,
    });
    if (showZones) {
      for (const zone of zones) {
        if (zone.points.length < 3) continue;
        ctx.beginPath();
        zone.points.forEach((point, index) => {
          const projected = project(point.x, point.z);
          if (index === 0) ctx.moveTo(projected.x, projected.y);
          else ctx.lineTo(projected.x, projected.y);
        });
        ctx.closePath();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = ZONE_COLOR[zone.kind];
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (showNetwork) {
      ctx.strokeStyle = "#49d7de";
      ctx.lineWidth = 1;
      for (const edge of branches) {
        const start = project(edge.x0, edge.z0);
        const end = project(edge.x1, edge.z1);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "#c77e5f";
    ctx.lineWidth = 1;
    for (const item of modules) {
      const corners = footprintCorners(item.transform.position, item.transform.rotationY);
      ctx.beginPath();
      corners.forEach((point, index) => {
        const projected = project(point.x, point.z);
        if (index === 0) ctx.moveTo(projected.x, projected.y);
        else ctx.lineTo(projected.x, projected.y);
      });
      ctx.closePath();
      ctx.stroke();
    }
  }, [signature, bounds, branches, modules, showNetwork, showZones, zones]);
  return <canvas ref={canvasRef} aria-label={label} />;
}

function planBounds(
  entries: readonly SiteConfiguration[],
  networks: readonly { branches?: { x0: number; z0: number; x1: number; z1: number }[] }[],
) {
  let minEast = Infinity;
  let maxEast = -Infinity;
  let minNorth = Infinity;
  let maxNorth = -Infinity;
  const add = (east: number, north: number) => {
    minEast = Math.min(minEast, east);
    maxEast = Math.max(maxEast, east);
    minNorth = Math.min(minNorth, north);
    maxNorth = Math.max(maxNorth, north);
  };
  for (const entry of entries) {
    for (const item of entry.modules) {
      for (const corner of footprintCorners(item.transform.position, item.transform.rotationY)) add(corner.x, corner.z);
    }
    for (const zone of entry.zones ?? []) {
      for (const point of zone.points) add(point.x, point.z);
    }
  }
  for (const network of networks) {
    for (const edge of network.branches ?? []) {
      add(edge.x0, edge.z0);
      add(edge.x1, edge.z1);
    }
  }
  if (!Number.isFinite(minEast)) return { minEast: -20, maxEast: 20, minNorth: -20, maxNorth: 20 };
  return { minEast: minEast - 16, maxEast: maxEast + 16, minNorth: minNorth - 16, maxNorth: maxNorth + 16 };
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

function trailsAgree(saved: Float32Array, fresh: Float32Array) {
  if (saved.length !== fresh.length || saved.length === 0) return false;
  let both = 0;
  let either = 0;
  for (let index = 0; index < saved.length; index += 1) {
    const left = saved[index] >= 0.15;
    const right = fresh[index] >= 0.15;
    if (left || right) either += 1;
    if (left && right) both += 1;
  }
  return either > 40 && both / either >= 0.75;
}

function distanceToBranches(point: ZonePoint, branches: readonly { x0: number; z0: number; x1: number; z1: number }[]) {
  let best = Number.POSITIVE_INFINITY;
  for (const edge of branches) {
    const dx = edge.x1 - edge.x0;
    const dz = edge.z1 - edge.z0;
    const span = dx * dx + dz * dz;
    const t = span === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - edge.x0) * dx + (point.z - edge.z0) * dz) / span));
    best = Math.min(best, Math.hypot(point.x - (edge.x0 + dx * t), point.z - (edge.z0 + dz * t)));
  }
  return Number.isFinite(best) ? best : null;
}

function tilePositions(meshes: Record<string, IsoMesh | "missing">, instance: PlacedModule) {
  const stored = meshes[instance.provenance.moduleId];
  return stored && stored !== "missing" ? stored.positions : null;
}

function storedDirectJoins(connections: readonly SiteConnection[]) {
  return connections.flatMap((link) => {
    if (link.mode !== "direct" || !link.passage || !link.faceA || !link.faceB || (link.joinType !== "side" && link.joinType !== "stack")) return [];
    return [{
      id: link.id,
      tileA: link.tileA,
      tileB: link.tileB,
      faceA: link.faceA,
      faceB: link.faceB,
      joinType: link.joinType,
      alignment: link.alignment ?? 0,
      floorDelta: link.floorDelta ?? 0,
      integrity: "closed" as const,
      passage: link.passage,
    }];
  });
}

function storedHybridJoins(connections: readonly SiteConnection[]) {
  return connections.flatMap((link) => {
    if (link.mode !== "hybrid" || !link.passage || !link.faceA || !link.faceB || !link.candidateId || (link.joinType !== "side" && link.joinType !== "stack")) return [];
    return [{
      id: link.id,
      tileA: link.tileA,
      tileB: link.tileB,
      faceA: link.faceA,
      faceB: link.faceB,
      joinType: link.joinType,
      alignment: link.alignment ?? 0,
      floorDelta: link.floorDelta ?? 0,
      integrity: link.integrity === "open" ? "open" as const : "closed" as const,
      candidateId: link.candidateId,
      note: link.note ?? "",
      passage: link.passage,
    }];
  });
}

function branchJunctions(branches: readonly { x0: number; z0: number; x1: number; z1: number }[]) {
  const marks = new Map<string, { x: number; z: number; count: number }>();
  for (const edge of branches) {
    for (const point of [{ x: edge.x0, z: edge.z0 }, { x: edge.x1, z: edge.z1 }]) {
      const key = `${Math.round(point.x * 2) / 2}:${Math.round(point.z * 2) / 2}`;
      const mark = marks.get(key) ?? { x: point.x, z: point.z, count: 0 };
      mark.count += 1;
      marks.set(key, mark);
    }
  }
  return [...marks.values()].filter((mark) => mark.count >= 3);
}

export function SiteWorkspace({ panels = "model" }: { panels?: "model" | "analysis" }) {
  if (panels === "analysis") return <SiteAnalysisWorkspace />;
  return <SiteModelWorkspace />;
}

function sheetFromSearch(search: { get: (key: string) => string | null }): SiteWorkflowId {
  const next = search.get("sheet");
  return next === "zoning" || next === "placement" || next === "assembly" ? next : "strategy";
}

function SiteModelWorkspace() {
  const search = useSearchParams();
  const [sheet, setSheet] = useState<SiteWorkflowId>(() => sheetFromSearch(search));
  useEffect(() => {
    const next = search.get("sheet");
    if (next === "zoning" || next === "placement" || next === "assembly") setSheet(next);
  }, [search]);
  const [zones, setZones] = useState<SiteZone[]>([]);
  const [connections, setConnections] = useState<SiteConnection[]>([]);
  const [zoneKind, setZoneKind] = useState<SiteZoneKind>("lobby");
  const [zoneTool, setZoneTool] = useState<ZoneTool>("select");
  const [zoneDraft, setZoneDraft] = useState<ZonePoint[]>([]);
  const zoneDraftRef = useRef(zoneDraft);
  zoneDraftRef.current = zoneDraft;
  const [zoneNotice, setZoneNotice] = useState<string | null>(null);
  const [zoneDeleteId, setZoneDeleteId] = useState<string | null>(null);
  const [zoneSelection, setZoneSelection] = useState<string | null>(null);
  const [pocketSelection, setPocketSelection] = useState<string[]>([]);
  const [pocketHover, setPocketHover] = useState<string | null>(null);
  const [branchNote, setBranchNote] = useState<string | null>(null);
  const branchMiss = useRef(new Set<string>());
  const [libraryAll, setLibraryAll] = useState(false);
  const [zoneOpacity, setZoneOpacity] = useState(0.22);
  const placementYRef = useRef(MODULE_GROUND_Y);
  const tileReportRef = useRef<ReturnType<typeof reportTiles>>({});
  const zoningKeys = useRef({ finish: () => {}, cancel: () => {} });
  const [showZones, setShowZones] = useState(true);
  const [showTiles, setShowTiles] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [linkA, setLinkA] = useState("");
  const [linkB, setLinkB] = useState("");
  const [selectedJoin, setSelectedJoin] = useState<string | null>(null);
  const [joinMode, setJoinMode] = useState<"direct" | "hybrid">("direct");
  const [hybridFaceA, setHybridFaceA] = useState<SiteFace>("E");
  const [hybridFaceB, setHybridFaceB] = useState<SiteFace>("W");
  const [hybridOffer, setHybridOffer] = useState<HybridOffer | null>(null);
  const [hybridPlacement, setHybridPlacement] = useState<HybridPlacement | null>(null);
  const [hybridCandidate, setHybridCandidate] = useState<string | null>(null);
  const [hybridNote, setHybridNote] = useState("Choose the two faces, then find the Skill 04 hybrids.");
  const [hybridBusy, setHybridBusy] = useState(false);
  const hybridRecords = useRef(new Map<string, Skill4ModuleRecord>());
  const [workflowReady, setWorkflowReady] = useState(false);
  const zoneSerial = useRef(1);
  const connectionSerial = useRef(1);
  const joinPickAt = useRef(0);
  const [strategyMode, setStrategyMode] = useState<StrategyMode>("site-network");
  const [networkStudy, setNetworkStudy] = useState<SiteNetworkStudy | null>(null);
  const [networkRunning, setNetworkRunning] = useState(false);
  const [networkTool, setNetworkTool] = useState<NetworkNodeKind>("source");
  const [iterations, setIterations] = useState<NetworkIteration[]>([]);
  const [iterationView, setIterationView] = useState<string | null>(null);
  const [massingId, setMassingId] = useState<string | null>(null);
  const [iterationCompare, setIterationCompare] = useState<string[]>([]);
  const [iterationBatch, setIterationBatch] = useState<IterationBatch | null>(null);
  const [analysisMode, setAnalysisMode] = useState<NetworkAnalysisMode>("density");
  const [analysisOn, setAnalysisOn] = useState(false);
  const [showField, setShowField] = useState(true);
  const networkView = useRef<HTMLElement>(null);
  const [showTrails, setShowTrails] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const iterationToken = useRef(0);
  const iterationsRef = useRef(iterations);
  iterationsRef.current = iterations;
  useEffect(() => {
    let cancel = false;
    loadNetworkIterations().then((rows) => {
      if (!cancel) setIterations(rows);
    }).catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);
  useEffect(() => {
    if (networkStudy) return;
    setNetworkStudy(createSiteNetworkStudy(site.site.ring, site.water.ring, { buildings: site.buildings }));
  }, [networkStudy]);
  const workflowBoot = useRef(false);
  useEffect(() => {
    if (!workflowReady) return;
    writeSiteWorkflowState({ zones, connections, massingNetworkId: massingId });
  }, [connections, massingId, workflowReady, zones]);
  const [mode, setMode] = useState<SiteViewMode>(() => (sheetFromSearch(search) === "strategy" ? "plan" : "perspective"));
  const sheetQuery = search.get("sheet");
  useEffect(() => {
    if (sheetQuery === "zoning" || sheetQuery === "placement" || sheetQuery === "assembly") setMode("perspective");
  }, [sheetQuery]);
  const [planHeading, setPlanHeading] = useState<"north" | "east">("north");
  const [showGrid, setShowGrid] = useState(true);
  const [showAerial] = useState(false);
  const [fit] = useState<SiteFit>("site");
  const [rotateView] = useState(false);
  const [frameToken] = useState(0);
  const [readout, setReadout] = useState<SiteReadout>({ northDeg: 0, scaleFeet: 100, scalePx: 96 });
  const [snap, setSnap] = useState(true);
  const [autoMatch, setAutoMatch] = useState(true);
  const [manualPose, setManualPose] = useState<TilePose | null>(null);
  const [matchCycle, setMatchCycle] = useState(0);
  const [faceMatch, setFaceMatch] = useState<FaceMatch | null>(null);
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
  const savedFinal = useSyncExternalStore(subscribeFinalCatalog, readFinalCatalog, finalCatalogServerSnapshot);
  const hiddenFinal = useSyncExternalStore(subscribeHiddenFinal, readHiddenFinal, hiddenFinalServerSnapshot);
  const selectedFinal = useSyncExternalStore(subscribeSelectedFinal, readSelectedFinal, selectedFinalServerSnapshot);
  const [filedFinal, setFiledFinal] = useState<CatalogEntry[]>([]);
  const wantsFiledFinal = selectedFinal.length > 0;
  useEffect(() => {
    if (!wantsFiledFinal) return;
    let cancel = false;
    void loadFiledFinalCatalog().then((rows) => {
      if (!cancel) setFiledFinal(rows);
    });
    return () => {
      cancel = true;
    };
  }, [wantsFiledFinal]);
  const catalog = useMemo(() => {
    const working = siteLibraryEntries(storedCatalog);
    const ids = new Set(working.map((entry) => entry.id));
    const chosen = new Set(selectedFinal);
    const final = mergeFinalCatalog(filedFinal, savedFinal, hiddenFinal).filter((entry) => chosen.has(entry.id) && !ids.has(entry.id));
    return [...final, ...working];
  }, [storedCatalog, filedFinal, savedFinal, hiddenFinal, selectedFinal]);
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
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareNetwork, setCompareNetwork] = useState(false);
  const [compareZones, setCompareZones] = useState(true);
  const reportedMissing = useRef(new Set<string>());
  const [annotations, setAnnotations] = useState<SiteAnnotation[]>([]);
  const historyRef = useRef(emptyEditHistory());
  const writeSerial = useRef(0);
  const configurationsRef = useRef(configurations);
  configurationsRef.current = configurations;
  const [history, setHistory] = useState(emptyEditHistory);
  const publish = useCallback((next: ReturnType<typeof emptyEditHistory>) => {
    const assemblies = reconcileSentAssemblies(next.present.assemblies, readCatalog());
    const resolved = assemblies === next.present.assemblies ? next : { ...next, present: { ...next.present, assemblies } };
    historyRef.current = resolved;
    setHistory(resolved);
    setInstances(resolved.present.instances);
    setAssemblies(resolved.present.assemblies);
    setAnnotations(resolved.present.annotations);
    setZones(resolved.present.zones ?? []);
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
  useEffect(() => {
    if (workflowBoot.current) return;
    workflowBoot.current = true;
    const stored = readSiteWorkflowState();
    setConnections(stored.connections);
    setMassingId(stored.massingNetworkId);
    for (const zone of stored.zones) {
      const match = /^z(\d+)$/.exec(zone.id);
      if (match) zoneSerial.current = Math.max(zoneSerial.current, Number(match[1]) + 1);
    }
    for (const link of stored.connections) {
      const match = /^c(\d+)$/.exec(link.id);
      if (match) connectionSerial.current = Math.max(connectionSerial.current, Number(match[1]) + 1);
    }
    publish(adoptPresent(historyRef.current, { ...historyRef.current.present, zones: stored.zones }));
    setWorkflowReady(true);
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
      if (sheet === "zoning" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === "Enter") {
          event.preventDefault();
          zoningKeys.current.finish();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          zoningKeys.current.cancel();
          return;
        }
        if ((event.key === "Delete" || event.key === "Backspace") && zoneSelection) {
          event.preventDefault();
          setZoneDeleteId(zoneSelection);
          return;
        }
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
  const warnings = useMemo(
    () => placementWarnings(sceneInstances, site.site.ring, [site.site.ring, visibleWater]),
    [sceneInstances],
  );
  const displayShift = useMemo(() => {
    if (!exploded) return {};
    return Object.assign({}, ...assemblies.map((assembly) => explodeShifts(assembly, 14)));
  }, [assemblies, exploded]);
  const connectionLines = useMemo(() => {
    if (!showConnections) return [];
    return connections.flatMap((link) => {
      const a = sceneInstances.find((item) => item.instanceId === link.tileA);
      const b = sceneInstances.find((item) => item.instanceId === link.tileB);
      if (!a || !b) return [];
      return [{
        id: link.id,
        mode: link.mode,
        ax: a.transform.position.x,
        az: a.transform.position.z,
        bx: b.transform.position.x,
        bz: b.transform.position.z,
      }];
    });
  }, [connections, sceneInstances, showConnections]);
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
      zones: present.zones,
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
    const placeModule = useCallback((x: number, z: number, pose?: { x: number; y: number; z: number; rotationY: number; mirror: "x" | "z" | null }) => {
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
      mirror: pose?.mirror ?? null,
      transform: {
        position: { x: pose?.x ?? x, y: pose?.y ?? placementYRef.current, z: pose?.z ?? z },
        rotationY: pose?.rotationY ?? 0,
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
          transform: { ...instance.transform, position: { x, y: instance.transform.position.y, z } },
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
          y: selected.transform.position.y,
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
    setConnections((current) => current.filter((link) => link.tileA !== selectedId && link.tileB !== selectedId));
    if (linkA === selectedId || linkB === selectedId) {
      setLinkA("");
      setLinkB("");
      setHybridOffer(null);
      setHybridPlacement(null);
      setHybridCandidate(null);
    }
    setSelectedJoin((current) => current && (current.tileA === selectedId || current.tileB === selectedId) ? null : current);
    setSelectedId(null);
  };
  const setTileTransform = (patch: { x?: number; y?: number; z?: number; rotationY?: number; mirror?: PlacedModule["mirror"] }) => {
    if (!selected) return;
    const current = selected;
    commit((present) => ({
      ...present,
      instances: present.instances.map((instance) => instance.instanceId !== current.instanceId ? instance : {
        ...instance,
        mirror: patch.mirror === undefined ? instance.mirror : patch.mirror,
        transform: {
          rotationY: patch.rotationY ?? instance.transform.rotationY,
          position: {
            x: patch.x ?? instance.transform.position.x,
            y: patch.y ?? instance.transform.position.y,
            z: patch.z ?? instance.transform.position.z,
          },
        },
      }),
    }));
  };
  const stackSelected = (direction: 1 | -1) => {
    if (!selected) return;
    const source = armed ?? SITE_ARCHETYPES.find((entry) => entry.archetypeId === selected.provenance.archetypeId);
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
      mirror: armed ? null : selected.mirror,
      transform: {
        rotationY: selected.transform.rotationY,
        position: {
          x: selected.transform.position.x,
          y: selected.transform.position.y + direction * MODULE_HEIGHT_FT,
          z: selected.transform.position.z,
        },
      },
    };
    commit((present) => ({ ...present, instances: [...present.instances, instance] }));
    setSelectedId(instanceId);
    if (!stored || stored === "missing") requestMesh(source);
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
    const serial = writeSerial.current + 1;
    writeSerial.current = serial;
    configurationsRef.current = next;
    setConfigurations(next);
    setPriorities(nextPriorities);
    const response = await fetch("/api/site/configurations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract: CONFIGURATION_CONTRACT, siteId: SKILL5_SITE_ID, configurations: next, priorities: nextPriorities }),
    });
    if (!response.ok || serial !== writeSerial.current) return;
    const body = await response.json() as ConfigurationDocument;
    if (serial !== writeSerial.current) return;
    configurationsRef.current = body.configurations;
    setConfigurations(body.configurations);
    setPriorities(body.priorities ?? []);
  };
  const currentView = useMemo<ConfigurationView>(() => ({
    showZones,
    showTiles,
    showConnections,
    showNetwork: showTrails,
  }), [showConnections, showTiles, showTrails, showZones]);
  const configurationSnapshot = (id: string, name: string, parentConfigurationId: string | null, createdAt: string): SiteConfiguration => {
    const now = new Date().toISOString();
    return {
      id,
      name,
      parentConfigurationId,
      createdAt,
      updatedAt: now,
      modules: historyRef.current.present.instances.map((instance) => ({
        ...structuredClone(instance),
        zoneIds: tileReportRef.current[instance.instanceId]?.zoneIds ?? instance.zoneIds ?? [],
      })),
      assemblies: structuredClone(assemblies),
      annotations: structuredClone(annotations),
      zones: structuredClone(historyRef.current.present.zones),
      networkId: massingId,
      directJoins: storedDirectJoins(connections),
      hybridJoins: storedHybridJoins(connections),
      view: currentView,
    };
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
    const list = configurationsRef.current;
    const name = configName.trim() || "Untitled";
    if (!asNew && currentConfigId) {
      const current = list.find((entry) => entry.id === currentConfigId);
      const saved = configurationSnapshot(currentConfigId, name, current?.parentConfigurationId ?? null, current?.createdAt ?? new Date().toISOString());
      void writeConfigurations(list.map((entry) => entry.id === currentConfigId ? saved : entry));
      return;
    }
    const id = nextConfigurationId(list);
    const created = configurationSnapshot(id, name, currentConfigId, new Date().toISOString());
    setCurrentConfigId(id);
    setConfigName(name);
    void writeConfigurations([...list, created]);
  };
  const openConfiguration = (entry: SiteConfiguration) => {
    const nextModules = structuredClone(entry.modules);
    const nextAssemblies = structuredClone(entry.assemblies);
    const nextNotes = structuredClone(entry.annotations ?? []);
    publish(emptyEditHistory({ instances: nextModules, assemblies: nextAssemblies, annotations: nextNotes, zones: structuredClone(entry.zones ?? []) }));
    setZoneDraft([]);
    setZoneSelection(null);
    setMassingId(entry.networkId);
    const direct = keptJoins(nextModules, entry.directJoins ?? []);
    const hybrid = keptJoins(nextModules, entry.hybridJoins ?? []);
    const restoredJoins = [
      ...direct.kept.map((join) => ({ ...join, mode: "direct" as const })),
      ...hybrid.kept.map((join) => ({ ...join, mode: "hybrid" as const })),
    ];
    setConnections(restoredJoins);
    setSelectedJoin(null);
    if (entry.view) {
      setShowZones(entry.view.showZones);
      setShowTiles(entry.view.showTiles);
      setShowConnections(entry.view.showConnections);
      setShowTrails(entry.view.showNetwork);
    }
    const absent = nextModules.filter((item) => !referenceForModule(item.provenance.moduleId, item.provenance.archetypeId, item.provenance.candidateId, item.provenance.continuationId));
    const dropped = direct.missing.length + hybrid.missing.length;
    const notes: string[] = [];
    if (entry.zones?.some((zone) => zone.networkId && zone.networkId !== entry.networkId)) notes.push("This configuration was drawn on a different network iteration. The regions were restored and left unchanged.");
    if ((entry.droppedModules ?? 0) > 0) notes.push(`${entry.droppedModules} module record${entry.droppedModules === 1 ? "" : "s"} could not be read and ${entry.droppedModules === 1 ? "was" : "were"} not replaced.`);
    if (absent.length > 0) notes.push(`${absent.map((item) => item.name).join(", ")} is not in the catalog. Nothing was substituted.`);
    if ((entry.droppedDirects ?? 0) + (entry.droppedHybrids ?? 0) > 0) notes.push(`${(entry.droppedDirects ?? 0) + (entry.droppedHybrids ?? 0)} connection record${(entry.droppedDirects ?? 0) + (entry.droppedHybrids ?? 0) === 1 ? "" : "s"} were incomplete and were not replaced.`);
    if (dropped > 0) notes.push(`${dropped} connection${dropped === 1 ? "" : "s"} referenced a missing tile or mesh and ${dropped === 1 ? "was" : "were"} not restored.`);
    if (entry.networkId && iterations.length > 0 && !iterations.some((item) => item.id === entry.networkId)) notes.push(`Network ${entry.networkId} is not in the saved studies. It was not replaced.`);
    setConfigNotice(notes.length > 0 ? notes.join(" ") : null);
    for (const link of restoredJoins) {
      const match = /^c(\d+)$/.exec(link.id);
      if (match) connectionSerial.current = Math.max(connectionSerial.current, Number(match[1]) + 1);
    }
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
    const joinsChanged = JSON.stringify(storedDirectJoins(connections)) !== JSON.stringify(savedConfiguration?.directJoins ?? [])
      || JSON.stringify(storedHybridJoins(connections)) !== JSON.stringify(savedConfiguration?.hybridJoins ?? []);
    if (!savedConfiguration) return instances.length > 0 || assemblies.length > 0 || annotations.length > 0 || zones.length > 0 || connections.length > 0;
    const viewChanged = savedConfiguration.view ? JSON.stringify(currentView) !== JSON.stringify(savedConfiguration.view) : false;
    return configName !== savedConfiguration.name
      || JSON.stringify(instances) !== JSON.stringify(savedConfiguration.modules)
      || JSON.stringify(assemblies) !== JSON.stringify(savedConfiguration.assemblies)
      || JSON.stringify(annotations) !== JSON.stringify(savedConfiguration.annotations ?? [])
      || JSON.stringify(zones) !== JSON.stringify(savedConfiguration.zones ?? [])
      || massingId !== (savedConfiguration.networkId ?? null)
      || joinsChanged
      || viewChanged;
  }, [annotations, assemblies, configName, connections, currentView, instances, massingId, savedConfiguration, zones]);
  useEffect(() => {
    if (!massingId || iterations.length === 0) return;
    if (iterations.some((item) => item.id === massingId)) return;
    const sentence = `Network ${massingId} is not in the saved studies. It was not replaced.`;
    setConfigNotice((current) => current?.includes(massingId) ? current : current ? `${current} ${sentence}` : sentence);
  }, [iterations, massingId]);
  useEffect(() => {
    const names = instances.flatMap((item) => {
      if (meshes[item.provenance.moduleId] !== "missing") return [];
      if (reportedMissing.current.has(item.instanceId)) return [];
      reportedMissing.current.add(item.instanceId);
      return [item.name];
    });
    if (names.length === 0) return;
    setConfigNotice((current) => `${names.join(", ")} is not stored. Nothing was substituted.${current ? ` ${current}` : ""}`);
  }, [instances, meshes]);
  useEffect(() => {
    for (const id of compareIds) {
      const entry = configurations.find((item) => item.id === id);
      if (!entry) continue;
      for (const item of entry.modules) {
        const ref = referenceForModule(item.provenance.moduleId, item.provenance.archetypeId, item.provenance.candidateId, item.provenance.continuationId);
        if (ref) requestMesh(ref);
      }
    }
  }, [compareIds, configurations]);
  const confirmLeave = () => {
    if (!unsavedChanges) return true;
    if (window.confirm("Save this massing before switching?")) {
      saveConfiguration(false);
      return true;
    }
    return window.confirm("Discard the unsaved changes and open the other iteration?");
  };
  const duplicateConfiguration = (entry?: SiteConfiguration) => {
    const source = entry && entry.id !== currentConfigId ? entry : null;
    if (source && !confirmLeave()) return;
    const list = configurationsRef.current;
    const now = new Date().toISOString();
    const id = nextConfigurationId(list);
    const copy: SiteConfiguration = source
      ? { ...structuredClone(source), id, name: `${source.name} copy`, parentConfigurationId: source.id, createdAt: now, updatedAt: now }
      : configurationSnapshot(id, `${(configName.trim() || "Untitled")} copy`, currentConfigId, now);
    void writeConfigurations([...list, copy]);
    if (source) openConfiguration(copy);
    else {
      setCurrentConfigId(id);
      setConfigName(copy.name);
    }
  };
  const deleteSavedConfiguration = (id: string) => {
    const entry = configurationsRef.current.find((item) => item.id === id);
    if (!entry) return;
    if (!window.confirm(`Delete ${entry.name}? The other saved iterations stay.`)) return;
    void writeConfigurations(configurationsRef.current.filter((item) => item.id !== id));
    setCompareIds((current) => current.filter((item) => item !== id));
    if (currentConfigId === id) setCurrentConfigId(null);
  };
  const requestOpen = (entry: SiteConfiguration) => {
    if (entry.id === currentConfigId) return;
    if (!confirmLeave()) return;
    openConfiguration(entry);
  };
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
  const chooseSheet = (next: SiteWorkflowId) => {
    if (next === sheet) return;
    setSheet(next);
    setMode(next === "strategy" ? strategyCamera(strategyMode) : "perspective");
  };
  const replaceZones = (next: ZoningRegion[]) => {
    commit((present) => ({ ...present, zones: next }));
  };
  const finishZoneDraft = (points: readonly ZonePoint[]) => {
    const ring = cleanedRing(points);
    const issue = polygonIssue(ring);
    if (issue) {
      setZoneNotice(issue);
      return;
    }
    const id = `z${zoneSerial.current}`;
    zoneSerial.current += 1;
    const label = ZONE_KINDS.find((item) => item.id === zoneKind)?.label ?? "Zone";
    const count = zones.filter((zone) => zone.kind === zoneKind).length + 1;
    const region: ZoningRegion = {
      id,
      name: `${label} ${count}`,
      kind: zoneKind,
      points: ring,
      baseFt: 0,
      heightFt: 12,
      visible: true,
      networkId: massingId,
      pocketId: null,
    };
    replaceZones([...zones, region]);
    setZoneSelection(id);
    zoneDraftRef.current = [];
    setZoneDraft([]);
    setZoneNotice(null);
    setZoneTool("select");
  };
  const addZonePoint = (point: ZonePoint) => {
    if (sheet !== "zoning" || zoneTool !== "draw" || mode !== "plan" || !massingId) return;
    const current = zoneDraftRef.current;
    if (current.length >= 3 && Math.hypot(point.x - current[0].x, point.z - current[0].z) < 12) {
      finishZoneDraft(current);
      return;
    }
    const last = current[current.length - 1];
    if (last && Math.hypot(point.x - last.x, point.z - last.z) < 1.5) return;
    const next = [...current, point];
    zoneDraftRef.current = next;
    setZoneNotice(null);
    setZoneDraft(next);
  };
  const closeZoneDraft = () => {
    const current = zoneDraftRef.current;
    if (current.length === 0) return;
    const last = current[current.length - 1];
    const previous = current[current.length - 2];
    const trimmed = last && previous && Math.hypot(last.x - previous.x, last.z - previous.z) < 18 ? current.slice(0, -1) : current;
    finishZoneDraft(trimmed);
  };
  zoningKeys.current = {
    finish: () => { if (zoneDraftRef.current.length > 0) finishZoneDraft(zoneDraftRef.current); },
    cancel: () => { zoneDraftRef.current = []; setZoneDraft([]); setZoneNotice(null); setZoneDeleteId(null); },
  };
  const commitZonePoints = (id: string, points: ZonePoint[]) => {
    const ring = cleanedRing(points);
    if (polygonIssue(ring)) return false;
    replaceZones(zones.map((zone) => zone.id === id ? { ...zone, points: ring } : zone));
    setZoneNotice(null);
    return true;
  };
  const commitZoneElevation = (id: string, baseFt: number, heightFt: number) => {
    const issue = elevationIssue(baseFt, heightFt);
    if (issue) {
      setZoneNotice(issue);
      return false;
    }
    replaceZones(zones.map((zone) => zone.id === id ? { ...zone, baseFt, heightFt } : zone));
    setZoneNotice(null);
    return true;
  };
  const duplicateZone = (id: string) => {
    const zone = zones.find((item) => item.id === id);
    if (!zone) return;
    const copyId = `z${zoneSerial.current}`;
    zoneSerial.current += 1;
    const copy: ZoningRegion = {
      ...zone,
      id: copyId,
      name: `${zone.name} copy`,
      points: translatePolygon(zone.points, 18, 18),
    };
    replaceZones([...zones, copy]);
    setZoneSelection(copyId);
  };
  const confirmJoin = () => {
    const first = placed.find((item) => item.instanceId === linkA);
    const second = placed.find((item) => item.instanceId === linkB);
    if (!first || !second) return;
    const proposal = proposeDirectJoin(first, second, tilePositions(meshes, first), tilePositions(meshes, second));
    if (!proposal.valid || !proposal.passage || !proposal.faceA || !proposal.faceB || !proposal.type) return;
    const duplicate = connections.some((link) => link.mode === "direct" && ((link.tileA === first.instanceId && link.tileB === second.instanceId) || (link.tileA === second.instanceId && link.tileB === first.instanceId)));
    if (duplicate) return;
    const id = `c${connectionSerial.current}`;
    connectionSerial.current += 1;
    setConnections((current) => [...current, {
      id,
      tileA: first.instanceId,
      tileB: second.instanceId,
      mode: "direct",
      faceA: proposal.faceA ?? undefined,
      faceB: proposal.faceB ?? undefined,
      joinType: proposal.type ?? undefined,
      alignment: proposal.alignment,
      floorDelta: proposal.floorDelta,
      integrity: "closed",
      passage: proposal.passage,
    }]);
    setSelectedJoin(id);
  };
  const cancelJoin = () => {
    setLinkA("");
    setLinkB("");
    setSelectedJoin(null);
    setHybridOffer(null);
    setHybridPlacement(null);
    setHybridCandidate(null);
    setHybridNote("Choose the two faces, then find the Skill 04 hybrids.");
  };
  const rememberFaces = (firstId: string, secondId: string) => {
    const first = placed.find((item) => item.instanceId === firstId);
    const second = placed.find((item) => item.instanceId === secondId);
    if (!first || !second) return;
    const [faceA, faceB] = suggestedSiteFaces(first, second);
    setHybridFaceA(faceA);
    setHybridFaceB(faceB);
    setHybridOffer(null);
    setHybridPlacement(null);
    setHybridCandidate(null);
  };
  const loadHybridModule = async (archetypeId: string) => {
    const cached = hybridRecords.current.get(archetypeId);
    if (cached) return cached;
    const response = await fetch(`/api/skill4/handoff?archetype=${encodeURIComponent(archetypeId)}`);
    if (!response.ok) throw new Error("Skill 04 has no module for this tile.");
    const record = await response.json() as Skill4ModuleRecord;
    hybridRecords.current.set(archetypeId, record);
    return record;
  };
  const findHybrids = async () => {
    const first = placed.find((item) => item.instanceId === linkA);
    const second = placed.find((item) => item.instanceId === linkB);
    if (!first || !second) {
      setHybridNote("Select two tiles.");
      return;
    }
    setHybridBusy(true);
    setHybridPlacement(null);
    setHybridCandidate(null);
    setHybridNote("Reading the Skill 04 modules.");
    try {
      const [recordA, recordB] = await Promise.all([
        loadHybridModule(first.provenance.archetypeId),
        loadHybridModule(second.provenance.archetypeId),
      ]);
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      setHybridNote("Skill 04 is building the hybrid candidates.");
      const result = buildHybridOffer({
        tileA: first,
        tileB: second,
        faceA: hybridFaceA,
        faceB: hybridFaceB,
        rawA: tilePositions(meshes, first),
        rawB: tilePositions(meshes, second),
        loaded: loadModuleMap([recordA, recordB]),
      });
      if (!result.ok) {
        setHybridOffer(null);
        setHybridNote(result.reason);
        return;
      }
      setHybridOffer(result.offer);
      const ready = result.offer.candidates.filter((candidate) => candidate.status === "ready");
      setHybridNote(ready.length > 0 ? `${ready.length} hybrids are ready. Choose one to preview it.` : (result.offer.candidates.find((candidate) => candidate.reason)?.reason ?? "Skill 04 did not produce a hybrid for these faces."));
    } catch (error) {
      setHybridOffer(null);
      setHybridNote(error instanceof Error ? error.message : "The hybrid could not be generated.");
    } finally {
      setHybridBusy(false);
    }
  };
  const previewHybrid = (candidateId: string) => {
    if (!hybridOffer) return;
    const placedHybrid = placeHybridCandidate(hybridOffer, candidateId);
    setHybridCandidate(candidateId);
    if (!placedHybrid.ok) {
      setHybridPlacement(null);
      setHybridNote(placedHybrid.reason);
      return;
    }
    setHybridPlacement(placedHybrid.placement);
    setHybridNote(placedHybrid.placement.note);
  };
  const confirmHybrid = () => {
    if (!hybridPlacement || !linkA || !linkB) return;
    const id = `c${connectionSerial.current}`;
    connectionSerial.current += 1;
    setConnections((current) => [...current.filter((link) => !(link.mode === "hybrid" && link.tileA === linkA && link.tileB === linkB && link.faceA === hybridPlacement.faceA && link.faceB === hybridPlacement.faceB)), {
      id,
      tileA: linkA,
      tileB: linkB,
      mode: "hybrid",
      faceA: hybridPlacement.faceA,
      faceB: hybridPlacement.faceB,
      joinType: hybridPlacement.joinType,
      alignment: hybridPlacement.alignment,
      floorDelta: hybridPlacement.floorDelta,
      integrity: hybridPlacement.integrity,
      candidateId: hybridPlacement.candidateId,
      note: hybridPlacement.note,
      passage: hybridPlacement.passage,
    }]);
    setSelectedJoin(id);
    setHybridPlacement(null);
  };
  const pickJoinTile = (id: string | null) => {
    if (!id) {
      cancelJoin();
      return;
    }
    const now = performance.now();
    if (id === (linkB || linkA) && now - joinPickAt.current < 800) return;
    joinPickAt.current = now;
    if (!linkA || linkB) {
      setLinkA(id);
      setLinkB("");
    } else if (linkA === id) setLinkA("");
    else {
      setLinkB(id);
      rememberFaces(linkA, id);
    }
    setSelectedJoin(null);
    setHybridOffer(null);
    setHybridPlacement(null);
  };
  const chooseStrategyMode = (next: StrategyMode) => {
    if (next !== "site-network") setNetworkRunning(false);
    setStrategyMode(next);
    setMode(strategyCamera(next));
  };
  const runNetwork = () => {
    const study = networkStudy;
    if (!study || !study.canRun) return;
    study.resume();
    setNetworkRunning(true);
  };
  const pauseNetwork = () => setNetworkRunning(false);
  const resetNetwork = () => {
    networkStudy?.reset();
    setNetworkRunning(false);
  };
  const clearNetworkNodes = () => networkStudy?.clearNodes();
  const deleteNetworkNode = () => {
    const selected = networkStudy?.edit.selectedId;
    if (selected) networkStudy?.remove(selected);
  };
  const selectNetworkNode = (id: string) => networkStudy?.select(id);
  const rememberIteration = (iteration: NetworkIteration) => {
    setIterations((current) => {
      const next = current.some((item) => item.id === iteration.id)
        ? current.map((item) => item.id === iteration.id ? iteration : item)
        : [...current, iteration];
      return next.sort((a, b) => a.index - b.index);
    });
    saveNetworkIteration(iteration).catch(() => {});
  };
  useEffect(() => {
    const iteration = iterations.find((item) => item.id === massingId);
    if (!iteration || iteration.generator === "agents" || (iteration.branches && iteration.branches.length > 0)) {
      if (iteration?.branches && iteration.branches.length > 0) setBranchNote(null);
      return;
    }
    if (branchMiss.current.has(iteration.id)) {
      setBranchNote("This saved iteration has no branch record, and running it again does not reproduce the same network. No pockets were invented from the grid.");
      return;
    }
    let cancel = false;
    setBranchNote("Reading this iteration's branches so Zoning uses the same network.");
    runNetworkIteration(site.site.ring, site.water.ring, iteration.nodes, iteration.seed, undefined, site.buildings).then((fresh) => {
      if (cancel) return;
      if (!fresh.branches || fresh.branches.length === 0 || !trailsAgree(iteration.trails, fresh.trails)) {
        branchMiss.current.add(iteration.id);
        setBranchNote("This saved iteration has no branch record, and running it again does not reproduce the same network. No pockets were invented from the grid.");
        return;
      }
      rememberIteration({ ...iteration, branches: fresh.branches });
      setBranchNote(null);
    }).catch(() => {
      if (!cancel) setBranchNote("The selected network's branches could not be read.");
    });
    return () => { cancel = true; };
  }, [massingId, iterations]);
  useEffect(() => {
    setPocketSelection([]);
    setPocketHover(null);
  }, [massingId]);
  const generateIterations = async (count: 10 | 20 | 30) => {
    const study = networkStudy;
    if (!study || !study.canRun || iterationBatch) return;
    const token = iterationToken.current + 1;
    iterationToken.current = token;
    const nodes = study.edit.nodes.map((node) => ({ ...node }));
    const start = iterationsRef.current.reduce((max, item) => Math.max(max, item.index), 0);
    setIterationBatch({ done: 0, total: count, step: 0 });
    for (let n = 0; n < count; n += 1) {
      if (iterationToken.current !== token) return;
      const seed = (20261105 + (start + n + 1) * 104729) >>> 0;
      const iteration = await runNetworkIteration(site.site.ring, site.water.ring, nodes, seed, (step) => {
        if (iterationToken.current === token) setIterationBatch({ done: n, total: count, step });
      }, site.buildings);
      if (iterationToken.current !== token) return;
      iteration.index = start + n + 1;
      iteration.id = `i${iteration.index}-${seed}`;
      rememberIteration(iteration);
      setIterationBatch({ done: n + 1, total: count, step: iteration.step });
      if (n === count - 1 && iterationToken.current === token) setIterationView(iteration.id);
    }
    if (iterationToken.current === token) setIterationBatch(null);
  };
  const regenerateIteration = async (id: string) => {
    const current = iterations.find((item) => item.id === id);
    if (!current || iterationBatch) return;
    const token = iterationToken.current + 1;
    iterationToken.current = token;
    const used = new Set(iterations.map((item) => item.seed));
    let seed = (current.seed + 104729) >>> 0;
    while (used.has(seed)) seed = (seed + 104729) >>> 0;
    setIterationBatch({ done: 0, total: 1, step: 0 });
    const iteration = await runNetworkIteration(site.site.ring, site.water.ring, current.nodes, seed, (step) => {
      if (iterationToken.current === token) setIterationBatch({ done: 0, total: 1, step });
    }, site.buildings);
    if (iterationToken.current !== token) return;
    iteration.id = current.id;
    iteration.index = current.index;
    rememberIteration(iteration);
    setIterationBatch(null);
  };
  const toggleIterationCompare = (id: string) => {
    setIterationCompare((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const clearIterations = () => {
    iterationToken.current += 1;
    setIterations([]);
    setIterationView(null);
    setIterationCompare([]);
    setIterationBatch(null);
    clearNetworkIterations().catch(() => {});
  };

  const networkAnalysis = useMemo(() => {
    if (!analysisOn || !networkStudy) return null;
    if (analysisMode === "overlay") {
      const selected = iterations.filter((item) => iterationCompare.includes(item.id));
      return analyzeNetwork("overlay", selected, networkStudy.frame);
    }
    const viewed = iterations.find((item) => item.id === iterationView) ?? null;
    if (!viewed) return null;
    return analyzeNetwork(analysisMode, [viewed], networkStudy.frame);
  }, [analysisOn, analysisMode, networkStudy, iterations, iterationView, iterationCompare]);
  const networkFiguresView = useMemo(() => {
    if (!networkStudy) return null;
    const viewed = iterations.find((item) => item.id === iterationView) ?? iterations[0];
    if (!viewed) return null;
    return networkFigures(viewed, networkStudy.frame);
  }, [networkStudy, iterations, iterationView]);
  useEffect(() => {
    const view = networkView.current;
    if (!view || sheet !== "strategy" || strategyMode !== "site-network") {
      view?.style.removeProperty("--network-overlap");
      view?.style.removeProperty("--network-panel-scale");
      return;
    }
    // The marked line is 77.8% across the frame. The panel grows left to that line
    // and covers the view; the center column, and the site in it, stay put.
    const panelLeft = 0.778;
    const measure = () => {
      const panel = view.querySelector(".site-panel-analysis");
      if (!(panel instanceof HTMLElement) || view.clientWidth < 2) return;
      const viewRect = view.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const scale = viewRect.width / Math.max(1, view.offsetWidth);
      const applied = Number.parseFloat(view.style.getPropertyValue("--network-overlap")) || 0;
      const cellLeft = panelRect.left + applied * scale;
      const overlap = Math.max(0, (cellLeft - (viewRect.left + viewRect.width * panelLeft)) / scale);
      const next = `${Math.round(overlap)}px`;
      if (view.style.getPropertyValue("--network-overlap") !== next) view.style.setProperty("--network-overlap", next);
      view.style.removeProperty("--network-panel-scale");
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    return () => observer.disconnect();
  }, [sheet, strategyMode]);

  const analysisNotice = !analysisOn
    ? null
    : networkAnalysis
      ? null
      : analysisMode === "overlay"
        ? "Compare two iterations."
        : "Select an iteration.";
  const strategyIteration = iterations.find((item) => item.id === iterationView) ?? null;
  const massingIteration = iterations.find((item) => item.id === massingId) ?? null;
  const viewedIteration = massingIteration;
  const canvasIteration = sheet === "strategy" ? strategyIteration : massingIteration;
  const massingLabel = massingIteration ? `Iteration ${massingIteration.index} · ${massingIteration.id}` : massingId;
  const liveReport = iterationView === null && networkStudy?.generator === "flow" ? networkStudy.flowReport() : null;
  const liveReady = iterationView === null && ((liveReport?.surviving ?? 0) > 0 || (networkStudy?.generator === "agents" && networkStudy.status.step > 0));
  const liveAlreadySent = Boolean(
    liveReady && massingIteration && networkStudy
    && massingIteration.seed === (networkStudy as unknown as { seed: number }).seed
    && massingIteration.step === networkStudy.status.step
    && (massingIteration.branches?.length ?? 0) === (liveReport?.surviving ?? 0),
  );
  const useNetworkForMassing = () => {
    let iteration = strategyIteration;
    let captured: NetworkIteration | null = null;
    if (!iteration && networkStudy && iterationView === null) {
      const snap = captureNetworkIteration(networkStudy);
      const grown = (snap.branches?.length ?? 0) > 0 || (snap.generator === "agents" && snap.step > 0);
      const existing = grown ? iterations.find((item) => item.seed === snap.seed && item.step === snap.step && (item.branches?.length ?? 0) === (snap.branches?.length ?? 0)) : null;
      if (existing) iteration = existing;
      else if (grown) {
        const index = iterations.reduce((max, item) => Math.max(max, item.index), 0) + 1;
        snap.index = index;
        snap.id = `i${index}-${snap.seed}`;
        captured = snap;
        iteration = snap;
      }
    }
    if (!iteration && iterationView === null && iterations.length > 0) {
      iteration = iterations[iterations.length - 1];
    }
    if (!iteration || iteration.id === massingId) return;
    const hasWork = zones.length > 0 || instances.length > 0 || assemblies.length > 0;
    if (massingId && hasWork) {
      const previous = iterations.find((item) => item.id === massingId);
      const accepted = window.confirm(`Use iteration ${iteration.index} for massing? Zoning and tiles stay. Work stored on ${previous ? `iteration ${previous.index}` : "the previous network"} remains.`);
      if (!accepted) return;
    }
    if (captured) rememberIteration(captured);
    if (iterationView === null) setIterationView(iteration.id);
    setMassingId(iteration.id);
  };
  const pocketReport = useMemo(() => detectPockets(viewedIteration?.branches ?? [], site.site.ring), [viewedIteration]);
  const pocketKinds = useMemo(() => {
    const kinds: Record<string, SiteZoneKind | null> = {};
    for (const pocket of pocketReport.pockets) {
      const level = zones.filter((zone) => zone.pocketId === pocket.id && zone.networkId === viewedIteration?.id).sort((a, b) => a.baseFt - b.baseFt)[0];
      kinds[pocket.id] = level?.kind ?? null;
    }
    return kinds;
  }, [pocketReport, viewedIteration, zones]);
  const visibleZones = zones.filter((zone) => !zone.networkId || zone.networkId === massingId);
  const placementZone = visibleZones.find((zone) => zone.id === zoneSelection)
    ?? visibleZones.filter((zone) => zone.pocketId && pocketSelection.includes(zone.pocketId)).sort((a, b) => a.baseFt - b.baseFt)[0]
    ?? null;
  placementYRef.current = MODULE_GROUND_Y + (placementZone?.baseFt ?? 0);
  const tileReports = useMemo(() => reportTiles(sceneInstances, visibleZones), [sceneInstances, visibleZones]);
  tileReportRef.current = tileReports;
  const shownWarnings = useMemo(() => {
    const next: typeof warnings = { ...warnings };
    for (const [id, report] of Object.entries(tileReports)) {
      next[id] = { ...(next[id] ?? { outside: false, overlap: false }), zoneMismatch: report.mismatch, unsupported: report.unsupported };
    }
    return next;
  }, [tileReports, warnings]);
  const selectedZone = zones.find((zone) => zone.id === zoneSelection) ?? null;
  const zoneGuide = useMemo(() => {
    const empty = { branchFt: null as number | null, junctionFt: null as number | null, accessFt: null as number | null, waterFt: null as number | null, facing: null as ReturnType<typeof zoneFacing>, outsideParcel: false, inWater: false };
    if (!selectedZone) return empty;
    const flags = zoneSiteFlags(selectedZone.points, site.site.ring, site.water.ring);
    const center = polygonCentroid(selectedZone.points);
    const waterFt = distanceToRing(center, site.water.ring);
    const facing = zoneFacing(center, site.site.ring, site.water.ring);
    if (!viewedIteration || !networkStudy) return { ...empty, ...flags, waterFt, facing };
    if (viewedIteration.branches && viewedIteration.branches.length > 0) {
      return {
        ...flags,
        waterFt,
        facing,
        branchFt: distanceToBranches(center, viewedIteration.branches),
        junctionFt: nearestDistance(center, branchJunctions(viewedIteration.branches)),
        accessFt: nearestDistance(center, viewedIteration.nodes.filter((node) => node.id.includes("pedestrian")).map((node) => ({ x: node.x, z: node.z }))),
      };
    }
    const floor = viewedIteration.generator === "agents" ? 0.02 : FLOW_SURVIVE;
    const samples = networkSamples(viewedIteration.trails, viewedIteration.inkSize, networkStudy.frame, floor);
    const access = viewedIteration.nodes.filter((node) => node.id.includes("pedestrian")).map((node) => ({ x: node.x, z: node.z }));
    return {
      ...flags,
      waterFt,
      facing,
      branchFt: nearestDistance(center, samples),
      junctionFt: nearestDistance(center, samples.filter((sample) => sample.junction)),
      accessFt: nearestDistance(center, access),
    };
  }, [networkStudy, selectedZone, viewedIteration]);
  const zoneTotals = useMemo(() => {
    const totals: Record<SiteZoneKind, number> = { lobby: 0, gathering: 0, workspace: 0 };
    const counts: Record<SiteZoneKind, number> = { lobby: 0, gathering: 0, workspace: 0 };
    for (const zone of zones) {
      if (zone.networkId && zone.networkId !== massingId) continue;
      totals[zone.kind] += polygonAreaSqFt(zone.points);
      counts[zone.kind] += 1;
    }
    return { totals, counts };
  }, [zones, massingId]);
  const pickPocket = (id: string) => {
    setZoneTool("select");
    const adding = !pocketSelection.includes(id);
    setPocketSelection((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    const level = zones.find((zone) => zone.pocketId === id && zone.networkId === massingId);
    setZoneSelection(adding ? (level?.id ?? null) : null);
  };
  const saveZoning = () => {
    if (pocketSelection.length > 0) assignPockets(zoneKind);
    saveConfiguration(false);
  };
  const assignPockets = (kind: SiteZoneKind) => {
    setZoneKind(kind);
    if (pocketSelection.length === 0) return;
    const label = ZONE_KINDS.find((item) => item.id === kind)?.label ?? "Zone";
    let named = zones.filter((zone) => zone.kind === kind).length;
    let next = zones.filter((zone) => !(zone.networkId === massingId && zone.pocketId && pocketSelection.includes(zone.pocketId)));
    for (const id of pocketSelection) {
      const pocket = pocketReport.pockets.find((item) => item.id === id);
      if (!pocket) continue;
      const existing = zones.filter((zone) => zone.networkId === massingId && zone.pocketId === id);
      if (existing.length === 0) {
        const regionId = `z${zoneSerial.current}`;
        zoneSerial.current += 1;
        named += 1;
        next = [...next, {
          id: regionId,
          name: `${label} ${named}`,
          kind,
          points: pocket.points.map((point) => ({ ...point })),
          baseFt: 0,
          heightFt: 12,
          visible: true,
          networkId: massingId,
          pocketId: id,
        }];
        setZoneSelection(regionId);
      } else {
        next = [...next, ...existing.map((zone) => ({
          ...zone,
          kind,
          name: ZONE_KINDS.reduce((name, item) => name.startsWith(item.label) ? `${label}${name.slice(item.label.length)}` : name, zone.name),
          points: pocket.points.map((point) => ({ ...point })),
        }))];
        setZoneSelection(existing[0].id);
      }
    }
    replaceZones(next);
  };
  const clearPockets = () => {
    replaceZones(zones.filter((zone) => !(zone.networkId === massingId && zone.pocketId && pocketSelection.includes(zone.pocketId))));
    setZoneSelection(null);
  };
  const addPocketLevel = () => {
    const kind = zoneKind;
    const label = ZONE_KINDS.find((item) => item.id === kind)?.label ?? "Zone";
    let next = [...zones];
    for (const id of pocketSelection) {
      const pocket = pocketReport.pockets.find((item) => item.id === id);
      if (!pocket) continue;
      const levels = zones.filter((zone) => zone.networkId === massingId && zone.pocketId === id);
      const top = levels.reduce((highest, zone) => Math.max(highest, zone.baseFt + zone.heightFt), 0);
      const regionId = `z${zoneSerial.current}`;
      zoneSerial.current += 1;
      next = [...next, {
        id: regionId,
        name: `${label} ${top}`,
        kind,
        points: pocket.points.map((point) => ({ ...point })),
        baseFt: top,
        heightFt: 12,
        visible: true,
        networkId: massingId,
        pocketId: id,
      }];
      setZoneSelection(regionId);
    }
    replaceZones(next);
  };
  const zoneMismatch = !selectedZone ? null : selectedZone.networkId && selectedZone.networkId !== massingId
    ? `This region was drawn on ${iterations.find((item) => item.id === selectedZone.networkId)?.index != null ? `iteration ${iterations.find((item) => item.id === selectedZone.networkId)?.index}` : "a network that is not in this list"}. It was not deleted or redrawn.`
    : null;
  const workflowTiles = placed.map((item) => ({ id: item.instanceId, name: item.name }));
  const chosenA = workflowTiles.some((tile) => tile.id === linkA) ? linkA : "";
  const chosenB = workflowTiles.some((tile) => tile.id === linkB) ? linkB : "";
  const joinProposal = useMemo(() => {
    const first = placed.find((item) => item.instanceId === chosenA);
    const second = placed.find((item) => item.instanceId === chosenB);
    if (!first || !second) return null;
    return proposeDirectJoin(first, second, tilePositions(meshes, first), tilePositions(meshes, second));
  }, [chosenA, chosenB, meshes, placed]);
  const joinOverlay = useMemo(() => {
    const highlights: ReturnType<typeof proposeDirectJoin>["highlights"] = [];
    const passages: { id: string; positions: number[]; indices: number[]; preview: boolean }[] = [];
    for (const link of connections) {
      if (link.passage) passages.push({ id: link.id, positions: link.passage.positions, indices: link.passage.indices, preview: false });
    }
    if (joinMode === "hybrid" && hybridPlacement) passages.push({ id: "hybrid-preview", positions: hybridPlacement.passage.positions, indices: hybridPlacement.passage.indices, preview: true });
    for (let index = 0; index < placed.length; index += 1) {
      for (let other = index + 1; other < placed.length; other += 1) {
        const first = placed[index];
        const second = placed[other];
        const selected = (first.instanceId === chosenA && second.instanceId === chosenB) || (first.instanceId === chosenB && second.instanceId === chosenA);
        const stored = connections.some((link) => link.mode === "direct" && ((link.tileA === first.instanceId && link.tileB === second.instanceId) || (link.tileA === second.instanceId && link.tileB === first.instanceId)));
        const result = proposeDirectJoin(first, second, tilePositions(meshes, first), tilePositions(meshes, second));
        if (!result.faceA) continue;
        if (selected) {
          highlights.push(...result.highlights);
          if (joinMode === "direct" && result.passage && !stored) passages.push({ id: "preview", positions: result.passage.positions, indices: result.passage.indices, preview: true });
        } else {
          const face = result.highlights.find((mark) => mark.kind === "face");
          if (face) highlights.push({ ...face, compatible: stored && result.valid });
        }
      }
    }
    return { highlights, passages };
  }, [chosenA, chosenB, connections, hybridPlacement, joinMode, meshes, placed]);

  return (
    <main
      ref={networkView}
      className="site-view"
      data-panels="model"
      data-sheet={sheet === "strategy" && strategyMode === "site-network" ? "network" : sheet}
    >
      <SiteWorkflowNav step={sheet} onChange={chooseSheet} />
      <aside className="site-panel site-panel-library" aria-label={sheet === "strategy" ? "Site strategy" : sheet === "zoning" ? "Zoning" : sheet === "assembly" ? "Assembly" : "Library and project"}>
            {sheet === "strategy" ? (
              <div className={strategyMode === "site-network" ? "site-strategy-body" : "site-sim"}>
              <SiteStrategyPanel
                mode={strategyMode}
                onMode={chooseStrategyMode}
                network={{
                  study: networkStudy,
                  running: networkRunning,
                  tool: networkTool,
                  onTool: setNetworkTool,
                  onRun: runNetwork,
                  onPause: pauseNetwork,
                  onReset: resetNetwork,
                  onClear: clearNetworkNodes,
                  onDelete: deleteNetworkNode,
                  onSelect: selectNetworkNode,
                }}
              />
              </div>
            ) : sheet === "zoning" ? (
              <div className="site-strategy-body">
                <SiteZoningPanel
                  kind={zoneKind}
                  onKind={(kind) => { setZoneKind(kind); if (massingId) { setZoneTool("draw"); setMode("plan"); } }}
                  tool={zoneTool}
                  onTool={(tool) => { setZoneTool(tool); if (tool === "draw") setMode("plan"); }}
                  zones={visibleZones}
                  selectedId={zoneSelection}
                  hasNetwork={massingId !== null}
                  networkLabel={massingIteration ? `Iteration ${massingIteration.index} · ${massingIteration.id}` : "None"}
                  plan={mode === "plan"}
                  canFinish={zoneDraft.length >= 3}
                  onFinish={() => finishZoneDraft(zoneDraft)}
                  notice={zoneNotice}
                  deleteId={zoneDeleteId}
                  onSelect={(id) => {
                    setZoneTool((current) => current === "draw" ? "select" : current);
                    const zone = zones.find((item) => item.id === id);
                    if (zone?.pocketId) {
                      pickPocket(zone.pocketId);
                      return;
                    }
                    setZoneSelection(id);
                  }}
                  onVisible={(id) => replaceZones(zones.map((zone) => zone.id === id ? { ...zone, visible: !zone.visible } : zone))}
                  onDuplicate={duplicateZone}
                  onAskDelete={setZoneDeleteId}
                  onConfirmDelete={(id) => {
                    replaceZones(zones.filter((zone) => zone.id !== id));
                    setZoneSelection((current) => current === id ? null : current);
                    setZoneDeleteId(null);
                  }}
                  onCancelDelete={() => setZoneDeleteId(null)}
                  onStrategy={() => chooseSheet("strategy")}
                  pockets={pocketReport.pockets.map((pocket) => {
                    const levels = zones.filter((zone) => zone.pocketId === pocket.id && zone.networkId === massingId);
                    return { id: pocket.id, area: polygonAreaSqFt(pocket.points), kind: pocketKinds[pocket.id] ?? null, levels: levels.length };
                  })}
                  pocketSelection={pocketSelection}
                  openSegments={pocketReport.openSegments}
                  branchNote={branchNote}
                  onPickPocket={pickPocket}
                  onChooseKind={setZoneKind}
                  onAssign={saveZoning}
                  onClearPockets={clearPockets}
                  onAddLevel={addPocketLevel}
                />
              </div>
            ) : sheet === "assembly" ? (
              <div className="site-strategy-body">
                <SiteAssemblyStep
                  tiles={workflowTiles}
                  tileA={chosenA}
                  tileB={chosenB}
                  mode={joinMode}
                  proposal={joinProposal ? joinSummary(joinProposal) : "Select two tiles that share a face."}
                  canJoin={joinProposal?.valid === true}
                  faces={SITE_FACES.map((face) => ({ id: face, label: siteFaceLabel(face) }))}
                  faceA={hybridFaceA}
                  faceB={hybridFaceB}
                  hybridNote={hybridNote}
                  hybridBusy={hybridBusy}
                  candidates={hybridOffer?.candidates ?? []}
                  selectedCandidate={hybridCandidate}
                  canAddHybrid={hybridPlacement !== null}
                  connections={connections}
                  selectedConnection={selectedJoin}
                  onMode={(mode) => { setJoinMode(mode); setHybridPlacement(null); }}
                  onTileA={(id) => { setLinkA(id); setSelectedJoin(null); rememberFaces(id, linkB); }}
                  onTileB={(id) => { setLinkB(id); setSelectedJoin(null); rememberFaces(linkA, id); }}
                  onFaceA={(id) => { if (SITE_FACES.includes(id as SiteFace)) { setHybridFaceA(id as SiteFace); setHybridOffer(null); setHybridPlacement(null); } }}
                  onFaceB={(id) => { if (SITE_FACES.includes(id as SiteFace)) { setHybridFaceB(id as SiteFace); setHybridOffer(null); setHybridPlacement(null); } }}
                  onJoin={confirmJoin}
                  onFindHybrids={() => void findHybrids()}
                  onCandidate={previewHybrid}
                  onAddHybrid={confirmHybrid}
                  onCancel={cancelJoin}
                  onSelectConnection={(id) => {
                    const link = connections.find((item) => item.id === id);
                    setSelectedJoin(id);
                    if (!link) return;
                    setLinkA(link.tileA);
                    setLinkB(link.tileB);
                  }}
                  onRemove={(id) => {
                    setConnections((current) => current.filter((link) => link.id !== id));
                    setSelectedJoin((current) => current === id ? null : current);
                  }}
                  showSiteLayers={showZones && showTrails}
                  onShowSiteLayers={(visible) => {
                    setShowZones(visible);
                    setShowTrails(visible);
                  }}
                />
              </div>
            ) : (
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
              <h3 className="site-subtitle">Zones</h3>
              {pocketReport.pockets.every((pocket) => !visibleZones.some((zone) => zone.pocketId === pocket.id)) ? (
                <p className="site-note">No zone is selected. The full library stays open.</p>
              ) : (
                <ul className="site-strategy-nodes">
                  {pocketReport.pockets.flatMap((pocket) => {
                    const levels = visibleZones.filter((zone) => zone.pocketId === pocket.id);
                    if (levels.length === 0) return [];
                    const lowest = [...levels].sort((a, b) => a.baseFt - b.baseFt)[0];
                    const top = levels.reduce((highest, zone) => Math.max(highest, zone.baseFt + zone.heightFt), 0);
                    return [(
                      <li key={pocket.id}>
                        <button type="button" data-kind={lowest.kind} data-active={pocketSelection.includes(pocket.id) || undefined} onClick={() => pickPocket(pocket.id, false)}>
                          <i />
                          <b>{ZONE_KINDS.find((item) => item.id === lowest.kind)?.label}</b>
                          <span>{Math.round(polygonAreaSqFt(pocket.points)).toLocaleString("en-US")} ft² · {lowest.baseFt}–{top} ft</span>
                        </button>
                      </li>
                    )];
                  })}
                </ul>
              )}
              {placementZone ? (
                <p className="site-note">
                  {ZONE_KINDS.find((item) => item.id === placementZone.kind)?.label} · {Math.round(polygonAreaSqFt(placementZone.points)).toLocaleString("en-US")} ft² · {placementZone.baseFt}–{placementZone.baseFt + placementZone.heightFt} ft. The boundary stays on the plan.
                </p>
              ) : null}
              <label className="site-connection-field">
                Zone opacity
                <input aria-label="Zone opacity" type="range" min={0} max={0.6} step={0.02} value={zoneOpacity} onChange={(event) => setZoneOpacity(Number(event.target.value))} />
              </label>
              <h3 className="site-subtitle">Modules</h3>
              {placementZone ? (
                <button type="button" aria-pressed={libraryAll} data-active={libraryAll || undefined} onClick={() => setLibraryAll((value) => !value)}>
                  {libraryAll ? "Showing every program" : `Filtered to ${ZONE_KINDS.find((item) => item.id === placementZone.kind)?.label}`}
                </button>
              ) : null}
              {armed && placementZone && armed.program && armed.program !== placementZone.kind ? (
                <p className="site-note site-alert">{PROGRAM_LABEL[armed.program]} does not match this {PROGRAM_LABEL[placementZone.kind]} zone. Placement stays available.</p>
              ) : null}
              <div className="site-module-rows">
              {SITE_PROGRAMS.map((program) => {
                const entries = SITE_ARCHETYPES.filter((entry) => entry.program === program && (libraryAll || !placementZone || program === placementZone.kind));
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
            )}

      </aside>
      <section className="site-stage" aria-label="Current configuration">
        <div className="site-frame">
          <header className="site-frame-bar">
            {sheet === "strategy" ? (
              <div className="site-frame-name site-sim">
                <h2 className="site-subtitle">{strategyMode === "site-network" ? "Site network" : STRATEGY_MODES.find((item) => item.id === strategyMode)?.title}</h2>
                {strategyMode === "site-network" ? (
                  <div className="site-modes">
                    <button type="button" disabled={!networkStudy && !strategyIteration} title={!networkStudy && !strategyIteration ? "Run the network, or select a saved iteration." : undefined} aria-pressed={strategyIteration?.id === massingId || liveAlreadySent} data-active={strategyIteration?.id === massingId || liveAlreadySent || undefined} onClick={useNetworkForMassing}>Use Network for Massing</button>
                  </div>
                ) : null}
                {massingLabel ? <p className="site-note">Massing network {massingLabel}</p> : null}
              </div>
            ) : sheet === "zoning" ? (
              <div className="site-frame-name site-sim">
                <h2 className="site-subtitle">Zoning</h2>
                <p className="site-note">{massingLabel ? `Network ${massingLabel}` : "No massing network"}</p>
                <div className="site-modes">
                  <button type="button" disabled={history.undo.length === 0} onClick={undo}>Undo</button>
                  <button type="button" disabled={history.redo.length === 0} onClick={redo}>Redo</button>
                  <button type="button" onClick={saveZoning}>Save</button>
                </div>
              </div>
            ) : sheet === "assembly" ? (
              <div className="site-frame-name site-sim">
                <h2 className="site-subtitle">Assembly</h2>
                <p className="site-note">{massingLabel ? `Network ${massingLabel}` : "No massing network"}</p>
              </div>
            ) : (
            <>
            <div className="site-frame-name">
              <h2 className="site-subtitle">Current configuration</h2>
              <p className="site-note">{massingLabel ? `Network ${massingLabel}` : "No massing network"}</p>
              {armed && faceMatch?.valid ? <p className="site-note">{autoMatch ? "Auto-match" : "Manual"} {faceMatch.rank}/{faceMatch.total} · {faceMatch.pair} · {faceMatch.score >= 8 ? "Good" : "Partial"}{faceMatch.neighborName ? ` · ${faceMatch.neighborName}` : ""}</p> : null}
              {armed && faceMatch && !faceMatch.valid && faceMatch.warning ? <p className="site-note site-alert">{faceMatch.warning}</p> : null}
              <input aria-label="Configuration name" value={configName} onChange={(event) => setConfigName(event.target.value)} />
              {unsavedChanges ? <span className="site-pending">Unsaved</span> : null}
              <div className="site-modes">
                <button type="button" onClick={() => saveConfiguration(false)}>Save</button>
                <button type="button" onClick={() => duplicateConfiguration()}>Duplicate</button>
                <button type="button" disabled={!savedConfiguration} onClick={() => savedConfiguration && deleteSavedConfiguration(savedConfiguration.id)}>Delete</button>
              </div>
            </div>
            <div className="site-modes site-frame-tools">
              <button type="button" aria-pressed={snap} data-active={snap || undefined} onClick={() => setSnap((value) => !value)}>Snap</button>
              <button type="button" aria-pressed={autoMatch} data-active={autoMatch || undefined} onClick={() => setAutoMatch((value) => { if (value) { setManualPose(faceMatch?.pose ?? manualPose ?? { rotationY: 0, mirror: null }); return false; } setManualPose(null); setMatchCycle(0); return true; })}>Auto-match</button>
              <button type="button" disabled={!armed} onClick={() => { const shown = manualPose ?? faceMatch?.pose ?? { rotationY: 0, mirror: null }; setAutoMatch(false); setManualPose({ rotationY: shown.rotationY + Math.PI / 2, mirror: shown.mirror }); }}>90°</button>
              <button type="button" aria-pressed={manualPose?.mirror === "x"} disabled={!armed} onClick={() => { const shown = manualPose ?? faceMatch?.pose ?? { rotationY: 0, mirror: null }; setAutoMatch(false); setManualPose({ rotationY: shown.rotationY, mirror: shown.mirror === "x" ? null : "x" }); }}>Mirror east</button>
              <button type="button" aria-pressed={manualPose?.mirror === "z"} disabled={!armed} onClick={() => { const shown = manualPose ?? faceMatch?.pose ?? { rotationY: 0, mirror: null }; setAutoMatch(false); setManualPose({ rotationY: shown.rotationY, mirror: shown.mirror === "z" ? null : "z" }); }}>Mirror north</button>
              <button type="button" disabled={!faceMatch || faceMatch.total < 2} onClick={() => { setAutoMatch(true); setManualPose(null); setMatchCycle((index) => index + 1); }}>Next match</button>
              <button type="button" aria-pressed={showGrid} data-active={showGrid || undefined} onClick={() => setShowGrid((value) => !value)}>Grid</button>
              <button type="button" disabled={history.undo.length === 0} onClick={undo}>Undo</button>
              <button type="button" disabled={history.redo.length === 0} onClick={redo}>Redo</button>
            </div>
            </>
            )}
          </header>
          <div className="site-viewport">
            <SiteViewport
              context={site}
              mode={mode}
              planHeading={planHeading}
              fit={fit}
              appearance="model"
              framing="record"
              presentation="analysis"
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
              zones={showZones ? visibleZones : []}
              zoning={sheet === "zoning" || sheet === "placement" || sheet === "assembly" ? {
                tool: zoneTool,
                mode,
                active: sheet === "zoning",
                draft: zoneDraft,
                selectedId: zoneSelection,
                onDraftPoint: addZonePoint,
                onCloseDraft: closeZoneDraft,
                onSelect: (id) => {
                  setZoneSelection(id);
                  const zone = zones.find((item) => item.id === id);
                  if (zone?.pocketId) setPocketSelection([zone.pocketId]);
                  if (!id) setPocketSelection([]);
                },
                onCommitPoints: commitZonePoints,
                onCommitElevation: commitZoneElevation,
                onReject: setZoneNotice,
                pockets: {
                  items: showZones ? pocketReport.pockets : [],
                  kinds: pocketKinds,
                  hoverId: pocketHover,
                  selectedIds: pocketSelection,
                  onHover: setPocketHover,
                  onPick: pickPocket,
                  listen: sheet !== "assembly" && !(sheet === "placement" && Boolean(armed || armedAssembly)),
                  opacity: sheet === "placement" || sheet === "assembly" ? zoneOpacity : null,
                },
              } : null}
              connections={connectionLines}
              joins={sheet === "assembly" ? joinOverlay : null}
              network={
                networkStudy
                  ? {
                    study: networkStudy,
                    running: sheet === "strategy" && networkRunning && iterationView === null,
                    tool: networkTool,
                    onSettle: pauseNetwork,
                    preview: canvasIteration?.branches?.length ? null : sheet === "strategy" && networkAnalysis ? null : canvasIteration?.trails ?? null,
                    branches: canvasIteration?.branches ?? null,
                    colored: sheet === "strategy" ? networkAnalysis?.rgba ?? null : null,
                    showField: sheet === "strategy" && showField,
                    showTrails: sheet !== "strategy" && !massingIteration ? false : showTrails,
                    showContext: showContext && (sheet === "strategy" || sheet === "zoning" || sheet === "placement" || sheet === "assembly"),
                    interactive: sheet === "strategy",
                    studyTone: true,
                  }
                  : null
              }
              placement={{
                ring: designSite.ring,
                waterRing: visibleWater,
                armedModuleId: armed ? armed.moduleId : armedAssembly ? "assembly" : null,
                canPlace: Boolean(armed || armedAssembly),
                meshes: loadedMeshes,
                instances: showTiles ? sceneInstances : [],
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
                editable: sheet === "placement",
                warnings: shownWarnings,
                elevation: placementYRef.current,
                autoMatch,
                manualPose,
                matchCycle,
                onMatch: (match) => setFaceMatch((current) => current?.warning === match?.warning && current?.rank === match?.rank && current?.pair === match?.pair && current?.x === match?.x && current?.y === match?.y && current?.z === match?.z && current?.pose.rotationY === match?.pose.rotationY && current?.pose.mirror === match?.pose.mirror ? current : match),
                onEmpty: (x, z) => {
                  const pocket = pocketReport.pockets.find((item) => pointInRing(x, z, item.points.map((point) => [point.x, point.z])));
                  if (!pocket) {
                    setPocketSelection([]);
                    setZoneSelection(null);
                    return;
                  }
                  pickPocket(pocket.id, false);
                },
                annotations: drawnNotes,
                onPlace: placeModule,
                onAnnotate: annotate,
                onSelect: (id) => sheet === "assembly" ? pickJoinTile(id) : chooseSelection(id),
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
            <div className="site-modes site-network-layers" role="group" aria-label="Layers">
              {sheet === "strategy" ? <button type="button" title={SOURCE_CONTOUR_NOTE} data-active={showField || undefined} onClick={() => setShowField((value) => !value)}>Field</button> : null}
              <button type="button" title={sheet === "strategy" ? "Selected iteration" : massingLabel ? `Massing network ${massingLabel}` : "No massing network"} data-active={showTrails || undefined} onClick={() => setShowTrails((value) => !value)}>Network</button>
              <button type="button" data-active={showZones || undefined} onClick={() => setShowZones((value) => !value)}>Zones</button>
              <button type="button" data-active={showTiles || undefined} onClick={() => setShowTiles((value) => !value)}>Tiles</button>
              <button type="button" data-active={showConnections || undefined} onClick={() => setShowConnections((value) => !value)}>Connections</button>
              {sheet === "strategy" || sheet === "zoning" ? <button type="button" data-active={showContext || undefined} onClick={() => setShowContext((value) => !value)}>Context</button> : null}
            </div>
            <div className="site-modes site-frame-views" role="group" aria-label="Camera">
              {(sheet === "placement" ? [...MODES, { id: "section" as const, label: "Section" }] : MODES).map((item) => (
                <button key={item.id} type="button" data-active={mode === item.id || undefined} onClick={() => chooseMode(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {sheet === "placement" ? (
        <p className="site-help">
          {mode === "plan"
            ? "Plan starts north-up. Click the north arrow to switch between north-up and east-up. Right-drag pans. Ctrl+Shift+right turns the plan. Ctrl+right or the wheel zooms."
            : mode === "axon"
              ? "Parallel view. Right-drag pans. Ctrl+Shift+right turns it. Ctrl+right or the wheel zooms."
              : "Right-drag orbits. Shift+right pans. Ctrl+right or the wheel zooms."}
          {" "}
          <>Click a module in the library, then click the site. The ghost is the real mesh. Left-click selects a placed tile. Left-drag moves it. Stack above and stack below offset by 20 ft, and the upper tile can shift sideways.</>
        </p>
        ) : null}
      </section>
    
      <aside className="site-panel site-panel-analysis">
            {sheet === "strategy" ? (
              <div className={strategyMode === "site-network" ? "site-network-side" : "site-sim"}>
                {strategyMode === "site-network" && networkStudy ? (
                  <>
                  <SiteNetworkIterations
                    study={networkStudy}
                    iterations={iterations}
                    viewId={iterationView}
                    compareIds={iterationCompare}
                    batch={iterationBatch}
                    onGenerate={(count) => { void generateIterations(count); }}
                    onView={setIterationView}
                    onToggleCompare={toggleIterationCompare}
                    onRegenerate={(id) => { void regenerateIteration(id); }}
                    onClear={clearIterations}
                  />
                  <SiteNetworkAnalysisPanel
                    mode={analysisMode}
                    active={analysisOn}
                    metrics={networkAnalysis?.metrics ?? []}
                    legend={networkAnalysis?.legend ?? null}
                    notice={analysisNotice}
                    figures={networkFiguresView}
                    onMode={(next) => {
                      setAnalysisMode(next);
                      setAnalysisOn(true);
                    }}
                    onActive={setAnalysisOn}
                  />
                  </>
                ) : (
                  <SiteStrategyAnalysis mode={strategyMode} />
                )}
              </div>
            ) : sheet === "placement" ? (
            <>
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
                  <p className="site-note">{selected.program ? PROGRAM_LABEL[selected.program] : "Unassigned"} · {selected.provenance.archetypeId}</p>
                  <OrthoSet modules={[selected]} meshes={loadedMeshes} caption="Selected" />
                  <div className="site-fields">
                    <label>East, ft<input aria-label="East" type="number" value={Math.round(selected.transform.position.x * 10) / 10} onChange={(event) => setTileTransform({ x: Number(event.target.value) })} /></label>
                    <label>Up, ft<input aria-label="Up" type="number" value={Math.round(selected.transform.position.y * 10) / 10} onChange={(event) => setTileTransform({ y: Number(event.target.value) })} /></label>
                    <label>North, ft<input aria-label="North" type="number" value={Math.round(selected.transform.position.z * 10) / 10} onChange={(event) => setTileTransform({ z: Number(event.target.value) })} /></label>
                    <label>Rotation, deg<input aria-label="Rotation" type="number" value={Math.round(selected.transform.rotationY * 180 / Math.PI * 10) / 10} onChange={(event) => setTileTransform({ rotationY: Number(event.target.value) * Math.PI / 180 })} /></label>
                  </div>
                  <div className="site-modes">
                    <button type="button" onClick={() => setTileTransform({ rotationY: selected.transform.rotationY - Math.PI / 2 })}>−90°</button>
                    <button type="button" onClick={() => setTileTransform({ rotationY: selected.transform.rotationY + Math.PI / 2 })}>+90°</button>
                    <button type="button" aria-pressed={selected.mirror === "x"} onClick={() => setTileTransform({ mirror: selected.mirror === "x" ? null : "x" })}>Mirror east</button>
                    <button type="button" aria-pressed={selected.mirror === "z"} onClick={() => setTileTransform({ mirror: selected.mirror === "z" ? null : "z" })}>Mirror north</button>
                  </div>
                  <div className="site-modes">
                    <button type="button" onClick={() => stackSelected(1)}>Stack above</button>
                    <button type="button" onClick={() => stackSelected(-1)}>Stack below</button>
                    <button type="button" onClick={duplicateModule}>Duplicate</button>
                    <button type="button" onClick={deleteModule}>Delete</button>
                  </div>
                  <p className="site-note">Level {tileReports[selected.instanceId]?.level ?? 0}. Stack height {Math.round(tileReports[selected.instanceId]?.stackHeightFt ?? MODULE_HEIGHT_FT)} ft. Alignment is not a structural or circulation connection.</p>
                  <p className="site-note">{(tileReports[selected.instanceId]?.links.length ?? 0) === 0 ? "No zone shares this footprint and elevation." : tileReports[selected.instanceId]?.links.map((link) => `${zones.find((zone) => zone.id === link.zoneId)?.name ?? link.kind} · ${Math.round(link.overlapSqFt).toLocaleString("en-US")} ft²`).join(", ")}</p>
                  {shownWarnings[selected.instanceId]?.outside ? (
                    <p className="site-note site-alert">The 20 ft footprint crosses the parcel boundary.</p>
                  ) : null}
                  {shownWarnings[selected.instanceId]?.overlap ? (
                    <p className="site-note site-alert">The 20 ft footprint overlaps another tile at this elevation. It was not moved.</p>
                  ) : null}
                  {shownWarnings[selected.instanceId]?.adjacent ? (
                    <p className="site-note">This tile touches another. Touching is not a connection.</p>
                  ) : null}
                  {shownWarnings[selected.instanceId]?.zoneMismatch ? (
                    <p className="site-note site-alert">The tile program does not match a zone it occupies.</p>
                  ) : null}
                  {shownWarnings[selected.instanceId]?.unsupported ? (
                    <p className="site-note">Nothing below this elevation meets the footprint. The offset stays. It is not a verified support.</p>
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
              {configNotice ? <p className="site-note site-alert">{configNotice}</p> : null}
              {configurations.length > 0 ? (
                <label className="site-connection-field">
                  Restore
                  <select aria-label="Restore configuration" value={currentConfigId ?? ""} onChange={(event) => {
                    const entry = configurations.find((item) => item.id === event.target.value);
                    if (entry) requestOpen(entry);
                  }}>
                    <option value="">Saved configurations</option>
                    {configurations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                  </select>
                </label>
              ) : <p className="site-note">Save names the current massing. Duplicate starts an independent copy.</p>}
              {configurations.map((entry) => (
                <div key={entry.id} className="site-modes">
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`Compare ${entry.name}`}
                      checked={compareIds.includes(entry.id)}
                      disabled={!compareIds.includes(entry.id) && compareIds.length >= 4}
                      onChange={() => setCompareIds((current) => current.includes(entry.id) ? current.filter((item) => item !== entry.id) : current.length >= 4 ? current : [...current, entry.id])}
                    />
                    {entry.name}
                  </label>
                  <button type="button" onClick={() => requestOpen(entry)}>Open</button>
                  <button type="button" onClick={() => duplicateConfiguration(entry)}>Duplicate</button>
                  <button type="button" onClick={() => deleteSavedConfiguration(entry.id)}>Delete</button>
                </div>
              ))}
              <div className="site-modes">
                <button type="button" aria-pressed={compareZones} data-active={compareZones || undefined} onClick={() => setCompareZones((value) => !value)}>Zoning</button>
                <button type="button" aria-pressed={compareNetwork} data-active={compareNetwork || undefined} onClick={() => setCompareNetwork((value) => !value)}>Network</button>
              </div>
              {compareIds.length < 2 ? <p className="site-note">Select two to four saved iterations to compare them.</p> : null}
              {compareIds.length >= 2 ? (() => {
                const compared = compareIds.flatMap((id) => {
                  const entry = configurations.find((item) => item.id === id);
                  return entry ? [entry] : [];
                });
                const frames = arrangementFrames(compared.flatMap((entry) => entry.modules));
                const networks = compared.map((entry) => iterations.find((item) => item.id === entry.networkId) ?? null);
                const bounds = planBounds(compared, compareNetwork ? networks.flatMap((item) => item ? [item] : []) : []);
                return (
                  <div className="site-ortho">
                    {compared.map((entry, index) => {
                      const metrics = iterationMetrics({
                        modules: entry.modules,
                        directJoins: entry.directJoins ?? [],
                        hybridJoins: entry.hybridJoins ?? [],
                      }, site.site.ring);
                      const network = networks[index];
                      const programs = (Object.keys(metrics.programs) as (keyof typeof metrics.programs)[]).flatMap((program) => metrics.programs[program] > 0 ? [`${PROGRAM_LABEL[program]} ${metrics.programs[program]}`] : []);
                      return (
                        <figure key={entry.id}>
                          <OrthoCanvas modules={entry.modules} meshes={loadedMeshes} view="west" frame={frames.west} label={`${entry.name} west`} />
                          <OrthoCanvas modules={entry.modules} meshes={loadedMeshes} view="top" frame={frames.top} label={`${entry.name} top`} />
                          {compareZones || compareNetwork ? (
                            <ComparisonPlan
                              modules={entry.modules}
                              zones={entry.zones ?? []}
                              branches={compareNetwork ? network?.branches ?? [] : []}
                              bounds={bounds}
                              showZones={compareZones}
                              showNetwork={compareNetwork}
                              label={`${entry.name} plan`}
                            />
                          ) : null}
                          <figcaption>{entry.name}</figcaption>
                          <p className="site-note">{metrics.tiles} tiles · {programs.join(" · ") || "No program"} · Height {Math.round(metrics.heightFt)} ft · {Math.round(metrics.occupiedSqFt).toLocaleString("en-US")} ft²</p>
                          <p className="site-note">{metrics.directJoins} direct · {metrics.hybridJoins} hybrid · {metrics.connectedTiles} connected · {metrics.tiles - metrics.connectedTiles} unconnected</p>
                          <p className="site-note">{entry.networkId ? (network ? `Network ${entry.networkId}` : `Network ${entry.networkId} is not in the saved studies.`) : "No network"}</p>
                          {(entry.zones ?? []).map((zone) => (
                            <p key={zone.id} className="site-note">{zone.name} {zone.baseFt}–{zone.baseFt + zone.heightFt} ft</p>
                          ))}
                        </figure>
                      );
                    })}
                  </div>
                );
              })() : null}
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
            </>
            ) : (
              <section className="site-block site-specs" aria-label={sheet === "zoning" ? "Zoning" : "Assembly"}>
                {sheet === "zoning" ? (
                  <SiteZoningInspector
                    zone={selectedZone}
                    networkLabel={massingLabel ?? "None"}
                    mismatch={zoneMismatch}
                    outsideParcel={zoneGuide.outsideParcel}
                    inWater={zoneGuide.inWater}
                    branchFt={zoneGuide.branchFt}
                    junctionFt={zoneGuide.junctionFt}
                    accessFt={zoneGuide.accessFt}
                    waterFt={zoneGuide.waterFt}
                    facing={zoneGuide.facing}
                    totals={zoneTotals.totals}
                    counts={zoneTotals.counts}
                    onName={(name) => selectedZone && replaceZones(zones.map((zone) => zone.id === selectedZone.id ? { ...zone, name } : zone))}
                    onKind={(kind) => selectedZone && replaceZones(zones.map((zone) => zone.id === selectedZone.id ? { ...zone, kind } : zone))}
                    onBase={(baseFt) => selectedZone && commitZoneElevation(selectedZone.id, baseFt, selectedZone.heightFt)}
                    onHeight={(heightFt) => selectedZone && commitZoneElevation(selectedZone.id, selectedZone.baseFt, heightFt)}
                    emptyNote={pocketSelection.length > 0 && !selectedZone ? "This pocket is still open. Choose Lobby, Gathering, or Workspace." : null}
                  />
                ) : (
                  <>
                  <h2 className="site-subtitle">Assembly</h2>
                  <p className="site-note">{workflowTiles.length} placed tile{workflowTiles.length === 1 ? "" : "s"}. {connections.length} connection{connections.length === 1 ? "" : "s"}. A hybrid is a separate mesh. Removing it leaves both tiles and the other connections unchanged.</p>
                  {selectedJoin ? <p className="site-note">{joinProposal && connections.some((link) => link.id === selectedJoin) ? joinSummary(joinProposal) : "Connection selected."}</p> : null}
                  </>
                )}
              </section>
            )}
      </aside>
    </main>
  );
}
