'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import PriceTerrainMap, { type TerrainInspection, type TerrainObservation } from './PriceTerrainMap';
import { PROCEDURES, searchProcedures, type ProcedureDefinition } from '@/lib/pricing/procedures';

type Lens = 'geography' | 'distribution' | 'confidence' | 'decision' | 'comparables';

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

type MarketStat = {
  key: string;
  label: string;
  city?: string;
  state?: string;
  count: number;
  median: number;
  low: number;
  high: number;
  p25: number;
  p75: number;
  spreadRatio: number;
  familyCount: number;
};

type ComparableMarket = MarketStat & {
  similarity: number;
  angle: number;
  radius: number;
  tone: 'lower' | 'similar' | 'higher';
};

const LENSES: Array<{ id: Lens; number: string; name: string; question: string }> = [
  { id: 'geography', number: '01', name: 'Market Geography', question: 'Where is usable evidence and how dense is the network?' },
  { id: 'distribution', number: '02', name: 'Price Distribution', question: 'What is normal, clustered, or an outlier?' },
  { id: 'confidence', number: '03', name: 'Evidence Confidence', question: 'How much should I trust this benchmark?' },
  { id: 'decision', number: '04', name: 'Quote Decision', question: 'Is the clinic quote reasonable and what should I target?' },
  { id: 'comparables', number: '05', name: 'Comparable Markets', question: 'Which other markets are genuinely analogous?' },
];

const LEGACY_LENS: Record<string, Lens> = {
  atlas: 'geography',
  workbench: 'distribution',
  canvas: 'confidence',
  surface: 'decision',
  constellation: 'comparables',
};

const DEFAULT_PROCEDURE = PROCEDURES.find((item) => item.code === '71046') || PROCEDURES[0];

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
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pct(value: number) {
  return `${Math.round(value)}%`;
}

function familyLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).replace('Mrf', 'MRF');
}

function hash(value: string) {
  let output = 0;
  for (let index = 0; index < value.length; index += 1) output = ((output << 5) - output + value.charCodeAt(index)) | 0;
  return Math.abs(output);
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

function useLensFromUrl() {
  const [lens, setLensState] = useState<Lens>('geography');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('lens') || params.get('mode');
    if (!raw) return;
    const next = (LENSES.some((item) => item.id === raw) ? raw : LEGACY_LENS[raw]) as Lens | undefined;
    if (next) setLensState(next);
  }, []);
  const setLens = (next: Lens) => {
    setLensState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('lens', next);
    url.searchParams.delete('mode');
    window.history.replaceState({}, '', url);
  };
  return [lens, setLens] as const;
}

function SearchCommand({
  procedure,
  onProcedure,
  location,
  onLocation,
  radius,
  onRadius,
  loading,
  onSearch,
}: {
  procedure: ProcedureDefinition;
  onProcedure: (value: ProcedureDefinition) => void;
  location: string;
  onLocation: (value: string) => void;
  radius: number;
  onRadius: (value: number) => void;
  loading: boolean;
  onSearch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchProcedures(query).slice(0, 12), [query]);
  return (
    <div className="pal-command">
      <div className="pal-procedure-wrap">
        <button type="button" className="pal-procedure" onClick={() => setOpen((value) => !value)}>
          <span>{procedure.code}</span><strong>{procedure.name}</strong><i>⌄</i>
        </button>
        {open && (
          <div className="pal-picker">
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search CPT, CDT, HCPCS or procedure" />
            <div>{matches.map((item) => (
              <button key={`${item.codeSystem}-${item.code}`} type="button" onClick={() => { onProcedure(item); setOpen(false); setQuery(''); }}>
                <b>{item.code}</b><span><strong>{item.name}</strong><small>{item.category}</small></span>
              </button>
            ))}</div>
          </div>
        )}
      </div>
      <label><span>MARKET</span><input value={location} onChange={(event) => onLocation(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSearch(); }} placeholder="City, state or ZIP — blank for national" /></label>
      <label className="pal-radius"><span>RADIUS</span><select value={radius} onChange={(event) => onRadius(Number(event.target.value))}>{[25, 50, 75, 100, 150].map((item) => <option key={item}>{item}</option>)}</select></label>
      <button className="pal-run" type="button" onClick={onSearch} disabled={loading}>{loading ? 'Resolving…' : 'Analyze'}<b>↗</b></button>
    </div>
  );
}

