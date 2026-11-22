import type { IsoMesh } from "../scan/isomesh";
import type { ReadyModule } from "./adapt";
import type { HybridCandidate } from "./candidate-field";
import type { FaceFrame, FaceId, Vec3 } from "./contract";
import { faceBoundarySamples } from "./face-outline";
import { extractFaceProfile, type ProfilePoint } from "./face-profile";
import type { GeneratedHybridCandidate } from "./generated-hybrid-field";
import { loftSectionRings } from "./hybrid-spine";

/**
 * Active Skill 04 generator. Eight real cuts run through each parent, from the
 * back of the tile to the selected face. Each hybrid section continues that
 * whole sequence past the face, then negotiates the two continued outlines.
 * Section size follows the gray faces. A cut that only nicks the solid cannot
 * shrink the connector to a thread. The loft only builds that sequence.
 * The previous face-outline loft remains in hybrid-spine.ts and is not called here.
 */
export const SECTIONAL_GENERATOR_ACTIVE = true;

export const SECTIONAL_GENERATOR_SETTINGS = {
  version: "skill4-sectional-generator-v14",
  sections: 8,
  nearFraction: 0,
  farFraction: 1,
  samples: 36,
  rings: 7,
} as const;

export type SectionReport = {
  sectionsA: number;
  sectionsB: number;
  nearOpeningsA: number;
  nearOpeningsB: number;
  stations: number;
  correspondence: "YES" | "NO";
  fromA: string;
  fromB: string;
  recombined: string;
  dropped: string;
  /** Piercings after adaptive correspondence, before a failure repair is kept. */
  initialPiercings: number;
  /** Failure repairs kept for this connector, in the order they were accepted. */
  repairs: string;
  /** Piercing count just before a kept section-overlap repair. -1 when that repair was not kept. */
  overlapBefore: number;
  /** Piercing count just before a kept open-cap repair. -1 when that repair was not kept. */
  capBefore: number;
};

export type SectionGuide = {
  id: string;
  mesh: IsoMesh;
  color: [number, number, number];
  opacity?: number;
};

type Sample = { u: number; v: number; position: Vec3 };
type LoopRole = "outer" | "opening";
type Persistence = "near-face" | "deep";

type OrderedLoop = {
  role: LoopRole;
  persistence: Persistence;
  samples: Sample[];
  centroid: { u: number; v: number };
  area: number;
  perimeter: number;
};

type SectionCut = {
  depth: number;
  planeOrigin: Vec3;
  planeNormal: Vec3;
  planeU: Vec3;
  planeV: Vec3;
  centroid3D: Vec3;
  worldContour: Vec3[];
  local2DContour: { u: number; v: number }[];
  outer: OrderedLoop | null;
  openings: OrderedLoop[];
  /** True when this cut had no intersection and the generator reused another cut's loop. */
  copied?: boolean;
};

type ParentDna = {
  frame: FaceFrame;
  depth: number;
  sections: SectionCut[];
  nearOpenings: number;
};

type SectionStudy = {
  dnaA: ParentDna;
  dnaB: ParentDna;
  shift: number;
  correspondence: "YES" | "NO";
  /** Mean radius of each gray face. The connector stays in this range. */
  anchorA: number;
  anchorB: number;
  /** 0 at face A, 1 at face B. Interior values are the equal plates that fall between the faces. */
  hybridT: number[];
};

const PLANE_COLOR: [number, number, number] = [0.78, 0.8, 0.82];
const PARENT_SECTION: [number, number, number] = [0.93, 0.93, 0.95];
const DEEP_OPENING: [number, number, number] = [0.62, 0.66, 0.7];
const NEAR_OPENING: [number, number, number] = [0.96, 0.96, 0.98];
const HYBRID_SECTION: [number, number, number] = [0.86, 0.76, 0.68];

const studyCache = new Map<string, SectionStudy | null>();
const plateDepths = new Map<string, number[]>();

export function generateSectionalCandidates(request: {
  moduleA: ReadyModule;
  moduleB: ReadyModule;
  faceA: FaceId;
  faceB: FaceId;
  candidateField: { signature: string; candidates: HybridCandidate[] };
}): GeneratedHybridCandidate[] {
  return request.candidateField.candidates.map((candidate) => generateSectionalCandidate(request, candidate));
}

/** One candidate. The parent study is reused, so later candidates stay cheap. */
export function generateSectionalCandidate(
  request: {
    moduleA: ReadyModule;
    moduleB: ReadyModule;
    faceA: FaceId;
    faceB: FaceId;
  },
  candidate: HybridCandidate,
): GeneratedHybridCandidate {
  const study = studyFor(request.moduleA, request.faceA, request.moduleB, request.faceB);
  if (!study) return failed(candidate, "The sectional cuts did not produce an outer loop on both selected faces.");
  return buildCandidate(study, candidate, terminalSectionPair(request.moduleA, request.faceA, request.moduleB, request.faceB));
}

export function parentSectionGuides(module: ReadyModule, face: FaceId, label: string): SectionGuide[] {
  const frame = module.faces[face];
  if (!frame || !module.geometry) return [];
  const dna = readParent(module.geometry, frame, plateDepths.get(`${module.moduleId}|${face}`));
  if (!dna) return [];
  const guides: SectionGuide[] = [];
  dna.sections.forEach((section, index) => {
    const halfU = frame.extent.u * 0.62;
    const halfV = frame.extent.v * 0.62;
    guides.push({
      id: `section-plane:${label}:${index}`,
      mesh: planeMesh(section.planeOrigin, frame.u, frame.v, halfU, halfV),
      color: PLANE_COLOR,
      opacity: 0.22,
    });
    if (section.outer) {
      const points = section.outer.samples.map((sample) => sample.position);
      guides.push({
        id: `section-loop:${label}:${index}`,
        mesh: ribbon(points, 0.045),
        color: PARENT_SECTION,
      });
      guides.push({
        id: `section-points:${label}:${index}`,
        mesh: pointMarks(points, frame.u, frame.v, 0.07),
        color: PARENT_SECTION,
      });
    }
    section.openings.forEach((opening, openingIndex) => {
      guides.push({
        id: `section-opening:${label}:${index}:${openingIndex}`,
        mesh: ribbon(opening.samples.map((sample) => sample.position), 0.03),
        color: opening.persistence === "near-face" ? NEAR_OPENING : DEEP_OPENING,
        opacity: opening.persistence === "near-face" ? 0.95 : 0.4,
      });
    });
  });
  return guides;
}

export function hybridRingGuides(mesh: IsoMesh | null): SectionGuide[] {
  const samples = SECTIONAL_GENERATOR_SETTINGS.samples;
  const count = mesh ? mesh.positions.length / 3 : 0;
  const rings = count % samples === 0 ? count / samples : SECTIONAL_GENERATOR_SETTINGS.rings;
  if (!mesh || rings < 3) return [];
  const guides: SectionGuide[] = [];
  for (let station = 1; station < rings - 1; station += 1) {
    const points: Vec3[] = [];
    for (let sample = 0; sample < samples; sample += 1) {
      const offset = (station * samples + sample) * 3;
      points.push({ x: mesh.positions[offset], y: mesh.positions[offset + 1], z: mesh.positions[offset + 2] });
    }
    const center = average(points);
    const lifted = points.map((point) => add(point, scale(normalize(sub(point, center)), 0.06)));
    guides.push({
      id: `hybrid-section:${station}`,
      mesh: ribbon(lifted, 0.035),
      color: HYBRID_SECTION,
      opacity: 0.9,
    });
  }
  return guides;
}

export type SectionProfile = {
  label: string;
  outer: { u: number; v: number }[];
  openings: { u: number; v: number }[][];
};

/** Planar cuts already used by the generator. Display order is A8→A1 and B1→B8. */
export function connectionSectionProfiles(
  moduleA: ReadyModule,
  faceA: FaceId,
  moduleB: ReadyModule,
  faceB: FaceId,
): { a: SectionProfile[]; b: SectionProfile[] } | null {
  const study = studyFor(moduleA, faceA, moduleB, faceB);
  if (!study) return null;
  return {
    a: parentProfiles(study.dnaA, "A"),
    b: parentProfiles(study.dnaB, "B"),
  };
}

/** Rings of the selected hybrid loft, projected for the 2D sequence. */
export function hybridSectionProfiles(mesh: IsoMesh | null): SectionProfile[] {
  const rings = meshRings(mesh);
  if (!rings) return [];
  const start = average(rings[0]);
  const end = average(rings[rings.length - 1]);
  let normal = sub(end, start);
  normal = length(normal) < 1e-5 ? { x: 1, y: 0, z: 0 } : normalize(normal);
  let uAxis = reject({ x: 0, y: 1, z: 0 }, normal);
  if (length(uAxis) < 1e-5) uAxis = reject({ x: 0, y: 0, z: 1 }, normal);
  uAxis = normalize(uAxis);
  const vAxis = cross(normal, uAxis);
  return rings.map((points, station) => {
    const origin = average(points);
    return {
      label: station === 0 ? "A1" : station === rings.length - 1 ? "B1" : `H${station}`,
      outer: points.map((point) => {
        const delta = sub(point, origin);
        return { u: dot(delta, uAxis), v: dot(delta, vAxis) };
      }),
      openings: [],
    };
  });
}

/** Ghosted plates of the selected hybrid, in their real order along the span. */
export function hybridEvolutionGuides(mesh: IsoMesh | null): SectionGuide[] {
  const rings = meshRings(mesh);
  if (!rings) return [];
  const orange: [number, number, number] = [0.95, 0.42, 0.16];
  const paper: [number, number, number] = [0.9, 0.9, 0.92];
  const teal: [number, number, number] = [0.22, 0.78, 0.82];
  return rings.map((points, station) => {
    const t = rings.length === 1 ? 0 : station / (rings.length - 1);
    const color = t < 0.5 ? mixColor(orange, paper, t * 2) : mixColor(paper, teal, (t - 0.5) * 2);
    return {
      id: `evolution:${station}`,
      mesh: ribbon(points, 0.11),
      color,
      opacity: station === 0 || station === rings.length - 1 ? 0.95 : 0.72,
    };
  });
}

function parentProfiles(dna: ParentDna, letter: "A" | "B"): SectionProfile[] {
  return publishSections(dna, "", "N", letter).map((section) => ({
    label: section.label,
    outer: section.profile,
    openings: section.openingProfiles,
  }));
}

export type ProcessSection = {
  label: string;
  moduleId: string;
  face: FaceId;
  depth: number;
  planeOrigin: Vec3;
  planeNormal: Vec3;
  planeU: Vec3;
  planeV: Vec3;
  centroid3D: Vec3;
  copied: boolean;
  worldContour: Vec3[];
  local2DContour: { u: number; v: number }[];
  outer: Vec3[];
  openings: Vec3[][];
  profile: { u: number; v: number }[];
  openingProfiles: { u: number; v: number }[][];
};

/** One record per cut. Planes, 3D loops, and 2D profiles are the same samples. */
export function connectionProcess(
  moduleA: ReadyModule,
  faceA: FaceId,
  moduleB: ReadyModule,
  faceB: FaceId,
): { key: string; a: ProcessSection[]; b: ProcessSection[] } | null {
  const study = studyFor(moduleA, faceA, moduleB, faceB);
  if (!study || !moduleA.geometry || !moduleB.geometry) return null;
  return {
    key: [
      SECTIONAL_GENERATOR_SETTINGS.version,
      moduleA.moduleId,
      faceA,
      moduleB.moduleId,
      faceB,
      moduleA.geometry.triangles,
      moduleB.geometry.triangles,
    ].join("|"),
    a: publishSections(study.dnaA, moduleA.moduleId, faceA, "A"),
    b: publishSections(study.dnaB, moduleB.moduleId, faceB, "B"),
  };
}

/** 2D profiles of the loft rings. Each profile is the projection of that ring's own points. */
export function loftSectionViews(rings: readonly (readonly Vec3[])[]): { label: string; outer: Vec3[]; profile: { u: number; v: number }[] }[] {
  if (rings.length < 1 || rings.some((ring) => ring.length < 3)) return [];
  const start = average(rings[0]);
  const end = average(rings[rings.length - 1]);
  let normal = sub(end, start);
  normal = length(normal) < 1e-5 ? { x: 1, y: 0, z: 0 } : normalize(normal);
  let uAxis = reject({ x: 0, y: 1, z: 0 }, normal);
  if (length(uAxis) < 1e-5) uAxis = reject({ x: 0, y: 0, z: 1 }, normal);
  uAxis = normalize(uAxis);
  const vAxis = cross(normal, uAxis);
  return rings.map((points, station) => {
    const origin = average(points);
    return {
      label: station === 0 ? "A1" : station === rings.length - 1 ? "B1" : `H${station}`,
      outer: points.map((point) => ({ x: point.x, y: point.y, z: point.z })),
      profile: points.map((point) => {
        const delta = sub(point, origin);
        return { u: dot(delta, uAxis), v: dot(delta, vAxis) };
      }),
    };
  });
}

/** Same loops, moved apart along their existing order so the plates can be read. */
export function separateLoftRings(rings: readonly (readonly Vec3[])[]): Vec3[][] {
  if (rings.length < 2) return rings.map((ring) => ring.map((point) => ({ x: point.x, y: point.y, z: point.z })));
  const centers = rings.map((ring) => average(ring));
  const axisRaw = sub(centers[centers.length - 1], centers[0]);
  const span = length(axisRaw);
  const axis = span < 1e-5 ? { x: 1, y: 0, z: 0 } : normalize(axisRaw);
  let radius = 0;
  let count = 0;
  rings.forEach((ring, index) => {
    ring.forEach((point) => {
      radius += length(sub(point, centers[index]));
      count += 1;
    });
  });
  const mean = count > 0 ? radius / count : 1;
  const step = Math.max(span / (rings.length - 1), mean * 1.15);
  const mid = (rings.length - 1) / 2;
  return rings.map((ring, index) => {
    const center = centers[index];
    const target = scale(axis, (index - mid) * step);
    const delta = sub(target, center);
    return ring.map((point) => add(point, delta));
  });
}

export function sectionCutGuides(section: ProcessSection, cut: [number, number, number]) {
  const normal = section.planeNormal;
  let tangent = reject({ x: 0, y: 1, z: 0 }, normal);
  if (length(tangent) < 1e-5) tangent = reject({ x: 1, y: 0, z: 0 }, normal);
  tangent = normalize(tangent);
  const bitangent = cross(normal, tangent);
  let half = 0.5;
  section.outer.forEach((point) => {
    const delta = sub(point, section.planeOrigin);
    half = Math.max(half, Math.abs(dot(delta, tangent)), Math.abs(dot(delta, bitangent)));
  });
  half *= 1.12;
  const paper: [number, number, number] = [0.93, 0.93, 0.91];
  const guides: { mesh: IsoMesh; color: [number, number, number]; opacity: number }[] = [
    { mesh: planeMesh(section.planeOrigin, tangent, bitangent, half, half), color: paper, opacity: 0.18 },
    { mesh: ribbon(section.outer, 0.16), color: cut, opacity: 1 },
  ];
  section.openings.forEach((opening) => {
    if (opening.length >= 3) guides.push({ mesh: ribbon(opening, 0.08), color: cut, opacity: 0.9 });
  });
  return guides;
}

function publishSections(dna: ParentDna, moduleId: string, face: FaceId, letter: "A" | "B"): ProcessSection[] {
  const listed = dna.sections.map((section, index) => ({
    label: `${letter}${index + 1}`,
    moduleId,
    face,
    depth: section.depth,
    planeOrigin: section.planeOrigin,
    planeNormal: section.planeNormal,
    planeU: section.planeU,
    planeV: section.planeV,
    centroid3D: section.centroid3D,
    copied: section.copied === true,
    worldContour: section.worldContour.map((point) => ({ x: point.x, y: point.y, z: point.z })),
    local2DContour: section.local2DContour.map((point) => ({ u: point.u, v: point.v })),
    outer: section.outer ? section.outer.samples.map((sample) => sample.position) : [],
    openings: section.openings.map((opening) => opening.samples.map((sample) => sample.position)),
    profile: section.outer ? projectOnFrame(dna.frame, section.outer.samples) : [],
    openingProfiles: section.openings.map((opening) => projectOnFrame(dna.frame, opening.samples)),
  })).filter((section) => section.outer.length >= 3 && section.profile.length >= 3);
  return letter === "A" ? [...listed].reverse() : listed;
}

