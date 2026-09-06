import { NextRequest, NextResponse } from 'next/server';
import { PROCEDURES } from '@/lib/pricing/procedures';
import { searchMedRatesCash } from '@/lib/pricing/adapters/medrates';
import { searchMedCompareCash } from '@/lib/pricing/adapters/medcompare';
import { searchFairVisitCash } from '@/lib/pricing/adapters/fairvisit';
import {
  PRIORITY_FEED_STATUS,
  searchClearHealthCostsCash,
  searchFairHealthCash,
  searchTurquoiseRawCash,
} from '@/lib/pricing/adapters/priority-feeds';
import { summarizePrices } from '@/lib/pricing/statistics';
import { geocodeUsLocation, type ResolvedLocation } from '@/lib/pricing/geocode';
import type { PriceObservationInput } from '@/lib/pricing/source-registry';

export const dynamic = 'force-dynamic';

type SourceStatus = 'ok' | 'empty' | 'error' | 'unconfigured';

type SourceResult = {
  sourceId: string;
  sourceName: string;
  status: SourceStatus;
  error?: string;
  observations: PriceObservationInput[];
  summary: ReturnType<typeof summarizePrices>;
  excludedByRadius: number;
  excludedWithoutCoordinates: number;
  attribution?: string;
  disclaimer?: string;
  sourceScope?: string;
  dataRefreshed?: string;
};

function emptySource(sourceId: string, sourceName: string, status: SourceStatus, error?: string): SourceResult {
  return {
    sourceId,
    sourceName,
    status,
    error,
    observations: [],
    summary: summarizePrices([]),
    excludedByRadius: 0,
    excludedWithoutCoordinates: 0,
  };
}

function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

function applyRadius(observations: PriceObservationInput[], center: ResolvedLocation | null, radiusMiles: number | null) {
  if (!center || !radiusMiles) return { observations, excludedByRadius: 0, excludedWithoutCoordinates: 0 };

  const included: PriceObservationInput[] = [];
  let excludedByRadius = 0;
  let excludedWithoutCoordinates = 0;

  for (const observation of observations) {
    if (!Number.isFinite(observation.latitude) || !Number.isFinite(observation.longitude)) {
      excludedWithoutCoordinates += 1;
      continue;
    }
    const distance = milesBetween(
      center.latitude,
      center.longitude,
      observation.latitude as number,
      observation.longitude as number,
    );
    if (distance <= radiusMiles) included.push(observation);
    else excludedByRadius += 1;
  }

  return { observations: included, excludedByRadius, excludedWithoutCoordinates };
}

async function runSource(
  sourceId: string,
  sourceName: string,
  runner: () => Promise<PriceObservationInput[]>,
  center: ResolvedLocation | null,
  radiusMiles: number | null,
  configured = true,
): Promise<SourceResult> {
  if (!configured) return emptySource(sourceId, sourceName, 'unconfigured');
  try {
    const raw = await runner();
    const filtered = applyRadius(raw, center, radiusMiles);
    return {
      sourceId,
      sourceName,
      status: filtered.observations.length ? 'ok' : 'empty',
      observations: filtered.observations,
      summary: summarizePrices(filtered.observations.map((item) => item.price)),
      excludedByRadius: filtered.excludedByRadius,
      excludedWithoutCoordinates: filtered.excludedWithoutCoordinates,
    };
  } catch (error) {
    return emptySource(
      sourceId,
      sourceName,
      'error',
      error instanceof Error ? error.message : `${sourceName} search failed.`,
    );
  }
}

