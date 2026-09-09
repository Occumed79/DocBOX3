'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { type DatasetCell, type DatasetColumn, useDataset } from './DatasetContext';

type VisualType = 'bar' | 'column' | 'line' | 'area' | 'scatter' | 'pie' | 'donut' | 'range' | 'waterfall' | 'map' | 'kpi';
type Agg = 'count' | 'sum' | 'average' | 'min' | 'max';
type SortMode = 'none' | 'asc' | 'desc';
type Mapping = { category: string; value: string; series: string; x: string; y: string; size: string; group: string; label: string; start: string; end: string; lat: string; lon: string; metric: string };
type SemanticVisual = { id: string; type: VisualType; title: string; mapping: Mapping; aggregation: Agg; sort: SortMode; topN: number; includeNulls: boolean; createdAt: number };
type ElementType = 'visual' | 'kpi' | 'table' | 'heading' | 'text' | 'callout' | 'divider';
type ReportElement = { id: string; type: ElementType; span: 4 | 6 | 8 | 12; content: string; visualId?: string; field?: string; aggregation?: Agg; columns?: string[]; label?: string };
type ReportPage = { id: string; name: string; elements: ReportElement[] };

type DataRow = { absolute: number; values: Record<string, DatasetCell> };

const VISUAL_STORE = 'docbox3-semantic-visuals-v1';
const REPORT_STORE = 'docbox3-report-pages-v1';
const DEFAULT_MAPPING: Mapping = { category: '', value: '', series: '', x: '', y: '', size: '', group: '', label: '', start: '', end: '', lat: '', lon: '', metric: '' };
const VISUALS: Array<{ id: VisualType; name: string; family: string }> = [
  { id: 'bar', name: 'Bar', family: 'Compare' }, { id: 'column', name: 'Column', family: 'Compare' },
  { id: 'line', name: 'Line', family: 'Trend' }, { id: 'area', name: 'Area', family: 'Trend' },
  { id: 'scatter', name: 'Scatter', family: 'Relationship' }, { id: 'pie', name: 'Pie', family: 'Composition' },
  { id: 'donut', name: 'Donut', family: 'Composition' }, { id: 'range', name: 'Range', family: 'Distribution' },
  { id: 'waterfall', name: 'Waterfall', family: 'Change' }, { id: 'map', name: 'Coordinate map', family: 'Geographic' },
  { id: 'kpi', name: 'KPI', family: 'Summary' },
];

