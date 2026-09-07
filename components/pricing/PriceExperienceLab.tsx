'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import PriceTerrainMap, { type TerrainInspection, type TerrainMode, type TerrainObservation } from './PriceTerrainMap';
import { PROCEDURES, searchProcedures, type ProcedureDefinition } from '@/lib/pricing/procedures';

type Mode = 'atlas' | 'workbench' | 'canvas' | 'surface' | 'constellation';

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

type MarketNode = {
  key: string;
  label: string;
  count: number;
  median: number;
  low: number;
  high: number;
};

const MODES: Array<{ id: Mode; number: string; name: string; subtitle: string }> = [
  { id: 'atlas', number: '01', name: 'Price Atlas', subtitle: 'Geography is the result' },
  { id: 'workbench', number: '02', name: 'Spatial Workbench', subtitle: 'Evidence becomes an instrument panel' },
  { id: 'canvas', number: '03', name: 'Infinite Canvas', subtitle: 'Every observation becomes a point in space' },
  { id: 'surface', number: '04', name: 'Living Surface', subtitle: 'Price becomes physical terrain' },
  { id: 'constellation', number: '05', name: 'Constellation', subtitle: 'Markets orbit the benchmark' },
];

const DEFAULT_PROCEDURE = PROCEDURES.find((item) => item.code === '71046') || PROCEDURES[0];
const FALLBACK_PROCEDURE = DEFAULT_PROCEDURE;

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatFamily(value: string) {
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

function useModeFromUrl() {
  const [mode, setModeState] = useState<Mode>('atlas');
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('mode') as Mode | null;
    if (value && MODES.some((item) => item.id === value)) setModeState(value);
  }, []);
  const setMode = (next: Mode) => {
    setModeState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('mode', next);
    window.history.replaceState({}, '', url);
  };
  return [mode, setMode] as const;
}

