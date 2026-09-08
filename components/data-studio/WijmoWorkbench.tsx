'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type CellValue = string | number | boolean | null;
type ParsedSheet = { name: string; rows: CellValue[][]; rowCount: number; truncated: boolean };
type ParsedWorkbook = { filename: string; sheets: ParsedSheet[] };
type ColumnType = 'text' | 'number' | 'date' | 'boolean';
type ColumnSpec = { binding: string; header: string; type: ColumnType; visible: boolean };
type RecordRow = Record<string, unknown>;

declare global {
  interface Window {
    wijmo?: any;
  }
}

const CDN_BASE = (process.env.NEXT_PUBLIC_WIJMO_CDN_BASE || 'https://cdn.mescius.com/wijmo/5.latest').replace(/\/$/, '');
const LICENSE_KEY = process.env.NEXT_PUBLIC_WIJMO_LICENSE_KEY || '';

function cellText(value: CellValue | unknown) {
  return value == null ? '' : String(value);
}

function inferType(values: CellValue[]): ColumnType {
  const sample = values.filter((v) => cellText(v).trim() !== '').slice(0, 100);
  if (!sample.length) return 'text';
  const numeric = sample.filter((v) => typeof v === 'number' || /^[-+]?[$]?\d[\d,.]*(?:\.\d+)?%?$/.test(cellText(v).trim())).length;
  const bool = sample.filter((v) => /^(true|false|yes|no|0|1)$/i.test(cellText(v).trim())).length;
  const dates = sample.filter((v) => !Number.isNaN(Date.parse(cellText(v))) && /[-/]|[A-Za-z]{3}/.test(cellText(v))).length;
  if (numeric / sample.length >= 0.8) return 'number';
  if (bool / sample.length >= 0.9) return 'boolean';
  if (dates / sample.length >= 0.8) return 'date';
  return 'text';
}

