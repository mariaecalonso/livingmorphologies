import { mkdir, readdir, readFile, rename, rmdir, unlink, writeFile } from "fs/promises";
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
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "shared-catalog", archetypeId);
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

async function readEntries(file: string): Promise<IncomingEntry[] | null> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as IncomingEntry[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { archetypeId?: string; entries?: IncomingEntry[]; replace?: boolean };
  const archetypeId = body.archetypeId;
  const incoming = Array.isArray(body.entries) ? body.entries : [];
  if (!archetypeId || !incoming.length) {
    return NextResponse.json({ ok: false, error: "missing catalog batch" }, { status: 400 });
  }

  const dir = rootDir(archetypeId);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "entries.json");
  const existing = body.replace ? [] : await readEntries(file);
  if (!body.replace && existing == null) {
    return NextResponse.json({ ok: false, error: "catalog unreadable" }, { status: 409 });
  }
  const byRun = new Map((existing ?? []).map((item) => [item.run, item]));

  for (const item of incoming) {
    if (!item?.id || !item.image || typeof item.run !== "number") continue;
    const png = dataUrlToPng(item.image);
    if (!png) continue;
    const image = `/shared-catalog/${archetypeId}/${safeFileName(item.id)}.png`;
    const previous = byRun.get(item.run);
    if (previous?.image && previous.image !== image) {
      try {
        await unlink(path.join(/*turbopackIgnore: true*/ process.cwd(), "public", previous.image.replace(/^\//, "")));
      } catch {
        /* leftover blank is fine */
      }
    }
    await writeFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "public", image.replace(/^\//, "")), png);
    const { image: _image, ...meta } = item;
    byRun.set(item.run, { ...meta, image });
  }

  const entries = [...byRun.values()].sort((a, b) => a.run - b.run);
  const next = `${JSON.stringify(entries, null, 2)}\n`;
  const temp = `${file}.tmp`;
  await writeFile(temp, next);
  try {
    await unlink(file);
  } catch {
    /* the first save has no catalog file yet */
  }
  try {
    await rename(temp, file);
  } catch {
    await writeFile(file, next);
    await unlink(temp).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, archetypeId, count: entries.length });
}

export async function DELETE(request: Request) {
  const archetypeId = new URL(request.url).searchParams.get("archetypeId") ?? "";
  if (!/^[a-z0-9-]+$/.test(archetypeId)) {
    return NextResponse.json({ ok: false, error: "bad archetype" }, { status: 400 });
  }

  const dir = rootDir(archetypeId);
  try {
    const names = await readdir(dir);
    await Promise.all(names.map((name) => unlink(path.join(/*turbopackIgnore: true*/ dir, name)).catch(() => undefined)));
    await rmdir(dir).catch(() => undefined);
  } catch {
    /* already gone */
  }
  return NextResponse.json({ ok: true, archetypeId, count: 0 });
}
