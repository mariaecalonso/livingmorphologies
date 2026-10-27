import type { IsoMesh } from "../scan/isomesh";
import type { ModuleHandoff, ReadyModule } from "./adapt";
import { mockPlacementSupported } from "./assembly-layout";
import { detectAdjacencies, type TileConnection } from "./connections";
import type { FaceFrame, Vec3 } from "./contract";
import { faceSurfaceHighlight } from "./face-outline";
import { connectorFrame } from "./hybrid-deformation";
import { assembleIntactHybrid } from "./hybrid-attachment";
import { currentGeneratedField } from "./hybrid-display";
import { HYBRID_GENERATOR_SETTINGS, sectionReach } from "./hybrid-generator";
import { SECTIONAL_GENERATOR_SETTINGS, connectionProcess, softenClosedRing, terminalSectionPair } from "./section-hybrid";
import { developmentOf, type DevelopmentView } from "./architectural-integration";
import { loftSectionRings } from "./hybrid-spine";
import { PROFILE_SAMPLES } from "./face-hybrid-profile";
import { mockHybridField } from "./mock-hybrids";
import type { TileInstance } from "./tiles";
import { rotateByBasis, tileBasis } from "./tile-basis";

/**
 * A stored SOM hybrid is placed by translation and rotation only.
 * Surface routes and end adapters are appended. The core vertices are not deformed.
 */
export type AssemblyHybridSource = "real" | "mock" | "none";

export type AssemblyHybridStatus = "ready" | "empty" | "blocked" | "invalid" | "mock" | "not-generated" | "unresolved";

export type AssemblyHybridPlacement = "placed-faces" | "contact-marker" | "none";

export type AssemblyHybrid = {
  source: AssemblyHybridSource;
  candidateId: string | null;
  geometry: IsoMesh | null;
  status: AssemblyHybridStatus;
  placement: AssemblyHybridPlacement;
  translate: Vec3;
  spin: number;
  guides?: IsoMesh | null;
  development?: DevelopmentView | null;
};

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/** Placed face frame. Same basis the assembly mesh uses, then translation. */
export function placedFaceFrame(
  frame: FaceFrame,
  tile: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">,
): FaceFrame {
  const basis = tileBasis(tile);
  const turn = (vector: Vec3) => rotateByBasis(basis, vector);
  const turned = {
    origin: turn(frame.origin),
    normal: turn(frame.normal),
    u: turn(frame.u),
    v: turn(frame.v),
  };
  return { ...frame, ...turned, origin: add(turned.origin, tile.transform) };
}

export function sectionCenter(frame: FaceFrame, depth: number, shift: Vec3 = ORIGIN): Vec3 {
  return {
    x: frame.origin.x + shift.x - frame.normal.x * depth,
    y: frame.origin.y + shift.y - frame.normal.y * depth,
    z: frame.origin.z + shift.z - frame.normal.z * depth,
  };
}

export function placeGeneratedHybrid(
  mesh: IsoMesh,
  sourceA: FaceFrame,
  sourceB: FaceFrame,
  targetA: FaceFrame,
  targetB: FaceFrame,
  sampleCount: number,
  steps: number,
): IsoMesh | null {
  const vertexCount = mesh.positions.length / 3;
  if (!Number.isInteger(sampleCount) || sampleCount < 3 || !Number.isInteger(steps) || steps < 2) return null;
  if (vertexCount !== sampleCount * steps || mesh.normals.length !== mesh.positions.length) return null;
  const sourceStart = ringCentroid(mesh, 0, sampleCount);
  const sourceEnd = ringCentroid(mesh, steps - 1, sampleCount);
  const faceStart = sectionCenter(sourceA, sectionReach(sourceA));
  const faceEnd = sectionCenter(sourceB, sectionReach(sourceB));
  const targetStart = sectionCenter(targetA, sectionReach(targetA));
  const targetEnd = sectionCenter(targetB, sectionReach(targetB));
  const source = connectorFrame(sourceStart, sourceEnd);
  const face = connectorFrame(faceStart, faceEnd);
  const targetSpan = sub(targetEnd, targetStart);
  const targetLength = length(targetSpan);
  if (!source || !face || targetLength <= 1e-6) return null;
  // Profile centroids sit on the openings, not always on the section-center axis.
  // A reversed loft is rejected. A tilt still maps each end centroid onto its section center.
  if (dot(source.direction, face.direction) <= 0) return null;
  const targetDirection = scale(targetSpan, 1 / targetLength);
  const alongScale = source.span > 1e-6 ? targetLength / source.span : 1;
  const basisA = transportBasis(sourceA, targetA, source.tangent, source.bitangent);
  const basisB = transportBasis(sourceB, targetB, source.tangent, source.bitangent);
  if (!basisA || !basisB) return null;

  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const ring = Math.floor(vertex / sampleCount);
    const t = ring / (steps - 1);
    const sourceAxis = lerp(sourceStart, sourceEnd, t);
    const targetAxis = lerp(targetStart, targetEnd, t);
    const basis = sectionBasis(basisA, basisB, t);
    const point = read(mesh.positions, vertex);
    const delta = sub(point, sourceAxis);
    const along = dot(delta, source.direction);
    const sectionU = dot(delta, source.tangent);
    const sectionV = dot(delta, source.bitangent);
    write(positions, vertex, add(targetAxis, add(scale(targetDirection, along * alongScale), add(scale(basis.u, sectionU), scale(basis.v, sectionV)))));
    const normal = read(mesh.normals, vertex);
    const turned = add(
      scale(targetDirection, dot(normal, source.direction)),
      add(scale(basis.u, dot(normal, source.tangent)), scale(basis.v, dot(normal, source.bitangent))),
    );
    const turnedLength = length(turned);
    write(normals, vertex, turnedLength > 1e-8 ? scale(turned, 1 / turnedLength) : { x: 0, y: 1, z: 0 });
  }
  return {
    positions,
    normals,
    indices: Uint32Array.from(mesh.indices),
    triangles: mesh.triangles,
  };
}

