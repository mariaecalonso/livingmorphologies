import type { IsoMesh } from "@/lib/scan/isomesh";
import { CARVED_MASS_MODULE_CONTRACT, CARVED_MASS_MODULE_SIZE, carvedMassFolder, carvedMassModuleId, encodeModuleMesh, writeArchetypeModules, type CarvedMassModuleRecord } from "@/lib/skill3/experiments/carved-mass-registry";
import { carvedMassSource, type CarvedMassSource } from "@/lib/skill3/experiments/carved-mass-sources";
import { buildXytMacroCase, MACRO_BLUR, macroSignatureDifference } from "@/lib/skill3/experiments/xyt-saddle-macro";
import { loadVerifiedContinuations } from "@/lib/skill3/semantic-handoff";

/**
 * Full experimental dataset. One verified Z0, twenty-four continuations,
 * one shared blur. Flagged meshes are kept and not repaired.
 */

const LOW_SOLID = 0.08;
const MIN_OPENING = 15000;
const MIN_TRIANGLES = 800;
const HALF = CARVED_MASS_MODULE_SIZE / 2;
// Surface nets can sit a fraction of one field cell outside the module box.
// A full cell past the box is an invalid module. One cell is 20/72.
const BOUNDS_BLEED = CARVED_MASS_MODULE_SIZE / 72;
const PIPELINE = "verified-z0/continuation/xyt-stack/macro-xyt-field/one-saddle/retained-mass/smooth-body-envelope" as const;

export type ArchetypeReport = {
  category: CarvedMassSource["category"];
  categoryLabel: CarvedMassSource["categoryLabel"];
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  z0Iteration: number;
  parentChecksum: string;
  elapsedMs: number;
  moduleCount: number;
  flagged: { continuationId: string; flags: string[] }[];
  solidMin: number;
  solidMax: number;
  bodyFailures: string[];
  nearCloneCount: number;
  medianNearest: number;
};

function centroidOf(mesh: IsoMesh): [number, number, number] {
  const count = mesh.positions.length / 3;
  if (!count) return [0, 0, 0];
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < count; index += 1) {
    x += mesh.positions[index * 3];
    y += mesh.positions[index * 3 + 1];
    z += mesh.positions[index * 3 + 2];
  }
  return [x / count, y / count, z / count];
}

function boundsOf(mesh: IsoMesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let valid = mesh.positions.length >= 9;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const x = mesh.positions[index];
    const y = mesh.positions[index + 1];
    const z = mesh.positions[index + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) valid = false;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  if (minX < -HALF - BOUNDS_BLEED || minY < -HALF - BOUNDS_BLEED || minZ < -HALF - BOUNDS_BLEED) valid = false;
  if (maxX > HALF + BOUNDS_BLEED || maxY > HALF + BOUNDS_BLEED || maxZ > HALF + BOUNDS_BLEED) valid = false;
  return {
    min: [minX, minY, minZ] as [number, number, number],
    max: [maxX, maxY, maxZ] as [number, number, number],
    valid,
  };
}

