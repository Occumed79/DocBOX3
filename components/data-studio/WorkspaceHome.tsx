const workspaces = [
  { href: '/vault/studio', code: '01', title: 'Data Studio', detail: 'Clean data, author charts, annotate, publish.', accent: 'blue' },
  { href: '/vault/grid', code: '02', title: 'Grid & Pivot', detail: 'Filter, group, edit, pivot, and drill down.', accent: 'cyan' },
  { href: '/vault/advanced', code: '03', title: 'Advanced Lab', detail: 'Networks, flows, distributions, hierarchy.', accent: 'violet' },
  { href: '/vault/spatial', code: '04', title: 'Spatial Lab', detail: 'Density, arcs, grids, contours, trips.', accent: 'coral' },
  { href: '/vault/story', code: '05', title: 'Story Studio', detail: 'Build guided narrative analysis from rows.', accent: 'gold' },
];

const visuals = [
  { href: '/vault/studio', title: 'Bar', meta: 'Compare · rank', kind: 'bars' },
  { href: '/vault/studio', title: 'Column', meta: 'Compare over time', kind: 'column' },
  { href: '/vault/studio', title: 'Line', meta: 'Trend · change', kind: 'trend' },
  { href: '/vault/studio', title: 'Area', meta: 'Volume over time', kind: 'area' },
  { href: '/vault/studio', title: 'Dot plot', meta: 'Precise comparison', kind: 'dots' },
  { href: '/vault/studio', title: 'Scatter', meta: 'Relationship', kind: 'scatter' },
  { href: '/vault/studio', title: 'Donut', meta: 'Part to whole', kind: 'donut' },
  { href: '/vault/studio', title: 'Heat table', meta: 'Pattern in detail', kind: 'table' },
  { href: '/vault/spatial', title: 'Choropleth', meta: 'Regional pattern', kind: 'map' },
  { href: '/vault/advanced', title: 'Sankey', meta: 'Weighted flow', kind: 'flow' },
  { href: '/vault/advanced', title: 'Network', meta: 'Connected systems', kind: 'network' },
  { href: '/vault/advanced', title: 'Treemap', meta: 'Nested composition', kind: 'treemap' },
  { href: '/vault/advanced', title: 'Timeline', meta: 'Events in sequence', kind: 'timeline' },
];

const templates = [
  { href: '/vault/studio', title: 'Analyst report', meta: 'Evidence-first pages', kind: 'report' },
  { href: '/vault/studio', title: 'Executive brief', meta: 'Compact leadership view', kind: 'brief' },
  { href: '/vault/studio', title: 'Visual board', meta: 'Dense dashboard canvas', kind: 'board' },
  { href: '/vault/story', title: 'Data story', meta: 'Narrative chapters', kind: 'story' },
];

function SpreadsheetPreview() {
  return (
    <div className="wh-sheet-preview" aria-hidden="true">
      <div className="wh-sheet-grid">
        <div className="head">Department</div><div className="head">Claims</div><div className="head">Cost</div>
        <div>Operations</div><div>138</div><div>$412k</div>
        <div>Field</div><div>94</div><div>$286k</div>
        <div>Support</div><div>61</div><div>$129k</div>
        <div>Admin</div><div>37</div><div>$71k</div>
      </div>
      <div className="wh-sheet-chart">
        <div className="axis" />
        <i style={{ height: '78%' }} /><i style={{ height: '57%' }} /><i style={{ height: '38%' }} /><i style={{ height: '23%' }} />
      </div>
    </div>
  );
}

