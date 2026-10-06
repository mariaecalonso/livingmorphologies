import type { FaceFrame, FaceId } from "./contract";
import type { IsoMesh } from "../scan/isomesh";

/**
 * IsoMesh is a triangle surface in display units, not a volume grid.
 * Each sample is a triangle centroid. Depth is inward from the registration face,
 * opposite the outward normal. 0.15 registration units is the slab thickness.
 * The face rectangle is split into an 8×8 grid. Local u/v are mapped from the
 * face extent into [0, 1]. Cell values are then divided by the busiest cell.
 * These counts record surface presence in the slab. They do not measure
 * openness, circulation, floor continuity, or accessibility.
 */
export const FACE_SAMPLE_SETTINGS = {
  version: "skill4-face-sample-v1",
  resolution: 8,
  depth: 0.15,
  sample: "triangle-centroid",
  depthDirection: "inward, opposite the outward face normal",
  uv: "face u and v divided by extent, then shifted into [0, 1]",
  cellNormalization: "raw count divided by the maximum cell count on this face",
} as const;

export type FaceSampleStatus = "occupied" | "empty-interface" | "unavailable";

export type FaceObservation = {
  status: FaceSampleStatus;
  face: FaceId;
  frame: FaceFrame | null;
  resolution: number;
  depth: number;
  sampleCount: number;
  occupancy: number;
  coverage: number;
  cells: number[];
  normalizedCells: number[];
  note: string;
};

const UNAVAILABLE_NOTE = "No adapted mesh is available for this face.";
const EMPTY_NOTE = "The mesh has no triangle centroids in the inward face slab. This is an empty sampled interface, not a missing module.";
const OCCUPIED_NOTE = "Counts are triangle centroids inside the face slab. They are not measures of openness, circulation, floor continuity, or accessibility.";

export function unavailableFace(face: FaceId): FaceObservation {
  return {
    status: "unavailable",
    face,
    frame: null,
    resolution: FACE_SAMPLE_SETTINGS.resolution,
    depth: FACE_SAMPLE_SETTINGS.depth,
    sampleCount: 0,
    occupancy: 0,
    coverage: 0,
    cells: [],
    normalizedCells: [],
    note: UNAVAILABLE_NOTE,
  };
}

export function sampleFace(mesh: IsoMesh | null, face: FaceId, frame: FaceFrame | null): FaceObservation {
  if (!mesh || !frame || mesh.triangles < 1 || mesh.positions.length < 9) {
    if (!mesh || !frame) return unavailableFace(face);
    return {
      ...unavailableFace(face),
      status: "empty-interface",
      frame,
      note: EMPTY_NOTE,
      cells: new Array(FACE_SAMPLE_SETTINGS.resolution ** 2).fill(0),
      normalizedCells: new Array(FACE_SAMPLE_SETTINGS.resolution ** 2).fill(0),
    };
  }
  const resolution = FACE_SAMPLE_SETTINGS.resolution;
  const depthLimit = FACE_SAMPLE_SETTINGS.depth;
  const cells = new Array<number>(resolution * resolution).fill(0);
  const { positions, indices } = mesh;
  const halfU = frame.extent.u / 2;
  const halfV = frame.extent.v / 2;
  let sampleCount = 0;
  for (let triangle = 0; triangle < mesh.triangles; triangle += 1) {
    const a = indices[triangle * 3] * 3;
    const b = indices[triangle * 3 + 1] * 3;
    const c = indices[triangle * 3 + 2] * 3;
    const x = (positions[a] + positions[b] + positions[c]) / 3;
    const y = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
    const z = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
    const dx = x - frame.origin.x;
    const dy = y - frame.origin.y;
    const dz = z - frame.origin.z;
    const depth = -(dx * frame.normal.x + dy * frame.normal.y + dz * frame.normal.z);
    if (depth < 0 || depth > depthLimit) continue;
    const localU = dx * frame.u.x + dy * frame.u.y + dz * frame.u.z;
    const localV = dx * frame.v.x + dy * frame.v.y + dz * frame.v.z;
    if (Math.abs(localU) > halfU || Math.abs(localV) > halfV) continue;
    const binU = Math.min(resolution - 1, Math.max(0, Math.floor((localU / frame.extent.u + 0.5) * resolution)));
    const binV = Math.min(resolution - 1, Math.max(0, Math.floor((localV / frame.extent.v + 0.5) * resolution)));
    cells[binV * resolution + binU] += 1;
    sampleCount += 1;
  }
  const peak = Math.max(1, ...cells);
  const occupied = cells.filter((count) => count > 0).length;
  const coverage = occupied / cells.length;
  if (sampleCount === 0) {
    return {
      status: "empty-interface",
      face,
      frame,
      resolution,
      depth: depthLimit,
      sampleCount: 0,
      occupancy: 0,
      coverage: 0,
      cells,
      normalizedCells: cells.map(() => 0),
      note: EMPTY_NOTE,
    };
  }
  return {
    status: "occupied",
    face,
    frame,
    resolution,
    depth: depthLimit,
    sampleCount,
    occupancy: coverage,
    coverage,
    cells,
    normalizedCells: cells.map((count) => count / peak),
    note: OCCUPIED_NOTE,
  };
}
