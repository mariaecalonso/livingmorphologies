import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { semanticCatalogRoot, semanticPreviewPath as publishedPreviewPath } from "./published-catalog-view";
import {
  decodeGrayPng,
  DEFAULT_FILAMENT,
  exploratoryHairPlate,
  hairPlateStamp,
  normalizeFilamentCalibration,
  refinePreviewPng,
  semanticPreviewPath as runPreviewPath,
  type FilamentCalibration,
} from "./filament";
import { downsampleGray } from "./filament-draw";
import { encodeGrayPng } from "./semantic/gray-png";

const CACHE_DIR = join("data", "filament-cache", "published");
const PREVIEW_PLATE = 384;
const plateCache = new Map<string, { mtime: number; png: Buffer; full: number }>();

export function sameFilament(left: FilamentCalibration, right: FilamentCalibration) {
  const keys = ["white", "black", "organic", "thickness"] as const;
  return keys.every((key) => Math.abs(left[key] - right[key]) < 0.0005);
}

export function clearPublishedInk(archetypeId: string) {
  const dir = join(CACHE_DIR, archetypeId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  for (const key of plateCache.keys()) {
    if (key.startsWith(`${archetypeId}/`)) plateCache.delete(key);
  }
}

/**
 * A plate is the untoned picture. A baked file is a catalogue preview already inked at the default.
 * Stored plates and run previews come first. The published preview is the fallback.
 */
export function filamentSource(archetypeId: string, id: string): { file: string; kind: "plate" | "baked" } | null {
  if (!/^[a-z0-9-]+$/.test(archetypeId) || !/^\d+$/.test(id)) return null;
  const stored = join(semanticCatalogRoot(), archetypeId, "plates", `${id}.png`);
  if (existsSync(stored)) return { file: stored, kind: "plate" };
  const run = runPreviewPath(archetypeId, id);
  if (run) return { file: run, kind: "plate" };
  const published = publishedPreviewPath(archetypeId, id);
  if (published) return { file: published, kind: "baked" };
  return null;
}

/** Catalogue drawing. The saved ink is applied once to a plate. A baked default file is returned as stored. */
export function readPublishedInk(archetypeId: string, id: string, calibration: FilamentCalibration): Buffer | null {
  const source = filamentSource(archetypeId, id);
  if (!source) return null;
  const setting = normalizeFilamentCalibration(calibration);
  if (source.kind === "baked" && sameFilament(setting, DEFAULT_FILAMENT)) return readFileSync(source.file);
  const stamp = `${source.kind}:${statSync(source.file).mtimeMs}:${JSON.stringify(setting)}:${hairPlateStamp(archetypeId)}`;
  const dir = join(CACHE_DIR, archetypeId);
  const file = join(dir, `${id}.png`);
  const mark = join(dir, `${id}.stamp`);
  if (existsSync(file) && existsSync(mark) && readFileSync(mark, "utf8") === stamp) return readFileSync(file);
  const refined = refinePreviewPng(readFileSync(source.file), setting, archetypeId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, refined);
  writeFileSync(mark, stamp);
  return refined;
}

/** Live slider plate. One small gray image of the drawing source, kept in memory. */
export function readPreviewPlate(archetypeId: string, id: string) {
  const source = filamentSource(archetypeId, id);
  if (!source) return null;
  const mtime = statSync(source.file).mtimeMs;
  const key = `${archetypeId}/${id}`;
  const hit = plateCache.get(key);
  if (hit && hit.mtime === mtime) return { png: hit.png, full: hit.full };
  const decoded = decodeGrayPng(readFileSync(source.file));
  if (!decoded) return null;
  const sourcePixels = exploratoryHairPlate(decoded.pixels, archetypeId);
  const pixels = decoded.size === PREVIEW_PLATE ? sourcePixels : downsampleGray(sourcePixels, decoded.size, PREVIEW_PLATE);
  const png = encodeGrayPng(PREVIEW_PLATE, pixels);
  plateCache.set(key, { mtime, png, full: decoded.size });
  return { png, full: decoded.size };
}
