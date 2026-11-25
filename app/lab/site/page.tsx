import { redirect } from "next/navigation";
import { ClusterPlacement } from "@/components/hybrid/cluster-placement";
import { ClusterAssemblyView } from "@/components/site/cluster-assembly-view";
import { SiteWorkspace } from "@/components/site/site-workspace";
import { labWorkspace, PROGRAM_CLUSTER_2_ARCHIVED } from "@/lib/site-map";

const workspace = labWorkspace("site");
const clusterWorkspace = labWorkspace("cluster-integration");
const MODEL_SHEETS = new Set(["strategy", "zoning", "placement", "assembly", "configurations"]);
const PROGRAM_CLUSTER_SHEETS = new Set(["placement", "compatibility", "morphology", "catalog"]);
const SHEET_TITLE: Record<string, string> = {
  strategy: "Site Strategy",
  zoning: "Zoning",
  placement: "Cluster Placement",
  assembly: "Assembly",
  "cluster-assembly": "Cluster Assembly",
  configurations: "Configurations",
  compatibility: "Tile Compatibility",
  catalog: "Cluster Catalog",
  morphology: "Morphology Review",
};

function keepParams(params: Record<string, string | string[] | undefined>, dropSheet = false) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (dropSheet && key === "sheet") continue;
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else next.set(key, value);
  }
  return next;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sheet = Array.isArray(params.sheet) ? params.sheet[0] : params.sheet;
  const title = (sheet && SHEET_TITLE[sheet]) || "Site Strategy";
  const stage = sheet === "placement" || sheet === "cluster-assembly" || sheet === "assembly" || sheet === "configurations" || sheet === "compatibility" || sheet === "morphology"
    ? clusterWorkspace.label
    : workspace.label;
  return { title: `${title} -+ ${stage} -+ Living Morphologies` };
}

export default async function SitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sheet = Array.isArray(params.sheet) ? params.sheet[0] : params.sheet;

  // Program Cluster 2.0 (Tile Compatibility / Cluster Placement catalog / Morphology Review) is archived.
  if (PROGRAM_CLUSTER_2_ARCHIVED !== false && sheet && PROGRAM_CLUSTER_SHEETS.has(sheet)) {
    const next = keepParams(params, true);
    next.set("sheet", "cluster-assembly");
    redirect(`/lab/site?${next.toString()}`);
  }

  if (sheet === "catalog") {
    const next = keepParams(params, true);
    next.set("sheet", "placement");
    redirect(`/lab/site?${next.toString()}`);
  }
  if (sheet === "compatibility" || sheet === "morphology") {
    return <ClusterPlacement sheet={sheet} />;
  }
  if (sheet === "cluster-assembly") return <ClusterAssemblyView />;
  if (!sheet || !MODEL_SHEETS.has(sheet)) {
    const next = keepParams(params, true);
    const query = next.toString();
    redirect(`/lab/site/analysis${query ? `?${query}` : ""}`);
  }
  return <SiteWorkspace />;
}
