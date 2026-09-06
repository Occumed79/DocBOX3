import { acceptSelfPayObservation, type PriceObservationInput } from '@/lib/pricing/source-registry';

type JsonObject = Record<string, unknown>;

const OFFERS_URL = 'https://api.opendoc.com/offers';

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function textFrom(object: JsonObject, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function centsFrom(object: JsonObject): number | null {
  for (const key of ['cashPriceCents', 'cash_price_cents']) {
    const cents = numberFrom(object[key]);
    if (cents !== null && cents > 0) return cents;
  }
  return null;
}

function explicitCashDollarsFrom(object: JsonObject): number | null {
  for (const key of ['cashPrice', 'cash_price', 'postedCashPrice', 'posted_cash_price']) {
    const dollars = numberFrom(object[key]);
    if (dollars !== null && dollars > 0) return dollars;
  }
  return null;
}

function collectOfferObjects(value: unknown, output: JsonObject[]) {
  if (Array.isArray(value)) {
    for (const child of value) collectOfferObjects(child, output);
    return;
  }
  const object = asObject(value);
  if (!object) return;

  // An OpenDoc offer is usable here only if it exposes an explicit posted cash price.
  // We intentionally do not accept `estimatedPrice`, `typicalPrice`, `surePrice`, or
  // any other context/ceiling field.
  if (centsFrom(object) !== null || explicitCashDollarsFrom(object) !== null) output.push(object);

  for (const child of Object.values(object)) {
    if (child && typeof child === 'object') collectOfferObjects(child, output);
  }
}

function procedureMatches(object: JsonObject, code: string, name: string) {
  const codeValue = textFrom(object, [
    'procedureCode', 'procedure_code', 'billingCode', 'billing_code', 'cpt', 'hcpcs', 'cdt', 'code',
  ]);
  if (codeValue) return codeValue.toUpperCase() === code.toUpperCase();

  const title = textFrom(object, ['hsoTitle', 'hso_title', 'serviceName', 'service_name', 'title', 'name']);
  if (!title) return true;
  const candidate = title.toLowerCase();
  const target = name.toLowerCase();
  // For dynamic code-only procedures the query itself is authoritative; don't reject a
  // valid cash offer merely because OpenDoc supplies a richer service title.
  if (/^(CPT|CDT|HCPCS)\s+[A-Z0-9]+$/i.test(name)) return true;
  return candidate.includes(target) || target.includes(candidate);
}

function firstNested(object: JsonObject, keys: readonly string[]) {
  const candidates = [
    object,
    asObject(object.provider),
    asObject(object.practice),
    asObject(object.facility),
    asObject(object.location),
    asObject(object.address),
    asObject(object.scp),
  ].filter(Boolean) as JsonObject[];
  for (const candidate of candidates) {
    const value = textFrom(candidate, keys);
    if (value) return value;
  }
  return undefined;
}

function firstCoordinate(object: JsonObject, keys: readonly string[]) {
  const candidates = [object, asObject(object.location), asObject(object.address), asObject(object.practice), asObject(object.facility)]
    .filter(Boolean) as JsonObject[];
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = numberFrom(candidate[key]);
      if (value !== null) return value;
    }
  }
  return undefined;
}

export async function searchOpenDocCash(input: {
  procedureCode: string;
  procedureName: string;
  state?: string;
}): Promise<PriceObservationInput[]> {
  const url = new URL(OFFERS_URL);
  // Prefer the billing code because it is unambiguous and keeps arbitrary-code lookup working.
  url.searchParams.set('q', input.procedureCode || input.procedureName);
  if (input.state) url.searchParams.set('state', input.state);
  url.searchParams.set('limit', '100');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`OpenDoc offers API returned HTTP ${response.status}.`);

    const payload: unknown = await response.json();
    const objects: JsonObject[] = [];
    collectOfferObjects(payload, objects);

    const observations: PriceObservationInput[] = [];
    const seen = new Set<string>();
    for (const offer of objects) {
      if (!procedureMatches(offer, input.procedureCode, input.procedureName)) continue;

      const cents = centsFrom(offer);
      const dollars = cents !== null ? cents / 100 : explicitCashDollarsFrom(offer);
      if (dollars === null || dollars <= 0) continue;

      const providerName = firstNested(offer, ['providerName', 'provider_name', 'displayName', 'display_name', 'name']);
      const city = firstNested(offer, ['city']);
      const state = firstNested(offer, ['state', 'stateCode', 'state_code', 'region']);
      const postalCode = firstNested(offer, ['zip', 'zipcode', 'postalCode', 'postal_code']);
      const latitude = firstCoordinate(offer, ['latitude', 'lat']);
      const longitude = firstCoordinate(offer, ['longitude', 'lng', 'lon']);
      const offerId = textFrom(offer, ['providerHsoId', 'provider_hso_id', 'offerId', 'offer_id', 'id']);
      const signature = [offerId, providerName, city, state, input.procedureCode, dollars].join('|');
      if (seen.has(signature)) continue;
      seen.add(signature);

      const accepted = acceptSelfPayObservation({
        sourceId: 'opendoc',
        procedureCode: input.procedureCode,
        procedureName: input.procedureName,
        price: dollars,
        paymentBasis: 'marketplace_cash',
        providerName,
        city,
        state,
        postalCode,
        latitude,
        longitude,
        sourceUrl: offerId ? `https://opendoc.com/?offer=${encodeURIComponent(offerId)}` : 'https://opendoc.com/',
      });
      if (accepted) observations.push(accepted);
    }

    return observations;
  } finally {
    clearTimeout(timeout);
  }
}
