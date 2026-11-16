import type { IsoMesh } from "@/lib/scan/isomesh";
import type { ScaleFigure } from "@/lib/demo-workflow/human-scale-reading";

/**
 * One architectural scale figure, 6 ft to the top of the head, feet at y = 0.
 * Copies are placed on the supports the reading found. The mesh is not a person scan.
 */

type Builder = {
  positions: number[];
  normals: number[];
  indices: number[];
};

function addBox(builder: Builder, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const faces: Array<{ normal: [number, number, number]; corners: Array<[number, number, number]> }> = [
    { normal: [1, 0, 0], corners: [[hx, -hy, -hz], [hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
    { normal: [-1, 0, 0], corners: [[-hx, -hy, hz], [-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz]] },
    { normal: [0, 1, 0], corners: [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]] },
    { normal: [0, -1, 0], corners: [[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz]] },
    { normal: [0, 0, 1], corners: [[-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz], [hx, -hy, hz]] },
    { normal: [0, 0, -1], corners: [[hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
  ];
  for (const face of faces) {
    const base = builder.positions.length / 3;
    for (const [x, y, z] of face.corners) {
      builder.positions.push(cx + x, cy + y, cz + z);
      builder.normals.push(...face.normal);
    }
    builder.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function addSphere(builder: Builder, cx: number, cy: number, cz: number, radius: number) {
  const rings = 6;
  const seg = 8;
  const base = builder.positions.length / 3;
  for (let i = 0; i <= rings; i += 1) {
    const phi = (i / rings) * Math.PI;
    for (let j = 0; j <= seg; j += 1) {
      const theta = (j / seg) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      builder.positions.push(cx + nx * radius, cy + ny * radius, cz + nz * radius);
      builder.normals.push(nx, ny, nz);
    }
  }
  const stride = seg + 1;
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < seg; j += 1) {
      const a = base + i * stride + j;
      const c = a + stride;
      builder.indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
}

/** Feet at y = 0. The crown is at 6 ft. A small shift faces the figure toward the camera. */
function addBody(builder: Builder, x: number, floor: number, z: number) {
  const y = floor;
  const fx = x + 0.28;
  const fz = z - 0.28;
  addBox(builder, fx - 0.18, y + 1.55, fz, 0.36, 3.1, 0.32);
  addBox(builder, fx + 0.18, y + 1.55, fz, 0.36, 3.1, 0.32);
  addBox(builder, fx, y + 3.2, fz, 0.92, 0.5, 0.46);
  addBox(builder, fx, y + 4.2, fz, 1.2, 1.5, 0.52);
  addBox(builder, fx - 0.72, y + 4.05, fz, 0.24, 1.25, 0.24);
  addBox(builder, fx + 0.72, y + 4.05, fz, 0.24, 1.25, 0.24);
  addBox(builder, fx, y + 5.08, fz, 0.32, 0.3, 0.3);
  addSphere(builder, fx, y + 5.55, fz, 0.48);
}

export function scaleFigureMesh(figures: readonly ScaleFigure[]): IsoMesh {
  const builder: Builder = { positions: [], normals: [], indices: [] };
  for (const figure of figures) addBody(builder, figure.x, figure.floor, figure.z);
  return {
    positions: Float32Array.from(builder.positions),
    normals: Float32Array.from(builder.normals),
    indices: Uint32Array.from(builder.indices),
    triangles: builder.indices.length / 3,
  };
}
