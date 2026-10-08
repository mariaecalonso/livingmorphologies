/**
 * Copies the display records the lab already shows into public/demo.
 * Reads research files. Writes only under public/demo.
 * Does not tone into data/filament-cache.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { join } from "node:path";
import { ARCHETYPES } from "../lib/skill1/archetypes";
import { loadLabDemo } from "../lib/home-lab-demo";
import { loadHomeResultPlates } from "../lib/home-result-plates";
import { encodeGrayPng } from "../lib/skill2/semantic/gray-png";
import { archiveImagePath, loadEvolutionCatalog, type EvolutionCatalog } from "../lib/skill2/evolution-index";
import {
  DEFAULT_FILAMENT,
  hairPlateStamp,
  loadFilamentCalibration,
  refinePreviewPng,
  semanticPreviewPath,
} from "../lib/skill2/filament";
import { filamentSource, sameFilament } from "../lib/skill2/filament-catalog";
import { loadShownCatalog } from "../lib/skill2/published-catalog-view";
import { loadSavedPicks } from "../lib/skill2/saved-picks";
import { loadVerifiedZ0 } from "../lib/skill2/semantic/z0-snapshot";
import { PROVISIONAL_MOCK_IDS } from "../lib/skill4/fixtures";
import { advanceScan, startScanFromZ0, takeSlice } from "../lib/scan/volume";

const ROOT = process.cwd();
const OUT = join(ROOT, "public", "demo");
const SLICES = 5;
const STEPS = 4;
const VIEW = 48;

function writeJson(relative: string, value: unknown) {
  const path = join(OUT, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function safeFileName(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

/** Largest Skill 2 frame is the presentation catalog detail: square, column 720–900px. Sources are 1280. */
const SKILL2_MAX = 1280;
/** Skill 1 detail can be wider than these plates. Do not enlarge them. */
const SKILL1_MAX = 1024;

function previewUrl(archetypeId: string, id: number) {
  return `/demo/skill2/previews/${archetypeId}/${id}.webp`;
}

async function presentationWebp(bytes: Buffer, maxEdge: number) {
  const image = sharp(bytes, { failOn: "none" });
  const meta = await image.metadata();
  const width = meta.width ?? maxEdge;
  const height = meta.height ?? maxEdge;
  const edge = Math.max(width, height);
  const resized = edge > maxEdge ? image.resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }) : image;
  return resized.webp({ quality: 82, effort: 4 }).toBuffer();
}

/** Same bytes as the catalog image routes, without writing the filament cache. */
function displayPng(archetypeId: string, id: number, image: string): Buffer | null {
  if (image.startsWith("/api/semantic-catalog/")) return publishedInk(archetypeId, String(id));
  const semantic = semanticPreviewPath(archetypeId, String(id));
  if (semantic) return tonedPlate(archetypeId, semantic, String(id));
  const archived = archiveImagePath(archetypeId, String(id));
  return archived ? readFileSync(archived) : null;
}

function tonedPlate(archetypeId: string, sourcePath: string, id: string) {
  const calibration = loadFilamentCalibration(archetypeId);
  const stamp = `${JSON.stringify(calibration)}:${hairPlateStamp(archetypeId)}`;
  const cache = join(ROOT, "data", "filament-cache", archetypeId, `${id}.png`);
  const mark = join(ROOT, "data", "filament-cache", archetypeId, `${id}.stamp`);
  const sourceTime = statSync(sourcePath).mtimeMs;
  if (existsSync(cache) && existsSync(mark) && readFileSync(mark, "utf8") === stamp && statSync(cache).mtimeMs >= sourceTime) {
    return readFileSync(cache);
  }
  return refinePreviewPng(readFileSync(sourcePath), calibration, archetypeId);
}

function publishedInk(archetypeId: string, id: string): Buffer | null {
  const source = filamentSource(archetypeId, id);
  if (!source) return null;
  const setting = loadFilamentCalibration(archetypeId);
  if (source.kind === "snapshot") return readFileSync(source.file);
  if (source.kind === "baked" && sameFilament(setting, DEFAULT_FILAMENT)) return readFileSync(source.file);
  const stamp = `${source.kind}:${statSync(source.file).mtimeMs}:${JSON.stringify(setting)}:${hairPlateStamp(archetypeId)}`;
  const cache = join(ROOT, "data", "filament-cache", "published", archetypeId, `${id}.png`);
  const mark = join(ROOT, "data", "filament-cache", "published", archetypeId, `${id}.stamp`);
  if (existsSync(cache) && existsSync(mark) && readFileSync(mark, "utf8") === stamp) return readFileSync(cache);
  return refinePreviewPng(readFileSync(source.file), setting, archetypeId);
}