function projectOnFrame(frame: FaceFrame, samples: Sample[]) {
  // Vertical faces store height on frame.u. The catalog reads u across and v up,
  // so a vertical cut is turned onto its side unless height is written to v.
  // Looking in from outside the face, -frame.v points to the right and frame.u points up.
  const vertical = Math.abs(frame.normal.y) < 0.72;
  return samples.map((sample) => {
    const delta = sub(sample.position, frame.origin);
    if (!vertical) return { u: dot(delta, frame.u), v: dot(delta, frame.v) };
    return { u: -dot(delta, frame.v), v: dot(delta, frame.u) };
  });
}

function meshRings(mesh: IsoMesh | null): Vec3[][] | null {
  const samples = SECTIONAL_GENERATOR_SETTINGS.samples;
  const count = mesh ? mesh.positions.length / 3 : 0;
  if (!mesh || count < samples * 3) return null;
  // Placement appends the face coat after the loft. The rings stay the prefix.
  const rings = count % samples === 0
    ? count / samples
    : SECTIONAL_GENERATOR_SETTINGS.rings * samples <= count
      ? SECTIONAL_GENERATOR_SETTINGS.rings
      : 0;
  if (rings < 3) return null;
  return Array.from({ length: rings }, (_, station) => {
    const points: Vec3[] = [];
    for (let sample = 0; sample < samples; sample += 1) {
      const offset = (station * samples + sample) * 3;
      points.push({ x: mesh.positions[offset], y: mesh.positions[offset + 1], z: mesh.positions[offset + 2] });
    }
    return points;
  });
}

export type SectionContour = {
  label: string;
  outer: Vec3[];
  openings: Vec3[][];
};

/** Parent cuts in module space. A is far-to-face (A8→A1). B is face-to-far (B1→B8). */
export function connectionSectionContours(
  moduleA: ReadyModule,
  faceA: FaceId,
  moduleB: ReadyModule,
  faceB: FaceId,
): { a: SectionContour[]; b: SectionContour[] } | null {
  const study = studyFor(moduleA, faceA, moduleB, faceB);
  if (!study) return null;
  return {
    a: contourList(study.dnaA, "A"),
    b: contourList(study.dnaB, "B"),
  };
}

export function sectionPlate(points: Vec3[]): IsoMesh {
  if (points.length < 3) {
    return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), triangles: 0 };
  }
  const center = average(points);
  const normal = normalize(cross(sub(points[1], points[0]), sub(points[Math.min(2, points.length - 1)], points[0])));
  const positions = new Float32Array((points.length + 1) * 3);
  const normals = new Float32Array((points.length + 1) * 3);
  positions[0] = center.x;
  positions[1] = center.y;
  positions[2] = center.z;
  for (let index = 0; index < points.length; index += 1) {
    const offset = (index + 1) * 3;
    positions[offset] = points[index].x;
    positions[offset + 1] = points[index].y;
    positions[offset + 2] = points[index].z;
  }
  for (let index = 0; index <= points.length; index += 1) {
    normals[index * 3] = normal.x;
    normals[index * 3 + 1] = normal.y;
    normals[index * 3 + 2] = normal.z;
  }
  const indices: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    indices.push(0, index + 1, ((index + 1) % points.length) + 1);
  }
  return { positions, normals, indices: Uint32Array.from(indices), triangles: indices.length / 3 };
}

export function sectionRibbon(points: Vec3[], width = 0.045): IsoMesh {
  return ribbon(points, width);
}

export function hybridSectionRings(mesh: IsoMesh | null): Vec3[][] | null {
  return meshRings(mesh);
}

function contourList(dna: ParentDna, letter: "A" | "B"): SectionContour[] {
  const listed = dna.sections.map((section, index) => ({
    label: `${letter}${index + 1}`,
    outer: section.outer ? section.outer.samples.map((sample) => sample.position) : [],
    openings: section.openings.map((opening) => opening.samples.map((sample) => sample.position)),
  })).filter((section) => section.outer.length >= 3);
  return letter === "A" ? [...listed].reverse() : listed;
}