const text = (value: unknown) => value == null ? '' : String(value);
function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = text(value).trim().replace(/[,$%]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
function aggregate(values: number[], agg: Agg) {
  if (agg === 'count') return values.length;
  if (!values.length) return 0;
  if (agg === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (agg === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (agg === 'min') return Math.min(...values);
  return Math.max(...values);
}
function format(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, notation: Math.abs(value) >= 100000 ? 'compact' : 'standard' }).format(value);
}
function project(lon: number, lat: number) { return { x: 55 + ((lon + 180) / 360) * 790, y: 35 + ((90 - lat) / 180) * 370 }; }

function makeRows(grid: DatasetCell[][], headerRow: number, columns: DatasetColumn[]) {
  return grid.slice(headerRow + 1).flatMap((row, index): DataRow[] => {
    if (!row.some((value) => text(value).trim() !== '')) return [];
    const values: Record<string, DatasetCell> = {};
    columns.forEach((column) => { values[column.id] = row[column.sourceIndex] ?? null; });
    return [{ absolute: headerRow + 1 + index, values }];
  });
}

function mappedRows(visual: SemanticVisual, rows: DataRow[]) {
  if (visual.includeNulls) return rows;
  const required = visual.type === 'scatter' ? [visual.mapping.x, visual.mapping.y]
    : visual.type === 'range' ? [visual.mapping.category, visual.mapping.start, visual.mapping.end]
      : visual.type === 'map' ? [visual.mapping.lat, visual.mapping.lon]
        : visual.type === 'kpi' ? [visual.mapping.metric]
          : [visual.mapping.category, visual.mapping.value].filter(Boolean);
  return rows.filter((row) => required.every((id) => !id || text(row.values[id]).trim() !== ''));
}

function CategoryPreview({ visual, rows, columns }: { visual: SemanticVisual; rows: DataRow[]; columns: DatasetColumn[] }) {
  const category = visual.mapping.category;
  const value = visual.mapping.value;
  if (!category || (visual.aggregation !== 'count' && !value)) return <div className="pt-empty">Map Category and Value fields.</div>;
  const buckets = new Map<string, number[]>();
  mappedRows(visual, rows).forEach((row) => {
    const key = text(row.values[category]).trim() || '(blank)';
    const numeric = visual.aggregation === 'count' ? 1 : numberValue(row.values[value]);
    if (numeric === null) return;
    const bucket = buckets.get(key) ?? [];
    bucket.push(numeric);
    buckets.set(key, bucket);
  });
  let items = [...buckets.entries()].map(([label, values]) => ({ label, value: aggregate(values, visual.aggregation) }));
  if (visual.sort === 'asc') items.sort((a, b) => a.value - b.value);
  if (visual.sort === 'desc') items.sort((a, b) => b.value - a.value);
  items = items.slice(0, visual.topN);
  if (!items.length) return <div className="pt-empty">No compatible values.</div>;
  const max = Math.max(1, ...items.map((item) => Math.abs(item.value)));
  const type = visual.type;

  if (type === 'pie' || type === 'donut') {
    const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
    const radius = 108, circumference = Math.PI * 2 * radius; let offset = 0;
    return <svg className="pt-svg" viewBox="0 0 900 440"><g transform="rotate(-90 265 220)">{items.map((item, index) => { const ratio = Math.max(0, item.value) / total; const length = circumference * ratio; const dashOffset = -circumference * offset; offset += ratio; return <circle key={item.label} cx="265" cy="220" r={radius} fill="none" className={`pt-series s-${index % 8}`} strokeWidth={type === 'donut' ? 56 : 108} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={dashOffset} />; })}</g>{type === 'donut' && <circle cx="265" cy="220" r="78" className="pt-donut-hole"/>}{items.slice(0, 7).map((item, index) => <g key={item.label} transform={`translate(520 ${78 + index * 44})`}><rect width="12" height="12" rx="3" className={`pt-fill s-${index % 8}`} /><text x="22" y="11">{item.label.slice(0, 24)}</text><text x="320" y="11" textAnchor="end">{format(item.value)}</text></g>)}</svg>;
  }

  if (type === 'waterfall') {
    let running = 0; const steps = items.map((item) => { const start = running; running += item.value; return { ...item, start, end: running }; });
    const min = Math.min(0, ...steps.flatMap((step) => [step.start, step.end])); const upper = Math.max(1, ...steps.flatMap((step) => [step.start, step.end])); const range = upper - min || 1;
    return <svg className="pt-svg" viewBox="0 0 900 440">{steps.map((step, index) => { const group = 760 / steps.length; const x = 80 + index * group + group * .18; const width = group * .64; const yA = 365 - ((step.start - min) / range) * 300; const yB = 365 - ((step.end - min) / range) * 300; return <g key={step.label}><rect x={x} y={Math.min(yA, yB)} width={width} height={Math.max(3, Math.abs(yA - yB))} rx="4" className={step.value >= 0 ? 'pt-positive' : 'pt-negative'} /><text x={x + width / 2} y="400" textAnchor="middle">{step.label.slice(0, 10)}</text></g>; })}</svg>;
  }

  if (type === 'line' || type === 'area') {
    const points = items.map((item, index) => ({ x: 70 + (items.length === 1 ? 380 : index * 760 / (items.length - 1)), y: 360 - (item.value / max) * 300, item }));
    const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
    return <svg className="pt-svg" viewBox="0 0 900 440">{[0, .25, .5, .75, 1].map((tick) => <line key={tick} x1="70" x2="830" y1={360 - tick * 300} y2={360 - tick * 300} className="pt-gridline" />)}{type === 'area' && <polygon points={`70,360 ${polyline} 830,360`} className="pt-area" />}<polyline points={polyline} className="pt-line" />{points.map((point) => <g key={point.item.label}><circle cx={point.x} cy={point.y} r="5" className="pt-point"/><text x={point.x} y="396" textAnchor="middle">{point.item.label.slice(0, 9)}</text><title>{point.item.label}: {format(point.item.value)}</title></g>)}</svg>;
  }

  if (type === 'column') {
    const group = 760 / items.length;
    return <svg className="pt-svg" viewBox="0 0 900 440">{items.map((item, index) => { const height = Math.abs(item.value) / max * 300; const x = 70 + index * group + group * .16; return <g key={item.label}><rect x={x} y={360 - height} width={group * .68} height={height} rx="5" className={`pt-fill s-${index % 8}`} /><text x={x + group * .34} y="396" textAnchor="middle">{item.label.slice(0, 9)}</text><title>{item.label}: {format(item.value)}</title></g>; })}</svg>;
  }

  const rowHeight = Math.min(42, 340 / items.length);
  return <svg className="pt-svg" viewBox="0 0 900 440">{items.map((item, index) => { const y = 44 + index * rowHeight; const width = Math.abs(item.value) / max * 590; return <g key={item.label}><text x="18" y={y + 12}>{item.label.slice(0, 27)}</text><rect x="235" y={y - 6} width={width} height="18" rx="5" className={`pt-fill s-${index % 8}`} /><text x={245 + width} y={y + 10}>{format(item.value)}</text></g>; })}</svg>;
}

function ScatterPreview({ visual, rows }: { visual: SemanticVisual; rows: DataRow[] }) {
  const { x, y, size, label } = visual.mapping;
  if (!x || !y) return <div className="pt-empty">Map X and Y fields.</div>;
  const points = mappedRows(visual, rows).flatMap((row) => { const xv = numberValue(row.values[x]), yv = numberValue(row.values[y]); if (xv === null || yv === null) return []; return [{ x: xv, y: yv, size: size ? numberValue(row.values[size]) ?? 1 : 1, label: label ? text(row.values[label]) : '' }]; }).slice(0, 1800);
  if (!points.length) return <div className="pt-empty">No numeric X/Y pairs.</div>;
  const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x)), minY = Math.min(...points.map((point) => point.y)), maxY = Math.max(...points.map((point) => point.y));
  const minSize = Math.min(...points.map((point) => point.size)), maxSize = Math.max(...points.map((point) => point.size));
  return <svg className="pt-svg" viewBox="0 0 900 440">{[0, .25, .5, .75, 1].map((tick) => <line key={tick} x1="70" x2="840" y1={370 - tick * 320} y2={370 - tick * 320} className="pt-gridline" />)}{points.map((point, index) => { const cx = 70 + ((point.x - minX) / (maxX - minX || 1)) * 770; const cy = 370 - ((point.y - minY) / (maxY - minY || 1)) * 320; const radius = 4 + ((point.size - minSize) / (maxSize - minSize || 1)) * 11; return <circle key={index} cx={cx} cy={cy} r={radius} className={`pt-fill s-${index % 8}`} opacity=".7"><title>{point.label ? `${point.label} · ` : ''}X ${format(point.x)} · Y ${format(point.y)}</title></circle>; })}</svg>;
}

