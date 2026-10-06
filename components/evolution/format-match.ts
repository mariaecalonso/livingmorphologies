/** MOO match scores are stored on 0–1. The interface reads them as percents. */
export function formatMatch(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}
