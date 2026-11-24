import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { publishedZoning, readArchiveIterationRecord, serializeArchiveIteration, STRATEGY_ARCHIVE_ID } from "./strategy-archive";

/**
 * Canonical Selected Site Strategy Network.
 * Node-only — do not import from client components.
 * Production subsystems read `herald-arrival-v1.json` `massingNetworkId`.
 * Browser cache and historical configurations are not production authorities.
 */
const FILE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");

export class SelectedSiteNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectedSiteNetworkError";
  }
}

export type PublishedSelectedNetwork = {
  strategyId: typeof STRATEGY_ARCHIVE_ID;
  massingNetworkId: string;
  zoningShortlist: string[];
};

function archiveIds(value: unknown) {
  if (!value || typeof value !== "object") return [];
  const iterations = (value as { iterations?: unknown }).iterations;
  if (!Array.isArray(iterations)) return [];
  return iterations.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const id = (item as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0 ? [id] : [];
  });
}

export function readPublishedSelectedNetwork(): PublishedSelectedNetwork {
  let body: unknown;
  try {
    body = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
  } catch {
    throw new SelectedSiteNetworkError("The published Site Strategy archive could not be read.");
  }
  const zoning = publishedZoning(body);
  if (!zoning?.massingNetworkId) {
    throw new SelectedSiteNetworkError("Published Site Strategy has no selected network.");
  }
  return {
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: zoning.massingNetworkId,
    zoningShortlist: zoning.zoningShortlist,
  };
}

function replaceMassingNetworkId(raw: string, massingNetworkId: string) {
  const next = raw.replace(/"massingNetworkId"\s*:\s*"[^"]*"/, `"massingNetworkId":${JSON.stringify(massingNetworkId)}`);
  if (next === raw) {
    throw new SelectedSiteNetworkError("The published Site Strategy selection could not be written.");
  }
  return next;
}

function appendArchiveIteration(raw: string, record: unknown) {
  const text = raw.replace(/\s+$/, "");
  if (!text.endsWith("]}")) {
    throw new SelectedSiteNetworkError("The published Site Strategy archive could not be updated.");
  }
  const next = `${text.slice(0, -2)},${JSON.stringify(record)}]}\n`;
  try {
    JSON.parse(next);
  } catch {
    throw new SelectedSiteNetworkError("The published Site Strategy archive could not be updated.");
  }
  return next;
}

function asPublishableRecord(value: unknown, massingNetworkId: string) {
  const iteration = readArchiveIterationRecord(value);
  if (!iteration || iteration.id !== massingNetworkId) {
    throw new SelectedSiteNetworkError("This iteration is not a complete Strategy record and cannot be used for zoning.");
  }
  if ((iteration.branches?.length ?? 0) === 0) {
    throw new SelectedSiteNetworkError("This iteration has no network branches and cannot be used for zoning.");
  }
  return serializeArchiveIteration(iteration);
}

/**
 * Sets the Selected Site Strategy Network.
 * Existing archive iterations keep their stored geometry.
 * IndexedDB-only iterations may be appended when a complete Strategy record is supplied.
 */
export function writePublishedSelectedNetwork(
  massingNetworkId: string,
  iteration?: unknown,
): PublishedSelectedNetwork & { changed: boolean; published: boolean } {
  if (typeof massingNetworkId !== "string" || massingNetworkId.length === 0) {
    throw new SelectedSiteNetworkError("A Site Strategy network id is required.");
  }
  const raw = readFileSync(FILE, "utf8");
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    throw new SelectedSiteNetworkError("The published Site Strategy archive could not be read.");
  }
  const zoning = publishedZoning(body);
  if (!zoning) {
    throw new SelectedSiteNetworkError("The published Site Strategy archive could not be read.");
  }
  const known = archiveIds(body);
  let next = raw;
  let published = false;
  if (!known.includes(massingNetworkId)) {
    if (iteration === undefined) {
      throw new SelectedSiteNetworkError("That network is not in the published Site Strategy archive.");
    }
    const record = asPublishableRecord(iteration, massingNetworkId);
    next = appendArchiveIteration(next, record);
    published = true;
  }
  if (zoning.massingNetworkId !== massingNetworkId) {
    next = replaceMassingNetworkId(next, massingNetworkId);
  }
  if (next !== raw) writeFileSync(FILE, next, "utf8");
  const shortlist = zoning.zoningShortlist;
  return {
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId,
    zoningShortlist: shortlist,
    changed: next !== raw,
    published,
  };
}
