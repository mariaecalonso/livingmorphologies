import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseArchitecturalDna, type ArchitecturalDnaDocument } from "./architectural-dna";
import { parseClientCompatibility, type ClientCompatibilityDocument } from "./client-compatibility";

/**
 * Live Client documents from disk. Node-only — do not import from client components.
 * Lab PUT routes write these files. Program Cluster generation and ranking must read
 * the same files. The compiled seed is not a production fallback.
 */
const ACTIVITIES_FILE = path.join(process.cwd(), "data", "skill5", "client-activities.json");
const DNA_FILE = path.join(process.cwd(), "data", "skill5", "architectural-dna.json");

export class ClientDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientDocumentError";
  }
}

export type LoadedClientActivities = {
  document: ClientCompatibilityDocument;
  hash: string;
};

export type LoadedArchitecturalDna = {
  document: ArchitecturalDnaDocument;
  hash: string;
};

type Cache<T> = { mtime: number; value: T };

let activityCache: Cache<LoadedClientActivities> | null = null;
let dnaCache: Cache<LoadedArchitecturalDna> | null = null;

function hashText(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function readJsonFile(file: string, missing: string, unread: string): { mtime: number; raw: string; value: unknown } {
  let mtime = 0;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {
    throw new ClientDocumentError(missing);
  }
  let raw = "";
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new ClientDocumentError(unread);
  }
  try {
    return { mtime, raw, value: JSON.parse(raw) as unknown };
  } catch {
    throw new ClientDocumentError(unread);
  }
}

export function loadClientActivitiesRecord(): LoadedClientActivities {
  const { mtime, raw, value } = readJsonFile(
    ACTIVITIES_FILE,
    "The client activity record is missing.",
    "The client activity record could not be read.",
  );
  if (activityCache && activityCache.mtime === mtime) return activityCache.value;
  const document = parseClientCompatibility(value);
  if (!document) throw new ClientDocumentError("The client activity record is incomplete.");
  const loaded = { document, hash: hashText(raw) };
  activityCache = { mtime, value: loaded };
  return loaded;
}

export function loadArchitecturalDnaRecord(): LoadedArchitecturalDna {
  const { mtime, raw, value } = readJsonFile(
    DNA_FILE,
    "The architectural DNA record is missing.",
    "The architectural DNA record could not be read.",
  );
  if (dnaCache && dnaCache.mtime === mtime) return dnaCache.value;
  const document = parseArchitecturalDna(value);
  if (!document) throw new ClientDocumentError("The architectural DNA record is incomplete.");
  const loaded = { document, hash: hashText(raw) };
  dnaCache = { mtime, value: loaded };
  return loaded;
}

export function loadClientActivitiesDocument(): ClientCompatibilityDocument {
  return loadClientActivitiesRecord().document;
}

export function loadArchitecturalDnaDocument(): ArchitecturalDnaDocument {
  return loadArchitecturalDnaRecord().document;
}
