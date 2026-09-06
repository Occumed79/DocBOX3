'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PriceMap from './PriceMap';
import { PROCEDURES, searchProcedures, type ProcedureDefinition } from '@/lib/pricing/procedures';
import { PRICING_SOURCES } from '@/lib/pricing/source-registry';

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
};

type SourceResult = {
  sourceId: string;
  sourceName: string;
  status: 'ok' | 'empty' | 'error';
  error?: string;
  observations: ApiObservation[];
  summary: PriceSummary;
  excludedByRadius?: number;
  excludedWithoutCoordinates?: number;
};

type PricingSearchResponse = {
  procedure: ProcedureDefinition;
  location: string | null;
  radiusMiles?: number | null;
  resolvedLocation?: {
    displayName: string;
    latitude: number;
    longitude: number;
    state?: string;
    postalCode?: string;
  } | null;
  sources: SourceResult[];
  combined: PriceSummary;
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

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function ProcedurePicker({ value, onChange }: { value: ProcedureDefinition; onChange: (procedure: ProcedureDefinition) => void }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchProcedures(query).slice(0, 8), [query]);
  const [open, setOpen] = useState(false);

  return (
    <div className="pi-procedure-picker">
      <label className="pi-field-label">Procedure</label>
      <button className="pi-select glass-control" type="button" onClick={() => setOpen((current) => !current)}>
        <span>
          <strong>{value.name}</strong>
          <small>{value.codeSystem} {value.code}</small>
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="pi-picker-popover glass-panel">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pano, D0330, EKG, stress test…"
          />
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
  return (
    <div className="pi-source-row">
      {PRICING_SOURCES.slice(0, 3).map((source) => <span key={source.id}>{source.name}</span>)}
      <span>+ {PRICING_SOURCES.length - 3} eligible sources</span>
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
            <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)} type="button">
              {item.label}
            </button>
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
              <button className="pi-tool-card glass-panel" onClick={() => setSection('lookup')} type="button">
                <span className="pi-tool-index">01</span><div><h2>Lookup</h2><p>Find the observed self-pay market for a procedure in an area.</p></div><b>Open →</b>
              </button>
              <button className="pi-tool-card glass-panel featured" onClick={() => setSection('map')} type="button">
                <span className="pi-tool-index">02</span><div><h2>Price Map</h2><p>Explore pricing geography independently, procedure by procedure.</p></div><b>Explore →</b>
              </button>
              <button className="pi-tool-card glass-panel" onClick={() => setSection('compare')} type="button">
                <span className="pi-tool-index">03</span><div><h2>Compare</h2><p>Measure a quoted fee against the local cash-pay market.</p></div><b>Analyze →</b>
              </button>
              <button className="pi-tool-card glass-panel" onClick={() => setSection('reports')} type="button">
                <span className="pi-tool-index">04</span><div><h2>Reports</h2><p>Turn a comparison into a polished leadership-ready brief.</p></div><b>Review →</b>
              </button>
            </div>
          </div>
        )}

        {section === 'lookup' && (
          <div className="pi-workspace">
            <div className="pi-section-heading">
              <span className="pi-eyebrow">PRICE LOOKUP</span>
              <h1>What does this procedure cost as self-pay?</h1>
              <p>Each source remains visible independently. The market summary is calculated only from records that explicitly identify a cash/self-pay payment basis.</p>
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
                  <div className="pi-location-resolution">
                    <span>Resolved market</span>
                    <strong>{lookupResult.resolvedLocation.displayName}</strong>
                    <b>{lookupResult.radiusMiles || radius} mi radius</b>
                  </div>
                )}
                <div className="pi-market-summary glass-panel">
                  <div><span>ELIGIBLE OBSERVATIONS</span><strong>{lookupResult.combined.count}</strong></div>
                  <div><span>OBSERVED LOW</span><strong>{money(lookupResult.combined.low)}</strong></div>
                  <div className="focus"><span>SOURCE-BALANCED MEDIAN</span><strong>{money(lookupResult.combined.median)}</strong></div>
                  <div><span>OBSERVED HIGH</span><strong>{money(lookupResult.combined.high)}</strong></div>
                </div>
              </>
            )}

            <div className="pi-source-results">
              {PRICING_SOURCES.slice(0, 7).map((source) => {
                const live = lookupResult?.sources.find((item) => item.sourceId === source.id);
                const excluded = (live?.excludedByRadius || 0) + (live?.excludedWithoutCoordinates || 0);
                return (
                  <article className="pi-source-result glass-panel" key={source.id}>
                    <div><span className="pi-source-status">{live ? 'LIVE' : source.status === 'approved' ? 'CORE' : 'ELIGIBLE'}</span><h3>{source.name}</h3></div>
                    <p>{source.description}</p>
                    {live?.status === 'ok' ? (
                      <div className="pi-live-value">
                        <strong>{money(live.summary.median)}</strong>
                        <span>median · {live.summary.count} verified local records</span>
                        <small>{money(live.summary.low)} – {money(live.summary.high)}{excluded ? ` · ${excluded} excluded by geography` : ''}</small>
                      </div>
                    ) : live?.status === 'error' ? (
                      <div className="pi-empty-value">Source error: {live.error}</div>
                    ) : live?.status === 'empty' ? (
                      <div className="pi-empty-value">No explicit cash/self-pay records passed the geographic filter.</div>
                    ) : (
                      <div className="pi-empty-value">Adapter pending</div>
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
              <div><span className="pi-eyebrow">INDEPENDENT EXPLORER</span><h1>Price Map</h1></div>
              <ProcedurePicker value={mapProcedure} onChange={setMapProcedure} />
              <label className="pi-field compact"><span>Source</span><select value={mapSource} onChange={(event) => setMapSource(event.target.value)}><option value="all">All live cash sources</option>{PRICING_SOURCES.map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
              <label className="pi-field compact"><span>Metric</span><select defaultValue="index"><option value="index">Relative cash-price index</option><option>Observed cash price</option></select></label>
            </div>
            <PriceMap procedure={mapProcedure} observations={mapObservations} />
            {mapLoading && <div className="pi-map-loading glass-panel">Loading eligible self-pay observations…</div>}
          </div>
        )}

        {section === 'compare' && (
          <div className="pi-workspace narrow">
            <div className="pi-section-heading">
              <span className="pi-eyebrow">QUOTE ANALYZER</span>
              <h1>Is this provider fee actually high?</h1>
              <p>Enter a quoted cash fee. The comparison engine benchmarks it only against qualifying self-pay observations inside the selected market radius.</p>
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
                  <div><span>SELF-PAY MEDIAN</span><strong>{money(compareMedian)}</strong></div>
                  <div><span>VARIANCE</span><strong className={variancePercent > 10 ? 'elevated' : ''}>{variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(1)}%</strong></div>
                </div>
                <div className="pi-assessment">
                  <span>MARKET INTERPRETATION</span>
                  <h2>{quoteAssessment}</h2>
                  <p>Based on {compareResult.combined.count} explicit self-pay observations within {compareResult.radiusMiles || radius} miles of {compareResult.resolvedLocation?.displayName || location || 'the selected market'}. Source-specific results remain separate and will be preserved in the leadership report.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {section === 'reports' && (
          <div className="pi-workspace narrow">
            <div className="pi-section-heading"><span className="pi-eyebrow">LEADERSHIP BRIEFS</span><h1>Turn the evidence into a decision document.</h1><p>Reports preserve source-by-source evidence, geographic context, market distribution, methodology, and quote variance without hiding the underlying data.</p></div>
            <div className="pi-report-preview glass-panel">
              <div className="pi-report-paper">
                <span>SELF-PAY PRICING ANALYSIS</span>
                <h2>{compareResult ? `${compareProcedure.name} · ${compareProcedure.code}` : 'Provider Pricing Comparison'}</h2>
                <div className="pi-report-rule" />
                {compareResult && compareMedian && variancePercent !== null ? (
                  <>
                    <p className="pi-report-lead">Quoted fee {money(quote)} · self-pay median {money(compareMedian)} · variance {variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(1)}%</p>
                    <div className="pi-report-metrics"><div><span>Quote</span><strong>{money(quote)}</strong></div><div><span>Median</span><strong>{money(compareMedian)}</strong></div><div><span>Observations</span><strong>{compareResult.combined.count}</strong></div></div>
                  </>
                ) : (
                  <><p>No comparison has been run yet.</p><div className="pi-report-skeleton"><i /><i /><i /></div></>
                )}
              </div>
              <div className="pi-report-actions"><button className="pi-secondary" type="button" onClick={() => setSection('compare')}>{compareResult ? 'Update quote analysis' : 'Create from quote analysis'}</button></div>
            </div>
          </div>
        )}

        {section === 'sources' && (
          <div className="pi-workspace">
            <div className="pi-section-heading"><span className="pi-eyebrow">DATA PROVENANCE</span><h1>Every number keeps its identity.</h1><p>A source can contain insurance data and still be usable; only individual records explicitly identified as cash/self-pay are admitted to the benchmark.</p></div>
            <div className="pi-source-directory">
              {PRICING_SOURCES.map((source) => (
                <article className="pi-source-card glass-panel" key={source.id}>
                  <header><div><span className={`pi-dot ${source.status}`} /> <strong>{source.name}</strong></div><span>{source.category}</span></header>
                  <p>{source.description}</p>
                  <small>{source.coverage}</small>
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

function sourceName(sourceId: string) {
  return PRICING_SOURCES.find((source) => source.id === sourceId)?.name || sourceId;
}
