'use client';

import { useMemo, useRef, useState } from 'react';

type CellValue = string | number | boolean | null;
type ParsedSheet = { name: string; rows: CellValue[][]; rowCount: number; truncated: boolean };
type ParsedWorkbook = { filename: string; sheets: ParsedSheet[] };
type LayerType = 'scatter' | 'hexagon' | 'grid' | 'heatmap' | 'contour' | 'columns' | 'arcs' | 'trips';
type Column = { index: number; name: string; numeric: boolean };
type Point = { lat: number; lon: number; value: number; label: string; index: number };
type Flow = { sourceLat: number; sourceLon: number; targetLat: number; targetLon: number; value: number; label: string; index: number };

const LAYERS: Array<{ id: LayerType; name: string; family: string; note: string }> = [
  { id: 'scatter', name: 'Point layer', family: 'Points', note: 'Location signals sized by an optional measure' },
  { id: 'hexagon', name: 'Hexagon aggregation', family: 'Density', note: 'Aggregate nearby records into geographic hex cells' },
  { id: 'grid', name: 'Grid aggregation', family: 'Density', note: 'Bin observations into a regular geographic grid' },
  { id: 'heatmap', name: 'Heat surface', family: 'Density', note: 'Continuous intensity field from point observations' },
  { id: 'contour', name: 'Density contours', family: 'Density', note: 'Threshold bands around dense geographic activity' },
  { id: 'columns', name: 'Extruded columns', family: '3D', note: 'Raise geographic cells by magnitude' },
  { id: 'arcs', name: 'Arc / flow map', family: 'Movement', note: 'Connect origin and destination coordinates' },
  { id: 'trips', name: 'Animated trips', family: 'Movement', note: 'Animate movement along origin-destination paths' },
];

