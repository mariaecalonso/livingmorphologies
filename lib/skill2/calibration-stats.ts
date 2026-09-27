export type NumericDistribution = {
  n: number;
  min: number;
  max: number;
  mean: number;
  stdev: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

const finite = (values: number[]) => values.filter((value) => Number.isFinite(value));

export function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - index) + sorted[hi] * (index - lo);
}

export function describeDistribution(values: number[]): NumericDistribution {
  const data = finite(values).sort((a, b) => a - b);
  const n = data.length;
  if (n === 0) {
    return { n: 0, min: 0, max: 0, mean: 0, stdev: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 };
  }
  const sum = data.reduce((acc, value) => acc + value, 0);
  const mean = sum / n;
  const variance = n > 1 ? data.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    min: data[0],
    max: data[n - 1],
    mean,
    stdev: Math.sqrt(variance),
    p10: percentile(data, 0.1),
    p25: percentile(data, 0.25),
    p50: percentile(data, 0.5),
    p75: percentile(data, 0.75),
    p90: percentile(data, 0.9),
  };
}

export function flattenNumbers(value: unknown, prefix = ""): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof value === "number" && Number.isFinite(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      Object.assign(out, flattenNumbers(nested, path));
    }
  }
  return out;
}
