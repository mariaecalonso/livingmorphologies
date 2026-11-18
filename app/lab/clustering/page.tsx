import { ClusteringWorkspace } from "@/components/clustering/clustering-workspace";
import { labWorkspace } from "@/lib/site-map";

const workspace = labWorkspace("clustering");
const tab = workspace.tabs.find((item) => item.href === "/lab/clustering") ?? workspace.tabs[1];

export const metadata = {
  title: `${tab.label} -+ ${workspace.label} -+ Living Morphologies`,
};

export default async function ClusteringPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requested = typeof params.collection === "string" ? params.collection : "clustering-overnight-v1";
  const allowed = requested === "small-ground-v1" || requested === "small-ground-v2" || requested === "organization-v1" || requested === "initial-clustering-lab" || requested === "initial-clustering-coverage" || requested === "clustering-expansion-v1" || requested === "clustering-five-tile-v1" || requested === "clustering-overnight-v1";
  const collection = allowed ? requested : "clustering-overnight-v1";
  return <ClusteringWorkspace tab="initial" collection={collection} />;
}