async function runFairVisitSource(
  procedureCode: string,
  procedureName: string,
  resolvedLocation: ResolvedLocation | null,
  radiusMiles: number | null,
): Promise<SourceResult> {
  if (!resolvedLocation || !radiusMiles) return emptySource('fairvisit-health', 'FairVisitHealth', 'empty');
  try {
    const result = await searchFairVisitCash({
      procedureCode,
      procedureName,
      postalCode: resolvedLocation.postalCode,
      latitude: resolvedLocation.latitude,
      longitude: resolvedLocation.longitude,
      radiusMiles,
    });
    const hasUsefulData = result.summary.median !== null || result.observations.length > 0;
    return {
      sourceId: 'fairvisit-health',
      sourceName: 'FairVisitHealth',
      status: hasUsefulData ? 'ok' : 'empty',
      observations: result.observations,
      summary: result.summary,
      excludedByRadius: 0,
      excludedWithoutCoordinates: 0,
      attribution: result.attribution,
      disclaimer: result.disclaimer,
      sourceScope: result.sourceScope,
      dataRefreshed: result.dataRefreshed,
    };
  } catch (error) {
    return emptySource(
      'fairvisit-health',
      'FairVisitHealth',
      'error',
      error instanceof Error ? error.message : 'FairVisitHealth search failed.',
    );
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim();
  const location = request.nextUrl.searchParams.get('location')?.trim() || undefined;
  const radiusParam = Number(request.nextUrl.searchParams.get('radius'));
  const radiusMiles = location && Number.isFinite(radiusParam) && radiusParam > 0
    ? Math.min(radiusParam, 250)
    : location ? 50 : null;

  if (!code) return NextResponse.json({ error: 'A procedure code is required.' }, { status: 400 });

  const procedure = PROCEDURES.find((item) => item.code.toLowerCase() === code.toLowerCase());
  if (!procedure) {
    return NextResponse.json({ error: `Procedure ${code} is not in the current catalog.` }, { status: 404 });
  }

  const resolvedLocation = location ? await geocodeUsLocation(location) : null;
  if (location && !resolvedLocation) {
    return NextResponse.json({
      error: 'The market location could not be resolved. A local benchmark will not be calculated without verified coordinates. Check the location and MapTiler configuration.',
    }, { status: 422 });
  }

  const sourceLocation = resolvedLocation?.state || location;
  const licensedSearch = {
    procedureCode: procedure.code,
    procedureName: procedure.name,
    location,
    latitude: resolvedLocation?.latitude,
    longitude: resolvedLocation?.longitude,
    radiusMiles,
  };
  const configured = Object.fromEntries(PRIORITY_FEED_STATUS.map((source) => [source.id, source.configured]));

  const allSourceResults = await Promise.all([
    runSource('medrates', 'MedRates.fyi', () => searchMedRatesCash({
      procedureCode: procedure.code,
      procedureName: procedure.name,
      location: sourceLocation,
      latitude: resolvedLocation?.latitude,
      longitude: resolvedLocation?.longitude,
    }), resolvedLocation, radiusMiles),
    runSource('medcompare', 'MedCompare', () => searchMedCompareCash({
      procedureCode: procedure.code,
      procedureName: procedure.name,
      location: sourceLocation,
    }), resolvedLocation, radiusMiles),
    runFairVisitSource(procedure.code, procedure.name, resolvedLocation, radiusMiles),
    runSource('clear-health-costs', 'ClearHealthCosts', () => searchClearHealthCostsCash(licensedSearch), resolvedLocation, radiusMiles, configured['clear-health-costs']),
    runSource('turquoise-health', 'Turquoise Health', () => searchTurquoiseRawCash(licensedSearch), resolvedLocation, radiusMiles, configured['turquoise-health']),
    runSource('fair-health', 'FAIR Health', () => searchFairHealthCash(licensedSearch), resolvedLocation, radiusMiles, configured['fair-health']),
  ]);

  // An adapter existing in code is not the same thing as a live feed. Do not send
  // unconfigured licensed feeds to the client as if they had been queried.
  const sourceResults = allSourceResults.filter((source) => source.status !== 'unconfigured');
  const allEligibleObservations = sourceResults.flatMap((source) => source.observations);
  const pooled = summarizePrices(allEligibleObservations.map((item) => item.price));

  // Each source gets one vote in the headline median regardless of its row count.
  const sourceMedians = sourceResults
    .map((source) => source.summary.median)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const sourceBalancedMedian = summarizePrices(sourceMedians).median;

  return NextResponse.json({
    procedure,
    location: location ?? null,
    resolvedLocation,
    radiusMiles,
    policy: {
      includedPaymentBases: ['cash', 'self_pay', 'discounted_cash', 'uninsured', 'direct_pay', 'marketplace_cash'],
      excluded: ['Medicare', 'Medicaid', 'commercial negotiated', 'insurance allowed', 'claims average', 'gross charge', 'chargemaster', 'unknown'],
      combinationMethod: 'Sources remain separate. Headline median is the median of live source medians; low/high and count reflect pooled eligible cash observations.',
      geographicMethod: resolvedLocation && radiusMiles
        ? 'Only observations verified inside the requested market are included; source-level state/national fallbacks are not allowed into the local headline benchmark.'
        : 'No radius filter was applied.',
      sourceGuardrails: {
        fairHealth: 'Out-of-network/uninsured full-charge benchmarks and claims-derived amounts are not eligible. Only an explicitly licensed cash/self-pay field is accepted.',
        turquoise: 'Consumer Pricing composite estimates, negotiated rates, claims-derived values, and Medicare reference signals are not eligible. Only raw provider-published cash/discounted-cash fields are accepted.',
        clearHealthCosts: 'Only explicit cash/self-pay observations from the permitted API/feed are accepted.',
        fairVisitHealth: 'Only hospital-published discounted cash values are eligible. Medicare fields, national composite context, and state fallback medians are ignored.',
      },
    },
    sources: sourceResults,
    configuredFeeds: PRIORITY_FEED_STATUS,
    combined: { ...pooled, median: sourceBalancedMedian },
    pooled,
    benchmark: { sourceCount: sourceMedians.length, median: sourceBalancedMedian },
  });
}
