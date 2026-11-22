import { boundsOf } from "./edits";
import type { EncodedMesh, InterpretationElement, InterpretationModel } from "./types";

export type LiveElement = {
  id: string;
  kind: InterpretationElement["kind"];
  label: string;
  editable: boolean;
  cutsMass: boolean;
  positions: Float32Array;
  indices: Uint32Array;
  origin: [number, number, number];
  elevation: number | null;
  size: [number, number, number];
};

function bytes(value: string) {
  const raw = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  return raw;
}

export function decodeMesh(encoded: EncodedMesh): { positions: Float32Array; indices: Uint32Array } {
  const positions = bytes(encoded.positions);
  const indices = bytes(encoded.indices);
  return {
    positions: new Float32Array(positions.buffer, positions.byteOffset, positions.byteLength / 4),
    indices: new Uint32Array(indices.buffer, indices.byteOffset, indices.byteLength / 4),
  };
}

export function liveElements(model: InterpretationModel): LiveElement[] {
  return model.elements.map((item) => {
    const mesh = decodeMesh(item.mesh);
    const fitted = boundsOf(mesh.positions);
    return {
      id: item.id,
      kind: item.kind,
      label: item.label,
      editable: item.editable,
      cutsMass: item.cutsMass,
      positions: mesh.positions,
      indices: mesh.indices,
      origin: fitted.origin,
      elevation: item.kind === "floor" ? fitted.max[2] : null,
      size: fitted.size,
    };
  });
}
