import { NextResponse } from "next/server";
import context from "@/data/skill5/herald-site.json";
import type { SiteContext } from "@/lib/skill5/site-model";
import { matchHighlightPhotos, type ImageryHighlight } from "@/lib/skill5/view-imagery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const site = context as SiteContext;

function highlight(value: unknown): ImageryHighlight | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ImageryHighlight>;
  if (typeof item.id !== "string" || typeof item.title !== "string") return null;
  if (item.kind !== "obstacle" && item.kind !== "waterfront" && item.kind !== "open") return null;
  if (typeof item.x !== "number" || typeof item.z !== "number") return null;
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    x: item.x,
    z: item.z,
    targetId: typeof item.targetId === "string" ? item.targetId : null,
  };
}

export async function POST(request: Request) {
  let body: { origin?: { x?: unknown; z?: unknown }; highlights?: unknown } = {};
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ photos: [] });
  }
  const origin = body.origin;
  const highlights = Array.isArray(body.highlights) ? body.highlights.map(highlight).filter((item): item is ImageryHighlight => item !== null) : [];
  if (!origin || typeof origin.x !== "number" || typeof origin.z !== "number") return NextResponse.json({ photos: [] });
  const photos = await matchHighlightPhotos({ x: origin.x, z: origin.z }, highlights, site.origin);
  return NextResponse.json({ photos });
}
