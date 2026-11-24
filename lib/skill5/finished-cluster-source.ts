import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { FinishedProgram } from "@/lib/skill4/finished-catalog";
import type { FinishedClusterSource, SourceModuleIdentity } from "./placed-cluster";

const PROGRAMS = path.join(process.cwd(), "data", "skill4", "finished-programs");
const cache = new Map<string, { mtime: number; program: FinishedProgram }>();

function readJsonProgram(file: string): FinishedProgram | null {
  if (!existsSync(file)) return null;
  const mtime = statSync(file).mtimeMs;
  const cached = cache.get(file);
  if (cached && cached.mtime === mtime) return cached.program;
  const program = JSON.parse(readFileSync(file, "utf8")) as FinishedProgram;
  cache.set(file, { mtime, program });
  return program;
}

function readProgram(programId: string): FinishedProgram | null {
  if (!programId || programId.includes("..") || programId.includes("/") || programId.includes("\\")) return null;
  return readJsonProgram(path.join(PROGRAMS, `${programId}.json`));
}

function uniqueModules(modules: readonly SourceModuleIdentity[]) {
  const seen = new Set<string>();
  const out: SourceModuleIdentity[] = [];
  for (const module of modules) {
    if (!module.moduleId || seen.has(module.moduleId)) continue;
    seen.add(module.moduleId);
    out.push(module);
  }
  return out;
}

export function finishedClusterSource(programId: string, clusterId: string): FinishedClusterSource {
  const empty: FinishedClusterSource = {
    finishedClusterId: clusterId,
    programId,
    iteration: null,
    modules: [],
  };
  const program = readProgram(programId);
  if (!program) return empty;
  const iteration = program.iterations.find((item) => item.id === clusterId);
  if (!iteration) return empty;
  const fromProvenance = (iteration.provenance?.modules ?? []).map((module) => ({
    moduleId: module.moduleId,
    archetypeId: module.archetypeId,
    candidateId: module.candidateId,
    continuationId: module.continuationId,
  }));
  const fromTiles = iteration.tiles.map((tile) => ({
    moduleId: tile.moduleId,
    archetypeId: tile.archetypeId,
    candidateId: null,
    continuationId: null,
  }));
  return {
    finishedClusterId: clusterId,
    programId,
    iteration: iteration.iteration,
    modules: uniqueModules(fromProvenance.length > 0 ? fromProvenance : fromTiles),
  };
}
