import { generateProgramClusters } from "@/lib/skill4/program-cluster";
import { readProgramClusterRules } from "@/lib/skill4/program-readout";
import { ClientDocumentError } from "@/lib/skill5/load-client-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: unknown) {
  const message = error instanceof ClientDocumentError || error instanceof Error
    ? error.message
    : "Client documents could not be read.";
  return Response.json({ error: message }, { status: 500 });
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const programId = url.searchParams.get("program") ?? "";
  try {
    if (url.searchParams.get("view") === "readout") {
      return Response.json(readProgramClusterRules(programId));
    }
    return Response.json(generateProgramClusters(programId));
  } catch (error) {
    return fail(error);
  }
}
