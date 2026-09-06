import { geocodeUsLocation } from '@/lib/pricing/geocode';
import type { PriceObservationInput } from '@/lib/pricing/source-registry';

const CACHE = new Map<string, { latitude: number; longitude: number } | null>();
const MAX_CACHE = 1000;

function locationQuery(item: PriceObservationInput) {
  if (item.postalCode) return item.postalCode.trim();
  if (item.city && item.state) return `${item.city.trim()}, ${item.state.trim()}`;
  return null;
}

async function resolve(query: string) {
  const key = query.toLowerCase();
  if (CACHE.has(key)) return CACHE.get(key) ?? null;
  const resolved = await geocodeUsLocation(query);
  const coordinates = resolved
    ? { latitude: resolved.latitude, longitude: resolved.longitude }
    : null;
  if (CACHE.size >= MAX_CACHE) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, coordinates);
  return coordinates;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return output;
}

/**
 * Adds approximate city/ZIP coordinates only for presentation on the Price Map.
 * It never changes a price, payment basis, source median, provenance family, or
 * local headline eligibility decision. Local benchmark admission happens before
 * this enrichment step.
 */
export async function enrichObservationsForMap(
  observations: PriceObservationInput[],
  maxNewGeocodes = 60,
): Promise<PriceObservationInput[]> {
  const uniqueQueries: string[] = [];
  const seen = new Set<string>();

  for (const item of observations) {
    if (Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) continue;
    const query = locationQuery(item);
    if (!query) continue;
    const normalized = query.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueQueries.push(query);
    if (uniqueQueries.length >= maxNewGeocodes) break;
  }

  if (!uniqueQueries.length) return observations;

  const resolved = await mapWithConcurrency(uniqueQueries, 4, async (query) => ({
    query: query.toLowerCase(),
    coordinates: await resolve(query),
  }));
  const byQuery = new Map(resolved.map((item) => [item.query, item.coordinates]));

  return observations.map((item) => {
    if (Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) return item;
    const query = locationQuery(item);
    if (!query) return item;
    const coordinates = byQuery.get(query.toLowerCase());
    if (!coordinates) return item;
    return { ...item, ...coordinates };
  });
}