function LensNav({ lens, onLens }: { lens: Lens; onLens: (value: Lens) => void }) {
  return (
    <nav className="pal-lenses" aria-label="Analyst lenses">
      {LENSES.map((item) => (
        <button key={item.id} type="button" className={lens === item.id ? 'active' : ''} onClick={() => onLens(item.id)} title={item.question}>
          <span>{item.number}</span><b>{item.name}</b><small>{item.question}</small>
        </button>
      ))}
    </nav>
  );
}

function CoverageVoid({ procedure }: { procedure: ProcedureDefinition }) {
  return (
    <section className="pal-void">
      <div className="pal-void-rings" aria-hidden="true"><i /><i /><i /><i /></div>
      <span>NO QUALIFYING PUBLIC CASH EVIDENCE</span>
      <h1>{procedure.code}</h1>
      <p>The live public-source runtime currently has no qualifying self-pay observations for this procedure. The analyst workspace will not fabricate evidence to fill a visualization.</p>
    </section>
  );
}

function GeographyLens({ result, terrain, inspection, onInspect }: {
  result: SearchResult;
  terrain: TerrainObservation[];
  inspection: TerrainInspection | null;
  onInspect: (value: TerrainInspection) => void;
}) {
  const markets = new Set(terrain.map((item) => [item.city, item.state].filter(Boolean).join(', ')).filter(Boolean));
  const geocodedShare = result.combined.count ? (terrain.length / result.combined.count) * 100 : 0;
  return (
    <section className="pal-view pal-geography">
      <div className="pal-map"><PriceTerrainMap observations={terrain} mode="density" threeD={false} focus={result.resolvedLocation || null} radiusMiles={result.radiusMiles || null} onInspect={onInspect} /></div>
      <div className="pal-geo-copy">
        <span>MARKET GEOGRAPHY · {result.procedure.code}</span>
        <h1>Where can I actually anchor a price?</h1>
        <p>Density shows where usable self-pay evidence exists. This lens is about network coverage and market depth — not the benchmark itself.</p>
      </div>
      <div className="pal-geo-stats">
        <div><small>GEOCODED SIGNALS</small><strong>{terrain.length.toLocaleString()}</strong><span>{pct(geocodedShare)} of qualifying evidence</span></div>
        <div><small>RESOLVED MARKETS</small><strong>{markets.size.toLocaleString()}</strong><span>city/state clusters represented</span></div>
        <div><small>SEARCH CONTEXT</small><strong>{result.resolvedLocation?.displayName || 'National'}</strong><span>{result.resolvedLocation ? `${result.radiusMiles || 50} mile strict radius` : 'all available public cash evidence'}</span></div>
      </div>
      {inspection && <aside className="pal-geo-inspect"><small>SELECTED NETWORK CELL</small><strong>{inspection.title}</strong><span>{inspection.count} signals · {inspection.sources.length} source{inspection.sources.length === 1 ? '' : 's'}</span><b>Observed median {money(inspection.median)}</b></aside>}
    </section>
  );
}

