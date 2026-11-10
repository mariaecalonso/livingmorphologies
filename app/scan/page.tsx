import { redirect } from "next/navigation";

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]) =>
      (Array.isArray(value) ? value : [value ?? ""]).map((item) => [key, item]),
    ),
  ).toString();
  redirect(query ? `/vertical?${query}` : "/vertical");
}
