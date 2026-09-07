'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import PriceMap from './PriceMap';
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
  summary: {
    count: number;
    low: number | null;
    median: number | null;
    high: number | null;
    p25: number | null;
    p75: number | null;
  };
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
  resolvedLocation?: {
    displayName: string;
    latitude: number;
    longitude: number;
    city?: string;
    state?: string;
    postalCode?: string;
  } | null;
  sources: SourceResult[];
  combined: {
    count: number;
    low: number | null;
    median: number | null;
    high: number | null;
    p25: number | null;
    p75: number | null;
  };
  benchmark?: {
    provenanceFamilyCount: number;
    familyMedians: Array<{ family: string; median: number; sourceCount: number }>;
    median: number | null;
  };
  map?: { mappableObservationCount: number };
};

type FlatObservation = Observation & { sourceName: string; family: string };

type RegionalStat = {
  key: string;
  label: string;
  median: number;
  low: number;
  high: number;
  count: number;
};

const MODES: Array<{ id: Mode; number: string; name: string; kicker: string }> = [
  { id: 'atlas', number: '01', name: 'Price Atlas', kicker: 'Prices become geography' },
  { id: 'workbench', number: '02', name: 'Spatial Workbench', kicker: 'Map + market evidence' },
  { id: 'canvas', number: '03', name: 'Infinite Canvas', kicker: 'The answer floats over the map' },
  { id: 'surface', number: '04', name: 'Living Surface', kicker: 'Price becomes terrain' },
  { id: 'constellation', number: '05', name: 'Constellation', kicker: 'Markets orbit the benchmark' },
];

const defaultProcedure = PROCEDURES.find((item) => item.code === '93015') || PROCEDURES[0];
const quickCodes = ['93015', '71046', '93000', '94010', '92557', 'D0330', 'D0150'];
const quickProcedures = quickCodes
  .map((code) => PROCEDURES.find((item) => item.code === code))
  .filter(Boolean) as ProcedureDefinition[];

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function compactMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(value)}`;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${Math.round(value)}%`;
}

function familyName(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace('Mrf', 'MRF');
}