function convertValue(value: unknown, type: ColumnType) {
  if (type === 'text') return cellText(value);
  if (type === 'number') {
    const parsed = Number(cellText(value).replace(/[$,%]/g, '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (type === 'boolean') return /^(true|yes|1)$/i.test(cellText(value).trim());
  const date = new Date(cellText(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function loadStyle(href: string) {
  if (document.querySelector(`link[data-wijmo-href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.wijmoHref = href;
  document.head.appendChild(link);
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-wijmo-src="${src}"]`) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === 'true') return resolve();
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.wijmoSrc = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function loadWijmo() {
  if (window.wijmo?.grid && window.wijmo?.olap) return window.wijmo;
  loadStyle(`${CDN_BASE}/styles/wijmo.min.css`);
  const controls = [
    'wijmo.min.js',
    'wijmo.input.min.js',
    'wijmo.grid.min.js',
    'wijmo.grid.filter.min.js',
    'wijmo.grid.search.min.js',
    'wijmo.grid.grouppanel.min.js',
    'wijmo.chart.min.js',
    'wijmo.olap.min.js',
    'wijmo.xlsx.min.js',
    'wijmo.grid.xlsx.min.js',
  ];
  for (const file of controls) await loadScript(`${CDN_BASE}/controls/${file}`);
  if (!window.wijmo) throw new Error('Wijmo loaded but did not expose the expected runtime.');
  if (LICENSE_KEY && typeof window.wijmo.setLicenseKey === 'function') window.wijmo.setLicenseKey(LICENSE_KEY);
  return window.wijmo;
}

function csvDownload(filename: string, columns: ColumnSpec[], items: RecordRow[]) {
  const active = columns.filter((c) => c.visible);
  const quote = (value: unknown) => `"${cellText(value).replace(/"/g, '""')}"`;
  const csv = [
    active.map((c) => quote(c.header)).join(','),
    ...items.map((item) => active.map((c) => quote(item[c.binding])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function WijmoWorkbench() {
  const fileRef = useRef<HTMLInputElement>(null);
  const gridHost = useRef<HTMLDivElement>(null);
  const groupHost = useRef<HTMLDivElement>(null);
  const searchHost = useRef<HTMLDivElement>(null);
  const pivotPanelHost = useRef<HTMLDivElement>(null);
  const pivotGridHost = useRef<HTMLDivElement>(null);
  const pivotChartHost = useRef<HTMLDivElement>(null);
  const gridRef = useRef<any>(null);
  const filterRef = useRef<any>(null);
  const groupRef = useRef<any>(null);
  const searchRef = useRef<any>(null);
  const engineRef = useRef<any>(null);
  const pivotPanelRef = useRef<any>(null);
  const pivotGridRef = useRef<any>(null);
  const pivotChartRef = useRef<any>(null);

  const [runtime, setRuntime] = useState<any>(null);
  const [runtimeError, setRuntimeError] = useState('');
  const [book, setBook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [columns, setColumns] = useState<ColumnSpec[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'grid' | 'pivot'>('grid');
  const [frozenColumns, setFrozenColumns] = useState(1);
  const [gridStatus, setGridStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadWijmo().then((wj) => {
      if (!cancelled) setRuntime(wj);
    }).catch((err) => {
      if (!cancelled) setRuntimeError(err instanceof Error ? err.message : 'Wijmo could not be loaded.');
    });
    return () => { cancelled = true; };
  }, []);

  function applySheet(sheet: ParsedSheet, nextHeader = 0) {
    const width = Math.max(0, ...sheet.rows.map((row) => row.length));
    const rawHeader = sheet.rows[nextHeader] ?? [];
    const nextColumns = Array.from({ length: width }, (_, index) => ({
      binding: `c${index}`,
      header: cellText(rawHeader[index]).trim() || `Column ${index + 1}`,
      type: inferType(sheet.rows.slice(nextHeader + 1).map((row) => row[index] ?? null)),
      visible: true,
    } as ColumnSpec));
    const nextRecords = sheet.rows.slice(nextHeader + 1).map((row) => {
      const item: RecordRow = {};
      nextColumns.forEach((col, index) => { item[col.binding] = convertValue(row[index] ?? '', col.type); });
      return item;
    });
    setHeaderRow(nextHeader);
    setColumns(nextColumns);
    setRecords(nextRecords);
    setFrozenColumns(Math.min(1, nextColumns.length));
    setWorkspaceVersion((v) => v + 1);
  }

  async function openFile(file: File) {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/data/parse', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not parse the dataset.');
      const parsed = data as ParsedWorkbook;
      setBook(parsed);
      setSheetIndex(0);
      applySheet(parsed.sheets[0], 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse the dataset.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!runtime || !records.length || !gridHost.current || !groupHost.current || !searchHost.current || !pivotPanelHost.current || !pivotGridHost.current || !pivotChartHost.current) return;
    const wj = runtime;
    const defs = columns.map((col) => ({
      binding: col.binding,
      header: col.header,
      visible: col.visible,
      width: 150,
      dataType: col.type === 'number' ? wj.DataType.Number : col.type === 'date' ? wj.DataType.Date : col.type === 'boolean' ? wj.DataType.Boolean : wj.DataType.String,
      format: col.type === 'date' ? 'MMM d, yyyy' : undefined,
    }));
    const view = new wj.CollectionView(records);
    const grid = new wj.grid.FlexGrid(gridHost.current, {
      autoGenerateColumns: false,
      columns: defs,
      itemsSource: view,
      showMarquee: true,
      alternatingRowStep: 1,
      frozenColumns: Math.min(frozenColumns, defs.length),
      validateEdits: false,
    });
    gridRef.current = grid;
    filterRef.current = new wj.grid.filter.FlexGridFilter(grid);
    groupRef.current = new wj.grid.grouppanel.GroupPanel(groupHost.current, {
      grid,
      placeholder: 'Drag columns here to group the spreadsheet',
    });
    searchRef.current = new wj.grid.search.FlexGridSearch(searchHost.current, { grid });

    const engine = new wj.olap.PivotEngine({ itemsSource: records });
    engineRef.current = engine;
    columns.forEach((col) => {
      const field = engine.fields.getField(col.binding);
      if (field) field.header = col.header;
    });
    const rowCandidate = columns.find((col) => col.type === 'text') ?? columns[0];
    const valueCandidate = columns.find((col) => col.type === 'number') ?? columns[Math.min(1, columns.length - 1)];
    if (rowCandidate) engine.rowFields.push(rowCandidate.binding);
    if (valueCandidate) engine.valueFields.push(valueCandidate.binding);

    pivotPanelRef.current = new wj.olap.PivotPanel(pivotPanelHost.current, { itemsSource: engine });
    pivotGridRef.current = new wj.olap.PivotGrid(pivotGridHost.current, {
      itemsSource: engine,
      showDetailOnDoubleClick: true,
    });
    pivotChartRef.current = new wj.olap.PivotChart(pivotChartHost.current, {
      itemsSource: engine,
      showTitle: false,
      showLegend: 'Auto',
    });

    const updateStatus = () => {
      const count = grid.collectionView?.items?.length ?? records.length;
      setGridStatus(`${count.toLocaleString()} rows in the current grid view`);
    };
    grid.collectionView?.collectionChanged?.addHandler(updateStatus);
    updateStatus();

    return () => {
      [pivotChartRef, pivotGridRef, pivotPanelRef, searchRef, groupRef, filterRef, gridRef].forEach((ref) => {
        try { ref.current?.dispose?.(); } catch { /* no-op */ }
        ref.current = null;
      });
      try { engineRef.current?.dispose?.(); } catch { /* no-op */ }
      engineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, workspaceVersion]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.frozenColumns = Math.min(frozenColumns, columns.length);
  }, [frozenColumns, columns.length]);

  const headerCandidates = useMemo(() => book ? book.sheets[sheetIndex]?.rows.slice(0, 12) ?? [] : [], [book, sheetIndex]);

  function renameColumn(binding: string, header: string) {
    setColumns((current) => current.map((col) => col.binding === binding ? { ...col, header } : col));
    const gridCol = gridRef.current?.columns?.getColumn(binding);
    if (gridCol) gridCol.header = header;
    const field = engineRef.current?.fields?.getField(binding);
    if (field) field.header = header;
  }

  function toggleColumn(binding: string) {
    setColumns((current) => current.map((col) => col.binding === binding ? { ...col, visible: !col.visible } : col));
    const gridCol = gridRef.current?.columns?.getColumn(binding);
    if (gridCol) gridCol.visible = !gridCol.visible;
  }

  function changeType(binding: string, type: ColumnType) {
    const wj = runtime;
    records.forEach((item) => { item[binding] = convertValue(item[binding], type); });
    setColumns((current) => current.map((col) => col.binding === binding ? { ...col, type } : col));
    const gridCol = gridRef.current?.columns?.getColumn(binding);
    if (gridCol && wj) {
      gridCol.dataType = type === 'number' ? wj.DataType.Number : type === 'date' ? wj.DataType.Date : type === 'boolean' ? wj.DataType.Boolean : wj.DataType.String;
      gridCol.format = type === 'date' ? 'MMM d, yyyy' : '';
      gridRef.current.collectionView?.refresh?.();
    }
    engineRef.current?.refresh?.();
  }

  function moveColumn(binding: string, delta: number) {
    const grid = gridRef.current;
    if (!grid) return;
    const from = grid.columns.indexOf(grid.columns.getColumn(binding));
    const to = Math.max(0, Math.min(grid.columns.length - 1, from + delta));
    if (from === to) return;
    grid.columns.moveElement(from, to);
    setColumns((current) => {
      const next = [...current];
      const index = next.findIndex((col) => col.binding === binding);
      const [item] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item);
      return next;
    });
  }

  function deleteColumn(binding: string) {
    if (columns.length <= 1) return;
    const grid = gridRef.current;
    const col = grid?.columns?.getColumn(binding);
    if (grid && col) grid.columns.remove(col);
    setColumns((current) => current.filter((item) => item.binding !== binding));
  }

  function useGridViewForPivot() {
    const engine = engineRef.current;
    const grid = gridRef.current;
    if (!engine || !grid) return;
    engine.itemsSource = [...(grid.collectionView?.items ?? records)];
    engine.refresh?.();
  }

  function savePivotView() {
    const engine = engineRef.current;
    if (engine?.isViewDefined) localStorage.setItem('occu-med-wijmo-pivot-view', engine.viewDefinition);
  }

  function restorePivotView() {
    const definition = localStorage.getItem('occu-med-wijmo-pivot-view');
    if (definition && engineRef.current) engineRef.current.viewDefinition = definition;
  }

  function exportCsv() {
    const grid = gridRef.current;
    const items = (grid?.collectionView?.items ?? records) as RecordRow[];
    csvDownload(`${(book?.filename || 'dataset').replace(/\.[^.]+$/, '')}-grid.csv`, columns, items);
  }

  function exportXlsx() {
    const converter = runtime?.grid?.xlsx?.FlexGridXlsxConverter;
    if (converter && gridRef.current) converter.saveAsync(gridRef.current, null, `${(book?.filename || 'dataset').replace(/\.[^.]+$/, '')}-grid.xlsx`);
  }

  return (
    <main className="wj-workbench">
      <header className="wj-topbar">
        <div>
          <span>ACTUAL WIJMO WORKSPACE</span>
          <h1>Grid & Pivot Lab</h1>
          <p>FlexGrid for spreadsheet work. PivotEngine, PivotPanel, PivotGrid and PivotChart for interactive analysis.</p>
        </div>
        <nav>
          <a href="/vault">Data Studio</a>
          <a href="/vault/advanced">Advanced Lab</a>
          <a href="/vault/spatial">Spatial Lab</a>
          <a href="/vault/story">Story Studio</a>
        </nav>
      </header>

      {runtimeError && <div className="wj-alert error"><strong>Wijmo runtime error:</strong> {runtimeError}</div>}
      {!runtime && !runtimeError && <div className="wj-alert">Loading the licensed Wijmo runtime…</div>}

      {!book ? (
        <section className="wj-upload-card">
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void openFile(file);
          }} />
          <div className="wj-upload-icon">▦</div>
          <h2>Open an Excel or CSV dataset</h2>
          <p>The existing Data Studio parser feeds the workbook directly into Wijmo FlexGrid and OLAP.</p>
          <button onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Reading…' : 'Choose dataset'}</button>
          {error && <em>{error}</em>}
        </section>
      ) : (
        <>
          <section className="wj-workspace-bar">
            <div className="wj-file-meta"><span>Dataset</span><strong>{book.filename}</strong></div>
            <label>Sheet<select value={sheetIndex} onChange={(event) => {
              const next = Number(event.target.value);
              setSheetIndex(next);
              applySheet(book.sheets[next], 0);
            }}>{book.sheets.map((sheet, index) => <option key={sheet.name} value={index}>{sheet.name}</option>)}</select></label>
            <label>Header row<select value={headerRow} onChange={(event) => applySheet(book.sheets[sheetIndex], Number(event.target.value))}>{headerCandidates.map((row, index) => <option key={index} value={index}>Row {index + 1}: {row.slice(0, 3).map(cellText).join(' · ').slice(0, 80)}</option>)}</select></label>
            <div className="wj-tabs"><button className={tab === 'grid' ? 'active' : ''} onClick={() => setTab('grid')}>Spreadsheet</button><button className={tab === 'pivot' ? 'active' : ''} onClick={() => setTab('pivot')}>Pivot analysis</button></div>
            <button className="secondary" onClick={() => fileRef.current?.click()}>Replace file</button>
            <input ref={fileRef} hidden type="file" accept=".xlsx,.csv,.tsv" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void openFile(file);
            }} />
          </section>

          {tab === 'grid' ? (
            <section className="wj-grid-layout">
              <aside className="wj-column-panel">
                <div className="wj-panel-heading"><span>COLUMNS</span><strong>{columns.length}</strong></div>
                <label className="wj-freeze">Frozen columns<input type="number" min="0" max={columns.length} value={frozenColumns} onChange={(e) => setFrozenColumns(Number(e.target.value))} /></label>
                <div className="wj-column-list">
                  {columns.map((col) => <article key={col.binding} className={!col.visible ? 'is-hidden' : ''}>
                    <div className="wj-col-head"><label><input type="checkbox" checked={col.visible} onChange={() => toggleColumn(col.binding)} />{col.binding.toUpperCase()}</label><div><button title="Move left" onClick={() => moveColumn(col.binding, -1)}>←</button><button title="Move right" onClick={() => moveColumn(col.binding, 1)}>→</button><button title="Delete column" onClick={() => deleteColumn(col.binding)}>×</button></div></div>
                    <input value={col.header} onChange={(event) => renameColumn(col.binding, event.target.value)} aria-label={`Rename ${col.header}`} />
                    <select value={col.type} onChange={(event) => changeType(col.binding, event.target.value as ColumnType)}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="boolean">Boolean</option></select>
                  </article>)}
                </div>
              </aside>

              <div className="wj-grid-stage">
                <div className="wj-grid-toolbar">
                  <div ref={searchHost} className="wj-search-host" />
                  <span>{gridStatus}</span>
                  <button onClick={exportCsv}>Export CSV</button>
                  <button onClick={exportXlsx}>Export XLSX</button>
                </div>
                <div ref={groupHost} className="wj-group-host" />
                <div ref={gridHost} className="wj-grid-host" />
                <footer><span>Use the column filter icons for Excel-style filtering. Drag headers into the group panel to create grouped spreadsheet views.</span><span>Double-click a cell to edit it.</span></footer>
              </div>
            </section>
          ) : (
            <section className="wj-pivot-layout">
              <aside className="wj-pivot-panel-wrap">
                <div className="wj-panel-heading"><span>PIVOT FIELDS</span><strong>Drag & drop</strong></div>
                <div ref={pivotPanelHost} className="wj-pivot-panel" />
                <div className="wj-pivot-actions"><button onClick={useGridViewForPivot}>Analyze current grid view</button><button onClick={savePivotView}>Save view</button><button onClick={restorePivotView}>Restore view</button></div>
              </aside>
              <div className="wj-pivot-output">
                <div className="wj-pivot-card"><header><strong>Pivot table</strong><span>Double-click a summarized cell to drill into its source rows.</span></header><div ref={pivotGridHost} className="wj-pivot-grid" /></div>
                <div className="wj-pivot-card"><header><strong>Pivot chart</strong><span>Updates with the same field configuration.</span></header><div ref={pivotChartHost} className="wj-pivot-chart" /></div>
              </div>
            </section>
          )}
        </>
      )}

      <footer className="wj-license-note">Wijmo 5 runtime is loaded from the official MESCIUS CDN. This workspace supports an authorized license key through <code>NEXT_PUBLIC_WIJMO_LICENSE_KEY</code> and an optional pinned/self-hosted CDN base through <code>NEXT_PUBLIC_WIJMO_CDN_BASE</code>.</footer>
    </main>
  );
}
