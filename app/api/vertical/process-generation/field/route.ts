import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "data", "experiments", "process-generation", "vertical-void-351", "N24");
const STAGES = new Set(["xyt", "macro", "processed"]);
const GRID = 72;

/**
 * Display bytes for one stored float32 field.
 * Each byte is round(clamp(value, 0, 1) * 255). The float32 file is unchanged.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("archetype") !== "vertical-void" || url.searchParams.get("candidate") !== "351" || url.searchParams.get("continuation") !== "N24") {
    return NextResponse.json({ error: "Live generation data is not stored for this continuation." }, { status: 404 });
  }
  const retained = Number(url.searchParams.get("retained"));
  const stage = url.searchParams.get("stage") ?? "";
  if (!Number.isInteger(retained) || retained < 2 || retained > 6 || !STAGES.has(stage)) {
    return NextResponse.json({ error: "That generation field is not stored." }, { status: 404 });
  }
  const file = path.join(ROOT, `p${String(retained).padStart(2, "0")}-${stage}.f32`);
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    return NextResponse.json({ error: "That generation field is not stored." }, { status: 404 });
  }
  const source = readFileSync(file);
  const expected = GRID * GRID * GRID * 4;
  if (source.byteLength !== expected) {
    return NextResponse.json({ error: "That generation field is not stored." }, { status: 404 });
  }
  const floats = new Float32Array(source.buffer, source.byteOffset, source.byteLength / 4);
  const bytes = new Uint8Array(floats.length);
  for (let index = 0; index < floats.length; index += 1) {
    const value = floats[index];
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    bytes[index] = Math.round(clamped * 255);
  }
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/octet-stream",
      "cache-control": "no-store",
    },
  });
}
