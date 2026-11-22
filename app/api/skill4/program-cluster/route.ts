import { generateProgramClusters } from "@/lib/skill4/program-cluster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const programId = new URL(request.url).searchParams.get("program") ?? "";
  return Response.json(generateProgramClusters(programId));
}