export function resolveAssemblyHybrid(
  connection: Pick<TileConnection, "id" | "tileAId" | "tileBId" | "faceA" | "faceB" | "signature" | "selectedMockId" | "generatedHybridField" | "catalogHybrid">,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
  displayMesh?: IsoMesh | null,
): AssemblyHybrid {
  const field = currentGeneratedField(connection);
  if (field) {
    const candidate = field.candidates.find((item) => item.candidateId === connection.selectedMockId) ?? null;
    if (!candidate || candidate.status !== "ready" || !candidate.geometry) {
      return blank("none", candidate?.candidateId ?? connection.selectedMockId, candidate?.status ?? "invalid");
    }
    const placed = placeConnection(connection, tiles, loaded, displayMesh ?? candidate.geometry);
    if (!placed) return blank("none", candidate.candidateId, "unresolved");
    return {
      source: "real",
      candidateId: candidate.candidateId,
      geometry: placed.mesh,
      guides: placed.guides,
      development: developmentOf(placed.mesh),
      status: "ready",
      placement: "placed-faces",
      translate: ORIGIN,
      spin: 0,
    };
  }

  if (connection.catalogHybrid === "missing") return blank("none", connection.selectedMockId, "invalid");
  const detected = detectAdjacencies(tiles).find((item) => item.id === connection.id);
  if (!detected || !mockPlacementSupported(connection, tiles)) {
    return blank("none", connection.selectedMockId, "not-generated");
  }
  const mock = mockHybridField(connection.signature);
  const chosen = mock.candidates.find((item) => item.id === connection.selectedMockId) ?? mock.candidates[12];
  return {
    source: "mock",
    candidateId: chosen.id,
    geometry: chosen.mesh,
    status: "mock",
    placement: "contact-marker",
    translate: detected.marker,
    spin: detected.faceA === "N" || detected.faceA === "S" ? Math.PI / 2 : 0,
  };
}

function placeConnection(
  connection: Pick<TileConnection, "tileAId" | "tileBId" | "faceA" | "faceB">,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
  mesh: IsoMesh,
): { mesh: IsoMesh; guides: IsoMesh | null } | null {
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  if (!tileA || !tileB) return null;
  const moduleA = readyModule(tileA, loaded);
  const moduleB = readyModule(tileB, loaded);
  if (!moduleA || !moduleB) return null;
  const sourceA = moduleA.faces[connection.faceA];
  const sourceB = moduleB.faces[connection.faceB];
  if (!sourceA || !sourceB) return null;
  const placedA = placedFaceFrame(sourceA, tileA);
  const placedB = placedFaceFrame(sourceB, tileB);
  const prepared = sectionalLoft(mesh);
  if (prepared) {
    const bridged = placeSectionalLoft(prepared.mesh, prepared.steps, tileA, tileB, moduleA, connection.faceA, moduleB, connection.faceB);
    if (bridged) return { mesh: bridged, guides: null };
  }
  const placed = assembleIntactHybrid({
    mesh,
    parentA: moduleA.geometry,
    parentB: moduleB.geometry,
    frameA: sourceA,
    frameB: sourceB,
    placedA,
    placedB,
    tileA,
    tileB,
  });
  if (placed) return { mesh: placed.mesh, guides: placed.guides };
  const bridged = bridgeLoft(mesh, placedA, placedB);
  return bridged ? { mesh: bridged, guides: null } : null;
}