function RangePreview({ visual, rows }: { visual: SemanticVisual; rows: DataRow[] }) {
  const { category, start, end } = visual.mapping;
  if (!category || !start || !end) return <div className="pt-empty">Map Category, Start and End fields.</div>;
  const items = mappedRows(visual, rows).flatMap((row) => { const a = numberValue(row.values[start]), b = numberValue(row.values[end]); return a === null || b === null ? [] : [{ label: text(row.values[category]) || '(blank)', a, b }]; }).slice(0, visual.topN);
  if (!items.length) return <div className="pt-empty">No compatible ranges.</div>;
  const min = Math.min(...items.flatMap((item) => [item.a, item.b])), max = Math.max(...items.flatMap((item) => [item.a, item.b])); const range = max - min || 1; const rowHeight = Math.min(40, 330 / items.length);
  return <svg className="pt-svg" viewBox="0 0 900 440">{items.map((item, index) => { const y = 48 + index * rowHeight; const xA = 245 + ((item.a - min) / range) * 570; const xB = 245 + ((item.b - min) / range) * 570; return <g key={`${item.label}-${index}`}><text x="18" y={y + 7}>{item.label.slice(0, 26)}</text><line x1={xA} x2={xB} y1={y} y2={y} className="pt-range"/><circle cx={xA} cy={y} r="6" className="pt-range-start"/><circle cx={xB} cy={y} r="6" className="pt-range-end"/><title>{item.label}: {format(item.a)} → {format(item.b)}</title></g>; })}</svg>;
}

