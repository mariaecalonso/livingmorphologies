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
 * Seats a solidified mesh in the registration cell without resizing it.
 * Plan is centered on the cell. The lowest vertex sits on the cell floor.
 * Normals are copied. The source buffers are not written.
 */
export function registerMeshIntoCell(mesh: IsoMesh, cell: RegistrationCell): IsoMesh {
  const bounds = boundsOf(mesh.positions);
  const sizeX = bounds.maxX - bounds.minX;
  const sizeY = bounds.maxY - bounds.minY;
  const sizeZ = bounds.maxZ - bounds.minZ;
  if (!(sizeX > 0 && sizeY > 0 && sizeZ > 0)) {
    throw new Error("mesh bounds cannot be registered");
  }
  const shiftX = (cell.min.x + cell.max.x) / 2 - (bounds.minX + bounds.maxX) / 2;
  const shiftY = cell.min.y - bounds.minY;
  const shiftZ = (cell.min.z + cell.max.z) / 2 - (bounds.minZ + bounds.maxZ) / 2;
  const positions = new Float32Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    positions[index] = mesh.positions[index] + shiftX;
    positions[index + 1] = mesh.positions[index + 1] + shiftY;
    positions[index + 2] = mesh.positions[index + 2] + shiftZ;
  }
  return {
    positions,
    normals: Float32Array.from(mesh.normals),
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

/** One selected solidified module, registered into the Skill 4 cell. */
export function loadSkill3HandoffRecord(archetypeId: string): Skill4ModuleRecord | null {
  const entry = readFinalSelection().selections.find((item) => item.archetypeId === archetypeId);
  if (!entry) return null;
  const stored = readSolidifiedMesh(entry.archetypeId, entry.candidateId, entry.continuationId);
  if (!stored || stored.moduleId !== entry.moduleId || stored.geometry.encoding !== "isomesh-base64") return null;
  const registration = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  const registeredGeometry = registerMeshIntoCell(decodeSolidifiedMesh(stored.geometry), registration);
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
}

/** The 15 selected solidified modules, each with a registered copy in the Skill 4 cell. */
export function loadSkill3HandoffRecords(): Skill4ModuleRecord[] {
  return readFinalSelection().selections.map((entry) => {
    const record = loadSkill3HandoffRecord(entry.archetypeId);
    if (!record) throw new Error(`repaired solidified mesh missing for ${entry.moduleId}`);
    return record;
  });
}