function mixColor(from: [number, number, number], to: [number, number, number], t: number): [number, number, number] {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function studyFor(moduleA: ReadyModule, faceA: FaceId, moduleB: ReadyModule, faceB: FaceId): SectionStudy | null {
  const frameA = moduleA.faces[faceA];
  const frameB = moduleB.faces[faceB];
  if (!frameA || !frameB || !moduleA.geometry || !moduleB.geometry) return null;
  const key = [
    SECTIONAL_GENERATOR_SETTINGS.version,
    moduleA.moduleId,
    faceA,
    moduleB.moduleId,
    faceB,
    moduleA.geometry.triangles,
    moduleB.geometry.triangles,
  ].join("|");
  const cached = studyCache.get(key);
  if (cached !== undefined) return cached;
  const spanA = moduleA.geometry ? solidSpan(moduleA.geometry, frameA) : null;
  const spanB = moduleB.geometry ? solidSpan(moduleB.geometry, frameB) : null;
  const plates = spanA && spanB ? equalPlates(spanA.far, spanB.far) : null;
  const dnaA = readParent(moduleA.geometry, frameA, plates?.depthsA);
  const dnaB = readParent(moduleB.geometry, frameB, plates?.depthsB);
  if (plates) {
    plateDepths.set(`${moduleA.moduleId}|${faceA}`, plates.depthsA);
    plateDepths.set(`${moduleB.moduleId}|${faceB}`, plates.depthsB);
  }
  if (!dnaA?.sections[0]?.outer || !dnaB?.sections[0]?.outer) {
    studyCache.set(key, null);
    return null;
  }
  const shift = bestShift(dnaA.sections[0].outer.samples, dnaB.sections[0].outer.samples);
  const alignedB = shiftSamples(dnaB.sections[0].outer.samples, shift);
  const correspondence = correspondenceOf(dnaA.sections[0].outer.samples, alignedB);
  const count = SECTIONAL_GENERATOR_SETTINGS.samples;
  const boundaryA = faceBoundarySamples(moduleA.geometry, frameA, count);
  const boundaryB = faceBoundarySamples(moduleB.geometry, frameB, count);
  const study = {
    dnaA,
    dnaB,
    shift,
    correspondence,
    hybridT: plates?.hybridT ?? [0, 0.5, 1],
    anchorA: Math.max(loopReach(boundaryA), loopReach(dnaA.sections[0].outer.samples.map((sample) => sample.position)), 0.5),
    anchorB: Math.max(loopReach(boundaryB), loopReach(dnaB.sections[0].outer.samples.map((sample) => sample.position)), 0.5),
  };
  studyCache.set(key, study);
  return study;
}

export function terminalSectionPair(
  moduleA: ReadyModule,
  faceA: FaceId,
  moduleB: ReadyModule,
  faceB: FaceId,
): { a: Vec3[]; b: Vec3[] } | null {
  const study = studyFor(moduleA, faceA, moduleB, faceB);
  const outerA = study?.dnaA.sections[0]?.outer?.samples;
  const outerB = study?.dnaB.sections[0]?.outer?.samples;
  if (!study || !outerA || !outerB || outerA.length !== outerB.length) return null;
  const sectionA = outerA.map((sample) => sample.position);
  const sectionB = shiftSamples(outerB, study.shift).map((sample) => sample.position);
  const frameA = moduleA.faces[faceA];
  const frameB = moduleB.faces[faceB];
  const boundaryA = moduleA.geometry && frameA ? faceBoundarySamples(moduleA.geometry, frameA, sectionA.length) : null;
  const boundaryB = moduleB.geometry && frameB ? faceBoundarySamples(moduleB.geometry, frameB, sectionB.length) : null;
  return {
    a: alignPoints(boundaryA ?? sectionA, sectionA),
    b: alignPoints(boundaryB ?? sectionB, sectionB),
  };
}

function alignPoints(points: Vec3[], reference: Vec3[]): Vec3[] {
  if (points.length !== reference.length || points.length === 0) return reference;
  let bestShift = 0;
  let bestCost = Infinity;
  let reverse = false;
  for (const flipped of [false, true]) {
    for (let shift = 0; shift < points.length; shift += 1) {
      let cost = 0;
      for (let index = 0; index < points.length; index += 1) {
        const source = flipped
          ? points[(shift - index + points.length) % points.length]
          : points[(index + shift) % points.length];
        const target = reference[index];
        cost += (source.x - target.x) ** 2 + (source.y - target.y) ** 2 + (source.z - target.z) ** 2;
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestShift = shift;
        reverse = flipped;
      }
    }
  }
  return points.map((_, index) => (
    reverse
      ? points[(bestShift - index + points.length) % points.length]
      : points[(index + bestShift) % points.length]
  ));
}

function readParent(mesh: IsoMesh, frame: FaceFrame, depths?: number[]): ParentDna | null {
  const span = solidSpan(mesh, frame);
  if (!span) return null;
  const cuts: SectionCut[] = [];
  let previous: { u: number; v: number } | null = null;
  const targets = (depths && depths.length >= 2 ? depths : equalDepths(span.near, span.far)).slice().sort((left, right) => right - left);
  targets.forEach((target) => {
    const hit = cutAt(mesh, frame, target, span);
    const outer = hit ? orderLoop(largestOuter(hit.profile) ?? [], previous) : null;
    if (outer) previous = { u: outer.samples[0].u, v: outer.samples[0].v };
    const depth = hit?.depth ?? target;
    cuts.push({
      depth,
      planeOrigin: add(frame.origin, scale(frame.normal, -depth)),
      planeNormal: frame.normal,
      planeU: frame.u,
      planeV: frame.v,
      centroid3D: frame.origin,
      worldContour: [],
      local2DContour: [],
      outer,
      openings: hit && outer
        ? collectInner(hit.profile, largestOuter(hit.profile) ?? []).map((loop) => ({ ...loop, persistence: "deep" as Persistence }))
        : [],
      copied: false,
    });
  });
  cuts.reverse();
  fillSections(cuts, frame);
  stampSectionFrames(cuts, frame);
  classifyOpenings(cuts);
  const ready = cuts.filter((cut) => cut.outer && cut.outer.samples.length === SECTIONAL_GENERATOR_SETTINGS.samples).length;
  if (ready < 2 || ready < cuts.length || !cuts[0]?.outer) return null;
  return {
    frame,
    depth: span.far,
    sections: cuts,
    nearOpenings: cuts[0].openings.filter((opening) => opening.persistence === "near-face").length,
  };
}

function equalDepths(near: number, far: number) {
  const last = SECTIONAL_GENERATOR_SETTINGS.sections - 1;
  return Array.from({ length: last + 1 }, (_, index) => near + (far - near) * (index / last));
}

/** Eight equally spaced cuts through each parent, face included. Seven hybrid stations run from gray face to gray face. */
function equalPlates(depthA: number, depthB: number) {
  const spacing = 1;
  const through = (far: number) => {
    const last = SECTIONAL_GENERATOR_SETTINGS.sections - 1;
    return Array.from({ length: last + 1 }, (_, index) => far * (index / last));
  };
  const depthsA = through(Math.max(depthA, 0.5));
  const depthsB = through(Math.max(depthB, 0.5));
  const gapCuts = SECTIONAL_GENERATOR_SETTINGS.rings;
  const hybridT = Array.from({ length: gapCuts }, (_, index) => index / (gapCuts - 1));
  const unique = (depths: number[], far: number) => {
    const kept = [...new Set(depths.map((depth) => Number(Math.max(0, depth).toFixed(4))))].sort((left, right) => left - right);
    if (kept.length >= 2) return kept;
    return [0, Number(Math.max(far, spacing).toFixed(4))].sort((left, right) => left - right);
  };
  return {
    depthsA: unique(depthsA, depthA),
    depthsB: unique(depthsB, depthB),
    hybridT,
  };
}

function fillSections(cuts: SectionCut[], frame: FaceFrame) {
  const count = SECTIONAL_GENERATOR_SETTINGS.samples;
  for (let index = 0; index < cuts.length; index += 1) {
    const outer = cuts[index].outer;
    if (outer && outer.samples.length === count) continue;
    const donor = cuts.find((cut) => cut.outer && cut.outer.samples.length === count)?.outer;
    if (!donor) continue;
    const samples = donor.samples.map((sample) => ({
      ...sample,
      position: add(sample.position, scale(frame.normal, -(cuts[index].depth - donorDepth(cuts, donor)))),
    }));
    cuts[index].outer = { ...donor, samples };
    cuts[index].copied = true;
  }
}

function donorDepth(cuts: SectionCut[], donor: OrderedLoop) {
  return cuts.find((cut) => cut.outer === donor)?.depth ?? 0;
}

/** Records the plane frame and the contour that was actually cut. Extraction is unchanged. */
function stampSectionFrames(cuts: SectionCut[], frame: FaceFrame) {
  cuts.forEach((cut) => {
    const samples = cut.outer?.samples ?? [];
    cut.planeNormal = frame.normal;
    cut.planeU = frame.u;
    cut.planeV = frame.v;
    cut.worldContour = samples.map((sample) => ({ x: sample.position.x, y: sample.position.y, z: sample.position.z }));
    cut.local2DContour = samples.map((sample) => ({ u: sample.u, v: sample.v }));
    cut.centroid3D = cut.worldContour.length > 0 ? average(cut.worldContour) : { x: cut.planeOrigin.x, y: cut.planeOrigin.y, z: cut.planeOrigin.z };
  });
}

function classifyOpenings(sections: SectionCut[]) {
  const near = sections[0];
  if (!near?.outer) return;
  const chains: { centroid: { u: number; v: number }; near: boolean }[] = [];
  sections.forEach((section, sectionIndex) => {
    section.openings.forEach((opening) => {
      const match = chains.find((chain) => distance2(chain.centroid, opening.centroid) < Math.max(0.35, opening.perimeter * 0.08));
      const active = sectionIndex === 0;
      if (match) {
        match.centroid = opening.centroid;
        match.near = match.near || active;
      } else chains.push({ centroid: opening.centroid, near: active });
    });
  });
  sections.forEach((section, sectionIndex) => {
    section.openings.forEach((opening) => {
      const match = chains.find((chain) => distance2(chain.centroid, opening.centroid) < Math.max(0.35, opening.perimeter * 0.08));
      opening.persistence = sectionIndex === 0 || match?.near ? "near-face" : "deep";
    });
  });
}

function buildCandidate(
  study: SectionStudy,
  candidate: HybridCandidate,
  ends: { a: Vec3[]; b: Vec3[] } | null = null,
): GeneratedHybridCandidate {
  const chainA = sectionChain(study.dnaA.sections, 0);
  const chainB = sectionChain(study.dnaB.sections, study.shift);
  if (!chainA || !chainB) return failed(candidate, "A near-face section is missing.");
  const designed = designHybrid(chainA, chainB, study.dnaA.sections, study.dnaB.sections, study.shift, candidate.column, candidate.row, study.hybridT, study.anchorA, study.anchorB);
  const generated = generateThenRepair(designed.rings, designed.openings, ends);
  const settled = { ok: true, rings: generated.rings, openings: generated.openings };
  const report: SectionReport = {
    sectionsA: study.dnaA.sections.filter((section) => section.outer).length,
    sectionsB: study.dnaB.sections.filter((section) => section.outer).length,
    nearOpeningsA: study.dnaA.nearOpenings,
    nearOpeningsB: study.dnaB.nearOpenings,
    stations: Math.max(1, study.hybridT.length - 2),
    correspondence: settled.ok && study.correspondence === "YES" ? "YES" : "NO",
    fromA: designed.fromA,
    fromB: designed.fromB,
    recombined: designed.recombined,
    dropped: designed.dropped,
    initialPiercings: generated.initialPiercings,
    repairs: generated.repairs.join(", ") || "none",
    overlapBefore: generated.overlapBefore,
    capBefore: generated.capBefore,
  };
  if (!settled.ok) {
    return { ...failed(candidate, "Section correspondence did not settle. The loft was not built."), sectionReport: report };
  }
  const mesh = loftSectionRings(settled.rings);
  return {
    candidateId: candidate.id,
    candidate,
    status: "ready",
    geometry: mesh,
    vertexCount: mesh.positions.length / 3,
    triangleCount: mesh.triangles,
    reason: "",
    branches: 1,
    openings: report.nearOpeningsA + report.nearOpeningsB > 0 ? 1 : 0,
    sectionReport: report,
    loftRings: settled.rings.map((ring) => ring.map((point) => ({ x: point.x, y: point.y, z: point.z }))),
    loftOpenings: settled.openings,
  };
}

function sectionChain(sections: SectionCut[], shift: number): Sample[][] | null {
  const count = SECTIONAL_GENERATOR_SETTINGS.samples;
  const chain = sections.map((section) => {
    const samples = section.outer?.samples;
    if (!samples || samples.length !== count) return null;
    return shift === 0 ? samples : shiftSamples(samples, shift);
  });
  return chain.every((samples): samples is Sample[] => samples !== null) ? chain : null;
}

type Planar = { u: number; v: number };

type FormModel = {
  family: Planar[];
  projected: Planar[][];
  offset: number[];
  meanRadius: number[];
  drift: Planar;
  expansion: number;
  twist: number;
  plate: boolean;
  stepped: boolean;
  thick: boolean;
  lobes: number;
  recesses: number;
  voids: { angle: number; reach: number }[];
  labels: string[];
};

function designHybrid(
  chainA: Sample[][],
  chainB: Sample[][],
  cutsA: SectionCut[],
  cutsB: SectionCut[],
  shift: number,
  column: number,
  row: number,
  hybridT: number[],
  anchorA: number,
  anchorB: number,
): { rings: Vec3[][]; openings: Vec3[][][]; fromA: string; fromB: string; recombined: string; dropped: string } {
  void anchorA;
  void anchorB;
  const nearA = chainA[0];
  const nearB = chainB[0];
  const travel = sub(average(nearB.map((sample) => sample.position)), average(nearA.map((sample) => sample.position)));
  const frameA = orientFrame(loopFrame(nearA), travel);
  const frameB = orientFrame(loopFrame(nearB), travel);
  const projectedA = projectChain(chainA, frameA);
  const projectedB = projectChain(chainB, frameB);
  const openingsA = projectOpenings(cutsA, frameA, 0);
  const openingsB = projectOpenings(cutsB, frameB, shift);
  const formA = formModel(projectedA, voidMarks(cutsA, frameA, 0));
  const formB = formModel(projectedB, voidMarks(cutsB, frameB, shift));
  const aWeight = [0.94, 0.78, 0.5, 0.22, 0.06][clampIndex(column)];
  const remix = [0.12, 0.34, 0.58, 0.8, 1][clampIndex(row)];
  const inheritance = inheritTraits(formA, formB, aWeight, remix);
  const rings: Vec3[][] = [];
  const openingRings: Vec3[][][] = [];
  const stations = hybridT.length >= 3 ? hybridT : [0, 0.5, 1];
  const placedFrames = stationFrames(chainA, chainB, stations);
  const reach = [0.4, 0.75, 1.1, 1.5, 1.95][clampIndex(row)];
  stations.forEach((t, station) => {
    const share = parentShare(t, aWeight);
    const evolved = evolveStation(projectedA, projectedB, openingsA, openingsB, cutsA, cutsB, t, share, remix, reach);
    const designedRing = softenPlanar(evolved.outer, 0.08);
    const placed = placedFrames[station];
    const vAxis = signedArea(designedRing) < 0 ? scale(placed.v, -1) : placed.v;
    const place = (point: Planar) => add(placed.origin, add(scale(placed.u, point.u), scale(vAxis, point.v)));
    const raw = designedRing.map(place);
    const seat = sub(placed.origin, average(raw));
    rings.push(raw.map((point) => add(point, seat)));
    openingRings.push(evolved.openings.map((loop) => loop.map((point) => add(place(point), seat))));
  });
  const flowed = flowRings(rings);
  const kept = rings.map((ring, index) => (loopReach(flowed[index]) < loopReach(ring) * 0.85 ? ring : flowed[index]));
  return {
    rings: holdPlateStations(rings, kept).map((ring, index) => flattenToFrame(ring, placedFrames[index])),
    openings: openingRings,
    ...inheritance,
  };
}

type FailureKind = "rotation" | "end-cap" | "fold" | "scale" | "open-cap";

/** Builds the connector with adaptive correspondence, then keeps at most the one repair that matches the current failure. A kept repair is checked again, so a second, different failure can be repaired. A repair that does not lower the piercing count is discarded. */
function generateThenRepair(rings: Vec3[][], openings: Vec3[][][], ends: { a: Vec3[]; b: Vec3[] } | null) {
  const repairs: string[] = [];
  const closed = closeOpeningGradually(rings, openings);
  const openingChanged = closed.rings !== rings;
  const plain = resolveCorrespondence(rings, openings, ends);
  let current = plain;
  let initialPiercings = piercingCount(plain.rings);
  if (openingChanged) {
    const trial = resolveCorrespondence(closed.rings, closed.openings, ends);
    const nextCount = piercingCount(trial.rings);
    if (nextCount < initialPiercings) {
      current = trial;
      repairs.push("opening-close");
    }
  }
  const used = new Set<FailureKind>();
  let overlapBefore = -1;
  let capBefore = -1;
  for (let pass = 0; pass < 5; pass += 1) {
    const failures = rankFailures(current.rings, used);
    const pending = failures.filter((failure) => !used.has(failure.kind));
    if (pending.length === 0) break;
    let applied = false;
    for (const failure of pending) {
      used.add(failure.kind);
      const trial = applyFailure(current.rings, current.openings, failure);
      if (!trial) continue;
      if (trial.repair === "section-overlap") overlapBefore = trial.beforeCount;
      if (trial.repair === "open-cap") capBefore = trial.beforeCount;
      current = trial;
      repairs.push(trial.repair);
      applied = true;
      break;
    }
    if (!applied) continue;
  }
  return { rings: current.rings, openings: current.openings, repairs, initialPiercings, overlapBefore, capBefore };
}

function piercingCount(rings: Vec3[][]) {
  const samples = rings[0]?.length ?? 0;
  if (rings.length < 2 || samples < 3) return 0;
  return bandTotal(piercingBands(loftSectionRings(rings), rings.length, samples));
}

function rankFailures(rings: Vec3[][], used: Set<FailureKind>) {
  const count = rings.length;
  const samples = rings[0]?.length ?? 0;
  const found: { kind: FailureKind; station: number; score: number }[] = [];
  if (count < 3 || samples < 3) return found;
  const mesh = loftSectionRings(rings);
  const turns = rings.slice(0, -1).map((ring, index) => sectionTurn(ring, rings[index + 1]));
  let rotationScore = 0;
  let rotationStation = -1;
  turns.forEach((turn, index) => {
    if (Math.abs(turn) <= 90) return;
    const crossings = stripCrossings(mesh, index, samples);
    if (crossings > rotationScore) {
      rotationScore = crossings;
      rotationStation = index;
    }
  });
  if (rotationScore > 0) found.push({ kind: "rotation", station: rotationStation, score: rotationScore });
  const capScore = capClashCount(mesh, count - 1, samples);
  if (capScore > 0) found.push({ kind: "end-cap", station: count - 2, score: capScore });
  let foldScore = 0;
  let foldStation = -1;
  for (let station = 0; station < count - 1; station += 1) {
    if (Math.abs(turns[station] ?? 0) > 90) continue;
    if (!foldCluster(rings, mesh, station, samples)) continue;
    const crossings = stripCrossings(mesh, station, samples);
    if (crossings > foldScore) {
      foldScore = crossings;
      foldStation = station;
    }
  }
  if (foldScore > 0) found.push({ kind: "fold", station: foldStation, score: foldScore });
  const settled = found.every((failure) => used.has(failure.kind));
  if (settled && !used.has("scale")) {
    let scaleScore = 0;
    let scaleStation = -1;
    for (let station = 0; station < count - 1; station += 1) {
      const ratio = meanRadius(rings[station + 1]) / Math.max(1e-6, meanRadius(rings[station]));
      if (ratio >= 0.62 && ratio <= 1 / 0.62) continue;
      const crossings = stripCrossings(mesh, station, samples);
      if (crossings <= scaleScore) continue;
      scaleScore = crossings;
      scaleStation = station;
    }
    if (scaleScore > 0) found.push({ kind: "scale", station: scaleStation, score: scaleScore });
  }
  if (settled && !used.has("open-cap")) {
    const openScore = capClashCount(mesh, 0, samples);
    if (openScore > 0) found.push({ kind: "open-cap", station: 0, score: openScore });
  }
  const order: Record<FailureKind, number> = { fold: 0, "end-cap": 1, rotation: 2, scale: 3, "open-cap": 4 };
  return found.sort((left, right) => right.score - left.score || order[left.kind] - order[right.kind]);
}

function applyFailure(rings: Vec3[][], openings: Vec3[][][], failure: { kind: FailureKind; station: number }) {
  if (failure.kind === "rotation") {
    const turned = chooseTurnRepair(rings, openings);
    if (!turned.repair) return null;
    return { rings: turned.rings, openings: turned.openings, repair: turned.repair };
  }
  if (failure.kind === "end-cap") {
    const separated = separateEndCap(rings, openings);
    if (separated.rings === rings) return null;
    return { rings: separated.rings, openings: separated.openings, repair: "end-cap" };
  }
  if (failure.kind === "scale") {
    const eased = easeScaleJump(rings, openings, failure.station);
    if (eased.rings === rings) return null;
    return { rings: eased.rings, openings: eased.openings, repair: "section-overlap", beforeCount: eased.beforeCount };
  }
  if (failure.kind === "open-cap") {
    const eased = easeOpenCap(rings, openings);
    if (eased.rings === rings) return null;
    return { rings: eased.rings, openings: eased.openings, repair: "open-cap", beforeCount: eased.beforeCount };
  }
  const folded = easeStripFold(rings, openings, failure.station);
  if (folded.rings === rings) return null;
  return { rings: folded.rings, openings: folded.openings, repair: "fold" };
}

/** Eases a self-crossing strip whose width or height jumps. Each ring scales about its centroid, and only on the axis that jumped. */
function easeScaleJump(rings: Vec3[][], openings: Vec3[][][], station: number) {
  const count = rings.length;
  const samples = rings[0]?.length ?? 0;
  const ratio = meanRadius(rings[station + 1]) / Math.max(1e-6, meanRadius(rings[station]));
  if (count < 3 || samples < 3 || (ratio >= 0.62 && ratio <= 1 / 0.62)) return { rings, openings, beforeCount: 0 };
  const mesh = loftSectionRings(rings);
  if (stripCrossings(mesh, station, samples) === 0) return { rings, openings, beforeCount: 0 };
  const before = piercingBands(mesh, count, samples);
  const basis = sectionPlane(rings[station]);
  const prevBox = planeExtent(rings[station], basis.u, basis.v);
  const nextBox = planeExtent(rings[station + 1], basis.u, basis.v);
  const width = splitExtent(prevBox.width, nextBox.width);
  const height = splitExtent(prevBox.height, nextBox.height);
  const idle = [width[0], width[1], height[0], height[1]].every((factor) => Math.abs(factor - 1) < 0.02);
  if (idle) return { rings, openings, beforeCount: 0 };
  const nextRings = rings.map((ring) => ring.map((point) => ({ ...point })));
  const nextOpenings = openings.map((loops) => loops.map((loop) => loop.map((point) => ({ ...point }))));
  nextRings[station] = scaleInPlane(rings[station], width[0], height[0]);
  nextRings[station + 1] = scaleInPlane(rings[station + 1], width[1], height[1]);
  nextOpenings[station] = (openings[station] ?? []).map((loop) => scaleInPlane(loop, width[0], height[0]));
  nextOpenings[station + 1] = (openings[station + 1] ?? []).map((loop) => scaleInPlane(loop, width[1], height[1]));
  const after = piercingBands(loftSectionRings(nextRings), count, samples);
  const key = `${station}-${station + 1} x ${station}-${station + 1}`;
  if (bandTotal(after) >= bandTotal(before) || !foldBandsAccept(before, after, key)) return { rings, openings, beforeCount: 0 };
  return { rings: nextRings, openings: nextOpenings, beforeCount: bandTotal(before) };
}

function splitExtent(prev: number, next: number) {
  const ratio = next / Math.max(1e-6, prev);
  if (ratio >= 0.62 && ratio <= 1 / 0.62) return [1, 1];
  const eased = Math.sqrt(ratio);
  const newPrev = Math.sqrt(Math.max(1e-6, prev) * Math.max(1e-6, next) / eased);
  return [newPrev / Math.max(1e-6, prev), (newPrev * eased) / Math.max(1e-6, next)];
}

function sectionPlane(ring: Vec3[]) {
  const normal = sectionAxis(ring);
  let u = cross({ x: 0, y: 1, z: 0 }, normal);
  if (length(u) < 1e-4) u = { x: 1, y: 0, z: 0 };
  u = normalize(u);
  return { u, v: cross(normal, u) };
}

function planeExtent(ring: Vec3[], u: Vec3, v: Vec3) {
  const origin = average(ring);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  ring.forEach((point) => {
    const delta = sub(point, origin);
    const du = dot(delta, u);
    const dv = dot(delta, v);
    minU = Math.min(minU, du);
    maxU = Math.max(maxU, du);
    minV = Math.min(minV, dv);
    maxV = Math.max(maxV, dv);
  });
  return { width: Math.max(1e-6, maxU - minU), height: Math.max(1e-6, maxV - minV) };
}

function scaleInPlane(points: Vec3[], factorU: number, factorV: number) {
  if (points.length < 3) return points.map((point) => ({ ...point }));
  const origin = average(points);
  const { u, v } = sectionPlane(points);
  const normal = sectionAxis(points);
  return points.map((point) => {
    const delta = sub(point, origin);
    return add(origin, add(scale(normal, dot(delta, normal)), add(scale(u, dot(delta, u) * factorU), scale(v, dot(delta, v) * factorV))));
  });
}

/** When a clear opening collapses in one station and the section pinches, then rebounds, close that opening across the remaining stations. */
function closeOpeningGradually(rings: Vec3[][], openings: Vec3[][][]) {
  const areaOf = (loop: Vec3[]) => {
    const origin = average(loop);
    let sum = 0;
    for (let index = 0; index < loop.length; index += 1) {
      const next = loop[(index + 1) % loop.length];
      const left = sub(loop[index], origin);
      const right = sub(next, origin);
      sum += length(cross(left, right));
    }
    return sum * 0.5;
  };
  const areas = openings.map((station) => station.reduce((max, loop) => Math.max(max, areaOf(loop)), 0));
  const peak = Math.max(...areas, 0);
  let clear = -1;
  areas.forEach((area, index) => {
    if (area >= peak * 0.35) clear = index;
  });
  const end = rings.length - 1;
  const collapsed = clear >= 0 ? areas[clear + 1] ?? 0 : peak;
  const radii = rings.map((ring) => meanRadius(ring));
  const pinched = clear >= 0 && clear + 1 <= end && radii[clear + 1] < radii[clear] * 0.72;
  const rebound = clear >= 0 && radii.slice(clear + 2).some((radius) => radius > radii[clear + 1] * 1.35);
  if (peak < 1 || clear < 1 || clear >= end - 1 || collapsed > areas[clear] * 0.3 || !pinched || !rebound) return { rings, openings };
  const nextRings = rings.map((ring) => ring.map((point) => ({ ...point })));
  const nextOpenings = openings.map((station) => station.map((loop) => loop.map((point) => ({ ...point }))));
  const source = openings[clear].reduce((best, loop) => areaOf(loop) > areaOf(best) ? loop : best);
  const sourceCenter = average(source);
  const sourceOffset = sub(sourceCenter, average(rings[clear]));
  for (let station = clear + 1; station < end; station += 1) {
    const t = (station - clear) / (end - clear);
    const gain = 1 - t;
    const center = add(average(rings[station]), scale(sourceOffset, gain));
    nextOpenings[station] = [source.map((point) => add(center, scale(sub(point, sourceCenter), gain)))];
    const origin = average(rings[station]);
    const blended = rings[clear].map((point, index) => {
      const toward = rings[end][index];
      return {
        x: point.x + (toward.x - point.x) * t,
        y: point.y + (toward.y - point.y) * t,
        z: point.z + (toward.z - point.z) * t,
      };
    });
    const shift = sub(origin, average(blended));
    nextRings[station] = blended.map((point) => add(point, shift));
  }
  return { rings: nextRings, openings: nextOpenings };
}

/** Pulls the section before the end cap back behind that cap when the cap cuts an earlier wall. The centroid stays. The pull is kept only when the connector has fewer piercings and strips away from the cap do not get worse. */
function separateEndCap(rings: Vec3[][], openings: Vec3[][][]) {
  const count = rings.length;
  const samples = rings[0]?.length ?? 0;
  if (count < 3 || samples < 3) return { rings, openings };
  const mesh = loftSectionRings(rings);
  if (capClashCount(mesh, count - 1, samples) === 0) return { rings, openings };
  const before = piercingBands(mesh, count, samples);
  const trial = pullSectionOffCap(rings, openings);
  if (!trial) return { rings, openings };
  const after = piercingBands(loftSectionRings(trial.rings), count, samples);
  if (bandTotal(after) >= bandTotal(before)) return { rings, openings };
  if (!endBandsAccept(before, after, count - 1)) return { rings, openings };
  return trial;
}

function pullSectionOffCap(rings: Vec3[][], openings: Vec3[][][]) {
  const last = rings.length - 1;
  const station = last - 1;
  const end = average(rings[last]);
  let normal = sectionAxis(rings[last]);
  if (dot(sub(average(rings[station]), end), normal) > 0) normal = scale(normal, -1);
  const gap = Math.abs(dot(sub(average(rings[station]), end), normal));
  const clearance = Math.max(0.04, gap * 0.08);
  const pulled = seatBehindCap(rings[station], end, normal, clearance);
  if (!pulled) return null;
  const nextRings = rings.map((ring) => ring.map((point) => ({ ...point })));
  nextRings[station] = pulled;
  const nextOpenings = openings.map((loops) => loops.map((loop) => loop.map((point) => ({ ...point }))));
  nextOpenings[station] = (openings[station] ?? []).map((loop) => seatBehindCap(loop, end, normal, clearance) ?? loop);
  return { rings: nextRings, openings: nextOpenings };
}

function seatBehindCap(ring: Vec3[], end: Vec3, normal: Vec3, clearance: number) {
  const origin = average(ring);
  if (!ring.some((point) => dot(sub(point, end), normal) > -clearance)) return null;
  let current = ring.map((point) => ({ ...point }));
  for (let pass = 0; pass < 6; pass += 1) {
    current = current.map((point) => {
      const depth = dot(sub(point, end), normal);
      if (depth <= -clearance) return point;
      return add(point, scale(normal, -clearance - depth));
    });
    const shift = sub(origin, average(current));
    const along = dot(shift, normal);
    const spare = current.map((point) => Math.max(0, -clearance - dot(sub(point, end), normal)));
    const room = spare.reduce((sum, value) => sum + value, 0);
    const lateral = sub(shift, scale(normal, along));
    current = current.map((point, index) => {
      const wanted = room > 1e-6 ? along * (spare[index] / room) * current.length : 0;
      const share = along > 0 ? Math.min(wanted, spare[index]) : wanted;
      return add(add(point, lateral), scale(normal, share));
    });
  }
  const drift = length(sub(origin, average(current)));
  if (drift > 0.02) return null;
  return current;
}

function capClashCount(mesh: IsoMesh, last: number, count: number) {
  const cap: { ids: number[]; points: Vec3[] }[] = [];
  const other: { ids: number[]; points: Vec3[] }[] = [];
  const start = last * count;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ids = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    const points = ids.map((id) => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] }));
    const onCap = ids.every((id) => id >= start && id < start + count);
    if (onCap) cap.push({ ids, points });
    else other.push({ ids, points });
  }
  let clashes = 0;
  for (const face of cap) {
    for (const wall of other) {
      if (face.ids.some((id) => wall.ids.includes(id))) continue;
      if (segmentHits(face.points, wall.points) || segmentHits(wall.points, face.points)) clashes += 1;
    }
  }
  return clashes;
}

