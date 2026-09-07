import { acceptSelfPayObservation, type PriceObservationInput } from '@/lib/pricing/source-registry';

type JsonObject = Record<string, unknown>;

const MEDRATES_SEARCH_URL = 'https://medrates.fyi/api/public/v1/search';
const EXPLICIT_CASH_FIELDS = ['discounted_cash_price', 'cash_price', 'self_pay_price', 'selfpay_price'] as const;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { storedAt: number; rows: PriceObservationInput[] }>();

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  const object = asObject(value);
  if (object) {
    if (typeof object.amount === 'string' || typeof object.amount === 'number') return numberFrom(object.amount);
    if (typeof object.value === 'string' || typeof object.value === 'number') return numberFrom(object.value);
  }
  return null;
}

function textFrom(object: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function coordinateFrom(object: JsonObject, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = numberFrom(object[key]);
    if (value !== null) return value;
  }
  return undefined;
}

type TraversalContext = {
  providerName?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  sourceUrl?: string;
};

function mergeContext(object: JsonObject, parent: TraversalContext): TraversalContext {
  const hospital = asObject(object.hospital);
  const facility = asObject(object.facility);
  const provider = asObject(object.provider);
  const location = asObject(object.location);
  const address = asObject(object.address);
  const candidates = [object, hospital, facility, provider, location, address].filter(Boolean) as JsonObject[];
  const firstText = (keys: string[]) => {
    for (const candidate of candidates) { const value = textFrom(candidate, keys); if (value) return value; }
    return undefined;
  };
  const firstCoordinate = (keys: string[]) => {
    for (const candidate of candidates) { const value = coordinateFrom(candidate, keys); if (value !== undefined) return value; }
    return undefined;
  };
  return {
    providerName: firstText(['display_name', 'hospital_name', 'facility_name', 'provider_name', 'name']) ?? parent.providerName,
    city: firstText(['city']) ?? parent.city,
    state: firstText(['state', 'state_code']) ?? parent.state,
    postalCode: firstText(['zip', 'zipcode', 'postal_code']) ?? parent.postalCode,
    latitude: firstCoordinate(['lat', 'latitude']) ?? parent.latitude,
    longitude: firstCoordinate(['lng', 'lon', 'longitude']) ?? parent.longitude,
    sourceUrl: firstText(['url', 'source_url', 'detail_url']) ?? parent.sourceUrl,
  };
}

function extractExplicitCashValue(object: JsonObject): { price: number; basis: 'discounted_cash' | 'cash' | 'self_pay' } | null {
  for (const field of EXPLICIT_CASH_FIELDS) {
    if (!(field in object)) continue;
    const price = numberFrom(object[field]);
    if (price === null || price <= 0) continue;
    if (field === 'discounted_cash_price') return { price, basis: 'discounted_cash' };
    if (field.includes('self')) return { price, basis: 'self_pay' };
    return { price, basis: 'cash' };
  }
  return null;
}

function walkForCashRecords(value: unknown, procedureCode: string, procedureName: string, inherited: TraversalContext, output: PriceObservationInput[], seen: Set<string>) {
  if (Array.isArray(value)) { for (const item of value) walkForCashRecords(item, procedureCode, procedureName, inherited, output, seen); return; }
  const object = asObject(value);
  if (!object) return;
  const context = mergeContext(object, inherited);
  const cash = extractExplicitCashValue(object);
  if (cash) {
    const signature = [context.providerName, context.city, context.state, procedureCode, cash.price].join('|');
    if (!seen.has(signature)) {
      seen.add(signature);
      const accepted = acceptSelfPayObservation({
        sourceId: 'medrates', procedureCode, procedureName, price: cash.price, paymentBasis: cash.basis,
        providerName: context.providerName, city: context.city, state: context.state, postalCode: context.postalCode,
        latitude: context.latitude, longitude: context.longitude, sourceUrl: context.sourceUrl,
      });
      if (accepted) output.push(accepted);
    }
  }
  for (const child of Object.values(object)) if (child && typeof child === 'object') walkForCashRecords(child, procedureCode, procedureName, context, output, seen);
}

export type MedRatesSearchInput = { procedureCode: string; procedureName: string; location?: string; latitude?: number; longitude?: number };

export async function searchMedRatesCash(input: MedRatesSearchInput): Promise<PriceObservationInput[]> {
  const key = [input.procedureCode, input.latitude?.toFixed(3), input.longitude?.toFixed(3), input.location || ''].join('|');
  const cached = cache.get(key);
  const age = cached ? Date.now() - cached.storedAt : Number.POSITIVE_INFINITY;
  if (cached && age < CACHE_TTL_MS) return cached.rows;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const body: Record<string, unknown> = { query: `${input.procedureCode} ${input.procedureName}`, codes_per_page: 5, hospitals_per_code: 50 };
    if (Number.isFinite(input.latitude) && Number.isFinite(input.longitude)) { body.lat = input.latitude; body.lng = input.longitude; }
    else if (input.location) body.query = `${body.query} near ${input.location}`;

    const response = await fetch(MEDRATES_SEARCH_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: controller.signal,
    });
    if (!response.ok) {
      if (cached && age < STALE_TTL_MS && (response.status === 429 || response.status >= 500)) return cached.rows;
      const retryAfter = response.headers.get('retry-after');
      throw new Error(`MedRates cash API returned HTTP ${response.status}${retryAfter ? ` (retry after ${retryAfter}s)` : ''}.`);
    }
    const payload: unknown = await response.json();
    const observations: PriceObservationInput[] = [];
    walkForCashRecords(payload, input.procedureCode, input.procedureName, {}, observations, new Set());
    cache.set(key, { storedAt: Date.now(), rows: observations });
    return observations;
  } catch (error) {
    if (cached && age < STALE_TTL_MS) return cached.rows;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
