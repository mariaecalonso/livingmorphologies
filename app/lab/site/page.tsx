import { redirect } from "next/navigation";
import { SiteWorkspace } from "@/components/site/site-workspace";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("site");
const tab = workspace.tabs[1];
const MODEL_SHEETS = new Set(["strategy", "zoning", "placement", "assembly"]);

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default async function SitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sheet = Array.isArray(params.sheet) ? params.sheet[0] : params.sheet;
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
