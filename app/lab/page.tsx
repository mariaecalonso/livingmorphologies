import { redirect } from "next/navigation";
import { LAB_ENTRY } from "@/lib/site-map";

/** The site Overall Workflow is the map. /lab opens the first skill. */
export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.set(key, value);
    else if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
  }
  const query = search.toString();
  redirect(query ? `${LAB_ENTRY.href}?${query}` : LAB_ENTRY.href);
}
