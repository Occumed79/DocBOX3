export type ResolvedLocation = {
  query: string;
  displayName: string;
  latitude: number;
  longitude: number;
  state?: string;
  postalCode?: string;
};

type MapTilerFeature = {
  place_name?: string;
  text?: string;
  center?: [number, number];
  geometry?: { coordinates?: [number, number] };
  context?: Array<{ id?: string; text?: string; short_code?: string }>;
  properties?: Record<string, unknown>;
};

type MapTilerResponse = {
  features?: MapTilerFeature[];
};

function stateFromFeature(feature: MapTilerFeature) {
  const contexts = feature.context || [];
  const region = contexts.find((item) => item.id?.startsWith('region.'));
  if (!region) return undefined;
  const code = region.short_code?.split('-').pop()?.toUpperCase();
  return code && code.length === 2 ? code : region.text;
}

function postalFromFeature(feature: MapTilerFeature) {
  const contexts = feature.context || [];
  const postal = contexts.find((item) => item.id?.startsWith('postal_code.') || item.id?.startsWith('postcode.'));
  return postal?.text;
}

export async function geocodeUsLocation(query?: string | null): Promise<ResolvedLocation | null> {
  const trimmed = query?.trim();
  if (!trimmed) return null;
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim();
  if (!key) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(trimmed)}.json`);
    url.searchParams.set('key', key);
    url.searchParams.set('limit', '1');
    url.searchParams.set('country', 'us');
    url.searchParams.set('language', 'en');

    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json() as MapTilerResponse;
    const feature = payload.features?.[0];
    const coordinates = feature?.center || feature?.geometry?.coordinates;
    if (!feature || !coordinates || coordinates.length < 2) return null;
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      query: trimmed,
      displayName: feature.place_name || feature.text || trimmed,
      latitude,
      longitude,
      state: stateFromFeature(feature),
      postalCode: postalFromFeature(feature),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
