import { acceptSelfPayObservation, type PriceObservationInput } from '@/lib/pricing/source-registry';
import { stateCodeFromLocation } from '@/lib/pricing/location';

type JsonObject = Record<string, unknown>;

const MEDCOMPARE_URL = 'https://medcompare.co/api/v1';
const CASH_FIELDS = ['discounted_cash_price', 'cash_price', 'self_pay_price', 'cash'] as const;

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
    if ('amount' in object) return numberFrom(object.amount);
    if ('value' in object) return numberFrom(object.value);
  }
  return null;
}

function textFrom(object: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

type Context = {
  providerName?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  sourceUrl?: string;
};

function mergeContext(object: JsonObject, parent: Context): Context {
  const nested = [object, asObject(object.facility), asObject(object.hospital), asObject(object.provider), asObject(object.location), asObject(object.address)]
    .filter(Boolean) as JsonObject[];

  const firstText = (keys: string[]) => {
    for (const candidate of nested) {
      const value = textFrom(candidate, keys);
      if (value) return value;
    }
    return undefined;
  };
  const firstNumber = (keys: string[]) => {
    for (const candidate of nested) {
      for (const key of keys) {
        const value = numberFrom(candidate[key]);
        if (value !== null) return value;
      }
    }
    return undefined;
  };

  return {
    providerName: firstText(['facility_name', 'hospital_name', 'provider_name', 'name']) ?? parent.providerName,
    city: firstText(['city']) ?? parent.city,
    state: firstText(['state', 'state_code']) ?? parent.state,
    postalCode: firstText(['zip', 'zipcode', 'postal_code']) ?? parent.postalCode,
    latitude: firstNumber(['lat', 'latitude']) ?? parent.latitude,
    longitude: firstNumber(['lng', 'lon', 'longitude']) ?? parent.longitude,
    sourceUrl: firstText(['url', 'source_url', 'detail_url']) ?? parent.sourceUrl,
  };
}

function explicitCash(object: JsonObject): { price: number; basis: 'discounted_cash' | 'cash' | 'self_pay' } | null {
  for (const field of CASH_FIELDS) {
    if (!(field in object)) continue;
    const price = numberFrom(object[field]);
    if (price === null || price <= 0) continue;
    if (field === 'discounted_cash_price') return { price, basis: 'discounted_cash' };
    if (field.includes('self')) return { price, basis: 'self_pay' };
    return { price, basis: 'cash' };
  }
  return null;
}

function collect(
  value: unknown,
  procedureCode: string,
  procedureName: string,
  inherited: Context,
  output: PriceObservationInput[],
  seen: Set<string>,
) {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, procedureCode, procedureName, inherited, output, seen);
    return;
  }
  const object = asObject(value);
  if (!object) return;
  const context = mergeContext(object, inherited);
  const cash = explicitCash(object);
  if (cash) {
    const signature = [context.providerName, context.city, context.state, procedureCode, cash.price].join('|');
    if (!seen.has(signature)) {
      seen.add(signature);
      const accepted = acceptSelfPayObservation({
        sourceId: 'medcompare',
        procedureCode,
        procedureName,
        price: cash.price,
        paymentBasis: cash.basis,
        providerName: context.providerName,
        city: context.city,
        state: context.state,
        postalCode: context.postalCode,
        latitude: context.latitude,
        longitude: context.longitude,
        sourceUrl: context.sourceUrl,
      });
      if (accepted) output.push(accepted);
    }
  }
  for (const child of Object.values(object)) {
    if (child && typeof child === 'object') collect(child, procedureCode, procedureName, context, output, seen);
  }
}

export type MedCompareSearchInput = {
  procedureCode: string;
  procedureName: string;
  location?: string;
};

export async function searchMedCompareCash(input: MedCompareSearchInput): Promise<PriceObservationInput[]> {
  const state = stateCodeFromLocation(input.location);
  if (!state) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const url = new URL(MEDCOMPARE_URL);
    url.searchParams.set('action', 'prices');
    url.searchParams.set('state', state);
    url.searchParams.set('code', input.procedureCode);

    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`MedCompare search failed with HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    const observations: PriceObservationInput[] = [];
    collect(payload, input.procedureCode, input.procedureName, { state }, observations, new Set());
    return observations;
  } finally {
    clearTimeout(timeout);
  }
}