function DistributionLens({ result, observations }: { result: SearchResult; observations: FlatObservation[] }) {
  const prices = observations.map((item) => item.price).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const q1 = result.combined.p25 ?? percentile(prices, .25);
  const q3 = result.combined.p75 ?? percentile(prices, .75);
  const med = result.combined.median ?? median(prices);
  const iqr = Math.max(1, q3 - q1);
  const lowFence = Math.max(0, q1 - 1.5 * iqr);
  const highFence = q3 + 1.5 * iqr;
  const outliers = observations.filter((item) => item.price < lowFence || item.price > highFence).sort((a, b) => Math.abs(b.price - med) - Math.abs(a.price - med));
  const axisLow = percentile(prices, .02) || prices[0] || 0;
  const axisHigh = percentile(prices, .98) || prices[prices.length - 1] || 1;
  const axisSpan = Math.max(1, axisHigh - axisLow);
  const visible = observations.filter((item) => item.price >= axisLow && item.price <= axisHigh).slice(0, 700);
  return (
    <section className="pal-view pal-distribution">
      <header className="pal-section-head">
        <div><span>PRICE DISTRIBUTION · {result.procedure.code}</span><h1>What does “normal” actually look like?</h1><p>Every qualifying observation is placed on the price axis. The center mass shows the market; the tails identify negotiation risk and possible data anomalies.</p></div>
        <div className="pal-big-stat"><small>INTERQUARTILE RANGE</small><strong>{money(q1)} — {money(q3)}</strong><span>{outliers.length} statistical outlier{outliers.length === 1 ? '' : 's'}</span></div>
      </header>
      <div className="pal-price-field">
        <div className="pal-band typical" style={{ left: `${clamp(((q1 - axisLow) / axisSpan) * 100, 0, 100)}%`, width: `${clamp(((q3 - q1) / axisSpan) * 100, 1, 100)}%` }}><span>TYPICAL 50%</span></div>
        <div className="pal-median-line" style={{ left: `${clamp(((med - axisLow) / axisSpan) * 100, 0, 100)}%` }}><b>{money(med)}</b></div>
        {visible.map((item, index) => {
          const left = clamp(((item.price - axisLow) / axisSpan) * 100, 0, 100);
          const lane = 12 + (hash(`${item.sourceId}-${index}`) % 68);
          const extreme = item.price < lowFence || item.price > highFence;
          return <i key={`${item.sourceId}-${index}-${item.price}`} className={extreme ? 'outlier' : ''} style={{ left: `${left}%`, top: `${lane}%` }} title={`${item.providerName || item.sourceName} · ${money(item.price)}`} />;
        })}
        <div className="pal-axis"><span>{money(axisLow)}</span><span>P25 {money(q1)}</span><b>MEDIAN {money(med)}</b><span>P75 {money(q3)}</span><span>{money(axisHigh)}</span></div>
      </div>
      <div className="pal-distribution-bottom">
        <div className="pal-outliers"><div className="pal-mini-title"><span>OUTLIER REVIEW</span><small>IQR rule · investigate, do not automatically discard</small></div>{outliers.slice(0, 7).map((item, index) => <article key={`${item.sourceId}-${index}`}><strong>{money(item.price)}</strong><span>{item.providerName || item.sourceName}</span><small>{[item.city, item.state].filter(Boolean).join(', ') || item.sourceName}</small></article>)}</div>
        <div className="pal-percentiles"><div><small>LOW</small><strong>{money(result.combined.low)}</strong></div><div><small>P25</small><strong>{money(q1)}</strong></div><div><small>MEDIAN</small><strong>{money(med)}</strong></div><div><small>P75</small><strong>{money(q3)}</strong></div><div><small>HIGH</small><strong>{money(result.combined.high)}</strong></div></div>
      </div>
    </section>
  );
}

