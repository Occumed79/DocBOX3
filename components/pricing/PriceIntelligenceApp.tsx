'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PriceMap from './PriceMap';
import { PROCEDURES, searchProcedures, type ProcedureDefinition } from '@/lib/pricing/procedures';
import { PRICING_SOURCES, type PricingSource, type ProvenanceFamily } from '@/lib/pricing/source-registry';

type Section = 'overview' | 'lookup' | 'map' | 'compare' | 'reports' | 'sources';

type PriceSummary = {
  count: number;
  low: number | null;
  median: number | null;
  high: number | null;
  p25: number | null;
  p75: number | null;
};

type ApiObservation = {
  sourceId: string;
  procedureCode: string;
  procedureName: string;
  price: number;
  paymentBasis: string;
  providerName?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  sourceUrl?: string;
  observedAt?: string;
};

type SourceResult = {
  sourceId: string;
  sourceName: string;
  provenanceFamily: ProvenanceFamily;
  status: 'ok' | 'empty' | 'error' | 'unconfigured';
  error?: string;
  observations: ApiObservation[];
  summary: PriceSummary;
  excludedByRadius?: number;
  excludedWithoutCoordinates?: number;
  attribution?: string;
  disclaimer?: string;
  sourceScope?: string;
  dataRefreshed?: string;
  headlineEligible?: boolean;
  evidenceRank?: number;
  evidenceScore?: number;
  evidenceReason?: string;
};

type FamilyMedian = {
  family: ProvenanceFamily;
  median: number;
  sourceCount: number;
};

type PricingSearchResponse = {
  procedure: ProcedureDefinition;
  location: string | null;
  radiusMiles?: number | null;
  resolvedLocation?: {
    displayName: string;
    latitude: number;
    longitude: number;
    city?: string;
    state?: string;
    postalCode?: string;
  } | null;
  sources: SourceResult[];
  combined: PriceSummary;
  pooled?: PriceSummary;
  benchmark?: {
    sourceCount: number;
    provenanceFamilyCount: number;
    familyMedians: FamilyMedian[];
    median: number | null;
  };
  ranking?: {
    provider: 'cohere+cerebras' | 'cohere' | 'cerebras' | 'deterministic';
    advisoryOnly: true;
    note: string;
  };
  map?: {
    mappableObservationCount: number;
    coordinateEnrichment: string;
  };
};

const NAV: Array<{ id: Section; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'lookup', label: 'Price Lookup' },
  { id: 'map', label: 'Price Map' },
  { id: 'compare', label: 'Compare Quote' },
  { id: 'reports', label: 'Reports' },
  { id: 'sources', label: 'Sources' },
];

const RADII = [25, 50, 75, 100];

const FAMILY_LABELS: Record<ProvenanceFamily, string> = {
  hospital_mrf_cash: 'Hospital-published cash',
  provider_verified_quote: 'Provider-verified cash',
  provider_published_cash: 'Provider-published cash',
  direct_pay_marketplace: 'Direct-pay marketplace',
  imaging_clinic_cash: 'Independent imaging cash',
  dental_observed_cash: 'Observed dental cash',
  lab_direct_purchase: 'Direct-purchase labs',
  mixed_cash: 'Mixed cash provenance',
  unknown_cash: 'Other verified cash',
};

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function familyLabel(family?: ProvenanceFamily) {
  return family ? FAMILY_LABELS[family] : 'Verified self-pay evidence';
}

function sourceName(sourceId: string) {
  return PRICING_SOURCES.find((source) => source.id === sourceId)?.name || sourceId;
}

function integrationLabel(source: PricingSource) {
  if (source.integrationState === 'live') return 'LIVE';
  if (source.integrationState === 'credential-required') return 'CREDENTIAL REQUIRED';
  return 'REGISTERED';
}

function evidenceLabel(score?: number) {
  if (!Number.isFinite(score)) return null;
  const normalized = Number(score);
  if (normalized >= 0.78) return 'Strong evidence';
  if (normalized >= 0.58) return 'Good evidence';
  return 'Supporting evidence';
}