/** The saved test mesh appends merge solids after the loft. Placement uses the loft prefix. */
function sectionalPrefix(mesh: IsoMesh, steps: number): IsoMesh {
  const count = mesh.positions.length / 3;
  if (count % steps === 0) return mesh;
  const loftVerts = SECTIONAL_GENERATOR_SETTINGS.samples * steps;
  if (count < loftVerts) return mesh;
  const positions = mesh.positions.subarray(0, loftVerts * 3);
  const normals = mesh.normals.length >= loftVerts * 3 ? mesh.normals.subarray(0, loftVerts * 3) : new Float32Array(positions.length);
  const kept: number[] = [];
  for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
    const a = mesh.indices[index];
    const b = mesh.indices[index + 1];
    const c = mesh.indices[index + 2];
    if (a < loftVerts && b < loftVerts && c < loftVerts) kept.push(a, b, c);
  }
  if (kept.length < 9) return mesh;
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(kept),
    triangles: kept.length / 3,
  };
}

/** Saved tests keep a 13-ring loft, sometimes with merge solids after it. Test 8 is an exact 33-ring loft. A new hybrid is the plates that fall between the two faces. */
function sectionalLoft(mesh: IsoMesh): { mesh: IsoMesh; steps: number } | null {
  const samples = SECTIONAL_GENERATOR_SETTINGS.samples;
  const legacy = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const count = mesh.positions.length / 3;
  if (count % samples === 0) {
    const steps = count / samples;
    if (steps === 33 || (steps >= 3 && steps !== legacy)) return { mesh, steps };
  }
  const loft = sectionalPrefix(mesh, legacy);
  const loftCount = loft.positions.length / 3;
  if (loftCount % legacy === 0 && loftCount / legacy >= 12 && loftCount !== PROFILE_SAMPLES * legacy) {
    return { mesh: loft, steps: legacy };
  }
  return null;
}

function habitableDevelopment(
  positions: Float32Array,
  steps: number,
  samples: number,
  majorA: Vec3[],
  nearA: Vec3[],
  majorB: Vec3[],
  nearB: Vec3[],
): IsoMesh | null {
  if (majorA.length < 3 || majorB.length < 3) return null;
  const source = Array.from({ length: steps }, (_, station) => ringPoints({ positions, normals: positions, indices: new Uint32Array(), triangles: 0 }, station, samples));
  const rings = source.map((ring) => ring.map((point) => ({ x: point.x, y: point.y, z: point.z })));
  const goalA = mixGoal(rings[0], majorA, nearA);
  const goalB = mixGoal(rings[rings.length - 1], majorB, nearB);
  const mid = (rings.length - 1) / 2;
  rings.forEach((ring, index) => {
    const side = index <= mid ? goalA : goalB;
    const weight = terminalFalloff(index, rings.length);
    if (weight <= 0) return;
    ring.forEach((point, sample) => {
      const next = lerp(point, side[sample], weight);
      point.x = next.x;
      point.y = next.y;
      point.z = next.z;
    });
  });
  const sequence = [
    ...approach(matchLoop(goalA, majorA), rings[0], 4).slice(0, -1),
    ...rings,
    ...approach(rings[rings.length - 1], matchLoop(goalB, majorB), 4).slice(1),
  ];
  return loftSectionRings(sequence);
}

function mixGoal(ring: Vec3[], major: Vec3[], near: Vec3[]) {
  const body = matchLoop(ring, major);
  if (near.length < 3) return body;
  const sliver = matchLoop(ring, near);
  return body.map((point, index) => lerp(point, sliver[index], 0.12));
}

function terminalFalloff(index: number, count: number) {
  const mid = (count - 1) / 2;
  const distance = Math.abs(index - mid) / Math.max(mid, 1);
  const band = Math.max(0, (distance - 0.45) / 0.55);
  const t = Math.min(1, band);
  return t * t * (3 - 2 * t);
}

function approach(from: Vec3[], to: Vec3[], segments: number) {
  return Array.from({ length: segments + 1 }, (_, step) => {
    const t = step / segments;
    const blend = t * t * (3 - 2 * t);
    return from.map((point, index) => lerp(point, to[index], blend));
  });
}

