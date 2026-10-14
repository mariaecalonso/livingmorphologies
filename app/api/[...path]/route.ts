import { NextResponse } from "next/server";
import { evolutionGet } from "@/lib/server-routes/evolution";
import { filamentGet, filamentPost } from "@/lib/server-routes/filament";
import { semanticCatalogGet, semanticCatalogPost } from "@/lib/server-routes/semantic-catalog";
import { semanticRunGet } from "@/lib/server-routes/semantic-run";
import { sharedCatalogDelete, sharedCatalogPost } from "@/lib/server-routes/shared-catalog";
import { skill2PicksGet, skill2PicksPost } from "@/lib/server-routes/skill2-picks";
import { skill4HandoffGet } from "@/lib/server-routes/skill4-handoff";
import { verticalGet } from "@/lib/server-routes/vertical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ path: string[] }> };

/** Every API URL shares this function so the Hobby plan can deploy. */
export function GET(request: Request, context: Context) {
  return context.params.then(({ path }) => {
    const [head, ...rest] = path;
    if (head === "evolution") return evolutionGet(request, rest);
    if (head === "filament") return filamentGet(request, rest);
    if (head === "semantic-catalog") return semanticCatalogGet(request, rest);
    if (head === "semantic-run" && rest.length === 2) return semanticRunGet(rest[0], rest[1]);
    if (head === "skill2-picks" && rest.length === 0) return skill2PicksGet();
    if (head === "skill4" && rest[0] === "handoff" && rest.length === 1) return skill4HandoffGet(request);
    if (head === "vertical") return verticalGet(request, rest);
    return new NextResponse(null, { status: 404 });
  });
}

export function POST(request: Request, context: Context) {
  return context.params.then(({ path }) => {
    const [head, ...rest] = path;
    if (head === "filament") return filamentPost(request, rest);
    if (head === "semantic-catalog") return semanticCatalogPost(request, rest);
    if (head === "shared-catalog" && rest.length === 0) return sharedCatalogPost(request);
    if (head === "skill2-picks" && rest.length === 0) return skill2PicksPost(request);
    return new NextResponse(null, { status: 404 });
  });
}

export function DELETE(request: Request, context: Context) {
  return context.params.then(({ path }) => {
    if (path.length === 1 && path[0] === "shared-catalog") return sharedCatalogDelete(request);
    return new NextResponse(null, { status: 404 });
  });
}
