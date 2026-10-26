import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "data", "experiments", "carved-mass-solidified");
const METRICS = path.join(ROOT, "metrics");

export type SolidifiedStatus = "validated" | "review";

type MetricFile = {
  moduleId: string;
  file: string;
  category: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  continuationId: string;
  boundaryEdges: number;
  nonManifoldEdges: number;
  components: number;
  manifold: "PASS" | "FAIL";
  preflight: "PASS" | "FAIL";
  triangles: number;
};

export type SolidifiedCatalogueEntry = {
  moduleId: string;
  file: string;
  typologyId: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  continuationId: string;
  branchIndex: number;
  continuationSeed: number;
  z0Iteration: number;
  parentChecksum: string;
  provenance: Record<string, unknown>;
  status: SolidifiedStatus;
  manifold: "PASS" | "FAIL";
  preflight: "PASS" | "FAIL";
  components: number;
  triangles: number;
};

/**
 * Manifold and Skill 4 preflight both passed, and the module is one body.
 * Anything else stays visible as review.
 */
export function solidifiedStatus(metric: Pick<MetricFile, "manifold" | "preflight" | "components" | "boundaryEdges" | "nonManifoldEdges">): SolidifiedStatus {
  const validated = metric.manifold === "PASS"
    && metric.preflight === "PASS"
    && metric.components === 1
    && metric.boundaryEdges === 0
    && metric.nonManifoldEdges === 0;
  return validated ? "validated" : "review";
}

function safeName(value: string) {
  return /^[a-z0-9-]+$/.test(value);
}

export function solidifiedFileName(archetypeId: string, candidateId: number, continuationId: string) {
  return `${archetypeId}-${candidateId}-${continuationId}.json`;
}

function insideRoot(file: string) {
  const resolved = path.resolve(file);
  return resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`);
}

function headerText(file: string) {
  const fd = openSync(file, "r");
  const buf = Buffer.alloc(12000);
  const read = readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  return buf.toString("utf8", 0, read);
}

function headerIdentity(file: string) {
  const text = headerText(file);
  const seed = text.match(/"continuationSeed":(\d+)/);
  const z0 = text.match(/"z0Iteration":(\d+)/);
  const checksum = text.match(/"parentChecksum":"([^"]*)"/);
  const provenanceStart = text.indexOf("\"provenance\":");
  const provenanceEnd = text.indexOf(",\"originalTopology\"");
  if (!seed || !z0 || !checksum || provenanceStart < 0 || provenanceEnd <= provenanceStart) {
    throw new Error(`Solidified header is incomplete: ${path.basename(file)}`);
  }
  const provenance = JSON.parse(text.slice(provenanceStart + "\"provenance\":".length, provenanceEnd)) as Record<string, unknown>;
  return {
    continuationSeed: Number(seed[1]),
    z0Iteration: Number(z0[1]),
    parentChecksum: checksum[1],
    provenance,
  };
}

export function listSolidifiedCatalogue(archetypeId: string, candidateId: number): SolidifiedCatalogueEntry[] {
  if (!safeName(archetypeId) || !Number.isInteger(candidateId) || candidateId < 1) return [];
  if (!existsSync(METRICS)) return [];
  const prefix = `${archetypeId}-${candidateId}-`;
  const names = readdirSync(METRICS).filter((name) => name.startsWith(prefix) && name.endsWith(".json"));
  const entries: SolidifiedCatalogueEntry[] = [];
  for (const name of names) {
    const metric = JSON.parse(readFileSync(path.join(METRICS, name), "utf8")) as MetricFile;
    if (metric.archetypeId !== archetypeId || metric.candidateId !== candidateId) continue;
    if (!/^N\d{2}$/.test(metric.continuationId)) continue;
    const file = path.join(ROOT, solidifiedFileName(archetypeId, candidateId, metric.continuationId));
    if (!insideRoot(file) || !existsSync(file)) continue;
    const identity = headerIdentity(file);
    entries.push({
      moduleId: metric.moduleId,
      file: metric.file,
      typologyId: metric.category,
      archetypeId: metric.archetypeId,
      archetypeName: metric.archetypeName,
      candidateId: metric.candidateId,
      continuationId: metric.continuationId,
      branchIndex: Number(metric.continuationId.slice(1)),
      continuationSeed: identity.continuationSeed,
      z0Iteration: identity.z0Iteration,
      parentChecksum: identity.parentChecksum,
      provenance: identity.provenance,
      status: solidifiedStatus(metric),
      manifold: metric.manifold,
      preflight: metric.preflight,
      components: metric.components,
      triangles: metric.triangles,
    });
  }
  return entries.sort((left, right) => (left.continuationId < right.continuationId ? -1 : left.continuationId > right.continuationId ? 1 : 0));
}

function readSolidifiedMetric(archetypeId: string, candidateId: number, continuationId: string): MetricFile | null {
  if (!safeName(archetypeId) || !Number.isInteger(candidateId) || !/^N\d{2}$/.test(continuationId)) return null;
  const file = path.join(METRICS, solidifiedFileName(archetypeId, candidateId, continuationId));
  if (!insideRoot(file) || !existsSync(file)) return null;
  const metric = JSON.parse(readFileSync(file, "utf8")) as MetricFile;
  const expected = `carved-mass:${archetypeId}:${candidateId}:${continuationId}`;
  if (metric.moduleId !== expected || metric.archetypeId !== archetypeId || metric.candidateId !== candidateId) return null;
  if (metric.continuationId !== continuationId) return null;
  return metric;
}

export function readSolidifiedStatus(archetypeId: string, candidateId: number, continuationId: string): SolidifiedStatus | null {
  const metric = readSolidifiedMetric(archetypeId, candidateId, continuationId);
  return metric ? solidifiedStatus(metric) : null;
}

/** Stored manifold checks for the process page. This does not recompute or rewrite them. */
export function readSolidifiedChecks(archetypeId: string, candidateId: number, continuationId: string) {
  const metric = readSolidifiedMetric(archetypeId, candidateId, continuationId);
  if (!metric) return null;
  if (metric.manifold !== "PASS" && metric.manifold !== "FAIL") return null;
  if (metric.preflight !== "PASS" && metric.preflight !== "FAIL") return null;
  if (typeof metric.components !== "number" || typeof metric.boundaryEdges !== "number" || typeof metric.nonManifoldEdges !== "number") return null;
  return {
    components: metric.components,
    boundaryEdges: metric.boundaryEdges,
    nonManifoldEdges: metric.nonManifoldEdges,
    manifold: metric.manifold,
    preflight: metric.preflight,
    ...(typeof metric.file === "string" && metric.file ? { file: metric.file } : {}),
  };
}

export function readSolidifiedMesh(archetypeId: string, candidateId: number, continuationId: string) {
  if (!safeName(archetypeId) || !Number.isInteger(candidateId) || !/^N\d{2}$/.test(continuationId)) return null;
  const file = path.join(ROOT, solidifiedFileName(archetypeId, candidateId, continuationId));
  if (!insideRoot(file) || !existsSync(file)) return null;
  const record = JSON.parse(readFileSync(file, "utf8")) as {
    moduleId?: string;
    repaired?: { encoding: string; positions: string; normals: string; indices: string; triangles: number };
  };
  if (!record.repaired || record.repaired.encoding !== "isomesh-base64") return null;
  return { moduleId: record.moduleId ?? null, geometry: record.repaired };
}