function matchLoop(reference: Vec3[], loop: Vec3[]) {
  const resampled = resampleLoop(loop, reference.length);
  let best = resampled;
  let bestCost = Infinity;
  for (const reversed of [false, true]) {
    const ordered = reversed ? [...resampled].reverse() : resampled;
    for (let shift = 0; shift < ordered.length; shift += 1) {
      let cost = 0;
      for (let index = 0; index < ordered.length; index += 1) {
        cost += length(sub(reference[index], ordered[(index + shift) % ordered.length]));
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = reference.map((_, index) => ordered[(index + shift) % ordered.length]);
      }
    }
  }
  return best;
}

function resampleLoop(loop: Vec3[], count: number) {
  const lengths = [0];
  for (let index = 0; index < loop.length; index += 1) {
    lengths.push(lengths[index] + length(sub(loop[(index + 1) % loop.length], loop[index])));
  }
  const total = lengths[lengths.length - 1] || 1;
  return Array.from({ length: count }, (_, sample) => {
    const distance = (sample / count) * total;
    let index = 1;
    while (index < lengths.length - 1 && lengths[index] < distance) index += 1;
    const span = lengths[index] - lengths[index - 1] || 1;
    return lerp(loop[index - 1], loop[index % loop.length], (distance - lengths[index - 1]) / span);
  });
}

