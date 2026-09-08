'use client';

const WORKSPACES = [
  { href: '/vault/studio', icon: '▦', title: 'Data Studio', eyebrow: 'Build & publish', text: 'Clean a workbook, choose a chart or map, annotate findings, and assemble report pages.', meta: '25+ visual formats' },
  { href: '/vault/grid', icon: '⊞', title: 'Grid & Pivot', eyebrow: 'Explore & reshape', text: 'Edit cells and headers, filter, group, pivot, drill into source rows, and export clean data.', meta: 'Native pivot engine' },
  { href: '/vault/advanced', icon: '⌁', title: 'Advanced Visuals', eyebrow: 'Analyze relationships', text: 'Histograms, box plots, beeswarms, treemaps, networks, Sankey flows, timelines and more.', meta: '11 specialist views' },
  { href: '/vault/spatial', icon: '⌖', title: 'Spatial Lab', eyebrow: 'Map & aggregate', text: 'Points, hexagons, grids, heat surfaces, contours, extrusions, arcs and animated trips.', meta: '8 spatial layers' },
  { href: '/vault/story', icon: '▤', title: 'Story Studio', eyebrow: 'Explain the finding', text: 'Turn rows into narrative chapters with a persistent visual or map context beside the story.', meta: 'Scrollytelling reports' },
];

const VISUALS = [
  { glyph: '▥', title: 'Bars & columns', note: 'Standard, split, stacked, bullet, grouped' },
  { glyph: '⌁', title: 'Lines & areas', note: 'Single, multiple, area, dual-axis' },
  { glyph: '•••', title: 'Plots', note: 'Dot, range, arrow, scatter, beeswarm' },
  { glyph: '◉', title: 'Shares', note: 'Pie, donut, multiple pies and donuts' },
  { glyph: '⌖', title: 'Maps', note: 'Locator, choropleth, symbols, spatial layers' },
  { glyph: '▦', title: 'Tables', note: 'Standard, heatmap, mini-chart, pivot' },
];

const REPORTS = [
  { title: 'Analyst report', note: 'Sequential evidence-first report pages', swatch: 'report-classic' },
  { title: 'Infographic board', note: 'Dense visual tiles and summary callouts', swatch: 'report-board' },
  { title: 'Process page', note: 'Hero visual with supporting process notes', swatch: 'report-process' },
  { title: 'Executive brief', note: 'Compact leadership-ready summary', swatch: 'report-exec' },
];

export default function StudioDashboard() {
  return (
    <main className="studio-home">
      <aside className="studio-home-sidebar">
        <div className="studio-home-brand">
          <div className="studio-home-mark">OM</div>
          <div><strong>Data Studio</strong><span>Occu-Med Analytics</span></div>
        </div>
        <nav>
          <a className="active" href="/vault"><span>⌂</span><div><strong>Workspace</strong><small>Home & launchpad</small></div></a>
          <a href="/vault/studio"><span>▦</span><div><strong>Data Studio</strong><small>Build visual reports</small></div></a>
          <a href="/vault/grid"><span>⊞</span><div><strong>Grid & Pivot</strong><small>Explore spreadsheets</small></div></a>
          <a href="/vault/advanced"><span>⌁</span><div><strong>Advanced</strong><small>Specialist analysis</small></div></a>
          <a href="/vault/spatial"><span>⌖</span><div><strong>Spatial</strong><small>Geographic analysis</small></div></a>
          <a href="/vault/story"><span>▤</span><div><strong>Story</strong><small>Narrative reports</small></div></a>
        </nav>
        <div className="studio-home-sidebar-note"><span>WORKFLOW</span><p>Upload once inside the workspace you want. Every tool uses the same Excel/CSV parser and editable schema model.</p></div>
      </aside>

      <section className="studio-home-main">
        <header className="studio-home-header">
          <div><span>OCCU-MED DATA STUDIO</span><h1>Workspace</h1><p>Choose what you need to do with the dataset.</p></div>
          <a className="studio-home-primary" href="/vault/studio">＋ New analysis</a>
        </header>

        <section className="studio-home-metrics">
          <article><span>Visualization library</span><strong>25+</strong><small>publication-ready formats</small></article>
          <article><span>Analyst workspaces</span><strong>5</strong><small>distinct analysis workflows</small></article>
          <article><span>Report layouts</span><strong>4</strong><small>analyst to executive</small></article>
          <article><span>Input</span><strong>Excel</strong><small>.xlsx · .csv · .tsv</small></article>
        </section>

        <section className="studio-home-section">
          <header><div><span>START A PROJECT</span><h2>Choose a workspace</h2></div><p>Pick the job first. The app should not force every dataset through the same visualization workflow.</p></header>
          <div className="studio-workspace-grid">
            {WORKSPACES.map((item, index) => (
              <a href={item.href} className={`studio-workspace-card ${index === 0 ? 'featured' : ''}`} key={item.href}>
                <div className="studio-workspace-icon">{item.icon}</div>
                <span>{item.eyebrow}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <footer><small>{item.meta}</small><b>Open →</b></footer>
              </a>
            ))}
          </div>
        </section>

        <section className="studio-home-two-col">
          <div className="studio-home-section studio-library-card">
            <header><div><span>VISUALIZATION LIBRARY</span><h2>Build from the analysis, not from a generic chart picker</h2></div><a href="/vault/studio">View all</a></header>
            <div className="studio-visual-grid">
              {VISUALS.map((item) => <article key={item.title}><div>{item.glyph}</div><strong>{item.title}</strong><span>{item.note}</span></article>)}
            </div>
          </div>

          <div className="studio-home-section studio-report-card">
            <header><div><span>REPORT OUTPUT</span><h2>Designed pages, not screenshots pasted into a document</h2></div></header>
            <div className="studio-report-list">
              {REPORTS.map((item) => <a href="/vault/studio" key={item.title}><div className={`studio-report-thumb ${item.swatch}`}><i/><i/><i/></div><div><strong>{item.title}</strong><span>{item.note}</span></div><b>→</b></a>)}
            </div>
          </div>
        </section>

        <section className="studio-home-section studio-guidance">
          <header><div><span>QUICK START</span><h2>Common analyst paths</h2></div></header>
          <div>
            <article><b>01</b><strong>Workers’ comp spreadsheet</strong><span>Grid & Pivot → clean headers → filter/group → pivot claim counts/costs → send selected findings into a report.</span></article>
            <article><b>02</b><strong>Geographic provider or claims file</strong><span>Spatial Lab → map coordinates or origins/destinations → aggregate into hex/grid/heat layers → export the visual.</span></article>
            <article><b>03</b><strong>Leadership report</strong><span>Data Studio → create publication visuals → annotate → select Analyst, Infographic, Process or Executive report layout.</span></article>
          </div>
        </section>

        <footer className="studio-home-footer"><span>Occu-Med Data Studio</span><small>Dashboard structure adapted from TailAdmin’s MIT-licensed Next.js admin template; analytical workflows are Occu-Med-specific.</small></footer>
      </section>
    </main>
  );
}