function ConfidenceLens({ result, observations }: { result: SearchResult; observations: FlatObservation[] }) {
  const familyRows = result.benchmark?.familyMedians || [];
  const sourceRows = result.sources.filter((source) => source.status === 'ok' && source.summary.count > 0).sort((a, b) => b.summary.count - a.summary.count);
  const familyCount = familyRows.length || result.benchmark?.provenanceFamilyCount || 0;
  const sourceCount = sourceRows.length;
  const geocoded = observations.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).length;
  const geoScore = observations.length ? (geocoded / observations.length) * 100 : 0;
  const depthScore = clamp((Math.log10(Math.max(1, observations.length)) / 3) * 100, 0, 100);
  const diversityScore = clamp((familyCount / 4) * 100, 0, 100);
  const topShare = observations.length && sourceRows.length ? sourceRows[0].summary.count / observations.length : 1;
  const concentrationScore = clamp(100 - topShare * 70, 0, 100);
  const familyMedians = familyRows.map((item) => item.median).filter((value) => Number.isFinite(value) && value > 0);
  const familyMean = familyMedians.length ? familyMedians.reduce((a, b) => a + b, 0) / familyMedians.length : 0;
  const familyVariance = familyMedians.length > 1 ? familyMedians.reduce((sum, value) => sum + (value - familyMean) ** 2, 0) / familyMedians.length : 0;
  const familyCv = familyMean ? Math.sqrt(familyVariance) / familyMean : 1;
  const agreementScore = familyMedians.length > 1 ? clamp(100 - familyCv * 140, 0, 100) : 25;
  const strength = Math.round((depthScore + diversityScore + geoScore + concentrationScore + agreementScore) / 5);
  const strengthLabel = strength >= 80 ? 'Strong' : strength >= 60 ? 'Moderate' : strength >= 40 ? 'Limited' : 'Weak';
  const metrics = [
    ['Sample depth', depthScore, `${observations.length.toLocaleString()} qualifying observations`],
    ['Source diversity', diversityScore, `${familyCount} independent evidence families`],
    ['Geographic resolution', geoScore, `${geocoded.toLocaleString()} observations can be mapped`],
    ['Source concentration', concentrationScore, `${Math.round(topShare * 100)}% from the largest contributing source`],
    ['Cross-family agreement', agreementScore, familyMedians.length > 1 ? `${Math.round(familyCv * 100)}% coefficient of variation` : 'Only one evidence family is available'],
  ] as const;
  return (
    <section className="pal-view pal-confidence">
      <header className="pal-section-head dark">
        <div><span>EVIDENCE CONFIDENCE · {result.procedure.code}</span><h1>How hard should I lean on this number?</h1><p>This lens evaluates the evidence supporting the benchmark. The score is a transparent analyst heuristic and does not alter the benchmark calculation.</p></div>
        <div className="pal-confidence-score"><small>DECISION-SUPPORT STRENGTH</small><strong>{strength}</strong><span>{strengthLabel}</span></div>
      </header>
      <div className="pal-confidence-grid">
        <div className="pal-strength-bars">{metrics.map(([label, score, detail]) => <div key={label}><div><span>{label}</span><b>{Math.round(score)}/100</b></div><i><em style={{ width: `${score}%` }} /></i><small>{detail}</small></div>)}</div>
        <div className="pal-family-matrix"><div className="pal-mini-title"><span>INDEPENDENT EVIDENCE FAMILIES</span><small>separate provenance reduces false certainty</small></div>{familyRows.length ? familyRows.map((row) => <article key={row.family}><span>{familyLabel(row.family)}</span><strong>{money(row.median)}</strong><small>{row.sourceCount} source{row.sourceCount === 1 ? '' : 's'}</small></article>) : <p>No independent family breakdown is available.</p>}</div>
      </div>
      <div className="pal-source-audit"><div className="pal-mini-title"><span>SOURCE AUDIT</span><small>{sourceCount} qualifying source{sourceCount === 1 ? '' : 's'}</small></div>{sourceRows.slice(0, 10).map((source) => <div key={source.sourceId}><strong>{source.sourceName}</strong><span>{familyLabel(source.provenanceFamily)}</span><b>{source.summary.count.toLocaleString()} obs.</b><em>{money(source.summary.median)}</em></div>)}</div>
    </section>
  );
}