function placeSectionalLoft(
  mesh: IsoMesh,
  steps: number,
  tileA: TileInstance,
  tileB: TileInstance,
  moduleA: ReadyModule,
  faceA: TileConnection["faceA"],
  moduleB: ReadyModule,
  faceB: TileConnection["faceB"],
): IsoMesh | null {
  const count = mesh.positions.length / 3;
  if (count % steps !== 0) return null;
  const samples = count / steps;
  if (samples < 12) return null;
  const localA = ringPoints(mesh, 0, samples);
  const localB = ringPoints(mesh, steps - 1, samples);
  const terminals = terminalSectionPair(moduleA, faceA, moduleB, faceB);
  const cutA = terminals && terminals.a.length === samples ? terminals.a : localA;
  const cutB = terminals && terminals.b.length === samples ? terminals.b : localB;
  const worldA = cutA.map((point) => poseTile(tileA, point));
  const worldB = cutB.map((point) => poseTile(tileB, point));
  const sourceSpan = sub(averagePoints(localB), averagePoints(localA));
  const targetSpan = sub(averagePoints(worldB), averagePoints(worldA));
  const turn = length(sourceSpan) > 1e-4 && length(targetSpan) > 1e-4
    ? rotationFromTo(normalize(sourceSpan), normalize(targetSpan))
    : (vector: Vec3) => vector;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length || mesh.positions.length);
  const fluid = steps !== HYBRID_GENERATOR_SETTINGS.loftSteps;
  const localCenterA = averagePoints(localA);
  const localCenterB = averagePoints(localB);
  const worldCenterA = averagePoints(worldA);
  const worldCenterB = averagePoints(worldB);
  const spanLength = length(sourceSpan);
  if (fluid && steps !== 33) {
    const rotation = length(sourceSpan) > 1e-4 && length(targetSpan) > 1e-4
      ? rotationFromTo(normalize(sourceSpan), normalize(targetSpan))
      : (vector: Vec3) => vector;
    const positions = new Float32Array(mesh.positions.length);
    const normals = new Float32Array(mesh.normals.length || mesh.positions.length);
    const vertices = mesh.positions.length / 3;
    for (let vertex = 0; vertex < vertices; vertex += 1) {
      write(positions, vertex, add(worldCenterA, rotation(sub(read(mesh.positions, vertex), localCenterA))));
      const normal = mesh.normals.length === mesh.positions.length ? rotation(read(mesh.normals, vertex)) : { x: 0, y: 1, z: 0 };
      const normalLength = length(normal);
      write(normals, vertex, normalLength > 1e-6 ? scale(normal, 1 / normalLength) : { x: 0, y: 1, z: 0 });
    }
    const shaded = shadeByFaces({
      positions,
      normals,
      indices: Uint32Array.from(mesh.indices),
      triangles: mesh.triangles,
    });
    const frameA = moduleA.faces[faceA];
    const frameB = moduleB.faces[faceB];
    const record = connectionProcess(moduleA, faceA, moduleB, faceB);
    const pose = (tile: TileInstance, points: Vec3[]) => points.map((point) => poseTile(tile, point));
    const areaOf = (points: Vec3[]) => {
      const center = averagePoints(points);
      let normal = { x: 0, y: 0, z: 0 };
      for (let index = 0; index < points.length; index += 1) normal = add(normal, cross(sub(points[index], center), sub(points[(index + 1) % points.length], center)));
      return length(normal) * 0.5;
    };
    const dominant = (sections: { worldContour: Vec3[] }[]) => sections.reduce((best, section) => {
      const area = areaOf(section.worldContour);
      return area > best.area ? { area, loop: section.worldContour } : best;
    }, { area: -1, loop: sections[0]?.worldContour ?? worldA }).loop;
    const majorA = record && record.a.length > 0 ? pose(tileA, dominant(record.a)) : worldA;
    const nearA = record && record.a.length > 0 ? pose(tileA, record.a[record.a.length - 1].worldContour) : worldA;
    const majorB = record && record.b.length > 0 ? pose(tileB, dominant(record.b)) : worldB;
    const nearB = record && record.b.length > 0 ? pose(tileB, record.b[0].worldContour) : worldB;
    const integrated = habitableDevelopment(positions, steps, samples, majorA, nearA, majorB, nearB);
    if (integrated) return integrated;
    const coveredA = moduleA.geometry && frameA ? coverWithFace(shaded, faceSurfaceHighlight(moduleA.geometry, frameA), tileA) : shaded;
    return moduleB.geometry && frameB ? coverWithFace(coveredA, faceSurfaceHighlight(moduleB.geometry, frameB), tileB) : coveredA;
  }
  for (let station = 0; station < steps; station += 1) {
    const uniform = station / (steps - 1);
    const center = averagePoints(ringPoints(mesh, station, samples));
    const measured = spanLength > 1e-4
      ? Math.min(1, Math.max(0, dot(sub(center, localCenterA), sourceSpan) / (spanLength * spanLength)))
      : uniform;
    const t = steps === 33 ? uniform : measured;
    const pathT = steps === 33 ? t * t * (3 - 2 * t) : t;
    const edge = 0.24;
    const ramp = t <= 0.001 || t >= 0.999 ? 0 : t < edge ? t / edge : t > 1 - edge ? (1 - t) / edge : 1;
    const release = ramp * ramp * (3 - 2 * ramp);
    const localCenter = lerp(localCenterA, localCenterB, pathT);
    const worldCenter = lerp(worldCenterA, worldCenterB, pathT);
    const faceDeltas: Vec3[] = [];
    const designedDeltas: Vec3[] = [];
    let faceReach = 0;
    let designedReach = 0;
    for (let sample = 0; sample < samples; sample += 1) {
      const index = station * samples + sample;
      const facePoint = station === 0 ? worldA[sample] : station === steps - 1 ? worldB[sample] : lerp(worldA[sample], worldB[sample], pathT);
      const faceDelta = sub(facePoint, worldCenter);
      const designedDelta = turn(sub(read(mesh.positions, index), localCenter));
      faceDeltas.push(faceDelta);
      designedDeltas.push(designedDelta);
      faceReach += length(faceDelta);
      designedReach += length(designedDelta);
    }
    const waist = 1 - Math.sin(Math.PI * t) * 0.26;
    const collapsed = fluid && steps !== 33 && faceReach > 1e-3 && designedReach < faceReach * 0.22;
    const match = !fluid
      ? designedReach > 1e-4 ? faceReach / designedReach : 1
      : collapsed
        ? (designedReach < faceReach * 0.08 ? waist : (faceReach * waist) / designedReach)
        : 1;
    const gain = 1;
    for (let sample = 0; sample < samples; sample += 1) {
      const index = station * samples + sample;
      const legacy = station === 0
        ? worldA[sample]
        : station === steps - 1
          ? worldB[sample]
          : add(lerp(worldA[sample], worldB[sample], t), turn(sub(read(mesh.positions, index), lerp(localA[sample], localB[sample], t))));
      const shaped = collapsed && designedReach < faceReach * 0.08 ? faceDeltas[sample] : designedDeltas[sample];
      const mixed = lerp(faceDeltas[sample], scale(shaped, match), release);
      const placed = fluid ? add(worldCenter, scale(mixed, gain)) : legacy;
      write(positions, index, placed);
      const normal = mesh.normals.length === mesh.positions.length ? turn(read(mesh.normals, index)) : { x: 0, y: 1, z: 0 };
      const normalLength = length(normal);
      write(normals, index, normalLength > 1e-6 ? scale(normal, 1 / normalLength) : { x: 0, y: 1, z: 0 });
    }
  }
  if (fluid) {
    for (let station = 0; station < steps; station += 1) {
      const t = station / (steps - 1);
      const endBand = Math.min(t, 1 - t) < 0.22;
      const amount = endBand ? 0.74 : 0.14;
      const softened = softenClosedRing(ringPoints({ positions, normals, indices: mesh.indices, triangles: mesh.triangles }, station, samples), amount);
      softened.forEach((point, sample) => write(positions, station * samples + sample, point));
    }
  }
  const loftMesh = {
    positions,
    normals,
    indices: Uint32Array.from(mesh.indices),
    triangles: mesh.triangles,
  };
  const shaded = fluid || normalsMissing(mesh) ? shadeByFaces(loftMesh) : loftMesh;
  const frameA = moduleA.faces[faceA];
  const frameB = moduleB.faces[faceB];
  const coveredA = moduleA.geometry && frameA ? coverWithFace(shaded, faceSurfaceHighlight(moduleA.geometry, frameA), tileA) : shaded;
  return moduleB.geometry && frameB ? coverWithFace(coveredA, faceSurfaceHighlight(moduleB.geometry, frameB), tileB) : coveredA;
}

