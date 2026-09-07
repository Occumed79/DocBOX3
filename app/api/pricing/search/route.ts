import { NextRequest, NextResponse } from 'next/server';
import { procedureFromCode } from '@/lib/pricing/procedures';
import { searchMedRatesCash } from '@/lib/pricing/adapters/medrates';
import { searchMedCompareCash } from '@/lib/pricing/adapters/medcompare';
import { searchFairVisitCash } from '@/lib/pricing/adapters/fairvisit';
import { searchLoaCash } from '@/lib/pricing/adapters/loa';
import { searchOccumedOpenCashSources } from '@/lib/pricing/adapters/occumed-open-sources';
import { searchRadiologyAssistCash } from '@/lib/pricing/adapters/radiology-assist';
import { PRIORITY_FEED_STATUS, searchTurquoiseRawCash } from '@/lib/pricing/adapters/priority-feeds';
import { rankPricingEvidence } from '@/lib/pricing/evidence-ranking';
import { enrichObservationsForMap } from '@/lib/pricing/map-enrichment';
import { summarizePrices } from '@/lib/pricing/statistics';
import { geocodeUsLocation, type ResolvedLocation } from '@/lib/pricing/geocode';
import {
  provenanceFamilyForSource,
  type PriceObservationInput,
  type ProvenanceFamily,
} from '@/lib/pricing/source-registry';

export const dynamic = 'force-dynamic';

type SourceStatus = 'ok' | 'empty' | 'error' | 'unconfigured';

type SourceResult = {
  sourceId: string;
  sourceName: string;
  provenanceFamily: ProvenanceFamily;
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
  headlineEligible?: boolean;
  evidenceRank?: number;
  evidenceScore?: number;
  evidenceReason?: string;
};

