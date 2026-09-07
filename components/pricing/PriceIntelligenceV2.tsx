'use client';

import { useEffect, useMemo, useState } from 'react';
import PriceMap from './PriceMap';
import { PROCEDURES, searchProcedures, type ProcedureDefinition } from '@/lib/pricing/procedures';
import { PRICING_SOURCES, type ProvenanceFamily } from '@/lib/pricing/source-registry';

type Section = 'lookup' | 'map' | 'compare' | 'reports' | 'sources';

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
  provenanceFamily: ProvenanceFamily;
  status: 'ok' | 'empty' | 'error' | 'unconfigured';
  observations: Observation[];
  summary: { count: number; low: number | null; median: number | null; high: number | null; p25: number | null; p75: number | null };
  sourceScope?: string;
  headlineEligible?: boolean;
  evidenceRank?: number;
  evidenceScore?: number;
  evidenceReason?: string;
  error?: string;
};

type SearchResult = {
  procedure: ProcedureDefinition;
  location: string | null;
  radiusMiles?: number | null;
  resolvedLocation?: { displayName: string; latitude: number; longitude: number; city?: string; state?: string; postalCode?: string } | null;
  sources: SourceResult[];
  combined: { count: number; low: number | null; median: number | null; high: number | null; p25: number | null; p75: number | null };
  benchmark?: { provenanceFamilyCount: number; familyMedians: Array<{ family: ProvenanceFamily; median: number; sourceCount: number }>; median: number | null };
  map?: { mappableObservationCount: number };
};

const NAV: Array<{ id: Section; label: string }> = [
  { id: 'lookup', label: 'Market Lookup' },
  { id: 'map', label: 'Price Map' },
  { id: 'compare', label: 'Quote Analysis' },
  { id: 'reports', label: 'Report' },
  { id: 'sources', label: 'Sources' },
];

const FAMILY_LABELS: Record<ProvenanceFamily, string> = {
  hospital_mrf_cash: 'Hospital cash',
  provider_verified_quote: 'Provider verified',
  provider_published_cash: 'Provider published',
  direct_pay_marketplace: 'Direct-pay marketplace',
  imaging_clinic_cash: 'Imaging clinic cash',
  dental_observed_cash: 'Observed dental cash',
  lab_direct_purchase: 'Direct-purchase labs',
  mixed_cash: 'Mixed cash',
  unknown_cash: 'Other verified cash',
};

const liveSourceCount = PRICING_SOURCES.filter((source) => source.integrationState === 'live').length;
const defaultProcedure = PROCEDURES.find((item) => item.code === 'D0330') || PROCEDURES[0];
const mapDefaultProcedure = PROCEDURES.find((item) => item.code === '71046') || PROCEDURES[0];
const quickCodes = ['D0330', 'D0150', '71046', '93000', '93015', '94010', '92557'];
const quickProcedures = quickCodes.map((code) => PROCEDURES.find((item) => item.code === code)).filter(Boolean) as ProcedureDefinition[];

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function familyLabel(value: ProvenanceFamily) {
  return FAMILY_LABELS[value] || value;
}

