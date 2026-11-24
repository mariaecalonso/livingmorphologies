import { NextResponse } from "next/server";
import { packAutomaticOccupancy } from "@/lib/skill5/cluster-assembly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional Placement assistance. Runs existing packing, then stops at occupancy.
 * Shrinkwrap is not returned and is not occupancy state.
 */
export async function POST() {
  try {
    const occupancy = packAutomaticOccupancy();
    return NextResponse.json({ occupancy, provenance: "automatic-initial" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic initial placement could not run.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
