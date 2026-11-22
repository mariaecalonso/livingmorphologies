import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "data", "skill4", "morphology-review");

export function GET(request: Request) {
  const thumb = new URL(request.url).searchParams.get("thumb");
  if (thumb) {
    if (!/^[\w.-]+\.png$/.test(thumb) || thumb.includes("..")) return new Response(null, { status: 404 });
    try {
      const bytes = readFileSync(path.join(ROOT, "thumbs", thumb));
      return new Response(bytes, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
    } catch {
      return new Response(null, { status: 404 });
    }
  }
  try {
    const boards = readdirSync(ROOT)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(path.join(ROOT, name), "utf8")));
    return Response.json(boards);
  } catch {
    return Response.json([]);
  }
}
