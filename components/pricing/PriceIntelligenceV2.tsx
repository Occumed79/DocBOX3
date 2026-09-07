'use client';

import { useEffect, useMemo, useState } from 'react';
import PriceTerrainMap, { type TerrainInspection, type TerrainMode, type TerrainObservation } from './PriceTerrainMap';
import { PROCEDURES, searchProcedures, type ProcedureDefinition } from '@/lib/pricing/procedures';
import { PRICING_SOURCES, type ProvenanceFamily, type PricingSource } from '@/lib/pricing/source-registry';

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

type Drawer = 'quote' | 'evidence' | 'report' | null;

type HealthState = {
  registry: PricingSource;
  national?: SourceResult;
  local?: SourceResult;
  reachable: boolean;
  procedure: boolean;
  localEvidence: boolean | null;
  qualifying: boolean;
  detail: string;
};

const FAMILY_LABELS: Record<ProvenanceFamily, string> = {
  hospital_mrf_cash: 'Hospital MRF cash',
  provider_verified_quote: 'Provider verified',
  provider_published_cash: 'Provider published',
  direct_pay_marketplace: 'Direct-pay marketplace',
  imaging_clinic_cash: 'Imaging clinic cash',
  dental_observed_cash: 'Observed dental cash',
  lab_direct_purchase: 'Direct-purchase labs',
  mixed_cash: 'Mixed cash',
  unknown_cash: 'Other verified cash',
};

const defaultProcedure = PROCEDURES.find((item) => item.code === '71046') || PROCEDURES[0];
const quickCodes = ['71046', '93000', '93015', '94010', '92557', 'D0330', 'D0150'];
const quickProcedures = quickCodes.map((code) => PROCEDURES.find((item) => item.code === code)).filter(Boolean) as ProcedureDefinition[];

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function familyLabel(value?: ProvenanceFamily) {
  return value ? FAMILY_LABELS[value] : 'Other verified cash';
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
  const matches = useMemo(() => searchProcedures(query).slice(0, 15), [query]);
  return (
    <div className="kx-procedure">
      <button type="button" className="kx-procedure-button" onClick={() => setOpen((state) => !state)}>
        <span><small>PROCEDURE</small><strong>{value.name}</strong><em>{value.codeSystem} {value.code}</em></span><b>⌄</b>
      </button>
      {open && (
        <div className="kx-procedure-menu">
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search CPT, CDT, HCPCS or service" />
          <div className="kx-procedure-list">
            {matches.map((procedure) => (
              <button key={`${procedure.codeSystem}-${procedure.code}`} type="button" onClick={() => { onChange(procedure); setOpen(false); setQuery(''); }}>
                <span><strong>{procedure.name}</strong><small>{procedure.category}</small></span><b>{procedure.code}</b>
              </button>
            ))}
          </div>
          {!query && <div className="kx-quick-procedures">{quickProcedures.map((item) => <button type="button" key={item.code} onClick={() => { onChange(item); setOpen(false); }}>{item.code}</button>)}</div>}
        </div>
      )}
    </div>
  );
}

function SourceLamp({ active, label }: { active: boolean | null; label: string }) {
  return <span className={`kx-lamp ${active === null ? 'na' : active ? 'yes' : 'no'}`} title={label}><i />{label}</span>;
}

function buildHealth(registry: PricingSource, nationalResult: SearchResult | null, localResult: SearchResult | null): HealthState {
  const national = nationalResult?.sources.find((source) => source.sourceId === registry.id);
  const local = localResult?.sources.find((source) => source.sourceId === registry.id);
  const activeAdapter = registry.integrationState === 'live';
  const responseSource = local || national;
  const reachable = activeAdapter && Boolean(responseSource && responseSource.status !== 'error' && responseSource.status !== 'unconfigured');
  const procedure = Boolean(national && national.status === 'ok' && (national.summary.count > 0 || national.summary.median !== null));
  const localEvidence = localResult ? Boolean(local && local.status === 'ok' && (local.summary.count > 0 || local.summary.median !== null)) : null;
  const qualifying = localResult ? Boolean(localEvidence && local?.headlineEligible !== false) : Boolean(procedure && national?.headlineEligible !== false);
  const detail = registry.integrationState === 'registered' ? 'Registered — no deterministic first-party query path yet.'
    : registry.integrationState === 'credential-required' ? 'Credential required before this source can contribute.'
      : responseSource?.status === 'error' ? responseSource.error || 'Upstream query error.'
        : localResult && procedure && !localEvidence ? 'Reachable and contains this procedure nationally, but no qualifying evidence in the strict local radius.'
          : procedure ? 'Reachable and returned qualifying self-pay evidence for this procedure.'
            : reachable ? 'Reachable, but no qualifying evidence for this procedure in the current query.'
              : 'Awaiting source response.';
  return { registry, national, local, reachable, procedure, localEvidence, qualifying, detail };
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="kx-metric"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
}

