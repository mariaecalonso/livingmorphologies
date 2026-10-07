import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPES } from "../../skill1/archetypes";
import { MAX_ITERATIONS } from "../../skill1/maps";
import type { SlimeControls } from "../../skill1/slime-controls";
import type { BiologicalTranslation, SimulationState } from "../../skill1/types";
import type { RealizationState, SemanticCandidate } from "./types";
import { SEMANTIC_RUN_ROOT } from "./run-root";

const MAGIC = Buffer.from("LMZ0");
const VERSION = 1;
const AGENT_STRIDE = 6;

export type Z0Rules = {
  translation: BiologicalTranslation;
  slime: SlimeControls;
  trailDecay: number;
};

export type Z0Meta = {
  contract: "skill2-z0-v1";
  identity: {
    typologyId: string;
    archetypeId: string;
    archetypeName: string;
    candidateId: number;
    generation: number;
    runKey: string;
    genome: SemanticCandidate["plan"];
  };
  provenance: {
    archived: boolean;
    parentId: number | null;
    selectionSource: "catalog";
    objectives: SemanticCandidate["objectives"];
  };
  z0: {
    iteration: number;
    fieldSize: number;
    trailSize: number;
  };
  rules: Z0Rules;
  validation: {
    algorithm: "z0-sha256-v1";
    checksum: string;
  };
  replay?: {
    evaluationSeed: number;
    state: RealizationState;
  };
  preview?: { file: string };
};

export type Z0Capture = {
  bin: Uint8Array;
  meta: Omit<Z0Meta, "identity" | "provenance" | "preview"> & {
    z0: Z0Meta["z0"];
    rules: Z0Rules;
    validation: Z0Meta["validation"];
  };
};

/** Trails, agent motion, source, attractor, and attraction field. Rules are hashed with them. */
export function captureZ0(state: SimulationState, rules: Z0Rules): Z0Capture {
  const bin = encodeZ0(state);
  const checksum = checksumZ0(bin, rules);
  return {
    bin,
    meta: {
      contract: "skill2-z0-v1",
      z0: { iteration: state.iteration, fieldSize: state.size, trailSize: state.trailSize },
      rules,
      validation: { algorithm: "z0-sha256-v1", checksum },
    },
  };
}

export function writePendingZ0(directory: string, candidate: SemanticCandidate, capture: Z0Capture, runSeed: number) {
  const dir = join(directory, "z0", "pending");
  mkdirSync(dir, { recursive: true });
  const name = ARCHETYPES_BY_ID.get(candidate.archetypeId)?.name ?? candidate.archetypeId;
  const meta: Z0Meta = {
    contract: "skill2-z0-v1",
    identity: {
      typologyId: candidate.typologyId,
      archetypeId: candidate.archetypeId,
      archetypeName: name,
      candidateId: candidate.id,
      generation: candidate.generation,
      runKey: `${candidate.archetypeId}@${runSeed}`,
      genome: candidate.plan,
    },
    provenance: {
      archived: false,
      parentId: candidate.lineage.parentId,
      selectionSource: "catalog",
      objectives: candidate.objectives,
    },
    z0: capture.meta.z0,
    rules: capture.meta.rules,
    validation: capture.meta.validation,
    preview: { file: `previews/${candidate.id}.png` },
  };
  writeFileSync(join(dir, `${candidate.id}.bin`), capture.bin);
  writeFileSync(join(dir, `${candidate.id}.json`), JSON.stringify(meta));
}

/** One verified snapshot where `loadVerifiedZ0` reads it. Does not write a pose run. */
export function writeVerifiedZ0(
  archetypeId: string,
  candidate: {
    id: number;
    generation: number;
    typologyId: string;
    plan: SemanticCandidate["plan"];
    state: RealizationState;
    objectives: SemanticCandidate["objectives"];
    parentId: number | null;
    archived: boolean;
    previewFile: string | null;
    evaluationSeed: number;
  },
  capture: Z0Capture,
) {
  if (!/^[a-z0-9-]+$/.test(archetypeId) || archetypeId !== candidate.plan.archetypeId) {
    throw new Error(`unsafe archetype id ${archetypeId}`);
  }
  const dir = join(SEMANTIC_RUN_ROOT, archetypeId, "z0");
  mkdirSync(dir, { recursive: true });
  const name = ARCHETYPES_BY_ID.get(archetypeId)?.name ?? archetypeId;
  const meta: Z0Meta = {
    contract: "skill2-z0-v1",
    identity: {
      typologyId: candidate.typologyId,
      archetypeId,
      archetypeName: name,
      candidateId: candidate.id,
      generation: candidate.generation,
      runKey: `${archetypeId}@${candidate.evaluationSeed}`,
      genome: candidate.plan,
    },
    provenance: {
      archived: candidate.archived,
      parentId: candidate.parentId,
      selectionSource: "catalog",
      objectives: candidate.objectives,
    },
    replay: {
      evaluationSeed: candidate.evaluationSeed,
      state: candidate.state,
    },
    z0: capture.meta.z0,
    rules: capture.meta.rules,
    validation: capture.meta.validation,
    ...(candidate.previewFile ? { preview: { file: candidate.previewFile } } : {}),
  };
  writeFileSync(join(dir, `${candidate.id}.bin`), capture.bin);
  writeFileSync(join(dir, `${candidate.id}.json`), JSON.stringify(meta));
}

