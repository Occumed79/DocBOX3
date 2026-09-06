'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PriceMap from './PriceMap';
import { PROCEDURES, searchProcedures, type ProcedureDefinition } from '@/lib/pricing/procedures';
import { PRICING_SOURCES } from '@/lib/pricing/source-registry';

type Section = 'overview' | 'lookup' | 'map' | 'compare' | 'reports' | 'sources';

const NAV: Array<{ id: Section; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'lookup', label: 'Price Lookup' },
  { id: 'map', label: 'Price Map' },
  { id: 'compare', label: 'Compare Quote' },
  { id: 'reports', label: 'Reports' },
  { id: 'sources', label: 'Sources' },
];

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

function SourceBadges() {
  return (
    <div className="pi-source-row">
      {PRICING_SOURCES.slice(0, 3).map((source) => <span key={source.id}>{source.name}</span>)}
      <span>+ {PRICING_SOURCES.length - 3} eligible sources</span>
    </div>
  );
}

export default function PriceIntelligenceApp() {
  const [section, setSection] = useState<Section>('overview');
  const [lookupProcedure, setLookupProcedure] = useState(PROCEDURES[4]);
  const [mapProcedure, setMapProcedure] = useState(PROCEDURES[4]);
  const [compareProcedure, setCompareProcedure] = useState(PROCEDURES[4]);
  const [location, setLocation] = useState('');
  const [quotePrice, setQuotePrice] = useState('');

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
                <span className="pi-tool-index">01</span>
                <div><h2>Lookup</h2><p>Find the observed self-pay market for a procedure in an area.</p></div>
                <b>Open →</b>
              </button>
              <button className="pi-tool-card glass-panel featured" onClick={() => setSection('map')} type="button">
                <span className="pi-tool-index">02</span>
                <div><h2>Price Map</h2><p>Explore pricing geography independently, procedure by procedure.</p></div>
                <b>Explore →</b>
              </button>
              <button className="pi-tool-card glass-panel" onClick={() => setSection('compare')} type="button">
                <span className="pi-tool-index">03</span>
                <div><h2>Compare</h2><p>Measure a quoted fee against the local cash-pay market.</p></div>
                <b>Analyze →</b>
              </button>
              <button className="pi-tool-card glass-panel" onClick={() => setSection('reports')} type="button">
                <span className="pi-tool-index">04</span>
                <div><h2>Reports</h2><p>Turn a comparison into a polished leadership-ready brief.</p></div>
                <b>Review →</b>
              </button>
            </div>
          </div>
        )}

        {section === 'lookup' && (
          <div className="pi-workspace">
            <div className="pi-section-heading">
              <span className="pi-eyebrow">PRICE LOOKUP</span>
              <h1>What does this procedure cost as self-pay?</h1>
              <p>Each source remains visible independently. The app can calculate a market summary only from eligible cash/self-pay records.</p>
            </div>
            <div className="pi-query-card glass-panel">
              <ProcedurePicker value={lookupProcedure} onChange={setLookupProcedure} />
              <label className="pi-field"><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, state or ZIP" /></label>
              <label className="pi-field"><span>Radius</span><select defaultValue="50"><option>25 miles</option><option value="50">50 miles</option><option>75 miles</option><option>100 miles</option></select></label>
              <button className="pi-primary" type="button">Search self-pay market</button>
            </div>
            <div className="pi-source-results">
              {PRICING_SOURCES.slice(0, 6).map((source) => (
                <article className="pi-source-result glass-panel" key={source.id}>
                  <div><span className="pi-source-status">{source.status === 'approved' ? 'CORE' : 'ELIGIBLE'}</span><h3>{source.name}</h3></div>
                  <p>{source.description}</p>
                  <div className="pi-empty-value">Awaiting live adapter</div>
                </article>
              ))}
            </div>
          </div>
        )}

        {section === 'map' && (
          <div className="pi-map-workspace">
            <div className="pi-map-toolbar glass-panel">
              <div>
                <span className="pi-eyebrow">INDEPENDENT EXPLORER</span>
                <h1>Price Map</h1>
              </div>
              <ProcedurePicker value={mapProcedure} onChange={setMapProcedure} />
              <label className="pi-field compact"><span>Source</span><select defaultValue="all"><option value="all">All eligible cash sources</option>{PRICING_SOURCES.map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
              <label className="pi-field compact"><span>Metric</span><select><option>Median cash price</option><option>Price index</option><option>Observed low</option><option>Observed high</option></select></label>
            </div>
            <PriceMap procedure={mapProcedure} />
          </div>
        )}

        {section === 'compare' && (
          <div className="pi-workspace narrow">
            <div className="pi-section-heading">
              <span className="pi-eyebrow">QUOTE ANALYZER</span>
              <h1>Is this provider fee actually high?</h1>
              <p>Enter a quoted cash fee. The comparison engine will benchmark it only against qualifying self-pay observations for the selected market.</p>
            </div>
            <div className="pi-compare-card glass-panel">
              <ProcedurePicker value={compareProcedure} onChange={setCompareProcedure} />
              <label className="pi-field"><span>Provider location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, state or ZIP" /></label>
              <label className="pi-field"><span>Quoted price</span><div className="pi-money-input"><b>$</b><input inputMode="decimal" value={quotePrice} onChange={(event) => setQuotePrice(event.target.value)} placeholder="0.00" /></div></label>
              <button className="pi-primary wide" type="button">Analyze quote</button>
              <div className="pi-integrity-note"><i /> Medicare, Medicaid, insurance-negotiated rates, claims averages, gross charges, and unknown payment bases are excluded.</div>
            </div>
          </div>
        )}

        {section === 'reports' && (
          <div className="pi-workspace narrow">
            <div className="pi-section-heading"><span className="pi-eyebrow">LEADERSHIP BRIEFS</span><h1>Turn the evidence into a decision document.</h1><p>Reports will preserve source-by-source evidence, geographic context, market distribution, methodology, and the provider quote variance without hiding the underlying data.</p></div>
            <div className="pi-report-preview glass-panel">
              <div className="pi-report-paper">
                <span>SELF-PAY PRICING ANALYSIS</span>
                <h2>Provider Pricing Comparison</h2>
                <div className="pi-report-rule" />
                <p>No comparison has been run yet.</p>
                <div className="pi-report-skeleton"><i /><i /><i /></div>
              </div>
              <div className="pi-report-actions"><button className="pi-secondary" type="button" onClick={() => setSection('compare')}>Create from quote analysis</button></div>
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
