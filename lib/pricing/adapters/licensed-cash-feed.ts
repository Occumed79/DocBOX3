import { acceptSelfPayObservation, type EligiblePaymentBasis, type PriceObservationInput } from '@/lib/pricing/source-registry';

type JsonObject = Record<string, unknown>;

export type LicensedCashFeedConfig = {
  sourceId: string;
  sourceName: string;
  endpoint?: string;
  token?: string;
  tokenHeader?: string;
  method?: 'GET' | 'POST';
  explicitCashFields: readonly string[];
  basisFields?: readonly string[];
};

export type LicensedCashFeedSearch = {
  procedureCode: string;
  procedureName: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  radiusMiles?: number | null;
};

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
    for (const key of ['amount', 'value', 'price']) {
      if (key in object) {
        const parsed = numberFrom(object[key]);
        if (parsed !== null) return parsed;
      }
    }
  }
  return null;
}

function textFrom(object: JsonObject, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizedBasis(value: string | undefined): EligiblePaymentBasis | null {
  if (!value) return null;
  const basis = value.toLowerCase().replace(/[\s-]+/g, '_');
  if (/medicare|medicaid|payer|insur|negotiat|allowed|claim|gross|chargemaster|list_price/.test(basis)) return null;
  if (/discount.*cash/.test(basis)) return 'discounted_cash';
  if (/self.*pay/.test(basis)) return 'self_pay';
  if (/direct.*pay/.test(basis)) return 'direct_pay';
  if (/marketplace.*cash/.test(basis)) return 'marketplace_cash';
  if (/uninsured/.test(basis)) return 'uninsured';
  if (/cash/.test(basis)) return 'cash';
  return null;
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
  const nested = [
    object,
    asObject(object.provider),
    asObject(object.facility),
    asObject(object.hospital),
    asObject(object.location),
    asObject(object.address),
  ].filter(Boolean) as JsonObject[];

  const firstText = (keys: readonly string[]) => {
    for (const candidate of nested) {
      const text = textFrom(candidate, keys);
      if (text) return text;
    }
    return undefined;
  };
  const firstNumber = (keys: readonly string[]) => {
    for (const candidate of nested) {
      for (const key of keys) {
        const number = numberFrom(candidate[key]);
        if (number !== null) return number;
      }
    }
    return undefined;
  };

  return {
    providerName: firstText(['provider_name', 'facility_name', 'hospital_name', 'name', 'display_name']) ?? parent.providerName,
    city: firstText(['city']) ?? parent.city,
    state: firstText(['state', 'state_code', 'region']) ?? parent.state,
    postalCode: firstText(['zip', 'zipcode', 'postal_code', 'postal']) ?? parent.postalCode,
    latitude: firstNumber(['latitude', 'lat']) ?? parent.latitude,
    longitude: firstNumber(['longitude', 'lng', 'lon']) ?? parent.longitude,
    sourceUrl: firstText(['source_url', 'url', 'detail_url']) ?? parent.sourceUrl,
  };
}

function procedureMatchFor(object: JsonObject, code: string, inherited: boolean | undefined) {
  const codeValue = textFrom(object, ['procedure_code', 'code', 'billing_code', 'cpt', 'hcpcs', 'cdt']);
  if (!codeValue) return inherited;
  return codeValue.trim().toLowerCase() === code.trim().toLowerCase();
}

function extractCash(object: JsonObject, config: LicensedCashFeedConfig): { price: number; basis: EligiblePaymentBasis } | null {
  for (const field of config.explicitCashFields) {
    if (!(field in object)) continue;
    const price = numberFrom(object[field]);
    if (price === null || price <= 0) continue;
    const lower = field.toLowerCase();
    const basis: EligiblePaymentBasis = lower.includes('discount') ? 'discounted_cash'
      : lower.includes('self') ? 'self_pay'
        : lower.includes('uninsured') ? 'uninsured'
          : lower.includes('direct') ? 'direct_pay'
            : 'cash';
    return { price, basis };
  }

  const basisKeys = config.basisFields ?? ['payment_basis', 'payment_type', 'pricing_type', 'rate_type', 'price_type', 'payer_type'];
  const basis = normalizedBasis(textFrom(object, basisKeys));
  if (!basis) return null;
  for (const field of ['price', 'amount', 'rate', 'value']) {
    const price = numberFrom(object[field]);
    if (price !== null && price > 0) return { price, basis };
  }
  return null;
}

function walk(
  value: unknown,
  config: LicensedCashFeedConfig,
  search: LicensedCashFeedSearch,
  inherited: Context,
  output: PriceObservationInput[],
  seen: Set<string>,
  procedureMatched: boolean | undefined = undefined,
  depth = 0,
) {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, config, search, inherited, output, seen, procedureMatched, depth + 1);
    return;
  }
  const object = asObject(value);
  if (!object) return;
  const context = mergeContext(object, inherited);
  const currentProcedureMatch = procedureMatchFor(object, search.procedureCode, procedureMatched);
  const cash = extractCash(object, config);

  if (cash && currentProcedureMatch === true) {
    const signature = [config.sourceId, context.providerName, context.city, context.state, search.procedureCode, cash.price].join('|');
    if (!seen.has(signature)) {
      seen.add(signature);
      const accepted = acceptSelfPayObservation({
        sourceId: config.sourceId,
        procedureCode: search.procedureCode,
        procedureName: search.procedureName,
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
    if (child && typeof child === 'object') {
      walk(child, config, search, context, output, seen, currentProcedureMatch, depth + 1);
    }
  }
}

function endpointFor(raw: string, search: LicensedCashFeedSearch) {
  const replacements: Record<string, string> = {
    code: search.procedureCode,
    procedure: search.procedureName,
    location: search.location ?? '',
    lat: search.latitude?.toString() ?? '',
    lon: search.longitude?.toString() ?? '',
    radius: search.radiusMiles?.toString() ?? '',
  };
  let rendered = raw;
  let replaced = false;
  for (const [key, value] of Object.entries(replacements)) {
    const marker = `{${key}}`;
    if (rendered.includes(marker)) {
      rendered = rendered.replaceAll(marker, encodeURIComponent(value));
      replaced = true;
    }
  }
  if (replaced) return rendered;

  const url = new URL(rendered);
  url.searchParams.set('code', search.procedureCode);
  url.searchParams.set('procedure', search.procedureName);
  if (search.location) url.searchParams.set('location', search.location);
  if (Number.isFinite(search.latitude)) url.searchParams.set('lat', String(search.latitude));
  if (Number.isFinite(search.longitude)) url.searchParams.set('lon', String(search.longitude));
  if (search.radiusMiles) url.searchParams.set('radius', String(search.radiusMiles));
  return url.toString();
}

export function isLicensedCashFeedConfigured(config: LicensedCashFeedConfig) {
  return Boolean(config.endpoint?.trim());
}

export async function searchLicensedCashFeed(config: LicensedCashFeedConfig, search: LicensedCashFeedSearch) {
  const endpoint = config.endpoint?.trim();
  if (!endpoint) return [];

  const target = new URL(endpointFor(endpoint, search));
  if (target.protocol !== 'https:') {
    throw new Error(`${config.sourceName} cash feed endpoint must use HTTPS.`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    const token = config.token?.trim();
    if (token) {
      const headerName = config.tokenHeader?.trim();
      headers[headerName || 'authorization'] = headerName ? token : `Bearer ${token}`;
    }

    const method = config.method ?? 'GET';
    const response = await fetch(target, {
      method,
      headers: method === 'POST' ? { ...headers, 'content-type': 'application/json' } : headers,
      body: method === 'POST' ? JSON.stringify({
        code: search.procedureCode,
        procedure: search.procedureName,
        location: search.location,
        latitude: search.latitude,
        longitude: search.longitude,
        radius: search.radiusMiles,
        payment_basis: 'cash',
      }) : undefined,
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`${config.sourceName} cash feed returned HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    const observations: PriceObservationInput[] = [];
    walk(payload, config, search, {}, observations, new Set());
    return observations;
  } finally {
    clearTimeout(timeout);
  }
}