/** Pulls only the wall vertices that cut the open-end cap, along the cap normal. The cap ring and its opening stay put. Kept only when the connector has fewer piercings and every non-cap band stays at least as clean. */
function easeOpenCap(rings: Vec3[][], openings: Vec3[][][]) {
  const count = rings.length;
  const samples = rings[0]?.length ?? 0;
  if (count < 3 || samples < 3) return { rings, openings, beforeCount: 0 };
  const mesh = loftSectionRings(rings);
  if (capClashCount(mesh, 0, samples) === 0) return { rings, openings, beforeCount: 0 };
  const before = piercingBands(mesh, count, samples);
  const support = capSupportSamples(mesh, samples);
  if (support.size === 0) return { rings, openings, beforeCount: 0 };
  const end = average(rings[0]);
  let normal = sectionAxis(rings[0]);
  if (dot(sub(average(rings[1]), end), normal) < 0) normal = scale(normal, -1);
  const gap = Math.abs(dot(sub(average(rings[1]), end), normal));
  const clearances = [0.05, 0.1, 0.18, 0.32].map((fraction) => Math.max(0.04, gap * fraction));
  const beforeTotal = bandTotal(before);
  for (const clearance of clearances) {
    const trial = seatCapSupport(rings, openings, support, end, normal, clearance);
    if (!trial) continue;
    const after = piercingBands(loftSectionRings(trial.rings), count, samples);
    if (bandTotal(after) >= beforeTotal || !endBandsAccept(before, after, 0)) continue;
    return { rings: trial.rings, openings: trial.openings, beforeCount: beforeTotal };
  }
  return { rings, openings, beforeCount: 0 };
}

function capSupportSamples(mesh: IsoMesh, count: number) {
  const cap: { ids: number[]; points: Vec3[] }[] = [];
  const other: { ids: number[]; points: Vec3[] }[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ids = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    const points = ids.map((id) => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] }));
    if (ids.every((id) => id < count)) cap.push({ ids, points });
    else other.push({ ids, points });
  }
  const support = new Map<number, Set<number>>();
  for (const face of cap) {
    for (const wall of other) {
      if (face.ids.some((id) => wall.ids.includes(id))) continue;
      if (!segmentHits(face.points, wall.points) && !segmentHits(wall.points, face.points)) continue;
      wall.ids.forEach((id) => {
        const station = Math.floor(id / count);
        if (station < 1 || station > 3) return;
        const samples = support.get(station) ?? new Set<number>();
        samples.add(id % count);
        support.set(station, samples);
      });
    }
  }
  return support;
}

function seatCapSupport(
  rings: Vec3[][],
  openings: Vec3[][][],
  support: Map<number, Set<number>>,
  end: Vec3,
  normal: Vec3,
  clearance: number,
) {
  const nextRings = rings.map((ring) => ring.map((point) => ({ ...point })));
  const nextOpenings = openings.map((loops) => loops.map((loop) => loop.map((point) => ({ ...point }))));
  let moved = false;
  for (const [station, samples] of support) {
    const ring = rings[station];
    const origin = average(ring);
    const locked = new Set<number>();
    const seated = ring.map((point, index) => {
      if (!samples.has(index)) return { ...point };
      const depth = dot(sub(point, end), normal);
      if (depth >= clearance) return { ...point };
      locked.add(index);
      moved = true;
      return add(point, scale(normal, clearance - depth));
    });
    if (locked.size === 0) continue;
    if (locked.size > ring.length * 0.5) return null;
    if (!restoreOffCap(seated, origin, end, normal, clearance, locked)) return null;
    nextRings[station] = seated;
    nextOpenings[station] = (openings[station] ?? []).map((loop) => {
      if (loop.length !== ring.length) return loop.map((point) => ({ ...point }));
      const center = average(loop);
      const eased = loop.map((point, index) => locked.has(index) ? add(point, sub(seated[index], ring[index])) : { ...point });
      const correction = sub(center, average(eased));
      return eased.map((point) => add(point, correction));
    });
  }
  if (!moved) return null;
  return { rings: nextRings, openings: nextOpenings };
}

function restoreOffCap(ring: Vec3[], origin: Vec3, end: Vec3, normal: Vec3, clearance: number, locked: Set<number>) {
  const shift = sub(origin, average(ring));
  const donors: number[] = [];
  ring.forEach((_, index) => {
    if (!locked.has(index)) donors.push(index);
  });
  if (donors.length === 0) return length(shift) <= 0.05;
  const share = scale(shift, ring.length / donors.length);
  const along = dot(share, normal);
  donors.forEach((index) => {
    let delta = share;
    if (along < 0) {
      const room = Math.max(0, dot(sub(ring[index], end), normal) - clearance);
      const take = Math.min(-along, room);
      delta = add(sub(share, scale(normal, along)), scale(normal, -take));
    }
    ring[index] = add(ring[index], delta);
  });
  return length(sub(origin, average(ring))) <= 0.08;
}

/** Flattens a short self-crossing kink on one section of that strip. The centroid stays. The ease is kept only when piercings fall and every other strip stays at least as clean. */
function easeStripFold(rings: Vec3[][], openings: Vec3[][][], onlyStation = -1) {
  const count = rings.length;
  const samples = rings[0]?.length ?? 0;
  if (count < 2 || samples < 6) return { rings, openings };
  const mesh = loftSectionRings(rings);
  const hot = rings.slice(0, -1).map((_, station) => stripCrossings(mesh, station, samples) > 0);
  if (!hot.some(Boolean)) return { rings, openings };
  const before = piercingBands(mesh, count, samples);
  const beforeTotal = bandTotal(before);
  for (let station = 0; station < hot.length; station += 1) {
    if (onlyStation >= 0 && station !== onlyStation) continue;
    if (!hot[station]) continue;
    const cluster = foldCluster(rings, mesh, station, samples);
    if (!cluster) continue;
    const key = `${station}-${station + 1} x ${station}-${station + 1}`;
    let best: { rings: Vec3[][]; openings: Vec3[][][] } | null = null;
    let bestTotal = beforeTotal;
    for (const blend of [0.25, 0.32, 0.4]) {
      const trial = flattenFold(rings, openings, cluster.station, cluster.samples, blend);
      const after = piercingBands(loftSectionRings(trial.rings), count, samples);
      const total = bandTotal(after);
      if (total >= bestTotal || !foldBandsAccept(before, after, key)) continue;
      best = trial;
      bestTotal = total;
      if (bestTotal === 0) break;
    }
    if (best) return best;
  }
  return { rings, openings };
}

function foldCluster(rings: Vec3[][], mesh: IsoMesh, station: number, count: number) {
  const start = station * count * 6;
  const end = start + count * 6;
  const tris: { ids: number[]; points: Vec3[] }[] = [];
  for (let index = start; index < end; index += 3) {
    const ids = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    tris.push({ ids, points: ids.map((id) => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] })) });
  }
  const involved = new Set<number>();
  for (let left = 0; left < tris.length; left += 1) {
    for (let right = left + 1; right < tris.length; right += 1) {
      if (tris[left].ids.some((id) => tris[right].ids.includes(id))) continue;
      if (!segmentHits(tris[left].points, tris[right].points) && !segmentHits(tris[right].points, tris[left].points)) continue;
      tris[left].ids.forEach((id) => involved.add(id));
      tris[right].ids.forEach((id) => involved.add(id));
    }
  }
  const perStation = [new Set<number>(), new Set<number>()];
  involved.forEach((id) => {
    const ring = Math.floor(id / count);
    if (ring === station) perStation[0].add(id % count);
    else if (ring === station + 1) perStation[1].add(id % count);
  });
  if ([...perStation[0]].length === 0 || circularSpan([...perStation[0]], count) > 5 || circularSpan([...perStation[1]], count) > 5) return null;
  const scored = [station, station + 1].map((index, side) => {
    const offsets = [...perStation[side]].map((sample) => ({ sample, offset: chordOffset(rings[index], sample) }));
    return { index, offsets, peak: Math.max(0, ...offsets.map((item) => item.offset)) };
  });
  const chosen = scored[0].peak >= scored[1].peak ? scored[0] : scored[1];
  if (chosen.peak < 0.04) return null;
  const samples = chosen.offsets.filter((item) => item.offset >= chosen.peak * 0.5).map((item) => item.sample);
  if (samples.length === 0 || samples.length > 3) return null;
  return { station: chosen.index, samples };
}

function circularSpan(samples: number[], count: number) {
  const unique = [...new Set(samples)].sort((left, right) => left - right);
  if (unique.length === 0) return count;
  let gap = unique[0] + count - unique[unique.length - 1];
  for (let index = 1; index < unique.length; index += 1) gap = Math.max(gap, unique[index] - unique[index - 1]);
  return count - gap;
}

function chordOffset(ring: Vec3[], sample: number) {
  const previous = ring[(sample + ring.length - 1) % ring.length];
  const next = ring[(sample + 1) % ring.length];
  const chord = scale(add(previous, next), 0.5);
  return length(sub(ring[sample], chord));
}

function flattenFold(rings: Vec3[][], openings: Vec3[][][], station: number, samples: number[], blend: number) {
  const ring = rings[station];
  const origin = average(ring);
  const nextRing = ring.map((point) => ({ ...point }));
  samples.forEach((sample) => {
    const previous = ring[(sample + ring.length - 1) % ring.length];
    const next = ring[(sample + 1) % ring.length];
    const chord = scale(add(previous, next), 0.5);
    const point = ring[sample];
    nextRing[sample] = {
      x: point.x + (chord.x - point.x) * blend,
      y: point.y + (chord.y - point.y) * blend,
      z: point.z + (chord.z - point.z) * blend,
    };
  });
  const shift = sub(origin, average(nextRing));
  const seated = nextRing.map((point) => add(point, shift));
  const nextRings = rings.map((item) => item.map((point) => ({ ...point })));
  nextRings[station] = seated;
  const nextOpenings = openings.map((loops) => loops.map((loop) => loop.map((point) => ({ ...point }))));
  nextOpenings[station] = (openings[station] ?? []).map((loop) => {
    if (loop.length !== ring.length) return loop.map((point) => ({ ...point }));
    const center = average(loop);
    const eased = loop.map((point, index) => samples.includes(index) ? add(point, sub(seated[index], ring[index])) : { ...point });
    const correction = sub(center, average(eased));
    return eased.map((point) => add(point, correction));
  });
  return { rings: nextRings, openings: nextOpenings };
}

function foldBandsAccept(before: Map<string, number>, after: Map<string, number>, key: string) {
  for (const [band, value] of after) {
    if (band === key) continue;
    if (value > (before.get(band) ?? 0)) return false;
  }
  return true;
}

function endBandsAccept(before: Map<string, number>, after: Map<string, number>, last: number) {
  const cap = String(last);
  for (const [key, value] of after) {
    if (key.split(" x ").includes(cap)) continue;
    if (value > (before.get(key) ?? 0)) return false;
  }
  return true;
}

/** Spreads a piercing turn above a right angle, then keeps that version only when the whole connector has fewer piercings and no other strip gets worse. */
function chooseTurnRepair(rings: Vec3[][], openings: Vec3[][][]) {
  const count = rings.length;
  if (count < 3) return { rings, openings, repair: null as string | null };
  const turns = rings.slice(0, -1).map((ring, index) => sectionTurn(ring, rings[index + 1]));
  if (!turns.some((turn) => Math.abs(turn) > 90)) return { rings, openings, repair: null as string | null };
  const samples = rings[0]?.length ?? 0;
  const originalMesh = loftSectionRings(rings);
  const hot = turns.map((turn, index) => Math.abs(turn) > 90 && stripCrossings(originalMesh, index, samples) > 0);
  if (!hot.some(Boolean)) return { rings, openings, repair: null as string | null };
  const repaired = spreadHotTurns(rings, openings, turns, hot);
  if (!repaired) return { rings, openings, repair: null as string | null };
  const before = piercingBands(originalMesh, count, samples);
  const spreadMesh = loftSectionRings(repaired.rings);
  if (turnBandsAccept(before, piercingBands(spreadMesh, count, samples), hot)) return { rings: repaired.rings, openings: repaired.openings, repair: "rotation-spread" };
  const restrained = restrainSpillover(rings, openings, repaired.spins, before, count, samples);
  if (!restrained) return { rings, openings, repair: null as string | null };
  if (!turnBandsAccept(before, piercingBands(loftSectionRings(restrained.rings), count, samples), hot)) return { rings, openings, repair: null as string | null };
  return { rings: restrained.rings, openings: restrained.openings, repair: "spillover-safe" };
}

function turnBandsAccept(before: Map<string, number>, after: Map<string, number>, hot: boolean[]) {
  if (bandTotal(after) >= bandTotal(before)) return false;
  for (const [key, value] of after) {
    const self = hot.some((flag, index) => flag && key === `${index}-${index + 1} x ${index}-${index + 1}`);
    if (!self && value > (before.get(key) ?? 0)) return false;
  }
  return true;
}

