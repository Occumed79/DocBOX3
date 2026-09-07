'use client';

import { useEffect, useMemo, useState } from 'react';
import PriceTerrainMap, { type TerrainObservation } from './PriceTerrainMap';
import { PROCEDURES, searchProcedures, type ProcedureDefinition } from '@/lib/pricing/procedures';

type Panel = 'overview' | 'market' | 'distribution' | 'evidence' | 'quote' | 'sources';

type Observation = {
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
  provenanceFamily: string;
  status: 'ok' | 'empty' | 'error' | 'unconfigured';
  observations: Observation[];
  summary: { count: number; low: number | null; median: number | null; high: number | null; p25: number | null; p75: number | null };
  evidenceRank?: number;
  evidenceScore?: number;
  headlineEligible?: boolean;
  error?: string;
};

type SearchResult = {
  procedure: ProcedureDefinition;
  location: string | null;
  radiusMiles?: number | null;
  resolvedLocation?: { displayName: string; latitude: number; longitude: number; city?: string; state?: string; postalCode?: string } | null;
  sources: SourceResult[];
  combined: { count: number; low: number | null; median: number | null; high: number | null; p25: number | null; p75: number | null };
  benchmark?: { provenanceFamilyCount: number; familyMedians: Array<{ family: string; median: number; sourceCount: number }>; median: number | null };
  map?: { mappableObservationCount: number };
};

type FlatObservation = Observation & { sourceName: string; family: string };

const DEFAULT_PROCEDURE = PROCEDURES.find((item) => item.code === '71046') || PROCEDURES[0];

const NAV: Array<{ id: Panel; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'market', label: 'Market map', icon: '◎' },
  { id: 'distribution', label: 'Price distribution', icon: '▥' },
  { id: 'evidence', label: 'Evidence', icon: '✓' },
  { id: 'quote', label: 'Quote review', icon: '$' },
  { id: 'sources', label: 'Sources', icon: '≡' },
];

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function familyLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).replace('Mrf', 'MRF');
}

async function searchPricing(procedure: ProcedureDefinition, location?: string, radius?: number) {
  const params = new URLSearchParams({ code: procedure.code });
  if (location?.trim()) params.set('location', location.trim());
  if (location?.trim() && radius) params.set('radius', String(radius));
  const response = await fetch(`/api/pricing/search?${params.toString()}`, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || 'Price search failed.');
  return payload as SearchResult;
}

function usePanelFromUrl() {
  const [panel, setPanelState] = useState<Panel>('overview');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('panel') as Panel | null;
    if (value && NAV.some((item) => item.id === value)) setPanelState(value);
  }, []);
  const setPanel = (next: Panel) => {
    setPanelState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('panel', next);
    url.searchParams.delete('lens');
    url.searchParams.delete('mode');
    window.history.replaceState({}, '', url);
  };
  return [panel, setPanel] as const;
}

