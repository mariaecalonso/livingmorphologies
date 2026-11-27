import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { selectedClusterAssembly } from "@/lib/skill5/cluster-assemblies";
import {
  generatePlacementNetworkVoid,
  NETWORK_LINE_OFFSET_FT,
  PLACEMENT_VOID_HUG_GAP_FT,
  PLACEMENT_VOID_MORPHOLOGY_REACH_FT,
  PLACEMENT_VOID_SOLID_CLEARANCE_CELLS,
} from "@/lib/skill5/placement-network-void";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const CACHE_DIR = path.join(process.cwd(), "data", "skill5", ".void-cache");

/** In-process single-flight so remounts share one generate instead of stacking 2.5min jobs. */
const inflight = new Map<string, Promise<Record<string, unknown>>>();

/**
 * Cluster Integration → Void.
 * Reads the selected Cluster Assembly and its Site Strategy network.
 * Does not write catalogs or change Placement.
 */
export async function POST() {
  try {
    const assembly = selectedClusterAssembly();
    if (!assembly) {
      return NextResponse.json({ error: "No selected cluster assembly. Save one from Cluster Placement." }, { status: 400 });
    }
    const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
      iterations?: { id?: string; branches?: { x0: number; z0: number; x1: number; z1: number; conductivity?: number }[] }[];
    };
    const iteration = raw.iterations?.find((item) => item.id === assembly.selectedNetworkId);
    const branches = (iteration?.branches ?? []).map((branch) => ({
      x0: branch.x0,
      z0: branch.z0,
      x1: branch.x1,
      z1: branch.z1,
      conductivity: typeof branch.conductivity === "number" ? branch.conductivity : 1,
    }));
    if (branches.length === 0) {
      return NextResponse.json({ error: `Network ${assembly.selectedNetworkId} has no branches.` }, { status: 400 });
    }

    const cacheKey = createHash("sha1")
      .update(
        [
          assembly.assemblyId,
          assembly.selectedNetworkId,
          String(assembly.occupancy.length),
          String(NETWORK_LINE_OFFSET_FT),
          String(PLACEMENT_VOID_MORPHOLOGY_REACH_FT),
          String(PLACEMENT_VOID_HUG_GAP_FT),
          String(PLACEMENT_VOID_SOLID_CLEARANCE_CELLS),
          "shell-wall-v39",
        ].join("|"),
      )
      .digest("hex");
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);

    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8")) as Record<string, unknown>;
      if (cached?.voidMesh && cached.assemblyId === assembly.assemblyId) {
        return NextResponse.json(cached);
      }
    } catch {
      // miss
    }

    let pending = inflight.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        const report = generatePlacementNetworkVoid({ assembly, branches });
        const body = {
          contract: report.contract,
          assemblyId: report.assemblyId,
          selectedNetworkId: report.selectedNetworkId,
          solidCount: report.solidCount,
          pocketCount: report.pocketCount,
          offsetFt: report.offsetFt,
          cell: report.cell,
          shelter: report.shelter,
          minimumGap: report.minimumGap,
          voidCubicFeet: report.voidCubicFeet,
          occupiedCubicFeet: report.occupiedCubicFeet,
          voidComponents: report.voidComponents,
          minSolidGapFt: report.minSolidGapFt,
          processing: report.processing,
          elapsedMs: report.elapsedMs,
          voidMesh: pack(report.voidMesh),
        };
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(cachePath, JSON.stringify(body), "utf8");
        return body;
      })().finally(() => {
        inflight.delete(cacheKey);
      });
      inflight.set(cacheKey, pending);
    }

    const body = await pending;
    return NextResponse.json(body);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Placement void failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function pack(mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array; triangles: number }) {
  const bytes = (view: ArrayBufferView) => Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("base64");
  return {
    triangles: mesh.triangles,
    positions: bytes(mesh.positions),
    normals: bytes(mesh.normals),
    indices: bytes(mesh.indices),
  };
}
