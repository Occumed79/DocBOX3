import { acceptSelfPayObservation, type PriceObservationInput } from '@/lib/pricing/source-registry';
import { summarizePrices } from '@/lib/pricing/statistics';

const ENDPOINT = 'https://sytjhslzedcesudozwwm.supabase.co/functions/v1/public-price-lookup';

type FairVisitResponse = {
  ok?: boolean;
  procedure?: { code?: string; name?: string };
  location?: { zip?: string; state?: string; radius_miles?: number };
  area?: {
    scope?: string;
    median?: number | null;
    p25?: number | null;
    p75?: number | null;
    n_sources?: number | null;
    sources?: string[];
  };
  facilities?: Array<{
    name?: string;
    city?: string;
    state?: string;
    cash_price?: number | null;
    distance_miles?: number;
    source?: string;
    last_updated?: string;
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
  }>;
  facility_scope?: string;
  national_median?: number | null;
  medicare_rate?: number | null;
  data_refreshed?: string;
  disclaimer?: string;
  attribution?: { required?: boolean; text?: string };
  member_url?: string;
};

export type FairVisitCashResult = {
  observations: PriceObservationInput[];
  summary: ReturnType<typeof summarizePrices>;
  attribution?: string;
  disclaimer?: string;
  sourceScope?: string;
  facilityScope?: string;
  dataRefreshed?: string;
  localBenchmarkEligible: boolean;
};

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export async function searchFairVisitCash(input: {
  procedureCode: string;
  procedureName: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  radiusMiles?: number | null;
}): Promise<FairVisitCashResult> {
  const url = new URL(ENDPOINT);
  if (input.procedureCode) url.searchParams.set('cpt', input.procedureCode);
  else url.searchParams.set('query', input.procedureName);
  if (input.postalCode) url.searchParams.set('zip', input.postalCode);
  else if (Number.isFinite(input.latitude) && Number.isFinite(input.longitude)) {
    url.searchParams.set('lat', String(input.latitude));
    url.searchParams.set('lng', String(input.longitude));
  }
  if (input.radiusMiles) url.searchParams.set('radius_miles', String(Math.min(150, Math.max(5, input.radiusMiles))));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`FairVisitHealth cash API returned HTTP ${response.status}.`);
    const payload = await response.json() as FairVisitResponse;
    if (!payload.ok) throw new Error('FairVisitHealth did not return a successful cash-price result.');

    const facilityScope = payload.facility_scope?.toLowerCase() || '';
    const useFacilityRows = !facilityScope || facilityScope === 'radius';
    const observations: PriceObservationInput[] = [];
    if (useFacilityRows) {
      for (const facility of payload.facilities || []) {
        if (!validNumber(facility.cash_price)) continue;
        const accepted = acceptSelfPayObservation({
          sourceId: 'fairvisit-health',
          procedureCode: input.procedureCode,
          procedureName: input.procedureName,
          price: facility.cash_price,
          paymentBasis: 'discounted_cash',
          providerName: facility.name,
          city: facility.city,
          state: facility.state,
          latitude: validNumber(facility.latitude) ? facility.latitude : validNumber(facility.lat) ? facility.lat : undefined,
          longitude: typeof facility.longitude === 'number' && Number.isFinite(facility.longitude) ? facility.longitude
            : typeof facility.lng === 'number' && Number.isFinite(facility.lng) ? facility.lng : undefined,
          observedAt: facility.last_updated || payload.data_refreshed,
          sourceUrl: payload.member_url,
        });
        if (accepted) observations.push(accepted);
      }
    }

    // The API also returns national and Medicare context. Those fields are intentionally
    // ignored. Its area result may fall back to the entire state when local density is weak;
    // that fallback is not allowed to participate in our local source-balanced median.
    const scope = payload.area?.scope?.toLowerCase() || '';
    const localBenchmarkEligible = Boolean(scope && !scope.includes('state') && !scope.includes('national'));
    const base = summarizePrices([]);
    const summary = {
      ...base,
      count: localBenchmarkEligible && validNumber(payload.area?.n_sources) ? Math.round(payload.area!.n_sources!) : observations.length,
      low: observations.length ? Math.min(...observations.map((item) => item.price)) : null,
      median: localBenchmarkEligible && validNumber(payload.area?.median) ? payload.area!.median! : null,
      high: observations.length ? Math.max(...observations.map((item) => item.price)) : null,
      p25: localBenchmarkEligible && validNumber(payload.area?.p25) ? payload.area!.p25! : null,
      p75: localBenchmarkEligible && validNumber(payload.area?.p75) ? payload.area!.p75! : null,
    };

    return {
      observations,
      summary,
      attribution: payload.attribution?.text,
      disclaimer: payload.disclaimer,
      sourceScope: payload.area?.scope,
      facilityScope: payload.facility_scope,
      dataRefreshed: payload.data_refreshed,
      localBenchmarkEligible,
    };
  } finally {
    clearTimeout(timeout);
  }
}
