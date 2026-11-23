import { redirect } from "next/navigation";
import { ClusterPlacement } from "@/components/hybrid/cluster-placement";
import { SiteWorkspace } from "@/components/site/site-workspace";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("site");
const clusterWorkspace = labWorkspace("cluster-integration");
const MODEL_SHEETS = new Set(["strategy", "zoning", "placement", "assembly", "configurations"]);
const SHEET_TITLE: Record<string, string> = {
  strategy: "Site Strategy",
  zoning: "Zoning",
  placement: "Cluster Placement",
  assembly: "Assembly",
  configurations: "Configurations",
  compatibility: "Tile Compatibility",
  catalog: "Cluster Catalog",
  morphology: "Morphology Review",
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sheet = Array.isArray(params.sheet) ? params.sheet[0] : params.sheet;
  const title = (sheet && SHEET_TITLE[sheet]) || "Site Strategy";
  const stage = sheet === "placement" || sheet === "assembly" || sheet === "configurations" ? clusterWorkspace.label : workspace.label;
  return { title: `${title} -+ ${stage} -+ Living Morphologies` };
}

export default async function SitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sheet = Array.isArray(params.sheet) ? params.sheet[0] : params.sheet;
  if (sheet === "catalog") {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "sheet" || value == null) continue;
      if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
      else next.set(key, value);
    }
    next.set("sheet", "placement");
    redirect(`/lab/site?${next.toString()}`);
  }
  if (sheet === "compatibility" || sheet === "morphology") {
    return <ClusterPlacement sheet={sheet} />;
  }
  if (!sheet || !MODEL_SHEETS.has(sheet)) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "sheet" || value == null) continue;
      if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
      else next.set(key, value);
    }
    const query = next.toString();
    redirect(`/lab/site/analysis${query ? `?${query}` : ""}`);
  }
  return <SiteWorkspace />;
}
