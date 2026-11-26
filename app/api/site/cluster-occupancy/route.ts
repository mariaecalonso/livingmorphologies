import { NextResponse } from "next/server";
import { OccupancyError, placeOccupancyRecord } from "@/lib/skill5/occupancy-actions";
import { readPose } from "@/lib/skill5/placed-cluster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      zoneId?: unknown;
      programId?: unknown;
      finishedClusterId?: unknown;
      provenance?: unknown;
      transform?: unknown;
      networkId?: unknown;
      occupancyId?: unknown;
      stackOnPlan?: unknown;
    };
    const stackOnPlan = body.stackOnPlan && typeof body.stackOnPlan === "object"
      && typeof (body.stackOnPlan as { x?: unknown }).x === "number"
      && typeof (body.stackOnPlan as { z?: unknown }).z === "number"
      ? { x: (body.stackOnPlan as { x: number }).x, z: (body.stackOnPlan as { z: number }).z }
      : undefined;
    if (typeof body.zoneId !== "string" || typeof body.programId !== "string" || typeof body.finishedClusterId !== "string") {
      return NextResponse.json({ error: "A zone, program, and finished cluster are required." }, { status: 400 });
    }
    const record = placeOccupancyRecord({
      zoneId: body.zoneId,
      programId: body.programId,
      finishedClusterId: body.finishedClusterId,
      provenance: body.provenance === "assisted" || body.provenance === "automatic-initial" || body.provenance === "manual"
        ? body.provenance
        : "manual",
      transform: readPose(body.transform) ?? undefined,
      networkId: typeof body.networkId === "string" ? body.networkId : undefined,
      occupancyId: typeof body.occupancyId === "string" ? body.occupancyId : undefined,
      stackOnPlan,
    });
    return NextResponse.json(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The occupancy could not be assigned.";
    const status = error instanceof OccupancyError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
