import { skill4HandoffGet } from "@/lib/server-routes/skill4-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return skill4HandoffGet(request);
}
