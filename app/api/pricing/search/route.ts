import { NextRequest, NextResponse } from 'next/server';
import { PROCEDURES } from '@/lib/pricing/procedures';
import { searchMedRatesCash } from '@/lib/pricing/adapters/medrates';
import { searchMedCompareCash } from '@/lib/pricing/adapters/medcompare';
import { summarizePrices } from '@/lib/pricing/statistics';
import { geocodeUsLocation, type ResolvedLocation } from '@/lib/pricing/geocode';
import type { PriceObservationInput } from '@/lib/pricing/source-registry';

export const dynamic = 'force-dynamic';

type SourceResult = {
  sourceId: string;
  sourceName: string;
  status: 'ok' | 'empty' | 'error';
  error?: string;
  observations: PriceObservationInput[];
  summary: ReturnType<typeof summarizePrices>;
  excludedByRadius: number;
  excludedWithoutCoordinates: number;
};

function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

function applyRadius(
  observations: PriceObservationInput[],
  center: ResolvedLocation | null,
  radiusMiles: number | null,
) {
  if (!center || !radiusMiles) {
    return { observations, excludedByRadius: 0, excludedWithoutCoordinates: 0 };
  }

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
): Promise<SourceResult> {
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
    return {
      sourceId,
      sourceName,
      status: 'error',
      error: error instanceof Error ? error.message : `${sourceName} search failed.`,
      observations: [],
      summary: summarizePrices([]),
      excludedByRadius: 0,
      excludedWithoutCoordinates: 0,
    };
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim();
  const location = request.nextUrl.searchParams.get('location')?.trim() || undefined;
  const radiusParam = Number(request.nextUrl.searchParams.get('radius'));
  const radiusMiles = location && Number.isFinite(radiusParam) && radiusParam > 0
    ? Math.min(radiusParam, 250)
    : location ? 50 : null;

  if (!code) {
    return NextResponse.json({ error: 'A procedure code is required.' }, { status: 400 });
  }

  const procedure = PROCEDURES.find((item) => item.code.toLowerCase() === code.toLowerCase());
  if (!procedure) {
    return NextResponse.json({ error: `Procedure ${code} is not in the current catalog.` }, { status: 404 });
  }

  const resolvedLocation = location ? await geocodeUsLocation(location) : null;
  const sourceLocation = resolvedLocation?.state
    ? `${location || resolvedLocation.displayName}, ${resolvedLocation.state}`
    : location;

  const [medRates, medCompare] = await Promise.all([
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
  ]);

  const sourceResults = [medRates, medCompare];
  const allEligibleObservations = sourceResults.flatMap((source) => source.observations);
  const pooled = summarizePrices(allEligibleObservations.map((item) => item.price));

  // Keep sources analytically separate. A source with many more rows should not
  // dominate the headline benchmark simply because it contributes more records.
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
      combinationMethod: 'Sources remain separate. Headline median is the median of live source medians; low/high and count reflect the pooled eligible observations.',
      geographicMethod: resolvedLocation && radiusMiles
        ? `Only observations with verifiable coordinates within ${radiusMiles} miles of the resolved search location are included.`
        : 'No radius filter was applied.',
    },
    sources: sourceResults,
    combined: {
      ...pooled,
      median: sourceBalancedMedian,
    },
    pooled,
    benchmark: {
      sourceCount: sourceMedians.length,
      median: sourceBalancedMedian,
    },
  });
}
