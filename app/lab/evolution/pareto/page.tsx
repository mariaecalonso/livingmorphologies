import { redirect } from "next/navigation";

export default async function ParetoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  const suffix = query.toString();
  redirect(`/lab/evolution/pareto-catalog${suffix ? `?${suffix}` : ""}`);
}
