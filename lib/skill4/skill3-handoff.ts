import type { IsoMesh } from "../scan/isomesh";
import { readFinalSelection } from "../skill3/final-selection";
import { readSolidifiedMesh } from "../skill3/solidified-catalogue";
import { decodeSolidifiedMesh } from "../skill3/solidified-mesh";
import {
  SKILL4_MODULE_CONTRACT,
  VIEW_SCAN,
  registrationEnvelope,
  type EncodedIsoMesh,
  type Skill4ModuleRecord,
  type Vec3,
} from "./contract";

/**
 * Current working Skill 3 handoff for Skill 4 testing.
 * The solidified file stays the source. Registration writes a new mesh.
 */
export const SKILL3_HANDOFF_NOTE = "Current working Skill 3 handoff for Skill 4 testing. Not a final approved geometry set.";

type RegistrationCell = { min: Vec3; max: Vec3 };

function boundsOf(positions: Float32Array) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/**
 * Maps each axis of the mesh bounds onto the Skill 4 registration cell.
 * The source buffers are not written. Triangle connectivity stays the same.
 * Normals are rescaled with the inverse transpose so the copy stays shaded.
 */
export function registerMeshIntoCell(mesh: IsoMesh, cell: RegistrationCell): IsoMesh {
  const bounds = boundsOf(mesh.positions);
  const sizeX = bounds.maxX - bounds.minX;
  const sizeY = bounds.maxY - bounds.minY;
  const sizeZ = bounds.maxZ - bounds.minZ;
  const cellX = cell.max.x - cell.min.x;
  const cellY = cell.max.y - cell.min.y;
  const cellZ = cell.max.z - cell.min.z;
  if (!(sizeX > 0 && sizeY > 0 && sizeZ > 0 && cellX > 0 && cellY > 0 && cellZ > 0)) {
    throw new Error("mesh bounds cannot be registered");
  }
  const scaleX = cellX / sizeX;
  const scaleY = cellY / sizeY;
  const scaleZ = cellZ / sizeZ;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    positions[index] = cell.min.x + (mesh.positions[index] - bounds.minX) * scaleX;
    positions[index + 1] = cell.min.y + (mesh.positions[index + 1] - bounds.minY) * scaleY;
    positions[index + 2] = cell.min.z + (mesh.positions[index + 2] - bounds.minZ) * scaleZ;
    const nx = mesh.normals[index] / scaleX;
    const ny = mesh.normals[index + 1] / scaleY;
    const nz = mesh.normals[index + 2] / scaleZ;
    const length = Math.hypot(nx, ny, nz);
    if (length > 1e-8) {
      normals[index] = nx / length;
      normals[index + 1] = ny / length;
      normals[index + 2] = nz / length;
    } else {
      normals[index] = mesh.normals[index];
      normals[index + 1] = mesh.normals[index + 1];
      normals[index + 2] = mesh.normals[index + 2];
    }
  }
  return {
    positions,
    normals,
    indices: new Uint32Array(mesh.indices),
    triangles: mesh.triangles,
  };
}

function encodeIsoMesh(mesh: IsoMesh): EncodedIsoMesh {
  const bytes = (view: ArrayBufferView) => Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("base64");
  return {
    encoding: "isomesh-base64",
    positions: bytes(mesh.positions),
    normals: bytes(mesh.normals),
    indices: bytes(mesh.indices),
    triangles: mesh.triangles,
  };
}

/** The 15 selected solidified modules, each with a registered copy in the Skill 4 cell. */
export function loadSkill3HandoffRecords(): Skill4ModuleRecord[] {
  const selection = readFinalSelection();
  const registration = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  return selection.selections.map((entry) => {
    const stored = readSolidifiedMesh(entry.archetypeId, entry.candidateId, entry.continuationId);
    if (!stored || stored.moduleId !== entry.moduleId || stored.geometry.encoding !== "isomesh-base64") {
      throw new Error(`repaired solidified mesh missing for ${entry.moduleId}`);
    }
    const originalGeometry = decodeSolidifiedMesh(stored.geometry);
    const registeredGeometry = registerMeshIntoCell(originalGeometry, registration);
    return {
      contract: SKILL4_MODULE_CONTRACT,
      moduleId: entry.moduleId,
      revision: 1,
      archetypeId: entry.archetypeId,
      source: "skill03",
      provisional: false,
      selectedFinal: true,
      scan: {
        seed: VIEW_SCAN.seed,
        iso: VIEW_SCAN.iso,
        spacing: VIEW_SCAN.spacing,
        yaw: VIEW_SCAN.yaw,
        slices: 24,
        stepsBetweenSlices: 22,
        stoppedOnConverged: false,
      },
      registration,
      geometry: encodeIsoMesh(registeredGeometry),
      provenance: {
        role: "skill03-output",
        note: SKILL3_HANDOFF_NOTE,
      },
    };
  });
}
