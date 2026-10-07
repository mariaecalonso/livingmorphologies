import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { ARCHETYPE_VISUAL_REFERENCES } from "./archetype-visual-references";
import { encodeGrayPng } from "./semantic/gray-png";
import { semanticRunFile } from "./semantic/run-root";
import { visibleIds } from "./semantic/catalog";
import type { SemanticRun } from "./semantic/types";
import {
  DEFAULT_FILAMENT,
  normalizeFilamentCalibration,
  refineFilament,
  type FilamentCalibration,
} from "./filament-draw";

export { downsampleGray, filamentField, toneFilament, refineFilament } from "./filament-draw";
export { DEFAULT_FILAMENT, normalizeFilamentCalibration, type FilamentCalibration };

/**
 * Filament refinement sits after a Skill 2 run and before the catalog is shown.
 * The search stores the untoned plate. This file turns that plate into the
 * shared drawing: black ground, a white hair, and a corner that can soften.
 * One saved setting serves every iteration of one archetype.
 */

const CONFIG_DIR = join("config", "filament");
const CACHE_DIR = join("data", "filament-cache");

export function isArchetypeId(value: string) {
  return /^[a-z0-9-]+$/.test(value);
}

export function filamentConfigPath(archetypeId: string) {
  return join(CONFIG_DIR, `${archetypeId}.json`);
}

export function loadFilamentCalibration(archetypeId: string): FilamentCalibration {
  const path = filamentConfigPath(archetypeId);
  if (!existsSync(path)) return { ...DEFAULT_FILAMENT };
  try {
    return normalizeFilamentCalibration(JSON.parse(readFileSync(path, "utf8")) as Partial<FilamentCalibration>);
  } catch {
    return { ...DEFAULT_FILAMENT };
  }
}

export function saveFilamentCalibration(archetypeId: string, value: Partial<FilamentCalibration>) {
  if (!isArchetypeId(archetypeId)) throw new Error("archetype id is not valid");
  const calibration = normalizeFilamentCalibration(value);
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(filamentConfigPath(archetypeId), JSON.stringify(calibration, null, 2));
  const cache = join(CACHE_DIR, archetypeId);
  if (existsSync(cache)) rmSync(cache, { recursive: true, force: true });
  return calibration;
}

export type FilamentArchetypeStatus = {
  archetypeId: string;
  name: string;
  hasRun: boolean;
  sampleIds: number[];
  calibration: FilamentCalibration;
  saved: boolean;
};

export function filamentArchetypeStatus(): FilamentArchetypeStatus[] {
  return ARCHETYPE_VISUAL_REFERENCES.map((item) => {
    const sampleIds = filamentSampleIds(item.archetypeId);
    return {
      archetypeId: item.archetypeId,
      name: item.name,
      hasRun: sampleIds.length > 0,
      sampleIds,
      calibration: loadFilamentCalibration(item.archetypeId),
      saved: existsSync(filamentConfigPath(item.archetypeId)),
    };
  });
}

/** A few real drawings from the finished run, spread across the catalog when one exists. */
export function filamentSampleIds(archetypeId: string) {
  if (!isArchetypeId(archetypeId)) return [];
  const runFile = semanticRunFile(archetypeId, "run.json");
  if (!runFile) return [];
  let run: SemanticRun;
  try {
    run = JSON.parse(readFileSync(runFile, "utf8")) as SemanticRun;
  } catch {
    return [];
  }
  const previewDir = join(runFile, "..", "previews");
  const ready = run.candidates.filter((candidate) => candidate.preview && existsSync(join(previewDir, `${candidate.id}.png`)));
  const visible = new Set(visibleIds(run.catalog));
  const catalog = ready.filter((candidate) => visible.has(candidate.id));
  const source = catalog.length >= 3 ? catalog : ready;
  if (source.length <= 6) return source.map((candidate) => candidate.id);
  const ids: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    ids.push(source[Math.round((index * (source.length - 1)) / 5)].id);
  }
  return [...new Set(ids)];
}

export function semanticPreviewPath(archetypeId: string, id: string) {
  if (!isArchetypeId(archetypeId) || !/^\d+$/.test(id)) return null;
  return semanticRunFile(archetypeId, "previews", `${id}.png`);
}

/** Catalog image. Uses the saved calibration and a disk cache so the page does not re-tone every request. */
export function readCatalogFilament(archetypeId: string, sourcePath: string, id: string) {
  const calibration = loadFilamentCalibration(archetypeId);
  const stamp = JSON.stringify(calibration);
  const dir = join(CACHE_DIR, archetypeId);
  const cache = join(dir, `${id}.png`);
  const mark = join(dir, `${id}.stamp`);
  const sourceTime = statSync(sourcePath).mtimeMs;
  if (existsSync(cache) && existsSync(mark) && readFileSync(mark, "utf8") === stamp && statSync(cache).mtimeMs >= sourceTime) {
    return readFileSync(cache);
  }
  const refined = refinePreviewPng(readFileSync(sourcePath), calibration);
  mkdirSync(dir, { recursive: true });
  writeFileSync(cache, refined);
  writeFileSync(mark, stamp);
  return refined;
}

export function refinePreviewPng(png: Buffer, calibration: FilamentCalibration) {
  const decoded = decodeGrayPng(png);
  if (!decoded) return png;
  return encodeGrayPng(decoded.size, refineFilament(decoded.pixels, calibration));
}

/** Our inspection PNGs are 8-bit gray with filter 0. Anything else is left untouched. */
export function decodeGrayPng(buffer: Buffer) {
  if (buffer.length < 8 || buffer[0] !== 137 || buffer[1] !== 80) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) return null;
    if (type === "IHDR") {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      if (buffer[start + 8] !== 8 || buffer[start + 9] !== 0) return null;
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(start, end));
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }
  if (width < 2 || height < 2 || width !== height || idat.length === 0) return null;
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width + 1;
  if (inflated.length < stride * height) return null;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    if (inflated[row] !== 0) return null;
    pixels.set(inflated.subarray(row + 1, row + 1 + width), y * width);
  }
  return { size: width, pixels };
}