function normalsMissing(mesh: IsoMesh) {
  if (mesh.normals.length < mesh.positions.length) return true;
  let energy = 0;
  const limit = Math.min(mesh.normals.length, 90);
  for (let index = 0; index < limit; index += 1) energy += Math.abs(mesh.normals[index]);
  return energy < 1e-3;
}

function shadeByFaces(mesh: IsoMesh): IsoMesh {
  const normals = new Float32Array(mesh.positions.length);
  for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
    const a = mesh.indices[index];
    const b = mesh.indices[index + 1];
    const c = mesh.indices[index + 2];
    const ax = mesh.positions[a * 3];
    const ay = mesh.positions[a * 3 + 1];
    const az = mesh.positions[a * 3 + 2];
    const bx = mesh.positions[b * 3] - ax;
    const by = mesh.positions[b * 3 + 1] - ay;
    const bz = mesh.positions[b * 3 + 2] - az;
    const cx = mesh.positions[c * 3] - ax;
    const cy = mesh.positions[c * 3 + 1] - ay;
    const cz = mesh.positions[c * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    normals[a * 3] += nx;
    normals[a * 3 + 1] += ny;
    normals[a * 3 + 2] += nz;
    normals[b * 3] += nx;
    normals[b * 3 + 1] += ny;
    normals[b * 3 + 2] += nz;
    normals[c * 3] += nx;
    normals[c * 3 + 1] += ny;
    normals[c * 3 + 2] += nz;
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]);
    if (length > 1e-8) {
      normals[index] /= length;
      normals[index + 1] /= length;
      normals[index + 2] /= length;
    } else {
      normals[index + 1] = 1;
    }
  }
  return { ...mesh, normals };
}

function coverWithFace(mesh: IsoMesh, coat: IsoMesh | null, tile: TileInstance): IsoMesh {
  if (!coat || coat.positions.length < 9 || coat.indices.length < 3) return mesh;
  const extra = coat.positions.length / 3;
  const positions = new Float32Array(mesh.positions.length + coat.positions.length);
  const normals = new Float32Array(mesh.positions.length + coat.positions.length);
  positions.set(mesh.positions);
  if (mesh.normals.length === mesh.positions.length) normals.set(mesh.normals);
  const indices = new Uint32Array(mesh.indices.length + coat.indices.length);
  indices.set(mesh.indices);
  const base = mesh.positions.length / 3;
  for (let vertex = 0; vertex < extra; vertex += 1) {
    const local = read(coat.positions, vertex);
    const posed = poseTile(tile, local);
    const normal = coat.normals.length === coat.positions.length
      ? rotateByBasis(tileBasis(tile), read(coat.normals, vertex))
      : { x: 0, y: 1, z: 0 };
    const normalLength = length(normal);
    const unit = normalLength > 1e-6 ? scale(normal, 1 / normalLength) : { x: 0, y: 1, z: 0 };
    write(positions, base + vertex, add(posed, scale(unit, 0.02)));
    write(normals, base + vertex, unit);
  }
  for (let index = 0; index < coat.indices.length; index += 1) {
    indices[mesh.indices.length + index] = coat.indices[index] + base;
  }
  return { positions, normals, indices, triangles: indices.length / 3 };
}

export function poseModulePoint(tile: TileInstance, point: Vec3): Vec3 {
  return poseTile(tile, point);
}

