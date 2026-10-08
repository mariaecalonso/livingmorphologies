import type { IsoMesh } from "../scan/isomesh";
import type { FaceFrame, Vec3 } from "./contract";

/**
 * Display-only outline of one registration face.
 * It uses the face frame already stored on the module. It does not resample the mesh.
 */
export function faceFrameOutline(frame: FaceFrame): IsoMesh {
  const halfU = frame.extent.u / 2;
  const halfV = frame.extent.v / 2;
  const lift = 0.025;
  const band = Math.min(halfU, halfV) * 0.08;
  const point = (u: number, v: number, outward: number): Vec3 => ({
    x: frame.origin.x + frame.u.x * u + frame.v.x * v + frame.normal.x * outward,
    y: frame.origin.y + frame.u.y * u + frame.v.y * v + frame.normal.y * outward,
    z: frame.origin.z + frame.u.z * u + frame.v.z * v + frame.normal.z * outward,
  });
  const ring = (inset: number, outward: number) => ([
    point(halfU - inset, halfV - inset, outward),
    point(-(halfU - inset), halfV - inset, outward),
    point(-(halfU - inset), -(halfV - inset), outward),
    point(halfU - inset, -(halfV - inset), outward),
  ]);
  const outer = ring(0, lift);
  const inner = ring(band, lift);
  const positions: number[] = [];
  const push = (value: Vec3) => positions.push(value.x, value.y, value.z);
  for (const corner of outer) push(corner);
  for (const corner of inner) push(corner);
  const indices: number[] = [];
  for (let edge = 0; edge < 4; edge += 1) {
    const next = (edge + 1) % 4;
    const a = edge;
    const b = next;
    const c = 4 + next;
    const d = 4 + edge;
    indices.push(a, b, c, a, c, d);
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(positions.map((_, index) => {
      const axis = index % 3;
      return axis === 0 ? frame.normal.x : axis === 1 ? frame.normal.y : frame.normal.z;
    })),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}