const str = (value: CellValue) => (value == null ? '' : String(value));
const numberValue = (value: CellValue): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(str(value).replace(/[,$%]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

function inferColumns(rows: CellValue[][]): Column[] {
  if (!rows.length) return [];
  const headers = rows[0] ?? [];
  const width = Math.max(headers.length, ...rows.slice(0, 200).map((row) => row.length));
  return Array.from({ length: width }, (_, index) => {
    const name = str(headers[index]).trim() || `Column ${index + 1}`;
    const sample = rows.slice(1, 201).map((row) => row[index]).filter((value) => str(value).trim() !== '');
    const numericCount = sample.filter((value) => numberValue(value) !== null).length;
    return { index, name, numeric: sample.length > 0 && numericCount / sample.length >= 0.8 };
  });
}

function guessColumn(columns: Column[], patterns: RegExp[]) {
  return columns.find((column) => patterns.some((pattern) => pattern.test(column.name)));
}

function format(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    notation: Math.abs(value) >= 100_000 ? 'compact' : 'standard',
  }).format(value);
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const project = (lon: number, lat: number) => ({
  x: 40 + ((lon + 180) / 360) * 920,
  y: 30 + ((90 - lat) / 180) * 500,
});

function WorldFrame({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <svg className="spatial-svg" viewBox="0 0 1000 560" role="img" aria-label="Spatial data visualization">
      <defs>
        <linearGradient id="spatial-ocean-light" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f4f8fb"/><stop offset="1" stopColor="#e5edf4"/></linearGradient>
        <linearGradient id="spatial-ocean-dark" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#07131f"/><stop offset="1" stopColor="#0b1c2a"/></linearGradient>
        <filter id="spatial-glow"><feGaussianBlur stdDeviation="12"/></filter>
      </defs>
      <rect x="20" y="18" width="960" height="524" rx="24" fill={dark ? 'url(#spatial-ocean-dark)' : 'url(#spatial-ocean-light)'} />
      {[-120, -60, 0, 60, 120].map((lon) => { const p = project(lon, 0); return <line key={`lon-${lon}`} x1={p.x} x2={p.x} y1="30" y2="530" className="spatial-gridline" />; })}
      {[-60, -30, 0, 30, 60].map((lat) => { const p = project(0, lat); return <line key={`lat-${lat}`} x1="40" x2="960" y1={p.y} y2={p.y} className="spatial-gridline" />; })}
      <path d="M72 182 C120 145 164 147 201 169 C234 189 260 182 286 154 C311 126 348 122 373 148 C397 173 420 179 452 168 C492 154 526 169 545 197 C566 227 598 234 628 219 C655 204 674 173 707 171 C744 168 761 198 797 213 C830 227 866 214 929 180" className="spatial-land-hint" />
      <path d="M130 330 C169 314 210 327 245 357 C276 383 307 386 343 369 C374 354 408 355 442 380 C476 405 512 402 546 374 C578 347 617 345 654 367 C695 392 728 387 764 355 C796 327 838 318 901 332" className="spatial-land-hint" />
      {children}
    </svg>
  );
}

function Empty() {
  return <div className="spatial-empty"><strong>Choose compatible geographic columns to render this layer.</strong><span>Latitude / longitude fields must contain decimal degrees.</span></div>;
}

function PointLayer({ points, dark }: { points: Point[]; dark: boolean }) {
  if (!points.length) return <Empty />;
  const max = Math.max(1, ...points.map((point) => Math.abs(point.value)));
  return <WorldFrame dark={dark}>{points.slice(0, 2200).map((point) => { const p = project(point.lon, point.lat); const radius = 3 + Math.sqrt(Math.abs(point.value) / max) * 12; return <g key={point.index}><circle cx={p.x} cy={p.y} r={radius + 6} className="spatial-point-halo"/><circle cx={p.x} cy={p.y} r={radius} className="spatial-point"/></g>; })}</WorldFrame>;
}

function aggregateGrid(points: Point[], cellX: number, cellY: number) {
  const buckets = new Map<string, { gx: number; gy: number; value: number; count: number }>();
  for (const point of points) {
    const p = project(point.lon, point.lat);
    const gx = Math.floor((p.x - 40) / cellX);
    const gy = Math.floor((p.y - 30) / cellY);
    const key = `${gx}:${gy}`;
    const current = buckets.get(key) ?? { gx, gy, value: 0, count: 0 };
    current.value += Math.abs(point.value || 1);
    current.count += 1;
    buckets.set(key, current);
  }
  return [...buckets.values()];
}

function GridLayer({ points, dark, columns = false }: { points: Point[]; dark: boolean; columns?: boolean }) {
  if (!points.length) return <Empty />;
  const cells = aggregateGrid(points, 34, 28);
  const max = Math.max(1, ...cells.map((cell) => cell.value));
  return <WorldFrame dark={dark}>{cells.map((cell) => { const x = 40 + cell.gx * 34; const y = 30 + cell.gy * 28; const ratio = cell.value / max; if (columns) { const h = 8 + ratio * 88; return <g key={`${cell.gx}:${cell.gy}`}><polygon points={`${x+4},${y+22} ${x+19},${y+13} ${x+31},${y+20} ${x+16},${y+29}`} className="spatial-column-base"/><polygon points={`${x+4},${y+22-h} ${x+19},${y+13-h} ${x+19},${y+13} ${x+4},${y+22}`} className="spatial-column-side"/><polygon points={`${x+19},${y+13-h} ${x+31},${y+20-h} ${x+31},${y+20} ${x+19},${y+13}`} className="spatial-column-front"/><polygon points={`${x+4},${y+22-h} ${x+19},${y+13-h} ${x+31},${y+20-h} ${x+16},${y+29-h}`} className="spatial-column-top"/></g>; }
    return <rect key={`${cell.gx}:${cell.gy}`} x={x + 1} y={y + 1} width="32" height="26" rx="3" className="spatial-grid-cell" style={{ opacity: 0.14 + ratio * 0.78 }} />;
  })}</WorldFrame>;
}

function hexPoints(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => { const angle = Math.PI / 3 * i + Math.PI / 6; return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`; }).join(' ');
}

function HexLayer({ points, dark }: { points: Point[]; dark: boolean }) {
  if (!points.length) return <Empty />;
  const r = 18;
  const buckets = new Map<string, { q: number; row: number; value: number }>();
  for (const point of points) {
    const p = project(point.lon, point.lat);
    const row = Math.round((p.y - 30) / (r * 1.5));
    const offset = row % 2 ? r * 0.87 : 0;
    const q = Math.round((p.x - 40 - offset) / (r * 1.73));
    const key = `${q}:${row}`;
    const current = buckets.get(key) ?? { q, row, value: 0 };
    current.value += Math.abs(point.value || 1);
    buckets.set(key, current);
  }
  const cells = [...buckets.values()];
  const max = Math.max(1, ...cells.map((cell) => cell.value));
  return <WorldFrame dark={dark}>{cells.map((cell) => { const cx = 40 + cell.q * (r * 1.73) + (cell.row % 2 ? r * 0.87 : 0); const cy = 30 + cell.row * (r * 1.5); const ratio = cell.value / max; return <polygon key={`${cell.q}:${cell.row}`} points={hexPoints(cx, cy, r - 1)} className="spatial-hex" style={{ opacity: 0.12 + ratio * 0.82 }} />; })}</WorldFrame>;
}

function HeatLayer({ points, dark }: { points: Point[]; dark: boolean }) {
  if (!points.length) return <Empty />;
  const max = Math.max(1, ...points.map((point) => Math.abs(point.value)));
  return <WorldFrame dark={dark}><g filter="url(#spatial-glow)">{points.slice(0, 1200).map((point) => { const p = project(point.lon, point.lat); const ratio = Math.abs(point.value) / max; return <circle key={point.index} cx={p.x} cy={p.y} r={18 + ratio * 34} className="spatial-heat" style={{ opacity: 0.08 + ratio * 0.28 }} />; })}</g>{points.slice(0, 1000).map((point) => { const p = project(point.lon, point.lat); return <circle key={`core-${point.index}`} cx={p.x} cy={p.y} r="2.4" className="spatial-heat-core" />; })}</WorldFrame>;
}

function ContourLayer({ points, dark }: { points: Point[]; dark: boolean }) {
  if (!points.length) return <Empty />;
  const cells = aggregateGrid(points, 50, 40);
  const max = Math.max(1, ...cells.map((cell) => cell.value));
  const thresholds = [0.18, 0.35, 0.55, 0.75];
  return <WorldFrame dark={dark}>{thresholds.map((threshold, ti) => <g key={threshold}>{cells.filter((cell) => cell.value / max >= threshold).map((cell) => { const cx = 40 + cell.gx * 50 + 25; const cy = 30 + cell.gy * 40 + 20; return <ellipse key={`${ti}-${cell.gx}:${cell.gy}`} cx={cx} cy={cy} rx={32 + ti * 6} ry={24 + ti * 5} className="spatial-contour" style={{ opacity: 0.22 + ti * 0.13 }} />; })}</g>)}</WorldFrame>;
}

function ArcLayer({ flows, dark, animated = false }: { flows: Flow[]; dark: boolean; animated?: boolean }) {
  if (!flows.length) return <Empty />;
  const max = Math.max(1, ...flows.map((flow) => Math.abs(flow.value)));
  const shown = flows.slice(0, animated ? 120 : 550);
  return <WorldFrame dark={dark}><defs>{shown.map((flow) => { const a = project(flow.sourceLon, flow.sourceLat); const b = project(flow.targetLon, flow.targetLat); const lift = Math.max(28, Math.abs(b.x - a.x) * 0.22); return <path key={`path-${flow.index}`} id={`trip-path-${flow.index}`} d={`M${a.x} ${a.y} Q${(a.x+b.x)/2} ${Math.min(a.y,b.y)-lift} ${b.x} ${b.y}`} />; })}</defs>{shown.map((flow) => { const a = project(flow.sourceLon, flow.sourceLat); const b = project(flow.targetLon, flow.targetLat); const lift = Math.max(28, Math.abs(b.x - a.x) * 0.22); const width = 0.7 + Math.sqrt(Math.abs(flow.value) / max) * 4.8; return <g key={flow.index}><path d={`M${a.x} ${a.y} Q${(a.x+b.x)/2} ${Math.min(a.y,b.y)-lift} ${b.x} ${b.y}`} className="spatial-arc" style={{ strokeWidth: width }} /><circle cx={a.x} cy={a.y} r="3.2" className="spatial-origin"/><circle cx={b.x} cy={b.y} r="3.2" className="spatial-target"/></g>; })}{animated && shown.map((flow, index) => <circle key={`moving-${flow.index}`} r={3 + Math.min(4, Math.sqrt(Math.abs(flow.value) / max) * 4)} className="spatial-trip-dot"><animateMotion dur={`${3.5 + (index % 7) * 0.35}s`} repeatCount="indefinite" begin={`${-(index % 11) * 0.27}s`}><mpath href={`#trip-path-${flow.index}`} /></animateMotion></circle>)}</WorldFrame>;
}

export default function SpatialVisualLab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [layer, setLayer] = useState<LayerType>('hexagon');
  const [dark, setDark] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [latIndex, setLatIndex] = useState(-1);
  const [lonIndex, setLonIndex] = useState(-1);
  const [valueIndex, setValueIndex] = useState(-1);
  const [labelIndex, setLabelIndex] = useState(-1);
  const [sourceLatIndex, setSourceLatIndex] = useState(-1);
  const [sourceLonIndex, setSourceLonIndex] = useState(-1);
  const [targetLatIndex, setTargetLatIndex] = useState(-1);
  const [targetLonIndex, setTargetLonIndex] = useState(-1);

  const sheet = workbook?.sheets[sheetIndex];
  const rows = sheet?.rows ?? [];
  const columns = useMemo(() => inferColumns(rows), [rows]);
  const numericColumns = columns.filter((column) => column.numeric);
  const dataRows = rows.slice(1).filter((row) => row.some((value) => str(value).trim() !== ''));

  function applyGuesses(nextColumns: Column[]) {
    const lat = guessColumn(nextColumns, [/^lat$/i, /latitude/i]);
    const lon = guessColumn(nextColumns, [/^lon$/i, /^lng$/i, /longitude/i]);
    const value = guessColumn(nextColumns, [/cost/i, /amount/i, /value/i, /count/i, /total/i, /claim/i, /severity/i]);
    const label = guessColumn(nextColumns, [/name/i, /clinic/i, /employer/i, /location/i, /city/i, /department/i]);
    const sourceLat = guessColumn(nextColumns, [/source.*lat/i, /origin.*lat/i, /from.*lat/i]);
    const sourceLon = guessColumn(nextColumns, [/source.*lon/i, /origin.*lon/i, /from.*lon/i]);
    const targetLat = guessColumn(nextColumns, [/target.*lat/i, /dest.*lat/i, /to.*lat/i]);
    const targetLon = guessColumn(nextColumns, [/target.*lon/i, /dest.*lon/i, /to.*lon/i]);
    setLatIndex(lat?.index ?? -1); setLonIndex(lon?.index ?? -1); setValueIndex(value?.index ?? -1); setLabelIndex(label?.index ?? -1);
    setSourceLatIndex(sourceLat?.index ?? lat?.index ?? -1); setSourceLonIndex(sourceLon?.index ?? lon?.index ?? -1); setTargetLatIndex(targetLat?.index ?? -1); setTargetLonIndex(targetLon?.index ?? -1);
  }

  async function loadFile(file: File) {
    setLoading(true); setError('');
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch('/api/data/parse', { method: 'POST', body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Could not parse spreadsheet.');
      const parsed = payload as ParsedWorkbook;
      setWorkbook(parsed); setSheetIndex(0);
      applyGuesses(inferColumns(parsed.sheets[0]?.rows ?? []));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not parse spreadsheet.');
    } finally {
      setLoading(false); if (inputRef.current) inputRef.current.value = '';
    }
  }

  function changeSheet(index: number) {
    setSheetIndex(index);
    applyGuesses(inferColumns(workbook?.sheets[index]?.rows ?? []));
  }

  const points = useMemo<Point[]>(() => {
    if (latIndex < 0 || lonIndex < 0) return [];
    return dataRows.flatMap((row, index) => {
      const lat = numberValue(row[latIndex]); const lon = numberValue(row[lonIndex]);
      if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return [];
      const value = valueIndex >= 0 ? numberValue(row[valueIndex]) ?? 1 : 1;
      const label = labelIndex >= 0 ? str(row[labelIndex]) : `Point ${index + 1}`;
      return [{ lat, lon, value, label, index }];
    });
  }, [dataRows, latIndex, lonIndex, valueIndex, labelIndex]);

  const flows = useMemo<Flow[]>(() => {
    if ([sourceLatIndex, sourceLonIndex, targetLatIndex, targetLonIndex].some((index) => index < 0)) return [];
    return dataRows.flatMap((row, index) => {
      const sourceLat = numberValue(row[sourceLatIndex]); const sourceLon = numberValue(row[sourceLonIndex]); const targetLat = numberValue(row[targetLatIndex]); const targetLon = numberValue(row[targetLonIndex]);
      if ([sourceLat, sourceLon, targetLat, targetLon].some((value) => value === null)) return [];
      const values = [sourceLat!, sourceLon!, targetLat!, targetLon!];
      if (values[0] < -90 || values[0] > 90 || values[2] < -90 || values[2] > 90 || values[1] < -180 || values[1] > 180 || values[3] < -180 || values[3] > 180) return [];
      const value = valueIndex >= 0 ? numberValue(row[valueIndex]) ?? 1 : 1;
      const label = labelIndex >= 0 ? str(row[labelIndex]) : `Flow ${index + 1}`;
      return [{ sourceLat: values[0], sourceLon: values[1], targetLat: values[2], targetLon: values[3], value, label, index }];
    });
  }, [dataRows, sourceLatIndex, sourceLonIndex, targetLatIndex, targetLonIndex, valueIndex, labelIndex]);

  const selectedLayer = LAYERS.find((item) => item.id === layer)!;
  const isFlow = layer === 'arcs' || layer === 'trips';

  let visual: React.ReactNode = <Empty />;
  if (layer === 'scatter') visual = <PointLayer points={points} dark={dark}/>;
  if (layer === 'hexagon') visual = <HexLayer points={points} dark={dark}/>;
  if (layer === 'grid') visual = <GridLayer points={points} dark={dark}/>;
  if (layer === 'heatmap') visual = <HeatLayer points={points} dark={dark}/>;
  if (layer === 'contour') visual = <ContourLayer points={points} dark={dark}/>;
  if (layer === 'columns') visual = <GridLayer points={points} dark={dark} columns/>;
  if (layer === 'arcs') visual = <ArcLayer flows={flows} dark={dark}/>;
  if (layer === 'trips') visual = <ArcLayer flows={flows} dark={dark} animated/>;

  function exportSvg() {
    const svg = document.querySelector('.spatial-stage svg');
    if (!(svg instanceof SVGElement)) return;
    download('spatial-visualization.svg', new XMLSerializer().serializeToString(svg), 'image/svg+xml;charset=utf-8');
  }

  function exportConfig() {
    download('spatial-layer-config.json', JSON.stringify({ layer, sheet: sheet?.name, fields: { latIndex, lonIndex, valueIndex, labelIndex, sourceLatIndex, sourceLonIndex, targetLatIndex, targetLonIndex }, records: isFlow ? flows.length : points.length }, null, 2), 'application/json');
  }

  const families = [...new Set(LAYERS.map((item) => item.family))];

  return <div className={`spatial-app ${dark ? 'spatial-dark' : ''}`}>
    <aside className="spatial-sidebar">
      <a href="/vault/advanced" className="spatial-back">← Advanced Visual Lab</a>
      <div className="spatial-brand"><span>SPATIAL LAB</span><h1>Geographic analysis</h1><p>Layer-based spatial visualization inspired by the deck.gl model.</p></div>
      {families.map((family) => <section key={family}><h2>{family}</h2>{LAYERS.filter((item) => item.family === family).map((item) => <button key={item.id} className={layer === item.id ? 'active' : ''} onClick={() => setLayer(item.id)}><strong>{item.name}</strong><span>{item.note}</span></button>)}</section>)}
    </aside>
    <main className="spatial-main">
      <header><div><span>{selectedLayer.family.toUpperCase()} LAYER</span><h2>{selectedLayer.name}</h2><p>{selectedLayer.note}</p></div><div className="spatial-top-actions"><label className="spatial-theme-toggle"><input type="checkbox" checked={dark} onChange={(event) => setDark(event.target.checked)}/> Midnight view</label>{workbook && <><button onClick={exportSvg}>Export SVG</button><button onClick={exportConfig}>Save layer config</button></>}</div></header>
      {!workbook ? <section className="spatial-upload"><input ref={inputRef} type="file" accept=".xlsx,.csv,.tsv" onChange={(event) => { const file = event.target.files?.[0]; if (file) loadFile(file); }}/><span>SPREADSHEET → SPATIAL LAYERS</span><h2>Turn coordinates into geographic evidence.</h2><p>Upload Excel, CSV or TSV with latitude/longitude fields. Flow layers can also use origin and destination coordinate pairs.</p><button onClick={() => inputRef.current?.click()} disabled={loading}>{loading ? 'Reading…' : 'Choose file'}</button>{error && <em>{error}</em>}</section> : <>
        <section className="spatial-controls">
          <label><span>Sheet</span><select value={sheetIndex} onChange={(event) => changeSheet(Number(event.target.value))}>{workbook.sheets.map((item, index) => <option key={`${item.name}-${index}`} value={index}>{item.name}</option>)}</select></label>
          {!isFlow ? <><label><span>Latitude</span><select value={latIndex} onChange={(event) => setLatIndex(Number(event.target.value))}><option value={-1}>Choose field</option>{numericColumns.map((column) => <option key={column.index} value={column.index}>{column.name}</option>)}</select></label><label><span>Longitude</span><select value={lonIndex} onChange={(event) => setLonIndex(Number(event.target.value))}><option value={-1}>Choose field</option>{numericColumns.map((column) => <option key={column.index} value={column.index}>{column.name}</option>)}</select></label></> : <><label><span>Origin lat</span><select value={sourceLatIndex} onChange={(event) => setSourceLatIndex(Number(event.target.value))}><option value={-1}>Choose field</option>{numericColumns.map((column) => <option key={column.index} value={column.index}>{column.name}</option>)}</select></label><label><span>Origin lon</span><select value={sourceLonIndex} onChange={(event) => setSourceLonIndex(Number(event.target.value))}><option value={-1}>Choose field</option>{numericColumns.map((column) => <option key={column.index} value={column.index}>{column.name}</option>)}</select></label><label><span>Destination lat</span><select value={targetLatIndex} onChange={(event) => setTargetLatIndex(Number(event.target.value))}><option value={-1}>Choose field</option>{numericColumns.map((column) => <option key={column.index} value={column.index}>{column.name}</option>)}</select></label><label><span>Destination lon</span><select value={targetLonIndex} onChange={(event) => setTargetLonIndex(Number(event.target.value))}><option value={-1}>Choose field</option>{numericColumns.map((column) => <option key={column.index} value={column.index}>{column.name}</option>)}</select></label></>}
          <label><span>Weight / magnitude</span><select value={valueIndex} onChange={(event) => setValueIndex(Number(event.target.value))}><option value={-1}>Count each row equally</option>{numericColumns.map((column) => <option key={column.index} value={column.index}>{column.name}</option>)}</select></label>
          <label><span>Label</span><select value={labelIndex} onChange={(event) => setLabelIndex(Number(event.target.value))}><option value={-1}>No label field</option>{columns.map((column) => <option key={column.index} value={column.index}>{column.name}</option>)}</select></label>
        </section>
        <section className="spatial-metrics"><div><span>VALID RECORDS</span><strong>{(isFlow ? flows.length : points.length).toLocaleString()}</strong></div><div><span>SOURCE ROWS</span><strong>{dataRows.length.toLocaleString()}</strong></div><div><span>LAYER</span><strong>{selectedLayer.name}</strong></div><div><span>MODE</span><strong>{dark ? 'Midnight' : 'Light'}</strong></div></section>
        <section className="spatial-stage">{visual}</section>
        <footer><div><strong>{sheet?.name}</strong><span>{workbook.filename}</span></div><div><a href="/vault">Publication Studio</a><a href="/vault/story">Storytelling Studio</a><button onClick={() => inputRef.current?.click()}>Replace dataset</button><input ref={inputRef} type="file" accept=".xlsx,.csv,.tsv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) loadFile(file); }}/></div></footer>
      </>}
    </main>
  </div>;
}
