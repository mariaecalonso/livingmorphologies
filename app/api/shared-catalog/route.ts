import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type IncomingEntry = {
  id: string;
  archetypeId: string;
  run: number;
  seed: number;
  image?: string;
  [key: string]: unknown;
};

function safeFileName(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

function rootDir(archetypeId: string) {
  return path.join(process.cwd(), "public", "shared-catalog", archetypeId);
}

function dataUrlToPng(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

async function readEntries(file: string): Promise<IncomingEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as IncomingEntry[]) : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { archetypeId?: string; entries?: IncomingEntry[] };
  const archetypeId = body.archetypeId;
  const incoming = Array.isArray(body.entries) ? body.entries : [];
  if (!archetypeId || !incoming.length) {
    return NextResponse.json({ ok: false, error: "missing catalog batch" }, { status: 400 });
  }

  const dir = rootDir(archetypeId);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "entries.json");
  const byId = new Map( (await readEntries(file)).map((item) => [item.id, item]) );

  for (const item of incoming) {
    if (!item?.id || !item.image) continue;
    const png = dataUrlToPng(item.image);
    if (!png) continue;
    const image = `/shared-catalog/${archetypeId}/${safeFileName(item.id)}.png`;
    await writeFile(path.join(process.cwd(), "public", image.replace(/^\//, "")), png);
    const { image: _image, ...meta } = item;
    byId.set(item.id, { ...meta, image });
  }

  const entries = [...byId.values()].sort((a, b) => a.run - b.run);
  await writeFile(file, `${JSON.stringify(entries, null, 2)}\n`);
  return NextResponse.json({ ok: true, archetypeId, count: entries.length });
}