export default function PriceIntelligenceV2() {
  const [procedure, setProcedure] = useState(defaultProcedure);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(50);
  const [nationalResult, setNationalResult] = useState<SearchResult | null>(null);
  const [nationalLoading, setNationalLoading] = useState(true);
  const [nationalError, setNationalError] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<SearchResult | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mode, setMode] = useState<TerrainMode>('price');
  const [threeD, setThreeD] = useState(true);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [quote, setQuote] = useState('');
  const [inspection, setInspection] = useState<TerrainInspection | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNationalLoading(true);
    setNationalError(null);
    setLocalResult(null);
    setSourceFilter('all');
    setInspection(null);
    searchPricing(procedure)
      .then((result) => { if (!cancelled) setNationalResult(result); })
      .catch((error) => { if (!cancelled) { setNationalResult(null); setNationalError(error instanceof Error ? error.message : 'National map search failed.'); } })
      .finally(() => { if (!cancelled) setNationalLoading(false); });
    return () => { cancelled = true; };
  }, [procedure.code]);

  async function runMarketSearch() {
    if (!location.trim()) { setLocalError('Enter a city, state, or ZIP to calculate a strict local benchmark.'); return; }
    setLocalLoading(true);
    setLocalError(null);
    setInspection(null);
    try { setLocalResult(await searchPricing(procedure, location, radius)); }
    catch (error) { setLocalResult(null); setLocalError(error instanceof Error ? error.message : 'Local market search failed.'); }
    finally { setLocalLoading(false); }
  }

  const nationalMedian = nationalResult?.combined.median || null;
  const terrainObservations = useMemo<TerrainObservation[]>(() => {
    if (!nationalResult) return [];
    const baseMedian = nationalMedian || 1;
    return nationalResult.sources
      .filter((source) => sourceFilter === 'all' || source.sourceId === sourceFilter)
      .flatMap((source) => source.observations.map((item, index) => ({
        id: `${source.sourceId}-${index}-${item.price}`,
        latitude: item.latitude as number,
        longitude: item.longitude as number,
        price: item.price,
        priceIndex: baseMedian ? (item.price / baseMedian) * 100 : 100,
        source: source.sourceName,
        sourceId: source.sourceId,
        provider: item.providerName,
        city: item.city,
        state: item.state,
        postalCode: item.postalCode,
        paymentBasis: item.paymentBasis,
      })))
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && item.price > 0);
  }, [nationalResult, nationalMedian, sourceFilter]);

  const sourceOptions = useMemo(() => (nationalResult?.sources || [])
    .filter((source) => source.observations.some((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)))
    .sort((a, b) => b.observations.length - a.observations.length), [nationalResult]);

  const healthRows = useMemo(() => PRICING_SOURCES.map((source) => buildHealth(source, nationalResult, localResult)), [nationalResult, localResult]);
  const liveRows = healthRows.filter((row) => row.registry.integrationState === 'live');
  const reachableCount = liveRows.filter((row) => row.reachable).length;
  const procedureCount = liveRows.filter((row) => row.procedure).length;
  const localEvidenceCount = localResult ? liveRows.filter((row) => row.localEvidence).length : 0;
  const errorCount = liveRows.filter((row) => (row.local || row.national)?.status === 'error').length;

  const localMedian = localResult?.combined.median || null;
  const quoteNumber = Number(quote.replace(/[$,]/g, ''));
  const variance = localMedian && Number.isFinite(quoteNumber) && quoteNumber > 0 ? ((quoteNumber - localMedian) / localMedian) * 100 : null;
  const quoteAssessment = variance === null ? null : variance <= 10 ? 'Within market' : variance <= 25 ? 'Moderately above market' : variance <= 50 ? 'High' : 'Very high';
  const strictMarketName = localResult?.resolvedLocation?.displayName || localResult?.location || null;

  const inspectorTitle = inspection?.title || (strictMarketName ? strictMarketName : 'National self-pay landscape');
  const inspectorMedian = inspection?.median ?? localMedian ?? nationalMedian;
  const inspectorCount = inspection?.count ?? localResult?.combined.count ?? nationalResult?.combined.count ?? 0;
  const inspectorLow = inspection?.low ?? localResult?.combined.low ?? nationalResult?.combined.low ?? null;
  const inspectorHigh = inspection?.high ?? localResult?.combined.high ?? nationalResult?.combined.high ?? null;

  const modeLabel = mode === 'price' ? 'PRICE TERRAIN' : mode === 'density' ? 'MARKET DENSITY' : 'PRICE SPREAD';
  const modeDescription = mode === 'price' ? 'Height = median price index · color = price index'
    : mode === 'density' ? 'Height = observation count · color = median price index'
      : 'Height + color = interquartile price-index spread';

  return (
    <main className="kx-app">
      <div className="kx-map-shell">
        <PriceTerrainMap
          observations={terrainObservations}
          mode={mode}
          threeD={threeD}
          focus={localResult?.resolvedLocation ? { latitude: localResult.resolvedLocation.latitude, longitude: localResult.resolvedLocation.longitude, displayName: strictMarketName || undefined } : null}
          radiusMiles={localResult?.radiusMiles || radius}
          onInspect={setInspection}
        />
      </div>

      <header className="kx-topbar">
        <div className="kx-brand"><span>OM</span><div><strong>Price Intelligence</strong><small>Spatial self-pay market engine</small></div></div>
        <div className="kx-source-pulse">
          <span><i className={errorCount ? 'warn' : ''} />{liveRows.length} integrations</span>
          <span>{reachableCount} reachable</span>
          <span>{procedureCount} procedure</span>
          {localResult && <span>{localEvidenceCount} local</span>}
        </div>
        <div className="kx-actions">
          <button type="button" onClick={() => setDrawer(drawer === 'quote' ? null : 'quote')}>Quote</button>
          <button type="button" onClick={() => setDrawer(drawer === 'evidence' ? null : 'evidence')}>Evidence</button>
          <button type="button" onClick={() => setDrawer(drawer === 'report' ? null : 'report')}>Brief</button>
        </div>
      </header>

      <section className="kx-query-dock">
        <ProcedurePicker value={procedure} onChange={setProcedure} />
        <label className="kx-location"><small>STRICT MARKET</small><input value={location} onChange={(event) => setLocation(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') runMarketSearch(); }} placeholder="City, state or ZIP" /></label>
        <label className="kx-radius"><small>RADIUS</small><select value={radius} onChange={(event) => setRadius(Number(event.target.value))}>{[25, 50, 75, 100, 150].map((item) => <option value={item} key={item}>{item} mi</option>)}</select></label>
        <button className="kx-search" type="button" onClick={runMarketSearch} disabled={localLoading}>{localLoading ? 'Resolving…' : 'Analyze market'}</button>
      </section>

      <aside className="kx-mode-rail">
        <span>MAP MODE</span>
        <button type="button" className={mode === 'price' ? 'active' : ''} onClick={() => setMode('price')}><i className="terrain" /><b>Price</b><small>terrain</small></button>
        <button type="button" className={mode === 'density' ? 'active' : ''} onClick={() => setMode('density')}><i className="density" /><b>Density</b><small>volume</small></button>
        <button type="button" className={mode === 'spread' ? 'active' : ''} onClick={() => setMode('spread')}><i className="spread" /><b>Spread</b><small>variance</small></button>
        <div className="kx-rail-rule" />
        <button type="button" className={threeD ? 'active' : ''} onClick={() => setThreeD((value) => !value)}><i className="cube" /><b>{threeD ? '3D' : '2D'}</b><small>view</small></button>
      </aside>

      <aside className="kx-inspector">
        <div className="kx-inspector-kicker"><span>{inspection ? inspection.kind.toUpperCase() : localResult ? 'STRICT MARKET' : 'NATIONAL VIEW'}</span><button type="button" onClick={() => setInspection(null)} disabled={!inspection}>×</button></div>
        <h2>{inspectorTitle}</h2>
        <div className="kx-inspector-price"><strong>{money(inspectorMedian)}</strong><span>{inspection?.priceIndex ? `INDEX ${Math.round(inspection.priceIndex)}` : localMedian ? 'LOCAL MEDIAN' : 'NATIONAL MEDIAN'}</span></div>
        <div className="kx-inspector-grid">
          <Metric label="LOW" value={money(inspectorLow)} sub="observed" />
          <Metric label="HIGH" value={money(inspectorHigh)} sub="observed" />
          <Metric label="OBS" value={inspectorCount.toLocaleString()} sub="qualifying" />
          <Metric label="FAMILIES" value={String(localResult?.benchmark?.provenanceFamilyCount ?? nationalResult?.benchmark?.provenanceFamilyCount ?? 0)} sub="independent" />
        </div>
        {inspection?.sources?.length ? <div className="kx-inspector-sources"><span>SOURCES IN CELL</span>{inspection.sources.slice(0, 6).map((source) => <b key={source}>{source}</b>)}</div> : null}
        {!inspection && localResult && !localMedian && <div className="kx-no-local"><b>No strict local benchmark.</b><span>The national terrain remains visible. No national or out-of-radius price was substituted into the local result.</span></div>}
        {!inspection && !localResult && <div className="kx-inspector-help"><b>Search a market or click the terrain.</b><span>The map stays national; a market search only adds the strict radius and local evidence layer.</span></div>}
      </aside>

      <div className="kx-layer-bar">
        <div><span>{modeLabel}</span><small>{modeDescription}</small></div>
        <label><span>SOURCE LAYER</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All qualifying sources</option>{sourceOptions.map((source) => <option key={source.sourceId} value={source.sourceId}>{source.sourceName} · {source.observations.length.toLocaleString()}</option>)}</select></label>
        <div className="kx-map-count"><strong>{terrainObservations.length.toLocaleString()}</strong><span>mapped observations</span></div>
      </div>

      {(nationalLoading || nationalError || localError) && <div className={`kx-toast ${nationalError || localError ? 'error' : ''}`}>{nationalLoading ? 'Loading national self-pay terrain…' : nationalError || localError}</div>}

      {drawer && <button aria-label="Close drawer" className="kx-drawer-scrim" type="button" onClick={() => setDrawer(null)} />}

      <aside className={`kx-drawer ${drawer ? 'open' : ''} ${drawer === 'evidence' ? 'wide' : ''}`}>
        <div className="kx-drawer-head"><div><span>{drawer === 'quote' ? 'QUOTE ANALYZER' : drawer === 'evidence' ? 'SOURCE HEALTH' : 'LEADERSHIP BRIEF'}</span><h2>{drawer === 'quote' ? 'Compare the actual provider fee' : drawer === 'evidence' ? 'Know exactly what is working' : 'Decision-ready market evidence'}</h2></div><button type="button" onClick={() => setDrawer(null)}>×</button></div>

        {drawer === 'quote' && (
          <div className="kx-quote-drawer">
            <div className="kx-drawer-note">Quote analysis only uses the strict local result. National terrain is visual context and never substitutes for missing local evidence.</div>
            <label><span>Provider location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, state or ZIP" /></label>
            <div className="kx-quote-row"><label><span>Radius</span><select value={radius} onChange={(event) => setRadius(Number(event.target.value))}>{[25, 50, 75, 100, 150].map((item) => <option value={item} key={item}>{item} miles</option>)}</select></label><label><span>Provider quote</span><div className="kx-money"><b>$</b><input inputMode="decimal" value={quote} onChange={(event) => setQuote(event.target.value)} placeholder="0.00" /></div></label></div>
            <button className="kx-primary" type="button" onClick={runMarketSearch} disabled={localLoading}>{localLoading ? 'Analyzing…' : localResult ? 'Refresh local benchmark' : 'Run local benchmark'}</button>
            {localResult && localMedian ? (
              <div className="kx-quote-result">
                <div><span>PROVIDER QUOTE</span><strong>{quoteNumber > 0 ? money(quoteNumber) : '—'}</strong></div>
                <div><span>LOCAL MEDIAN</span><strong>{money(localMedian)}</strong></div>
                <div><span>VARIANCE</span><strong>{variance === null ? '—' : `${variance >= 0 ? '+' : ''}${variance.toFixed(1)}%`}</strong></div>
                <section><span>MARKET INTERPRETATION</span><h3>{quoteAssessment || 'Enter a provider quote'}</h3><p>{localResult.combined.count} deduplicated observations · {localResult.benchmark?.provenanceFamilyCount || 0} provenance families · {localResult.radiusMiles} mile strict radius.</p></section>
              </div>
            ) : localResult ? <div className="kx-no-local"><b>No qualifying local benchmark.</b><span>Quote classification is intentionally withheld.</span></div> : null}
          </div>
        )}

        {drawer === 'evidence' && (
          <div className="kx-health">
            <div className="kx-health-summary"><div><strong>{liveRows.length}</strong><span>active integrations</span></div><div><strong>{reachableCount}</strong><span>reachable</span></div><div><strong>{procedureCount}</strong><span>contain procedure</span></div><div><strong>{localResult ? localEvidenceCount : '—'}</strong><span>local evidence</span></div></div>
            <div className="kx-health-head"><span>Source</span><span>Connected</span><span>Procedure</span><span>Local</span><span>Qualifying</span></div>
            <div className="kx-health-list">
              {healthRows.map((row) => (
                <article key={row.registry.id} className={row.registry.integrationState !== 'live' ? 'inactive' : ''}>
                  <div><strong>{row.registry.name}</strong><small>{familyLabel(row.registry.provenanceFamily)}</small><em>{row.detail}</em></div>
                  <SourceLamp active={row.registry.integrationState === 'live' ? row.reachable : null} label={row.registry.integrationState === 'live' ? row.reachable ? 'YES' : 'NO' : 'N/A'} />
                  <SourceLamp active={row.registry.integrationState === 'live' ? row.procedure : null} label={row.registry.integrationState === 'live' ? row.procedure ? 'YES' : 'NO' : 'N/A'} />
                  <SourceLamp active={row.registry.integrationState === 'live' ? row.localEvidence : null} label={row.registry.integrationState === 'live' && localResult ? row.localEvidence ? 'YES' : 'NO' : '—'} />
                  <SourceLamp active={row.registry.integrationState === 'live' ? row.qualifying : null} label={row.registry.integrationState === 'live' ? row.qualifying ? 'YES' : 'NO' : 'N/A'} />
                </article>
              ))}
            </div>
          </div>
        )}

        {drawer === 'report' && (
          <div className="kx-report-wrap">
            {localResult && localMedian && quoteNumber > 0 && variance !== null ? (
              <article className="kx-report" id="kx-report">
                <header><span>OCCU-MED · SELF-PAY PRICING INTELLIGENCE</span><h2>Provider Pricing Comparison</h2><p>{procedure.name} · {procedure.codeSystem} {procedure.code}</p></header>
                <section className="kx-report-finding"><span>EXECUTIVE FINDING</span><h3>{quoteAssessment}</h3><p>The provider quote of {money(quoteNumber)} is {Math.abs(variance).toFixed(1)}% {variance >= 0 ? 'above' : 'below'} the provenance-balanced local self-pay median of {money(localMedian)}.</p></section>
                <div className="kx-report-metrics"><Metric label="QUOTE" value={money(quoteNumber)} sub="provider fee" /><Metric label="MEDIAN" value={money(localMedian)} sub="local self-pay" /><Metric label="OBS" value={localResult.combined.count.toLocaleString()} sub="deduplicated" /><Metric label="FAMILIES" value={String(localResult.benchmark?.provenanceFamilyCount || 0)} sub="independent" /></div>
                <section><h4>Market</h4><p>{strictMarketName} · {localResult.radiusMiles} mile strict radius.</p></section>
                <section><h4>Evidence families</h4><div className="kx-report-families">{(localResult.benchmark?.familyMedians || []).map((item) => <div key={item.family}><span>{familyLabel(item.family)}</span><b>{money(item.median)}</b><small>{item.sourceCount} source{item.sourceCount === 1 ? '' : 's'}</small></div>)}</div></section>
                <section><h4>Method</h4><p>Only explicit cash, self-pay, discounted-cash, uninsured direct-pay and marketplace-cash observations qualify. Medicare, Medicaid, negotiated insurance, allowed amounts, claims averages, gross charges, chargemaster values and unknown payment bases are excluded. The headline median is balanced by independent provenance family so duplicate hospital-MRF aggregators cannot multiply their influence.</p></section>
              </article>
            ) : <div className="kx-report-empty"><b>Build the brief from a real quote.</b><span>Run a strict local market search and enter the provider's quoted fee. Empty templates are not presented as reports.</span><button type="button" className="kx-primary" onClick={() => setDrawer('quote')}>Open quote analyzer</button></div>}
            {localResult && localMedian && quoteNumber > 0 && <button className="kx-primary" type="button" onClick={() => window.print()}>Print / Save PDF</button>}
          </div>
        )}
      </aside>
    </main>
  );
}
