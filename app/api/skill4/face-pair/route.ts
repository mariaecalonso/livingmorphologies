import { rankCompatibleFaces } from "@/lib/skill4/cluster-face-pair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const archetypeA = url.searchParams.get("a") ?? "";
  const archetypeB = url.searchParams.get("b") ?? "";
  return Response.json({ pairs: rankCompatibleFaces(archetypeA, archetypeB) });
}
