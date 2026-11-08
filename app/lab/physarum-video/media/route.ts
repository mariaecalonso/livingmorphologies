import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";

export const runtime = "nodejs";

const CLIPS: Record<string, { file: string; type: string }> = {
  project: { file: "project.mp4", type: "video/mp4" },
  recorda: { file: "record-a.mp4", type: "video/mp4" },
  recordb: { file: "record-b.mp4", type: "video/mp4" },
  recordc: { file: "record-c.mp4", type: "video/mp4" },
  network: { file: "network.gif", type: "image/gif" },
  front: { file: "front.gif", type: "image/gif" },
};

export async function GET(request: Request) {
  const clip = new URL(request.url).searchParams.get("clip");
  const entry = clip ? CLIPS[clip] : undefined;
  if (!entry) return new Response(null, { status: 404 });
  const file = path.join(process.cwd(), "app", "lab", "physarum-video", "clips", entry.file);
  let size = 0;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response(null, { status: 404 });
  }
  const range = request.headers.get("range");
  if (!range || !range.startsWith("bytes=")) {
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: {
        "content-type": entry.type,
        "content-length": String(size),
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=3600",
      },
    });
  }
  const [startText, endText] = range.replace("bytes=", "").split("-");
  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (!Number.isFinite(start) || start < 0 || start >= size || end < start || end >= size) {
    return new Response(null, { status: 416 });
  }
  return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
    status: 206,
    headers: {
      "content-type": entry.type,
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${size}`,
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=3600",
    },
  });
}
