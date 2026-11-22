import { redirect } from "next/navigation";

/** The connection workflow lives in Cluster Placement. Catalog routes stay on this workspace. */
export default async function HybridPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  next.set("sheet", "placement");
  for (const [key, value] of Object.entries(params)) {
    if (value == null || key === "sheet") continue;
    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else next.set(key, value);
  }
  redirect(`/lab/site?${next.toString()}`);
}
