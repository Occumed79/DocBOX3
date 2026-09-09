'use client';

import { useMemo, useState } from 'react';
import { type DatasetCell, type DatasetColumn, type DatasetColumnType, useDataset } from './DatasetContext';

type SortState = { id: string; direction: 'asc' | 'desc' } | null;
type Agg = 'count' | 'sum' | 'average' | 'min' | 'max';
type FilterState = { op: string; value: string; value2: string; selected: string[] };
type GridRecord = { __rowId: number; __absolute: number; values: Record<string, DatasetCell> };
type Measure = { id: string; field: string; agg: Agg };

const PAGE_SIZE = 100;
const EMPTY_FILTER: FilterState = { op: '', value: '', value2: '', selected: [] };

const text = (value: unknown) => value == null ? '' : String(value);
function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = text(value).trim().replace(/[,$%]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
function dateValue(value: unknown) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}
function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}
function csvCell(value: unknown) {
  const valueText = text(value);
  return /[",\n\r]/.test(valueText) ? `"${valueText.replace(/"/g, '""')}"` : valueText;
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

function aggregate(records: GridRecord[], field: string, agg: Agg) {
  if (agg === 'count' || !field) return records.length;
  const values = records.map((record) => numberValue(record.values[field])).filter((value): value is number => value !== null);
  if (!values.length) return 0;
  if (agg === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (agg === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (agg === 'min') return Math.min(...values);
  return Math.max(...values);
}

function matchesFilter(value: DatasetCell, type: DatasetColumnType, filter: FilterState) {
  if (type === 'category') {
    if (!filter.selected.length) return true;
    return filter.selected.includes(text(value));
  }
  if (type === 'boolean') {
    if (!filter.value) return true;
    const normalized = /^(true|yes|1)$/i.test(text(value)) ? 'true' : /^(false|no|0)$/i.test(text(value)) ? 'false' : '';
    return normalized === filter.value;
  }
  if (!filter.op || (!filter.value && filter.op !== 'empty' && filter.op !== 'not-empty')) return true;
  if (filter.op === 'empty') return text(value).trim() === '';
  if (filter.op === 'not-empty') return text(value).trim() !== '';

  if (type === 'number') {
    const current = numberValue(value);
    const a = numberValue(filter.value);
    const b = numberValue(filter.value2);
    if (current === null || a === null) return false;
    if (filter.op === 'equals') return current === a;
    if (filter.op === 'gt') return current > a;
    if (filter.op === 'gte') return current >= a;
    if (filter.op === 'lt') return current < a;
    if (filter.op === 'lte') return current <= a;
    if (filter.op === 'between') return b !== null && current >= Math.min(a, b) && current <= Math.max(a, b);
    return true;
  }

  if (type === 'date') {
    const current = dateValue(value);
    const a = dateValue(filter.value);
    const b = dateValue(filter.value2);
    if (current === null || a === null) return false;
    if (filter.op === 'equals') return new Date(current).toDateString() === new Date(a).toDateString();
    if (filter.op === 'before') return current < a;
    if (filter.op === 'after') return current > a;
    if (filter.op === 'between') return b !== null && current >= Math.min(a, b) && current <= Math.max(a, b);
    return true;
  }

  const current = text(value).toLowerCase();
  const needle = filter.value.toLowerCase();
  if (filter.op === 'equals') return current === needle;
  if (filter.op === 'starts') return current.startsWith(needle);
  if (filter.op === 'ends') return current.endsWith(needle);
  if (filter.op === 'not-contains') return !current.includes(needle);
  return current.includes(needle);
}

function FilterControl({ column, filter, values, onChange }: { column: DatasetColumn; filter: FilterState; values: string[]; onChange: (next: FilterState) => void }) {
  if (column.type === 'category') {
    return (
      <label className="ugp-filter ugp-category-filter">
        <span>Filter</span>
        <select multiple value={filter.selected} onChange={(event) => onChange({ ...filter, selected: Array.from(event.currentTarget.selectedOptions).map((option) => option.value) })}>
          {values.slice(0, 150).map((value) => <option key={value} value={value}>{value || '(blank)'}</option>)}
        </select>
      </label>
    );
  }
  if (column.type === 'boolean') {
    return (
      <label className="ugp-filter"><span>Filter</span><select value={filter.value} onChange={(event) => onChange({ ...filter, value: event.target.value })}>
        <option value="">All</option><option value="true">True</option><option value="false">False</option>
      </select></label>
    );
  }
  const numeric = column.type === 'number';
  const date = column.type === 'date';
  const options = numeric
    ? [['', 'All'], ['equals', '='], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['between', 'Between'], ['empty', 'Empty'], ['not-empty', 'Not empty']]
    : date
      ? [['', 'All'], ['equals', 'On'], ['before', 'Before'], ['after', 'After'], ['between', 'Between'], ['empty', 'Empty'], ['not-empty', 'Not empty']]
      : [['', 'All'], ['contains', 'Contains'], ['not-contains', 'Does not contain'], ['equals', 'Equals'], ['starts', 'Starts with'], ['ends', 'Ends with'], ['empty', 'Empty'], ['not-empty', 'Not empty']];
  const inputType = numeric ? 'number' : date ? 'date' : 'text';
  const needsValue = !['', 'empty', 'not-empty'].includes(filter.op);
  return (
    <div className="ugp-filter">
      <select aria-label={`Filter ${column.name}`} value={filter.op} onChange={(event) => onChange({ ...filter, op: event.target.value })}>
        {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {needsValue && <input aria-label={`${column.name} filter value`} type={inputType} value={filter.value} onChange={(event) => onChange({ ...filter, value: event.target.value })} />}
      {filter.op === 'between' && <input aria-label={`${column.name} second filter value`} type={inputType} value={filter.value2} onChange={(event) => onChange({ ...filter, value2: event.target.value })} />}
    </div>
  );
}

export default function SharedGridPivotWorkbench() {
  const context = useDataset();
  const dataset = context.dataset!;
  const setDataset = context.setDataset;
  const [tab, setTab] = useState<'grid' | 'pivot'>('grid');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, FilterState>>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [frozenColumns, setFrozenColumns] = useState(1);
  const [pivotRowA, setPivotRowA] = useState('');
  const [pivotRowB, setPivotRowB] = useState('');
  const [pivotColumn, setPivotColumn] = useState('');
  const [measures, setMeasures] = useState<Measure[]>([{ id: 'measure-1', field: '', agg: 'count' }]);
  const [pivotFilteredOnly, setPivotFilteredOnly] = useState(true);
  const [detail, setDetail] = useState<{ title: string; records: GridRecord[] } | null>(null);
  const [activeCell, setActiveCell] = useState('');

  const columns = dataset.columns;
  const visibleColumns = columns.filter((column) => !column.hidden);
  const numericColumns = visibleColumns.filter((column) => column.type === 'number');
  const activeSheet = dataset.workbook.sheets[dataset.activeSheet];

  const rows = useMemo<GridRecord[]>(() => dataset.grid.slice(dataset.headerRow + 1).flatMap((row, index) => {
    if (!row.some((value) => text(value).trim() !== '')) return [];
    const values: Record<string, DatasetCell> = {};
    columns.forEach((column) => { values[column.id] = row[column.sourceIndex] ?? null; });
    return [{ __rowId: index, __absolute: dataset.headerRow + 1 + index, values }];
  }), [dataset.grid, dataset.headerRow, columns]);

  const distinctValues = useMemo(() => Object.fromEntries(columns.map((column) => [column.id, [...new Set(rows.map((row) => text(row.values[column.id])))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))])), [columns, rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const next = rows.filter((row) => {
      if (query && !visibleColumns.some((column) => text(row.values[column.id]).toLowerCase().includes(query))) return false;
      return columns.every((column) => matchesFilter(row.values[column.id] ?? null, column.type, filters[column.id] ?? EMPTY_FILTER));
    });
    if (!sort) return next;
    return [...next].sort((a, b) => {
      const column = columns.find((item) => item.id === sort.id);
      const av = a.values[sort.id];
      const bv = b.values[sort.id];
      let result = 0;
      if (column?.type === 'number') result = (numberValue(av) ?? Number.NEGATIVE_INFINITY) - (numberValue(bv) ?? Number.NEGATIVE_INFINITY);
      else if (column?.type === 'date') result = (dateValue(av) ?? Number.NEGATIVE_INFINITY) - (dateValue(bv) ?? Number.NEGATIVE_INFINITY);
      else result = text(av).localeCompare(text(bv), undefined, { numeric: true });
      return sort.direction === 'asc' ? result : -result;
    });
  }, [rows, visibleColumns, columns, filters, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedRows = filteredRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  function updateDataset(mutator: (grid: DatasetCell[][], nextColumns: DatasetColumn[]) => void) {
    setDataset((current) => {
      if (!current) return current;
      const grid = current.grid.map((row) => [...row]);
      const nextColumns = current.columns.map((column) => ({ ...column }));
      mutator(grid, nextColumns);
      const workbook = {
        ...current.workbook,
        sheets: current.workbook.sheets.map((sheet, index) => index === current.activeSheet ? { ...sheet, rows: grid, rowCount: Math.max(0, grid.length - current.headerRow - 1) } : sheet),
      };
      return { ...current, workbook, grid, columns: nextColumns, updatedAt: Date.now() };
    });
  }

  function editCell(record: GridRecord, column: DatasetColumn, value: string) {
    updateDataset((grid) => {
      if (!grid[record.__absolute]) grid[record.__absolute] = [];
      grid[record.__absolute][column.sourceIndex] = value;
    });
  }
  function renameColumn(column: DatasetColumn, name: string) {
    updateDataset((grid, nextColumns) => {
      const target = nextColumns.find((item) => item.id === column.id);
      if (target) target.name = name;
      if (!grid[dataset.headerRow]) grid[dataset.headerRow] = [];
      grid[dataset.headerRow][column.sourceIndex] = name;
    });
  }
  function updateColumn(column: DatasetColumn, patch: Partial<DatasetColumn>) {
    updateDataset((_grid, nextColumns) => {
      const target = nextColumns.find((item) => item.id === column.id);
      if (target) Object.assign(target, patch);
    });
  }
  function moveColumn(column: DatasetColumn, direction: -1 | 1) {
    setDataset((current) => {
      if (!current) return current;
      const next = current.columns.map((item) => ({ ...item }));
      const index = next.findIndex((item) => item.id === column.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, columns: next, updatedAt: Date.now() };
    });
  }
  function deleteColumn(column: DatasetColumn) {
    if (columns.length <= 1) return;
    setDataset((current) => current ? { ...current, columns: current.columns.filter((item) => item.id !== column.id), updatedAt: Date.now() } : current);
    setFilters((current) => { const copy = { ...current }; delete copy[column.id]; return copy; });
  }
  function cycleSort(id: string) {
    setSort((current) => !current || current.id !== id ? { id, direction: 'asc' } : current.direction === 'asc' ? { id, direction: 'desc' } : null);
  }
  function gridKey(event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') { void navigator.clipboard?.writeText(event.currentTarget.value); return; }
    if (event.key === 'Escape') { event.currentTarget.blur(); return; }
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [1, 0] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    document.querySelector<HTMLInputElement>(`[data-ugp-cell="${rowIndex + move[0]}:${columnIndex + move[1]}"]`)?.focus();
  }
  function exportGrid() {
    const header = visibleColumns.map((column) => csvCell(column.name)).join(',');
    const body = filteredRows.map((row) => visibleColumns.map((column) => csvCell(row.values[column.id])).join(','));
    downloadText(`${dataset.workbook.filename.replace(/\.[^.]+$/, '')}-filtered.csv`, [header, ...body].join('\n'), 'text/csv;charset=utf-8');
  }
  function clearFilters() { setFilters({}); setSearch(''); setPage(0); }

  const pivotSource = pivotFilteredOnly ? filteredRows : rows;
  const rowFields = [pivotRowA, pivotRowB].filter(Boolean);
  const pivot = useMemo(() => {
    if (!rowFields.length) return null;
    const rowKey = (record: GridRecord) => rowFields.map((field) => text(record.values[field]) || '(blank)').join('\u0001');
    const columnKey = (record: GridRecord) => pivotColumn ? text(record.values[pivotColumn]) || '(blank)' : 'Value';
    const rowKeys = [...new Set(pivotSource.map(rowKey))].sort();
    const columnKeys = [...new Set(pivotSource.map(columnKey))].sort();
    const cells = new Map<string, GridRecord[]>();
    pivotSource.forEach((record) => {
      const key = `${rowKey(record)}\u0000${columnKey(record)}`;
      const bucket = cells.get(key) ?? [];
      bucket.push(record);
      cells.set(key, bucket);
    });
    return { rowKeys: rowKeys.slice(0, 500), columnKeys: columnKeys.slice(0, 80), cells };
  }, [pivotSource, pivotRowA, pivotRowB, pivotColumn]);

  function updateMeasure(id: string, patch: Partial<Measure>) { setMeasures((current) => current.map((measure) => measure.id === id ? { ...measure, ...patch } : measure)); }
  function addMeasure() { setMeasures((current) => current.length >= 4 ? current : [...current, { id: `measure-${Date.now()}`, field: numericColumns[0]?.id ?? '', agg: numericColumns.length ? 'sum' : 'count' }]); }
  function saveView() {
    localStorage.setItem('docbox3-unified-grid-view', JSON.stringify({ filters, sort, frozenColumns, pivotRowA, pivotRowB, pivotColumn, measures, pivotFilteredOnly }));
  }
  function restoreView() {
    try {
      const saved = JSON.parse(localStorage.getItem('docbox3-unified-grid-view') || '{}');
      if (saved.filters) setFilters(saved.filters);
      if (saved.sort) setSort(saved.sort);
      if (saved.frozenColumns !== undefined) setFrozenColumns(saved.frozenColumns);
      if (saved.pivotRowA !== undefined) setPivotRowA(saved.pivotRowA);
      if (saved.pivotRowB !== undefined) setPivotRowB(saved.pivotRowB);
      if (saved.pivotColumn !== undefined) setPivotColumn(saved.pivotColumn);
      if (Array.isArray(saved.measures) && saved.measures.length) setMeasures(saved.measures);
      if (saved.pivotFilteredOnly !== undefined) setPivotFilteredOnly(Boolean(saved.pivotFilteredOnly));
    } catch { /* ignore invalid local view */ }
  }

  return (
    <main className="ugp-shell">
      <header className="ugp-topbar">
        <div><span>GRID & PIVOT LAB</span><strong>{dataset.workbook.filename}</strong><small>{activeSheet?.name} · {rows.length.toLocaleString()} rows · {columns.length} fields</small></div>
        <nav><button className={tab === 'grid' ? 'active' : ''} onClick={() => setTab('grid')}>Grid</button><button className={tab === 'pivot' ? 'active' : ''} onClick={() => setTab('pivot')}>Pivot</button></nav>
        <div className="ugp-actions"><button onClick={saveView}>Save view</button><button onClick={restoreView}>Restore</button><button onClick={exportGrid}>Export filtered CSV</button></div>
      </header>

      {tab === 'grid' ? (
        <section className="ugp-grid-workspace">
          <aside className="ugp-schema">
            <header><span>SCHEMA</span><strong>{columns.length} fields</strong></header>
            <div className="ugp-schema-list">{columns.map((column, index) => <article key={column.id} className={column.hidden ? 'hidden' : ''}>
              <div><b>{index + 1}</b><input value={column.name} onChange={(event) => renameColumn(column, event.target.value)} /></div>
              <div><select value={column.type} onChange={(event) => updateColumn(column, { type: event.target.value as DatasetColumnType })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="category">Category</option><option value="boolean">Boolean</option></select><button onClick={() => updateColumn(column, { hidden: !column.hidden })}>{column.hidden ? 'Show' : 'Hide'}</button></div>
              <footer><button disabled={index === 0} onClick={() => moveColumn(column, -1)}>↑</button><button disabled={index === columns.length - 1} onClick={() => moveColumn(column, 1)}>↓</button><button onClick={() => deleteColumn(column)}>Delete</button></footer>
            </article>)}</div>
          </aside>

          <div className="ugp-grid-stage">
            <div className="ugp-grid-toolbar">
              <label><span>Search all fields</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search current dataset…" /></label>
              <label><span>Frozen columns</span><select value={frozenColumns} onChange={(event) => setFrozenColumns(Number(event.target.value))}><option value="0">None</option><option value="1">1</option><option value="2">2</option></select></label>
              <button onClick={clearFilters}>Clear filters</button>
              <strong>{filteredRows.length.toLocaleString()} / {rows.length.toLocaleString()} rows</strong>
            </div>
            <div className={`ugp-grid-scroll freeze-${frozenColumns}`}>
              <table className="ugp-grid"><thead><tr><th className="row-number">#</th>{visibleColumns.map((column) => <th key={column.id}><button className="ugp-sort" onClick={() => cycleSort(column.id)}><strong>{column.name}</strong><small>{column.type}{sort?.id === column.id ? ` · ${sort.direction === 'asc' ? '↑' : '↓'}` : ''}</small></button><FilterControl column={column} filter={filters[column.id] ?? EMPTY_FILTER} values={distinctValues[column.id] ?? []} onChange={(next) => { setFilters((current) => ({ ...current, [column.id]: next })); setPage(0); }} /></th>)}</tr></thead>
                <tbody>{pagedRows.map((record, rowIndex) => <tr key={record.__absolute}><th className="row-number">{record.__absolute + 1}</th>{visibleColumns.map((column, columnIndex) => { const cellId = `${rowIndex}:${columnIndex}`; return <td key={column.id} className={activeCell === cellId ? 'active' : ''}><input data-ugp-cell={cellId} value={text(record.values[column.id])} onFocus={() => setActiveCell(cellId)} onChange={(event) => editCell(record, column, event.target.value)} onKeyDown={(event) => gridKey(event, rowIndex, columnIndex)} /></td>; })}</tr>)}</tbody>
              </table>
            </div>
            <footer className="ugp-pagination"><button disabled={currentPage === 0} onClick={() => setPage(Math.max(0, currentPage - 1))}>← Previous</button><span>Page {currentPage + 1} of {pageCount}</span><button disabled={currentPage >= pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}>Next →</button></footer>
          </div>
        </section>
      ) : (
        <section className="ugp-pivot-workspace">
          <aside className="ugp-pivot-fields">
            <header><span>PIVOT CONFIGURATION</span><strong>Fields</strong></header>
            <label><span>Rows 1</span><select value={pivotRowA} onChange={(event) => setPivotRowA(event.target.value)}><option value="">Choose field</option>{visibleColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
            <label><span>Rows 2</span><select value={pivotRowB} onChange={(event) => setPivotRowB(event.target.value)}><option value="">Optional</option>{visibleColumns.filter((column) => column.id !== pivotRowA).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
            <label><span>Columns</span><select value={pivotColumn} onChange={(event) => setPivotColumn(event.target.value)}><option value="">No column split</option>{visibleColumns.filter((column) => !rowFields.includes(column.id)).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
            <div className="ugp-measures"><div><span>MEASURES</span><button onClick={addMeasure}>+ Add</button></div>{measures.map((measure, index) => <article key={measure.id}><strong>Measure {index + 1}</strong><select value={measure.field} onChange={(event) => updateMeasure(measure.id, { field: event.target.value })}><option value="">Record count</option>{numericColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select><select value={measure.agg} onChange={(event) => updateMeasure(measure.id, { agg: event.target.value as Agg })}><option value="count">Count</option><option value="sum">Sum</option><option value="average">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select>{measures.length > 1 && <button onClick={() => setMeasures((current) => current.filter((item) => item.id !== measure.id))}>Remove</button>}</article>)}</div>
            <label className="ugp-check"><input type="checkbox" checked={pivotFilteredOnly} onChange={(event) => setPivotFilteredOnly(event.target.checked)} /><span>Use current typed filters</span></label>
            <small>Filters are configured in Grid mode. Pivot drill-down always opens the contributing source rows.</small>
          </aside>

          <div className="ugp-pivot-stage">
            <header><div><span>PIVOT RESULT</span><strong>{pivotSource.length.toLocaleString()} contributing rows</strong></div><button onClick={() => setTab('grid')}>Edit filters in Grid</button></header>
            {!pivot ? <div className="ugp-pivot-empty"><strong>Choose at least one Row field.</strong><span>Add one or more measures to summarize the dataset.</span></div> : <div className="ugp-pivot-scroll"><table><thead><tr><th>{rowFields.map((id) => columns.find((column) => column.id === id)?.name).join(' / ')}</th>{pivot.columnKeys.flatMap((columnKey) => measures.map((measure) => <th key={`${columnKey}-${measure.id}`}><strong>{pivotColumn ? columnKey : columns.find((column) => column.id === measure.field)?.name || 'Records'}</strong><small>{measure.agg}</small></th>))}</tr></thead><tbody>{pivot.rowKeys.map((rowKey) => <tr key={rowKey}><th>{rowKey.split('\u0001').join(' / ')}</th>{pivot.columnKeys.flatMap((columnKey) => measures.map((measure) => { const records = pivot.cells.get(`${rowKey}\u0000${columnKey}`) ?? []; const value = aggregate(records, measure.field, measure.agg); return <td key={`${columnKey}-${measure.id}`}><button disabled={!records.length} onClick={() => setDetail({ title: `${rowKey.split('\u0001').join(' / ')} · ${columnKey}`, records })}>{formatNumber(value)}<small>{records.length} rows</small></button></td>; }))}</tr>)}</tbody></table></div>}
          </div>
        </section>
      )}

      {detail && <div className="ugp-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="ugp-detail"><header><div><span>DRILL-DOWN</span><strong>{detail.title}</strong><small>{detail.records.length.toLocaleString()} contributing rows</small></div><button onClick={() => setDetail(null)}>×</button></header><div><table><thead><tr><th>#</th>{visibleColumns.map((column) => <th key={column.id}>{column.name}</th>)}</tr></thead><tbody>{detail.records.slice(0, 500).map((record) => <tr key={record.__absolute}><th>{record.__absolute + 1}</th>{visibleColumns.map((column) => <td key={column.id}>{text(record.values[column.id])}</td>)}</tr>)}</tbody></table></div></section></div>}
    </main>
  );
}
