'use client';

import { useEffect, useMemo, useState } from 'react';
import { type DatasetCell, type DatasetColumn, useDataset } from './DatasetContext';

type LayerType = 'points' | 'heat' | 'hex' | 'grid' | 'columns' | 'arcs' | 'trips';
type Aggregate = 'count' | 'sum' | 'average';
type DataRow = { absolute: number; values: Record<string, DatasetCell> };
type Point = { row: DataRow; lat: number; lon: number; weight: number; label: string };
type Flow = { row: DataRow; sourceLat: number; sourceLon: number; targetLat: number; targetLon: number; weight: number; label: string; order: number };
type View = { x: number; y: number; width: number; height: number };

type CellBucket = { id: string; x: number; y: number; count: number; sum: number; records: DataRow[] };

const text = (value: unknown) => value == null ? '' : String(value);
function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = text(value).trim().replace(/[,$%]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
function format(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, notation: Math.abs(value) >= 100000 ? 'compact' : 'standard' }).format(value);
}
function project(lon: number, lat: number) { return { x: 40 + ((lon + 180) / 360) * 920, y: 30 + ((90 - lat) / 180) * 500 }; }
function aggregateValue(bucket: CellBucket, aggregate: Aggregate) {
  if (aggregate === 'count') return bucket.count;
  if (aggregate === 'average') return bucket.count ? bucket.sum / bucket.count : 0;
  return bucket.sum;
}
function makeRows(grid: DatasetCell[][], headerRow: number, columns: DatasetColumn[]) {
  return grid.slice(headerRow + 1).flatMap((row, index): DataRow[] => {
    if (!row.some((value) => text(value).trim() !== '')) return [];
    const values: Record<string, DatasetCell> = {};
    columns.forEach((column) => { values[column.id] = row[column.sourceIndex] ?? null; });
    return [{ absolute: headerRow + 1 + index, values }];
  });
}
function guess(columns: DatasetColumn[], patterns: RegExp[]) { return columns.find((column) => patterns.some((pattern) => pattern.test(column.name)))?.id ?? ''; }

function World({ view, children }: { view: View; children: React.ReactNode }) {
  return <svg className="usp-svg" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} role="img" aria-label="Interactive spatial analysis">
    <defs>
      <linearGradient id="usp-ocean" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f6f9fb"/><stop offset="1" stopColor="#e8eff5"/></linearGradient>
      <filter id="usp-heat-blur"><feGaussianBlur stdDeviation="13"/></filter>
    </defs>
    <rect x="20" y="18" width="960" height="524" rx="22" fill="url(#usp-ocean)"/>
    {[-120,-60,0,60,120].map((lon) => { const p = project(lon, 0); return <line key={`lon-${lon}`} x1={p.x} x2={p.x} y1="30" y2="530" className="usp-gridline"/>; })}
    {[-60,-30,0,30,60].map((lat) => { const p = project(0, lat); return <line key={`lat-${lat}`} x1="40" x2="960" y1={p.y} y2={p.y} className="usp-gridline"/>; })}
    <path d="M72 182 C120 145 164 147 201 169 C234 189 260 182 286 154 C311 126 348 122 373 148 C397 173 420 179 452 168 C492 154 526 169 545 197 C566 227 598 234 628 219 C655 204 674 173 707 171 C744 168 761 198 797 213 C830 227 866 214 929 180" className="usp-land"/>
    <path d="M130 330 C169 314 210 327 245 357 C276 383 307 386 343 369 C374 354 408 355 442 380 C476 405 512 402 546 374 C578 347 617 345 654 367 C695 392 728 387 764 355 C796 327 838 318 901 332" className="usp-land"/>
    {children}
  </svg>;
}