function ModeSwitcher({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  return (
    <nav className="pel2-mode-switcher" aria-label="Pricing visual systems">
      {MODES.map((item) => (
        <button key={item.id} type="button" className={mode === item.id ? 'active' : ''} onClick={() => onMode(item.id)} title={item.subtitle}>
          <span>{item.number}</span><b>{item.name}</b>
        </button>
      ))}
    </nav>
  );
}

function SearchCommand({
  procedure,
  setProcedure,
  location,
  setLocation,
  radius,
  setRadius,
  loading,
  onSearch,
}: {
  procedure: ProcedureDefinition;
  setProcedure: (value: ProcedureDefinition) => void;
  location: string;
  setLocation: (value: string) => void;
  radius: number;
  setRadius: (value: number) => void;
  loading: boolean;
  onSearch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchProcedures(query).slice(0, 10), [query]);
  return (
    <div className="pel2-command">
      <div className="pel2-procedure-wrap">
        <button className="pel2-procedure" type="button" onClick={() => setOpen((value) => !value)}>
          <span>{procedure.code}</span><strong>{procedure.name}</strong><i>⌄</i>
        </button>
        {open && (
          <div className="pel2-picker">
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search CPT, CDT, HCPCS or procedure" />
            <div>
              {matches.map((item) => (
                <button key={`${item.codeSystem}-${item.code}`} type="button" onClick={() => { setProcedure(item); setQuery(''); setOpen(false); }}>
                  <b>{item.code}</b><span><strong>{item.name}</strong><small>{item.category}</small></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <label><span>MARKET</span><input value={location} onChange={(event) => setLocation(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSearch(); }} placeholder="City, state or ZIP — blank for national" /></label>
      <label className="pel2-radius"><span>RADIUS</span><select value={radius} onChange={(event) => setRadius(Number(event.target.value))}>{[25, 50, 75, 100].map((item) => <option key={item}>{item}</option>)}</select></label>
      <button className="pel2-run" type="button" onClick={onSearch} disabled={loading}>{loading ? 'Reading…' : 'Explore'}<b>↗</b></button>
    </div>
  );
}

function CoverageVoid({ procedure, onExample }: { procedure: ProcedureDefinition; onExample: () => void }) {
  return (
    <div className="pel2-void">
      <div className="pel2-void-rings" aria-hidden="true"><i /><i /><i /><i /></div>
      <span>NO QUALIFYING PUBLIC CASH EVIDENCE</span>
      <h2>{procedure.code}</h2>
      <p>This procedure currently has no qualifying observations in the live public-source runtime. The experience will not fabricate a map just to fill the screen.</p>
      {procedure.code !== FALLBACK_PROCEDURE.code && <button type="button" onClick={onExample}>Open a live national example · {FALLBACK_PROCEDURE.code}</button>}
    </div>
  );
}

function AtlasView({ result, terrain, inspection, onInspect }: { result: SearchResult; terrain: TerrainObservation[]; inspection: TerrainInspection | null; onInspect: (value: TerrainInspection) => void }) {
  return (
    <section className="pel2-view pel2-atlas">
      <div className="pel2-atlas-map"><PriceTerrainMap observations={terrain} mode="price" threeD={false} focus={result.resolvedLocation || null} radiusMiles={result.radiusMiles || null} onInspect={onInspect} /></div>
      <div className="pel2-atlas-title">
        <span>PRICE ATLAS · {result.procedure.codeSystem} {result.procedure.code}</span>
        <h1>{result.procedure.name}</h1>
        <p>{result.resolvedLocation?.displayName || 'United States'} · {result.combined.count.toLocaleString()} qualifying cash observations</p>
      </div>
      <div className="pel2-atlas-median"><small>MARKET MEDIAN</small><strong>{money(result.combined.median)}</strong><span>{money(result.combined.low)} — {money(result.combined.high)}</span></div>
      {inspection && <div className="pel2-atlas-inspect"><small>SELECTED SIGNAL</small><strong>{inspection.title}</strong><span>{inspection.count} observation{inspection.count === 1 ? '' : 's'} · median {money(inspection.median)}</span></div>}
      <div className="pel2-atlas-scale"><span>LOWER</span><i /><span>HIGHER</span></div>
    </section>
  );
}

function buildHistogram(observations: FlatObservation[], buckets = 34) {
  if (!observations.length) return [] as Array<{ x: number; count: number }>;
  const prices = observations.map((item) => item.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const span = Math.max(1, high - low);
  const rows = Array.from({ length: buckets }, (_, index) => ({ x: low + (index / Math.max(1, buckets - 1)) * span, count: 0 }));
  observations.forEach((item) => {
    const index = clamp(Math.floor(((item.price - low) / span) * buckets), 0, buckets - 1);
    rows[index].count += 1;
  });
  return rows;
}

function DistributionWave({ observations }: { observations: FlatObservation[] }) {
  const bins = useMemo(() => buildHistogram(observations), [observations]);
  const max = Math.max(1, ...bins.map((item) => item.count));
  const points = bins.map((item, index) => `${(index / Math.max(1, bins.length - 1)) * 1000},${260 - (item.count / max) * 210}`).join(' ');
  return (
    <svg className="pel2-wave" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-label="Observed price distribution">
      <defs><linearGradient id="pel2WaveGradient" x1="0" x2="1"><stop offset="0" stopColor="#4fd7db" /><stop offset=".52" stopColor="#65a7ff" /><stop offset="1" stopColor="#c783ff" /></linearGradient></defs>
      <polyline points={`0,285 ${points} 1000,285`} fill="rgba(68,130,220,.10)" stroke="none" />
      <polyline points={points} fill="none" stroke="url(#pel2WaveGradient)" strokeWidth="7" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function WorkbenchView({ result, observations }: { result: SearchResult; observations: FlatObservation[] }) {
  const sourceRows = result.sources.filter((source) => source.status === 'ok' && source.summary.count > 0).sort((a, b) => b.summary.count - a.summary.count).slice(0, 8);
  const p25 = result.combined.p25;
  const p75 = result.combined.p75;
  return (
    <section className="pel2-view pel2-workbench">
      <div className="pel2-wb-head"><span>MARKET INSTRUMENT · {result.procedure.code}</span><h1>{result.procedure.name}</h1><p>{result.resolvedLocation?.displayName || 'National cash-price evidence'}</p></div>
      <div className="pel2-wb-hero"><small>PROVENANCE-BALANCED MEDIAN</small><strong>{money(result.combined.median)}</strong><span>{result.combined.count.toLocaleString()} observations · {result.benchmark?.provenanceFamilyCount || 0} evidence families</span></div>
      <div className="pel2-wb-wave"><DistributionWave observations={observations} /><div className="pel2-wb-axis"><span>{money(result.combined.low)}</span><span>{p25 ? `P25 ${money(p25)}` : ''}</span><b>{money(result.combined.median)}</b><span>{p75 ? `P75 ${money(p75)}` : ''}</span><span>{money(result.combined.high)}</span></div></div>
      <div className="pel2-wb-sources">
        <div className="pel2-wb-label"><span>SOURCE SIGNALS</span><small>live qualifying evidence only</small></div>
        {sourceRows.map((source) => {
          const width = result.combined.high && source.summary.median ? clamp((source.summary.median / result.combined.high) * 100, 6, 100) : 8;
          return <div className="pel2-source-line" key={source.sourceId}><strong>{source.sourceName}</strong><i><em style={{ width: `${width}%` }} /></i><b>{money(source.summary.median)}</b><small>{source.summary.count}</small></div>;
        })}
      </div>
      <div className="pel2-wb-families">{(result.benchmark?.familyMedians || []).map((family) => <div key={family.family}><span>{formatFamily(family.family)}</span><strong>{money(family.median)}</strong><small>{family.sourceCount} source{family.sourceCount === 1 ? '' : 's'}</small></div>)}</div>
    </section>
  );
}

function CanvasView({ result, observations }: { result: SearchResult; observations: FlatObservation[] }) {
  const sample = useMemo(() => observations.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).slice(0, 240), [observations]);
  const med = result.combined.median || 1;
  return (
    <section className="pel2-view pel2-canvas">
      <div className="pel2-canvas-copy"><span>INFINITE DATA CANVAS · {result.procedure.code}</span><h1>Every price<br />has a position.</h1><p>Longitude places the signal. Latitude places the signal. Distance from the benchmark changes its visual weight.</p><div><b>{money(result.combined.median)}</b><small>national / selected-market median</small></div></div>
      <svg className="pel2-field" viewBox="0 0 1200 720" preserveAspectRatio="none" aria-label="Abstract geographic field of cash-price observations">
        <defs><radialGradient id="pel2Glow"><stop offset="0" stopColor="#ffffff" stopOpacity=".9" /><stop offset=".25" stopColor="#79e9ff" stopOpacity=".55" /><stop offset="1" stopColor="#79e9ff" stopOpacity="0" /></radialGradient></defs>
        {Array.from({ length: 12 }, (_, index) => <line key={`v-${index}`} x1={index * 110} y1="0" x2={index * 110} y2="720" className="pel2-gridline" />)}
        {Array.from({ length: 8 }, (_, index) => <line key={`h-${index}`} x1="0" y1={index * 102} x2="1200" y2={index * 102} className="pel2-gridline" />)}
        {sample.map((item, index) => {
          const x = ((Number(item.longitude) + 180) / 360) * 1200;
          const y = ((90 - Number(item.latitude)) / 180) * 720;
          const variance = item.price / med;
          const r = clamp(2.8 + Math.abs(variance - 1) * 8, 3, 11);
          const cls = variance < .82 ? 'low' : variance > 1.22 ? 'high' : 'mid';
          return <g key={`${item.sourceId}-${index}`} className={`pel2-field-point ${cls}`} style={{ '--delay': `${(index % 24) * -.09}s` } as CSSProperties}><circle cx={x} cy={y} r={r * 3.2} className="halo" /><circle cx={x} cy={y} r={r} /></g>;
        })}
      </svg>
      <div className="pel2-canvas-legend"><span>BELOW BENCHMARK</span><i /><span>ABOVE BENCHMARK</span></div>
      <div className="pel2-canvas-count"><strong>{sample.length.toLocaleString()}</strong><span>geocoded signals rendered</span></div>
    </section>
  );
}

function SurfaceView({ result, terrain, metric, setMetric, inspection, onInspect }: { result: SearchResult; terrain: TerrainObservation[]; metric: TerrainMode; setMetric: (value: TerrainMode) => void; inspection: TerrainInspection | null; onInspect: (value: TerrainInspection) => void }) {
  return (
    <section className="pel2-view pel2-surface">
      <div className="pel2-surface-map"><PriceTerrainMap observations={terrain} mode={metric} threeD focus={result.resolvedLocation || null} radiusMiles={result.radiusMiles || null} onInspect={onInspect} /></div>
      <div className="pel2-surface-copy"><span>THE MARKET AS TOPOGRAPHY · {result.procedure.code}</span><h1>{metric === 'price' ? 'Price has elevation.' : metric === 'density' ? 'Evidence has mass.' : 'Uncertainty has terrain.'}</h1><p>{result.procedure.name}</p><div className="pel2-surface-median"><small>MEDIAN</small><strong>{money(result.combined.median)}</strong></div></div>
      <div className="pel2-surface-toggle">{(['price', 'density', 'spread'] as TerrainMode[]).map((item) => <button type="button" key={item} className={metric === item ? 'active' : ''} onClick={() => setMetric(item)}>{item}</button>)}</div>
      {inspection && <div className="pel2-surface-inspect"><small>SELECTED TERRAIN</small><strong>{inspection.title}</strong><span>{money(inspection.median)} median · {inspection.count} record{inspection.count === 1 ? '' : 's'}</span></div>}
    </section>
  );
}

function buildMarkets(observations: FlatObservation[], limit = 24): MarketNode[] {
  const grouped = new Map<string, FlatObservation[]>();
  observations.forEach((item) => {
    const label = [item.city, item.state].filter(Boolean).join(', ') || item.postalCode || item.sourceName;
    const key = label.toLowerCase();
    grouped.set(key, [...(grouped.get(key) || []), item]);
  });
  return [...grouped.entries()].map(([key, rows]) => {
    const prices = rows.map((item) => item.price);
    return { key, label: [rows[0].city, rows[0].state].filter(Boolean).join(', ') || rows[0].postalCode || rows[0].sourceName, count: rows.length, median: median(prices), low: Math.min(...prices), high: Math.max(...prices) };
  }).sort((a, b) => b.count - a.count).slice(0, limit);
}

function ConstellationView({ result, observations }: { result: SearchResult; observations: FlatObservation[] }) {
  const markets = useMemo(() => buildMarkets(observations), [observations]);
  const benchmark = result.combined.median || 1;
  return (
    <section className="pel2-view pel2-constellation">
      <div className="pel2-stars" aria-hidden="true" />
      <div className="pel2-const-copy"><span>MARKET CONSTELLATION · {result.procedure.code}</span><h1>One benchmark.<br />Many market orbits.</h1><p>Distance from the center is price deviation. Node size is evidence volume. Select a market with your eyes before you ever read a table.</p></div>
      <svg className="pel2-orbits" viewBox="0 0 1000 760" aria-label="Market price constellation">
        <defs><radialGradient id="pel2Core"><stop offset="0" stopColor="#fff" /><stop offset=".32" stopColor="#b9f3ff" /><stop offset="1" stopColor="#5ea5ff" stopOpacity="0" /></radialGradient></defs>
        {[145, 235, 330].map((r) => <circle key={r} cx="500" cy="380" r={r} className="orbit" />)}
        <circle cx="500" cy="380" r="82" fill="url(#pel2Core)" />
        <circle cx="500" cy="380" r="35" className="core" />
        <text x="500" y="371" textAnchor="middle" className="core-label">BENCHMARK</text>
        <text x="500" y="397" textAnchor="middle" className="core-price">{money(result.combined.median)}</text>
        {markets.map((market, index) => {
          const deviation = Math.abs(market.median / benchmark - 1);
          const radius = clamp(120 + deviation * 500, 125, 330);
          const angle = (index / Math.max(1, markets.length)) * Math.PI * 2 - Math.PI / 2;
          const x = 500 + Math.cos(angle) * radius;
          const y = 380 + Math.sin(angle) * radius;
          const size = clamp(6 + Math.sqrt(market.count) * 2.4, 7, 24);
          const cls = market.median < benchmark * .92 ? 'below' : market.median > benchmark * 1.08 ? 'above' : 'near';
          return <g key={market.key} className={`market-node ${cls}`} style={{ '--delay': `${index * -.18}s` } as CSSProperties}><line x1="500" y1="380" x2={x} y2={y} /><circle cx={x} cy={y} r={size * 2.4} className="node-glow" /><circle cx={x} cy={y} r={size} /><text x={x} y={y + size + 18} textAnchor="middle">{market.label}</text><text x={x} y={y + size + 34} textAnchor="middle" className="node-price">{money(market.median)}</text></g>;
        })}
      </svg>
      <div className="pel2-const-meta"><div><strong>{markets.length}</strong><span>markets resolved</span></div><div><strong>{result.combined.count.toLocaleString()}</strong><span>qualifying observations</span></div><div><strong>{result.benchmark?.provenanceFamilyCount || 0}</strong><span>evidence families</span></div></div>
    </section>
  );
}

export default function PriceExperienceLab() {
  const [mode, setMode] = useModeFromUrl();
  const [procedure, setProcedure] = useState(DEFAULT_PROCEDURE);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(50);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<TerrainInspection | null>(null);
  const [surfaceMetric, setSurfaceMetric] = useState<TerrainMode>('price');

  async function runSearch(nextProcedure = procedure) {
    setLoading(true);
    setError(null);
    setInspection(null);
    try { setResult(await searchPricing(nextProcedure, location, radius)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Search failed.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void runSearch(DEFAULT_PROCEDURE); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches?.('input,textarea,select')) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < MODES.length) setMode(MODES[index].id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setMode]);

  const observations = useMemo<FlatObservation[]>(() => {
    if (!result) return [];
    return result.sources.flatMap((source) => source.observations.map((item) => ({ ...item, sourceName: source.sourceName, family: source.provenanceFamily })));
  }, [result]);

  const terrain = useMemo<TerrainObservation[]>(() => {
    const benchmark = result?.combined.median || 1;
    return observations.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && item.price > 0).map((item, index) => ({
      id: `${item.sourceId}-${index}`,
      latitude: item.latitude as number,
      longitude: item.longitude as number,
      price: item.price,
      priceIndex: (item.price / benchmark) * 100,
      source: item.sourceName,
      sourceId: item.sourceId,
      provider: item.providerName,
      city: item.city,
      state: item.state,
      postalCode: item.postalCode,
      paymentBasis: item.paymentBasis,
    }));
  }, [observations, result?.combined.median]);

  const openLiveExample = () => {
    setProcedure(FALLBACK_PROCEDURE);
    setLocation('');
    void runSearch(FALLBACK_PROCEDURE);
  };

  return (
    <main className={`pel2-root pel2-${mode}`}>
      <div className="pel2-brand"><span>OM</span><div><strong>Price Intelligence</strong><small>Visual research lab</small></div></div>
      <SearchCommand procedure={procedure} setProcedure={setProcedure} location={location} setLocation={setLocation} radius={radius} setRadius={setRadius} loading={loading} onSearch={() => void runSearch()} />
      <ModeSwitcher mode={mode} onMode={setMode} />
      <a className="pel2-classic" href="/vault">Primary workspace ↗</a>
      {error && <div className="pel2-error">{error}</div>}
      {loading && !result && <div className="pel2-loading"><i /><span>Reading live self-pay evidence</span></div>}
      {result && result.combined.count === 0 && <CoverageVoid procedure={result.procedure} onExample={openLiveExample} />}
      {result && result.combined.count > 0 && mode === 'atlas' && <AtlasView result={result} terrain={terrain} inspection={inspection} onInspect={setInspection} />}
      {result && result.combined.count > 0 && mode === 'workbench' && <WorkbenchView result={result} observations={observations} />}
      {result && result.combined.count > 0 && mode === 'canvas' && <CanvasView result={result} observations={observations} />}
      {result && result.combined.count > 0 && mode === 'surface' && <SurfaceView result={result} terrain={terrain} metric={surfaceMetric} setMetric={setSurfaceMetric} inspection={inspection} onInspect={setInspection} />}
      {result && result.combined.count > 0 && mode === 'constellation' && <ConstellationView result={result} observations={observations} />}
    </main>
  );
}
