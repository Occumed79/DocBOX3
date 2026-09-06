import { geocodeUsLocation } from '@/lib/pricing/geocode';
import { acceptSelfPayObservation, type EligiblePaymentBasis, type PriceObservationInput } from '@/lib/pricing/source-registry';

type JsonObject = Record<string, unknown>;

type EntitySearchResult = {
  slug?: string;
  canonical_name?: string;
  display_name?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
};

type EntitySearchResponse = {
  results?: EntitySearchResult[];
};

const BASE_URL = 'https://www.loacare.com/api/v1';

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function textFrom(object: JsonObject, keys: readonly string[]) {
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

function normalized(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
}

function cashBasis(object: JsonObject): EligiblePaymentBasis | null {
  const kind = normalized(textFrom(object, ['priceKind', 'price_kind'])).replace(/[\s-]+/g, '_');
  if (kind === 'cash') return 'cash';
  if (kind === 'discounted_cash') return 'discounted_cash';
  if (kind === 'package_cash') return 'direct_pay';

  // Only use source labels as a fallback when they explicitly say cash. A generic
  // Published MRF Price row is not enough because Loa also carries negotiated rows.
  const provenance = asObject(object.provenance);
  const label = normalized(
    textFrom(object, ['sourceLabel', 'source_label', 'label'])
    || (provenance ? textFrom(provenance, ['sourceLabel', 'source_label']) : undefined),
  );
  if (label.includes('cash price') || label.includes('cash-price') || label.includes('self-pay')) return 'cash';
  return null;
}

type TraversalContext = {
  entitySlug?: string;
  entityName?: string;
};

function mergeContext(object: JsonObject, parent: TraversalContext): TraversalContext {
  const entity = asObject(object.entity);
  const candidates = [object, entity].filter(Boolean) as JsonObject[];
  let entitySlug = parent.entitySlug;
  let entityName = parent.entityName;
  for (const candidate of candidates) {
    entitySlug = textFrom(candidate, ['entitySlug', 'entity_slug', 'slug']) || entitySlug;
    entityName = textFrom(candidate, ['canonicalName', 'canonical_name', 'displayName', 'display_name', 'entityName', 'entity_name']) || entityName;
  }
  return { entitySlug, entityName };
}

function collectCashRows(
  value: unknown,
  procedureCode: string,
  context: TraversalContext,
  output: Array<{ object: JsonObject; context: TraversalContext; basis: EligiblePaymentBasis; price: number }>,
) {
  if (Array.isArray(value)) {
    for (const child of value) collectCashRows(child, procedureCode, context, output);
    return;
  }
  const object = asObject(value);
  if (!object) return;
  const nextContext = mergeContext(object, context);
  const code = textFrom(object, ['cptCode', 'cpt_code', 'procedureCode', 'procedure_code']);
  const cents = numberFrom(object.priceCents ?? object.price_cents);
  const basis = cashBasis(object);

  if (cents !== null && cents > 0 && basis && (!code || code.toUpperCase() === procedureCode.toUpperCase())) {
    output.push({ object, context: nextContext, basis, price: cents / 100 });
  }

  for (const child of Object.values(object)) {
    if (child && typeof child === 'object') collectCashRows(child, procedureCode, nextContext, output);
  }
}

async function fetchJson(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Loa API returned HTTP ${response.status}.`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchLoaCash(input: {
  procedureCode: string;
  procedureName: string;
  city?: string;
  state?: string;
}): Promise<PriceObservationInput[]> {
  if (!input.city || !input.state) return [];

  const searchUrl = new URL(`${BASE_URL}/entities/search`);
  searchUrl.searchParams.set('q', input.city);
  searchUrl.searchParams.set('state', input.state);
  searchUrl.searchParams.set('limit', '20');
  const searchPayload = await fetchJson(searchUrl) as EntitySearchResponse;

  // The API's `q` semantics are broad. We only keep exact city/state matches so a
  // provider name that happens to contain the city string cannot contaminate locality.
  const exact = (searchPayload.results || [])
    .filter((entity) => entity.slug
      && normalized(entity.city) === normalized(input.city)
      && normalized(entity.state) === normalized(input.state))
    .slice(0, 10);
  if (!exact.length) return [];

  const compareUrl = new URL(`${BASE_URL}/prices/compare`);
  compareUrl.searchParams.set('entity', exact.map((entity) => entity.slug).join(','));
  compareUrl.searchParams.set('cpt_code', input.procedureCode);
  compareUrl.searchParams.set('limit_per_entity', '10');
  const comparePayload = await fetchJson(compareUrl);

  const rows: Array<{ object: JsonObject; context: TraversalContext; basis: EligiblePaymentBasis; price: number }> = [];
  collectCashRows(comparePayload, input.procedureCode, {}, rows);

  const entityBySlug = new Map(exact.map((entity) => [entity.slug as string, entity]));
  const zipCoordinates = new Map<string, Awaited<ReturnType<typeof geocodeUsLocation>>>();
  const zips = [...new Set(exact.map((entity) => entity.zip_code?.trim()).filter((zip): zip is string => Boolean(zip)))];
  await Promise.all(zips.map(async (zip) => {
    zipCoordinates.set(zip, await geocodeUsLocation(zip));
  }));

  const observations: PriceObservationInput[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const slug = row.context.entitySlug || textFrom(row.object, ['entitySlug', 'entity_slug', 'slug']);
    if (!slug) continue;
    const entity = entityBySlug.get(slug);
    if (!entity) continue; // never accept a comparison row outside the exact-city entity set
    const zip = entity.zip_code?.trim();
    const coordinates = zip ? zipCoordinates.get(zip) : null;
    if (!coordinates) continue; // local radius validation requires mappable geography

    const signature = [slug, input.procedureCode, row.price, row.basis].join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);

    const accepted = acceptSelfPayObservation({
      sourceId: 'loa',
      procedureCode: input.procedureCode,
      procedureName: input.procedureName,
      price: row.price,
      paymentBasis: row.basis,
      providerName: entity.display_name || entity.canonical_name || row.context.entityName,
      city: entity.city || input.city,
      state: entity.state || input.state,
      postalCode: zip,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      sourceUrl: 'https://www.loacare.com/api-partnership',
    });
    if (accepted) observations.push(accepted);
  }

  return observations;
}
