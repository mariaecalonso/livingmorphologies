import { redirect } from "next/navigation";
import { ClusterPlacement } from "@/components/hybrid/cluster-placement";
import { SiteWorkspace } from "@/components/site/site-workspace";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("site");
const tab = workspace.tabs[1];
const MODEL_SHEETS = new Set(["strategy", "zoning", "placement", "assembly"]);

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sheet = Array.isArray(params.sheet) ? params.sheet[0] : params.sheet;
  const title = sheet === "compatibility" ? "Tile Compatibility" : sheet === "catalog" ? "Cluster Catalog" : sheet === "morphology" ? "Morphology Review" : sheet === "placement" ? "Cluster Placement" : tab.label;
  return { title: `${title} -+ ${workspace.label} -+ Living Morphologies` };
}

export default async function SitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sheet = Array.isArray(params.sheet) ? params.sheet[0] : params.sheet;
  if (sheet === "compatibility" || sheet === "placement" || sheet === "catalog" || sheet === "morphology") {
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
