import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { MODULE_SIZE_X } from "@/lib/skill3/envelope";

/**
 * Experimental carved-mass modules. One folder per verified Z0, one file per
 * continuation. The tiling loader reads these files directly.
 * They are not production Skill 3 selections.
 */

export const CARVED_MASS_MODULE_CONTRACT = "carved-mass-module-v1" as const;
export const CARVED_MASS_MANIFEST_CONTRACT = "carved-mass-manifest-v1" as const;
export const CARVED_MASS_MODULE_SIZE = MODULE_SIZE_X;

const ROOT = path.join(process.cwd(), "data", "experiments", "carved-mass");
const MANIFEST_FILE = path.join(ROOT, "manifest.json");

export type EncodedModuleMesh = {
  encoding: "isomesh-base64";
  positions: string;
  normals: string;
  indices: string;
  triangles: number;
};

export type CarvedMassModuleRecord = {
  contract: typeof CARVED_MASS_MODULE_CONTRACT;
  moduleId: string;
  revision: 1;
  moduleSize: typeof CARVED_MASS_MODULE_SIZE;
  category: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  continuationId: string;
  continuationSeed: number;
  z0Iteration: number;
  parentChecksum: string;
  blur: number;
  registration: {
    origin: { x: 0; y: 0; z: 0 };
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  flags: string[];
  metrics: {
    solidFraction: number;
    components: number;
    openingSize: number;
    centroid: [number, number, number];
    wall: [number, number, number];
    triangles: number;
    nearestId: string;
    nearestDifference: number;
    silhouetteVsReference: number;
  };
  provenance: {
    origin: "handoff";
    pipeline: "verified-z0/continuation/xyt-stack/macro-xyt-field/one-saddle/retained-mass/smooth-body-envelope";
    blur: number;
    z0Iteration: number;
    parentChecksum: string;
    continuationSeed: number;
    moduleSize: typeof CARVED_MASS_MODULE_SIZE;
  };
  geometry: EncodedModuleMesh | null;
};

export type CarvedMassManifestModule = {
  moduleId: string;
  category: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  continuationId: string;
  continuationSeed: number;
  z0Iteration: number;
  parentChecksum: string;
  flags: string[];
  solidFraction: number;
  components: number;
  openingSize: number;
  wall: [number, number, number];
  nearestId: string;
  nearestDifference: number;
  silhouetteVsReference: number;
  file: string;
};

export type CarvedMassManifest = {
  contract: typeof CARVED_MASS_MANIFEST_CONTRACT;
  blur: number;
  moduleSize: typeof CARVED_MASS_MODULE_SIZE;
  modules: CarvedMassManifestModule[];
};

export function carvedMassFolder(archetypeId: string, candidateId: number) {
  return `${archetypeId}-${candidateId}`;
}

export function carvedMassModuleId(archetypeId: string, candidateId: number, continuationId: string) {
  return `carved-mass:${archetypeId}:${candidateId}:${continuationId}`;
}

export function encodeModuleMesh(mesh: IsoMesh): EncodedModuleMesh {
  return {
    encoding: "isomesh-base64",
    positions: Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength).toString("base64"),
    normals: Buffer.from(mesh.normals.buffer, mesh.normals.byteOffset, mesh.normals.byteLength).toString("base64"),
    indices: Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength).toString("base64"),
    triangles: mesh.triangles,
  };
}

export function decodeModuleMesh(geometry: EncodedModuleMesh): IsoMesh {
  const positions = float32From(Buffer.from(geometry.positions, "base64"));
  const normals = float32From(Buffer.from(geometry.normals, "base64"));
  const indices = uint32From(Buffer.from(geometry.indices, "base64"));
  return { positions, normals, indices, triangles: geometry.triangles };
}

function float32From(bytes: Buffer) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
}

function uint32From(bytes: Buffer) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Uint32Array(copy.buffer);
}

export function readCarvedMassManifest(): CarvedMassManifest {
  return JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as CarvedMassManifest;
}

/** Manifest rows with no flags. Does not load meshes. This is the default tiling set. */
export function listHealthyCarvedMassModules(): CarvedMassManifestModule[] {
  return readCarvedMassManifest().modules.filter((item) => item.flags.length === 0);
}

export function writeArchetypeModules(folder: string, records: readonly CarvedMassModuleRecord[], listed: readonly CarvedMassManifestModule[]) {
  const directory = path.join(ROOT, folder);
  mkdirSync(directory, { recursive: true });
  for (const record of records) {
    writeFileSync(path.join(directory, `${record.continuationId}.json`), JSON.stringify(record));
  }
  writeFileSync(path.join(directory, "index.json"), JSON.stringify({
    contract: CARVED_MASS_MODULE_CONTRACT,
    folder,
    modules: listed,
  }, null, 2));
  const current = readManifestOrEmpty();
  const archetypeId = records[0]?.archetypeId ?? listed[0]?.archetypeId;
  const candidateId = records[0]?.candidateId ?? listed[0]?.candidateId;
  const modules = [
    ...current.modules.filter((item) => item.archetypeId !== archetypeId || item.candidateId !== candidateId),
    ...listed,
  ].sort((left, right) => left.moduleId.localeCompare(right.moduleId));
  const manifest: CarvedMassManifest = {
    contract: CARVED_MASS_MANIFEST_CONTRACT,
    blur: records[0]?.blur ?? current.blur,
    moduleSize: CARVED_MASS_MODULE_SIZE,
    modules,
  };
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
}

function readManifestOrEmpty(): CarvedMassManifest {
  try {
    return readCarvedMassManifest();
  } catch {
    return {
      contract: CARVED_MASS_MANIFEST_CONTRACT,
      blur: 0.24,
      moduleSize: CARVED_MASS_MODULE_SIZE,
      modules: [],
    };
  }
}

/** Loads one registered module by id. Does not build geometry. */
export function readCarvedMassModule(moduleId: string): CarvedMassModuleRecord {
  const manifest = readCarvedMassManifest();
  const listed = manifest.modules.find((item) => item.moduleId === moduleId);
  if (!listed) throw new Error(`no carved-mass module is registered for ${moduleId}`);
  return JSON.parse(readFileSync(path.join(ROOT, listed.file), "utf8")) as CarvedMassModuleRecord;
}

export function readArchetypeRecords(archetypeId: string, candidateId: number): CarvedMassModuleRecord[] {
  const manifest = readCarvedMassManifest();
  return manifest.modules
    .filter((item) => item.archetypeId === archetypeId && item.candidateId === candidateId)
    .sort((left, right) => left.continuationId.localeCompare(right.continuationId))
    .map((item) => JSON.parse(readFileSync(path.join(ROOT, item.file), "utf8")) as CarvedMassModuleRecord);
}
