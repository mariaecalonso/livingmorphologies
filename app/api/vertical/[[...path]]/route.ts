import { verticalGet } from "@/lib/server-routes/vertical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ path?: string[] }> };

export function GET(request: Request, context: Context) {
  return context.params.then(({ path }) => verticalGet(request, path ?? []));
}