function withPreviewUrls(catalog: EvolutionCatalog): EvolutionCatalog {
  return {
    archetypes: catalog.archetypes.map((archetype) => ({
      ...archetype,
      candidates: archetype.candidates.map((candidate) => ({
        ...candidate,
        image: candidate.image ? previewUrl(candidate.archetypeId, candidate.id) : null,
      })),
    })),
  };
}

async function copyPreviews(catalog: EvolutionCatalog, written: Set<string>) {
  let copied = 0;
  let missing = 0;
  for (const archetype of catalog.archetypes) {
    for (const candidate of archetype.candidates) {
      if (!candidate.image) continue;
      const key = `${candidate.archetypeId}/${candidate.id}`;
      if (written.has(key)) continue;
      const bytes = displayPng(candidate.archetypeId, candidate.id, candidate.image);
      if (!bytes) {
        missing += 1;
        continue;
      }
      const path = join(OUT, "skill2", "previews", candidate.archetypeId, `${candidate.id}.webp`);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, await presentationWebp(bytes, SKILL2_MAX));
      written.add(key);
      copied += 1;
    }
  }
  return { copied, missing };
}

function slicePng(slice: { trails: Float32Array; trailSize: number; peak: number }) {
  const pixels = new Uint8Array(VIEW * VIEW);
  const scale = slice.trailSize / VIEW;
  for (let y = 0; y < VIEW; y += 1) {
    for (let x = 0; x < VIEW; x += 1) {
      let sum = 0;
      let count = 0;
      const y0 = Math.floor(y * scale);
      const y1 = Math.min(slice.trailSize, Math.floor((y + 1) * scale));
      const x0 = Math.floor(x * scale);
      const x1 = Math.min(slice.trailSize, Math.floor((x + 1) * scale));
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          sum += slice.trails[py * slice.trailSize + px];
          count += 1;
        }
      }
      const value = count ? sum / count / slice.peak : 0;
      pixels[y * VIEW + x] = Math.max(0, Math.min(255, Math.round(value * 255)));
    }
  }
  return `data:image/png;base64,${encodeGrayPng(VIEW, pixels).toString("base64")}`;
}

function propagationFor(archetypeId: string, candidateId: number) {
  let loaded: ReturnType<typeof loadVerifiedZ0>;
  try {
    loaded = loadVerifiedZ0(archetypeId, candidateId);
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "The saved state does not match this drawing.";
    return { ready: false as const, reason };
  }
  if (!loaded) return { ready: false as const, reason: "This drawing has no saved vertical state yet." };
  const run = startScanFromZ0({
    translation: loaded.meta.rules.translation,
    slime: loaded.meta.rules.slime,
    state: loaded.state,
    branchSeed: candidateId + 1,
  });
  const slices: string[] = [];
  for (let index = 0; index < SLICES; index += 1) {
    slices.push(slicePng(takeSlice(run.state, index)));
    if (index < SLICES - 1) advanceScan(run, STEPS);
  }
  return { ready: true as const, slices };
}

function exportPropagation(catalog: EvolutionCatalog) {
  const ready: string[] = [];
  const pending: string[] = [];
  for (const archetype of catalog.archetypes) {
    for (const candidate of archetype.candidates) {
      if (!candidate.image) continue;
      const body = propagationFor(candidate.archetypeId, candidate.id);
      writeJson(`skill2/propagation/${candidate.archetypeId}/${candidate.id}.json`, body);
      const key = `${candidate.archetypeId}/${candidate.id}`;
      if (body.ready) ready.push(key);
      else pending.push(key);
    }
  }
  return { ready, pending };
}

async function exportSkill1() {
  const source = join(ROOT, "public", "shared-catalog");
  const archetypes: { id: string; entries: number }[] = [];
  if (!existsSync(source)) return { archetypes, entries: 0, images: 0 };
  let entries = 0;
  let images = 0;
  for (const archetype of Object.values(ARCHETYPES)) {
    const dir = join(source, archetype.id);
    const index = join(dir, "entries.json");
    if (!existsSync(index)) continue;
    const parsed = JSON.parse(readFileSync(index, "utf8")) as { id?: string; image?: string }[];
    if (!Array.isArray(parsed)) continue;
    const next = [];
    for (const entry of parsed) {
      if (!entry.id) {
        next.push(entry);
        continue;
      }
      const file = `${safeFileName(entry.id)}.webp`;
      const png = join(dir, `${safeFileName(entry.id)}.png`);
      if (!existsSync(png)) {
        next.push({ ...entry, image: undefined });
        continue;
      }
      const target = join(OUT, "skill1", archetype.id, file);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, await presentationWebp(readFileSync(png), SKILL1_MAX));
      images += 1;
      next.push({ ...entry, image: `/demo/skill1/${archetype.id}/${file}` });
    }
    writeJson(`skill1/${archetype.id}/entries.json`, next);
    entries += next.length;
    archetypes.push({ id: archetype.id, entries: next.length });
  }
  return { archetypes, entries, images };
}

