import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { archiveImagePath, catalogScores, loadEvolutionCatalog } from "@/lib/skill2/evolution-index";
import { readCatalogFilament, semanticPreviewPath } from "@/lib/skill2/filament";
import { encodeGrayPng } from "@/lib/skill2/semantic/gray-png";
import { loadVerifiedZ0 } from "@/lib/skill2/semantic/z0-snapshot";
import { advanceScan, startScanFromZ0, takeSlice } from "@/lib/scan/volume";

const SLICES = 5;
const STEPS = 4;
const VIEW = 48;

export async function evolutionGet(_request: Request, path: string[]) {
  if (path.length === 0) return NextResponse.json(catalogScores(loadEvolutionCatalog()));
  if (path.length === 3 && path[2] === "propagation") return propagation(path[0], path[1]);
  if (path.length === 2) return drawing(path[0], path[1]);
  return new NextResponse(null, { status: 404 });
}

async function drawing(archetype: string, id: string) {
  const semantic = semanticPreviewPath(archetype, id);
  const bytes = semantic ? readCatalogFilament(archetype, semantic, id) : null;
  if (bytes) {
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
    });
  }
  const file = archiveImagePath(archetype, id);
  if (!file) return new NextResponse(null, { status: 404 });
  const stored = await readFile(file);
  return new NextResponse(stored, {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
  });
}

function propagation(archetype: string, id: string) {
  const candidateId = Number(id);
  if (!Number.isInteger(candidateId)) {
    return NextResponse.json({ ready: false, reason: "This drawing has no saved vertical state yet." });
  }
  let loaded: ReturnType<typeof loadVerifiedZ0>;
  try {
    loaded = loadVerifiedZ0(archetype, candidateId);
  } catch {
    return NextResponse.json({ ready: false, reason: "The saved state does not match this drawing." }, { status: 409 });
  }
  if (!loaded) {
    return NextResponse.json({ ready: false, reason: "This drawing has no saved vertical state yet." });
  }
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
  return NextResponse.json({ ready: true, slices });
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