function flagsFor(components: number, solid: number, opening: number, triangles: number, boundsValid: boolean) {
  const flags: string[] = [];
  if (components > 1) flags.push("multiple-bodies");
  if (components === 0 || triangles < MIN_TRIANGLES) flags.push("degenerate");
  if (solid < LOW_SOLID) flags.push("low-solid");
  if (opening < MIN_OPENING) flags.push("opening-lost");
  if (!boundsValid) flags.push("invalid-bounds");
  return flags;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function generateCarvedMassArchetype(archetypeId: string, candidateId: number): ArchetypeReport {
  const started = Date.now();
  const source = carvedMassSource(archetypeId, candidateId);
  const set = loadVerifiedContinuations({ archetypeId, candidateId });
  if (set.origin !== "handoff") throw new Error(`${archetypeId} ${candidateId} did not open from a verified handoff`);
  const continuations = [...set.continuations].sort((left, right) => left.index - right.index);
  if (continuations.length !== 24) throw new Error(`${archetypeId} expected 24 continuations, received ${continuations.length}`);
  const built = continuations.map((continuation) => {
    try {
      const envelope = buildXytMacroCase(continuation, true, false, false, true);
      const bounds = boundsOf(envelope.mesh);
      return {
        continuation,
        envelope,
        centroid: centroidOf(envelope.mesh),
        bounds,
        error: "",
      };
    } catch (caught) {
      return {
        continuation,
        envelope: null,
        centroid: [0, 0, 0] as [number, number, number],
        bounds: { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number], valid: false },
        error: caught instanceof Error ? caught.message : "mesh failure",
      };
    }
  });
  const reference = built.find((item) => item.continuation.id === "N10") ?? built[0];
  const records: CarvedMassModuleRecord[] = built.map((item) => {
    let nearestId = "";
    let nearestDifference = 0;
    if (item.envelope) {
      nearestDifference = Number.POSITIVE_INFINITY;
      for (const other of built) {
        if (!other.envelope || other.continuation.id === item.continuation.id) continue;
        const difference = macroSignatureDifference(item.envelope.signature, other.envelope.signature);
        if (difference < nearestDifference) {
          nearestDifference = difference;
          nearestId = other.continuation.id;
        }
      }
      if (!Number.isFinite(nearestDifference)) nearestDifference = 0;
    }
    const metrics = item.envelope?.metrics;
    const solid = metrics?.solidFraction ?? 0;
    const components = metrics?.connectedComponents ?? 0;
    const opening = metrics?.openingVolume ?? 0;
    const triangles = metrics?.triangles ?? 0;
    const wall: [number, number, number] = [
      metrics?.minWallThickness ?? 0,
      metrics?.medianWallThickness ?? 0,
      metrics?.maxWallThickness ?? 0,
    ];
    const flags = item.envelope
      ? flagsFor(components, solid, opening, triangles, item.bounds.valid)
      : ["mesh-failure"];
    return {
      contract: CARVED_MASS_MODULE_CONTRACT,
      moduleId: carvedMassModuleId(source.archetypeId, source.candidateId, item.continuation.id),
      revision: 1,
      moduleSize: CARVED_MASS_MODULE_SIZE,
      category: source.category,
      archetypeId: source.archetypeId,
      archetypeName: source.archetypeName,
      candidateId: source.candidateId,
      continuationId: item.continuation.id,
      continuationSeed: item.continuation.continuationSeed,
      z0Iteration: set.z0Iteration,
      parentChecksum: set.parentChecksum,
      blur: MACRO_BLUR,
      registration: {
        origin: { x: 0, y: 0, z: 0 },
        min: { x: -HALF, y: -HALF, z: -HALF },
        max: { x: HALF, y: HALF, z: HALF },
      },
      bounds: item.envelope ? { min: item.bounds.min, max: item.bounds.max } : { min: [0, 0, 0], max: [0, 0, 0] },
      flags,
      metrics: {
        solidFraction: solid,
        components,
        openingSize: opening,
        centroid: item.centroid,
        wall,
        triangles,
        nearestId,
        nearestDifference,
        silhouetteVsReference: item.envelope && reference?.envelope
          ? macroSignatureDifference(item.envelope.signature, reference.envelope.signature)
          : 0,
      },
      provenance: {
        origin: "handoff",
        pipeline: PIPELINE,
        blur: MACRO_BLUR,
        z0Iteration: set.z0Iteration,
        parentChecksum: set.parentChecksum,
        continuationSeed: item.continuation.continuationSeed,
        moduleSize: CARVED_MASS_MODULE_SIZE,
      },
      geometry: item.envelope ? encodeModuleMesh(item.envelope.mesh) : null,
    };
  });
  const folder = carvedMassFolder(source.archetypeId, source.candidateId);
  const listed = records.map((record) => ({
    moduleId: record.moduleId,
    category: record.category,
    archetypeId: record.archetypeId,
    archetypeName: record.archetypeName,
    candidateId: record.candidateId,
    continuationId: record.continuationId,
    continuationSeed: record.continuationSeed,
    z0Iteration: record.z0Iteration,
    parentChecksum: record.parentChecksum,
    flags: record.flags,
    solidFraction: record.metrics.solidFraction,
    components: record.metrics.components,
    openingSize: record.metrics.openingSize,
    wall: record.metrics.wall,
    nearestId: record.metrics.nearestId,
    nearestDifference: record.metrics.nearestDifference,
    silhouetteVsReference: record.metrics.silhouetteVsReference,
    file: `${folder}/${record.continuationId}.json`,
  }));
  writeArchetypeModules(folder, records, listed);
  const solids = records.map((record) => record.metrics.solidFraction);
  const nearest = records.map((record) => record.metrics.nearestDifference).filter((value) => value > 0);
  return {
    category: source.category,
    categoryLabel: source.categoryLabel,
    archetypeId: source.archetypeId,
    archetypeName: source.archetypeName,
    candidateId: source.candidateId,
    z0Iteration: set.z0Iteration,
    parentChecksum: set.parentChecksum,
    elapsedMs: Date.now() - started,
    moduleCount: records.length,
    flagged: records.filter((record) => record.flags.length > 0).map((record) => ({
      continuationId: record.continuationId,
      flags: record.flags,
    })),
    solidMin: Math.min(...solids),
    solidMax: Math.max(...solids),
    bodyFailures: records.filter((record) => record.metrics.components !== 1).map((record) => record.continuationId),
    nearCloneCount: nearest.filter((value) => value < 0.08).length,
    medianNearest: median(nearest),
  };
}
