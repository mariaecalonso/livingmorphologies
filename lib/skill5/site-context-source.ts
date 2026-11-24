import { readFileSync } from "node:fs";
import path from "node:path";
import type { SiteContext } from "./site-model";

/**
 * Shared Site / urban-context authority for Drawing and Rendering.
 * Do not duplicate herald-site.json into those labs.
 * Named as a shared source in `lib/lab-contracts.ts`.
 */
export const SITE_CONTEXT_PATH = "data/skill5/herald-site.json" as const;

const FILE = path.join(process.cwd(), SITE_CONTEXT_PATH);

export type SiteContextSource = {
  path: typeof SITE_CONTEXT_PATH;
  contract: SiteContext["contract"];
  revision: string;
  retrieved: string;
  axes: SiteContext["axes"];
  origin: SiteContext["origin"];
  folio: string;
  sources: SiteContext["sources"];
};

export function siteContextRevision(context: Pick<SiteContext, "contract" | "retrieved">) {
  return `${context.contract}|${context.retrieved}|${SITE_CONTEXT_PATH}`;
}

export function readSiteContextSource(): SiteContextSource {
  const context = JSON.parse(readFileSync(FILE, "utf8")) as SiteContext;
  return {
    path: SITE_CONTEXT_PATH,
    contract: context.contract,
    revision: siteContextRevision(context),
    retrieved: context.retrieved,
    axes: context.axes,
    origin: context.origin,
    folio: context.site.folio,
    sources: context.sources,
  };
}
