import { NextResponse } from "next/server";
import { buildReadingLabView } from "@/lib/interpretation/reading-view";

export const dynamic = "force-dynamic";

let cache: ReturnType<typeof buildReadingLabView> | null = null;

export async function GET() {
  try {
    cache ??= buildReadingLabView();
    return NextResponse.json(cache);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The reading did not load.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