function spreadHotTurns(rings: Vec3[][], openings: Vec3[][][], turns: number[], hot: boolean[]) {
  const count = rings.length;
  const spins: { station: number; delta: number }[] = [];
  hot.forEach((flag, index) => {
    if (!flag) return;
    let end = index + 1;
    while (end < count - 1 && end < index + 3 && Math.abs(turns[end] ?? 0) < 35) end += 1;
    if (end - index < 2) return;
    const total = turns.slice(index, end).reduce((sum, value) => sum + value, 0);
    for (let station = index + 1; station < end; station += 1) {
      const current = turns.slice(index, station).reduce((sum, value) => sum + value, 0);
      const delta = (total * (station - index)) / (end - index) - current;
      if (Math.abs(delta) >= 1) spins.push({ station, delta });
    }
  });
  if (spins.length === 0) return null;
  return { ...applyTurnSpins(rings, openings, spins), spins };
}

/** Pulls only the last spread section back toward the fixed neighbor until that downstream strip is no worse than before. */
function restrainSpillover(
  rings: Vec3[][],
  openings: Vec3[][][],
  spins: { station: number; delta: number }[],
  before: Map<string, number>,
  ringCount: number,
  samples: number,
) {
  const last = spins[spins.length - 1];
  if (!last || last.station >= ringCount - 1) return null;
  const tag = `${last.station}-${last.station + 1}`;
  const limit = downstreamCount(before, tag);
  let best = 0;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 6; step += 1) {
    const mid = (low + high) / 2;
    const trial = applyTurnSpins(rings, openings, spins.map((spin) => spin.station === last.station ? { ...spin, delta: spin.delta * mid } : spin));
    const load = downstreamCount(piercingBands(loftSectionRings(trial.rings), ringCount, samples), tag);
    if (load <= limit) {
      best = mid;
      low = mid;
    } else high = mid;
  }
  if (best <= 0.02) return null;
  return applyTurnSpins(rings, openings, spins.map((spin) => spin.station === last.station ? { ...spin, delta: spin.delta * best } : spin));
}

function downstreamCount(bands: Map<string, number>, tag: string) {
  let total = 0;
  bands.forEach((value, key) => {
    if (key.includes(tag)) total += value;
  });
  return total;
}

function applyTurnSpins(rings: Vec3[][], openings: Vec3[][][], spins: { station: number; delta: number }[]) {
  const nextRings = rings.map((ring) => ring.map((point) => ({ ...point })));
  const nextOpenings = openings.map((station) => station.map((loop) => loop.map((point) => ({ ...point }))));
  spins.forEach((spin) => {
    const origin = average(rings[spin.station]);
    const axis = sectionAxis(rings[spin.station]);
    nextRings[spin.station] = spinAbout(rings[spin.station], origin, axis, spin.delta);
    nextOpenings[spin.station] = (openings[spin.station] ?? []).map((loop) => spinAbout(loop, origin, axis, spin.delta));
  });
  return { rings: nextRings, openings: nextOpenings };
}

function sectionTurn(previous: Vec3[], next: Vec3[]) {
  const normal = sectionAxis(next);
  const carried = planeDirection(previous[0], average(previous), normal);
  const current = planeDirection(next[0], average(next), normal);
  if (!carried || !current) return 0;
  const cosine = Math.max(-1, Math.min(1, dot(carried, current)));
  const sign = Math.sign(dot(normal, cross(carried, current))) || 1;
  return Math.acos(cosine) * 180 / Math.PI * sign;
}

function planeDirection(point: Vec3, origin: Vec3, normal: Vec3) {
  const offset = sub(point, origin);
  const projected = sub(offset, scale(normal, dot(offset, normal)));
  const magnitude = length(projected);
  return magnitude < 1e-6 ? null : scale(projected, 1 / magnitude);
}

function spinAbout(points: Vec3[], origin: Vec3, axis: Vec3, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return points.map((point) => {
    const offset = sub(point, origin);
    const along = scale(axis, dot(offset, axis));
    const perp = sub(offset, along);
    return add(origin, add(along, add(scale(perp, cosine), scale(cross(axis, perp), sine))));
  });
}

function stripCrossings(mesh: IsoMesh, station: number, count: number) {
  const start = station * count * 6;
  const end = start + count * 6;
  if (count < 3 || end > mesh.indices.length) return 0;
  const tris: { ids: number[]; points: Vec3[] }[] = [];
  for (let index = start; index < end; index += 3) {
    const ids = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    tris.push({ ids, points: ids.map((id) => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] })) });
  }
  let crossings = 0;
  for (let left = 0; left < tris.length; left += 1) {
    for (let right = left + 1; right < tris.length; right += 1) {
      if (tris[left].ids.some((id) => tris[right].ids.includes(id))) continue;
      if (segmentHits(tris[left].points, tris[right].points) || segmentHits(tris[right].points, tris[left].points)) crossings += 1;
    }
  }
  return crossings;
}

function piercingBands(mesh: IsoMesh, ringCount: number, count: number) {
  const bands = new Map<string, number>();
  const tris: { ids: number[]; points: Vec3[]; station: string }[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ids = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    tris.push({
      ids,
      station: [...new Set(ids.map((id) => Math.min(ringCount - 1, Math.floor(id / count))))].sort((left, right) => left - right).join("-"),
      points: ids.map((id) => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] })),
    });
  }
  for (let left = 0; left < tris.length; left += 1) {
    for (let right = left + 1; right < tris.length; right += 1) {
      if (tris[left].ids.some((id) => tris[right].ids.includes(id))) continue;
      if (!segmentHits(tris[left].points, tris[right].points) && !segmentHits(tris[right].points, tris[left].points)) continue;
      const key = [tris[left].station, tris[right].station].sort().join(" x ");
      bands.set(key, (bands.get(key) ?? 0) + 1);
    }
  }
  return bands;
}

function bandTotal(bands: Map<string, number>) {
  let total = 0;
  bands.forEach((value) => { total += value; });
  return total;
}

/** Read the real cut chain. A degenerate face sliver cannot outvote a larger section behind it. */
function evolveStation(
  projectedA: Planar[][],
  projectedB: Planar[][],
  openingsA: Planar[][][],
  openingsB: Planar[][][],
  cutsA: SectionCut[],
  cutsB: SectionCut[],
  t: number,
  share: number,
  remix: number,
  reach: number,
) {
  const sideA = chainReading(projectedA, openingsA, cutsA, remix, reach);
  const sideB = chainReading(projectedB, openingsB, cutsB, remix, reach);
  const depth = t * t * (3 - 2 * t);
  const fromA = mixPlanarLoop(sideA.terminal, sideA.body(depth), depth);
  const fromB = mixPlanarLoop(sideB.terminal, sideB.body(1 - depth), 1 - depth);
  const openings = [
    ...fromA.openings.map((loop) => scalePlanarLoop(loop, share)),
    ...fromB.openings.map((loop) => scalePlanarLoop(loop, 1 - share)),
  ].filter((loop) => planarArea(loop) > 0.8);
  return { outer: mixPlanarPoints(fromB.outer, fromA.outer, share), openings };
}

function chainReading(projected: Planar[][], openings: Planar[][][], cuts: SectionCut[], remix: number, reach: number) {
  const scores = projected.map((outer, index) => sectionSignificance(outer, openings[index] ?? [], cuts[index]?.copied === true));
  const maxScore = Math.max(...scores, 1e-6);
  const meaningful = scores.map((score, index) => score >= maxScore * 0.22 ? index : -1).filter((index) => index >= 0);
  const indices = meaningful.length > 0 ? meaningful : [0];
  const terminal = continueMeaningful(projected, indices, reach);
  const body = (depth: number) => sampleChain(projected, indices, Math.min(1, depth * (0.45 + remix * 0.55)));
  const source = indices[0];
  return {
    terminal: { outer: terminal, openings: resampleLoops(openings[source] ?? []) },
    body,
  };
}

function sectionSignificance(outer: Planar[], openings: Planar[][], copied: boolean) {
  const area = planarArea(outer);
  const edge = planarPerimeter(outer);
  const size = Math.sqrt(area) * 0.7 + edge * 0.3;
  return size * (1 + 0.25 * openings.length) * (copied ? 0.2 : 1);
}

function continueMeaningful(projected: Planar[][], indices: number[], reach: number) {
  const faceMost = projected[indices[0]];
  if (indices.length < 2) return faceMost.map((point) => ({ u: point.u, v: point.v }));
  const deeper = projected[indices[1]];
  const step = Math.min(0.28, 0.08 + reach * 0.08);
  const moved = faceMost.map((point, index) => ({
    u: point.u + (point.u - deeper[index].u) * step,
    v: point.v + (point.v - deeper[index].v) * step,
  }));
  const base = planarArea(faceMost);
  const next = planarArea(moved);
  if (base > 1e-4 && next > 1e-4 && (next > base * 1.65 || next < base * 0.55)) {
    return scaleAboutCenter(moved, Math.sqrt(Math.min(base * 1.65, Math.max(base * 0.55, next)) / next));
  }
  return moved;
}

function sampleChain(projected: Planar[][], indices: number[], alpha: number) {
  if (indices.length === 1) return projected[indices[0]].map((point) => ({ u: point.u, v: point.v }));
  const scaled = Math.max(0, Math.min(0.999, alpha)) * (indices.length - 1);
  const index = Math.floor(scaled);
  return mixPlanarPoints(projected[indices[index]], projected[indices[Math.min(indices.length - 1, index + 1)]], scaled - index);
}

function mixPlanarLoop(end: { outer: Planar[]; openings: Planar[][] }, body: Planar[], depth: number) {
  return {
    outer: mixPlanarPoints(end.outer, body, depth),
    openings: end.openings.map((loop) => scalePlanarLoop(loop, 1 - depth)),
  };
}

function mixPlanarPoints(from: Planar[], to: Planar[], amount: number) {
  return from.map((point, index) => ({
    u: point.u + (to[index].u - point.u) * amount,
    v: point.v + (to[index].v - point.v) * amount,
  }));
}

function scalePlanarLoop(loop: Planar[], gain: number) {
  return scaleAboutCenter(loop, Math.max(0, gain));
}

function planarArea(points: Planar[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    sum += points[index].u * next.v - next.u * points[index].v;
  }
  return Math.abs(sum) * 0.5;
}

function planarPerimeter(points: Planar[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    sum += Math.hypot(next.u - points[index].u, next.v - points[index].v);
  }
  return sum;
}

function projectOpenings(cuts: SectionCut[], frame: ReturnType<typeof loopFrame>, shift: number) {
  return cuts.map((cut) => cut.openings.map((opening) => {
    const samples = shift === 0 ? opening.samples : shiftSamples(opening.samples, shift);
    return samples.map((sample) => {
      const delta = sub(sample.position, frame.origin);
      return { u: dot(delta, frame.u), v: dot(delta, frame.v) };
    });
  }));
}

function resampleLoops(loops: Planar[][]) {
  return loops.filter((loop) => loop.length >= 3).map((loop) => resamplePlanar(loop, SECTIONAL_GENERATOR_SETTINGS.samples));
}

function resamplePlanar(loop: Planar[], count: number) {
  const lengths = [0];
  for (let index = 0; index < loop.length; index += 1) {
    const next = loop[(index + 1) % loop.length];
    lengths.push(lengths[index] + Math.hypot(next.u - loop[index].u, next.v - loop[index].v));
  }
  const total = lengths[lengths.length - 1] || 1;
  return Array.from({ length: count }, (_, sample) => {
    const distance = (sample / count) * total;
    let index = 1;
    while (index < lengths.length - 1 && lengths[index] < distance) index += 1;
    const span = lengths[index] - lengths[index - 1] || 1;
    const amount = (distance - lengths[index - 1]) / span;
    const from = loop[index - 1];
    const to = loop[index % loop.length];
    return { u: from.u + (to.u - from.u) * amount, v: from.v + (to.v - from.v) * amount };
  });
}

function flattenToFrame(ring: Vec3[], frame: PlacedFrame) {
  const centroid = average(ring);
  return ring.map((point) => add(centroid, reject(sub(point, centroid), frame.normal)));
}

type PlacedFrame = { origin: Vec3; normal: Vec3; u: Vec3; v: Vec3 };

/** Cubic Hermite spine through the parent centroid tangents, with one frame per station. */
function stationFrames(chainA: Sample[][], chainB: Sample[][], stations: number[]): PlacedFrame[] {
  const centroidsA = [...chainA].reverse().map((samples) => average(samples.map((sample) => sample.position)));
  const centroidsB = chainB.map((samples) => average(samples.map((sample) => sample.position)));
  const start = centroidsA[centroidsA.length - 1];
  const end = centroidsB[0];
  const chord = sub(end, start);
  const chordLength = Math.max(length(chord), 1e-4);
  const chordDir = normalize(chord);
  const exit = trajectoryTrend(centroidsA.slice(-3), sub(centroidsA[centroidsA.length - 1], centroidsA[Math.max(0, centroidsA.length - 3)]));
  const entry = trajectoryTrend(centroidsB.slice(0, 3), sub(centroidsB[Math.min(2, centroidsB.length - 1)], centroidsB[0]));
  const solved = solveSpineTangents(exit, entry, chordDir, meanSpacing(centroidsA), meanSpacing(centroidsB), chordLength, stations);
  const depart = solved.depart;
  const arrive = solved.arrive;
  const tangents = stations.map((t) => unitTangent(hermiteDerivative(start, end, depart, arrive, t), chord));
  const origins = stations.map((t) => hermitePoint(start, end, depart, arrive, t));
  const referenceA = loopFrame(chainA[0]).u;
  const referenceB = loopFrame(chainB[0]).u;
  let carried = axisOnPlane(referenceA, tangents[0], null);
  const transported = [carried];
  for (let index = 1; index < stations.length; index += 1) {
    const turned = axisOnPlane(rotateFromTo(tangents[index - 1], tangents[index], carried), tangents[index], carried);
    carried = turned;
    transported.push(turned);
  }
  const last = stations.length - 1;
  const desired = axisOnPlane(referenceB, tangents[last], transported[last]);
  const rawTwist = Math.atan2(dot(cross(transported[last], desired), tangents[last]), dot(transported[last], desired));
  const turnLimit = 30 * Math.PI / 180;
  const maxTwist = turnLimit / (1.5 / Math.max(1, stations.length - 1));
  const twist = Math.max(-maxTwist, Math.min(maxTwist, rawTwist));
  const frames = stations.map((t, index) => {
    const normal = tangents[index];
    const smooth = t * t * (3 - 2 * t);
    const u = axisOnPlane(rotateAround(transported[index], normal, smooth * twist), normal, transported[index]);
    return { origin: origins[index], normal, u, v: cross(normal, u) };
  });
  return frames;
}

/** Least-squares direction of the last few centroids, and how much the recent steps agree. */
function trajectoryTrend(points: Vec3[], fallback: Vec3) {
  const usable = points.filter((_, index, list) => index === 0 || length(sub(list[index], list[index - 1])) > 1e-5);
  const direction = principalDirection(usable.length >= 2 ? usable : points, fallback);
  if (usable.length < 3) return { direction, confidence: usable.length >= 2 ? 1 : 0 };
  const first = normalize(sub(usable[usable.length - 2], usable[usable.length - 3]));
  const second = normalize(sub(usable[usable.length - 1], usable[usable.length - 2]));
  return { direction, confidence: Math.max(0, dot(first, second)) };
}

function principalDirection(points: Vec3[], fallback: Vec3) {
  const mean = average(points);
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  points.forEach((point) => {
    const delta = sub(point, mean);
    xx += delta.x * delta.x;
    yy += delta.y * delta.y;
    zz += delta.z * delta.z;
    xy += delta.x * delta.y;
    xz += delta.x * delta.z;
    yz += delta.y * delta.z;
  });
  let vector = length(fallback) > 1e-5 ? normalize(fallback) : { x: 1, y: 0, z: 0 };
  for (let pass = 0; pass < 8; pass += 1) {
    const next = {
      x: xx * vector.x + xy * vector.y + xz * vector.z,
      y: xy * vector.x + yy * vector.y + yz * vector.z,
      z: xz * vector.x + yz * vector.y + zz * vector.z,
    };
    vector = length(next) > 1e-8 ? normalize(next) : vector;
  }
  if (dot(vector, fallback) < 0) vector = scale(vector, -1);
  return vector;
}