function ProcedurePicker({ value, onChange }: { value: ProcedureDefinition; onChange: (procedure: ProcedureDefinition) => void }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchProcedures(query).slice(0, 8), [query]);
  const [open, setOpen] = useState(false);

  return (
    <div className="pi-procedure-picker">
      <label className="pi-field-label">Procedure</label>
      <button className="pi-select glass-control" type="button" onClick={() => setOpen((current) => !current)}>
        <span><strong>{value.name}</strong><small>{value.codeSystem} {value.code}</small></span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="pi-picker-popover glass-panel">
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pano, D0330, EKG, stress test…" />
          <div className="pi-picker-results">
            {matches.map((procedure) => (
              <button
                type="button"
                key={`${procedure.codeSystem}-${procedure.code}`}
                onClick={() => {
                  onChange(procedure);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <span><strong>{procedure.name}</strong><small>{procedure.category}</small></span>
                <b>{procedure.code}</b>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RadiusField({ value, onChange }: { value: number; onChange: (radius: number) => void }) {
  return (
    <label className="pi-field">
      <span>Radius</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {RADII.map((radius) => <option key={radius} value={radius}>{radius} miles</option>)}
      </select>
    </label>
  );
}

function SourceBadges() {
  const live = PRICING_SOURCES.filter((source) => source.integrationState === 'live');
  return (
    <div className="pi-source-row">
      {live.slice(0, 4).map((source) => <span key={source.id}>{source.name}</span>)}
      <span>+ {Math.max(0, live.length - 4)} live cash sources</span>
    </div>
  );
}

function FamilyStrip({ result }: { result: PricingSearchResponse }) {
  const families = result.benchmark?.familyMedians || [];
  if (!families.length) return null;
  return (
    <div className="pi-family-strip">
      <div className="pi-family-strip-heading">
        <span>INDEPENDENT EVIDENCE FAMILIES</span>
        <b>{families.length} family{families.length === 1 ? '' : 'ies'} voting in headline benchmark</b>
      </div>
      <div className="pi-family-grid">
        {families.map((item) => (
          <div className="pi-family-chip" key={item.family}>
            <span>{familyLabel(item.family)}</span>
            <strong>{money(item.median)}</strong>
            <small>{item.sourceCount} contributing source{item.sourceCount === 1 ? '' : 's'}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

async function fetchPricing(procedure: ProcedureDefinition, location?: string, radius?: number): Promise<PricingSearchResponse> {
  const params = new URLSearchParams({ code: procedure.code });
  if (location?.trim()) params.set('location', location.trim());
  if (location?.trim() && radius) params.set('radius', String(radius));
  const response = await fetch(`/api/pricing/search?${params.toString()}`, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || 'Price search failed.');
  return payload as PricingSearchResponse;
}

export default function PriceIntelligenceApp() {
  const [section, setSection] = useState<Section>('overview');
  const [lookupProcedure, setLookupProcedure] = useState(PROCEDURES[4]);
  const [mapProcedure, setMapProcedure] = useState(PROCEDURES[4]);
  const [compareProcedure, setCompareProcedure] = useState(PROCEDURES[4]);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(50);
  const [quotePrice, setQuotePrice] = useState('');

  const [lookupResult, setLookupResult] = useState<PricingSearchResponse | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<PricingSearchResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [mapResult, setMapResult] = useState<PricingSearchResponse | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapSource, setMapSource] = useState('all');
  const [mapMetric, setMapMetric] = useState<'index' | 'cash'>('index');

  useEffect(() => {
    if (section !== 'map') return;
    let cancelled = false;
    setMapLoading(true);
    fetchPricing(mapProcedure)
      .then((result) => { if (!cancelled) setMapResult(result); })
      .catch(() => { if (!cancelled) setMapResult(null); })
      .finally(() => { if (!cancelled) setMapLoading(false); });
    return () => { cancelled = true; };
  }, [mapProcedure, section]);

  const mapObservations = useMemo(() => {
    const median = mapResult?.combined.median;
    if (!mapResult || !median) return [];
    return mapResult.sources
      .filter((source) => mapSource === 'all' || source.sourceId === mapSource)
      .flatMap((source) => source.observations)
      .filter((observation) => Number.isFinite(observation.latitude) && Number.isFinite(observation.longitude))
      .map((observation, index) => ({
        id: `${observation.sourceId}-${observation.procedureCode}-${index}`,
        latitude: observation.latitude as number,
        longitude: observation.longitude as number,
        price: observation.price,
        priceIndex: (observation.price / median) * 100,
        source: sourceName(observation.sourceId),
        provider: observation.providerName,
        city: observation.city,
        state: observation.state,
      }));
  }, [mapResult, mapSource]);

  const sourceDirectory = useMemo(() => [...PRICING_SOURCES].sort((a, b) => {
    const weight = (source: PricingSource) => source.integrationState === 'live' ? 0 : source.integrationState === 'registered' ? 1 : 2;
    return weight(a) - weight(b) || a.name.localeCompare(b.name);
  }), []);

  const quote = Number(quotePrice.replace(/[$,]/g, ''));
  const compareMedian = compareResult?.combined.median ?? null;
  const variancePercent = compareMedian && Number.isFinite(quote) && quote > 0
    ? ((quote - compareMedian) / compareMedian) * 100
    : null;
  const quoteAssessment = variancePercent === null
    ? null
    : variancePercent <= 10 ? 'Within market range'
      : variancePercent <= 25 ? 'Moderately above market'
        : variancePercent <= 50 ? 'High relative to market'
          : 'Very high relative to market';

  const reportSources = compareResult?.sources.filter((source) => source.summary.median !== null || source.observations.length > 0) || [];
  const reportMarket = compareResult?.resolvedLocation?.displayName || compareResult?.location || location || 'Selected market';
  const reportRadius = compareResult?.radiusMiles || radius;
  const reportVarianceDollars = compareMedian !== null && Number.isFinite(quote) ? quote - compareMedian : null;
  const reportFinding = compareMedian !== null && variancePercent !== null
    ? `The quoted fee of ${money(quote)} is ${Math.abs(variancePercent).toFixed(1)}% ${variancePercent >= 0 ? 'above' : 'below'} the provenance-balanced self-pay median of ${money(compareMedian)} for the selected market. ${quoteAssessment}.`
    : '';

  async function runLookup() {
    setLookupLoading(true);
    setLookupError(null);
    try {
      setLookupResult(await fetchPricing(lookupProcedure, location, radius));
    } catch (error) {
      setLookupResult(null);
      setLookupError(error instanceof Error ? error.message : 'Price lookup failed.');
    } finally {
      setLookupLoading(false);
    }
  }

  async function runCompare() {
    if (!Number.isFinite(quote) || quote <= 0) {
      setCompareError('Enter a valid quoted price.');
      return;
    }
    setCompareLoading(true);
    setCompareError(null);
    try {
      setCompareResult(await fetchPricing(compareProcedure, location, radius));
    } catch (error) {
      setCompareResult(null);
      setCompareError(error instanceof Error ? error.message : 'Quote analysis failed.');
    } finally {
      setCompareLoading(false);
    }
  }

  return (
    <main className="pi-app">
      <div className="pi-aurora pi-aurora-one" aria-hidden="true" />
      <div className="pi-aurora pi-aurora-two" aria-hidden="true" />
      <div className="pi-noise" aria-hidden="true" />

      <header className="pi-topbar glass-panel">
        <Link href="/" className="pi-brand" aria-label="Return to landing page">
          <span className="pi-brand-mark">OM</span>
          <span><strong>Price Intelligence</strong><small>Self-Pay Market Explorer</small></span>
        </Link>
        <nav className="pi-nav" aria-label="Price Intelligence sections">
          {NAV.map((item) => (
            <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)} type="button">{item.label}</button>
          ))}
        </nav>
        <div className="pi-purity-badge"><i /> Self-pay only</div>
      </header>

      <section className="pi-content">
        {section === 'overview' && (
          <div className="pi-overview">
            <div className="pi-hero-copy">
              <span className="pi-eyebrow">HEALTHCARE CASH-PRICE INTELLIGENCE</span>
              <h1>Know the market<br />before the price feels wrong.</h1>
              <p>Explore verified self-pay pricing by procedure and geography, compare a provider quote, or open the national heat map directly. Medicare and insurance reimbursement data are excluded from benchmark calculations.</p>
              <SourceBadges />
            </div>
            <div className="pi-tool-grid">
              <button className="pi-tool-card glass-panel" onClick={() => setSection('lookup')} type="button"><span className="pi-tool-index">01</span><div><h2>Lookup</h2><p>Find the observed self-pay market for a procedure in an area.</p></div><b>Open →</b></button>
              <button className="pi-tool-card glass-panel featured" onClick={() => setSection('map')} type="button"><span className="pi-tool-index">02</span><div><h2>Price Map</h2><p>Explore pricing geography independently, procedure by procedure.</p></div><b>Explore →</b></button>
              <button className="pi-tool-card glass-panel" onClick={() => setSection('compare')} type="button"><span className="pi-tool-index">03</span><div><h2>Compare</h2><p>Measure a quoted fee against the local cash-pay market.</p></div><b>Analyze →</b></button>
              <button className="pi-tool-card glass-panel" onClick={() => setSection('reports')} type="button"><span className="pi-tool-index">04</span><div><h2>Reports</h2><p>Turn a comparison into a polished leadership-ready brief.</p></div><b>Review →</b></button>
            </div>
          </div>
        )}

        {section === 'lookup' && (
          <div className="pi-workspace">
            <div className="pi-section-heading">
              <span className="pi-eyebrow">PRICE LOOKUP</span>
              <h1>What does this procedure cost as self-pay?</h1>
              <p>Every source keeps its identity. The headline median gives each independent provenance family one vote, so duplicate hospital-MRF aggregators cannot overpower genuinely independent provider, marketplace, dental, imaging or lab evidence.</p>
            </div>
            <div className="pi-query-card glass-panel">
              <ProcedurePicker value={lookupProcedure} onChange={setLookupProcedure} />
              <label className="pi-field"><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, state or ZIP" /></label>
              <RadiusField value={radius} onChange={setRadius} />
              <button className="pi-primary" type="button" onClick={runLookup} disabled={lookupLoading}>{lookupLoading ? 'Searching…' : 'Search self-pay market'}</button>
            </div>

            {lookupError && <div className="pi-error-panel glass-panel">{lookupError}</div>}
            {lookupResult && (
              <>
                {lookupResult.resolvedLocation && (
                  <div className="pi-location-resolution"><span>Resolved market</span><strong>{lookupResult.resolvedLocation.displayName}</strong><b>{lookupResult.radiusMiles || radius} mi radius</b></div>
                )}
                <div className="pi-market-summary glass-panel">
                  <div><span>ELIGIBLE OBSERVATIONS</span><strong>{lookupResult.combined.count}</strong></div>
                  <div><span>OBSERVED LOW</span><strong>{money(lookupResult.combined.low)}</strong></div>
                  <div className="focus"><span>PROVENANCE-BALANCED MEDIAN</span><strong>{money(lookupResult.combined.median)}</strong></div>
                  <div><span>OBSERVED HIGH</span><strong>{money(lookupResult.combined.high)}</strong></div>
                </div>
                <FamilyStrip result={lookupResult} />
                {lookupResult.ranking && (
                  <div className="pi-ranking-note"><b>Evidence ordering:</b> {lookupResult.ranking.provider.replace('+', ' + ')} · advisory only · prices and benchmark math are deterministic.</div>
                )}
              </>
            )}

            <div className="pi-source-results">
              {sourceDirectory.map((source) => {
                const live = lookupResult?.sources.find((item) => item.sourceId === source.id);
                const excluded = (live?.excludedByRadius || 0) + (live?.excludedWithoutCoordinates || 0);
                const strength = evidenceLabel(live?.evidenceScore);
                return (
                  <article className="pi-source-result glass-panel" key={source.id}>
                    <div className="pi-source-card-head">
                      <div><span className={`pi-source-status ${source.integrationState || ''}`}>{live?.status === 'ok' ? 'LIVE DATA' : integrationLabel(source)}</span><h3>{source.name}</h3></div>
                      <span className="pi-family-tag">{familyLabel(source.provenanceFamily)}</span>
                    </div>
                    <p>{source.description}</p>
                    {live?.status === 'ok' ? (
                      <div className="pi-live-value">
                        <strong>{money(live.summary.median)}</strong>
                        <span>median · {live.summary.count || live.observations.length} qualifying record{(live.summary.count || live.observations.length) === 1 ? '' : 's'}</span>
                        <small>{money(live.summary.low)} – {money(live.summary.high)}{excluded ? ` · ${excluded} excluded by geography` : ''}</small>
                        {live.headlineEligible === false && <small className="pi-supporting-only">Supporting evidence only — no headline vote</small>}
                        {live.sourceScope && <small>Scope: {live.sourceScope}</small>}
                        {live.attribution && <small>{live.attribution}</small>}
                        {live.evidenceRank && <div className="pi-evidence-badge"><b>Evidence #{live.evidenceRank}</b>{strength && <span>{strength}</span>}{live.evidenceReason && <small>{live.evidenceReason}</small>}</div>}
                      </div>
                    ) : live?.status === 'error' ? (
                      <div className="pi-empty-value">Source error: {live.error}</div>
                    ) : live?.status === 'empty' ? (
                      <div className="pi-empty-value">No explicit cash/self-pay records passed this procedure/market rule.</div>
                    ) : source.integrationState === 'credential-required' ? (
                      <div className="pi-empty-value">Official API exists but requires source-issued credentials. It contributes zero until configured.</div>
                    ) : source.integrationState === 'registered' ? (
                      <div className="pi-empty-value">Registered source. It contributes zero until a deterministic first-party cash observation can be retrieved.</div>
                    ) : (
                      <div className="pi-empty-value">Live adapter available; run a lookup to query it.</div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {section === 'map' && (
          <div className="pi-map-workspace">
            <div className="pi-map-toolbar glass-panel">
              <div><span className="pi-eyebrow">INDEPENDENT EXPLORER</span><h1>Price Map</h1>{mapResult?.map && <small>{mapResult.map.mappableObservationCount} mappable self-pay observations</small>}</div>
              <ProcedurePicker value={mapProcedure} onChange={setMapProcedure} />
              <label className="pi-field compact"><span>Source</span><select value={mapSource} onChange={(event) => setMapSource(event.target.value)}><option value="all">All live cash sources</option>{PRICING_SOURCES.filter((source) => source.integrationState === 'live').map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
              <label className="pi-field compact"><span>Metric</span><select value={mapMetric} onChange={(event) => setMapMetric(event.target.value === 'cash' ? 'cash' : 'index')}><option value="index">Relative cash-price index</option><option value="cash">Observed cash price</option></select></label>
            </div>
            <PriceMap procedure={mapProcedure} observations={mapObservations} metric={mapMetric} />
            {mapLoading && <div className="pi-map-loading glass-panel">Loading eligible self-pay observations…</div>}
          </div>
        )}

        {section === 'compare' && (
          <div className="pi-workspace narrow">
            <div className="pi-section-heading">
              <span className="pi-eyebrow">QUOTE ANALYZER</span>
              <h1>Is this provider fee actually high?</h1>
              <p>Enter a quoted cash fee. The comparison engine uses the local provenance-balanced self-pay market rather than insurance, Medicare or duplicated aggregator votes.</p>
            </div>
            <div className="pi-compare-card glass-panel">
              <ProcedurePicker value={compareProcedure} onChange={setCompareProcedure} />
              <label className="pi-field"><span>Provider location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, state or ZIP" /></label>
              <RadiusField value={radius} onChange={setRadius} />
              <label className="pi-field"><span>Quoted price</span><div className="pi-money-input"><b>$</b><input inputMode="decimal" value={quotePrice} onChange={(event) => setQuotePrice(event.target.value)} placeholder="0.00" /></div></label>
              <button className="pi-primary wide" type="button" onClick={runCompare} disabled={compareLoading}>{compareLoading ? 'Analyzing…' : 'Analyze quote'}</button>
              <div className="pi-integrity-note"><i /> Medicare, Medicaid, insurance-negotiated rates, claims averages, gross charges, and unknown payment bases are excluded.</div>
            </div>
            {compareError && <div className="pi-error-panel glass-panel">{compareError}</div>}
            {compareResult && compareMedian && variancePercent !== null && (
              <div className="pi-comparison-result glass-panel">
                <div className="pi-comparison-prices">
                  <div><span>PROVIDER QUOTE</span><strong>{money(quote)}</strong></div>
                  <div><span>PROVENANCE-BALANCED MEDIAN</span><strong>{money(compareMedian)}</strong></div>
                  <div><span>VARIANCE</span><strong className={variancePercent > 10 ? 'elevated' : ''}>{variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(1)}%</strong></div>
                </div>
                <div className="pi-assessment">
                  <span>MARKET INTERPRETATION</span>
                  <h2>{quoteAssessment}</h2>
                  <p>Based on {compareResult.combined.count} deduplicated self-pay observations across {compareResult.benchmark?.provenanceFamilyCount || 0} independent evidence families within the selected market. Source-level evidence remains visible in the leadership brief.</p>
                  <FamilyStrip result={compareResult} />
                  <button className="pi-secondary pi-report-open" type="button" onClick={() => setSection('reports')}>Open leadership brief →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {section === 'reports' && (
          <div className="pi-workspace pi-report-workspace">
            <div className="pi-section-heading pi-report-screen-heading"><span className="pi-eyebrow">LEADERSHIP BRIEFS</span><h1>Turn the evidence into a decision document.</h1><p>The brief shows both individual sources and the independent provenance families used to prevent duplicate evidence from being over-counted.</p></div>

            {compareResult && compareMedian && variancePercent !== null ? (
              <>
                <article id="pi-leadership-report" className="pi-report-document">
                  <header className="pi-report-header">
                    <div><span className="pi-report-kicker">SELF-PAY PRICING ANALYSIS</span><h1>Provider Pricing Comparison</h1><p>{compareProcedure.name} · {compareProcedure.codeSystem} {compareProcedure.code}</p></div>
                    <div className="pi-report-brand"><b>PRICE<br />INTELLIGENCE</b><small>Market Benchmark Brief</small></div>
                  </header>

                  <section className="pi-report-executive"><span>EXECUTIVE FINDING</span><h2>{quoteAssessment}</h2><p>{reportFinding}</p></section>

                  <section className="pi-report-grid">
                    <div><span>Provider quote</span><strong>{money(quote)}</strong></div>
                    <div><span>Self-pay median</span><strong>{money(compareMedian)}</strong></div>
                    <div><span>Dollar variance</span><strong>{reportVarianceDollars !== null ? `${reportVarianceDollars >= 0 ? '+' : '−'}${money(Math.abs(reportVarianceDollars))}` : '—'}</strong></div>
                    <div><span>Percent variance</span><strong>{variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(1)}%</strong></div>
                  </section>

                  <section className="pi-report-context">
                    <div><span>Market</span><b>{reportMarket}</b></div>
                    <div><span>Radius</span><b>{reportRadius} miles</b></div>
                    <div><span>Eligible observations</span><b>{compareResult.combined.count}</b></div>
                    <div><span>Evidence families</span><b>{compareResult.benchmark?.provenanceFamilyCount || 0}</b></div>
                  </section>

                  <section className="pi-report-section">
                    <div className="pi-report-section-title"><span>01</span><div><h3>Independent evidence families</h3><p>Each family gets one headline vote regardless of how many websites reproduce the same underlying hospital MRF.</p></div></div>
                    <div className="pi-report-family-grid">
                      {(compareResult.benchmark?.familyMedians || []).map((item) => (
                        <div key={item.family}><span>{familyLabel(item.family)}</span><strong>{money(item.median)}</strong><small>{item.sourceCount} source{item.sourceCount === 1 ? '' : 's'}</small></div>
                      ))}
                    </div>
                  </section>

                  <section className="pi-report-section">
                    <div className="pi-report-section-title"><span>02</span><div><h3>Source-by-source evidence</h3><p>Source details remain visible even when multiple sources belong to the same provenance family.</p></div></div>
                    <div className="pi-report-table-wrap">
                      <table className="pi-report-table">
                        <thead><tr><th>Source</th><th>Family</th><th>Median</th><th>Low</th><th>High</th><th>Records</th><th>Evidence</th></tr></thead>
                        <tbody>
                          {reportSources.map((source) => (
                            <tr key={source.sourceId}>
                              <td><strong>{source.sourceName}</strong>{source.dataRefreshed && <small>Refreshed {formatDate(source.dataRefreshed)}</small>}</td>
                              <td>{familyLabel(source.provenanceFamily)}</td>
                              <td>{money(source.summary.median)}</td>
                              <td>{money(source.summary.low)}</td>
                              <td>{money(source.summary.high)}</td>
                              <td>{source.summary.count || source.observations.length}{source.headlineEligible === false ? ' · supporting' : ''}</td>
                              <td>{source.evidenceRank ? `#${source.evidenceRank}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="pi-report-section pi-report-methodology">
                    <div className="pi-report-section-title"><span>03</span><div><h3>Methodology</h3><p>Designed to answer one narrow question: what does this procedure cost when paid directly without insurance?</p></div></div>
                    <div className="pi-report-method-grid">
                      <div><b>Included</b><p>Explicit cash, self-pay, discounted-cash, uninsured direct-pay, or marketplace-cash prices.</p></div>
                      <div><b>Excluded</b><p>Medicare, Medicaid, commercial negotiated rates, insurer allowed amounts, claims averages, gross charges, chargemaster values, and unknown payment bases.</p></div>
                      <div><b>Headline median</b><p>First compute a median inside each independent provenance family, then take the median of those family medians. Duplicate hospital-MRF aggregators therefore share one family vote.</p></div>
                      <div><b>Geography</b><p>Local benchmark rows must pass their geographic rule before any map-only geocoding occurs. Approximate map coordinates can never admit a row into the benchmark.</p></div>
                    </div>
                  </section>

                  {reportSources.some((source) => source.attribution || source.disclaimer) && (
                    <section className="pi-report-section pi-report-notes">
                      <div className="pi-report-section-title"><span>04</span><div><h3>Source notes</h3><p>Attribution and source-specific limitations.</p></div></div>
                      {reportSources.filter((source) => source.attribution || source.disclaimer).map((source) => (
                        <div className="pi-report-source-note" key={source.sourceId}><b>{source.sourceName}</b>{source.attribution && <p>{source.attribution}</p>}{source.disclaimer && <p>{source.disclaimer}</p>}</div>
                      ))}
                    </section>
                  )}

                  <footer className="pi-report-footer"><span>Price Intelligence · Self-Pay Market Benchmark</span><span>Generated {new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())}</span></footer>
                </article>

                <div className="pi-report-actions pi-report-screen-actions"><button className="pi-secondary" type="button" onClick={() => setSection('compare')}>Update quote analysis</button><button className="pi-primary" type="button" onClick={() => window.print()}>Print / Save PDF</button></div>
              </>
            ) : (
              <div className="pi-report-preview glass-panel"><div className="pi-report-paper"><span>SELF-PAY PRICING ANALYSIS</span><h2>Provider Pricing Comparison</h2><div className="pi-report-rule" /><p>No comparison has been run yet.</p><div className="pi-report-skeleton"><i /><i /><i /></div></div><div className="pi-report-actions"><button className="pi-secondary" type="button" onClick={() => setSection('compare')}>Create from quote analysis</button></div></div>
            )}
          </div>
        )}

        {section === 'sources' && (
          <div className="pi-workspace">
            <div className="pi-section-heading"><span className="pi-eyebrow">DATA PROVENANCE</span><h1>Every number keeps its identity.</h1><p>Live means the app can query the source now. Registered means the source is relevant and its rules are known, but it contributes zero until we have a deterministic first-party observation path. Credential-required sources also contribute zero until the source itself issues access.</p></div>
            <div className="pi-source-directory">
              {sourceDirectory.map((source) => (
                <article className="pi-source-card glass-panel" key={source.id}>
                  <header><div><span className={`pi-dot ${source.integrationState || source.status}`} /> <strong>{source.name}</strong></div><span>{integrationLabel(source)}</span></header>
                  <div className="pi-source-meta"><span>{source.category}</span><span>{familyLabel(source.provenanceFamily)}</span><span>{source.integration || 'source'}</span></div>
                  <p>{source.description}</p>
                  <small>{source.coverage}</small>
                  {source.occumedRelevance && <div className="pi-occumed-relevance"><b>Occu-Med relevance</b><span>{source.occumedRelevance}</span></div>}
                  <div className="pi-rule-columns"><div><b>Allowed</b>{source.eligibleLabels.map((label) => <span key={label}>+ {label}</span>)}</div><div><b>Excluded</b>{source.excludedLabels.map((label) => <span key={label}>− {label}</span>)}</div></div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
