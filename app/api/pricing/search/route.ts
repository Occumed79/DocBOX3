import { NextRequest, NextResponse } from 'next/server';
import { PROCEDURES } from '@/lib/pricing/procedures';
import { searchMedRatesCash } from '@/lib/pricing/adapters/medrates';
import { summarizePrices } from '@/lib/pricing/statistics';

export const dynamic = 'force-dynamic';

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

  const sourceResults: Array<{
    sourceId: string;
    sourceName: string;
    status: 'ok' | 'empty' | 'error';
    error?: string;
    observations: Awaited<ReturnType<typeof searchMedRatesCash>>;
    summary: ReturnType<typeof summarizePrices>;
  }> = [];

  try {
    const observations = await searchMedRatesCash({
      procedureCode: procedure.code,
      procedureName: procedure.name,
      location,
    });
    sourceResults.push({
      sourceId: 'medrates',
      sourceName: 'MedRates.fyi',
      status: observations.length ? 'ok' : 'empty',
      observations,
      summary: summarizePrices(observations.map((item) => item.price)),
    });
  } catch (error) {
    sourceResults.push({
      sourceId: 'medrates',
      sourceName: 'MedRates.fyi',
      status: 'error',
      error: error instanceof Error ? error.message : 'MedRates search failed.',
      observations: [],
      summary: summarizePrices([]),
    });
  }

  const allEligibleObservations = sourceResults.flatMap((source) => source.observations);

  return NextResponse.json({
    procedure,
    location: location ?? null,
    policy: {
      includedPaymentBases: ['cash', 'self_pay', 'discounted_cash', 'uninsured', 'direct_pay', 'marketplace_cash'],
      excluded: ['Medicare', 'Medicaid', 'commercial negotiated', 'insurance allowed', 'claims average', 'gross charge', 'chargemaster', 'unknown'],
    },
    sources: sourceResults,
    combined: summarizePrices(allEligibleObservations.map((item) => item.price)),
  });
}