function observationPlace(observation: Pick<Observation, 'city' | 'state' | 'postalCode'>) {
  const cityState = [observation.city, observation.state].filter(Boolean).join(', ');
  return cityState || observation.postalCode || 'Location not published';
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

function ProcedurePicker({
  procedure,
  onChange,
}: {
  procedure: ProcedureDefinition;
  onChange: (procedure: ProcedureDefinition) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchProcedures(query).slice(0, 14), [query]);

  return (
    <div className="pel-procedure-picker">
      <button className="pel-control pel-procedure-button" type="button" onClick={() => setOpen((value) => !value)}>
        <span className="pel-code-chip">{procedure.code}</span>
        <span className="pel-procedure-copy">
          <strong>{procedure.name}</strong>
          <small>{procedure.codeSystem} · {procedure.category}</small>
        </span>
        <span className="pel-chevron">⌄</span>
      </button>
      {open && (
        <div className="pel-picker-popover">
          <label>
            <span>Find procedure</span>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="CPT, CDT, HCPCS or name" />
          </label>
          <div className="pel-picker-results">
            {matches.length ? matches.map((item) => (
              <button
                type="button"
                key={`${item.codeSystem}-${item.code}`}
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <b>{item.code}</b>
                <span><strong>{item.name}</strong><small>{item.category}</small></span>
              </button>
            )) : <p>No matching code found.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeRail({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  return (
    <div className="pel-mode-rail" aria-label="Pricing visualization modes">
      {MODES.map((item) => (
        <button
          type="button"
          key={item.id}
          className={mode === item.id ? 'active' : ''}
          onClick={() => onMode(item.id)}
        >
          <span>{item.number}</span>
          <div><strong>{item.name}</strong><small>{item.kicker}</small></div>
        </button>
      ))}
    </div>
  );
}

function SearchDeck({
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
  setProcedure: (procedure: ProcedureDefinition) => void;
  location: string;
  setLocation: (value: string) => void;
  radius: number;
  setRadius: (value: number) => void;
  loading: boolean;
  onSearch: () => void;
}) {
  return (
    <div className="pel-search-deck">
      <ProcedurePicker procedure={procedure} onChange={setProcedure} />
      <label className="pel-location-field">
        <span>Market</span>
        <input
          className="pel-control"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="City, state or ZIP — blank for national"
          onKeyDown={(event) => { if (event.key === 'Enter') onSearch(); }}
        />
      </label>
      <label className="pel-radius-field">
        <span>Radius</span>
        <select className="pel-control" value={radius} onChange={(event) => setRadius(Number(event.target.value))}>
          {[25, 50, 75, 100].map((value) => <option key={value} value={value}>{value} mi</option>)}
        </select>
      </label>
      <button className="pel-search-action" type="button" onClick={onSearch} disabled={loading}>
        <span>{loading ? 'Reading market' : 'Run lookup'}</span><b>↗</b>
      </button>
    </div>
  );
}

function MarketHeadline({ result }: { result: SearchResult }) {
  const location = result.resolvedLocation?.displayName || result.location || 'United States';
  return (
    <div className="pel-market-headline">
      <div>
        <span>MARKET SIGNAL</span>
        <h2>{result.procedure.name}</h2>
        <p>{result.procedure.codeSystem} {result.procedure.code} · {location}</p>
      </div>
      <div className="pel-market-number">
        <small>Observed market median</small>
        <strong>{money(result.combined.median)}</strong>
        <span>{result.combined.count} qualifying cash observations</span>
      </div>
    </div>
  );
}

function StatStrip({ result }: { result: SearchResult }) {
  const spread = result.combined.low && result.combined.high
    ? ((result.combined.high - result.combined.low) / result.combined.low) * 100
    : null;
  return (
    <div className="pel-stat-strip">
      <div><span>Low</span><strong>{money(result.combined.low)}</strong></div>
      <div><span>P25</span><strong>{money(result.combined.p25)}</strong></div>
      <div className="primary"><span>Median</span><strong>{money(result.combined.median)}</strong></div>
      <div><span>P75</span><strong>{money(result.combined.p75)}</strong></div>
      <div><span>High</span><strong>{money(result.combined.high)}</strong></div>
      <div><span>Spread</span><strong>{spread === null ? '—' : `${Math.round(spread)}%`}</strong></div>
    </div>
  );
}

function ObservationCard({ observation, benchmark }: { observation: FlatObservation; benchmark: number | null }) {
  const variance = benchmark ? ((observation.price - benchmark) / benchmark) * 100 : null;
  return (
    <article className="pel-observation-card">
      <div className="pel-observation-price"><strong>{money(observation.price)}</strong><small>{variance === null ? 'cash price' : `${percent(variance)} vs market`}</small></div>
      <div className="pel-observation-copy">
        <strong>{observation.providerName || observation.sourceName}</strong>
        <span>{observationPlace(observation)}</span>
        <small>{observation.sourceName} · {observation.paymentBasis.replaceAll('_', ' ')}</small>
      </div>
      {observation.sourceUrl ? <a href={observation.sourceUrl} target="_blank" rel="noreferrer" aria-label="Open price source">↗</a> : <span className="pel-no-link">•</span>}
    </article>
  );
}

function PriceAtlas({ result, observations }: { result: SearchResult; observations: FlatObservation[] }) {
  const sorted = [...observations].sort((a, b) => a.price - b.price).slice(0, 8);
  const mapObservations = observations
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .map((item, index) => ({
      id: `${item.sourceId}-${index}`,
      latitude: item.latitude as number,
      longitude: item.longitude as number,
      price: item.price,
      priceIndex: result.combined.median ? (item.price / result.combined.median) * 100 : 100,
      source: item.sourceName,
      provider: item.providerName,
      city: item.city,
      state: item.state,
    }));

  return (
    <section className="pel-view pel-atlas-view">
      <MarketHeadline result={result} />
      <div className="pel-atlas-grid">
        <div className="pel-map-frame pel-atlas-map">
          <PriceMap procedure={result.procedure} observations={mapObservations} metric="cash" />
          <div className="pel-map-floating-copy">
            <span>PRICE ATLAS</span>
            <strong>{mapObservations.length}</strong>
            <small>geocoded cash observations</small>
          </div>
        </div>
        <aside className="pel-atlas-sidebar">
          <div className="pel-section-title"><div><span>LOWEST OBSERVED</span><h3>Prices on the ground</h3></div><small>Price is the marker</small></div>
          <div className="pel-observation-stack">
            {sorted.length ? sorted.map((item, index) => <ObservationCard key={`${item.sourceId}-${index}`} observation={item} benchmark={result.combined.median} />) : <p className="pel-empty-copy">No qualifying observations returned.</p>}
          </div>
        </aside>
      </div>
      <StatStrip result={result} />
    </section>
  );
}

function Distribution({ observations, low, high }: { observations: FlatObservation[]; low: number | null; high: number | null }) {
  const buckets = useMemo(() => {
    if (!observations.length || low === null || high === null) return [];
    const bucketCount = 12;
    const range = Math.max(1, high - low);
    const values = Array.from({ length: bucketCount }, (_, index) => ({
      min: low + (range * index) / bucketCount,
      max: low + (range * (index + 1)) / bucketCount,
      count: 0,
    }));
    observations.forEach((item) => {
      const raw = Math.floor(((item.price - low) / range) * bucketCount);
      const index = Math.min(bucketCount - 1, Math.max(0, raw));
      values[index].count += 1;
    });
    return values;
  }, [observations, low, high]);
  const max = Math.max(1, ...buckets.map((item) => item.count));

  return (
    <div className="pel-distribution">
      <div className="pel-mini-head"><span>PRICE DISTRIBUTION</span><small>{observations.length} records</small></div>
      <div className="pel-histogram" aria-label="Observed cash price distribution">
        {buckets.map((bucket, index) => (
          <div key={index} className="pel-histogram-column">
            <span style={{ height: `${Math.max(4, (bucket.count / max) * 100)}%` }} />
            <small>{index === 0 || index === buckets.length - 1 ? compactMoney(index === 0 ? bucket.min : bucket.max) : ''}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpatialWorkbench({ result, observations }: { result: SearchResult; observations: FlatObservation[] }) {
  const mapObservations = observations
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .map((item, index) => ({
      id: `${item.sourceId}-${index}`,
      latitude: item.latitude as number,
      longitude: item.longitude as number,
      price: item.price,
      priceIndex: result.combined.median ? (item.price / result.combined.median) * 100 : 100,
      source: item.sourceName,
      provider: item.providerName,
      city: item.city,
      state: item.state,
    }));
  const families = result.benchmark?.familyMedians || [];
  const liveSources = result.sources.filter((source) => source.status === 'ok');

  return (
    <section className="pel-view pel-workbench-view">
      <MarketHeadline result={result} />
      <div className="pel-workbench-grid">
        <div className="pel-workbench-map pel-map-frame">
          <PriceMap procedure={result.procedure} observations={mapObservations} metric="index" />
        </div>
        <div className="pel-workbench-insights">
          <div className="pel-workbench-card pel-workbench-median">
            <span>MARKET MEDIAN</span><strong>{money(result.combined.median)}</strong><small>Balanced across {result.benchmark?.provenanceFamilyCount || 0} evidence families</small>
          </div>
          <div className="pel-workbench-card">
            <Distribution observations={observations} low={result.combined.low} high={result.combined.high} />
          </div>
          <div className="pel-workbench-card pel-family-card">
            <div className="pel-mini-head"><span>EVIDENCE FAMILIES</span><small>{families.length}</small></div>
            <div className="pel-family-list">
              {families.slice(0, 7).map((family) => (
                <div key={family.family}><span>{familyName(family.family)}</span><strong>{money(family.median)}</strong><small>{family.sourceCount} source{family.sourceCount === 1 ? '' : 's'}</small></div>
              ))}
            </div>
          </div>
        </div>
        <div className="pel-source-matrix">
          <div className="pel-section-title"><div><span>PROVENANCE MATRIX</span><h3>What the benchmark is made of</h3></div><small>{liveSources.length} live source results</small></div>
          <div className="pel-source-table">
            <div className="head"><span>Source</span><span>Family</span><span>Median</span><span>Records</span><span>Role</span></div>
            {liveSources.slice(0, 12).map((source) => (
              <div key={source.sourceId}>
                <span><strong>{source.sourceName}</strong><small>{source.evidenceReason || source.sourceScope || 'Verified cash evidence'}</small></span>
                <span>{familyName(source.provenanceFamily)}</span>
                <span>{money(source.summary.median)}</span>
                <span>{source.summary.count}</span>
                <span><b className={source.headlineEligible === false ? 'supporting' : 'headline'}>{source.headlineEligible === false ? 'supporting' : 'benchmark'}</b></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function InfiniteCanvas({ result, observations }: { result: SearchResult; observations: FlatObservation[] }) {
  const mapObservations = observations
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .map((item, index) => ({
      id: `${item.sourceId}-${index}`,
      latitude: item.latitude as number,
      longitude: item.longitude as number,
      price: item.price,
      priceIndex: result.combined.median ? (item.price / result.combined.median) * 100 : 100,
      source: item.sourceName,
      provider: item.providerName,
      city: item.city,
      state: item.state,
    }));
  const cheapest = [...observations].sort((a, b) => a.price - b.price)[0];
  const highest = [...observations].sort((a, b) => b.price - a.price)[0];

  return (
    <section className="pel-view pel-canvas-view">
      <div className="pel-canvas-map pel-map-frame">
        <PriceMap procedure={result.procedure} observations={mapObservations} metric="cash" />
      </div>
      <div className="pel-canvas-vignette" />
      <div className="pel-canvas-title pel-glass-float">
        <span>INFINITE DATA CANVAS</span>
        <h2>{result.procedure.name}</h2>
        <p>{result.resolvedLocation?.displayName || result.location || 'National cash-price field'}</p>
      </div>
      <div className="pel-canvas-answer pel-glass-float">
        <small>MARKET MEDIAN</small><strong>{money(result.combined.median)}</strong><span>{result.combined.count} observations · {result.benchmark?.provenanceFamilyCount || 0} evidence families</span>
      </div>
      <div className="pel-canvas-range pel-glass-float">
        <div><small>LOW</small><strong>{money(result.combined.low)}</strong></div>
        <i />
        <div><small>HIGH</small><strong>{money(result.combined.high)}</strong></div>
      </div>
      {cheapest && (
        <div className="pel-canvas-pin pel-canvas-pin-low pel-glass-float">
          <span>LOWEST SIGNAL</span><strong>{money(cheapest.price)}</strong><small>{observationPlace(cheapest)} · {cheapest.providerName || cheapest.sourceName}</small>
        </div>
      )}
      {highest && (
        <div className="pel-canvas-pin pel-canvas-pin-high pel-glass-float">
          <span>UPPER SIGNAL</span><strong>{money(highest.price)}</strong><small>{observationPlace(highest)} · {highest.providerName || highest.sourceName}</small>
        </div>
      )}
      <div className="pel-canvas-help"><span>Move through the map. The UI stays out of the way.</span></div>
    </section>
  );
}

function buildRegionalStats(observations: FlatObservation[]): RegionalStat[] {
  const grouped = new Map<string, FlatObservation[]>();
  observations.forEach((item) => {
    const label = observationPlace(item);
    if (label === 'Location not published') return;
    const existing = grouped.get(label) || [];
    existing.push(item);
    grouped.set(label, existing);
  });
  return [...grouped.entries()]
    .map(([label, items]) => {
      const prices = items.map((item) => item.price).filter((price) => Number.isFinite(price));
      return {
        key: label,
        label,
        median: median(prices),
        low: Math.min(...prices),
        high: Math.max(...prices),
        count: prices.length,
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => a.median - b.median)
    .slice(0, 36);
}

function LivingSurface({ result, observations }: { result: SearchResult; observations: FlatObservation[] }) {
  const regions = useMemo(() => buildRegionalStats(observations), [observations]);
  const low = regions.length ? Math.min(...regions.map((item) => item.median)) : 0;
  const high = regions.length ? Math.max(...regions.map((item) => item.median)) : 1;
  const range = Math.max(1, high - low);
  const visible = regions.length ? regions : [{ key: 'empty', label: 'No mapped markets', median: 0, low: 0, high: 0, count: 0 }];

  return (
    <section className="pel-view pel-surface-view">
      <div className="pel-surface-copy">
        <span>THE MARKET AS TOPOGRAPHY</span>
        <h2>Price is not a table.<br />It is a landscape.</h2>
        <p>Each pillar is a local cash-price signal. Height represents the regional median, so expensive markets rise and cheaper markets recede.</p>
        <div className="pel-surface-hero-stat"><small>National / selected-market median</small><strong>{money(result.combined.median)}</strong><span>{regions.length} local markets resolved from {observations.length} observations</span></div>
      </div>
      <div className="pel-surface-stage" aria-label="Three dimensional cash price surface">
        <div className="pel-surface-grid-plane" />
        <div className="pel-surface-columns">
          {visible.map((region, index) => {
            const normalized = region.count ? (region.median - low) / range : 0.05;
            const height = 26 + normalized * 190;
            const intensity = Math.round(normalized * 100);
            return (
              <div
                key={`${region.key}-${index}`}
                className="pel-surface-cell"
                style={{ '--pel-column-height': `${height}px`, '--pel-intensity': `${intensity}%` } as CSSProperties}
                title={`${region.label}: ${money(region.median)}`}
              >
                <div className="pel-surface-prism"><i /><b /><em /></div>
              </div>
            );
          })}
        </div>
        <div className="pel-surface-horizon" />
      </div>
      <div className="pel-surface-market-list">
        <div className="pel-mini-head"><span>LOCAL MARKET SIGNALS</span><small>lowest → highest</small></div>
        <div>
          {regions.slice(0, 10).map((region) => (
            <article key={region.key}><span>{region.label}</span><strong>{money(region.median)}</strong><small>{region.count} obs.</small></article>
          ))}
        </div>
      </div>
      <div className="pel-surface-scale"><span>{money(low)}</span><i /><span>{money(high)}</span></div>
    </section>
  );
}

function Constellation({ result, observations }: { result: SearchResult; observations: FlatObservation[] }) {
  const regions = useMemo(() => buildRegionalStats(observations).slice(0, 24), [observations]);
  const [selected, setSelected] = useState<RegionalStat | null>(null);
  const benchmark = result.combined.median || 1;
  const points = useMemo(() => {
    const golden = Math.PI * (3 - Math.sqrt(5));
    return regions.map((region, index) => {
      const variance = ((region.median - benchmark) / benchmark) * 100;
      const angle = index * golden - Math.PI / 2;
      const radius = 132 + Math.min(175, Math.abs(variance) * 2.2) + (index % 4) * 22;
      return {
        ...region,
        variance,
        x: 500 + Math.cos(angle) * radius,
        y: 320 + Math.sin(angle) * radius * 0.78,
        r: 15 + Math.min(22, Math.sqrt(region.count) * 5),
      };
    });
  }, [benchmark, regions]);

  return (
    <section className="pel-view pel-constellation-view">
      <div className="pel-constellation-copy">
        <span>PRICE CONSTELLATION</span>
        <h2>One benchmark.<br />Many market orbits.</h2>
        <p>Distance from the center represents deviation from the selected benchmark. Market size reflects evidence volume. Select a market to inspect it.</p>
      </div>
      <div className="pel-constellation-stage">
        <svg viewBox="0 0 1000 640" role="img" aria-label={`Price constellation for ${result.procedure.name}`}>
          <defs>
            <radialGradient id="pel-center-glow"><stop offset="0%" stopColor="rgba(255,255,255,.92)" /><stop offset="100%" stopColor="rgba(142,205,255,.08)" /></radialGradient>
          </defs>
          {[150, 240, 330].map((radius) => <ellipse key={radius} cx="500" cy="320" rx={radius} ry={radius * 0.78} className="pel-orbit" />)}
          {points.map((point) => (
            <g key={point.key} className="pel-star-group" onClick={() => setSelected(point)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') setSelected(point); }}>
              <line x1="500" y1="320" x2={point.x} y2={point.y} className="pel-star-line" />
              <circle cx={point.x} cy={point.y} r={point.r + 10} className="pel-star-halo" />
              <circle cx={point.x} cy={point.y} r={point.r} className={point.variance <= 0 ? 'pel-star below' : 'pel-star above'} />
              <text x={point.x} y={point.y - point.r - 12} textAnchor="middle" className="pel-star-price">{compactMoney(point.median)}</text>
              <text x={point.x} y={point.y + 4} textAnchor="middle" className="pel-star-count">{point.count}</text>
            </g>
          ))}
          <circle cx="500" cy="320" r="92" fill="url(#pel-center-glow)" className="pel-center-halo" />
          <circle cx="500" cy="320" r="58" className="pel-center-star" />
          <text x="500" y="307" textAnchor="middle" className="pel-center-label">MARKET</text>
          <text x="500" y="339" textAnchor="middle" className="pel-center-price">{compactMoney(result.combined.median)}</text>
        </svg>
        <div className="pel-constellation-legend"><span><i className="below" />At / below benchmark</span><span><i className="above" />Above benchmark</span><span>distance = deviation</span></div>
      </div>
      <aside className={`pel-constellation-inspector ${selected ? 'active' : ''}`}>
        {selected ? (
          <>
            <button type="button" onClick={() => setSelected(null)}>×</button>
            <span>SELECTED MARKET</span>
            <h3>{selected.label}</h3>
            <strong>{money(selected.median)}</strong>
            <div><small>vs benchmark</small><b>{percent(((selected.median - benchmark) / benchmark) * 100)}</b></div>
            <div><small>observations</small><b>{selected.count}</b></div>
            <div><small>observed range</small><b>{money(selected.low)}–{money(selected.high)}</b></div>
          </>
        ) : (
          <><span>MARKET INSPECTOR</span><h3>Select any orbit</h3><p>Every point is a local cash-price market derived from the active result set.</p></>
        )}
      </aside>
    </section>
  );
}

function EmptyExperience({ procedure, onProcedure }: { procedure: ProcedureDefinition; onProcedure: (procedure: ProcedureDefinition) => void }) {
  return (
    <section className="pel-empty-experience">
      <div className="pel-empty-orbit pel-empty-orbit-one" />
      <div className="pel-empty-orbit pel-empty-orbit-two" />
      <div className="pel-empty-core" />
      <div className="pel-empty-copy-block">
        <span>READY FOR A MARKET</span>
        <h2>Search once.<br />See the price five ways.</h2>
        <p>Every mode uses the same qualifying self-pay evidence. Only the visual language changes.</p>
        <div className="pel-quick-procedures">
          {quickProcedures.map((item) => (
            <button type="button" key={item.code} className={item.code === procedure.code ? 'active' : ''} onClick={() => onProcedure(item)}>
              <b>{item.code}</b><span>{item.name}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PriceExperienceLab() {
  const [mode, setMode] = useState<Mode>('atlas');
  const [procedure, setProcedure] = useState(defaultProcedure);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(50);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialMode = params.get('mode') as Mode | null;
    if (initialMode && MODES.some((item) => item.id === initialMode)) setMode(initialMode);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('mode', mode);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, select, textarea, [contenteditable="true"]')) return;
      const found = MODES.find((item) => item.number === `0${event.key}`);
      if (found) setMode(found.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchPricing(defaultProcedure)
      .then((payload) => { if (!cancelled) setResult(payload); })
      .catch(() => { if (!cancelled) setResult(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      setResult(await searchPricing(procedure, location, radius));
    } catch (searchError) {
      setResult(null);
      setError(searchError instanceof Error ? searchError.message : 'Price search failed.');
    } finally {
      setLoading(false);
    }
  }

  const observations = useMemo<FlatObservation[]>(() => {
    if (!result) return [];
    return result.sources.flatMap((source) => source.observations.map((observation) => ({
      ...observation,
      sourceName: source.sourceName,
      family: source.provenanceFamily,
    }))).filter((item) => Number.isFinite(item.price) && item.price > 0);
  }, [result]);

  const activeMode = MODES.find((item) => item.id === mode) || MODES[0];

  return (
    <main className={`pel-app pel-mode-${mode}`}>
      <div className="pel-ambient pel-ambient-a" />
      <div className="pel-ambient pel-ambient-b" />
      <header className="pel-header">
        <a className="pel-brand" href="/" aria-label="Back to landing page">
          <span className="pel-brand-mark">OM</span>
          <span><strong>Price Intelligence</strong><small>Self-pay market explorer</small></span>
        </a>
        <div className="pel-header-mode"><span>{activeMode.number}</span><strong>{activeMode.name}</strong><small>{activeMode.kicker}</small></div>
        <div className="pel-header-actions"><a href="/vault/classic">Classic</a><span className="pel-live-dot"><i />live evidence</span></div>
      </header>

      <div className="pel-shell">
        <aside className="pel-left-rail">
          <div className="pel-rail-label"><span>VIEW SYSTEM</span><small>keys 1–5</small></div>
          <ModeRail mode={mode} onMode={setMode} />
          <div className="pel-rail-note"><span>ONE QUERY</span><p>All five modes render the exact same result set. Switching views never changes the benchmark.</p></div>
        </aside>

        <div className="pel-main-column">
          <div className="pel-top-deck">
            <SearchDeck
              procedure={procedure}
              setProcedure={setProcedure}
              location={location}
              setLocation={setLocation}
              radius={radius}
              setRadius={setRadius}
              loading={loading}
              onSearch={runSearch}
            />
            {error && <div className="pel-error">{error}</div>}
          </div>

          <div className="pel-experience-stage">
            {loading && !result ? (
              <div className="pel-loading"><div /><span>Reading live cash-price evidence</span></div>
            ) : result ? (
              <>
                {mode === 'atlas' && <PriceAtlas result={result} observations={observations} />}
                {mode === 'workbench' && <SpatialWorkbench result={result} observations={observations} />}
                {mode === 'canvas' && <InfiniteCanvas result={result} observations={observations} />}
                {mode === 'surface' && <LivingSurface result={result} observations={observations} />}
                {mode === 'constellation' && <Constellation result={result} observations={observations} />}
              </>
            ) : <EmptyExperience procedure={procedure} onProcedure={setProcedure} />}
          </div>
        </div>
      </div>
    </main>
  );
}
