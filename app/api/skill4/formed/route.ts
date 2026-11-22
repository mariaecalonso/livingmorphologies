import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMED = path.join(process.cwd(), "data", "skill4", "formed");

export function GET(request: Request) {
  const url = new URL(request.url);
  const program = url.searchParams.get("program") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!program || program.includes("..") || program.includes("/") || program.includes("\\")) {
    return Response.json({ ids: [] });
  }
  const dir = path.join(FORMED, program);
  try {
    if (!id) {
      const ids = readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -".json".length).replaceAll("__", ":"));
      return Response.json({ ids });
    }
    if (id.includes("..") || id.includes("/") || id.includes("\\")) return Response.json(null);
    const file = path.join(dir, `${id.replaceAll(":", "__")}.json`);
    return Response.json(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return Response.json(id ? null : { ids: [] });
  }
}