function ProcedureSelect({ value, onChange }: { value: ProcedureDefinition; onChange: (value: ProcedureDefinition) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchProcedures(query).slice(0, 12), [query]);
  return (
    <div className="tp-procedure-wrap">
      <button type="button" className="tp-select-button" onClick={() => setOpen((state) => !state)}>
        <span><b>{value.code}</b>{value.name}</span><i>⌄</i>
      </button>
      {open && (
        <div className="tp-picker">
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search CPT, CDT, HCPCS or procedure" />
          <div>
            {matches.map((item) => (
              <button type="button" key={`${item.codeSystem}-${item.code}`} onClick={() => { onChange(item); setQuery(''); setOpen(false); }}>
                <b>{item.code}</b><span><strong>{item.name}</strong><small>{item.category}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressCard({ title, value, description, percentage, rows }: {
  title: string;
  value: string;
  description: string;
  percentage: number;
  rows: Array<{ label: string; value: string; percentage: number }>;
}) {
  return (
    <article className="tp-card tp-progress-card">
      <div className="tp-card-heading"><h3>{title}</h3><span>{Math.round(percentage)}%</span></div>
      <div className="tp-big-value">{value}</div>
      <p className="tp-muted">{description}</p>
      <div className="tp-progress-list">
        {rows.map((row) => (
          <div key={row.label}>
            <div><span>{row.label}</span><b>{row.value}</b></div>
            <i><em style={{ width: `${Math.max(2, Math.min(100, row.percentage))}%` }} /></i>
          </div>
        ))}
      </div>
    </article>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="tp-metric-card"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
}

function Histogram({ observations, q1, medianValue, q3 }: { observations: FlatObservation[]; q1: number; medianValue: number; q3: number }) {
  const values = observations.map((item) => item.price).filter((value) => Number.isFinite(value) && value > 0);
  const low = Math.min(...values, 0);
  const high = Math.max(...values, 1);
  const maxDisplay = Math.min(high, Math.max(q3 * 3, medianValue * 4, 1));
  const bins = Array.from({ length: 28 }, (_, index) => ({ index, count: 0 }));
  values.forEach((value) => {
    const clipped = Math.min(value, maxDisplay);
    const index = Math.min(bins.length - 1, Math.floor((clipped / maxDisplay) * bins.length));
    bins[index].count += 1;
  });
  const maxCount = Math.max(1, ...bins.map((item) => item.count));
  const marker = (value: number) => `${Math.max(0, Math.min(100, (value / maxDisplay) * 100))}%`;
  return (
    <div className="tp-histogram">
      <div className="tp-hist-bars">{bins.map((bin) => <i key={bin.index} style={{ height: `${Math.max(2, (bin.count / maxCount) * 100)}%` }} />)}</div>
      <span className="tp-marker tp-marker-q1" style={{ left: marker(q1) }}>P25 {money(q1)}</span>
      <span className="tp-marker tp-marker-med" style={{ left: marker(medianValue) }}>Median {money(medianValue)}</span>
      <span className="tp-marker tp-marker-q3" style={{ left: marker(q3) }}>P75 {money(q3)}</span>
      <div className="tp-axis"><span>{money(low)}</span><span>{money(maxDisplay)}</span></div>
    </div>
  );
}

export default function TremorPricingDashboard() {
  const [panel, setPanel] = usePanelFromUrl();
  const [procedure, setProcedure] = useState(DEFAULT_PROCEDURE);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(50);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchPricing(procedure)
      .then((payload) => { if (!cancelled) setResult(payload); })
      .catch((reason) => { if (!cancelled) { setResult(null); setError(reason instanceof Error ? reason.message : 'Search failed.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [procedure.code]);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try { setResult(await searchPricing(procedure, location, radius)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Search failed.'); }
    finally { setLoading(false); }
  }

  const observations = useMemo<FlatObservation[]>(() => (result?.sources || []).flatMap((source) => source.observations.map((item) => ({ ...item, sourceName: source.sourceName, family: source.provenanceFamily }))).filter((item) => Number.isFinite(item.price) && item.price > 0), [result]);
  const prices = observations.map((item) => item.price).sort((a, b) => a - b);
  const q1 = result?.combined.p25 ?? percentile(prices, .25);
  const q3 = result?.combined.p75 ?? percentile(prices, .75);
  const med = result?.combined.median ?? median(prices);
  const iqr = Math.max(1, q3 - q1);
  const upperFence = q3 + 1.5 * iqr;
  const outliers = observations.filter((item) => item.price > upperFence).sort((a, b) => b.price - a.price);
  const familyCount = result?.benchmark?.provenanceFamilyCount || 0;
  const sourceRows = (result?.sources || []).filter((source) => source.status === 'ok' && source.summary.count > 0).sort((a, b) => b.summary.count - a.summary.count);
  const liveSources = (result?.sources || []).filter((source) => source.status !== 'unconfigured');
  const mappable = observations.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  const resolvedMarkets = new Set(mappable.map((item) => [item.city, item.state].filter(Boolean).join(', ')).filter(Boolean));
  const terrain = useMemo<TerrainObservation[]>(() => {
    const baseMedian = med || 1;
    return mappable.map((item, index) => ({
      id: `${item.sourceId}-${index}-${item.price}`,
      latitude: item.latitude as number,
      longitude: item.longitude as number,
      price: item.price,
      priceIndex: (item.price / baseMedian) * 100,
      source: item.sourceName,
      sourceId: item.sourceId,
      provider: item.providerName,
      city: item.city,
      state: item.state,
      postalCode: item.postalCode,
      paymentBasis: item.paymentBasis,
    }));
  }, [mappable, med]);

  const quoteValue = Number(quote.replace(/[$,]/g, ''));
  const quoteVariance = med && quoteValue > 0 ? ((quoteValue - med) / med) * 100 : null;
  const quoteAssessment = quoteVariance === null ? 'Enter a quote' : quoteValue >= q1 && quoteValue <= q3 ? 'Within typical market' : quoteValue > upperFence ? 'High outlier' : quoteValue > q3 ? 'Above typical market' : 'Below typical market';
  const confidence = Math.round(Math.min(100, (Math.min(result?.combined.count || 0, 250) / 250) * 35 + Math.min(familyCount, 4) / 4 * 35 + Math.min(mappable.length, 150) / 150 * 20 + Math.min(sourceRows.length, 5) / 5 * 10));

  return (
    <div className="tp-app">
      <aside className={`tp-sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="tp-workspace">
          <div className="tp-logo">OM</div>
          <div><strong>Price Intelligence</strong><small>Occu-Med</small></div>
          <span>⌄</span>
        </div>
        <nav className="tp-nav" aria-label="Price Intelligence navigation">
          {NAV.map((item) => (
            <button key={item.id} className={panel === item.id ? 'active' : ''} type="button" onClick={() => { setPanel(item.id); setMobileNav(false); }}>
              <i>{item.icon}</i><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="tp-shortcuts"><span>Shortcuts</span><a href="/vault/classic">Classic workspace</a><a href="/">Home</a></div>
        <div className="tp-user"><div>AA</div><span><strong>Network Analyst</strong><small>Pricing workspace</small></span></div>
      </aside>

      <div className="tp-mobile-header"><button type="button" onClick={() => setMobileNav((value) => !value)}>☰</button><strong>Price Intelligence</strong><span>OM</span></div>

      <main className="tp-main">
        <header className="tp-page-head">
          <div><h1>{NAV.find((item) => item.id === panel)?.label}</h1><p>Self-pay pricing analysis for network sourcing and quote decisions.</p></div>
        </header>

        <section className="tp-filterbar">
          <ProcedureSelect value={procedure} onChange={setProcedure} />
          <label><span>Market</span><input value={location} onChange={(event) => setLocation(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') runSearch(); }} placeholder="City, state or ZIP" /></label>
          <label className="tp-radius"><span>Radius</span><select value={radius} onChange={(event) => setRadius(Number(event.target.value))}>{[25, 50, 75, 100, 150].map((item) => <option value={item} key={item}>{item} mi</option>)}</select></label>
          <button type="button" className="tp-primary" onClick={runSearch} disabled={loading}>{loading ? 'Analyzing…' : 'Analyze'}</button>
        </section>

        {error && <div className="tp-alert">{error}</div>}
        {!result && !loading && !error && <div className="tp-empty">No pricing evidence returned for this query.</div>}

        {result && (
          <>
            {panel === 'overview' && (
              <div className="tp-panel">
                <section aria-labelledby="current-market">
                  <h2 id="current-market">Current market</h2>
                  <div className="tp-kpi-grid">
                    <ProgressCard title="Evidence confidence" value={`${confidence}%`} description="Decision-support strength from the current evidence base." percentage={confidence} rows={[
                      { label: 'Sample depth', value: result.combined.count.toLocaleString(), percentage: Math.min(100, (result.combined.count / 250) * 100) },
                      { label: 'Source families', value: String(familyCount), percentage: Math.min(100, (familyCount / 4) * 100) },
                      { label: 'Geocoded', value: mappable.length.toLocaleString(), percentage: result.combined.count ? (mappable.length / result.combined.count) * 100 : 0 },
                    ]} />
                    <ProgressCard title="Market coverage" value={resolvedMarkets.size.toLocaleString()} description="Distinct city/state markets represented by geocoded cash evidence." percentage={Math.min(100, resolvedMarkets.size)} rows={[
                      { label: 'Geocoded observations', value: mappable.length.toLocaleString(), percentage: result.combined.count ? (mappable.length / result.combined.count) * 100 : 0 },
                      { label: 'Resolved markets', value: resolvedMarkets.size.toLocaleString(), percentage: Math.min(100, resolvedMarkets.size) },
                      { label: 'Strict radius', value: result.resolvedLocation ? `${result.radiusMiles || radius} mi` : 'National', percentage: result.resolvedLocation ? 70 : 100 },
                    ]} />
                    <ProgressCard title="Source coverage" value={sourceRows.length.toLocaleString()} description="Qualifying sources contributing directly to the current result." percentage={Math.min(100, sourceRows.length * 20)} rows={sourceRows.slice(0, 3).map((source) => ({ label: source.sourceName, value: source.summary.count.toLocaleString(), percentage: Math.min(100, result.combined.count ? (source.summary.count / result.combined.count) * 100 : 0) }))} />
                  </div>
                </section>

                <section className="tp-overview-section" aria-labelledby="overview-title">
                  <h2 id="overview-title">Overview</h2>
                  <div className="tp-metrics-grid">
                    <MetricCard label="Median" value={money(med)} sub={`${result.combined.count.toLocaleString()} qualifying observations`} />
                    <MetricCard label="Typical range" value={`${money(q1)} – ${money(q3)}`} sub="Interquartile range" />
                    <MetricCard label="Observed range" value={`${money(result.combined.low)} – ${money(result.combined.high)}`} sub="All qualifying observations" />
                  </div>
                  <div className="tp-content-grid">
                    <article className="tp-card tp-chart-card tp-span-2"><div className="tp-card-heading"><div><h3>Price distribution</h3><p>Observed self-pay prices for {result.procedure.name}</p></div><button type="button" onClick={() => setPanel('distribution')}>View details</button></div><Histogram observations={observations} q1={q1} medianValue={med} q3={q3} /></article>
                    <article className="tp-card"><div className="tp-card-heading"><div><h3>Evidence mix</h3><p>Independent provenance families</p></div></div><div className="tp-family-list">{(result.benchmark?.familyMedians || []).map((family) => <div key={family.family}><span>{familyLabel(family.family)}</span><b>{money(family.median)}</b><small>{family.sourceCount} source{family.sourceCount === 1 ? '' : 's'}</small></div>)}</div></article>
                    <article className="tp-card tp-map-card tp-span-2"><div className="tp-card-heading"><div><h3>Market coverage</h3><p>{result.resolvedLocation?.displayName || 'National geocoded evidence'}</p></div><button type="button" onClick={() => setPanel('market')}>Open map</button></div><div className="tp-map-frame"><PriceTerrainMap observations={terrain} mode="density" threeD={false} focus={result.resolvedLocation || null} radiusMiles={result.radiusMiles || radius} /></div></article>
                    <article className="tp-card"><div className="tp-card-heading"><div><h3>Quote target</h3><p>Use the typical market core for negotiation.</p></div></div><div className="tp-big-value">{money(q1)} – {money(q3)}</div><p className="tp-muted">Escalate quotes above approximately {money(upperFence)} for manual review.</p><button className="tp-secondary" type="button" onClick={() => setPanel('quote')}>Review a quote</button></article>
                  </div>
                </section>
              </div>
            )}

            {panel === 'market' && (
              <div className="tp-panel">
                <div className="tp-metrics-grid"><MetricCard label="Geocoded observations" value={mappable.length.toLocaleString()} sub={`${result.combined.count ? Math.round((mappable.length / result.combined.count) * 100) : 0}% of evidence`} /><MetricCard label="Resolved markets" value={resolvedMarkets.size.toLocaleString()} sub="City/state clusters" /><MetricCard label="Search context" value={result.resolvedLocation?.displayName || 'National'} sub={result.resolvedLocation ? `${result.radiusMiles || radius} mile radius` : 'All available evidence'} /></div>
                <article className="tp-card tp-full-map"><div className="tp-card-heading"><div><h3>Market coverage map</h3><p>Density of usable self-pay observations.</p></div></div><div className="tp-map-frame"><PriceTerrainMap observations={terrain} mode="density" threeD={false} focus={result.resolvedLocation || null} radiusMiles={result.radiusMiles || radius} /></div></article>
              </div>
            )}

            {panel === 'distribution' && (
              <div className="tp-panel">
                <div className="tp-metrics-grid"><MetricCard label="Median" value={money(med)} sub="Current benchmark" /><MetricCard label="Typical range" value={`${money(q1)} – ${money(q3)}`} sub="Middle 50%" /><MetricCard label="High outliers" value={outliers.length.toLocaleString()} sub={`Above ${money(upperFence)}`} /></div>
                <article className="tp-card tp-chart-card"><div className="tp-card-heading"><div><h3>Observed price distribution</h3><p>All qualifying observations. Values above the chart cap remain listed below.</p></div></div><Histogram observations={observations} q1={q1} medianValue={med} q3={q3} /></article>
                <article className="tp-card"><div className="tp-card-heading"><div><h3>Outlier review</h3><p>IQR rule; investigate rather than automatically discard.</p></div></div><div className="tp-table-wrap"><table><thead><tr><th>Price</th><th>Provider</th><th>Market</th><th>Source</th></tr></thead><tbody>{outliers.slice(0, 25).map((item, index) => <tr key={`${item.sourceId}-${index}-${item.price}`}><td><b>{money(item.price)}</b></td><td>{item.providerName || '—'}</td><td>{[item.city, item.state].filter(Boolean).join(', ') || '—'}</td><td>{item.sourceName}</td></tr>)}</tbody></table></div></article>
              </div>
            )}

            {panel === 'evidence' && (
              <div className="tp-panel">
                <div className="tp-kpi-grid"><ProgressCard title="Evidence confidence" value={`${confidence}%`} description="Transparent heuristic; does not alter benchmark math." percentage={confidence} rows={[
                  { label: 'Sample depth', value: result.combined.count.toLocaleString(), percentage: Math.min(100, (result.combined.count / 250) * 100) },
                  { label: 'Source diversity', value: `${familyCount} families`, percentage: Math.min(100, (familyCount / 4) * 100) },
                  { label: 'Geographic resolution', value: `${mappable.length} mapped`, percentage: result.combined.count ? (mappable.length / result.combined.count) * 100 : 0 },
                ]} /><ProgressCard title="Source concentration" value={sourceRows[0]?.summary.count ? `${Math.round((sourceRows[0].summary.count / Math.max(1, result.combined.count)) * 100)}%` : '0%'} description="Share of observations from the largest contributing source." percentage={sourceRows[0]?.summary.count ? (sourceRows[0].summary.count / Math.max(1, result.combined.count)) * 100 : 0} rows={sourceRows.slice(0, 3).map((source) => ({ label: source.sourceName, value: source.summary.count.toLocaleString(), percentage: (source.summary.count / Math.max(1, result.combined.count)) * 100 }))} /><ProgressCard title="Provenance" value={`${familyCount}`} description="Independent evidence families supporting this benchmark." percentage={Math.min(100, familyCount * 25)} rows={(result.benchmark?.familyMedians || []).slice(0, 3).map((family) => ({ label: familyLabel(family.family), value: money(family.median), percentage: 75 }))} /></div>
                <article className="tp-card"><div className="tp-card-heading"><div><h3>Source audit</h3><p>Qualifying sources and their contribution to this result.</p></div></div><div className="tp-table-wrap"><table><thead><tr><th>Source</th><th>Family</th><th>Status</th><th>Records</th><th>Median</th></tr></thead><tbody>{(result.sources || []).map((source) => <tr key={source.sourceId}><td><b>{source.sourceName}</b></td><td>{familyLabel(source.provenanceFamily)}</td><td><span className={`tp-status ${source.status}`}>{source.status}</span></td><td>{source.summary.count.toLocaleString()}</td><td>{money(source.summary.median)}</td></tr>)}</tbody></table></div></article>
              </div>
            )}

            {panel === 'quote' && (
              <div className="tp-panel">
                <div className="tp-content-grid tp-quote-grid">
                  <article className="tp-card"><div className="tp-card-heading"><div><h3>Clinic quote</h3><p>Enter the proposed self-pay price.</p></div></div><label className="tp-quote-input"><span>$</span><input inputMode="decimal" value={quote} onChange={(event) => setQuote(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /></label><div className="tp-assessment"><small>Assessment</small><strong>{quoteAssessment}</strong>{quoteVariance !== null && <span>{quoteVariance >= 0 ? '+' : ''}{quoteVariance.toFixed(1)}% vs median</span>}</div></article>
                  <article className="tp-card"><div className="tp-card-heading"><div><h3>Decision context</h3><p>{result.resolvedLocation?.displayName || 'National fallback context'}</p></div></div><div className="tp-decision-list"><div><span>Median</span><b>{money(med)}</b></div><div><span>Typical target</span><b>{money(q1)} – {money(q3)}</b></div><div><span>Escalation threshold</span><b>{money(upperFence)}</b></div><div><span>Evidence base</span><b>{result.combined.count.toLocaleString()}</b></div></div></article>
                </div>
                <article className="tp-card tp-chart-card"><div className="tp-card-heading"><div><h3>Quote position</h3><p>Compare the clinic quote against the observed market.</p></div></div><div className="tp-quote-axis"><div className="tp-quote-core" style={{ left: `${Math.min(90, (q1 / Math.max(1, upperFence * 1.5)) * 100)}%`, width: `${Math.max(4, ((q3 - q1) / Math.max(1, upperFence * 1.5)) * 100)}%` }} /><span className="tp-quote-median" style={{ left: `${Math.min(96, (med / Math.max(1, upperFence * 1.5)) * 100)}%` }}>Median<br />{money(med)}</span>{quoteValue > 0 && <span className="tp-quote-point" style={{ left: `${Math.min(98, (quoteValue / Math.max(1, upperFence * 1.5)) * 100)}%` }}>Quote<br />{money(quoteValue)}</span>}</div></article>
              </div>
            )}

            {panel === 'sources' && (
              <div className="tp-panel">
                <div className="tp-metrics-grid"><MetricCard label="Sources returned" value={(result.sources || []).length.toLocaleString()} sub="Registered for this query" /><MetricCard label="Live/attempted" value={liveSources.length.toLocaleString()} sub="Not marked unconfigured" /><MetricCard label="Contributing" value={sourceRows.length.toLocaleString()} sub="Returned qualifying observations" /></div>
                <article className="tp-card"><div className="tp-card-heading"><div><h3>Pricing source registry</h3><p>Status and evidence contribution for the current procedure.</p></div></div><div className="tp-table-wrap"><table><thead><tr><th>Source</th><th>Provenance</th><th>Status</th><th>Records</th><th>Low</th><th>Median</th><th>High</th></tr></thead><tbody>{(result.sources || []).map((source) => <tr key={source.sourceId}><td><b>{source.sourceName}</b></td><td>{familyLabel(source.provenanceFamily)}</td><td><span className={`tp-status ${source.status}`}>{source.status}</span></td><td>{source.summary.count.toLocaleString()}</td><td>{money(source.summary.low)}</td><td>{money(source.summary.median)}</td><td>{money(source.summary.high)}</td></tr>)}</tbody></table></div></article>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
