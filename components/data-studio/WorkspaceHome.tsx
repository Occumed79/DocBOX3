const workspaces = [
  { href: '/vault/studio', number: '01', title: 'Data Studio', eyebrow: 'Publication', description: 'Clean a workbook, build charts and maps, annotate findings, and assemble a finished report.', action: 'Open studio', tone: 'blue' },
  { href: '/vault/grid', number: '02', title: 'Grid & Pivot', eyebrow: 'Explore', description: 'Work directly in the data with filters, grouping, editable cells, pivots, and drill-down.', action: 'Explore data', tone: 'cyan' },
  { href: '/vault/advanced', number: '03', title: 'Advanced Lab', eyebrow: 'Analyze', description: 'Build distributions, networks, flows, treemaps, timelines, and other specialist visuals.', action: 'Open lab', tone: 'violet' },
  { href: '/vault/spatial', number: '04', title: 'Spatial Lab', eyebrow: 'Map', description: 'Turn coordinates into point, density, flow, contour, grid, and extruded spatial layers.', action: 'Map data', tone: 'coral' },
  { href: '/vault/story', number: '05', title: 'Story Studio', eyebrow: 'Narrate', description: 'Transform spreadsheet rows into a guided, chapter-based analytical narrative.', action: 'Build story', tone: 'gold' },
];

const visualFamilies = [
  ['Bars & columns', 'Compare categories, rankings, ranges, and change'],
  ['Lines & areas', 'Show trends, series, and movement over time'],
  ['Tables', 'Searchable, heatmapped, and mini-chart tables'],
  ['Maps', 'Choropleth, symbol, locator, and spatial layers'],
  ['Relationships', 'Scatter, Sankey, network, and hierarchy views'],
  ['Summary', 'KPI, donut, radial process, and report callouts'],
];

const templates = [
  { title: 'Analyst report', meta: 'Evidence-first pages', layout: 'report' },
  { title: 'Executive brief', meta: 'Leadership summary', layout: 'brief' },
  { title: 'Infographic board', meta: 'Dense visual overview', layout: 'board' },
  { title: 'Data story', meta: 'Narrative chapters', layout: 'story' },
];

function Mark() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 5h13l5 5v17H7z"/><path d="M20 5v6h5M11 16h10M11 21h7"/></svg>;
}

export default function WorkspaceHome() {
  return (
    <div className="wh-app">
      <aside className="wh-sidebar">
        <a className="wh-brand" href="/vault" aria-label="Occu-Med Data Studio home"><span><Mark /></span><strong>Occu-Med<small>Data Studio</small></strong></a>
        <nav aria-label="Primary navigation">
          <a className="active" href="/vault"><i>⌂</i><span>Workspace</span></a>
          <a href="/vault/studio"><i>◫</i><span>Data Studio</span></a>
          <a href="/vault/grid"><i>▦</i><span>Grid & Pivot</span></a>
          <a href="/vault/advanced"><i>⌁</i><span>Advanced Lab</span></a>
          <a href="/vault/spatial"><i>⌖</i><span>Spatial Lab</span></a>
          <a href="/vault/story"><i>¶</i><span>Story Studio</span></a>
        </nav>
        <div className="wh-sidebar-note"><span>WORKFLOW</span><p>Upload once. Clean the data. Explore it from multiple angles. Publish the result.</p></div>
        <a className="wh-site-link" href="/">← Back to DocBOX</a>
      </aside>

      <main className="wh-main">
        <header className="wh-topbar"><div><span>ANALYSIS WORKSPACE</span><h1>Good morning, Analyst.</h1></div><div className="wh-top-actions"><a href="/vault/grid">Open data grid</a><a className="primary" href="/vault/studio">+ New dataset</a></div></header>

        <section className="wh-overview">
          <div><span className="wh-kicker">START A PROJECT</span><h2>Turn a spreadsheet into<br/><em>an answer.</em></h2><p>Choose the workspace that matches the question. Every tool starts from Excel, CSV, or TSV and keeps the analyst in control of the underlying data.</p></div>
          <a href="/vault/studio" className="wh-start-card"><span>PRIMARY WORKFLOW</span><div className="wh-file-icon"><Mark /></div><h3>Upload a dataset</h3><p>Clean columns, create publication-ready visuals, and build a report.</p><b>Choose Excel or CSV <i>→</i></b></a>
        </section>

        <section className="wh-section">
          <header><div><span>WORKSPACES</span><h2>Five tools. One analytical workflow.</h2></div><p>Move from raw rows to exploration, specialist analysis, maps, and narrative without forcing every job into the same editor.</p></header>
          <div className="wh-workspace-grid">{workspaces.map((item) => <a href={item.href} className={`wh-workspace ${item.tone}`} key={item.title}><div><span>{item.number}</span><i>{item.eyebrow}</i></div><h3>{item.title}</h3><p>{item.description}</p><b>{item.action} <i>↗</i></b></a>)}</div>
        </section>

        <div className="wh-lower-grid">
          <section className="wh-section wh-library"><header><div><span>VISUAL LIBRARY</span><h2>Choose by analytical purpose.</h2></div><a href="/vault/studio">View in editor →</a></header><div>{visualFamilies.map(([title, text], index) => <a href="/vault/studio" key={title}><i>{String(index + 1).padStart(2, '0')}</i><span><strong>{title}</strong><small>{text}</small></span><b>→</b></a>)}</div></section>
          <section className="wh-section wh-templates"><header><div><span>REPORT OUTPUTS</span><h2>Start with a page structure.</h2></div></header><div>{templates.map((template) => <a href={template.layout === 'story' ? '/vault/story' : '/vault/studio'} key={template.title}><div className={`wh-template-preview ${template.layout}`}><i/><i/><i/><i/></div><strong>{template.title}</strong><small>{template.meta}</small></a>)}</div></section>
        </div>
      </main>
    </div>
  );
}
