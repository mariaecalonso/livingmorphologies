import type { IsoMesh } from "../scan/isomesh";
import type { ErrorStatus, Manifold, ManifoldToplevel, Mesh } from "manifold-3d/manifold";

/**
 * IsoMesh adapter for manifold-3d 3.5.4.
 * The kernel is initialized once. Input buffers are read and never written.
 * Boolean results are new IsoMeshes. Assembly plans are not executed here.
 */
export const BOOLEAN_ADAPTER_SETTINGS = {
  version: "skill4-boolean-adapter-v1",
  kernel: "manifold-3d",
  kernelVersion: "3.5.4",
} as const;

export type BooleanAdapterStatus = "ready" | "invalid-input" | "non-manifold" | "boolean-failed";

export type BooleanMesh = {
  readonly kernel: "manifold-3d";
  release(): void;
};

export type BooleanMeshResult = {
  status: BooleanAdapterStatus;
  mesh: BooleanMesh | null;
  reason: string;
};

export type BooleanIsoResult = {
  status: BooleanAdapterStatus;
  mesh: IsoMesh | null;
  reason: string;
  kernelStatus: ErrorStatus | null;
};

type HeldMesh = BooleanMesh & { manifold: Manifold };

let kernel: Promise<ManifoldToplevel> | null = null;

export function loadBooleanKernel(): Promise<ManifoldToplevel> {
  kernel ??= import("manifold-3d/manifold").then(async (mod) => {
    const wasm = await mod.default();
    wasm.setup();
    return wasm;
  });
  return kernel;
}

export async function isoMeshToBooleanMesh(mesh: IsoMesh): Promise<BooleanMeshResult> {
  const reason = invalidMeshReason(mesh);
  if (reason) return { status: "invalid-input", mesh: null, reason };
  const wasm = await loadBooleanKernel();
  try {
    const manifold = new wasm.Manifold(new wasm.Mesh({
      numProp: 3,
      vertProperties: Float32Array.from(mesh.positions),
      triVerts: Uint32Array.from(mesh.indices),
    }));
    const status = manifold.status();
    if (status !== "NoError") {
      manifold.delete();
      return { status: statusFor(status), mesh: null, reason: status };
    }
    const held: HeldMesh = {
      kernel: "manifold-3d",
      manifold,
      release() {
        manifold.delete();
      },
    };
    return { status: "ready", mesh: held, reason: "" };
  } catch (error) {
    return { status: statusFor(errorCode(error)), mesh: null, reason: errorCode(error) };
  }
}

export async function booleanMeshToIsoMesh(mesh: BooleanMesh): Promise<BooleanIsoResult> {
  const held = asHeld(mesh);
  if (!held) return { status: "invalid-input", mesh: null, reason: "foreign-boolean-mesh", kernelStatus: null };
  const status = held.manifold.status();
  if (status !== "NoError" || held.manifold.isEmpty()) {
    return { status: status === "NoError" ? "boolean-failed" : statusFor(status), mesh: null, reason: status, kernelStatus: status };
  }
  const extracted = held.manifold.getMesh();
  const iso = meshToIso(extracted);
  if (!iso) return { status: "boolean-failed", mesh: null, reason: "empty-output", kernelStatus: status };
  return { status: "ready", mesh: iso, reason: "", kernelStatus: status };
}

export async function booleanDifference(source: IsoMesh, tool: IsoMesh): Promise<BooleanIsoResult> {
  return operate(source, tool, "difference");
}

export async function booleanUnion(source: IsoMesh, tool: IsoMesh): Promise<BooleanIsoResult> {
  return operate(source, tool, "union");
}