/** Parent trend blended toward the chord. The largest blend that keeps the curve progressive wins. */
function solveSpineTangents(
  exit: { direction: Vec3; confidence: number },
  entry: { direction: Vec3; confidence: number },
  chordDir: Vec3,
  spacingA: number,
  spacingB: number,
  chordLength: number,
  stations: number[],
) {
  const reachA = Math.min(spacingA, chordLength * 0.55);
  const reachB = Math.min(spacingB, chordLength * 0.55);
  let chosen = spineCandidate(exit, entry, chordDir, reachA, reachB, chordLength, stations, 0, 0);
  for (let keepIndex = 8; keepIndex >= 0; keepIndex -= 1) {
    for (let gainIndex = 8; gainIndex >= 0; gainIndex -= 1) {
      const candidate = spineCandidate(exit, entry, chordDir, reachA, reachB, chordLength, stations, keepIndex / 8, gainIndex / 8);
      if (!candidate.stable) continue;
      if (!chosen.stable || candidate.deviation > chosen.deviation) chosen = candidate;
    }
  }
  return chosen;
}

function spineCandidate(
  exit: { direction: Vec3; confidence: number },
  entry: { direction: Vec3; confidence: number },
  chordDir: Vec3,
  reachA: number,
  reachB: number,
  chordLength: number,
  stations: number[],
  keep: number,
  gain: number,
) {
  const keepA = keep * (0.25 + 0.75 * exit.confidence);
  const keepB = keep * (0.25 + 0.75 * entry.confidence);
  const depart = scale(forwardBlend(exit.direction, chordDir, keepA), Math.max(reachA * gain, chordLength * 0.05));
  const arrive = scale(forwardBlend(entry.direction, chordDir, keepB), Math.max(reachB * gain, chordLength * 0.05));
  const start = { x: 0, y: 0, z: 0 };
  const end = scale(chordDir, chordLength);
  const origins = stations.map((t) => hermitePoint(start, end, depart, arrive, t));
  const tangents = stations.map((t) => unitTangent(hermiteDerivative(start, end, depart, arrive, t), end));
  let maxTurn = 0;
  let minForward = Infinity;
  for (let index = 1; index < stations.length; index += 1) {
    maxTurn = Math.max(maxTurn, angleBetween(tangents[index - 1], tangents[index]));
    minForward = Math.min(minForward, dot(sub(origins[index], origins[index - 1]), end));
  }
  let deviation = 0;
  origins.forEach((point) => {
    const along = dot(point, end) / (chordLength * chordLength);
    deviation = Math.max(deviation, length(sub(point, scale(end, along))));
  });
  return { depart, arrive, stable: maxTurn <= 30 * Math.PI / 180 && minForward > 0, deviation };
}

function forwardBlend(raw: Vec3, chordDir: Vec3, keep: number) {
  const unit = length(raw) > 1e-5 ? normalize(raw) : chordDir;
  const along = Math.max(0, dot(unit, chordDir));
  const lateral = reject(unit, chordDir);
  const mixed = add(scale(chordDir, (1 - keep) + keep * along), scale(lateral, keep));
  return length(mixed) > 1e-5 ? normalize(mixed) : chordDir;
}

function angleBetween(a: Vec3, b: Vec3) {
  return Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b)))));
}

function meanSpacing(points: Vec3[]) {
  if (points.length < 2) return 1;
  let sum = 0;
  for (let index = 1; index < points.length; index += 1) sum += length(sub(points[index], points[index - 1]));
  return sum / (points.length - 1);
}

function hermitePoint(p0: Vec3, p1: Vec3, m0: Vec3, m1: Vec3, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return add(
    add(scale(p0, 2 * t3 - 3 * t2 + 1), scale(m0, t3 - 2 * t2 + t)),
    add(scale(p1, -2 * t3 + 3 * t2), scale(m1, t3 - t2)),
  );
}

function hermiteDerivative(p0: Vec3, p1: Vec3, m0: Vec3, m1: Vec3, t: number) {
  const t2 = t * t;
  return add(
    add(scale(p0, 6 * t2 - 6 * t), scale(m0, 3 * t2 - 4 * t + 1)),
    add(scale(p1, -6 * t2 + 6 * t), scale(m1, 3 * t2 - 2 * t)),
  );
}

function unitTangent(derivative: Vec3, fallback: Vec3) {
  if (length(derivative) >= 1e-5) return normalize(derivative);
  return length(fallback) >= 1e-5 ? normalize(fallback) : { x: 1, y: 0, z: 0 };
}

function axisOnPlane(reference: Vec3, normal: Vec3, previous: Vec3 | null) {
  let axis = reject(reference, normal);
  if (length(axis) < 1e-5) axis = reject(previous ?? { x: 0, y: 1, z: 0 }, normal);
  if (length(axis) < 1e-5) axis = reject({ x: 1, y: 0, z: 0 }, normal);
  axis = normalize(axis);
  if (previous && dot(axis, previous) < 0) axis = scale(axis, -1);
  return axis;
}

function rotateFromTo(from: Vec3, to: Vec3, vector: Vec3) {
  const axis = cross(from, to);
  const axisLength = length(axis);
  if (axisLength < 1e-6) {
    if (dot(from, to) >= 0) return vector;
    return rotateAround(vector, unitPerp(from), Math.PI);
  }
  return rotateAround(vector, scale(axis, 1 / axisLength), Math.atan2(axisLength, dot(from, to)));
}

function rotateAround(vector: Vec3, axis: Vec3, angle: number) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(add(scale(vector, cosine), scale(cross(axis, vector), sine)), scale(axis, dot(axis, vector) * (1 - cosine)));
}

/** How much of this station still belongs to A. Balanced hands over at mid-span. */
function parentShare(t: number, aWeight: number) {
  const x = (t - aWeight) / 0.28;
  return 1 / (1 + Math.exp(7 * x));
}

/** Continue every parent cut past the face, then let the two outlines negotiate. */
function negotiateSection(
  projectedA: Planar[][],
  projectedB: Planar[][],
  carryA: number,
  carryB: number,
  share: number,
  remix: number,
) {
  const fromA = continuedSection(projectedA, carryA);
  const fromB = continuedSection(projectedB, carryB);
  const blended = fromA.map((point, index) => ({
    u: point.u * share + fromB[index].u * (1 - share),
    v: point.v * share + fromB[index].v * (1 - share),
  }));
  let disagree = 0;
  fromA.forEach((point, index) => {
    const other = fromB[index];
    const scale = Math.max(Math.hypot(point.u, point.v), Math.hypot(other.u, other.v), 0.25);
    disagree += Math.hypot(point.u - other.u, point.v - other.v) / scale;
  });
  const meeting = 4 * share * (1 - share);
  const pull = Math.min(0.46, (disagree / fromA.length) * meeting * (0.18 + remix * 0.4));
  return scaleAboutCenter(blended, 1 - pull);
}

/** Face is index 0. Deeper cuts still move the step that continues into the hybrid. */
function continuedSection(projected: Planar[][], distance: number) {
  const weights = [0.46, 0.28, 0.16, 0.1];
  return projected[0].map((point, sample) => {
    let stepU = 0;
    let stepV = 0;
    let weight = 0;
    const steps = Math.min(weights.length, projected.length - 1);
    for (let index = 0; index < steps; index += 1) {
      const outer = projected[index][sample];
      const inner = projected[index + 1][sample];
      stepU += (outer.u - inner.u) * weights[index];
      stepV += (outer.v - inner.v) * weights[index];
      weight += weights[index];
    }
    const next = {
      u: point.u + (stepU / (weight || 1)) * distance,
      v: point.v + (stepV / (weight || 1)) * distance,
    };
    const cap = Math.max(Math.hypot(point.u, point.v) * 1.45, 0.2);
    const radius = Math.hypot(next.u, next.v);
    if (radius <= cap || radius < 1e-5) return next;
    const gain = cap / radius;
    return { u: next.u * gain, v: next.v * gain };
  });
}

function radiusAboutCenter(points: Planar[]) {
  if (points.length === 0) return 0;
  const center = points.reduce((sum, point) => ({ u: sum.u + point.u, v: sum.v + point.v }), { u: 0, v: 0 });
  center.u /= points.length;
  center.v /= points.length;
  return points.reduce((sum, point) => sum + Math.hypot(point.u - center.u, point.v - center.v), 0) / points.length;
}

function loopReach(points: Vec3[] | null) {
  if (!points || points.length === 0) return 0;
  const center = average(points);
  return points.reduce((sum, point) => sum + length(sub(point, center)), 0) / points.length;
}

function scaleAboutCenter(points: Planar[], gain: number) {
  if (points.length === 0 || Math.abs(gain - 1) < 1e-4) return points;
  const center = points.reduce((sum, point) => ({ u: sum.u + point.u, v: sum.v + point.v }), { u: 0, v: 0 });
  center.u /= points.length;
  center.v /= points.length;
  return points.map((point) => ({
    u: center.u + (point.u - center.u) * gain,
    v: center.v + (point.v - center.v) * gain,
  }));
}

function holdPlateStations(designed: Vec3[][], flowed: Vec3[][]) {
  return flowed.map((ring, station) => {
    const shift = sub(average(designed[station]), average(ring));
    return ring.map((point) => add(point, shift));
  });
}

/** Rounds sharp corners in the ring plane and leaves broad lobes in place. */
export function softenClosedRing(ring: Vec3[], amount: number): Vec3[] {
  if (ring.length < 4 || amount <= 0) return ring;
  const origin = average(ring);
  let normal = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < ring.length; index += 1) {
    normal = add(normal, cross(sub(ring[index], origin), sub(ring[(index + 1) % ring.length], origin)));
  }
  normal = length(normal) < 1e-8 ? { x: 0, y: 1, z: 0 } : normalize(normal);
  let u = reject(sub(ring[0], origin), normal);
  if (length(u) < 1e-6) u = cross(normal, Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 });
  u = normalize(u);
  const v = cross(normal, u);
  const flat = ring.map((point) => {
    const delta = sub(point, origin);
    return { u: dot(delta, u), v: dot(delta, v) };
  });
  const shaped = softenPlanar(softenPlanar(flat, amount), amount * 0.85);
  return shaped.map((point) => add(origin, add(scale(u, point.u), scale(v, point.v))));
}

function softenPlanar(points: Planar[], amount: number): Planar[] {
  const count = points.length;
  if (count < 4 || amount <= 0) return points;
  return points.map((point, index) => {
    const previous = points[(index + count - 1) % count];
    const next = points[(index + 1) % count];
    const inU = point.u - previous.u;
    const inV = point.v - previous.v;
    const outU = next.u - point.u;
    const outV = next.v - point.v;
    const inLength = Math.hypot(inU, inV);
    const outLength = Math.hypot(outU, outV);
    if (inLength < 1e-6 || outLength < 1e-6) return point;
    const turn = 1 - (inU / inLength) * (outU / outLength) - (inV / inLength) * (outV / outLength);
    const sharp = Math.max(0, Math.min(1, turn / 0.45));
    const softU = previous.u * 0.25 + point.u * 0.5 + next.u * 0.25;
    const softV = previous.v * 0.25 + point.v * 0.5 + next.v * 0.25;
    const mix = amount * (0.35 + 0.65 * sharp);
    return { u: point.u * (1 - mix) + softU * mix, v: point.v * (1 - mix) + softV * mix };
  });
}

function flowRings(rings: Vec3[][]): Vec3[][] {
  const count = rings[0]?.length ?? 0;
  let current = rings.map((ring) => ring.map((point) => ({ x: point.x, y: point.y, z: point.z })));
  for (let pass = 0; pass < 1; pass += 1) {
    const next = current.map((ring) => ring.map((point) => ({ x: point.x, y: point.y, z: point.z })));
    for (let station = 1; station < current.length - 1; station += 1) {
      for (let index = 0; index < count; index += 1) {
        const previous = current[station - 1][index];
        const point = current[station][index];
        const after = current[station + 1][index];
        next[station][index] = {
          x: point.x * 0.62 + (previous.x + after.x) * 0.19,
          y: point.y * 0.62 + (previous.y + after.y) * 0.19,
          z: point.z * 0.62 + (previous.z + after.z) * 0.19,
        };
      }
    }
    current = next;
  }
  return current;
}

function recombinePoint(a: Planar, b: Planar, formA: FormModel, formB: FormModel, index: number, aWeight: number, remix: number): Planar {
  const aOff = formA.offset[index];
  const bOff = formB.offset[index];
  if (aWeight > 0.65) {
    const takeB = bOff < -0.08 && remix > 0.28 ? remix * (1.05 - aWeight) * 0.7 : 0;
    return mixPlanar(a, b, takeB);
  }
  if (aWeight < 0.35) {
    const takeA = aOff < -0.08 && remix > 0.28 ? remix * (0.35 + aWeight) * 0.7 : 0;
    return mixPlanar(b, a, takeA);
  }
  const primary = Math.abs(aOff) >= Math.abs(bOff) ? a : b;
  const secondary = primary === a ? b : a;
  return mixPlanar(primary, secondary, 0.18 + remix * 0.42);
}

function scaleTrait(point: Planar, formA: FormModel, formB: FormModel, aWeight: number, t: number): Planar {
  const scaleA = formA.meanRadius[0] > 1e-4 ? polyline(formA.meanRadius, 1 - t) / formA.meanRadius[0] : 1;
  const scaleB = formB.meanRadius[0] > 1e-4 ? polyline(formB.meanRadius, t) / formB.meanRadius[0] : 1;
  const gain = aWeight > 0.65 ? scaleA : aWeight < 0.35 ? scaleB : Math.max(scaleA, scaleB);
  const amount = 0.62 + 0.38 * Math.max(0.45, Math.min(1.8, gain));
  return { u: point.u * amount, v: point.v * amount };
}

function pinchVoids(point: Planar, formA: FormModel, formB: FormModel, aWeight: number, remix: number): Planar {
  const angle = Math.atan2(point.v, point.u);
  let pinch = 1;
  const voids = aWeight > 0.65 ? formA.voids : aWeight < 0.35 ? formB.voids : [...formA.voids, ...formB.voids];
  voids.forEach((mark) => {
    const distance = angleDistance(angle, mark.angle);
    const window = 0.95;
    if (distance < window) {
      const falloff = 0.5 * (1 + Math.cos((Math.PI * distance) / window));
      pinch *= 1 - mark.reach * falloff * (0.16 + remix * 0.2);
    }
  });
  return { u: point.u * pinch, v: point.v * pinch };
}

function formModel(projected: Planar[][], voids: { angle: number; reach: number }[]): FormModel {
  const count = projected[0]?.length ?? 0;
  const means = projected.map((section) => {
    let total = 0;
    section.forEach((point) => { total += Math.hypot(point.u, point.v); });
    return total / Math.max(1, section.length);
  });
  const family: Planar[] = [];
  const offset: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const points = projected.map((section) => section[index]);
    family.push({ u: median(points.map((point) => point.u)), v: median(points.map((point) => point.v)) });
    const offsets = points.map((point, section) => Math.hypot(point.u, point.v) - means[section]);
    const sign = Math.sign(median(offsets));
    const agreed = offsets.filter((value, section) => Math.sign(value) === sign && Math.abs(value) > Math.max(0.08, means[section] * 0.08)).length;
    offset.push(agreed >= 3 ? median(offsets) : 0);
  }
  const centroids = projected.map((section) => ({
    u: section.reduce((sum, point) => sum + point.u, 0) / Math.max(1, section.length),
    v: section.reduce((sum, point) => sum + point.v, 0) / Math.max(1, section.length),
  }));
  const drift = { u: centroids[0].u - centroids[centroids.length - 1].u, v: centroids[0].v - centroids[centroids.length - 1].v };
  const expansion = means[means.length - 1] > 1e-4 ? (means[0] - means[means.length - 1]) / means[means.length - 1] : 0;
  const twist = Math.atan2(projected[0][0].v, projected[0][0].u) - Math.atan2(projected[projected.length - 1][0].v, projected[projected.length - 1][0].u);
  const aspect = median(projected.map(sectionAspect));
  let lobes = 0;
  let recesses = 0;
  let run = 0;
  let recessRun = 0;
  const meanFamily = family.reduce((sum, point) => sum + Math.hypot(point.u, point.v), 0) / Math.max(1, count);
  for (let index = 0; index <= count; index += 1) {
    const value = offset[index % count];
    if (value > Math.max(0.12, meanFamily * 0.1)) run += 1;
    else { if (run >= 2) lobes += 1; run = 0; }
    if (value < -Math.max(0.12, meanFamily * 0.1)) recessRun += 1;
    else { if (recessRun >= 2) recesses += 1; recessRun = 0; }
  }
  const deltas = means.slice(1).map((value, index) => Math.abs(value - means[index]));
  const stepped = Math.max(...deltas, 0) > Math.max(0.15, median(deltas) * 2.2);
  const spread = Math.hypot(...offset) / Math.max(1, Math.sqrt(count));
  const thick = aspect < 1.4 && meanFamily > 1.2;
  const plate = aspect > 1.75 && spread < meanFamily * 0.22;
  const labels: string[] = [];
  if (lobes >= 2) labels.push("repeated protrusions");
  else if (lobes === 1) labels.push("single protrusion");
  if (recesses >= 1) labels.push("persistent recess");
  if (voids.length >= 2) labels.push("multiple openings");
  else if (voids.length === 1) labels.push("opening");
  if (stepped) labels.push("stepped rhythm");
  if (plate) labels.push("plate-like section");
  if (thick) labels.push("thick central mass");
  if (expansion > 0.12) labels.push("expands toward the face");
  else if (expansion < -0.12) labels.push("contracts toward the face");
  if (Math.hypot(drift.u, drift.v) > Math.max(0.35, meanFamily * 0.12)) labels.push("mass drift");
  if (Math.abs(twist) > 0.2) labels.push("sectional twist");
  if (aspect > 1.7 && !plate) labels.push("long sectional spread");
  return { family, projected, offset, meanRadius: means, drift, expansion, twist, plate, stepped, thick, lobes, recesses, voids, labels };
}

