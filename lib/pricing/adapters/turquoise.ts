import { acceptSelfPayObservation, type PriceObservationInput } from '@/lib/pricing/source-registry';

const API_BASE = 'https://api.turquoise.health';
const TOKEN_URL = `${API_BASE}/oauth/token`;
const TURQUOISE_REQUEST_BUDGET_MS = 12_000;

type TurquoiseSearch = {
  procedureCode: string;
  procedureName: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  radiusMiles?: number | null;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type PackageItem = {
  id?: string;
  name?: string;
};

type ProviderAddress = {
  city?: string;
  state?: string;
  zip_code?: string;
  latitude?: number | null;
  longitude?: number | null;
};

type PriceItem = {
  id?: string;
  provider?: {
    id?: string;
    name?: string;
    address?: ProviderAddress;
  };
  package?: {
    id?: string;
    name?: string;
  };
  pricing?: {
    type?: string;
    payer?: unknown;
    network?: unknown;
  };
  total?: {
    amount?: string;
    minor_units?: number;
    currency?: string;
  };
};

type ListEnvelope<T> = {
  items?: T[];
  page?: {
    next_cursor?: string | null;
  };
  no_data_reason?: string | null;
};

let cachedToken: { value: string; expiresAt: number } | null = null;
let inFlightToken: Promise<string> | null = null;

function credentials() {
  const clientId = process.env.TURQUOISE_CLIENT_ID?.trim();
  const clientSecret = process.env.TURQUOISE_CLIENT_SECRET?.trim();
  const organizationId = process.env.TURQUOISE_ORGANIZATION_ID?.trim();
  return clientId && clientSecret && organizationId
    ? { clientId, clientSecret, organizationId }
    : null;
}

export function isTurquoiseConfigured() {
  return Boolean(credentials());
}

async function mintToken(signal: AbortSignal) {
  const configured = credentials();
  if (!configured) throw new Error('Turquoise OAuth credentials are not configured.');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: configured.clientId,
      client_secret: configured.clientSecret,
      organization_id: configured.organizationId,
    }),
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Turquoise OAuth failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }

  const payload = await response.json() as TokenResponse;
  if (!payload.access_token) throw new Error('Turquoise OAuth returned no access token.');

  const expiresIn = Number.isFinite(payload.expires_in) ? Number(payload.expires_in) : 3600;
  cachedToken = {
    value: payload.access_token,
    // Refresh at least one minute before expiry.
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  };
  return cachedToken.value;
}

async function accessToken(signal: AbortSignal) {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  if (!inFlightToken) {
    inFlightToken = mintToken(signal).finally(() => {
      inFlightToken = null;
    });
  }
  return inFlightToken;
}

async function turquoiseFetch(path: string, signal: AbortSignal, init?: RequestInit, retry = true): Promise<Response> {
  const token = await accessToken(signal);
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
    cache: 'no-store',
    signal,
  });

  if (response.status === 401 && retry) {
    cachedToken = null;
    return turquoiseFetch(path, signal, init, false);
  }
  return response;
}

async function resolvePackageId(code: string, signal: AbortSignal) {
  const params = new URLSearchParams({ anchor_code: code, page_size: '25' });
  const response = await turquoiseFetch(`/v3/packages?${params.toString()}`, signal);
  if (!response.ok) throw new Error(`Turquoise package lookup failed (${response.status}).`);

  const payload = await response.json() as ListEnvelope<PackageItem>;
  const item = (payload.items || [])[0];
  return item?.id ? { id: item.id, name: item.name } : null;
}

function locationPayload(search: TurquoiseSearch) {
  if (Number.isFinite(search.latitude) && Number.isFinite(search.longitude)) {
    const radiusMiles = search.radiusMiles && search.radiusMiles > 0 ? search.radiusMiles : 50;
    return {
      near: {
        lat: search.latitude,
        lng: search.longitude,
        radius_m: Math.max(1, Math.round(radiusMiles * 1609.344)),
      },
    };
  }
  if (search.postalCode) return { zip: search.postalCode };
  return undefined;
}

function dollars(item: PriceItem) {
  if (typeof item.total?.minor_units === 'number' && Number.isFinite(item.total.minor_units)) {
    return item.total.minor_units / 100;
  }
  const amount = Number(item.total?.amount);
  return Number.isFinite(amount) ? amount : null;
}

function toObservation(item: PriceItem, search: TurquoiseSearch): PriceObservationInput | null {
  // Defense in depth: the request itself is cash-only, and returned rows must also
  // explicitly resolve to cash. Negotiated, payer/network or unlabeled rows are rejected.
  if (item.pricing?.type !== 'cash') return null;
  if (item.pricing?.payer || item.pricing?.network) return null;

  const price = dollars(item);
  if (price === null) return null;
  const address = item.provider?.address;

  return acceptSelfPayObservation({
    sourceId: 'turquoise-health',
    procedureCode: search.procedureCode,
    procedureName: search.procedureName,
    price,
    paymentBasis: 'cash',
    city: address?.city,
    state: address?.state,
    postalCode: address?.zip_code,
    latitude: typeof address?.latitude === 'number' ? address.latitude : undefined,
    longitude: typeof address?.longitude === 'number' ? address.longitude : undefined,
    providerName: item.provider?.name,
    sourceUrl: 'https://turquoise.health/',
  });
}

export async function searchTurquoiseCash(search: TurquoiseSearch): Promise<PriceObservationInput[]> {
  if (!isTurquoiseConfigured()) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURQUOISE_REQUEST_BUDGET_MS);
  try {
    const pkg = await resolvePackageId(search.procedureCode, controller.signal);
    if (!pkg) return [];

    const location = locationPayload(search);
    const observations: PriceObservationInput[] = [];
    let cursor: string | null = null;

    // Cap pagination to keep interactive lookups responsive while still allowing a
    // substantial local sample. Every request shares the same overall deadline.
    for (let page = 0; page < 3; page += 1) {
      const body: Record<string, unknown> = {
        package_id: pkg.id,
        pricing: { type: 'cash' },
        page_size: 250,
        sort: location ? 'distance' : 'total',
        sort_direction: 'asc',
      };
      if (location) body.location = location;
      if (cursor) body.cursor = cursor;

      const response = await turquoiseFetch('/v3/prices/query', controller.signal, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (response.status === 403) return [];
        throw new Error(`Turquoise cash-price query failed (${response.status}).`);
      }

      const payload = await response.json() as ListEnvelope<PriceItem>;
      for (const item of payload.items || []) {
        const observation = toObservation(item, search);
        if (observation) observations.push(observation);
      }

      cursor = payload.page?.next_cursor || null;
      if (!cursor) break;
    }

    return observations;
  } finally {
    clearTimeout(timeout);
  }
}
