import { redirect } from "next/navigation";
import { ClusterPlacement, FinishedProgramCatalog } from "@/components/hybrid/cluster-placement";
import { DifferentiationReview } from "@/components/hybrid/differentiation-review";
import { CLUSTER_ARCHIVE } from "@/lib/site-map";
import "@/app/lab/site/site-interface.css";
import "@/app/lab/hybrid/skill4-interface.css";

const SHEETS = new Set(["compatibility", "placement", "morphology", "differentiation", "catalog"]);
const TITLE: Record<string, string> = {
  compatibility: "Tile Compatibility",
  placement: "Cluster Placement",
  morphology: "Morphology Review",
  differentiation: "Differentiation",
  catalog: "Finished Catalogs",
};

function keepParams(params: Record<string, string | string[] | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "sheet") continue;
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
  const title = (sheet && TITLE[sheet]) || TITLE.compatibility;
  return { title: `${title} -+ ${CLUSTER_ARCHIVE.label} -+ Living Morphologies` };
}

export default async function ArchivedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sheet = Array.isArray(params.sheet) ? params.sheet[0] : params.sheet;
  if (!sheet || !SHEETS.has(sheet)) {
    const next = keepParams(params);
    next.set("sheet", "compatibility");
    redirect(`/lab/archived?${next.toString()}`);
  }
  if (sheet === "differentiation") return <DifferentiationReview />;
  if (sheet === "catalog") return <FinishedProgramCatalog />;
  const step = sheet === "morphology" || sheet === "placement" ? sheet : "compatibility";
  return <ClusterPlacement sheet={step} base="/lab/archived" />;
}
