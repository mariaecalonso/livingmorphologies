import { readArchitecturalRecord } from "@/lib/skill5/architectural-strategy";
import type { NetworkIteration } from "@/components/site/site-network";

export const STRATEGY_ARCHIVE_ID = "herald-arrival-v1";

const FLOW_SURVIVE = 0.08;

export type StrategyArchiveFile = {
  strategyId: typeof STRATEGY_ARCHIVE_ID;
  massingNetworkId: string | null;
  zoningShortlist: string[];
  iterations: NetworkIteration[];
};

function trailCells(trails: Float32Array) {
  const cells: number[][] = [];
  for (let index = 0; index < trails.length; index += 1) {
    const value = trails[index] ?? 0;
    if (value >= FLOW_SURVIVE) cells.push([index, Math.round(value * 1000) / 1000]);
  }
  return cells;
}

export function trailsFromCells(inkSize: number, cells: readonly (readonly number[])[]) {
  const count = inkSize * inkSize;
  const trails = new Float32Array(count);
  for (const cell of cells) {
    const index = cell[0];
    const value = cell[1];
    if (!Number.isInteger(index) || index < 0 || index >= count) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    trails[index] = value;
  }
  return trails;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readIteration(value: unknown): NetworkIteration | null {
  if (!isRecord(value)) return null;
  if (value.layoutFamily !== "strategy") return null;
  if (typeof value.id !== "string" || typeof value.seed !== "number" || typeof value.inkSize !== "number") return null;
  if (!Number.isInteger(value.inkSize) || value.inkSize <= 0) return null;
  if (typeof value.cellFeet !== "number" || !Number.isFinite(value.cellFeet) || value.cellFeet <= 0) return null;
  if (!Array.isArray(value.trailCells)) return null;
  const architectureRecord = readArchitecturalRecord(value.architectureRecord);
  if (!architectureRecord) return null;
  const trails = trailsFromCells(value.inkSize, value.trailCells.filter((cell): cell is number[] => Array.isArray(cell)));
  return {
    id: value.id,
    index: typeof value.index === "number" ? value.index : 0,
    seed: value.seed,
    nodes: Array.isArray(value.nodes) ? value.nodes as NetworkIteration["nodes"] : [],
    step: typeof value.step === "number" ? value.step : 0,
    settled: Boolean(value.settled),
    reached: typeof value.reached === "number" ? value.reached : 0,
    total: typeof value.total === "number" ? value.total : 0,
    reachedIds: Array.isArray(value.reachedIds) ? value.reachedIds.filter((item): item is string => typeof item === "string") : [],
    connectedIds: Array.isArray(value.connectedIds) ? value.connectedIds.filter((item): item is string => typeof item === "string") : [],
    note: typeof value.note === "string" ? value.note : null,
    trails,
    inkSize: value.inkSize,
    traversable: typeof value.traversable === "number" && Number.isFinite(value.traversable) ? value.traversable : undefined,
    cellFeet: value.cellFeet,
    generator: value.generator === "flow" || value.generator === "agents" ? value.generator : undefined,
    branches: Array.isArray(value.branches) ? value.branches as NetworkIteration["branches"] : undefined,
    layoutId: typeof value.layoutId === "string" ? value.layoutId : undefined,
    layoutTitle: typeof value.layoutTitle === "string" ? value.layoutTitle : undefined,
    layoutFamily: "strategy",
    architectureRecord,
    spacingFeet: typeof value.spacingFeet === "number" && Number.isFinite(value.spacingFeet) ? value.spacingFeet : undefined,
    windFromDegrees: typeof value.windFromDegrees === "number" && Number.isFinite(value.windFromDegrees) ? value.windFromDegrees : value.windFromDegrees === null ? null : undefined,
  };
}

export function publishedZoning(value: unknown) {
  const archive = parseStrategyArchiveIds(value);
  if (!archive) return null;
  return { massingNetworkId: archive.massingNetworkId, zoningShortlist: archive.zoningShortlist };
}

export function missingPublishedIterations(value: unknown, have: ReadonlySet<string>) {
  if (!isRecord(value) || value.strategyId !== STRATEGY_ARCHIVE_ID || !Array.isArray(value.iterations)) return [];
  return value.iterations.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || have.has(item.id)) return [];
    const iteration = readIteration(item);
    return iteration ? [iteration] : [];
  });
}

function parseStrategyArchiveIds(value: unknown) {
  if (!isRecord(value) || value.strategyId !== STRATEGY_ARCHIVE_ID || !Array.isArray(value.iterations)) return null;
  const ids = value.iterations.flatMap((item) => isRecord(item) && typeof item.id === "string" ? [item.id] : []);
  if (ids.length === 0) return null;
  const known = new Set(ids);
  const massingNetworkId = typeof value.massingNetworkId === "string" && known.has(value.massingNetworkId) ? value.massingNetworkId : null;
  const zoningShortlist = Array.isArray(value.zoningShortlist)
    ? value.zoningShortlist.filter((item): item is string => typeof item === "string" && known.has(item)).slice(0, 3)
    : [];
  return { massingNetworkId, zoningShortlist };
}

export function parseStrategyArchive(value: unknown): StrategyArchiveFile | null {
  if (!isRecord(value) || value.strategyId !== STRATEGY_ARCHIVE_ID || !Array.isArray(value.iterations)) return null;
  const iterations = value.iterations.flatMap((item) => {
    const iteration = readIteration(item);
    return iteration ? [iteration] : [];
  });
  if (iterations.length === 0) return null;
  const ids = new Set(iterations.map((item) => item.id));
  const massingNetworkId = typeof value.massingNetworkId === "string" && ids.has(value.massingNetworkId) ? value.massingNetworkId : null;
  const zoningShortlist = Array.isArray(value.zoningShortlist)
    ? value.zoningShortlist.filter((item): item is string => typeof item === "string" && ids.has(item)).slice(0, 3)
    : [];
  return { strategyId: STRATEGY_ARCHIVE_ID, massingNetworkId, zoningShortlist, iterations };
}

export function serializeArchiveIteration(iteration: NetworkIteration) {
  return {
    id: iteration.id,
    index: iteration.index,
    seed: iteration.seed,
    nodes: iteration.nodes,
    step: iteration.step,
    settled: iteration.settled,
    reached: iteration.reached,
    total: iteration.total,
    reachedIds: [...iteration.reachedIds],
    connectedIds: [...iteration.connectedIds],
    note: iteration.note,
    inkSize: iteration.inkSize,
    traversable: iteration.traversable,
    cellFeet: iteration.cellFeet,
    generator: iteration.generator,
    branches: iteration.branches,
    layoutId: iteration.layoutId,
    layoutTitle: iteration.layoutTitle,
    layoutFamily: iteration.layoutFamily,
    architectureRecord: iteration.architectureRecord,
    spacingFeet: iteration.spacingFeet,
    windFromDegrees: iteration.windFromDegrees,
    trailCells: trailCells(iteration.trails),
  };
}

export function readArchiveIterationRecord(value: unknown) {
  return readIteration(value);
}

export function serializeStrategyArchive(archive: StrategyArchiveFile) {
  return {
    strategyId: archive.strategyId,
    massingNetworkId: archive.massingNetworkId,
    zoningShortlist: archive.zoningShortlist,
    iterations: archive.iterations.map((iteration) => serializeArchiveIteration(iteration)),
  };
}