function sourceName(sourceId: string) {
  return PRICING_SOURCES.find((source) => source.id === sourceId)?.name || sourceId;
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

function ProcedurePicker({ value, onChange }: { value: ProcedureDefinition; onChange: (procedure: ProcedureDefinition) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchProcedures(query).slice(0, 12), [query]);
  return (
    <div className="px-procedure">
      <label>Procedure</label>
      <button type="button" className="px-control px-procedure-button" onClick={() => setOpen((state) => !state)}>
        <span><strong>{value.name}</strong><small>{value.codeSystem} {value.code}</small></span><b>⌄</b>
      </button>
      {open && (
        <div className="px-procedure-menu">
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search procedure or code" />
          <div>
            {matches.map((procedure) => (
              <button key={`${procedure.codeSystem}-${procedure.code}`} type="button" onClick={() => { onChange(procedure); setOpen(false); setQuery(''); }}>
                <span><strong>{procedure.name}</strong><small>{procedure.category}</small></span><b>{procedure.code}</b>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QueryBar({ procedure, onProcedure, location, onLocation, radius, onRadius, button, onRun, loading }: {
  procedure: ProcedureDefinition;
  onProcedure: (value: ProcedureDefinition) => void;
  location: string;
  onLocation: (value: string) => void;
  radius: number;
  onRadius: (value: number) => void;
  button: string;
  onRun: () => void;
  loading: boolean;
}) {
  return (
    <div className="px-querybar">
      <ProcedurePicker value={procedure} onChange={onProcedure} />
      <label className="px-field"><span>Market</span><input className="px-control" value={location} onChange={(event) => onLocation(event.target.value)} placeholder="City, state or ZIP" /></label>
      <label className="px-field"><span>Radius</span><select className="px-control" value={radius} onChange={(event) => onRadius(Number(event.target.value))}>{[25, 50, 75, 100].map((item) => <option value={item} key={item}>{item} mi</option>)}</select></label>
      <button className="px-action" type="button" onClick={onRun} disabled={loading}>{loading ? 'Searching…' : button}</button>
    </div>
  );
}

function Summary({ result }: { result: SearchResult }) {
  return (
    <div className="px-summary-grid">
      <div><span>Market median</span><strong>{money(result.combined.median)}</strong><small>provenance-balanced</small></div>
      <div><span>Observed range</span><strong>{money(result.combined.low)}–{money(result.combined.high)}</strong><small>{result.combined.count} qualifying observations</small></div>
      <div><span>Evidence families</span><strong>{result.benchmark?.provenanceFamilyCount || 0}</strong><small>independent evidence classes</small></div>
      <div><span>Map coverage</span><strong>{result.map?.mappableObservationCount || 0}</strong><small>geocoded observations</small></div>
    </div>
  );
}

function FamilyRow({ result }: { result: SearchResult }) {
  const families = result.benchmark?.familyMedians || [];
  if (!families.length) return null;
  return (
    <div className="px-family-row">
      {families.map((item) => <div key={item.family}><span>{familyLabel(item.family)}</span><strong>{money(item.median)}</strong><small>{item.sourceCount} source{item.sourceCount === 1 ? '' : 's'}</small></div>)}
    </div>
  );
}

function SourceEvidence({ result }: { result: SearchResult }) {
  const rows = [...result.sources].sort((a, b) => {
    const aHas = a.status === 'ok' ? 0 : 1;
    const bHas = b.status === 'ok' ? 0 : 1;
    return aHas - bHas || (a.evidenceRank || 999) - (b.evidenceRank || 999) || a.sourceName.localeCompare(b.sourceName);
  });
  return (
    <div className="px-evidence-table">
      <div className="px-table-head"><span>Source</span><span>Family</span><span>Median</span><span>Records</span><span>Status</span></div>
      {rows.map((source) => (
        <div className="px-table-row" key={source.sourceId}>
          <span><strong>{source.sourceName}</strong>{source.evidenceReason && <small>{source.evidenceReason}</small>}</span>
          <span>{familyLabel(source.provenanceFamily)}</span>
          <span>{money(source.summary.median)}</span>
          <span>{source.summary.count || source.observations.length}</span>
          <span className={`px-status ${source.status}`}>{source.status === 'ok' ? source.headlineEligible === false ? 'supporting' : 'live data' : source.status}</span>
        </div>
      ))}
    </div>
  );
}

export default function PriceIntelligenceV2() {
  const [section, setSection] = useState<Section>('lookup');
  const [procedure, setProcedure] = useState(defaultProcedure);
  const [mapProcedure, setMapProcedure] = useState(mapDefaultProcedure);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(50);
  const [lookup, setLookup] = useState<SearchResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [mapResult, setMapResult] = useState<SearchResult | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapSource, setMapSource] = useState('all');
  const [mapMetric, setMapMetric] = useState<'index' | 'cash'>('cash');
  const [quote, setQuote] = useState('');
  const [compareResult, setCompareResult] = useState<SearchResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  async function runLookup() {
    setLookupLoading(true); setLookupError(null);
    try { setLookup(await searchPricing(procedure, location, radius)); }
    catch (error) { setLookup(null); setLookupError(error instanceof Error ? error.message : 'Search failed.'); }
    finally { setLookupLoading(false); }
  }

  async function runCompare() {
    const price = Number(quote.replace(/[$,]/g, ''));
    if (!Number.isFinite(price) || price <= 0) { setCompareError('Enter a valid provider quote.'); return; }
    if (!location.trim()) { setCompareError('Enter the provider city, state, or ZIP.'); return; }
    setCompareLoading(true); setCompareError(null);
    try { setCompareResult(await searchPricing(procedure, location, radius)); }
    catch (error) { setCompareResult(null); setCompareError(error instanceof Error ? error.message : 'Quote analysis failed.'); }
    finally { setCompareLoading(false); }
  }

  useEffect(() => {
    if (section !== 'map') return;
    let cancelled = false;
    setMapLoading(true);
    searchPricing(mapProcedure)
      .then((result) => { if (!cancelled) setMapResult(result); })
      .catch(() => { if (!cancelled) setMapResult(null); })
      .finally(() => { if (!cancelled) setMapLoading(false); });
    return () => { cancelled = true; };
  }, [section, mapProcedure]);

  const mapMedian = mapResult?.combined.median || null;
  const mapObservations = useMemo(() => {
    if (!mapResult || !mapMedian) return [];
    return mapResult.sources
      .filter((source) => mapSource === 'all' || source.sourceId === mapSource)
      .flatMap((source) => source.observations)
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      .map((item, index) => ({ id: `${item.sourceId}-${index}`, latitude: item.latitude as number, longitude: item.longitude as number, price: item.price, priceIndex: (item.price / mapMedian) * 100, source: sourceName(item.sourceId), provider: item.providerName, city: item.city, state: item.state }));
  }, [mapResult, mapMedian, mapSource]);

  const quoteNumber = Number(quote.replace(/[$,]/g, ''));
  const compareMedian = compareResult?.combined.median || null;
  const variance = compareMedian && Number.isFinite(quoteNumber) ? ((quoteNumber - compareMedian) / compareMedian) * 100 : null;
  const assessment = variance === null ? null : variance <= 10 ? 'Within market' : variance <= 25 ? 'Moderately above market' : variance <= 50 ? 'High' : 'Very high';

  return (
    <main className="px-app">
      <header className="px-header">
        <div className="px-brand"><span>OM</span><div><strong>Price Intelligence</strong><small>Self-pay pricing workspace</small></div></div>
        <nav>{NAV.map((item) => <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>
        <div className="px-live"><i />{liveSourceCount} live sources</div>
      </header>

      <div className="px-shell">
        {section === 'lookup' && (
          <section className="px-screen">
            <div className="px-screen-head"><div><span>MARKET LOOKUP</span><h1>Self-pay market price</h1></div><p>Search an exact CPT, CDT or HCPCS code against eligible cash-price evidence. Insurance, Medicare, gross charges and unknown payment bases never enter the benchmark.</p></div>
            <QueryBar procedure={procedure} onProcedure={setProcedure} location={location} onLocation={setLocation} radius={radius} onRadius={setRadius} button="Search market" onRun={runLookup} loading={lookupLoading} />
            {lookupError && <div className="px-alert">{lookupError}</div>}
            {!lookup && !lookupLoading && (
              <div className="px-start-state">
                <div><span>QUICK START</span><h2>Pick a common Occu-Med service</h2><p>Or enter any valid CPT, CDT or HCPCS code above.</p></div>
                <div className="px-quick-grid">{quickProcedures.map((item) => <button type="button" key={item.code} onClick={() => setProcedure(item)}><b>{item.code}</b><span>{item.name}</span></button>)}</div>
                <div className="px-start-metrics"><div><strong>{liveSourceCount}</strong><span>live sources</span></div><div><strong>7</strong><span>provenance families</span></div><div><strong>6</strong><span>allowed cash bases</span></div></div>
              </div>
            )}
            {lookup && (
              <div className="px-results">
                <div className="px-result-title"><div><span>RESULT</span><h2>{lookup.procedure.name}</h2><p>{lookup.resolvedLocation?.displayName || lookup.location || 'National'}{lookup.location ? ` · ${lookup.radiusMiles || radius} mile radius` : ''}</p></div><div className="px-result-price"><span>MARKET MEDIAN</span><strong>{money(lookup.combined.median)}</strong></div></div>
                <Summary result={lookup} />
                <FamilyRow result={lookup} />
                <div className="px-section-label"><span>Source evidence</span><b>{lookup.sources.filter((item) => item.status === 'ok').length} sources returned qualifying data</b></div>
                <SourceEvidence result={lookup} />
              </div>
            )}
          </section>
        )}

        {section === 'map' && (
          <section className="px-screen px-map-screen">
            <div className="px-map-controls">
              <div><span>PRICE MAP</span><h1>{mapProcedure.name}</h1><p>{mapLoading ? 'Loading…' : `${mapObservations.length} mappable self-pay observations`}</p></div>
              <ProcedurePicker value={mapProcedure} onChange={setMapProcedure} />
              <label className="px-field"><span>Source</span><select className="px-control" value={mapSource} onChange={(event) => setMapSource(event.target.value)}><option value="all">All live sources</option>{PRICING_SOURCES.filter((item) => item.integrationState === 'live').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="px-field"><span>Metric</span><select className="px-control" value={mapMetric} onChange={(event) => setMapMetric(event.target.value === 'index' ? 'index' : 'cash')}><option value="cash">Observed cash price</option><option value="index">Relative price index</option></select></label>
            </div>
            <div className="px-map-frame"><PriceMap procedure={mapProcedure} observations={mapObservations} metric={mapMetric} /></div>
            {!mapLoading && mapResult && mapObservations.length === 0 && <div className="px-map-suggest"><span>No geocoded observations for this procedure.</span><button type="button" onClick={() => setMapProcedure(mapDefaultProcedure)}>Switch to Chest X-ray 71046</button></div>}
          </section>
        )}

        {section === 'compare' && (
          <section className="px-screen">
            <div className="px-screen-head"><div><span>QUOTE ANALYSIS</span><h1>Compare a provider quote</h1></div><p>Use the provider's actual location and cash quote. The result shows the market median, dollar variance, percentage variance, and underlying evidence.</p></div>
            <div className="px-compare-layout">
              <div className="px-compare-form">
                <ProcedurePicker value={procedure} onChange={setProcedure} />
                <label className="px-field"><span>Provider location</span><input className="px-control" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, state or ZIP" /></label>
                <div className="px-compare-split"><label className="px-field"><span>Radius</span><select className="px-control" value={radius} onChange={(event) => setRadius(Number(event.target.value))}>{[25,50,75,100].map((item) => <option key={item} value={item}>{item} mi</option>)}</select></label><label className="px-field"><span>Provider quote</span><div className="px-money"><b>$</b><input value={quote} onChange={(event) => setQuote(event.target.value)} placeholder="0.00" /></div></label></div>
                <button className="px-action wide" type="button" onClick={runCompare} disabled={compareLoading}>{compareLoading ? 'Analyzing…' : 'Analyze quote'}</button>
                {compareError && <div className="px-alert">{compareError}</div>}
              </div>
              <div className="px-decision-panel">
                {compareResult && compareMedian && variance !== null ? <>
                  <span>MARKET DECISION</span><h2>{assessment}</h2>
                  <div className="px-decision-price"><div><span>Quote</span><strong>{money(quoteNumber)}</strong></div><div><span>Market</span><strong>{money(compareMedian)}</strong></div><div><span>Variance</span><strong>{variance >= 0 ? '+' : ''}{variance.toFixed(1)}%</strong></div></div>
                  <p>{compareResult.combined.count} qualifying observations across {compareResult.benchmark?.provenanceFamilyCount || 0} independent evidence families.</p>
                  <button className="px-text-button" type="button" onClick={() => setSection('reports')}>Open report →</button>
                </> : <><span>READY</span><h2>Enter a quote to evaluate it.</h2><p>The comparison does not use Medicare, insurance allowed amounts, claims averages, or chargemaster prices.</p></>}
              </div>
            </div>
            {compareResult && <><FamilyRow result={compareResult} /><div className="px-section-label"><span>Evidence used</span></div><SourceEvidence result={compareResult} /></>}
          </section>
        )}

        {section === 'reports' && (
          <section className="px-screen">
            <div className="px-screen-head"><div><span>LEADERSHIP REPORT</span><h1>Provider pricing comparison</h1></div><p>One-page decision brief built from the quote analysis and the qualifying self-pay evidence behind it.</p></div>
            {!compareResult || !compareMedian || variance === null ? (
              <div className="px-empty-report"><div><span>NO REPORT YET</span><h2>Run a quote analysis first.</h2><p>The completed report will include the provider quote, market median, variance, evidence-family breakdown, and source-level support.</p><button className="px-action" type="button" onClick={() => setSection('compare')}>Go to quote analysis</button></div></div>
            ) : (
              <article className="px-report" id="pricing-report">
                <header><div><span>SELF-PAY PRICING ANALYSIS</span><h2>{procedure.name}</h2><p>{procedure.codeSystem} {procedure.code} · {compareResult.resolvedLocation?.displayName || location} · {radius} mi</p></div><b>OCCU-MED<br />PRICE INTELLIGENCE</b></header>
                <section className="px-report-finding"><span>FINDING</span><h3>{assessment}</h3><p>The provider quote of {money(quoteNumber)} is {Math.abs(variance).toFixed(1)}% {variance >= 0 ? 'above' : 'below'} the provenance-balanced self-pay median of {money(compareMedian)}.</p></section>
                <div className="px-report-metrics"><div><span>Provider quote</span><strong>{money(quoteNumber)}</strong></div><div><span>Market median</span><strong>{money(compareMedian)}</strong></div><div><span>Variance</span><strong>{variance >= 0 ? '+' : ''}{variance.toFixed(1)}%</strong></div><div><span>Observations</span><strong>{compareResult.combined.count}</strong></div></div>
                <section><h4>Independent evidence families</h4><FamilyRow result={compareResult} /></section>
                <section><h4>Source evidence</h4><SourceEvidence result={compareResult} /></section>
                <footer><span>Self-pay only · Medicare, insurance, claims, gross charges and unknown payment bases excluded.</span><button type="button" onClick={() => window.print()}>Print / Save PDF</button></footer>
              </article>
            )}
          </section>
        )}

        {section === 'sources' && (
          <section className="px-screen">
            <div className="px-screen-head"><div><span>SOURCE DIRECTORY</span><h1>Pricing evidence sources</h1></div><p>Live sources are queryable now. Registered sources stay visible but contribute zero until a deterministic cash-price observation path exists.</p></div>
            <div className="px-source-directory">
              <div className="px-source-head"><span>Source</span><span>Evidence family</span><span>Coverage / use</span><span>State</span></div>
              {PRICING_SOURCES.map((source) => <div className="px-source-row" key={source.id}><span><strong>{source.name}</strong><small>{source.category}</small></span><span>{familyLabel(source.provenanceFamily)}</span><span>{source.occumedRelevance || source.coverage}</span><span className={`px-source-state ${source.integrationState}`}>{source.integrationState === 'credential-required' ? 'credential' : source.integrationState}</span></div>)}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