/** Move every snapshot into the catalog. Nothing already saved is removed. */
export function promoteArchiveZ0(directory: string, paretoIds: readonly number[]) {
  const archived = new Set(paretoIds);
  const pending = join(directory, "z0", "pending");
  const finalDir = join(directory, "z0");
  mkdirSync(finalDir, { recursive: true });
  if (existsSync(pending)) {
    for (const file of readdirSync(pending)) {
      const from = join(pending, file);
      const to = join(finalDir, file);
      if (existsSync(to)) unlinkSync(to);
      renameSync(from, to);
    }
  }
  for (const file of readdirSync(finalDir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(finalDir, file);
    const meta = JSON.parse(readFileSync(path, "utf8")) as Z0Meta;
    meta.provenance.archived = archived.has(meta.identity.candidateId);
    meta.provenance.selectionSource = "catalog";
    writeFileSync(path, JSON.stringify(meta));
  }
}

export type LoadedZ0 = {
  meta: Z0Meta;
  state: SimulationState;
};

/** Null when this candidate has no snapshot. Throws when the checksum does not match. */
export function loadVerifiedZ0(archetypeId: string, candidateId: number): LoadedZ0 | null {
  if (!/^[a-z0-9-]+$/.test(archetypeId)) throw new Error(`unsafe archetype id ${archetypeId}`);
  const dir = join(SEMANTIC_RUN_ROOT, archetypeId, "z0");
  const jsonPath = join(dir, `${candidateId}.json`);
  const binPath = join(dir, `${candidateId}.bin`);
  if (!existsSync(jsonPath) || !existsSync(binPath)) return null;
  const meta = JSON.parse(readFileSync(jsonPath, "utf8")) as Z0Meta;
  const bin = readFileSync(binPath);
  const checksum = checksumZ0(bin, meta.rules);
  if (checksum !== meta.validation.checksum) throw new Error(`z0 checksum mismatch for ${archetypeId} candidate ${candidateId}`);
  const decoded = decodeZ0(bin, meta.rules.trailDecay);
  return { meta, state: decoded };
}

export function encodeZ0(state: SimulationState) {
  const trailCount = state.trailSize * state.trailSize;
  const attractionLength = state.attraction.length;
  const header = 28;
  const bytes = header + (trailCount + state.agents.length * AGENT_STRIDE + attractionLength + 4) * 4;
  const buffer = Buffer.alloc(bytes);
  MAGIC.copy(buffer, 0);
  buffer.writeUInt32LE(VERSION, 4);
  buffer.writeUInt32LE(state.iteration, 8);
  buffer.writeUInt32LE(state.size, 12);
  buffer.writeUInt32LE(state.trailSize, 16);
  buffer.writeUInt32LE(state.agents.length, 20);
  buffer.writeUInt32LE(attractionLength, 24);
  let offset = header;
  offset = writeFloats(buffer, offset, state.trails, trailCount);
  for (const agent of state.agents) {
    offset = writeFloats(buffer, offset, [agent.x, agent.y, agent.heading, agent.speed, agent.trailStrength, agent.hold], AGENT_STRIDE);
  }
  offset = writeFloats(buffer, offset, state.attraction, attractionLength);
  writeFloats(buffer, offset, [state.source.x, state.source.y, state.attractor.x, state.attractor.y], 4);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export function decodeZ0(bin: Uint8Array, _trailDecay: number): SimulationState {
  const buffer = Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength);
  if (buffer.subarray(0, 4).toString() !== "LMZ0") throw new Error("z0 file is not a simulation snapshot");
  if (buffer.readUInt32LE(4) !== VERSION) throw new Error("z0 file version is not supported");
  const iteration = buffer.readUInt32LE(8);
  const fieldSize = buffer.readUInt32LE(12);
  const trailSize = buffer.readUInt32LE(16);
  const agentCount = buffer.readUInt32LE(20);
  const attractionLength = buffer.readUInt32LE(24);
  let offset = 28;
  const trails = readFloats(buffer, offset, trailSize * trailSize);
  offset += trailSize * trailSize * 4;
  const agents = [];
  for (let index = 0; index < agentCount; index += 1) {
    const motion = readFloats(buffer, offset, AGENT_STRIDE);
    offset += AGENT_STRIDE * 4;
    agents.push({
      x: motion[0],
      y: motion[1],
      heading: motion[2],
      speed: motion[3],
      trailStrength: motion[4],
      hold: motion[5],
      pathX: [],
      pathY: [],
    });
  }
  const attraction = readFloats(buffer, offset, attractionLength);
  offset += attractionLength * 4;
  const points = readFloats(buffer, offset, 4);
  const cells = fieldSize * fieldSize;
  return {
    size: fieldSize,
    trailSize,
    iteration,
    maxIterations: Math.max(MAX_ITERATIONS, iteration + 100000),
    converged: false,
    streak: 0,
    totalDelta: 0,
    seed: 0,
    source: { x: points[0], y: points[1] },
    attractor: { x: points[2], y: points[3] },
    attraction: Array.from(attraction),
    permeabilityField: new Array<number>(cells).fill(0),
    occupancy: new Array<number>(cells).fill(0),
    trails: Array.from(trails),
    flow: new Array<number>(cells).fill(0),
    agents,
  };
}

export function z0Checksum(bin: Uint8Array, rules: Z0Rules) {
  return checksumZ0(bin, rules);
}

function checksumZ0(bin: Uint8Array, rules: Z0Rules) {
  const hash = createHash("sha256");
  hash.update(bin);
  hash.update(stable(rules));
  return hash.digest("hex");
}

function writeFloats(buffer: Buffer, offset: number, values: ArrayLike<number>, count: number) {
  for (let index = 0; index < count; index += 1) buffer.writeFloatLE(values[index] ?? 0, offset + index * 4);
  return offset + count * 4;
}

function readFloats(buffer: Buffer, offset: number, count: number) {
  const out = new Float32Array(count);
  for (let index = 0; index < count; index += 1) out[index] = buffer.readFloatLE(offset + index * 4);
  return out;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const ARCHETYPES_BY_ID = new Map(Object.values(ARCHETYPES).map((item) => [item.id, item]));