function VisualPreview({ kind }: { kind: string }) {
  if (kind === 'column') return <div className="wh-bars columns" aria-hidden="true"><i style={{height:'34%'}}/><i style={{height:'65%'}}/><i style={{height:'82%'}}/><i style={{height:'48%'}}/><i style={{height:'71%'}}/></div>;
  if (kind === 'trend') return <svg className="wh-viz-svg" viewBox="0 0 160 88" aria-hidden="true"><path className="grid" d="M8 18h144M8 44h144M8 70h144"/><path className="line-a" d="M8 66C26 60 31 48 47 52S69 26 88 35s25-4 36-13 18 8 28 3"/><path className="line-b" d="M8 72c17-5 27-4 38-14s24 8 39 2 22-18 36-13 18 7 31-2"/></svg>;
  if (kind === 'area') return <svg className="wh-viz-svg" viewBox="0 0 160 88" aria-hidden="true"><path className="grid" d="M8 18h144M8 44h144M8 70h144"/><path className="area-fill" d="M8 72V61L32 52l24 8 25-31 25 13 23-24 23 11v43Z"/><path className="line-a" d="M8 61l24-9 24 8 25-31 25 13 23-24 23 11"/></svg>;
  if (kind === 'dots') return <svg className="wh-viz-svg dots" viewBox="0 0 160 88" aria-hidden="true"><path className="grid" d="M24 15v60M65 15v60M106 15v60M147 15v60"/>{[25,43,59,73].map((y,i)=><g key={y}><line x1="24" x2="147" y1={y} y2={y}/><circle cx={[112,73,132,54][i]} cy={y} r="5"/></g>)}</svg>;
  if (kind === 'donut') return <div className="wh-donut" aria-hidden="true"><i/><span/><b/></div>;
  if (kind === 'scatter') return <div className="wh-scatter" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>;
  if (kind === 'map') return <div className="wh-map-preview" aria-hidden="true"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div>;
  if (kind === 'flow') return <svg className="wh-viz-svg flow" viewBox="0 0 160 88" aria-hidden="true"><path d="M16 18C55 18 50 34 82 34s27-18 62-18"/><path d="M16 44c38 0 40-4 66-4s30 25 62 25"/><path d="M16 68c32 0 37-21 66-21s31-4 62-4"/><circle cx="16" cy="18" r="5"/><circle cx="16" cy="44" r="5"/><circle cx="16" cy="68" r="5"/><circle cx="82" cy="34" r="6"/><circle cx="82" cy="47" r="6"/><circle cx="144" cy="16" r="5"/><circle cx="144" cy="43" r="5"/><circle cx="144" cy="65" r="5"/></svg>;
  if (kind === 'network') return <svg className="wh-viz-svg network" viewBox="0 0 160 88" aria-hidden="true"><path d="M25 22L65 16 91 42 134 20M65 16l-8 48 34-22 41 25M57 64l75 3M91 42l43-22"/>{[[25,22],[65,16],[91,42],[134,20],[57,64],[132,67]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===2?7:5}/>)}</svg>;
  if (kind === 'treemap') return <div className="wh-treemap" aria-hidden="true"><i/><i/><i/><i/><i/></div>;
  if (kind === 'timeline') return <div className="wh-timeline" aria-hidden="true"><span/><i/><i/><i/><i/></div>;
  if (kind === 'table') return <div className="wh-table-preview" aria-hidden="true"><b/><b/><b/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>;
  return <div className="wh-bars" aria-hidden="true"><i style={{ height: '46%' }}/><i style={{ height: '72%' }}/><i style={{ height: '54%' }}/><i style={{ height: '88%' }}/><i style={{ height: '66%' }}/><i style={{ height: '34%' }}/></div>;
}

function TemplatePreview({ kind }: { kind: string }) {
  return <div className={`wh-template ${kind}`} aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>;
}

export default function WorkspaceHome() {
  return (
    <main className="wh-home">
      <header className="wh-commandbar">
        <div>
          <span>WORKSPACE</span>
          <h1>Analysis desk</h1>
          <p>Choose the tool that matches the question, not the other way around.</p>
        </div>
        <div className="wh-command-actions">
          <a href="/vault/grid">Open grid</a>
          <a className="primary" href="/vault/studio">New dataset</a>
        </div>
      </header>

      <section className="wh-start-grid">
        <a className="wh-dataset-launch" href="/vault/studio">
          <div className="wh-panel-heading">
            <span>START WITH DATA</span>
            <b>Excel · CSV · TSV</b>
          </div>
          <div className="wh-launch-copy">
            <div>
              <h2>Open a workbook and keep the data in view.</h2>
              <p>Clean columns, inspect rows, then move directly into visualization and reporting.</p>
            </div>
            <strong>Choose dataset <i>→</i></strong>
          </div>
          <SpreadsheetPreview />
        </a>

        <section className="wh-workspace-panel">
          <div className="wh-panel-heading"><span>SPECIALIST WORKSPACES</span><b>5 tools</b></div>
          <div className="wh-workspace-list">
            {workspaces.map((item) => (
              <a key={item.href} href={item.href} className={item.accent}>
                <i>{item.code}</i>
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                <b>↗</b>
              </a>
            ))}
          </div>
        </section>
      </section>

      <section className="wh-visual-section">
        <header className="wh-section-heading">
          <div><span>VISUAL LIBRARY</span><h2>Pick by analytical purpose.</h2></div>
          <p>The preview is the selector. Open the editor only after you know what kind of question you are answering.</p>
        </header>
        <div className="wh-visual-grid">
          {visuals.map((item) => (
            <a href={item.href} key={item.title} className={`wh-visual-card ${item.kind}`}>
              <div className="wh-preview-stage"><VisualPreview kind={item.kind}/></div>
              <div><strong>{item.title}</strong><small>{item.meta}</small><b>Open <i>↗</i></b></div>
            </a>
          ))}
        </div>
      </section>

      <section className="wh-output-section">
        <header className="wh-section-heading compact">
          <div><span>REPORT OUTPUT</span><h2>Assemble the answer.</h2></div>
          <p>Move from a single chart to a designed page, board, brief, or narrative.</p>
        </header>
        <div className="wh-template-grid">
          {templates.map((item) => (
            <a href={item.href} key={item.title}>
              <TemplatePreview kind={item.kind}/>
              <span><strong>{item.title}</strong><small>{item.meta}</small></span>
              <b>→</b>
            </a>
          ))}
        </div>
      </section>

      <footer className="wh-flowbar">
        <span>DATA</span><i>→</i><span>EXPLORE</span><i>→</i><span>VISUALIZE</span><i>→</i><span>SPATIAL / ADVANCED</span><i>→</i><span>REPORT / STORY</span>
      </footer>
    </main>
  );
}
