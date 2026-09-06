import { NextRequest, NextResponse } from 'next/server';
import { PROCEDURES } from '@/lib/pricing/procedures';
import { searchMedRatesCash } from '@/lib/pricing/adapters/medrates';
import { searchMedCompareCash } from '@/lib/pricing/adapters/medcompare';
import { summarizePrices } from '@/lib/pricing/statistics';
import type { PriceObservationInput } from '@/lib/pricing/source-registry';

export const dynamic = 'force-dynamic';

type SourceResult = {
  sourceId: string;
  sourceName: string;
  status: 'ok' | 'empty' | 'error';
  error?: string;
  observations: PriceObservationInput[];
  summary: ReturnType<typeof summarizePrices>;
};

async function runSource(
  sourceId: string,
  sourceName: string,
  runner: () => Promise<PriceObservationInput[]>,
): Promise<SourceResult> {
  try {
    const observations = await runner();
    return {
      sourceId,
      sourceName,
      status: observations.length ? 'ok' : 'empty',
      observations,
      summary: summarizePrices(observations.map((item) => item.price)),
    };
  } catch (error) {
    return {
      sourceId,
      sourceName,
      status: 'error',
      error: error instanceof Error ? error.message : `${sourceName} search failed.`,
      observations: [],
      summary: summarizePrices([]),
    };
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim();
  const location = request.nextUrl.searchParams.get('location')?.trim() || undefined;

  if (!code) {
    return NextResponse.json({ error: 'A procedure code is required.' }, { status: 400 });
  }

  const procedure = PROCEDURES.find((item) => item.code.toLowerCase() === code.toLowerCase());
  if (!procedure) {
    return NextResponse.json({ error: `Procedure ${code} is not in the current catalog.` }, { status: 404 });
  }

  const [medRates, medCompare] = await Promise.all([
    runSource('medrates', 'MedRates.fyi', () => searchMedRatesCash({
      procedureCode: procedure.code,
      procedureName: procedure.name,
      location,
    })),
    runSource('medcompare', 'MedCompare', () => searchMedCompareCash({
      procedureCode: procedure.code,
      procedureName: procedure.name,
      location,
    })),
  ]);

  const sourceResults = [medRates, medCompare];
  const allEligibleObservations = sourceResults.flatMap((source) => source.observations);
  const pooled = summarizePrices(allEligibleObservations.map((item) => item.price));

  // A source with thousands of rows should not silently overpower a smaller source.
  // The source-balanced benchmark gives every live source one vote by taking the
  // median of each source's median. Raw pooled distribution remains available separately.
  const sourceMedians = sourceResults
    .map((source) => source.summary.median)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const sourceBalanced = summarizePrices(sourceMedians);

  return NextResponse.json({
    procedure,
    location: location ?? null,
    policy: {
      includedPaymentBases: ['cash', 'self_pay', 'discounted_cash', 'uninsured', 'direct_pay', 'marketplace_cash'],
      excluded: ['Medicare', 'Medicaid', 'commercial negotiated', 'insurance allowed', 'claims average', 'gross charge', 'chargemaster', 'unknown'],
      combinationMethod: 'Source medians are kept separate. The headline benchmark is the median of live source medians; pooled observations are reported independently.',
    },
    sources: sourceResults,
    combined: pooled,
    benchmark: {
      sourceCount: sourceMedians.length,
      median: sourceBalanced.median,
    },
  });
}