function exportSkill3() {
  const dir = join(ROOT, "data", "skill3");
  const stored = existsSync(dir)
    ? readdirSync(dir).filter((name) => name.endsWith(".json"))
    : [];
  return {
    bundles: stored,
    note: stored.length
      ? "JSON files exist under data/skill3. They were listed, not copied, until a display bundle format is stored."
      : "No Skill 3 continuation bundle is stored on disk. The vertical pages rebuild fields in /api/vertical, so nothing was copied.",
  };
}

function rewritePlate(src: string) {
  const semantic = /^\/api\/semantic-catalog\/([a-z0-9-]+)\/(\d+)$/.exec(src);
  const evolution = /^\/api\/evolution\/([a-z0-9-]+)\/(\d+)$/.exec(src);
  const match = semantic ?? evolution;
  if (match) return previewUrl(match[1], Number(match[2]));
  if (src.startsWith("/shared-catalog/") && src.endsWith(".png")) {
    return src.replace("/shared-catalog/", "/demo/skill1/").replace(/\.png$/, ".webp");
  }
  return src;
}

function countCandidates(catalogs: EvolutionCatalog[]) {
  const ids = new Set<string>();
  for (const catalog of catalogs) {
    for (const archetype of catalog.archetypes) {
      for (const candidate of archetype.candidates) ids.add(candidate.key);
    }
  }
  return ids.size;
}

function walk(dir: string, files: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const processCatalog = loadEvolutionCatalog();
  const shownCatalog = loadShownCatalog();
  const written = new Set<string>();
  const processImages = await copyPreviews(processCatalog, written);
  const shownImages = await copyPreviews(shownCatalog, written);
  writeJson("skill2/process.json", withPreviewUrls(processCatalog));
  writeJson("skill2/catalog.json", withPreviewUrls(shownCatalog));
  const picks = loadSavedPicks();
  writeJson("skill2/picks.json", picks);
  const propagation = exportPropagation(shownCatalog);

  const skill1 = await exportSkill1();
  const plates = loadHomeResultPlates();
  const home = {
    plates: {
      "skill-1": (plates["skill-1"] ?? []).map((plate) => ({ ...plate, src: rewritePlate(plate.src) })),
      "skill-2": (plates["skill-2"] ?? []).map((plate) => ({ ...plate, src: rewritePlate(plate.src) })),
    },
    labDemo: loadLabDemo(),
  };
  writeJson("home/presentation.json", home);

  const skill3 = exportSkill3();
  const skill4Fixtures = PROVISIONAL_MOCK_IDS.map((id) => `lib/skill4/fixtures/${id}.json`);
  const candidates = countCandidates([processCatalog, shownCatalog]);
  const manifest = {
    presentation: "public-demo",
    skill1,
    skill2: {
      processArchetypes: processCatalog.archetypes.length,
      catalogArchetypes: shownCatalog.archetypes.length,
      candidates,
      previews: written.size,
      missingPreviews: processImages.missing + shownImages.missing,
      picks: picks.length,
      propagationReady: propagation.ready.length,
      propagationPending: propagation.pending.length,
    },
    skill3,
    skill4: {
      copied: false,
      fixtures: skill4Fixtures,
    },
    home,
  };
  writeJson("manifest.json", manifest);

  const files = walk(OUT);
  const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
  const previews = files.filter((file) => file.includes(`${join("skill2", "previews")}`) && file.endsWith(".webp"));
  const previewSizes = previews.map((file) => statSync(file).size);
  const previewBytes = previewSizes.reduce((sum, size) => sum + size, 0);
  console.log(JSON.stringify({
    files: files.length,
    bytes,
    candidates,
    previews: written.size,
    previewFiles: previews.length,
    averagePreviewBytes: previewSizes.length ? Math.round(previewBytes / previewSizes.length) : 0,
    largestPreviewBytes: previewSizes.length ? Math.max(...previewSizes) : 0,
    propagationReady: propagation.ready.length,
    propagationPending: propagation.pending.length,
    skill1Entries: skill1.entries,
    skill1Images: skill1.images,
  }, null, 2));
}

void main();