function inheritTraits(formA: FormModel, formB: FormModel, aWeight: number, remix: number) {
  const keepA = aWeight > 0.65 ? formA.labels : aWeight < 0.35 ? formA.labels.filter((label) => /recess|opening/.test(label)) : formA.labels.slice(0, 3);
  const keepB = aWeight < 0.35 ? formB.labels : aWeight > 0.65 ? formB.labels.filter((label) => /recess|opening/.test(label) && remix > 0.28) : formB.labels.slice(0, 3);
  const droppedA = formA.labels.filter((label) => !keepA.includes(label));
  const droppedB = formB.labels.filter((label) => !keepB.includes(label));
  const recombined = aWeight > 0.65
    ? (keepB.length ? `A form language, with B ${keepB[0]}` : "A form language carried through the body")
    : aWeight < 0.35
      ? (keepA.length ? `B form language, with A ${keepA[0]}` : "B form language carried through the body")
      : `A ${keepA[0] ?? "mass"} negotiated with B ${keepB[0] ?? "mass"}`;
  return {
    fromA: keepA.join(", ") || "no persistent trait",
    fromB: keepB.join(", ") || "no persistent trait",
    recombined: remix > 0.7 ? `${recombined}; traits crossed rather than averaged` : recombined,
    dropped: [...droppedA.map((label) => `A ${label}`), ...droppedB.map((label) => `B ${label}`)].join(", ") || "none",
  };
}

function voidMarks(sections: SectionCut[], frame: ReturnType<typeof loopFrame>, shift: number) {
  const marks: { angle: number; reach: number; near: boolean }[] = [];
  sections.forEach((section, sectionIndex) => {
    section.openings.forEach((opening) => {
      const samples = shift === 0 ? opening.samples : shiftSamples(opening.samples, shift);
      const center = average(samples.map((sample) => sample.position));
      const delta = sub(center, frame.origin);
      const angle = Math.atan2(dot(delta, frame.v), dot(delta, frame.u));
      const match = marks.find((mark) => angleDistance(mark.angle, angle) < 0.45);
      if (match) {
        match.reach += 1;
        match.near = match.near || sectionIndex === 0 || opening.persistence === "near-face";
      } else marks.push({ angle, reach: 1, near: sectionIndex === 0 || opening.persistence === "near-face" });
    });
  });
  return marks.filter((mark) => mark.reach >= 3 || mark.near).map((mark) => ({ angle: mark.angle, reach: Math.min(1, mark.reach / sections.length) }));
}

function projectChain(sections: Sample[][], frame: ReturnType<typeof loopFrame>): Planar[][] {
  return sections.map((samples) => samples.map((sample) => {
    const delta = sub(sample.position, frame.origin);
    return { u: dot(delta, frame.u), v: dot(delta, frame.v) };
  }));
}

function mixPlanar(primary: Planar, secondary: Planar, amount: number): Planar {
  return {
    u: primary.u + (secondary.u - primary.u) * amount,
    v: primary.v + (secondary.v - primary.v) * amount,
  };
}

function polyline(values: number[], t: number) {
  if (values.length === 0) return 1;
  const scaled = Math.max(0, Math.min(0.999, t)) * (values.length - 1);
  const index = Math.floor(scaled);
  const fraction = scaled - index;
  return values[index] * (1 - fraction) + values[Math.min(values.length - 1, index + 1)] * fraction;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function sectionAspect(section: Planar[]) {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  section.forEach((point) => {
    minU = Math.min(minU, point.u);
    maxU = Math.max(maxU, point.u);
    minV = Math.min(minV, point.v);
    maxV = Math.max(maxV, point.v);
  });
  const u = Math.max(1e-4, maxU - minU);
  const v = Math.max(1e-4, maxV - minV);
  return Math.max(u, v) / Math.min(u, v);
}

function loopFrame(samples: Sample[]) {
  const origin = average(samples.map((sample) => sample.position));
  let normal = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < samples.length; index += 1) {
    const current = sub(samples[index].position, origin);
    const next = sub(samples[(index + 1) % samples.length].position, origin);
    normal = add(normal, cross(current, next));
  }
  normal = length(normal) < 1e-8 ? { x: 0, y: 1, z: 0 } : normalize(normal);
  let u = reject(sub(samples[0].position, origin), normal);
  if (length(u) < 1e-6) u = cross(normal, Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 });
  u = normalize(u);
  const v = cross(normal, u);
  return {
    origin,
    normal,
    u,
    v,
    coords: samples.map((sample) => {
      const delta = sub(sample.position, origin);
      return { u: dot(delta, u), v: dot(delta, v) };
    }),
  };
}

function orientFrame(frame: ReturnType<typeof loopFrame>, travel: Vec3) {
  if (dot(frame.normal, travel) >= 0) return frame;
  return {
    ...frame,
    normal: scale(frame.normal, -1),
    v: scale(frame.v, -1),
    coords: frame.coords.map((coord) => ({ u: coord.u, v: -coord.v })),
  };
}

type RingOp = { kind: "reverse" } | { kind: "rotate"; station: number; shift: number };
type CorrespondenceMethod = "capped" | "lock";

/**
 * Lofts the capped settle and the unrestricted lock, then keeps the chain with fewer critical faults.
 * A sharp dihedral does not outrank a self-intersection. Opening loops receive the same reverse and cyclic shift as their outer ring.
 */
function resolveCorrespondence(
  rings: Vec3[][],
  openings: Vec3[][][],
  ends: { a: Vec3[]; b: Vec3[] } | null,
) {
  const capped = applyRingOps(rings, openings, cappedOps(rings));
  const lock = applyRingOps(rings, openings, lockOps(rings, ends?.a ?? null, ends?.b ?? null));
  const cappedScore = correspondenceScore(capped.rings, capped.openings);
  const lockScore = correspondenceScore(lock.rings, lock.openings);
  const method: CorrespondenceMethod = compareCorrespondence(lockScore, cappedScore) < 0 ? "lock" : "capped";
  const chosen = method === "lock" ? lock : capped;
  const drift = Math.max(...chosen.rings.map((ring, index) => length(sub(average(ring), average(rings[index])))));
  return { ...chosen, method, capped: cappedScore, lock: lockScore, lockOps: lock.ops, cappedOps: capped.ops, sourceOpenings: openings, spineDrift: drift };
}

/** Previous behavior. A cyclic shift is kept only when it is at most 18% of the ring. */
function cappedOps(rings: Vec3[][]): RingOp[] {
  const next = rings.map((ring) => ring.map((point) => ({ ...point })));
  const ops: RingOp[] = [];
  const count = next[0]?.length ?? 1;
  for (let station = 1; station < next.length; station += 1) {
    const span = sub(average(next[station]), average(next[station - 1]));
    if (length(span) < 1e-4) continue;
    const shift = bestShift3D(next[station - 1], next[station], normalize(span));
    const wrapped = Math.min(shift, count - shift);
    if (wrapped > 0 && wrapped <= count * 0.18) {
      ops.push({ kind: "rotate", station, shift });
      next[station] = rotateRing(next[station], shift);
    }
  }
  return ops;
}

/** Unrestricted cyclic lock. The chain reverses only when that matches boundary A. The last stations then share boundary B's residual shift. */
function lockOps(rings: Vec3[][], boundaryA: Vec3[] | null, boundaryB: Vec3[] | null): RingOp[] {
  const next = rings.map((ring) => ring.map((point) => ({ ...point })));
  const ops: RingOp[] = [];
  const count = next[0]?.length ?? 0;
  if (count < 3) return ops;
  if (boundaryA && boundaryA.length === count) {
    const direct = pairCost(next[0], boundaryA, false);
    const flipped = pairCost(next[0], boundaryA, true);
    if (flipped.cost < direct.cost) {
      ops.push({ kind: "reverse" });
      for (let station = 0; station < next.length; station += 1) next[station] = [...next[station]].reverse();
    }
    const shift = bestShift3D(boundaryA, next[0], sectionAxis(next[0]));
    if (shift) {
      ops.push({ kind: "rotate", station: 0, shift });
      next[0] = rotateRing(next[0], shift);
    }
  }
  for (let station = 1; station < next.length; station += 1) {
    const span = sub(average(next[station]), average(next[station - 1]));
    const axis = length(span) > 1e-4 ? normalize(span) : sectionAxis(next[station]);
    const shift = bestShift3D(next[station - 1], next[station], axis);
    if (shift) {
      ops.push({ kind: "rotate", station, shift });
      next[station] = rotateRing(next[station], shift);
    }
  }
  if (boundaryB && boundaryB.length === count && next.length > 1) {
    const tail = next.length - 1;
    const shift = bestShift3D(boundaryB, next[tail], sectionAxis(next[tail]));
    const start = Math.max(1, tail - 2);
    if (shift) {
      for (let station = start; station <= tail; station += 1) {
        ops.push({ kind: "rotate", station, shift });
        next[station] = rotateRing(next[station], shift);
      }
    }
  }
  return ops;
}

function applyRingOps(rings: Vec3[][], openings: Vec3[][][], ops: RingOp[]) {
  const next = rings.map((ring) => ring.map((point) => ({ ...point })));
  const loops = openings.map((station) => station.map((loop) => loop.map((point) => ({ ...point }))));
  const count = next[0]?.length ?? 1;
  ops.forEach((op) => {
    if (op.kind === "reverse") {
      for (let station = 0; station < next.length; station += 1) {
        next[station] = [...next[station]].reverse();
        loops[station] = (loops[station] ?? []).map((loop) => [...loop].reverse());
      }
      return;
    }
    if (!op.shift) return;
    next[op.station] = rotateRing(next[op.station], op.shift);
    loops[op.station] = (loops[op.station] ?? []).map((loop) => rotateRing(loop, scaleShift(op.shift, count, loop.length)));
  });
  return { rings: next, openings: loops, ops };
}

function scaleShift(shift: number, from: number, to: number) {
  if (to <= 1 || from <= 1) return 0;
  const wrapped = ((shift % from) + from) % from;
  const scaled = Math.round((wrapped * to) / from);
  return ((scaled % to) + to) % to;
}

type CorrespondenceScore = {
  nonManifold: number;
  inverted: number;
  piercings: number;
  windingReversals: number;
  openingBreaks: number;
  pinches: number;
  excessRotation: number;
  maxDihedral: number;
};

function compareCorrespondence(left: CorrespondenceScore, right: CorrespondenceScore) {
  const keys: (keyof CorrespondenceScore)[] = ["nonManifold", "inverted", "piercings", "windingReversals", "openingBreaks", "pinches", "excessRotation", "maxDihedral"];
  for (const key of keys) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return 0;
}

function correspondenceScore(rings: Vec3[][], openings: Vec3[][][]): CorrespondenceScore {
  const mesh = loftSectionRings(rings);
  let maxDihedral = 0;
  let inverted = 0;
  let windingReversals = 0;
  let pinches = 0;
  let excessRotation = 0;
  for (let index = 0; index < rings.length - 1; index += 1) {
    const hinge = ringHinge(rings[index], rings[index + 1]);
    maxDihedral = Math.max(maxDihedral, hinge.dihedral);
    inverted += hinge.inverted;
    const previous = ringNormal(rings[index]);
    const next = ringNormal(rings[index + 1]);
    if (dot(previous, next) < 0) windingReversals += 1;
    const radiusA = meanRadius(rings[index]);
    const radiusB = meanRadius(rings[index + 1]);
    const ratio = radiusB / Math.max(radiusA, 1e-4);
    if (ratio < 0.45 || ratio > 2.2) pinches += 1;
    if (ringRotation(rings[index], rings[index + 1]) > 90) excessRotation += 1;
  }
  return {
    nonManifold: nonManifoldEdges(mesh),
    inverted,
    piercings: piercingPairs(mesh),
    windingReversals,
    openingBreaks: openingBreaks(rings, openings),
    pinches,
    excessRotation,
    maxDihedral,
  };
}

function openingBreaks(rings: Vec3[][], openings: Vec3[][][]) {
  let breaks = 0;
  const count = rings[0]?.length ?? 1;
  for (let station = 1; station < rings.length; station += 1) {
    const previous = openings[station - 1] ?? [];
    const next = openings[station] ?? [];
    if (previous.length !== next.length) breaks += Math.abs(previous.length - next.length);
    const used = new Set<number>();
    previous.forEach((loop) => {
      let match = -1;
      let best = Infinity;
      next.forEach((candidate, index) => {
        if (used.has(index)) return;
        const gap = length(sub(average(loop), average(candidate)));
        if (gap < best) {
          best = gap;
          match = index;
        }
      });
      if (match < 0) return;
      used.add(match);
      const other = next[match];
      if (dot(ringNormal(loop), ringNormal(other)) < 0) breaks += 1;
      const shift = bestShift3D(loop, other, ringNormal(other));
      const wrapped = Math.min(shift, other.length - shift);
      const outer = bestShift3D(rings[station - 1], rings[station], ringNormal(rings[station]));
      const outerWrapped = Math.min(outer, count - outer);
      if (wrapped > other.length * 0.18 && Math.abs(wrapped - outerWrapped) > 1) breaks += 1;
    });
  }
  return breaks;
}

function meanRadius(ring: Vec3[]) {
  const origin = average(ring);
  return ring.reduce((sum, point) => sum + length(sub(point, origin)), 0) / Math.max(1, ring.length);
}

function ringNormal(ring: Vec3[]) {
  return sectionAxis(ring);
}

function ringRotation(previous: Vec3[], next: Vec3[]) {
  const normal = ringNormal(next);
  const from = average(previous);
  const to = average(next);
  let carried = sub(previous[0], from);
  carried = sub(carried, scale(normal, dot(carried, normal)));
  let current = sub(next[0], to);
  current = sub(current, scale(normal, dot(current, normal)));
  if (length(carried) < 1e-6 || length(current) < 1e-6) return 0;
  const cosine = Math.max(-1, Math.min(1, dot(scale(carried, 1 / length(carried)), scale(current, 1 / length(current)))));
  return Math.acos(cosine) * 180 / Math.PI;
}

function ringHinge(ring: Vec3[], next: Vec3[]) {
  let dihedral = 0;
  let inverted = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const ahead = (index + 1) % ring.length;
    const after = (ahead + 1) % ring.length;
    const left = cross(sub(ring[ahead], ring[index]), sub(next[index], ring[index]));
    const right = cross(sub(ring[after], ring[ahead]), sub(next[ahead], ring[ahead]));
    const quad = cross(sub(next[ahead], ring[ahead]), sub(next[index], ring[ahead]));
    if (length(left) < 1e-6) inverted += 1;
    if (length(quad) < 1e-6) inverted += 1;
    if (length(left) > 1e-8 && length(right) > 1e-8) {
      dihedral = Math.max(dihedral, Math.acos(Math.max(-1, Math.min(1, dot(scale(left, 1 / length(left)), scale(right, 1 / length(right)))))) * 180 / Math.PI);
    }
  }
  return { dihedral, inverted };
}