function MapPreview({ visual, rows }: { visual: SemanticVisual; rows: DataRow[] }) {
  const { lat, lon, size, label } = visual.mapping;
  if (!lat || !lon) return <div className="pt-empty">Map Latitude and Longitude fields.</div>;
  const points = mappedRows(visual, rows).flatMap((row, index) => { const latitude = numberValue(row.values[lat]), longitude = numberValue(row.values[lon]); if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return []; return [{ latitude, longitude, size: size ? Math.abs(numberValue(row.values[size]) ?? 1) : 1, label: label ? text(row.values[label]) : `Row ${index + 1}` }]; }).slice(0, 2500);
  const max = Math.max(1, ...points.map((point) => point.size));
  return <svg className="pt-svg pt-map" viewBox="0 0 900 440"><rect x="30" y="20" width="840" height="400" rx="18" className="pt-map-bg"/>{[-120,-60,0,60,120].map((longitude) => { const p = project(longitude, 0); return <line key={longitude} x1={p.x} x2={p.x} y1="35" y2="405" className="pt-gridline"/>; })}{[-60,-30,0,30,60].map((latitude) => { const p = project(0, latitude); return <line key={latitude} x1="55" x2="845" y1={p.y} y2={p.y} className="pt-gridline"/>; })}{points.map((point, index) => { const p = project(point.longitude, point.latitude); return <circle key={index} cx={p.x} cy={p.y} r={3 + Math.sqrt(point.size / max) * 10} className={`pt-fill s-${index % 8}`} opacity=".72"><title>{point.label} · {point.latitude.toFixed(3)}, {point.longitude.toFixed(3)}</title></circle>; })}</svg>;
}

function KPI({ visual, rows }: { visual: SemanticVisual; rows: DataRow[] }) {
  const field = visual.mapping.metric;
  if (visual.aggregation !== 'count' && !field) return <div className="pt-empty">Map a Metric field.</div>;
  const values = field ? mappedRows(visual, rows).map((row) => numberValue(row.values[field])).filter((value): value is number => value !== null) : rows.map(() => 1);
  const value = aggregate(values, visual.aggregation);
  return <div className="pt-kpi"><span>{visual.title || 'Key metric'}</span><strong>{format(value)}</strong><small>{visual.aggregation}{field ? ` · ${field}` : ' · records'}</small></div>;
}

function VisualPreview({ visual, rows, columns }: { visual: SemanticVisual; rows: DataRow[]; columns: DatasetColumn[] }) {
  if (visual.type === 'scatter') return <ScatterPreview visual={visual} rows={rows}/>;
  if (visual.type === 'range') return <RangePreview visual={visual} rows={rows}/>;
  if (visual.type === 'map') return <MapPreview visual={visual} rows={rows}/>;
  if (visual.type === 'kpi') return <KPI visual={visual} rows={rows}/>;
  return <CategoryPreview visual={visual} rows={rows} columns={columns}/>;
}

