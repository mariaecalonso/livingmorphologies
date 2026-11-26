import { buildNetworkDomain } from "@/lib/skill5/network-void-domain";
import { generateNetworkConstrainedVoid } from "@/lib/skill5/network-constrained-void";
import { loadPositionedCluster } from "@/lib/skill5/network-void-assembly";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SOURCE = "provisional-network-void-study";

/**
 * Provisional study. Does not read Site Strategy, Designer Zoning, or a selected assembly,
 * and does not write the frozen catalog.
 */
export async function POST(request: Request) {
  const body = await request.json() as { cell?: number; shelter?: number; minimumGap?: number; continuous?: boolean };
  const cell = Number(body.cell);
  const shelter = Number(body.shelter);
  const minimumGap = Number(body.minimumGap);
  if (!(cell > 0) || !(shelter > 0) || !(minimumGap > 0)) {
    return NextResponse.json({ error: "cell, shelter, and minimum gap must be supplied in feet" }, { status: 400 });
  }
  const started = Date.now();
  const domain = buildNetworkDomain({
    source: SOURCE,
    provisional: true,
    zones: [{
      id: "provisional-zone",
      plan: [{ x: -16, z: -14 }, { x: 86, z: -14 }, { x: 86, z: 14 }, { x: -16, z: 14 }],
      baseFt: -12,
      heightFt: 56,
    }],
    corridors: [
      {
        id: "width-not-supplied",
        from: { x: 0, z: 0 },
        to: { x: 40, z: 0 },
        baseFt: 0,
        heightFt: 12,
      },
      {
        id: "provisional-corridor",
        from: { x: 8, z: 0 },
        to: { x: 22, z: 0 },
        widthFt: 16,
        baseFt: -12,
        heightFt: 56,
      },
    ],
  });
  if (!domain.domain) return NextResponse.json({ error: "provisional domain could not be built", missing: domain.missing }, { status: 400 });
  const west = loadPositionedCluster("workspace-workspace", "workspace-workspace:0", { x: 0, y: 0, z: 0, rotationY: 0 });
  const east = loadPositionedCluster("workspace-workspace", "workspace-workspace:0", { x: 28, y: 0, z: 0, rotationY: 0 });
  const result = generateNetworkConstrainedVoid({
    solids: [west, east],
    domain: domain.domain,
    clearance: { shelter, minimumGap },
    minimumComponent: cell * cell * cell * 4,
    cell,
    continuous: Boolean(body.continuous),
  });
  return NextResponse.json({
    provisional: true,
    catalogWritten: false,
    missing: domain.missing,
    parameters: { cell, shelter, minimumGap },
    shrinkWrapTriangles: west.shrinkWrapTriangles + east.shrinkWrapTriangles,
    occupied: result.occupiedCount,
    occupiedCubicFeet: Math.round(result.occupiedCubicFeet),
    void: result.voidCount,
    voidCubicFeet: Math.round(result.voidCubicFeet),
    unclaimed: result.unclaimedDomain,
    components: result.voidComponents,
    leaked: result.leaked,
    solidConflicts: result.solidConflicts,
    processing: result.processing,
    voxelTriangles: result.boundary.triangles,
    continuousTriangles: result.continuous?.triangles ?? 0,
    continuousNote: result.continuousNote,
    elapsedMs: Date.now() - started,
    voxel: pack(result.boundary),
    continuousMesh: result.continuous ? pack(result.continuous) : null,
  });
}

function pack(mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array; triangles: number }) {
  const bytes = (view: ArrayBufferView) => Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("base64");
  return { triangles: mesh.triangles, positions: bytes(mesh.positions), normals: bytes(mesh.normals), indices: bytes(mesh.indices) };
}
