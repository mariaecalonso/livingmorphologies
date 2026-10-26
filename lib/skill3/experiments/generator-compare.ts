import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { encodeModuleMesh, type EncodedModuleMesh } from "@/lib/skill3/experiments/carved-mass-registry";
import { buildXytMacroCase } from "@/lib/skill3/experiments/xyt-saddle-macro";
import { readFinalSelection } from "@/lib/skill3/final-selection";
import { loadVerifiedContinuations } from "@/lib/skill3/semantic-handoff";
import { decodeSolidifiedMesh } from "@/lib/skill3/solidified-mesh";

/**
 * Temporary read for the debug comparison.
 * Loads the stored Open file and runs the current macro path in memory.
 * Does not write a mesh, a selection, or a continuation.
 */

const GENERATOR = "buildXytMacroCase · retained mass · smooth body envelope";
const STORED = "criteria-hybrid-v1";

export type CompareBounds = {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
};

export type CompareMesh = {
  source: string;
  continuationId: string;
  triangles: number;
  bounds: CompareBounds;
  geometry: EncodedModuleMesh;
};

export type GeneratorCompare = {
  archetypeId: string;
  candidateId: number;
  continuationId: string;
  stored: CompareMesh;
  generated: CompareMesh;
};

const cache = new Map<string, GeneratorCompare>();

function boundsOf(mesh: IsoMesh): CompareBounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const x = mesh.positions[index];
    const y = mesh.positions[index + 1];
    const z = mesh.positions[index + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const min: [number, number, number] = [round(minX), round(minY), round(minZ)];
  const max: [number, number, number] = [round(maxX), round(maxY), round(maxZ)];
  return { min, max, size: [round(max[0] - min[0]), round(max[1] - min[1]), round(max[2] - min[2])] };
}

function readStoredOpen(archetypeId: string, candidateId: number, continuationId: string): CompareMesh {
  const file = path.join(process.cwd(), "data", "experiments", "criteria-hybrid", `${archetypeId}-${candidateId}`, `${continuationId}.json`);
  if (!existsSync(file)) throw new Error(`No stored Open mesh for ${continuationId}.`);
  const record = JSON.parse(readFileSync(file, "utf8")) as { contract?: string; continuationId?: string; geometry?: EncodedModuleMesh };
  if (record.contract !== STORED || record.continuationId !== continuationId || !record.geometry) {
    throw new Error(`The stored Open file for ${continuationId} is not ${STORED}.`);
  }
  const mesh = decodeSolidifiedMesh(record.geometry);
  return {
    source: STORED,
    continuationId,
    triangles: record.geometry.triangles || mesh.indices.length / 3,
    bounds: boundsOf(mesh),
    geometry: record.geometry,
  };
}

/** One selected continuation. The current carved-mass call, without the dataset write. */
export function compareCurrentGenerator(archetypeId: string, candidateId: number, continuationId: string): GeneratorCompare {
  const key = `${archetypeId}:${candidateId}:${continuationId}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const selection = readFinalSelection().selections.find((item) => item.archetypeId === archetypeId && item.candidateId === candidateId);
  if (!selection) throw new Error(`No selected continuation is stored for ${archetypeId}.`);
  if (selection.continuationId !== continuationId) {
    throw new Error(`${continuationId} is not the selected continuation for ${archetypeId}.`);
  }
  const set = loadVerifiedContinuations({ archetypeId, candidateId });
  const continuation = set.continuations.find((item) => item.id === continuationId);
  if (!continuation) {
    throw new Error(`The current generator has no ${continuationId} continuation. It builds N01–N24 from the verified Z0.`);
  }
  const stored = readStoredOpen(archetypeId, candidateId, continuationId);
  const built = buildXytMacroCase(continuation, true, false, false, true);
  const generatedMesh = built.mesh;
  const generated: CompareMesh = {
    source: GENERATOR,
    continuationId,
    triangles: generatedMesh.triangles || generatedMesh.indices.length / 3,
    bounds: boundsOf(generatedMesh),
    geometry: encodeModuleMesh(generatedMesh),
  };
  const result = { archetypeId, candidateId, continuationId, stored, generated };
  cache.set(key, result);
  return result;
}