function MappingControls({ visual, columns, onChange }: { visual: SemanticVisual; columns: DatasetColumn[]; onChange: (visual: SemanticVisual) => void }) {
  const visible = columns.filter((column) => !column.hidden);
  const numeric = visible.filter((column) => column.type === 'number');
  const mapping = visual.mapping;
  const field = (key: keyof Mapping, label: string, options = visible, optional = false) => <label><span>{label}</span><select value={mapping[key]} onChange={(event) => onChange({ ...visual, mapping: { ...mapping, [key]: event.target.value } })}><option value="">{optional ? 'Optional' : 'Choose field'}</option>{options.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>;
  return <div className="pt-mappings">
    {['bar','column','line','area','pie','donut','waterfall'].includes(visual.type) && <>{field('category', visual.type === 'line' || visual.type === 'area' ? 'X / Date' : visual.type === 'waterfall' ? 'Step / Category' : 'Category')}{field('value', 'Value', numeric, visual.aggregation === 'count')}{['bar','column','line','area'].includes(visual.type) && field('series', 'Series / Group', visible, true)}</>}
    {visual.type === 'scatter' && <>{field('x', 'X', numeric)}{field('y', 'Y', numeric)}{field('size', 'Size', numeric, true)}{field('group', 'Group', visible, true)}{field('label', 'Label', visible, true)}</>}
    {visual.type === 'range' && <>{field('category', 'Category')}{field('start', 'Start', numeric)}{field('end', 'End', numeric)}</>}
    {visual.type === 'map' && <>{field('lat', 'Latitude', numeric)}{field('lon', 'Longitude', numeric)}{field('size', 'Point size', numeric, true)}{field('group', 'Category', visible, true)}{field('label', 'Label', visible, true)}</>}
    {visual.type === 'kpi' && field('metric', 'Metric', numeric, visual.aggregation === 'count')}
  </div>;
}

function ReportElementView({ element, rows, columns, visuals }: { element: ReportElement; rows: DataRow[]; columns: DatasetColumn[]; visuals: SemanticVisual[] }) {
  if (element.type === 'divider') return <hr className="pt-report-divider"/>;
  if (element.type === 'heading') return <h2 className="pt-report-heading">{element.content || 'Heading'}</h2>;
  if (element.type === 'text') return <p className="pt-report-text">{element.content || 'Narrative text'}</p>;
  if (element.type === 'callout') return <aside className="pt-report-callout">{element.content || 'Key finding'}</aside>;
  if (element.type === 'visual') { const visual = visuals.find((item) => item.id === element.visualId); return visual ? <div className="pt-report-visual"><h3>{visual.title}</h3><VisualPreview visual={visual} rows={rows} columns={columns}/></div> : <div className="pt-empty">Choose a saved visual.</div>; }
  if (element.type === 'kpi') {
    const values = element.field ? rows.map((row) => numberValue(row.values[element.field!])).filter((value): value is number => value !== null) : rows.map(() => 1);
    return <div className="pt-report-kpi"><span>{element.label || columns.find((column) => column.id === element.field)?.name || 'Records'}</span><strong>{format(aggregate(values, element.aggregation || 'count'))}</strong><small>{element.aggregation || 'count'}</small></div>;
  }
  const selected = (element.columns || []).map((id) => columns.find((column) => column.id === id)).filter((column): column is DatasetColumn => Boolean(column));
  return <div className="pt-report-table"><table><thead><tr>{selected.map((column) => <th key={column.id}>{column.name}</th>)}</tr></thead><tbody>{rows.slice(0, 20).map((row) => <tr key={row.absolute}>{selected.map((column) => <td key={column.id}>{text(row.values[column.id])}</td>)}</tr>)}</tbody></table></div>;
}

export default function DataStudioPowerTools() {
  const pathname = usePathname();
  const { dataset } = useDataset();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'visual' | 'report'>('visual');
  const [visual, setVisual] = useState<SemanticVisual>({ id: 'builder', type: 'bar', title: 'Untitled visual', mapping: DEFAULT_MAPPING, aggregation: 'sum', sort: 'desc', topN: 10, includeNulls: false, createdAt: Date.now() });
  const [visuals, setVisuals] = useState<SemanticVisual[]>([]);
  const [pages, setPages] = useState<ReportPage[]>([{ id: 'page-1', name: 'Page 1', elements: [] }]);
  const [activePageId, setActivePageId] = useState('page-1');
  const [selectedElement, setSelectedElement] = useState('');

  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(VISUAL_STORE) || '[]'); if (Array.isArray(saved)) setVisuals(saved); const report = JSON.parse(localStorage.getItem(REPORT_STORE) || '[]'); if (Array.isArray(report) && report.length) { setPages(report); setActivePageId(report[0].id); } } catch { /* ignore invalid stored project */ } }, []);
  useEffect(() => { try { localStorage.setItem(VISUAL_STORE, JSON.stringify(visuals)); } catch { /* storage is best-effort */ } }, [visuals]);
  useEffect(() => { try { localStorage.setItem(REPORT_STORE, JSON.stringify(pages)); } catch { /* storage is best-effort */ } }, [pages]);

  if (!pathname.startsWith('/vault/studio') || !dataset) return null;
  const columns = dataset.columns.filter((column) => !column.hidden);
  const numericColumns = columns.filter((column) => column.type === 'number');
  const rows = useMemo(() => makeRows(dataset.grid, dataset.headerRow, dataset.columns), [dataset.grid, dataset.headerRow, dataset.columns]);
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
  const activeElement = activePage?.elements.find((element) => element.id === selectedElement);

  function chooseType(type: VisualType) {
    const categorical = columns.find((column) => column.type !== 'number')?.id ?? columns[0]?.id ?? '';
    const numeric = numericColumns[0]?.id ?? '';
    const nextMapping = { ...DEFAULT_MAPPING };
    if (['bar','column','line','area','pie','donut','waterfall'].includes(type)) { nextMapping.category = categorical; nextMapping.value = numeric; }
    if (type === 'scatter') { nextMapping.x = numericColumns[0]?.id ?? ''; nextMapping.y = numericColumns[1]?.id ?? numeric; nextMapping.size = numericColumns[2]?.id ?? ''; nextMapping.label = categorical; }
    if (type === 'range') { nextMapping.category = categorical; nextMapping.start = numericColumns[0]?.id ?? ''; nextMapping.end = numericColumns[1]?.id ?? ''; }
    if (type === 'map') { nextMapping.lat = columns.find((column) => /lat/i.test(column.name))?.id ?? ''; nextMapping.lon = columns.find((column) => /lon|lng|long/i.test(column.name))?.id ?? ''; nextMapping.size = numeric; nextMapping.label = categorical; }
    if (type === 'kpi') nextMapping.metric = numeric;
    setVisual((current) => ({ ...current, type, mapping: nextMapping, aggregation: type === 'kpi' && !numeric ? 'count' : current.aggregation }));
  }
  function saveVisual() {
    const saved = { ...visual, id: `semantic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: visual.title.trim() || VISUALS.find((item) => item.id === visual.type)?.name || 'Visualization', createdAt: Date.now() };
    setVisuals((current) => [saved, ...current]);
    setVisual({ ...saved, id: 'builder' });
  }
  function updatePage(mutator: (page: ReportPage) => ReportPage) { setPages((current) => current.map((page) => page.id === activePageId ? mutator(page) : page)); }
  function addElement(type: ElementType) {
    if (!activePage) return;
    const element: ReportElement = { id: `element-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, type, span: type === 'divider' ? 12 : type === 'kpi' ? 4 : 6, content: type === 'heading' ? 'Section heading' : type === 'text' ? 'Add narrative context…' : type === 'callout' ? 'Key finding or analyst note' : '', visualId: type === 'visual' ? visuals[0]?.id : undefined, field: type === 'kpi' ? numericColumns[0]?.id : undefined, aggregation: type === 'kpi' ? (numericColumns.length ? 'sum' : 'count') : undefined, columns: type === 'table' ? columns.slice(0, 5).map((column) => column.id) : undefined };
    updatePage((page) => ({ ...page, elements: [...page.elements, element] }));
    setSelectedElement(element.id);
  }
  function patchElement(id: string, patch: Partial<ReportElement>) { updatePage((page) => ({ ...page, elements: page.elements.map((element) => element.id === id ? { ...element, ...patch } : element) })); }
  function moveElement(id: string, direction: -1 | 1) { updatePage((page) => { const elements = [...page.elements]; const index = elements.findIndex((element) => element.id === id); const target = index + direction; if (index < 0 || target < 0 || target >= elements.length) return page; [elements[index], elements[target]] = [elements[target], elements[index]]; return { ...page, elements }; }); }
  function duplicateElement(id: string) { updatePage((page) => { const index = page.elements.findIndex((element) => element.id === id); if (index < 0) return page; const copy = { ...page.elements[index], id: `element-${Date.now()}` }; const elements = [...page.elements]; elements.splice(index + 1, 0, copy); return { ...page, elements }; }); }
  function addPage() { const page = { id: `page-${Date.now()}`, name: `Page ${pages.length + 1}`, elements: [] as ReportElement[] }; setPages((current) => [...current, page]); setActivePageId(page.id); }
  function duplicatePage() { if (!activePage) return; const copy = { ...activePage, id: `page-${Date.now()}`, name: `${activePage.name} copy`, elements: activePage.elements.map((element) => ({ ...element, id: `element-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` })) }; setPages((current) => [...current, copy]); setActivePageId(copy.id); }
  function deletePage() { if (pages.length <= 1 || !activePage) return; const next = pages.filter((page) => page.id !== activePage.id); setPages(next); setActivePageId(next[0].id); }
  function movePage(direction: -1 | 1) { const index = pages.findIndex((page) => page.id === activePageId); const target = index + direction; if (index < 0 || target < 0 || target >= pages.length) return; const copy = [...pages]; [copy[index], copy[target]] = [copy[target], copy[index]]; setPages(copy); }

  return <>
    <button className={`pt-launch ${open ? 'open' : ''}`} onClick={() => setOpen((value) => !value)}><span>✦</span><strong>Power tools</strong><small>{mode === 'visual' ? 'Semantic builder' : `${pages.length} report page${pages.length === 1 ? '' : 's'}`}</small></button>
    {open && <section className="pt-drawer">
      <header className="pt-head"><div><span>DOCBOX3 AUTHORING</span><strong>{mode === 'visual' ? 'Semantic visualization builder' : 'Multi-page report canvas'}</strong></div><nav><button className={mode === 'visual' ? 'active' : ''} onClick={() => setMode('visual')}>Visual</button><button className={mode === 'report' ? 'active' : ''} onClick={() => setMode('report')}>Report</button><button onClick={() => setOpen(false)}>×</button></nav></header>
      {mode === 'visual' ? <div className="pt-visual-workspace">
        <aside className="pt-visual-types"><span>VISUAL TYPE</span>{VISUALS.map((item) => <button key={item.id} className={visual.type === item.id ? 'active' : ''} onClick={() => chooseType(item.id)}><i className={`pt-mini type-${item.id}`}/><b>{item.name}</b><small>{item.family}</small></button>)}</aside>
        <main className="pt-stage"><header><input value={visual.title} onChange={(event) => setVisual((current) => ({ ...current, title: event.target.value }))}/><span>LIVE · {rows.length.toLocaleString()} rows</span></header><div className="pt-preview"><VisualPreview visual={visual} rows={rows} columns={columns}/></div><footer><span>{dataset.workbook.filename}</span><button onClick={saveVisual}>Save visual</button></footer></main>
        <aside className="pt-inspector"><header><span>FIELD MAPPING</span><strong>{VISUALS.find((item) => item.id === visual.type)?.name}</strong></header><MappingControls visual={visual} columns={columns} onChange={setVisual}/><label><span>Aggregation</span><select value={visual.aggregation} onChange={(event) => setVisual((current) => ({ ...current, aggregation: event.target.value as Agg }))}><option value="count">Count</option><option value="sum">Sum</option><option value="average">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label>{!['scatter','range','map','kpi'].includes(visual.type) && <label><span>Sort</span><select value={visual.sort} onChange={(event) => setVisual((current) => ({ ...current, sort: event.target.value as SortMode }))}><option value="none">Dataset order</option><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>}<label><span>Top N</span><select value={visual.topN} onChange={(event) => setVisual((current) => ({ ...current, topN: Number(event.target.value) }))}>{[5,10,15,25,50,100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="pt-check"><input type="checkbox" checked={visual.includeNulls} onChange={(event) => setVisual((current) => ({ ...current, includeNulls: event.target.checked }))}/><span>Include null / blank records</span></label><div className="pt-saved"><div><span>SAVED</span><strong>{visuals.length}</strong></div>{visuals.slice(0, 8).map((saved) => <article key={saved.id}><button onClick={() => setVisual({ ...saved, id: 'builder' })}><b>{saved.title}</b><small>{saved.type} · {saved.aggregation}</small></button><button onClick={() => setVisuals((current) => current.filter((item) => item.id !== saved.id))}>×</button></article>)}</div></aside>
      </div> : <div className="pt-report-workspace">
        <aside className="pt-pages"><header><span>PAGES</span><button onClick={addPage}>+ Add</button></header>{pages.map((page, index) => <button key={page.id} className={page.id === activePageId ? 'active' : ''} onClick={() => { setActivePageId(page.id); setSelectedElement(''); }}><b>{String(index + 1).padStart(2, '0')}</b><span>{page.name}</span></button>)}<div className="pt-page-actions"><button onClick={() => movePage(-1)}>↑</button><button onClick={() => movePage(1)}>↓</button><button onClick={duplicatePage}>Duplicate</button><button onClick={deletePage}>Delete</button></div><label><span>Page name</span><input value={activePage?.name || ''} onChange={(event) => updatePage((page) => ({ ...page, name: event.target.value }))}/></label><div className="pt-add-elements"><span>ADD ELEMENT</span>{(['visual','kpi','table','heading','text','callout','divider'] as ElementType[]).map((type) => <button key={type} onClick={() => addElement(type)}>{type}</button>)}</div></aside>
        <main className="pt-report-stage"><header><div><span>REPORT CANVAS</span><strong>{activePage?.name}</strong></div><button onClick={() => window.print()}>Print / Save PDF</button></header><article className="pt-report-page"><div className="pt-report-grid">{activePage?.elements.map((element) => <section key={element.id} className={`pt-report-block ${selectedElement === element.id ? 'selected' : ''}`} style={{ gridColumn: `span ${element.span}` }} onClick={() => setSelectedElement(element.id)}><ReportElementView element={element} rows={rows} columns={columns} visuals={visuals}/><div className="pt-block-tools"><button onClick={(event) => { event.stopPropagation(); moveElement(element.id, -1); }}>↑</button><button onClick={(event) => { event.stopPropagation(); moveElement(element.id, 1); }}>↓</button><span>{element.span}/12</span></div></section>)}</div>{!activePage?.elements.length && <div className="pt-report-empty"><strong>Build this page.</strong><span>Add saved visuals, KPIs, tables, headings, text and callouts from the left.</span></div>}</article></main>
        <aside className="pt-element-inspector"><header><span>ELEMENT</span><strong>{activeElement?.type || 'Nothing selected'}</strong></header>{activeElement ? <>{['heading','text','callout'].includes(activeElement.type) && <label><span>Content</span><textarea rows={8} value={activeElement.content} onChange={(event) => patchElement(activeElement.id, { content: event.target.value })}/></label>}{activeElement.type === 'visual' && <label><span>Saved visual</span><select value={activeElement.visualId || ''} onChange={(event) => patchElement(activeElement.id, { visualId: event.target.value })}><option value="">Choose visual</option>{visuals.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}{activeElement.type === 'kpi' && <><label><span>Metric</span><select value={activeElement.field || ''} onChange={(event) => patchElement(activeElement.id, { field: event.target.value })}><option value="">Record count</option>{numericColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label><label><span>Aggregation</span><select value={activeElement.aggregation || 'count'} onChange={(event) => patchElement(activeElement.id, { aggregation: event.target.value as Agg })}><option value="count">Count</option><option value="sum">Sum</option><option value="average">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label><label><span>Label</span><input value={activeElement.label || ''} onChange={(event) => patchElement(activeElement.id, { label: event.target.value })}/></label></>}{activeElement.type === 'table' && <div className="pt-table-fields"><span>COLUMNS</span>{columns.map((column) => { const checked = activeElement.columns?.includes(column.id) ?? false; return <label key={column.id}><input type="checkbox" checked={checked} onChange={(event) => patchElement(activeElement.id, { columns: event.target.checked ? [...(activeElement.columns || []), column.id] : (activeElement.columns || []).filter((id) => id !== column.id) })}/><span>{column.name}</span></label>; })}</div>}<label><span>Width</span><select value={activeElement.span} onChange={(event) => patchElement(activeElement.id, { span: Number(event.target.value) as 4 | 6 | 8 | 12 })}><option value="12">Full</option><option value="8">2/3</option><option value="6">1/2</option><option value="4">1/3</option></select></label><div className="pt-element-actions"><button onClick={() => duplicateElement(activeElement.id)}>Duplicate</button><button onClick={() => { updatePage((page) => ({ ...page, elements: page.elements.filter((item) => item.id !== activeElement.id) })); setSelectedElement(''); }}>Remove</button></div></> : <p>Select an element on the page to edit its content, data source and width.</p>}</aside>
      </div>}
    </section>}
  </>;
}