export default function SharedSpatialWorkbench() {
  const { dataset } = useDataset();
  const current = dataset!;
  const columns = current.columns.filter((column) => !column.hidden);
  const numeric = columns.filter((column) => column.type === 'number');
  const rows = useMemo(() => makeRows(current.grid, current.headerRow, current.columns), [current.grid, current.headerRow, current.columns]);

  const [layer, setLayer] = useState<LayerType>('points');
  const [latField, setLatField] = useState(() => guess(columns, [/^lat/i,/latitude/i]));
  const [lonField, setLonField] = useState(() => guess(columns, [/^lon/i,/lng/i,/longitude/i]));
  const [weightField, setWeightField] = useState(() => numeric[0]?.id ?? '');
  const [labelField, setLabelField] = useState(() => columns.find((column) => column.type !== 'number')?.id ?? columns[0]?.id ?? '');
  const [originLatField, setOriginLatField] = useState(() => guess(columns, [/origin.*lat/i,/from.*lat/i,/source.*lat/i]));
  const [originLonField, setOriginLonField] = useState(() => guess(columns, [/origin.*lon/i,/from.*lon/i,/source.*lon/i]));
  const [destLatField, setDestLatField] = useState(() => guess(columns, [/dest.*lat/i,/to.*lat/i,/target.*lat/i]));
  const [destLonField, setDestLonField] = useState(() => guess(columns, [/dest.*lon/i,/to.*lon/i,/target.*lon/i]));
  const [timeField, setTimeField] = useState(() => guess(columns, [/time/i,/order/i,/sequence/i,/timestamp/i]));
  const [aggregate, setAggregate] = useState<Aggregate>('count');
  const [heatRadius, setHeatRadius] = useState(32);
  const [heatIntensity, setHeatIntensity] = useState(1);
  const [heightScale, setHeightScale] = useState(1);
  const [visible, setVisible] = useState(true);
  const [view, setView] = useState<View>({ x: 0, y: 0, width: 1000, height: 560 });
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ title: string; records: DataRow[] } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);

  const points = useMemo<Point[]>(() => rows.flatMap((row) => {
    const lat = numberValue(row.values[latField]); const lon = numberValue(row.values[lonField]);
    if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return [];
    return [{ row, lat, lon, weight: weightField ? Math.abs(numberValue(row.values[weightField]) ?? 1) : 1, label: labelField ? text(row.values[labelField]) || `Row ${row.absolute + 1}` : `Row ${row.absolute + 1}` }];
  }), [rows, latField, lonField, weightField, labelField]);

  const flows = useMemo<Flow[]>(() => rows.flatMap((row, index) => {
    const sourceLat = numberValue(row.values[originLatField]); const sourceLon = numberValue(row.values[originLonField]); const targetLat = numberValue(row.values[destLatField]); const targetLon = numberValue(row.values[destLonField]);
    if ([sourceLat, sourceLon, targetLat, targetLon].some((value) => value === null)) return [];
    if (sourceLat! < -90 || sourceLat! > 90 || targetLat! < -90 || targetLat! > 90 || sourceLon! < -180 || sourceLon! > 180 || targetLon! < -180 || targetLon! > 180) return [];
    return [{ row, sourceLat: sourceLat!, sourceLon: sourceLon!, targetLat: targetLat!, targetLon: targetLon!, weight: weightField ? Math.abs(numberValue(row.values[weightField]) ?? 1) : 1, label: labelField ? text(row.values[labelField]) || `Flow ${index + 1}` : `Flow ${index + 1}`, order: timeField ? numberValue(row.values[timeField]) ?? index : index }];
  }).sort((a, b) => a.order - b.order), [rows, originLatField, originLonField, destLatField, destLonField, weightField, labelField, timeField]);

  const gridCells = useMemo<CellBucket[]>(() => {
    const buckets = new Map<string, CellBucket>();
    for (const point of points) {
      const projected = project(point.lon, point.lat); const gx = Math.floor((projected.x - 40) / 34); const gy = Math.floor((projected.y - 30) / 28); const id = `${gx}:${gy}`;
      const bucket = buckets.get(id) ?? { id, x: 40 + gx * 34, y: 30 + gy * 28, count: 0, sum: 0, records: [] };
      bucket.count += 1; bucket.sum += point.weight; bucket.records.push(point.row); buckets.set(id, bucket);
    }
    return [...buckets.values()];
  }, [points]);

  const hexCells = useMemo<CellBucket[]>(() => {
    const r = 19; const buckets = new Map<string, CellBucket>();
    for (const point of points) {
      const projected = project(point.lon, point.lat); const row = Math.round((projected.y - 30) / (r * 1.5)); const offset = row % 2 ? r * .87 : 0; const col = Math.round((projected.x - 40 - offset) / (r * 1.73)); const id = `${col}:${row}`; const cx = 40 + col * r * 1.73 + offset; const cy = 30 + row * r * 1.5;
      const bucket = buckets.get(id) ?? { id, x: cx, y: cy, count: 0, sum: 0, records: [] }; bucket.count += 1; bucket.sum += point.weight; bucket.records.push(point.row); buckets.set(id, bucket);
    }
    return [...buckets.values()];
  }, [points]);

  useEffect(() => {
    if (!playing || layer !== 'trips') return;
    const timer = window.setInterval(() => setProgress((value) => value >= 1 ? 0 : Math.min(1, value + .006 * speed)), 30);
    return () => window.clearInterval(timer);
  }, [playing, speed, layer]);

  function fitToData() {
    const coords = layer === 'arcs' || layer === 'trips'
      ? flows.flatMap((flow) => [project(flow.sourceLon, flow.sourceLat), project(flow.targetLon, flow.targetLat)])
      : points.map((point) => project(point.lon, point.lat));
    if (!coords.length) return;
    const minX = Math.min(...coords.map((point) => point.x)), maxX = Math.max(...coords.map((point) => point.x)), minY = Math.min(...coords.map((point) => point.y)), maxY = Math.max(...coords.map((point) => point.y)); const padding = 55;
    setView({ x: Math.max(0, minX - padding), y: Math.max(0, minY - padding), width: Math.min(1000, Math.max(220, maxX - minX + padding * 2)), height: Math.min(560, Math.max(180, maxY - minY + padding * 2)) });
  }
  function resetView() { setView({ x: 0, y: 0, width: 1000, height: 560 }); }
  function hexPath(cx: number, cy: number, r = 18) { return Array.from({ length: 6 }, (_, index) => { const angle = Math.PI / 3 * index + Math.PI / 6; return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`; }).join(' '); }

  const maxPointWeight = Math.max(1, ...points.map((point) => point.weight));
  const maxGrid = Math.max(1, ...gridCells.map((cell) => aggregateValue(cell, aggregate)));
  const maxHex = Math.max(1, ...hexCells.map((cell) => aggregateValue(cell, aggregate)));
  const maxFlow = Math.max(1, ...flows.map((flow) => flow.weight));

  let visual: React.ReactNode = null;
  if (!visible) visual = <World view={view}><text x="500" y="285" textAnchor="middle" className="usp-hidden-label">Layer hidden</text></World>;
  else if (layer === 'points') visual = <World view={view}><rect x="20" y="18" width="960" height="524" fill="transparent" onClick={() => setSelectedPoint(null)}/>{points.slice(0, 3000).map((point) => { const p = project(point.lon, point.lat); const radius = 3 + Math.sqrt(point.weight / maxPointWeight) * 12; const selected = selectedPoint === point.row.absolute; return <g key={point.row.absolute} opacity={selectedPoint === null || selected ? 1 : .15} className="usp-interactive" onClick={(event) => { event.stopPropagation(); setSelectedPoint(point.row.absolute); }}><circle cx={p.x} cy={p.y} r={radius + (selected ? 10 : 5)} className="usp-halo"/><circle cx={p.x} cy={p.y} r={radius} className="usp-point"/><title>{point.label} · {format(point.weight)} · {point.lat.toFixed(4)}, {point.lon.toFixed(4)}</title></g>; })}</World>;
  else if (layer === 'heat') visual = <World view={view}><g filter="url(#usp-heat-blur)">{points.slice(0, 2500).map((point) => { const p = project(point.lon, point.lat); const ratio = Math.max(.08, point.weight / maxPointWeight); return <circle key={point.row.absolute} cx={p.x} cy={p.y} r={heatRadius} className="usp-heat" opacity={Math.min(.75, .12 + ratio * .45 * heatIntensity)}><title>{point.label} · {format(point.weight)}</title></circle>; })}</g></World>;
  else if (layer === 'grid' || layer === 'columns') visual = <World view={view}>{gridCells.map((cell) => { const value = aggregateValue(cell, aggregate); const ratio = value / maxGrid; if (layer === 'columns') { const h = (8 + ratio * 88) * heightScale; const x = cell.x, y = cell.y; return <g key={cell.id} className="usp-interactive" onClick={() => setDetail({ title: `Grid cell · ${aggregate} ${format(value)}`, records: cell.records })}><polygon points={`${x+4},${y+22} ${x+19},${y+13} ${x+31},${y+20} ${x+16},${y+29}`} className="usp-column-base"/><polygon points={`${x+4},${y+22-h} ${x+19},${y+13-h} ${x+19},${y+13} ${x+4},${y+22}`} className="usp-column-side"/><polygon points={`${x+19},${y+13-h} ${x+31},${y+20-h} ${x+31},${y+20} ${x+19},${y+13}`} className="usp-column-front"/><polygon points={`${x+4},${y+22-h} ${x+19},${y+13-h} ${x+31},${y+20-h} ${x+16},${y+29-h}`} className="usp-column-top"/><title>{cell.count} records · {aggregate}: {format(value)}</title></g>; } return <rect key={cell.id} x={cell.x + 1} y={cell.y + 1} width="32" height="26" rx="3" className="usp-grid-cell usp-interactive" style={{ opacity: .12 + ratio * .8 }} onClick={() => setDetail({ title: `Grid cell · ${aggregate} ${format(value)}`, records: cell.records })}><title>{cell.count} records · {aggregate}: {format(value)}</title></rect>; })}</World>;
  else if (layer === 'hex') visual = <World view={view}>{hexCells.map((cell) => { const value = aggregateValue(cell, aggregate); const ratio = value / maxHex; return <polygon key={cell.id} points={hexPath(cell.x, cell.y)} className="usp-hex usp-interactive" style={{ opacity: .14 + ratio * .78 }} onClick={() => setDetail({ title: `Hex cell · ${aggregate} ${format(value)}`, records: cell.records })}><title>{cell.count} records · {aggregate}: {format(value)}</title></polygon>; })}</World>;
  else if (layer === 'arcs') visual = <World view={view}>{flows.slice(0, 1400).map((flow, index) => { const a = project(flow.sourceLon, flow.sourceLat), b = project(flow.targetLon, flow.targetLat), midX = (a.x + b.x) / 2, midY = Math.min(a.y, b.y) - Math.max(18, Math.abs(a.x - b.x) * .12); return <g key={flow.row.absolute} className="usp-interactive"><path d={`M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`} fill="none" className={`usp-arc arc-${index % 5}`} strokeWidth={1.2 + Math.sqrt(flow.weight / maxFlow) * 6}/><circle cx={a.x} cy={a.y} r="3" className="usp-origin"/><circle cx={b.x} cy={b.y} r="3" className="usp-destination"/><title>{flow.label} · {format(flow.weight)}</title></g>; })}</World>;
  else if (layer === 'trips') visual = <World view={view}>{flows.slice(0, 1200).map((flow, index) => { const a = project(flow.sourceLon, flow.sourceLat), b = project(flow.targetLon, flow.targetLat), local = Math.max(0, Math.min(1, progress * flows.length - index)); const x = a.x + (b.x - a.x) * local, y = a.y + (b.y - a.y) * local; return <g key={flow.row.absolute}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="usp-trip-line" strokeWidth={1 + Math.sqrt(flow.weight / maxFlow) * 4}/>{local > 0 && local < 1 && <circle cx={x} cy={y} r="4" className="usp-trip-dot"><title>{flow.label}</title></circle>}</g>; })}</World>;

  const layerNeedsPointFields = ['points','heat','hex','grid','columns'].includes(layer);
  const layerNeedsFlowFields = ['arcs','trips'].includes(layer);

  return <main className="usp-shell">
    <section className="usp-map-stage">
      <header className="usp-map-toolbar"><div><span>SPATIAL LAB</span><strong>{current.workbook.filename}</strong><small>{points.length.toLocaleString()} mapped points · {flows.length.toLocaleString()} flows</small></div><div><button onClick={fitToData}>Fit to data</button><button onClick={resetView}>Reset view</button><button onClick={() => { setSelectedPoint(null); setDetail(null); }}>Clear selection</button><button className={visible ? 'active' : ''} onClick={() => setVisible((value) => !value)}>{visible ? 'Layer visible' : 'Layer hidden'}</button></div></header>
      <div className="usp-map-canvas">{visual}{layer === 'trips' && <div className="usp-trip-controls"><button onClick={() => setPlaying((value) => !value)}>{playing ? 'Pause' : 'Play'}</button><input type="range" min="0" max="1" step="0.001" value={progress} onChange={(event) => { setProgress(Number(event.target.value)); setPlaying(false); }}/><label>Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><span>{Math.round(progress * 100)}%</span></div>}</div>
    </section>

    <aside className="usp-inspector">
      <header><span>LAYERS</span><strong>Spatial analysis</strong></header>
      <div className="usp-layer-list">{([
        ['points','Point layer','Locations sized by measure'],['heat','Heat surface','Continuous density'],['hex','Hex aggregation','Spatial bins'],['grid','Grid aggregation','Regular cells'],['columns','Extruded columns','Height by aggregate'],['arcs','Flow arcs','Origin → destination'],['trips','Animated trips','Temporal movement']
      ] as Array<[LayerType,string,string]>).map(([id,name,note]) => <button key={id} className={layer === id ? 'active' : ''} onClick={() => { setLayer(id); setPlaying(false); }}><strong>{name}</strong><small>{note}</small></button>)}</div>

      <div className="usp-fields"><span>FIELD MAPPING</span>{layerNeedsPointFields && <><label>Latitude<select value={latField} onChange={(event) => setLatField(event.target.value)}><option value="">Choose numeric field</option>{numeric.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label><label>Longitude<select value={lonField} onChange={(event) => setLonField(event.target.value)}><option value="">Choose numeric field</option>{numeric.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label></>}{layerNeedsFlowFields && <><label>Origin latitude<select value={originLatField} onChange={(event) => setOriginLatField(event.target.value)}><option value="">Choose field</option>{numeric.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label><label>Origin longitude<select value={originLonField} onChange={(event) => setOriginLonField(event.target.value)}><option value="">Choose field</option>{numeric.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label><label>Destination latitude<select value={destLatField} onChange={(event) => setDestLatField(event.target.value)}><option value="">Choose field</option>{numeric.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label><label>Destination longitude<select value={destLonField} onChange={(event) => setDestLonField(event.target.value)}><option value="">Choose field</option>{numeric.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label></>}
        <label>Weight<select value={weightField} onChange={(event) => setWeightField(event.target.value)}><option value="">Record count / constant</option>{numeric.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label><label>Label<select value={labelField} onChange={(event) => setLabelField(event.target.value)}><option value="">No label</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>{layer === 'trips' && <label>Time / order<select value={timeField} onChange={(event) => setTimeField(event.target.value)}><option value="">Dataset order</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>}
      </div>

      {['hex','grid','columns'].includes(layer) && <div className="usp-settings"><span>AGGREGATION</span><label>Metric<select value={aggregate} onChange={(event) => setAggregate(event.target.value as Aggregate)}><option value="count">Count</option><option value="sum">Sum of weight</option><option value="average">Average weight</option></select></label>{layer === 'columns' && <label>Height scale<input type="range" min="0.4" max="2.5" step="0.1" value={heightScale} onChange={(event) => setHeightScale(Number(event.target.value))}/><small>{heightScale.toFixed(1)}×</small></label>}</div>}
      {layer === 'heat' && <div className="usp-settings"><span>HEAT SURFACE</span><label>Radius<input type="range" min="12" max="70" value={heatRadius} onChange={(event) => setHeatRadius(Number(event.target.value))}/><small>{heatRadius}px</small></label><label>Intensity<input type="range" min="0.3" max="2.5" step="0.1" value={heatIntensity} onChange={(event) => setHeatIntensity(Number(event.target.value))}/><small>{heatIntensity.toFixed(1)}×</small></label></div>}
    </aside>

    {detail && <div className="usp-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="usp-detail"><header><div><span>UNDERLYING RECORDS</span><strong>{detail.title}</strong><small>{detail.records.length.toLocaleString()} records</small></div><button onClick={() => setDetail(null)}>×</button></header><div><table><thead><tr><th>#</th>{columns.map((column) => <th key={column.id}>{column.name}</th>)}</tr></thead><tbody>{detail.records.slice(0, 500).map((row) => <tr key={row.absolute}><th>{row.absolute + 1}</th>{columns.map((column) => <td key={column.id}>{text(row.values[column.id])}</td>)}</tr>)}</tbody></table></div></section></div>}
  </main>;
}
