import { redirect } from "next/navigation";

export default async function SiteConfigurationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else next.set(key, value);
  }
  next.set("sheet", "configurations");
  redirect(`/lab/site?${next.toString()}`);
}