function poseTile(tile: TileInstance, point: Vec3): Vec3 {
  return add(rotateByBasis(tileBasis(tile), point), tile.transform);
}

function ringPoints(mesh: IsoMesh, ring: number, sampleCount: number): Vec3[] {
  return Array.from({ length: sampleCount }, (_, sample) => read(mesh.positions, ring * sampleCount + sample));
}

function averagePoints(points: Vec3[]): Vec3 {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / Math.max(1, points.length));
}

function bridgeLoft(mesh: IsoMesh, frameA: FaceFrame, frameB: FaceFrame): IsoMesh | null {
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const count = mesh.positions.length / 3;
  if (count % steps !== 0) return null;
  const samples = count / steps;
  if (samples < 12) return null;
  const sourceA = ringCentroid(mesh, 0, samples);
  const sourceB = ringCentroid(mesh, steps - 1, samples);
  const sourceSpan = sub(sourceB, sourceA);
  const sourceLength = length(sourceSpan);
  if (sourceLength < 1e-4) return null;
  const targetA = sectionCenter(frameA, Math.min(0.8, sectionReach(frameA)));
  const targetB = sectionCenter(frameB, Math.min(0.8, sectionReach(frameB)));
  const targetSpan = sub(targetB, targetA);
  const targetLength = length(targetSpan);
  if (targetLength < 1e-4) return null;
  const sourceDir = scale(sourceSpan, 1 / sourceLength);
  const targetDir = scale(targetSpan, 1 / targetLength);
  const turn = rotationFromTo(sourceDir, targetDir);
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length || mesh.positions.length);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const point = read(mesh.positions, vertex);
    const along = dot(sub(point, sourceA), sourceDir);
    const radial = sub(point, add(sourceA, scale(sourceDir, along)));
    write(positions, vertex, add(add(targetA, scale(targetDir, (along / sourceLength) * targetLength)), turn(radial)));
    const normal = mesh.normals.length === mesh.positions.length ? turn(read(mesh.normals, vertex)) : { x: 0, y: 1, z: 0 };
    const normalLength = length(normal);
    write(normals, vertex, normalLength > 1e-6 ? scale(normal, 1 / normalLength) : { x: 0, y: 1, z: 0 });
  }
  return { positions, normals, indices: Uint32Array.from(mesh.indices), triangles: mesh.triangles };
}

function rotationFromTo(from: Vec3, to: Vec3) {
  const axis = cross(from, to);
  const axisLength = length(axis);
  if (axisLength < 1e-6) {
    if (dot(from, to) > 0) return (vector: Vec3) => vector;
    const perp = unitPerp(from);
    return (vector: Vec3) => rodrigues(vector, perp, Math.PI);
  }
  const unit = scale(axis, 1 / axisLength);
  return (vector: Vec3) => rodrigues(vector, unit, Math.atan2(axisLength, dot(from, to)));
}

function readyModule(tile: TileInstance, loaded: ReadonlyMap<string, ModuleHandoff>): ReadyModule | null {
  const handoff = loaded.get(tile.archetypeId);
  return handoff?.status === "ready" ? handoff : null;
}

function placeFreeHybrid(
  mesh: IsoMesh,
  sourceA: FaceFrame,
  sourceB: FaceFrame,
  targetA: FaceFrame,
  targetB: FaceFrame,
): IsoMesh | null {
  if (mesh.normals.length !== mesh.positions.length || mesh.positions.length < 9) return null;
  const anchorA = capCentroid(mesh, sourceA);
  const anchorB = capCentroid(mesh, sourceB);
  if (!anchorA || !anchorB) return null;
  const span = sub(anchorB, anchorA);
  const spanLength = length(span);
  if (spanLength <= 1e-6) return null;
  const direction = scale(span, 1 / spanLength);
  const vertexCount = mesh.positions.length / 3;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const point = read(mesh.positions, vertex);
    const along = dot(sub(point, anchorA), direction) / spanLength;
    const t = stick(along);
    write(positions, vertex, lerp(placeLocal(sourceA, targetA, point), placeLocal(sourceB, targetB, point), t));
    const normal = read(mesh.normals, vertex);
    const turned = lerp(carry(sourceA, targetA, normal), carry(sourceB, targetB, normal), t);
    const turnedLength = length(turned);
    write(normals, vertex, turnedLength > 1e-8 ? scale(turned, 1 / turnedLength) : { x: 0, y: 1, z: 0 });
  }
  return { positions, normals, indices: Uint32Array.from(mesh.indices), triangles: mesh.triangles };
}