async function operate(source: IsoMesh, tool: IsoMesh, operation: "difference" | "union"): Promise<BooleanIsoResult> {
  const left = await isoMeshToBooleanMesh(source);
  if (!left.mesh) return { status: left.status, mesh: null, reason: left.reason, kernelStatus: null };
  const right = await isoMeshToBooleanMesh(tool);
  if (!right.mesh) {
    left.mesh.release();
    return { status: right.status, mesh: null, reason: right.reason, kernelStatus: null };
  }
  const a = asHeld(left.mesh);
  const b = asHeld(right.mesh);
  if (!a || !b) {
    left.mesh.release();
    right.mesh.release();
    return { status: "invalid-input", mesh: null, reason: "foreign-boolean-mesh", kernelStatus: null };
  }
  try {
    const combined = operation === "difference" ? a.manifold.subtract(b.manifold) : a.manifold.add(b.manifold);
    const status = combined.status();
    if (status !== "NoError" || combined.isEmpty()) {
      combined.delete();
      return { status: status === "NoError" ? "boolean-failed" : statusFor(status), mesh: null, reason: status === "NoError" ? "empty-boolean" : status, kernelStatus: status };
    }
    const iso = meshToIso(combined.getMesh());
    combined.delete();
    if (!iso) return { status: "boolean-failed", mesh: null, reason: "empty-output", kernelStatus: status };
    return { status: "ready", mesh: iso, reason: "", kernelStatus: status };
  } catch (error) {
    return { status: statusFor(errorCode(error)), mesh: null, reason: errorCode(error), kernelStatus: null };
  } finally {
    a.release();
    b.release();
  }
}

function meshToIso(mesh: Mesh): IsoMesh | null {
  const stride = mesh.numProp;
  const vertexCount = mesh.vertProperties.length / stride;
  if (stride < 3 || !Number.isInteger(vertexCount) || vertexCount < 1 || mesh.triVerts.length < 3) return null;
  const positions = new Float32Array(vertexCount * 3);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const source = vertex * stride;
    const target = vertex * 3;
    positions[target] = mesh.vertProperties[source];
    positions[target + 1] = mesh.vertProperties[source + 1];
    positions[target + 2] = mesh.vertProperties[source + 2];
  }
  const indices = Uint32Array.from(mesh.triVerts);
  return {
    positions,
    normals: recomputeNormals(positions, indices),
    indices,
    triangles: indices.length / 3,
  };
}

function recomputeNormals(positions: Float32Array, indices: Uint32Array) {
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const offset of [a, b, c]) {
      normals[offset] += nx;
      normals[offset + 1] += ny;
      normals[offset + 2] += nz;
    }
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const span = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]);
    if (span > 1e-8) {
      normals[offset] /= span;
      normals[offset + 1] /= span;
      normals[offset + 2] /= span;
    } else {
      normals[offset + 1] = 1;
    }
  }
  return normals;
}

function invalidMeshReason(mesh: IsoMesh) {
  if (mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) return "empty-or-bad-positions";
  if (mesh.normals.length !== mesh.positions.length) return "normal-length";
  if (mesh.indices.length < 3 || mesh.indices.length % 3 !== 0 || mesh.triangles !== mesh.indices.length / 3) return "bad-triangles";
  const vertexCount = mesh.positions.length / 3;
  for (let index = 0; index < mesh.positions.length; index += 1) {
    if (!Number.isFinite(mesh.positions[index])) return "non-finite-position";
  }
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const corners = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    if (new Set(corners).size !== 3) return "degenerate-triangle";
    if (corners.some((corner) => corner < 0 || corner >= vertexCount)) return "index-out-of-range";
  }
  return "";
}

function statusFor(code: string): BooleanAdapterStatus {
  if (code === "NotManifold") return "non-manifold";
  if (code === "NonFiniteVertex" || code === "VertexOutOfBounds" || code === "MissingPositionProperties" || code === "PropertiesWrongLength") return "invalid-input";
  return "boolean-failed";
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) return String(error.code);
  return "boolean-failed";
}

function asHeld(mesh: BooleanMesh): HeldMesh | null {
  return "manifold" in mesh ? mesh as HeldMesh : null;
}
