import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const program = url.searchParams.get("program") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!program || !id || program.includes("..") || id.includes("..") || program.includes("/") || id.includes("/") || program.includes("\\") || id.includes("\\")) {
    return Response.json(null);
  }
  try {
    const file = path.join(process.cwd(), "data", "skill4", "finished", program, `${id.replaceAll(":", "__")}.json`);
    return Response.json(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return Response.json(null);
  }
}