function nonManifoldEdges(mesh: IsoMesh) {
  const edges = new Map<string, number>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const tri = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = tri[edge];
      const b = tri[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let count = 0;
  edges.forEach((uses) => {
    if (uses !== 1 && uses !== 2) count += 1;
  });
  return count;
}

function piercingPairs(mesh: IsoMesh) {
  if (mesh.triangles <= 0 || mesh.triangles > 1600) return 0;
  const tris: { ids: number[]; points: Vec3[] }[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ids = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    tris.push({ ids, points: ids.map((id) => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] })) });
  }
  let count = 0;
  for (let left = 0; left < tris.length; left += 1) {
    for (let right = left + 1; right < tris.length; right += 1) {
      if (tris[left].ids.some((id) => tris[right].ids.includes(id))) continue;
      if (segmentHits(tris[left].points, tris[right].points) || segmentHits(tris[right].points, tris[left].points)) count += 1;
    }
  }
  return count;
}

function segmentHits(source: Vec3[], target: Vec3[]) {
  for (let index = 0; index < 3; index += 1) {
    const origin = source[index];
    const direction = sub(source[(index + 1) % 3], origin);
    const edge1 = sub(target[1], target[0]);
    const edge2 = sub(target[2], target[0]);
    const pvec = cross(direction, edge2);
    const det = dot(edge1, pvec);
    if (Math.abs(det) < 1e-8) continue;
    const inverse = 1 / det;
    const u = dot(sub(origin, target[0]), pvec) * inverse;
    if (u < -1e-5 || u > 1.00001) continue;
    const qvec = cross(sub(origin, target[0]), edge1);
    const v = dot(direction, qvec) * inverse;
    if (v < -1e-5 || u + v > 1.00001) continue;
    const t = dot(edge2, qvec) * inverse;
    if (t > 1e-3 && t < 1 - 1e-3) return true;
  }
  return false;
}

function pairCost(source: Vec3[], reference: Vec3[], reverse: boolean) {
  let best = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < source.length; shift += 1) {
    let cost = 0;
    for (let index = 0; index < source.length; index += 1) {
      const point = reverse
        ? source[(shift - index + source.length) % source.length]
        : source[(index + shift) % source.length];
      const target = reference[index];
      cost += (point.x - target.x) ** 2 + (point.y - target.y) ** 2 + (point.z - target.z) ** 2;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = shift;
    }
  }
  return { shift: best, cost: bestCost };
}

function sectionAxis(ring: Vec3[]) {
  const origin = average(ring);
  let normal = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < ring.length; index += 1) {
    normal = add(normal, cross(sub(ring[index], origin), sub(ring[(index + 1) % ring.length], origin)));
  }
  return length(normal) > 1e-8 ? normalize(normal) : { x: 0, y: 0, z: 1 };
}


function blendT(t: number, column: number) {
  const exp = [1.85, 1.4, 1, 1.4, 1.85][clampIndex(column)];
  if (column < 2) return t ** exp;
  if (column > 2) return 1 - (1 - t) ** exp;
  return t;
}

function orderLoop(points: ProfilePoint[], previous: { u: number; v: number } | null): OrderedLoop | null {
  if (points.length < 3) return null;
  const center = centroidUv(points);
  let local = points.map((point) => ({ u: point.u - center.u, v: point.v - center.v, position: point.position }));
  if (signedArea(local) < 0) local.reverse();
  const axis = principal(local);
  local = local.map((point) => ({
    u: point.u * axis.x + point.v * axis.y,
    v: -point.u * axis.y + point.v * axis.x,
    position: point.position,
  }));
  let start = 0;
  if (previous) {
    const angle = Math.atan2(previous.v, previous.u);
    let best = Infinity;
    local.forEach((point, index) => {
      const delta = angleDistance(Math.atan2(point.v, point.u), angle);
      if (delta < best) {
        best = delta;
        start = index;
      }
    });
  } else {
    local.forEach((point, index) => {
      if (point.u > local[start].u) start = index;
    });
  }
  const turned = [...local.slice(start), ...local.slice(0, start)];
  const samples = resample(turned, SECTIONAL_GENERATOR_SETTINGS.samples);
  return {
    role: "outer",
    persistence: "deep",
    samples,
    centroid: center,
    area: Math.abs(signedArea(local)),
    perimeter: perimeterOf(samples),
  };
}

function largestOuter(profile: ReturnType<typeof extractFaceProfile>): ProfilePoint[] | null {
  const loops = profile.loops.filter((loop) => loop.closed && loop.points.length >= 3);
  if (loops.length === 0) return null;
  const ranked = loops.map((loop) => ({ points: loop.points, area: Math.abs(signedArea(loop.points)) }));
  ranked.sort((left, right) => right.area - left.area);
  const outer = ranked[0];
  return outer && outer.area > 1e-4 ? outer.points : null;
}

function collectInner(profile: ReturnType<typeof extractFaceProfile>, outerPoints: ProfilePoint[]): OrderedLoop[] {
  const outer = orderLoop(outerPoints, null);
  if (!outer) return [];
  const loops = profile.loops.filter((loop) => loop.closed && loop.points.length >= 3);
  const openings: OrderedLoop[] = [];
  for (const loop of loops) {
    const area = Math.abs(signedArea(loop.points));
    if (area >= outer.area * 0.92) continue;
    const center = centroidUv(loop.points);
    if (!inside(center, outerPoints)) continue;
    const ordered = orderLoop(loop.points, null);
    if (!ordered) continue;
    openings.push({ ...ordered, role: "opening" });
  }
  return openings;
}

function solidSpan(mesh: IsoMesh, frame: FaceFrame): { near: number; far: number } | null {
  const limit = parentDepth(mesh, frame);
  if (limit < 1e-3) return null;
  const steps = 36;
  let first = -1;
  let last = -1;
  for (let index = 0; index <= steps; index += 1) {
    const depth = Math.max(0.002, (limit * index) / steps);
    if (!sectionHits(mesh, frame, depth)) continue;
    if (first < 0) first = depth;
    last = depth;
  }
  if (first < 0 || last < 0) return null;
  const near = refineHit(mesh, frame, first, Math.max(0.002, first - limit / steps));
  const far = refineHit(mesh, frame, last, Math.min(limit, last + limit / steps));
  if (far - near < 1e-3) return { near, far: near + 1e-3 };
  return { near, far };
}

function refineHit(mesh: IsoMesh, frame: FaceFrame, inside: number, outside: number) {
  let hit = inside;
  let miss = outside;
  for (let index = 0; index < 10; index += 1) {
    const mid = Math.max(0.002, (hit + miss) / 2);
    if (sectionHits(mesh, frame, mid)) hit = mid;
    else miss = mid;
  }
  return hit;
}

function sectionHits(mesh: IsoMesh, frame: FaceFrame, depth: number) {
  const profile = extractFaceProfile(mesh, frame, depth);
  return profile.status === "ready" && !!largestOuter(profile);
}

function cutAt(mesh: IsoMesh, frame: FaceFrame, target: number, span: { near: number; far: number }) {
  const window = Math.max(0.02, (span.far - span.near) * 0.08);
  const offsets = [0, 0.25, -0.25, 0.5, -0.5, 1, -1];
  for (const factor of offsets) {
    const depth = Math.min(span.far, Math.max(span.near, target + factor * window));
    const profile = extractFaceProfile(mesh, frame, depth);
    if (profile.status === "ready" && largestOuter(profile)) return { profile, depth };
  }
  return null;
}

function parentDepth(mesh: IsoMesh, frame: FaceFrame) {
  const inward = scale(frame.normal, -1);
  let max = 0;
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 3) {
    const depth = (positions[index] - frame.origin.x) * inward.x
      + (positions[index + 1] - frame.origin.y) * inward.y
      + (positions[index + 2] - frame.origin.z) * inward.z;
    if (depth > max) max = depth;
  }
  return Math.max(max, Math.min(frame.extent.u, frame.extent.v) * 0.35);
}

function bestShift(a: Sample[], b: Sample[]) {
  let best = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < a.length; shift += 1) {
    let travel = 0;
    let turn = 0;
    for (let index = 0; index < a.length; index += 1) {
      const other = b[(index + shift) % b.length];
      travel += (a[index].u - other.u) ** 2 + (a[index].v - other.v) ** 2;
      const nextA = a[(index + 1) % a.length];
      const nextB = b[(index + 1 + shift) % b.length];
      turn += Math.abs(angleOf(a[index], nextA) - angleOf(other, nextB));
    }
    const cost = travel + turn * 0.15;
    if (cost < bestCost) {
      bestCost = cost;
      best = shift;
    }
  }
  return best;
}

function bestShift3D(a: Vec3[], b: Vec3[], axis: Vec3) {
  const basis = planeBasis(a, axis);
  const left = a.map((point) => project(point, average(a), basis));
  const right = b.map((point) => project(point, average(b), basis));
  let best = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < left.length; shift += 1) {
    let travel = 0;
    for (let index = 0; index < left.length; index += 1) {
      const other = right[(index + shift) % right.length];
      travel += (left[index].u - other.u) ** 2 + (left[index].v - other.v) ** 2;
    }
    if (travel < bestCost) {
      bestCost = travel;
      best = shift;
    }
  }
  return best;
}

function correspondenceOf(a: Sample[], b: Sample[]): "YES" | "NO" {
  let max = 0;
  for (let index = 0; index < a.length; index += 1) {
    max = Math.max(max, angleDistance(Math.atan2(a[index].v, a[index].u), Math.atan2(b[index].v, b[index].u)));
  }
  return max < 1.35 ? "YES" : "NO";
}

function shiftSamples(samples: Sample[], shift: number) {
  if (shift === 0) return samples;
  return samples.map((_, index) => samples[(index + shift) % samples.length]);
}

function rotateRing(ring: Vec3[], shift: number) {
  return ring.map((_, index) => ring[(index + shift) % ring.length]);
}

function resample(points: Sample[], count: number): Sample[] {
  const closed = [...points, points[0]];
  const lengths = [0];
  for (let index = 1; index < closed.length; index += 1) {
    lengths.push(lengths[index - 1] + Math.hypot(closed[index].u - closed[index - 1].u, closed[index].v - closed[index - 1].v));
  }
  const total = lengths[lengths.length - 1] || 1;
  const samples: Sample[] = [];
  let cursor = 1;
  for (let index = 0; index < count; index += 1) {
    const target = (total * index) / count;
    while (cursor < lengths.length - 1 && lengths[cursor] < target) cursor += 1;
    const span = lengths[cursor] - lengths[cursor - 1] || 1;
    const t = (target - lengths[cursor - 1]) / span;
    const from = closed[cursor - 1];
    const to = closed[cursor];
    samples.push({
      u: from.u + (to.u - from.u) * t,
      v: from.v + (to.v - from.v) * t,
      position: lerp(from.position, to.position, t),
    });
  }
  return samples;
}

function pointMarks(points: Vec3[], u: Vec3, v: Vec3, radius: number): IsoMesh {
  const positions = new Float32Array(points.length * 12);
  const normals = new Float32Array(points.length * 12);
  const indices: number[] = [];
  const normal = normalize(cross(u, v));
  points.forEach((point, index) => {
    const base = index * 4;
    const corners = [
      add(point, add(scale(u, -radius), scale(v, -radius))),
      add(point, add(scale(u, radius), scale(v, -radius))),
      add(point, add(scale(u, radius), scale(v, radius))),
      add(point, add(scale(u, -radius), scale(v, radius))),
    ];
    corners.forEach((corner, cornerIndex) => {
      writeVec(positions, base + cornerIndex, corner);
      writeVec(normals, base + cornerIndex, normal);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { positions, normals, indices: Uint32Array.from(indices), triangles: points.length * 2 };
}

function planeMesh(origin: Vec3, u: Vec3, v: Vec3, halfU: number, halfV: number): IsoMesh {
  const corners = [
    add(origin, add(scale(u, -halfU), scale(v, -halfV))),
    add(origin, add(scale(u, halfU), scale(v, -halfV))),
    add(origin, add(scale(u, halfU), scale(v, halfV))),
    add(origin, add(scale(u, -halfU), scale(v, halfV))),
  ];
  const normal = normalize(cross(u, v));
  const positions = new Float32Array(12);
  const normals = new Float32Array(12);
  corners.forEach((corner, index) => {
    positions[index * 3] = corner.x;
    positions[index * 3 + 1] = corner.y;
    positions[index * 3 + 2] = corner.z;
    normals[index * 3] = normal.x;
    normals[index * 3 + 1] = normal.y;
    normals[index * 3 + 2] = normal.z;
  });
  return { positions, normals, indices: Uint32Array.from([0, 1, 2, 0, 2, 3]), triangles: 2 };
}

function ribbon(points: Vec3[], width: number): IsoMesh {
  if (points.length < 3) {
    return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), triangles: 0 };
  }
  const normal = normalize(cross(sub(points[1], points[0]), sub(points[2], points[0])));
  const positions = new Float32Array(points.length * 6);
  const normals = new Float32Array(points.length * 6);
  points.forEach((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const side = normalize(cross(normal, sub(next, previous)));
    const left = add(point, scale(side, width));
    const right = add(point, scale(side, -width));
    writeVec(positions, index * 2, left);
    writeVec(positions, index * 2 + 1, right);
    writeVec(normals, index * 2, normal);
    writeVec(normals, index * 2 + 1, normal);
  });
  const indices: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    const a0 = index * 2;
    const b0 = a0 + 1;
    const a1 = next * 2;
    const b1 = a1 + 1;
    indices.push(a0, b0, a1, b0, b1, a1);
  }
  return { positions, normals, indices: Uint32Array.from(indices), triangles: indices.length / 3 };
}

function failed(candidate: HybridCandidate, reason: string): GeneratedHybridCandidate {
  return {
    candidateId: candidate.id,
    candidate,
    status: "blocked",
    geometry: null,
    vertexCount: 0,
    triangleCount: 0,
    reason,
    branches: 0,
    openings: 0,
  };
}

function clampIndex(index: number) {
  return Math.min(4, Math.max(0, index));
}

function centroidUv(points: readonly { u: number; v: number }[]) {
  const sum = points.reduce((acc, point) => ({ u: acc.u + point.u, v: acc.v + point.v }), { u: 0, v: 0 });
  return { u: sum.u / points.length, v: sum.v / points.length };
}

function signedArea(points: readonly { u: number; v: number }[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].u * next.v - next.u * points[index].v;
  }
  return area * 0.5;
}

function principal(points: readonly { u: number; v: number }[]) {
  let uu = 0;
  let vv = 0;
  let uv = 0;
  for (const point of points) {
    uu += point.u * point.u;
    vv += point.v * point.v;
    uv += point.u * point.v;
  }
  const angle = 0.5 * Math.atan2(2 * uv, uu - vv);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function perimeterOf(points: readonly { u: number; v: number }[]) {
  let length = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    length += Math.hypot(next.u - points[index].u, next.v - points[index].v);
  }
  return length;
}

function inside(point: { u: number; v: number }, polygon: readonly { u: number; v: number }[]) {
  let crossings = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index];
    const to = polygon[(index + 1) % polygon.length];
    const hits = ((from.v > point.v) !== (to.v > point.v))
      && point.u < ((to.u - from.u) * (point.v - from.v)) / ((to.v - from.v) || 1e-8) + from.u;
    if (hits) crossings += 1;
  }
  return crossings % 2 === 1;
}

function angleOf(from: { u: number; v: number }, to: { u: number; v: number }) {
  return Math.atan2(to.v - from.v, to.u - from.u);
}

function angleDistance(left: number, right: number) {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function distance2(left: { u: number; v: number }, right: { u: number; v: number }) {
  return Math.hypot(left.u - right.u, left.v - right.v);
}

function planeBasis(points: Vec3[], axis: Vec3) {
  const hint = reject(sub(points[Math.floor(points.length / 3)] ?? points[0], average(points)), axis);
  const u = length(hint) > 1e-5 ? normalize(hint) : unitPerp(axis);
  return { u, v: normalize(cross(axis, u)) };
}

function project(point: Vec3, origin: Vec3, basis: { u: Vec3; v: Vec3 }) {
  const delta = sub(point, origin);
  return { u: dot(delta, basis.u), v: dot(delta, basis.v) };
}

function writeVec(buffer: Float32Array, index: number, value: Vec3) {
  buffer[index * 3] = value.x;
  buffer[index * 3 + 1] = value.y;
  buffer[index * 3 + 2] = value.z;
}

function average(points: readonly Vec3[]) {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / Math.max(1, points.length));
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

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: Vec3) {
  return scale(value, 1 / Math.max(1e-8, length(value)));
}

function reject(vector: Vec3, axis: Vec3) {
  return sub(vector, scale(axis, dot(vector, axis)));
}

function unitPerp(value: Vec3) {
  const helper = Math.abs(value.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalize(cross(value, helper));
}
