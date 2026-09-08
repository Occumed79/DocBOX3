'use client';

import { useMemo, useRef, useState } from 'react';

type CellValue = string | number | boolean | null;
type ParsedSheet = { name: string; rows: CellValue[][]; rowCount: number; truncated: boolean };
type ParsedWorkbook = { filename: string; sheets: ParsedSheet[] };
type ColumnType = 'text' | 'number' | 'date' | 'boolean';
type ColumnSpec = { id: string; name: string; type: ColumnType; visible: boolean };
type RowRecord = { __rowId: number; [key: string]: CellValue | number };
type SortState = { id: string; direction: 'asc' | 'desc' } | null;
type Agg = 'count' | 'sum' | 'avg' | 'min' | 'max';

const PAGE_SIZE = 100;

const asText = (value: unknown) => value == null ? '' : String(value);

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(asText(value).replace(/[$,%]/g, '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function inferType(values: CellValue[]): ColumnType {
  const sample = values.filter((value) => asText(value).trim() !== '').slice(0, 100);
  if (!sample.length) return 'text';
  const numeric = sample.filter((value) => asNumber(value) !== null).length;
  const bool = sample.filter((value) => /^(true|false|yes|no|0|1)$/i.test(asText(value).trim())).length;
  const dates = sample.filter((value) => !Number.isNaN(Date.parse(asText(value))) && /[-/]|[A-Za-z]{3}/.test(asText(value))).length;
  if (numeric / sample.length >= 0.82) return 'number';
  if (bool / sample.length >= 0.9) return 'boolean';
  if (dates / sample.length >= 0.82) return 'date';
  return 'text';
}

function convertValue(value: unknown, type: ColumnType): CellValue {
  if (type === 'number') return asNumber(value);
  if (type === 'boolean') return /^(true|yes|1)$/i.test(asText(value).trim());
  if (type === 'date') {
    const parsed = new Date(asText(value));
    return Number.isNaN(parsed.getTime()) ? asText(value) : parsed.toISOString().slice(0, 10);
  }
  return asText(value);
}

function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function quoteCsv(value: unknown) {
  return `"${asText(value).replace(/"/g, '""')}"`;
}

function aggregate(records: RowRecord[], measure: string, agg: Agg): number {
  if (agg === 'count' || !measure) return records.length;
  const values = records.map((record) => asNumber(record[measure])).filter((value): value is number => value !== null);
  if (!values.length) return 0;
  if (agg === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (agg === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (agg === 'min') return Math.min(...values);
  return Math.max(...values);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export default function GridPivotLab() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [book, setBook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [columns, setColumns] = useState<ColumnSpec[]>([]);
  const [rows, setRows] = useState<RowRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'grid' | 'pivot'>('grid');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState>(null);
  const [groupBy, setGroupBy] = useState('');
  const [frozenColumns, setFrozenColumns] = useState(1);
  const [page, setPage] = useState(0);
  const [pivotRow, setPivotRow] = useState('');
  const [pivotColumn, setPivotColumn] = useState('');
  const [pivotMeasure, setPivotMeasure] = useState('');
  const [pivotAgg, setPivotAgg] = useState<Agg>('count');
  const [pivotFilteredOnly, setPivotFilteredOnly] = useState(true);
  const [detail, setDetail] = useState<{ title: string; records: RowRecord[] } | null>(null);

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

  function applySheet(sheet: ParsedSheet, nextHeader = 0) {
    const width = Math.max(0, ...sheet.rows.map((row) => row.length));
    const rawHeader = sheet.rows[nextHeader] ?? [];
    const nextColumns = Array.from({ length: width }, (_, index): ColumnSpec => ({
      id: `c${index}`,
      name: asText(rawHeader[index]).trim() || `Column ${index + 1}`,
      type: inferType(sheet.rows.slice(nextHeader + 1).map((row) => row[index] ?? null)),
      visible: true,
    }));
    const nextRows = sheet.rows.slice(nextHeader + 1).map((row, rowIndex) => {
      const record: RowRecord = { __rowId: rowIndex };
      nextColumns.forEach((column, index) => { record[column.id] = convertValue(row[index] ?? '', column.type); });
      return record;
    });
    setHeaderRow(nextHeader);
    setColumns(nextColumns);
    setRows(nextRows);
    setSearch('');
    setFilters({});
    setSort(null);
    setGroupBy('');
    setFrozenColumns(Math.min(1, nextColumns.length));
    setPage(0);
    const textColumn = nextColumns.find((column) => column.type === 'text')?.id ?? nextColumns[0]?.id ?? '';
    const numberColumn = nextColumns.find((column) => column.type === 'number')?.id ?? '';
    setPivotRow(textColumn);
    setPivotColumn('');
    setPivotMeasure(numberColumn);
    setPivotAgg(numberColumn ? 'sum' : 'count');
  }

  async function openFile(file: File) {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/data/parse', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not parse this dataset.');
      const parsed = data as ParsedWorkbook;
      setBook(parsed);
      setSheetIndex(0);
      applySheet(parsed.sheets[0], 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse this dataset.');
    } finally {
      setBusy(false);
    }
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    let next = rows.filter((row) => {
      if (query && !visibleColumns.some((column) => asText(row[column.id]).toLowerCase().includes(query))) return false;
      return columns.every((column) => {
        const filter = (filters[column.id] || '').trim().toLowerCase();
        return !filter || asText(row[column.id]).toLowerCase().includes(filter);
      });
    });
    if (sort) {
      next = [...next].sort((a, b) => {
        const av = a[sort.id];
        const bv = b[sort.id];
        const an = asNumber(av);
        const bn = asNumber(bv);
        const result = an !== null && bn !== null ? an - bn : asText(av).localeCompare(asText(bv), undefined, { numeric: true });
        return sort.direction === 'asc' ? result : -result;
      });
    }
    return next;
  }, [rows, visibleColumns, columns, filters, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice(Math.min(page, pageCount - 1) * PAGE_SIZE, (Math.min(page, pageCount - 1) + 1) * PAGE_SIZE);

  const groupedRows = useMemo(() => {
    if (!groupBy) return null;
    const groups = new Map<string, RowRecord[]>();
    filteredRows.forEach((row) => {
      const key = asText(row[groupBy]) || '(blank)';
      const bucket = groups.get(key) ?? [];
      bucket.push(row);
      groups.set(key, bucket);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredRows, groupBy]);

  function updateCell(rowId: number, column: ColumnSpec, value: string) {
    setRows((current) => current.map((row) => row.__rowId === rowId ? { ...row, [column.id]: convertValue(value, column.type) } : row));
  }

  function renameColumn(id: string, name: string) {
    setColumns((current) => current.map((column) => column.id === id ? { ...column, name } : column));
  }

  function changeType(id: string, type: ColumnType) {
    setColumns((current) => current.map((column) => column.id === id ? { ...column, type } : column));
    setRows((current) => current.map((row) => ({ ...row, [id]: convertValue(row[id], type) })));
  }

  function moveColumn(id: string, delta: number) {
    setColumns((current) => {
      const next = [...current];
      const index = next.findIndex((column) => column.id === id);
      const target = Math.max(0, Math.min(next.length - 1, index + delta));
      if (index < 0 || index === target) return current;
      const [column] = next.splice(index, 1);
      next.splice(target, 0, column);
      return next;
    });
  }

  function deleteColumn(id: string) {
    if (columns.length <= 1) return;
    setColumns((current) => current.filter((column) => column.id !== id));
    setRows((current) => current.map((row) => {
      const next = { ...row };
      delete next[id];
      return next;
    }));
    setFilters((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (groupBy === id) setGroupBy('');
    if (pivotRow === id) setPivotRow('');
    if (pivotColumn === id) setPivotColumn('');
    if (pivotMeasure === id) setPivotMeasure('');
  }

  function cycleSort(id: string) {
    setSort((current) => !current || current.id !== id ? { id, direction: 'asc' } : current.direction === 'asc' ? { id, direction: 'desc' } : null);
  }

  function exportGridCsv() {
    const active = visibleColumns;
    const csv = [
      active.map((column) => quoteCsv(column.name)).join(','),
      ...filteredRows.map((row) => active.map((column) => quoteCsv(row[column.id])).join(',')),
    ].join('\n');
    downloadText(`${(book?.filename || 'dataset').replace(/\.[^.]+$/, '')}-clean.csv`, csv, 'text/csv;charset=utf-8');
  }

  const pivotSource = pivotFilteredOnly ? filteredRows : rows;
  const pivot = useMemo(() => {
    if (!pivotRow) return null;
    const rowKeys = [...new Set(pivotSource.map((row) => asText(row[pivotRow]) || '(blank)'))].sort();
    const columnKeys = pivotColumn ? [...new Set(pivotSource.map((row) => asText(row[pivotColumn]) || '(blank)'))].sort() : ['Value'];
    const cells = new Map<string, RowRecord[]>();
    pivotSource.forEach((row) => {
      const r = asText(row[pivotRow]) || '(blank)';
      const c = pivotColumn ? asText(row[pivotColumn]) || '(blank)' : 'Value';
      const key = `${r}\u0000${c}`;
      const bucket = cells.get(key) ?? [];
      bucket.push(row);
      cells.set(key, bucket);
    });
    return { rowKeys: rowKeys.slice(0, 200), columnKeys: columnKeys.slice(0, 50), cells };
  }, [pivotSource, pivotRow, pivotColumn]);

  const pivotChartRows = useMemo(() => {
    if (!pivot) return [] as Array<{ label: string; value: number }>;
    return pivot.rowKeys.slice(0, 20).map((label) => {
      const records = pivotSource.filter((row) => (asText(row[pivotRow]) || '(blank)') === label);
      return { label, value: aggregate(records, pivotMeasure, pivotAgg) };
    }).sort((a, b) => b.value - a.value);
  }, [pivot, pivotSource, pivotRow, pivotMeasure, pivotAgg]);

  const maxPivotChart = Math.max(1, ...pivotChartRows.map((item) => Math.abs(item.value)));

  function exportPivotCsv() {
    if (!pivot) return;
    const rowName = columns.find((column) => column.id === pivotRow)?.name || 'Row';
    const lines = [[rowName, ...pivot.columnKeys].map(quoteCsv).join(',')];
    pivot.rowKeys.forEach((rowKey) => {
      const values = pivot.columnKeys.map((columnKey) => aggregate(pivot.cells.get(`${rowKey}\u0000${columnKey}`) ?? [], pivotMeasure, pivotAgg));
      lines.push([quoteCsv(rowKey), ...values.map((value) => quoteCsv(value))].join(','));
    });
    downloadText('pivot-analysis.csv', lines.join('\n'), 'text/csv;charset=utf-8');
  }

  function savePivotView() {
    localStorage.setItem('occu-med-native-pivot-view', JSON.stringify({ pivotRow, pivotColumn, pivotMeasure, pivotAgg, pivotFilteredOnly, groupBy, frozenColumns }));
  }

  function restorePivotView() {
    try {
      const saved = JSON.parse(localStorage.getItem('occu-med-native-pivot-view') || '{}');
      if (saved.pivotRow !== undefined) setPivotRow(saved.pivotRow);
      if (saved.pivotColumn !== undefined) setPivotColumn(saved.pivotColumn);
      if (saved.pivotMeasure !== undefined) setPivotMeasure(saved.pivotMeasure);
      if (saved.pivotAgg !== undefined) setPivotAgg(saved.pivotAgg);
      if (saved.pivotFilteredOnly !== undefined) setPivotFilteredOnly(Boolean(saved.pivotFilteredOnly));
      if (saved.groupBy !== undefined) setGroupBy(saved.groupBy);
      if (saved.frozenColumns !== undefined) setFrozenColumns(Number(saved.frozenColumns) || 0);
    } catch { /* ignore invalid saved state */ }
  }

  const headerCandidates = book?.sheets[sheetIndex]?.rows.slice(0, 12) ?? [];

  if (!book) {
    return (
      <main className="gpl-shell gpl-empty-shell">
        <section className="gpl-upload-card">
          <div className="gpl-kicker">GRID & PIVOT LAB</div>
          <h1>Explore the spreadsheet before you visualize it.</h1>
          <p>Upload an Excel or CSV file, clean and reshape columns, filter and group records, then build pivot analyses with drill-down into the exact source rows.</p>
          <button className="gpl-primary" onClick={() => fileInput.current?.click()}>{busy ? 'Reading…' : 'Choose spreadsheet'}</button>
          <input ref={fileInput} hidden type="file" accept=".xlsx,.csv,.tsv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openFile(file); }} />
          {error && <div className="gpl-error">{error}</div>}
          <div className="gpl-capability-grid">
            <span>Editable data grid</span><span>Column filters</span><span>Grouping</span><span>Pivot tables</span><span>Drill-down</span><span>Saved views</span>
          </div>
          <a className="gpl-back" href="/vault">← Data Studio</a>
        </section>
      </main>
    );
  }

  return (
    <main className="gpl-shell">
      <header className="gpl-topbar">
        <div><div className="gpl-kicker">GRID & PIVOT LAB</div><strong>{book.filename}</strong><span>{rows.length.toLocaleString()} rows · {columns.length} columns</span></div>
        <div className="gpl-actions">
          <button onClick={() => fileInput.current?.click()}>Replace file</button>
          <button onClick={exportGridCsv}>Export filtered CSV</button>
          <a href="/vault">Data Studio</a>
        </div>
        <input ref={fileInput} hidden type="file" accept=".xlsx,.csv,.tsv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openFile(file); }} />
      </header>

      <section className="gpl-dataset-bar">
        <label>Sheet<select value={sheetIndex} onChange={(event) => { const index = Number(event.target.value); setSheetIndex(index); applySheet(book.sheets[index], 0); }}>{book.sheets.map((sheet, index) => <option key={sheet.name + index} value={index}>{sheet.name}</option>)}</select></label>
        <label>Header row<select value={headerRow} onChange={(event) => applySheet(book.sheets[sheetIndex], Number(event.target.value))}>{headerCandidates.map((row, index) => <option key={index} value={index}>Row {index + 1}: {row.slice(0, 4).map(asText).join(' · ').slice(0, 90)}</option>)}</select></label>
        <label>Freeze<select value={frozenColumns} onChange={(event) => setFrozenColumns(Number(event.target.value))}>{Array.from({ length: Math.min(6, visibleColumns.length + 1) }, (_, index) => <option key={index} value={index}>{index} column{index === 1 ? '' : 's'}</option>)}</select></label>
        <div className="gpl-tabs"><button className={tab === 'grid' ? 'active' : ''} onClick={() => setTab('grid')}>Data grid</button><button className={tab === 'pivot' ? 'active' : ''} onClick={() => setTab('pivot')}>Pivot analysis</button></div>
      </section>

      {tab === 'grid' ? (
        <section className="gpl-grid-layout">
          <aside className="gpl-sidebar">
            <h2>Columns</h2>
            <p>Rename, type, reorder, hide or remove fields.</p>
            <div className="gpl-column-list">
              {columns.map((column) => <div className="gpl-column-card" key={column.id}>
                <input value={column.name} onChange={(event) => renameColumn(column.id, event.target.value)} />
                <div>
                  <select value={column.type} onChange={(event) => changeType(column.id, event.target.value as ColumnType)}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="boolean">Boolean</option></select>
                  <button title="Move left" onClick={() => moveColumn(column.id, -1)}>←</button><button title="Move right" onClick={() => moveColumn(column.id, 1)}>→</button>
                </div>
                <div><label><input type="checkbox" checked={column.visible} onChange={() => setColumns((current) => current.map((item) => item.id === column.id ? { ...item, visible: !item.visible } : item))} /> Visible</label><button className="danger" onClick={() => deleteColumn(column.id)}>Delete</button></div>
              </div>)}
            </div>
          </aside>

          <div className="gpl-main-panel">
            <div className="gpl-toolbar">
              <input className="gpl-search" placeholder="Search all visible columns…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
              <label>Group by<select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}><option value="">None</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
              <button onClick={() => { setFilters({}); setSearch(''); setSort(null); }}>Clear filters</button>
              <span>{filteredRows.length.toLocaleString()} matching rows</span>
            </div>

            {groupedRows ? <div className="gpl-groups">{groupedRows.slice(0, 100).map(([label, group]) => <details key={label}><summary><strong>{label}</strong><span>{group.length.toLocaleString()} rows</span></summary><div className="gpl-group-preview">{group.slice(0, 8).map((row) => <div key={row.__rowId}>{visibleColumns.slice(0, 4).map((column) => <span key={column.id}><b>{column.name}:</b> {asText(row[column.id])}</span>)}</div>)}</div></details>)}</div> : (
              <div className="gpl-table-wrap"><table className="gpl-table"><thead><tr>{visibleColumns.map((column, index) => <th key={column.id} className={index < frozenColumns ? 'frozen' : ''} style={index < frozenColumns ? { left: `${index * 180}px` } : undefined}><button className="gpl-sort" onClick={() => cycleSort(column.id)}>{column.name} {sort?.id === column.id ? (sort.direction === 'asc' ? '↑' : '↓') : ''}</button></th>)}</tr><tr>{visibleColumns.map((column, index) => <th key={column.id} className={index < frozenColumns ? 'frozen filter' : 'filter'} style={index < frozenColumns ? { left: `${index * 180}px` } : undefined}><input placeholder="Filter…" value={filters[column.id] || ''} onChange={(event) => { setFilters((current) => ({ ...current, [column.id]: event.target.value })); setPage(0); }} /></th>)}</tr></thead><tbody>{pagedRows.map((row) => <tr key={row.__rowId}>{visibleColumns.map((column, index) => <td key={column.id} className={index < frozenColumns ? 'frozen' : ''} style={index < frozenColumns ? { left: `${index * 180}px` } : undefined}><input value={asText(row[column.id])} onChange={(event) => updateCell(row.__rowId, column, event.target.value)} /></td>)}</tr>)}</tbody></table></div>
            )}

            {!groupedRows && <div className="gpl-pagination"><button disabled={page <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><span>Page {Math.min(page, pageCount - 1) + 1} of {pageCount}</span><button disabled={page >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</button></div>}
          </div>
        </section>
      ) : (
        <section className="gpl-pivot-layout">
          <aside className="gpl-sidebar gpl-pivot-builder">
            <h2>Pivot fields</h2>
            <p>Choose what defines rows, columns and values. This is our own pivot engine operating on the uploaded rows.</p>
            <label>Rows<select value={pivotRow} onChange={(event) => setPivotRow(event.target.value)}><option value="">Choose field</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
            <label>Columns<select value={pivotColumn} onChange={(event) => setPivotColumn(event.target.value)}><option value="">No column split</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
            <label>Measure<select value={pivotMeasure} onChange={(event) => setPivotMeasure(event.target.value)}><option value="">Row count</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
            <label>Aggregation<select value={pivotAgg} onChange={(event) => setPivotAgg(event.target.value as Agg)}><option value="count">Count</option><option value="sum">Sum</option><option value="avg">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label>
            <label className="gpl-check"><input type="checkbox" checked={pivotFilteredOnly} onChange={(event) => setPivotFilteredOnly(event.target.checked)} /> Analyze current filtered grid view</label>
            <div className="gpl-stack-actions"><button onClick={savePivotView}>Save view</button><button onClick={restorePivotView}>Restore view</button><button onClick={exportPivotCsv}>Export pivot CSV</button></div>
            <div className="gpl-field-palette"><h3>Field palette</h3>{columns.map((column) => <div key={column.id}><span>{column.name}</span><small>{column.type}</small><div><button onClick={() => setPivotRow(column.id)}>Row</button><button onClick={() => setPivotColumn(column.id)}>Column</button><button onClick={() => { setPivotMeasure(column.id); if (column.type === 'number' && pivotAgg === 'count') setPivotAgg('sum'); }}>Value</button></div></div>)}</div>
          </aside>

          <div className="gpl-main-panel">
            <div className="gpl-pivot-summary"><div><span>Source rows</span><strong>{pivotSource.length.toLocaleString()}</strong></div><div><span>Row groups</span><strong>{pivot?.rowKeys.length.toLocaleString() || 0}</strong></div><div><span>Column groups</span><strong>{pivot?.columnKeys.length.toLocaleString() || 0}</strong></div><div><span>Aggregation</span><strong>{pivotAgg}</strong></div></div>
            {pivot ? <>
              <div className="gpl-table-wrap gpl-pivot-table-wrap"><table className="gpl-table gpl-pivot-table"><thead><tr><th>{columns.find((column) => column.id === pivotRow)?.name || 'Rows'}</th>{pivot.columnKeys.map((columnKey) => <th key={columnKey}>{columnKey}</th>)}</tr></thead><tbody>{pivot.rowKeys.map((rowKey) => <tr key={rowKey}><th>{rowKey}</th>{pivot.columnKeys.map((columnKey) => { const records = pivot.cells.get(`${rowKey}\u0000${columnKey}`) ?? []; const value = aggregate(records, pivotMeasure, pivotAgg); return <td key={columnKey}><button className="gpl-pivot-cell" onDoubleClick={() => setDetail({ title: `${rowKey} · ${columnKey}`, records })} onClick={() => setDetail({ title: `${rowKey} · ${columnKey}`, records })}>{formatNumber(value)}</button></td>; })}</tr>)}</tbody></table></div>
              <section className="gpl-pivot-chart"><div className="gpl-chart-heading"><div><span>Pivot chart</span><strong>{columns.find((column) => column.id === pivotRow)?.name || 'Rows'}</strong></div><small>Top 20 row groups by {pivotAgg}</small></div>{pivotChartRows.map((item) => <div className="gpl-bar-row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${Math.max(1, Math.abs(item.value) / maxPivotChart * 100)}%` }} /></div><b>{formatNumber(item.value)}</b></div>)}</section>
            </> : <div className="gpl-empty-pivot">Choose a row field to build the pivot.</div>}
          </div>
        </section>
      )}

      {detail && <div className="gpl-modal-backdrop" onClick={() => setDetail(null)}><section className="gpl-detail-modal" onClick={(event) => event.stopPropagation()}><header><div><span>DRILL-DOWN RECORDS</span><h2>{detail.title}</h2><p>{detail.records.length.toLocaleString()} source rows contribute to this pivot cell.</p></div><button onClick={() => setDetail(null)}>Close</button></header><div className="gpl-table-wrap"><table className="gpl-table"><thead><tr>{visibleColumns.slice(0, 10).map((column) => <th key={column.id}>{column.name}</th>)}</tr></thead><tbody>{detail.records.slice(0, 250).map((row) => <tr key={row.__rowId}>{visibleColumns.slice(0, 10).map((column) => <td key={column.id}>{asText(row[column.id])}</td>)}</tr>)}</tbody></table></div></section></div>}
    </main>
  );
}