function DecisionLens({ result, observations, quote, onQuote, usingLocal }: { result: SearchResult; observations: FlatObservation[]; quote: string; onQuote: (value: string) => void; usingLocal: boolean }) {
  const numeric = Number(quote.replace(/[$,]/g, ''));
  const valid = Number.isFinite(numeric) && numeric > 0;
  const prices = observations.map((item) => item.price).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const q1 = result.combined.p25 ?? percentile(prices, .25);
  const q3 = result.combined.p75 ?? percentile(prices, .75);
  const med = result.combined.median ?? median(prices);
  const percentileRank = valid && prices.length ? (prices.filter((value) => value <= numeric).length / prices.length) * 100 : null;
  const variance = valid && med ? ((numeric - med) / med) * 100 : null;
  const iqr = Math.max(1, q3 - q1);
  const highFence = q3 + 1.5 * iqr;
  const lowFence = Math.max(0, q1 - 1.5 * iqr);
  const status = !valid ? 'Enter a quote' : numeric > highFence ? 'Outlier high' : numeric > q3 ? 'Above typical market' : numeric >= q1 ? 'Within typical market' : numeric >= lowFence ? 'Below typical market' : 'Outlier low';
  const tone = !valid ? 'idle' : numeric > highFence ? 'bad' : numeric > q3 ? 'warn' : numeric >= q1 ? 'good' : 'low';
  const axisLow = Math.min(result.combined.low || q1, valid ? numeric : q1);
  const axisHigh = Math.max(result.combined.high || q3, valid ? numeric : q3);
  const span = Math.max(1, axisHigh - axisLow);
  return (
    <section className="pal-view pal-decision">
      <header className="pal-section-head">
        <div><span>QUOTE DECISION · {result.procedure.code}</span><h1>Turn market evidence into an actual decision.</h1><p>{usingLocal ? `Using the strict ${result.radiusMiles || 50}-mile market around ${result.resolvedLocation?.displayName || result.location}.` : 'No strict local market is active, so the national evidence set is being used as the fallback decision context.'}</p></div>
        <label className="pal-quote-input"><small>CLINIC QUOTE</small><span>$</span><input inputMode="decimal" value={quote} onChange={(event) => onQuote(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /></label>
      </header>
      <div className={`pal-decision-hero ${tone}`}><div><small>ASSESSMENT</small><strong>{status}</strong><span>{variance === null ? 'Add the proposed clinic price to place it inside the market.' : `${variance >= 0 ? '+' : ''}${Math.round(variance)}% versus market median · ${Math.round(percentileRank || 0)}th percentile`}</span></div><div><small>NEGOTIATION CORE</small><strong>{money(q1)} — {money(q3)}</strong><span>middle 50% of qualifying evidence</span></div></div>
      <div className="pal-decision-scale"><div className="pal-normal-band" style={{ left: `${clamp(((q1 - axisLow) / span) * 100, 0, 100)}%`, width: `${clamp(((q3 - q1) / span) * 100, 1, 100)}%` }} /><i className="median" style={{ left: `${clamp(((med - axisLow) / span) * 100, 0, 100)}%` }}><b>MEDIAN<br />{money(med)}</b></i>{valid && <i className="quote" style={{ left: `${clamp(((numeric - axisLow) / span) * 100, 0, 100)}%` }}><b>QUOTE<br />{money(numeric)}</b></i>}<div><span>{money(axisLow)}</span><span>typical market</span><span>{money(axisHigh)}</span></div></div>
      <div className="pal-decision-cards"><article><small>TARGET RANGE</small><strong>{money(q1)} — {money(q3)}</strong><p>The core observed market. A quote inside this band generally requires less justification.</p></article><article><small>ESCALATION THRESHOLD</small><strong>{money(highFence)}</strong><p>Above the standard 1.5×IQR upper fence. Review service differences and source validity before accepting.</p></article><article><small>EVIDENCE BASE</small><strong>{observations.length.toLocaleString()}</strong><p>{result.benchmark?.provenanceFamilyCount || 0} provenance families currently support this decision context.</p></article></div>
    </section>
  );
}

function buildMarkets(observations: FlatObservation[]) {
  const groups = new Map<string, FlatObservation[]>();
  observations.forEach((item) => {
    const label = item.city && item.state ? `${item.city}, ${item.state}` : item.state || item.postalCode || '';
    if (!label) return;
    const key = label.toLowerCase();
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  });
  return [...groups.entries()].map(([key, rows]): MarketStat => {
    const prices = rows.map((item) => item.price).sort((a, b) => a - b);
    const p25 = percentile(prices, .25);
    const p75 = percentile(prices, .75);
    const med = median(prices);
    return {
      key,
      label: rows[0].city && rows[0].state ? `${rows[0].city}, ${rows[0].state}` : rows[0].state || rows[0].postalCode || key,
      city: rows[0].city,
      state: rows[0].state,
      count: rows.length,
      median: med,
      low: prices[0],
      high: prices[prices.length - 1],
      p25,
      p75,
      spreadRatio: med ? (p75 - p25) / med : 0,
      familyCount: new Set(rows.map((item) => item.family)).size,
    };
  }).filter((item) => item.count >= 2 && item.median > 0);
}

function ComparableLens({ result, observations, localResult }: { result: SearchResult; observations: FlatObservation[]; localResult: SearchResult | null }) {
  const markets = useMemo(() => buildMarkets(observations), [observations]);
  const nationalMedian = result.combined.median || 1;
  const anchorMedian = localResult?.combined.median || nationalMedian;
  const anchorCount = localResult?.combined.count || Math.max(1, Math.round(median(markets.map((item) => item.count))));
  const anchorFamilies = localResult?.benchmark?.provenanceFamilyCount || Math.max(1, Math.round(median(markets.map((item) => item.familyCount))));
  const anchorSpread = localResult?.combined.p25 && localResult?.combined.p75 && anchorMedian ? (localResult.combined.p75 - localResult.combined.p25) / anchorMedian : median(markets.map((item) => item.spreadRatio)) || .25;
  const anchorLabel = localResult?.resolvedLocation?.displayName || localResult?.location || 'National reference profile';
  const comparable = useMemo<ComparableMarket[]>(() => markets.map((item) => {
    const priceDistance = Math.abs(item.median - anchorMedian) / Math.max(1, anchorMedian);
    const spreadDistance = Math.abs(item.spreadRatio - anchorSpread) / Math.max(.15, anchorSpread);
    const volumeDistance = Math.abs(Math.log1p(item.count) - Math.log1p(anchorCount)) / 3;
    const familyDistance = Math.abs(item.familyCount - anchorFamilies) / Math.max(2, anchorFamilies);
    const raw = priceDistance * .48 + spreadDistance * .2 + volumeDistance * .18 + familyDistance * .14;
    const similarity = clamp(100 - raw * 100, 0, 100);
    const h = hash(item.key);
    const tone: ComparableMarket['tone'] = item.median < anchorMedian * .9 ? 'lower' : item.median > anchorMedian * 1.1 ? 'higher' : 'similar';
    return { ...item, similarity, angle: h % 360, radius: 18 + (100 - similarity) * .31, tone };
  }).sort((a, b) => b.similarity - a.similarity), [markets, anchorMedian, anchorSpread, anchorCount, anchorFamilies]);
  const stars = comparable.slice(0, 34);
  return (
    <section className="pal-view pal-comparables">
      <div className="pal-space-copy"><span>COMPARABLE MARKETS · {result.procedure.code}</span><h1>Find markets that behave like this one.</h1><p>Distance from the center is similarity, not price. Star size reflects evidence volume. Color shows whether the comparable market runs lower, similar, or higher than the anchor.</p><div><small>ANCHOR PROFILE</small><strong>{anchorLabel}</strong><span>{money(anchorMedian)} median · {anchorCount} observations · {anchorFamilies} evidence families</span></div></div>
      <div className="pal-starfield" aria-label="Comparable market similarity constellation">
        <div className="pal-orbit o1" /><div className="pal-orbit o2" /><div className="pal-orbit o3" />
        <div className="pal-anchor-star"><i /><b>{localResult ? 'TARGET MARKET' : 'REFERENCE'}</b><strong>{money(anchorMedian)}</strong></div>
        {stars.map((item, index) => {
          const radians = (item.angle * Math.PI) / 180;
          const x = 50 + Math.cos(radians) * item.radius;
          const y = 50 + Math.sin(radians) * item.radius * .72;
          const size = clamp(8 + Math.log2(item.count + 1) * 2.2, 10, 25);
          const delay = -((hash(`${item.key}-delay`) % 400) / 100);
          const duration = 1.8 + (hash(`${item.key}-duration`) % 240) / 100;
          const style = { left: `${x}%`, top: `${y}%`, '--star-size': `${size}px`, '--twinkle-delay': `${delay}s`, '--twinkle-duration': `${duration}s` } as CSSProperties;
          return <button key={item.key} type="button" className={`pal-star ${item.tone}`} style={style} title={`${item.label} · ${item.similarity.toFixed(0)}% similar · median ${money(item.median)}`}><i /><span>{item.label}</span><small>{Math.round(item.similarity)}% · {money(item.median)}</small></button>;
        })}
      </div>
      <aside className="pal-comparable-list"><div className="pal-mini-title"><span>CLOSEST ANALOGS</span><small>multi-factor similarity</small></div>{comparable.slice(0, 7).map((item, index) => <article key={item.key}><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{item.label}</strong><small>{item.count} observations · {item.familyCount} evidence families</small></div><span>{Math.round(item.similarity)}%</span><em>{money(item.median)}</em></article>)}</aside>
      <div className="pal-space-legend"><span><i className="lower" /> lower-price analog</span><span><i className="similar" /> similar-price analog</span><span><i className="higher" /> higher-price analog</span></div>
    </section>
  );
}

export default function PriceExperienceLab() {
  const [lens, setLens] = useLensFromUrl();
  const [procedure, setProcedure] = useState(DEFAULT_PROCEDURE);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(50);
  const [nationalResult, setNationalResult] = useState<SearchResult | null>(null);
  const [localResult, setLocalResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<TerrainInspection | null>(null);
  const [quote, setQuote] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLocalResult(null);
    setInspection(null);
    searchPricing(procedure)
      .then((result) => { if (!cancelled) setNationalResult(result); })
      .catch((reason) => { if (!cancelled) { setNationalResult(null); setError(reason instanceof Error ? reason.message : 'Pricing search failed.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [procedure.code]);

  async function runSearch() {
    if (!location.trim()) { setLocalResult(null); setInspection(null); return; }
    setLoading(true);
    setError(null);
    setInspection(null);
    try { setLocalResult(await searchPricing(procedure, location, radius)); }
    catch (reason) { setLocalResult(null); setError(reason instanceof Error ? reason.message : 'Market search failed.'); }
    finally { setLoading(false); }
  }

  const result = localResult && localResult.combined.count > 0 ? localResult : nationalResult;
  const nationalObservations = useMemo<FlatObservation[]>(() => (nationalResult?.sources || []).flatMap((source) => source.observations.map((item) => ({ ...item, sourceName: source.sourceName, family: source.provenanceFamily }))).filter((item) => Number.isFinite(item.price) && item.price > 0), [nationalResult]);
  const localObservations = useMemo<FlatObservation[]>(() => (localResult?.sources || []).flatMap((source) => source.observations.map((item) => ({ ...item, sourceName: source.sourceName, family: source.provenanceFamily }))).filter((item) => Number.isFinite(item.price) && item.price > 0), [localResult]);
  const decisionObservations = localResult && localResult.combined.count > 0 ? localObservations : nationalObservations;
  const baseMedian = nationalResult?.combined.median || 1;
  const terrain = useMemo<TerrainObservation[]>(() => nationalObservations.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).map((item, index) => ({
    id: `${item.sourceId}-${index}-${item.price}`,
    latitude: item.latitude as number,
    longitude: item.longitude as number,
    price: item.price,
    priceIndex: baseMedian ? (item.price / baseMedian) * 100 : 100,
    source: item.sourceName,
    sourceId: item.sourceId,
    provider: item.providerName,
    city: item.city,
    state: item.state,
    postalCode: item.postalCode,
    paymentBasis: item.paymentBasis,
  })), [nationalObservations, baseMedian]);

  return (
    <main className={`pal-root lens-${lens}`}>
      <header className="pal-topbar">
        <div className="pal-brand"><span>OM</span><div><strong>Price Intelligence</strong><small>Network analyst workspace</small></div></div>
        <SearchCommand procedure={procedure} onProcedure={setProcedure} location={location} onLocation={setLocation} radius={radius} onRadius={setRadius} loading={loading} onSearch={runSearch} />
        <a className="pal-classic" href="/vault/classic">Classic ↗</a>
      </header>
      <LensNav lens={lens} onLens={setLens} />
      {error && <div className="pal-error">{error}</div>}
      {loading && !nationalResult ? <div className="pal-loading"><i /><b>Reading the self-pay evidence network</b></div> : result && result.combined.count > 0 ? (
        <div className="pal-stage">
          {lens === 'geography' && <GeographyLens result={result} terrain={terrain} inspection={inspection} onInspect={setInspection} />}
          {lens === 'distribution' && <DistributionLens result={result} observations={decisionObservations} />}
          {lens === 'confidence' && <ConfidenceLens result={result} observations={decisionObservations} />}
          {lens === 'decision' && <DecisionLens result={result} observations={decisionObservations} quote={quote} onQuote={setQuote} usingLocal={Boolean(localResult && localResult.combined.count > 0)} />}
          {lens === 'comparables' && nationalResult && <ComparableLens result={nationalResult} observations={nationalObservations} localResult={localResult && localResult.combined.count > 0 ? localResult : null} />}
        </div>
      ) : <CoverageVoid procedure={procedure} />}
    </main>
  );
}
