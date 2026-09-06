export type PriceSummary = {
  count: number;
  low: number | null;
  median: number | null;
  high: number | null;
  p25: number | null;
  p75: number | null;
};

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function summarizePrices(values: number[]): PriceSummary {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  return {
    count: sorted.length,
    low: sorted.length ? sorted[0] : null,
    median: percentile(sorted, 0.5),
    high: sorted.length ? sorted[sorted.length - 1] : null,
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
  };
}
