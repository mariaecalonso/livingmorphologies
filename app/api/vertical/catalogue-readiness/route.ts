import { catalogueReadiness } from "@/lib/skill3/catalogue-readiness";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const archetype = new URL(request.url).searchParams.get("archetype") ?? "";
  return NextResponse.json(catalogueReadiness(archetype), { headers: { "cache-control": "no-store" } });
}
