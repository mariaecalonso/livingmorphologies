import { TYPOLOGIES, groupsForArchetype } from "../catalog";
import type { IsoMesh } from "../scan/isomesh";
import { sliceSpacing } from "../scan/isomesh";
import type { CriterionGroup, GroupId, TypologyId } from "../types";
import {
  COORDINATE_CONVENTION,
  FACE_IDS,
  SKILL4_MODULE_CONTRACT,
  faceFrames,
  registrationEnvelope,
  type FaceFrame,
  type FaceId,
  type Skill4ModuleRecord,
  type Vec3,
} from "./contract";

export type ModuleIdentity = {
  archetypeId: string;
  name: string;
  typologyId: TypologyId;
  typologyLabel: string;
  descriptors: Record<GroupId, string>;
  criteria: CriterionGroup[];
};

export type ReadyModule = {
  status: "ready";
  moduleId: string;
  revision: number;
  source: Skill4ModuleRecord["source"];
  provisional: boolean;
  selectedFinal: boolean;
  provenance: Skill4ModuleRecord["provenance"];
  identity: ModuleIdentity;
  geometry: IsoMesh;
  registration: Skill4ModuleRecord["registration"];
  faces: Record<FaceId, FaceFrame>;
  coordinates: typeof COORDINATE_CONVENTION;
  pitch: number;
  geometryExceedsEnvelope: boolean;
};

export type UnavailableModule = {
  status: "unavailable";
  moduleId: string;
  revision: number;
  archetypeId: string;
  source: Skill4ModuleRecord["source"];
  provisional: boolean;
  selectedFinal: boolean;
  reason: string;
  substituted: false;
  identity: ModuleIdentity | null;
  geometry: null;
};

export type ModuleHandoff = ReadyModule | UnavailableModule;

const close = (a: number, b: number) => Math.abs(a - b) < 1e-5;

function sameVec(a: Vec3, b: Vec3) {
  return close(a.x, b.x) && close(a.y, b.y) && close(a.z, b.z);
}

export function catalogIdentity(archetypeId: string): ModuleIdentity | null {
  for (const typology of TYPOLOGIES) {
    const archetype = typology.archetypes.find((item) => item.id === archetypeId);
    if (!archetype) continue;
    return {
      archetypeId: archetype.id,
      name: archetype.name,
      typologyId: typology.id,
      typologyLabel: typology.label,
      descriptors: archetype.descriptors,
      criteria: groupsForArchetype(typology.id, archetype, archetype.ratings),
    };
  }
  return null;
}

function bytesFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function float32From(bytes: Uint8Array) {
  if (bytes.byteLength % 4 !== 0) throw new Error("float buffer is not a multiple of 4 bytes");
  const copy = new Float32Array(bytes.byteLength / 4);
  new Uint8Array(copy.buffer).set(bytes);
  return copy;
}

function uint32From(bytes: Uint8Array) {
  if (bytes.byteLength % 4 !== 0) throw new Error("index buffer is not a multiple of 4 bytes");
  const copy = new Uint32Array(bytes.byteLength / 4);
  new Uint8Array(copy.buffer).set(bytes);
  return copy;
}

export function decodeGeometry(geometry: Skill4ModuleRecord["geometry"]): IsoMesh | null {
  if (!geometry) return null;
  if ("encoding" in geometry) {
    const positions = float32From(bytesFromBase64(geometry.positions));
    const normals = float32From(bytesFromBase64(geometry.normals));
    const indices = uint32From(bytesFromBase64(geometry.indices));
    return { positions, normals, indices, triangles: geometry.triangles };
  }
  return geometry;
}

function assertRecord(record: Skill4ModuleRecord) {
  if (record.contract !== SKILL4_MODULE_CONTRACT) {
    throw new Error(`unsupported module contract: ${record.contract}`);
  }
  if (!record.moduleId || !Number.isInteger(record.revision) || record.revision < 1) {
    throw new Error("module id and revision are required");
  }
  if (record.source !== "mock" && record.source !== "skill03") {
    throw new Error(`unknown module source: ${record.source}`);
  }
  if (record.source === "mock" && (!record.provisional || record.selectedFinal)) {
    throw new Error("a mock module must stay provisional and cannot be marked as a selected Skill 03 output");
  }
  if (record.source === "mock" && record.provenance.role !== "provisional-mock") {
    throw new Error("mock provenance must say provisional-mock");
  }
  if (record.source === "skill03" && record.provenance.role !== "skill03-output") {
    throw new Error("skill03 provenance must say skill03-output");
  }
  const expected = registrationEnvelope(record.scan.spacing, record.scan.yaw);
  if (!sameVec(record.registration.origin, expected.origin) || !sameVec(record.registration.min, expected.min) || !sameVec(record.registration.max, expected.max)) {
    throw new Error("registration envelope does not match the recorded scan spacing");
  }
  if (record.scan.slices < 2) throw new Error("a module scan needs at least two slices");
}

function geometryExceedsEnvelope(mesh: IsoMesh, bounds: { min: Vec3; max: Vec3 }) {
  const { positions } = mesh;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < bounds.min.x - 1e-4 || x > bounds.max.x + 1e-4) return true;
    if (y < bounds.min.y - 1e-4 || y > bounds.max.y + 1e-4) return true;
    if (z < bounds.min.z - 1e-4 || z > bounds.max.z + 1e-4) return true;
  }
  return false;
}

function usableMesh(mesh: IsoMesh | null): mesh is IsoMesh {
  if (!mesh || mesh.triangles < 1) return false;
  if (mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) return false;
  if (mesh.normals.length !== mesh.positions.length) return false;
  if (mesh.indices.length !== mesh.triangles * 3) return false;
  return true;
}

/**
 * One entry for mock fixtures and future Skill 03 records.
 * Empty Skill 03 geometry stays unavailable. It is not replaced with a mock.
 */
export function adaptModule(record: Skill4ModuleRecord): ModuleHandoff {
  assertRecord(record);
  const identity = catalogIdentity(record.archetypeId);
  if (!identity) throw new Error(`unknown archetype: ${record.archetypeId}`);
  const mesh = decodeGeometry(record.geometry);
  if (!usableMesh(mesh)) {
    const reason = record.source === "skill03"
      ? "Skill 03 geometry is unavailable. Mock geometry was not substituted."
      : "Mock geometry is unavailable.";
    return {
      status: "unavailable",
      moduleId: record.moduleId,
      revision: record.revision,
      archetypeId: record.archetypeId,
      source: record.source,
      provisional: record.provisional,
      selectedFinal: record.selectedFinal,
      reason,
      substituted: false,
      identity,
      geometry: null,
    };
  }
  const faces = faceFrames(record.registration);
  for (const id of FACE_IDS) {
    if (!faces[id]) throw new Error(`missing face ${id}`);
  }
  return {
    status: "ready",
    moduleId: record.moduleId,
    revision: record.revision,
    source: record.source,
    provisional: record.provisional,
    selectedFinal: record.selectedFinal,
    provenance: record.provenance,
    identity,
    geometry: mesh,
    registration: record.registration,
    faces,
    coordinates: COORDINATE_CONVENTION,
    pitch: sliceSpacing(record.scan.spacing, record.scan.yaw),
    geometryExceedsEnvelope: geometryExceedsEnvelope(mesh, record.registration),
  };
}
