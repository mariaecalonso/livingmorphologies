import { NextResponse } from "next/server";
import {
  readPublishedSelectedNetwork,
  writePublishedSelectedNetwork,
  SelectedSiteNetworkError,
} from "@/lib/skill5/selected-site-network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(readPublishedSelectedNetwork(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The published selection could not be read.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { massingNetworkId?: unknown; iteration?: unknown };
    if (typeof body.massingNetworkId !== "string") {
      return NextResponse.json({ error: "A Site Strategy network id is required." }, { status: 400 });
    }
    const saved = writePublishedSelectedNetwork(body.massingNetworkId, body.iteration);
    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The published selection could not be saved.";
    const status = error instanceof SelectedSiteNetworkError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
