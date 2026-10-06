import type { IsoMesh } from "../scan/isomesh";
import { columnHeight } from "../scan/isomesh";
import { SCAN_SLICES } from "../scan/volume";
import { FIELD_SIZE, SECTION_HEIGHT } from "../skill1/maps";

export const SKILL4_MODULE_CONTRACT = "skill4-module-v1" as const;

export const FACE_IDS = ["N", "S", "E", "W", "T", "B"] as const;

export type FaceId = (typeof FACE_IDS)[number];

export type ModuleSource = "mock" | "skill03";

export type Vec3 = { x: number; y: number; z: number };

/** Scan settings the Vertical Propagation view uses when it builds an IsoMesh. */
export const VIEW_SCAN = {
  seed: 7,
  iso: 0.48,
  spacing: 0.1,
  yaw: 0.86,
} as const;

export type ModuleScan = {
  seed: number;
  iso: number;
  spacing: number;
  yaw: number;
  slices: number;
  stepsBetweenSlices: number;
  /** The view stops early when the run converges. Stored modules run the full slice count. */
  stoppedOnConverged: boolean;
};

export type EncodedIsoMesh = {
  encoding: "isomesh-base64";
  positions: string;
  normals: string;
  indices: string;
  triangles: number;
};

export type Skill4ModuleRecord = {
  contract: typeof SKILL4_MODULE_CONTRACT;
  moduleId: string;
  revision: number;
  archetypeId: string;
  source: ModuleSource;
  provisional: boolean;
  selectedFinal: boolean;
  scan: ModuleScan;
  registration: {
    origin: Vec3;
    min: Vec3;
    max: Vec3;
  };
  geometry: EncodedIsoMesh | IsoMesh | null;
  provenance: {
    role: "provisional-mock" | "skill03-output";
    note: string;
  };
};

export type FaceFrame = {
  id: FaceId;
  origin: Vec3;
  normal: Vec3;
  u: Vec3;
  v: Vec3;
  extent: { u: number; v: number };
};

/**
 * IsoMesh display space, from `world` in lib/scan/isomesh.ts.
 * Plan X/Z span the 20-cell field. Y is slice pitch. Nothing in that path is in feet.
 */
export const COORDINATE_CONVENTION = {
  geometrySpace: "isomesh-display",
  axes: {
    x: "+field x, registered as east",
    y: "+slice index, up",
    z: "+field y, registered as north",
  },
  planLattice: {
    cells: FIELD_SIZE,
    unit: "field-cell",
    feet: null,
  },
  vertical: {
    slices: SCAN_SLICES,
    pitch: "sliceSpacing(spacing, yaw) = 0.04 + spacing * 0.42",
    sectionHeight: SECTION_HEIGHT,
    sectionHeightApplied: false,
  },
  map: {
    meshX: "fieldX / FIELD_SIZE - 0.5",
    meshZ: "fieldY / FIELD_SIZE - 0.5",
    meshY: "sliceIndex * pitch - ((SCAN_SLICES - 1) * pitch) / 2",
  },
  unresolved: [
    "FIELD_SIZE is 20 field cells. The pipeline never defines a foot, so this is not a 20-foot lattice and vertices are not rescaled.",
    "SECTION_HEIGHT is 10 and is only a Skill 1 display depth. extractIsomesh does not use it.",
    "N, S, E, and W are a Skill 04 registration assignment. Skill 03 does not label faces.",
    "Vertical pitch is a fraction of plate width from sliceSpacing. It is not a surveyed height.",
    "extractIsomesh defaults spacing to 0.72. The Vertical Propagation view starts spacing at 0.1. Mock scans use the view value and record it.",
    "extractIsomesh centers Y on SCAN_SLICES even if fewer slices are passed. The registration column uses the full slice count.",
  ],
} as const;

export function registrationEnvelope(spacing: number, yaw: number) {
  const halfPlan = 0.5;
  const halfHeight = columnHeight(spacing, yaw) / 2;
  return {
    origin: { x: 0, y: 0, z: 0 },
    min: { x: -halfPlan, y: -halfHeight, z: -halfPlan },
    max: { x: halfPlan, y: halfHeight, z: halfPlan },
  };
}

/** Documents the field-to-mesh map. Does not transform stored vertices. */
export function fieldToMesh(fieldX: number, fieldY: number, sliceIndex: number, pitch: number): Vec3 {
  const full = (SCAN_SLICES - 1) * pitch;
  return {
    x: fieldX / FIELD_SIZE - 0.5,
    y: sliceIndex * pitch - full / 2,
    z: fieldY / FIELD_SIZE - 0.5,
  };
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function frame(
  id: FaceId,
  origin: Vec3,
  normal: Vec3,
  u: Vec3,
  vAxis: Vec3,
  extentU: number,
  extentV: number,
): FaceFrame {
  return { id, origin, normal, u, v: vAxis, extent: { u: extentU, v: extentV } };
}

/** Six faces of the registration box. The mesh is not required to fill or stay inside them. */
export function faceFrames(bounds: { min: Vec3; max: Vec3 }): Record<FaceId, FaceFrame> {
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cy = (bounds.min.y + bounds.max.y) / 2;
  const cz = (bounds.min.z + bounds.max.z) / 2;
  const sx = bounds.max.x - bounds.min.x;
  const sy = bounds.max.y - bounds.min.y;
  const sz = bounds.max.z - bounds.min.z;
  return {
    N: frame("N", v(cx, cy, bounds.max.z), v(0, 0, 1), v(0, 1, 0), v(-1, 0, 0), sy, sx),
    S: frame("S", v(cx, cy, bounds.min.z), v(0, 0, -1), v(0, 1, 0), v(1, 0, 0), sy, sx),
    E: frame("E", v(bounds.max.x, cy, cz), v(1, 0, 0), v(0, 1, 0), v(0, 0, 1), sy, sz),
    W: frame("W", v(bounds.min.x, cy, cz), v(-1, 0, 0), v(0, 1, 0), v(0, 0, -1), sy, sz),
    T: frame("T", v(cx, bounds.max.y, cz), v(0, 1, 0), v(1, 0, 0), v(0, 0, -1), sx, sz),
    B: frame("B", v(cx, bounds.min.y, cz), v(0, -1, 0), v(1, 0, 0), v(0, 0, 1), sx, sz),
  };
}