/** Keep each end in the rigid frame of its final face, then blend only the middle. */
function stick(along: number) {
  const hold = 0.18;
  if (along <= hold) return 0;
  if (along >= 1 - hold) return 1;
  const t = (along - hold) / (1 - hold * 2);
  return t * t * (3 - 2 * t);
}

function placeLocal(source: FaceFrame, target: FaceFrame, point: Vec3) {
  return add(target.origin, carry(source, target, sub(point, source.origin)));
}

function capCentroid(mesh: IsoMesh, frame: FaceFrame): Vec3 | null {
  const depth = sectionReach(frame);
  const vertexCount = mesh.positions.length / 3;
  if (vertexCount < 1) return null;
  let nearest = Infinity;
  const distance = new Float64Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const point = read(mesh.positions, vertex);
    const fromFace = dot(sub(point, frame.origin), frame.normal);
    const gap = Math.abs(fromFace + depth);
    distance[vertex] = gap;
    nearest = Math.min(nearest, gap);
  }
  const band = nearest + Math.max(0.04, depth);
  let count = 0;
  let sum = { x: 0, y: 0, z: 0 };
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (distance[vertex] > band) continue;
    sum = add(sum, read(mesh.positions, vertex));
    count += 1;
  }
  if (count < 3) return null;
  return scale(sum, 1 / count);
}

function transportBasis(sourceFace: FaceFrame, targetFace: FaceFrame, tangent: Vec3, bitangent: Vec3): { u: Vec3; v: Vec3 } | null {
  const u = carry(sourceFace, targetFace, tangent);
  const v = carry(sourceFace, targetFace, bitangent);
  if (length(u) < 1e-6 || length(v) < 1e-6) return null;
  return { u, v };
}

function carry(sourceFace: FaceFrame, targetFace: FaceFrame, vector: Vec3): Vec3 {
  return add(
    scale(targetFace.u, dot(vector, sourceFace.u)),
    add(scale(targetFace.v, dot(vector, sourceFace.v)), scale(targetFace.normal, dot(vector, sourceFace.normal))),
  );
}

function sectionBasis(start: { u: Vec3; v: Vec3 }, end: { u: Vec3; v: Vec3 }, t: number) {
  if (t <= 0) return start;
  if (t >= 1) return end;
  return rigidize(slerp(start.u, end.u, t), slerp(start.v, end.v, t));
}

function rigidize(u: Vec3, v: Vec3) {
  const tangent = normalize(u);
  const projected = sub(v, scale(tangent, dot(v, tangent)));
  const bitangent = length(projected) > 1e-6 ? normalize(projected) : unitPerp(tangent);
  return { u: tangent, v: bitangent };
}

function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const aligned = Math.min(1, Math.max(-1, dot(a, b)));
  if (aligned > 0.999999) return normalize(lerp(a, b, t));
  if (aligned < -0.999999) return rodrigues(a, unitPerp(a), Math.PI * t);
  const angle = Math.acos(aligned);
  const sine = Math.sin(angle);
  return add(scale(a, Math.sin((1 - t) * angle) / sine), scale(b, Math.sin(t * angle) / sine));
}

function rodrigues(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(add(scale(vector, cosine), scale(cross(axis, vector), sine)), scale(axis, dot(axis, vector) * (1 - cosine)));
}

function blank(source: "none", candidateId: string | null, status: AssemblyHybridStatus): AssemblyHybrid {
  return {
    source,
    candidateId,
    geometry: null,
    status,
    placement: "none",
    translate: ORIGIN,
    spin: 0,
  };
}

function ringCentroid(mesh: IsoMesh, ring: number, sampleCount: number): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const offset = (ring * sampleCount + sample) * 3;
    x += mesh.positions[offset];
    y += mesh.positions[offset + 1];
    z += mesh.positions[offset + 2];
  }
  return { x: x / sampleCount, y: y / sampleCount, z: z / sampleCount };
}

function read(buffer: Float32Array, vertex: number): Vec3 {
  const offset = vertex * 3;
  return { x: buffer[offset], y: buffer[offset + 1], z: buffer[offset + 2] };
}

function write(buffer: Float32Array, vertex: number, value: Vec3) {
  const offset = vertex * 3;
  buffer[offset] = value.x;
  buffer[offset + 1] = value.y;
  buffer[offset + 2] = value.z;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec3, factor: number): Vec3 {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(value: Vec3): Vec3 {
  return scale(value, 1 / length(value));
}

function unitPerp(value: Vec3): Vec3 {
  const helper = Math.abs(value.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalize(cross(value, helper));
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}