function emptySource(sourceId: string, sourceName: string, status: SourceStatus, error?: string): SourceResult {
  return {
    sourceId,
    sourceName,
    provenanceFamily: provenanceFamilyForSource(sourceId),
    status,
    error,
    observations: [],
    summary: summarizePrices([]),
    excludedByRadius: 0,
    excludedWithoutCoordinates: 0,
    headlineEligible: false,
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
      provenanceFamily: provenanceFamilyForSource(sourceId),
      status: filtered.observations.length ? 'ok' : 'empty',
      observations: filtered.observations,
      summary: summarizePrices(filtered.observations.map((item) => item.price)),
      excludedByRadius: filtered.excludedByRadius,
      excludedWithoutCoordinates: filtered.excludedWithoutCoordinates,
      headlineEligible: filtered.observations.length > 0,
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
      provenanceFamily: provenanceFamilyForSource('fairvisit-health'),
      status: hasUsefulData ? 'ok' : 'empty',
      observations: result.observations,
      summary: result.summary,
      excludedByRadius: 0,
      excludedWithoutCoordinates: 0,
      attribution: result.attribution,
      disclaimer: result.disclaimer,
      sourceScope: result.sourceScope,
      dataRefreshed: result.dataRefreshed,
      headlineEligible: hasUsefulData,
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

function dedupeObservations(observations: PriceObservationInput[]) {
  const seen = new Set<string>();
  const deduped: PriceObservationInput[] = [];
  for (const item of observations) {
    const family = provenanceFamilyForSource(item.sourceId);
    const provider = (item.providerName || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    const place = [item.city, item.state, item.postalCode].filter(Boolean).join('|').toLowerCase();
    const providerKey = provider || `source:${item.sourceId}`;
    const key = [family, providerKey, place, item.procedureCode.toUpperCase(), item.price.toFixed(2)].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function familyBalancedMedian(sources: SourceResult[]) {
  const byFamily = new Map<ProvenanceFamily, number[]>();
  for (const source of sources) {
    if (source.headlineEligible === false) continue;
    const median = source.summary.median;
    if (median === null || !Number.isFinite(median)) continue;
    const values = byFamily.get(source.provenanceFamily) || [];
    values.push(median);
    byFamily.set(source.provenanceFamily, values);
  }

  const familyMedians = [...byFamily.entries()].flatMap(([family, values]) => {
    const median = summarizePrices(values).median;
    return median === null ? [] : [{ family, median, sourceCount: values.length }];
  });

  return {
    median: summarizePrices(familyMedians.map((item) => item.median)).median,
    familyMedians,
  };
}

async function enrichSourceObservationsForMap(sources: SourceResult[], local: boolean) {
  const flattened = sources.flatMap((source) => source.observations);
  const enriched = await enrichObservationsForMap(flattened, local ? 40 : 80);
  let offset = 0;
  return sources.map((source) => {
    const observations = enriched.slice(offset, offset + source.observations.length);
    offset += source.observations.length;
    return { ...source, observations };
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim();
  const location = request.nextUrl.searchParams.get('location')?.trim() || undefined;
  const radiusParam = Number(request.nextUrl.searchParams.get('radius'));
  const radiusMiles = location && Number.isFinite(radiusParam) && radiusParam > 0
    ? Math.min(radiusParam, 250)
    : location ? 50 : null;

  if (!code) return NextResponse.json({ error: 'A procedure code is required.' }, { status: 400 });

  const procedure = procedureFromCode(code);
  if (!procedure) {
    return NextResponse.json({
      error: `“${code}” is not a recognized CPT, CDT, or HCPCS code format. Enter a 5-digit CPT code, a D-prefixed CDT code, or a letter-plus-four-digits HCPCS code.`,
    }, { status: 400 });
  }

  const resolvedLocation = location ? await geocodeUsLocation(location) : null;
  if (location && !resolvedLocation) {
    return NextResponse.json({
      error: 'The market location could not be resolved. A local benchmark will not be calculated without verified coordinates. Check the location and MapTiler configuration.',
    }, { status: 422 });
  }

  const sourceLocation = resolvedLocation?.state || location;
  const cashSearch = {
    procedureCode: procedure.code,
    procedureName: procedure.name,
    location,
    latitude: resolvedLocation?.latitude,
    longitude: resolvedLocation?.longitude,
    radiusMiles,
  };
  const configured = Object.fromEntries(PRIORITY_FEED_STATUS.map((source) => [source.id, source.configured]));

  const openSourcesPromise = searchOccumedOpenCashSources({
    procedureCode: procedure.code,
    procedureName: procedure.name,
    city: resolvedLocation?.city,
    state: resolvedLocation?.state,
    postalCode: resolvedLocation?.postalCode,
    latitude: resolvedLocation?.latitude,
    longitude: resolvedLocation?.longitude,
    radiusMiles,
  });
  const radiologyAssistPromise = searchRadiologyAssistCash({
    procedureCode: procedure.code,
    procedureName: procedure.name,
    city: resolvedLocation?.city,
    state: resolvedLocation?.state,
  });

  const coreSourceResults = await Promise.all([
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
    runSource('loa', 'Loa', () => searchLoaCash({
      procedureCode: procedure.code,
      procedureName: procedure.name,
      city: resolvedLocation?.city,
      state: resolvedLocation?.state,
    }), resolvedLocation, radiusMiles),
    runSource('turquoise-health', 'Turquoise Health', () => searchTurquoiseRawCash(cashSearch), resolvedLocation, radiusMiles, configured['turquoise-health']),
  ]);

  const [openSources, radiologyAssist] = await Promise.all([openSourcesPromise, radiologyAssistPromise]);
  const openSourceResults: SourceResult[] = openSources.map((source) => ({
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    provenanceFamily: source.provenanceFamily,
    status: source.summary.count > 0 || source.summary.median !== null ? 'ok' : 'empty',
    observations: source.observations,
    summary: source.summary,
    excludedByRadius: 0,
    excludedWithoutCoordinates: 0,
    attribution: source.attribution,
    disclaimer: source.disclaimer,
    sourceScope: source.sourceScope,
    dataRefreshed: source.dataRefreshed,
    headlineEligible: source.headlineEligible,
  }));
  const radiologyAssistResult: SourceResult = {
    sourceId: radiologyAssist.sourceId,
    sourceName: radiologyAssist.sourceName,
    provenanceFamily: radiologyAssist.provenanceFamily,
    status: radiologyAssist.observations.length ? 'ok' : 'empty',
    observations: radiologyAssist.observations,
    summary: radiologyAssist.summary,
    excludedByRadius: 0,
    excludedWithoutCoordinates: 0,
    attribution: radiologyAssist.attribution,
    disclaimer: radiologyAssist.disclaimer,
    sourceScope: radiologyAssist.sourceScope,
    headlineEligible: radiologyAssist.headlineEligible,
  };

  const sourceResults = [...coreSourceResults, ...openSourceResults, radiologyAssistResult]
    .filter((source) => source.status !== 'unconfigured');
  const allEligibleObservations = dedupeObservations(sourceResults.flatMap((source) => source.observations));
  const pooled = summarizePrices(allEligibleObservations.map((item) => item.price));
  const provenanceBalanced = familyBalancedMedian(sourceResults);

  // AI ranks evidence quality only after strict self-pay filtering and benchmark arithmetic.
  // It never receives authority to alter a price or benchmark. National map requests skip AI.
  const ranking = location
    ? await rankPricingEvidence(sourceResults, {
      procedureCode: procedure.code,
      procedureName: procedure.name,
      market: resolvedLocation?.displayName || location,
    })
    : {
      provider: 'deterministic' as const,
      advisoryOnly: true as const,
      ranked: [],
      note: 'National map search bypasses external AI ranking. Pricing and heat-map calculations remain deterministic.',
    };

  const rankBySource = new Map(ranking.ranked.map((item) => [item.sourceId, item]));
  const rankedSourceResults = sourceResults
    .map((source) => {
      const ranked = rankBySource.get(source.sourceId);
      return ranked ? {
        ...source,
        evidenceRank: ranked.rank,
        evidenceScore: ranked.score,
        evidenceReason: ranked.reason,
      } : source;
    })
    .sort((a, b) => (a.evidenceRank ?? Number.MAX_SAFE_INTEGER) - (b.evidenceRank ?? Number.MAX_SAFE_INTEGER));

  // Presentation-only geocoding is deliberately after benchmark calculation and AI ranking.
  const responseSources = await enrichSourceObservationsForMap(rankedSourceResults, Boolean(location));
  const headlineSources = sourceResults.filter((source) => source.headlineEligible !== false && source.summary.median !== null);
  const mappableObservationCount = responseSources
    .flatMap((source) => source.observations)
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).length;

  return NextResponse.json({
    procedure,
    location: location ?? null,
    resolvedLocation,
    radiusMiles,
    policy: {
      includedPaymentBases: ['cash', 'self_pay', 'discounted_cash', 'uninsured', 'direct_pay', 'marketplace_cash'],
      excluded: ['Medicare', 'Medicaid', 'commercial negotiated', 'insurance allowed', 'claims average', 'gross charge', 'chargemaster', 'unknown'],
      combinationMethod: 'Headline benchmark is balanced by independent provenance family, not raw source count. Multiple aggregators of the same hospital MRF cash row receive one family-level vote. Pooled count/low/high are deduplicated by provenance family + provider + market + procedure + price.',
      geographicMethod: resolvedLocation && radiusMiles
        ? 'Coordinate-capable sources are hard-filtered to the requested radius. Public sources without coordinates must independently restrict to an exact local market or remain supporting-only evidence. Later geocoding is presentation-only and cannot admit a row into the benchmark.'
        : 'No local radius filter was applied. Map-only geocoding may add approximate city/ZIP coordinates without affecting the benchmark.',
      rankingMethod: 'Cohere/Cerebras may rank evidence quality after strict filtering. Ranking is advisory only and cannot change a price, source median, pooled statistic, provenance-family median, or headline benchmark.',
      sourceGuardrails: {
        turquoise: 'OAuth API is queried with pricing.type=cash; negotiated/payer/network rows are rejected again after retrieval.',
        hospitalMrfFamily: 'Turquoise, Hospital Ledger, PriceTransparency.io, MedRates, MedCompare, FairVisit and other MRF-derived cash sources share one hospital-MRF provenance family so duplicated underlying rows cannot multiply their influence.',
        marketCare: 'Only real cash quotes/provider cash menus are eligible; its public lowest-price index is supporting floor evidence, not a median vote.',
        radiologyAssist: 'Only an exact study row on a local RadiologyAssist self-pay page is accepted; national averages and nonmatching imaging rows are rejected.',
        realDentalCosts: 'Only rows explicitly marked observed are eligible; modeled bands, Medicaid and insurance values are rejected.',
        labs: 'TestWell and LabTestInsight are direct-purchase/direct-pay evidence and are kept distinct from local clinic cash prices.',
      },
    },
    sources: responseSources,
    configuredFeeds: PRIORITY_FEED_STATUS,
    ranking,
    combined: { ...pooled, median: provenanceBalanced.median },
    pooled,
    benchmark: {
      sourceCount: headlineSources.length,
      provenanceFamilyCount: provenanceBalanced.familyMedians.length,
      familyMedians: provenanceBalanced.familyMedians,
      median: provenanceBalanced.median,
    },
    map: {
      mappableObservationCount,
      coordinateEnrichment: 'presentation-only',
    },
  });
}
