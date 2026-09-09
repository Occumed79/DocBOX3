'use client';

import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type CellValue = string | number | boolean | null;
type ParsedSheet = { name: string; rows: CellValue[][]; rowCount: number; truncated: boolean };
type ParsedWorkbook = { filename: string; sheets: ParsedSheet[] };
type VisualType = 'histogram' | 'box' | 'bubble' | 'funnel' | 'slope' | 'beeswarm' | 'treemap' | 'network' | 'sankey' | 'timeline' | 'globe';
type Col = { index: number; name: string; numeric: boolean };
type Point = { x: number; y: number };

const VISUALS: Array<{ id: VisualType; name: string; family: string; note: string }> = [
  { id: 'histogram', name: 'Histogram', family: 'Statistical', note: 'Distribution of a numeric field' },
  { id: 'box', name: 'Box plot', family: 'Statistical', note: 'Median, quartiles and range by category' },
  { id: 'beeswarm', name: 'Beeswarm', family: 'Statistical', note: 'Dense distributions without bins' },
  { id: 'bubble', name: 'Bubble chart', family: 'Relationships', note: 'X, Y and size encode three measures' },
  { id: 'funnel', name: 'Funnel', family: 'Business', note: 'Stage-by-stage dropoff' },
  { id: 'slope', name: 'Slope chart', family: 'Business', note: 'Compare two values across categories' },
  { id: 'treemap', name: 'Treemap', family: 'Hierarchy', note: 'Part-to-whole hierarchy' },
  { id: 'network', name: 'Force network', family: 'Network', note: 'Source-to-target relationship structure' },
  { id: 'sankey', name: 'Sankey flow', family: 'Network', note: 'Weighted flow between categories' },
  { id: 'timeline', name: 'Timeline', family: 'Story', note: 'Events placed on a temporal axis' },
  { id: 'globe', name: 'Globe', family: 'Maps', note: 'Global latitude / longitude signals' },
];

const text = (value: CellValue) => (value == null ? '' : String(value));

function numeric(value: CellValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(text(value).replace(/[,$%]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function format(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    notation: Math.abs(value) >= 100_000 ? 'compact' : 'standard',
  }).format(value);
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const position = (ordered.length - 1) * q;
  const base = Math.floor(position);
  const remainder = position - base;
  const next = ordered[base + 1];
  return ordered[base] + (next === undefined ? 0 : remainder * (next - ordered[base]));
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Svg({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 1000 560" className="av-svg" role="img">{children}</svg>;
}

function EmptyVisual({ message = 'Choose compatible columns to render this visual.' }: { message?: string }) {
  return <div className="av-empty"><strong>{message}</strong></div>;
}

function Histogram({ rows, col }: { rows: CellValue[][]; col: Col }) {
  const values = rows.flatMap((row) => {
    const value = numeric(row[col.index]);
    return value === null ? [] : [value];
  });
  if (!values.length) return <EmptyVisual />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = 18;
  const binWidth = (max - min || 1) / binCount;
  const bins = Array.from({ length: binCount }, () => 0);
  values.forEach((value) => {
    const index = Math.min(binCount - 1, Math.floor((value - min) / binWidth));
    bins[index] += 1;
  });
  const maxCount = Math.max(...bins, 1);

  return (
    <Svg>
      <text x="75" y="35" className="av-kicker">{values.length.toLocaleString()} observations</text>
      {bins.map((count, index) => {
        const width = 870 / binCount;
        const x = 75 + index * width;
        const height = (count / maxCount) * 400;
        return (
          <g key={index}>
            <rect x={x + 2} y={455 - height} width={width - 4} height={height} rx="4" />
            <text x={x + width / 2} y="482" textAnchor="middle">{format(min + index * binWidth)}</text>
          </g>
        );
      })}
    </Svg>
  );
}

function BoxPlot({ rows, category, measure }: { rows: CellValue[][]; category: Col; measure: Col }) {
  const groups = new Map<string, number[]>();
  rows.forEach((row) => {
    const label = text(row[category.index]).trim() || '(blank)';
    const value = numeric(row[measure.index]);
    if (value === null) return;
    const bucket = groups.get(label) ?? [];
    bucket.push(value);
    groups.set(label, bucket);
  });

  const items = [...groups.entries()].slice(0, 12).map(([label, values]) => ({
    label,
    min: Math.min(...values),
    q1: quantile(values, 0.25),
    median: quantile(values, 0.5),
    q3: quantile(values, 0.75),
    max: Math.max(...values),
  }));
  if (!items.length) return <EmptyVisual />;

  const low = Math.min(...items.map((item) => item.min));
  const high = Math.max(...items.map((item) => item.max));
  const range = high - low || 1;
  const px = (value: number) => 210 + ((value - low) / range) * 700;

  return (
    <Svg>
      {items.map((item, index) => {
        const y = 55 + index * 38;
        return (
          <g key={item.label}>
            <text x="20" y={y + 5}>{item.label.slice(0, 24)}</text>
            <line x1={px(item.min)} x2={px(item.max)} y1={y} y2={y} className="av-thin" />
            <rect x={px(item.q1)} y={y - 10} width={Math.max(2, px(item.q3) - px(item.q1))} height="20" rx="3" />
            <line x1={px(item.median)} x2={px(item.median)} y1={y - 14} y2={y + 14} className="av-median" />
          </g>
        );
      })}
    </Svg>
  );
}

function Beeswarm({ rows, col }: { rows: CellValue[][]; col: Col }) {
  const values = rows.flatMap((row, index) => {
    const value = numeric(row[col.index]);
    return value === null ? [] : [{ value, index }];
  }).slice(0, 1500);
  if (!values.length) return <EmptyVisual />;

  const low = Math.min(...values.map((point) => point.value));
  const high = Math.max(...values.map((point) => point.value));
  return (
    <Svg>
      <line x1="75" x2="925" y1="280" y2="280" className="av-thin" />
      {values.map((point, index) => {
        const x = 75 + ((point.value - low) / (high - low || 1)) * 850;
        const lane = ((index * 7) % 23) - 11;
        const y = 280 + lane * 9;
        return <circle key={point.index} cx={x} cy={y} r="5" opacity=".5" />;
      })}
    </Svg>
  );
}

function BubbleChart({ rows, xCol, yCol, sizeCol }: { rows: CellValue[][]; xCol: Col; yCol: Col; sizeCol: Col }) {
  const points = rows.flatMap((row, index) => {
    const x = numeric(row[xCol.index]);
    const y = numeric(row[yCol.index]);
    const size = numeric(row[sizeCol.index]);
    return x === null || y === null || size === null ? [] : [{ x, y, size: Math.abs(size), index }];
  }).slice(0, 800);
  if (!points.length) return <EmptyVisual />;

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const maxSize = Math.max(...points.map((point) => point.size), 1);

  return (
    <Svg>
      {points.map((point) => (
        <circle
          key={point.index}
          cx={70 + ((point.x - minX) / (maxX - minX || 1)) * 860}
          cy={490 - ((point.y - minY) / (maxY - minY || 1)) * 420}
          r={4 + Math.sqrt(point.size / maxSize) * 22}
          opacity=".58"
        />
      ))}
    </Svg>
  );
}

function Funnel({ rows, category, measure }: { rows: CellValue[][]; category: Col; measure: Col }) {
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const label = text(row[category.index]).trim() || '(blank)';
    const value = numeric(row[measure.index]);
    if (value !== null) grouped.set(label, (grouped.get(label) ?? 0) + value);
  });
  const items = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9);
  if (!items.length) return <EmptyVisual />;
  const max = Math.max(items[0][1], 1);

  return (
    <Svg>
      {items.map(([label, value], index) => {
        const width = 160 + (value / max) * 620;
        const x = 500 - width / 2;
        const y = 45 + index * 52;
        return (
          <g key={label}>
            <path d={`M${x} ${y} H${x + width} L${x + width - 24} ${y + 40} H${x + 24} Z`} />
            <text x="500" y={y + 25} textAnchor="middle" className="av-invert">{label.slice(0, 28)} · {format(value)}</text>
          </g>
        );
      })}
    </Svg>
  );
}

function SlopeChart({ rows, category, first, second }: { rows: CellValue[][]; category: Col; first: Col; second: Col }) {
  const points = rows.flatMap((row, index) => {
    const a = numeric(row[first.index]);
    const b = numeric(row[second.index]);
    return a === null || b === null ? [] : [{ label: text(row[category.index]) || `Row ${index + 1}`, a, b, index }];
  }).slice(0, 18);
  if (!points.length) return <EmptyVisual />;

  const values = points.flatMap((point) => [point.a, point.b]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const py = (value: number) => 490 - ((value - low) / (high - low || 1)) * 420;

  return (
    <Svg>
      <text x="230" y="35" textAnchor="middle">{first.name}</text>
      <text x="770" y="35" textAnchor="middle">{second.name}</text>
      {points.map((point) => (
        <g key={point.index}>
          <line x1="230" x2="770" y1={py(point.a)} y2={py(point.b)} className="av-thin" opacity=".45" />
          <circle cx="230" cy={py(point.a)} r="6" />
          <circle cx="770" cy={py(point.b)} r="6" />
          <text x="215" y={py(point.a) + 4} textAnchor="end">{point.label.slice(0, 18)}</text>
        </g>
      ))}
    </Svg>
  );
}

function Treemap({ rows, category, measure }: { rows: CellValue[][]; category: Col; measure: Col }) {
  const [selected,setSelected]=useState<string|null>(null);
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const label = text(row[category.index]).trim() || '(blank)';
    const value = numeric(row[measure.index]);
    if (value !== null) grouped.set(label, (grouped.get(label) ?? 0) + Math.abs(value));
  });
  const items = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (!items.length) return <EmptyVisual />;
  const total = items.reduce((sum, item) => sum + item[1], 0) || 1;

  let x = 40;
  let y = 40;
  let rowHeight = 0;
  const boxes = items.map(([label, value], index) => {
    const area = (value / total) * 820 * 440;
    const width = Math.max(90, Math.min(380, Math.sqrt(area * 1.65)));
    const height = Math.max(55, area / width);
    if (x + width > 940) {
      x = 40;
      y += rowHeight + 8;
      rowHeight = 0;
    }
    const box = { label, value, index, x, y, width, height };
    x += width + 8;
    rowHeight = Math.max(rowHeight, height);
    return box;
  });

  return (
    <Svg><rect width="1000" height="560" fill="transparent" onClick={()=>setSelected(null)}/>
      {selected&&<g className="av-breadcrumb"><rect x="40" y="8" width="300" height="25" rx="6"/><text x="52" y="25">All / {selected} · click background to reset</text></g>}
      {boxes.map((box) => (
        <g key={box.label} className="av-treemap-cell" opacity={selected && selected !== box.label ? 0.22 : 1} onClick={e=>{e.stopPropagation();setSelected(box.label)}}>
          <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="8" opacity={0.35 + 0.55 * (1 - box.index / boxes.length)} />
          <title>{box.label}: {format(box.value)} ({format(box.value/total*100)}%)</title>
          {box.width>105&&box.height>48&&<text x={box.x + 10} y={box.y + 22}>{box.label.slice(0, 20)}</text>}
          {box.height>66&&<text x={box.x + 10} y={box.y + 42} className="av-small">{format(box.value)}</text>}
        </g>
      ))}
    </Svg>
  );
}

type Link = { source: string; target: string; weight: number; index: number };

function buildLinks(rows: CellValue[][], source: Col, target: Col, weight?: Col): Link[] {
  return rows.flatMap((row, index) => {
    const sourceName = text(row[source.index]).trim();
    const targetName = text(row[target.index]).trim();
    if (!sourceName || !targetName) return [];
    const rawWeight = weight ? numeric(row[weight.index]) : 1;
    return [{ source: sourceName, target: targetName, weight: Math.abs(rawWeight ?? 1), index }];
  }).slice(0, 700);
}

function ForceNetwork({ rows, source, target, weight }: { rows: CellValue[][]; source: Col; target: Col; weight?: Col }) {
  const [hovered,setHovered]=useState<string|null>(null),[selected,setSelected]=useState<string|null>(null);
  const links = buildLinks(rows, source, target, weight);
  if (!links.length) return <EmptyVisual />;

  const names = [...new Set(links.flatMap((link) => [link.source, link.target]))].slice(0, 80);
  const indexByName = new Map(names.map((name, index) => [name, index]));
  const positions = names.map((name, index) => {
    const angle = (index / Math.max(1, names.length)) * Math.PI * 2;
    const ring = 125 + (index % 5) * 42;
    return { name, x: 500 + Math.cos(angle) * ring, y: 280 + Math.sin(angle) * ring };
  });
  const maxWeight = Math.max(...links.map((link) => link.weight), 1);
  const degree = new Map<string, number>();
  links.forEach((link) => {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  });

  const focus=selected||hovered,connected=new Set(focus?links.flatMap(link=>link.source===focus?[link.target]:link.target===focus?[link.source]:[]):[]);if(focus)connected.add(focus);
  return (
    <Svg><rect width="1000" height="560" fill="transparent" onClick={()=>setSelected(null)}/>
      {links.map((link) => {
        const a = positions[indexByName.get(link.source) ?? 0];
        const b = positions[indexByName.get(link.target) ?? 0];
        if (!a || !b) return null;
        const related=!focus||link.source===focus||link.target===focus;return <line key={link.index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="av-thin av-flow" strokeWidth={0.5 + (4 * link.weight) / maxWeight} opacity={related ? .62 : .035}><title>{link.source} → {link.target}: {format(link.weight)}</title></line>;
      })}
      {positions.map((position) => (
        <g key={position.name} className="av-node" opacity={!focus||connected.has(position.name)?1:.12} onMouseEnter={()=>setHovered(position.name)} onMouseLeave={()=>setHovered(null)} onClick={e=>{e.stopPropagation();setSelected(position.name)}}>
          <circle cx={position.x} cy={position.y} r={7 + Math.min(12, degree.get(position.name) ?? 0)} />
          <title>{position.name} · {degree.get(position.name)??0} connections</title>
          <text x={position.x + 12} y={position.y + 4}>{position.name.slice(0, 16)}</text>
        </g>
      ))}
    </Svg>
  );
}

function SankeyFlow({ rows, source, target, weight }: { rows: CellValue[][]; source: Col; target: Col; weight?: Col }) {
  const [focus,setFocus]=useState<string|null>(null);
  const links = buildLinks(rows, source, target, weight);
  if (!links.length) return <EmptyVisual />;

  const leftNames = [...new Set(links.map((link) => link.source))].slice(0, 25);
  const rightNames = [...new Set(links.map((link) => link.target))].slice(0, 25);
  const leftY = new Map(leftNames.map((name, index) => [name, 50 + index * (450 / Math.max(1, leftNames.length - 1))]));
  const rightY = new Map(rightNames.map((name, index) => [name, 50 + index * (450 / Math.max(1, rightNames.length - 1))]));
  const maxWeight = Math.max(...links.map((link) => link.weight), 1);

  return (
    <Svg><rect width="1000" height="560" fill="transparent" onClick={()=>setFocus(null)}/>
      {links.map((link) => {
        const y1 = leftY.get(link.source);
        const y2 = rightY.get(link.target);
        if (y1 === undefined || y2 === undefined) return null;
        return (
          <path
            key={link.index}
            d={`M190 ${y1} C420 ${y1}, 580 ${y2}, 810 ${y2}`}
            fill="none"
            strokeWidth={1 + (8 * link.weight) / maxWeight}
            opacity={!focus||focus.includes(link.source)||focus.includes(link.target) ? .42 : .045}
            className="av-thin av-flow"
            onMouseEnter={()=>setFocus(`${link.source}\u0000${link.target}`)} onMouseLeave={()=>setFocus(null)}
          ><title>{link.source} → {link.target}: {format(link.weight)}</title></path>
        );
      })}
      {leftNames.map((name) => {
        const y = leftY.get(name) ?? 0;
        return (
          <g key={`left-${name}`} className="av-node" opacity={!focus||focus.includes(name)?1:.18} onClick={e=>{e.stopPropagation();setFocus(name)}}>
            <circle cx="180" cy={y} r="7" />
            <text x="165" y={y + 4} textAnchor="end">{name.slice(0, 18)}</text><title>{name}: {format(links.filter(l=>l.source===name).reduce((a,b)=>a+b.weight,0))}</title>
          </g>
        );
      })}
      {rightNames.map((name) => {
        const y = rightY.get(name) ?? 0;
        return (
          <g key={`right-${name}`} className="av-node" opacity={!focus||focus.includes(name)?1:.18} onClick={e=>{e.stopPropagation();setFocus(name)}}>
            <circle cx="820" cy={y} r="7" />
            <text x="835" y={y + 4}>{name.slice(0, 18)}</text><title>{name}: {format(links.filter(l=>l.target===name).reduce((a,b)=>a+b.weight,0))}</title>
          </g>
        );
      })}
    </Svg>
  );
}

function Timeline({ rows, dateCol, labelCol }: { rows: CellValue[][]; dateCol: Col; labelCol: Col }) {
  const events = rows.flatMap((row, index) => {
    const timestamp = Date.parse(text(row[dateCol.index]));
    return Number.isFinite(timestamp) ? [{ timestamp, label: text(row[labelCol.index]) || `Event ${index + 1}`, index }] : [];
  }).slice(0, 200);
  if (!events.length) return <EmptyVisual message="Choose a date column and a label column." />;

  const low = Math.min(...events.map((event) => event.timestamp));
  const high = Math.max(...events.map((event) => event.timestamp));
  return (
    <Svg>
      <line x1="80" x2="920" y1="280" y2="280" className="av-thin" />
      {events.map((event, index) => {
        const x = 80 + ((event.timestamp - low) / (high - low || 1)) * 840;
        const above = index % 2 === 0;
        const y = above ? 170 : 390;
        return (
          <g key={event.index}>
            <line x1={x} x2={x} y1="280" y2={y} className="av-thin" />
            <circle cx={x} cy="280" r="6" />
            <text x={x} y={above ? y - 8 : y + 18} textAnchor="middle">{event.label.slice(0, 18)}</text>
          </g>
        );
      })}
    </Svg>
  );
}

function Globe({ rows, latCol, lonCol, sizeCol, rotation }: { rows: CellValue[][]; latCol: Col; lonCol: Col; sizeCol?: Col; rotation: number }) {
  const points = rows.flatMap((row, index) => {
    const lat = numeric(row[latCol.index]);
    const lon = numeric(row[lonCol.index]);
    if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return [];
    const size = sizeCol ? Math.abs(numeric(row[sizeCol.index]) ?? 1) : 1;
    return [{ lat, lon, size, index }];
  }).slice(0, 1400);
  if (!points.length) return <EmptyVisual message="Choose latitude and longitude columns." />;

  const centerX = 500;
  const centerY = 280;
  const radius = 210;
  const rotationRadians = (rotation * Math.PI) / 180;
  const maxSize = Math.max(...points.map((point) => point.size), 1);

  const project = (lat: number, lon: number): Point & { visible: boolean } => {
    const phi = (lat * Math.PI) / 180;
    const lambda = (lon * Math.PI) / 180 + rotationRadians;
    const visible = Math.cos(phi) * Math.cos(lambda) >= 0;
    return {
      x: centerX + radius * Math.cos(phi) * Math.sin(lambda),
      y: centerY - radius * Math.sin(phi),
      visible,
    };
  };

  return (
    <Svg>
      <defs>
        <radialGradient id="advanced-globe-gradient">
          <stop offset="0" stopColor="#173c5a" />
          <stop offset="1" stopColor="#07131f" />
        </radialGradient>
        <clipPath id="advanced-globe-clip"><circle cx={centerX} cy={centerY} r={radius} /></clipPath>
      </defs>
      <circle cx={centerX} cy={centerY} r={radius} fill="url(#advanced-globe-gradient)" strokeWidth="2" />
      <g clipPath="url(#advanced-globe-clip)">
        {[-60, -30, 0, 30, 60].map((lat) => {
          const line = Array.from({ length: 73 }, (_, index) => project(lat, -180 + index * 5)).filter((point) => point.visible);
          return <polyline key={`lat-${lat}`} points={line.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" className="av-globe-grid" />;
        })}
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => {
          const line = Array.from({ length: 37 }, (_, index) => project(-90 + index * 5, lon)).filter((point) => point.visible);
          return <polyline key={`lon-${lon}`} points={line.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" className="av-globe-grid" />;
        })}
        {points.map((point) => {
          const projected = project(point.lat, point.lon);
          if (!projected.visible) return null;
          return <circle key={point.index} cx={projected.x} cy={projected.y} r={3 + Math.sqrt(point.size / maxSize) * 9} className="av-globe-point" />;
        })}
      </g>
    </Svg>
  );
}

export default function AdvancedVisualLab() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [visualType, setVisualType] = useState<VisualType>('histogram');
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [third, setThird] = useState('');
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadFile(file: File) {
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/data/parse', { method: 'POST', body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Could not parse file');
      setWorkbook(payload as ParsedWorkbook);
      setSheetIndex(0);
      setHeaderRow(0);
      setPrimary('');
      setSecondary('');
      setThird('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not parse file');
    } finally {
      setLoading(false);
    }
  }

  const sheetRows = workbook?.sheets[sheetIndex]?.rows ?? [];
  const columns = useMemo<Col[]>(() => {
    const maxColumns = Math.max(0, ...sheetRows.slice(0, 100).map((row) => row.length));
    return Array.from({ length: maxColumns }, (_, index) => {
      const sample = sheetRows.slice(headerRow + 1, headerRow + 101).map((row) => row[index]);
      const present = sample.filter((value) => text(value).trim() !== '');
      const numericCount = present.filter((value) => numeric(value) !== null).length;
      return {
        index,
        name: text(sheetRows[headerRow]?.[index]).trim() || `Column ${index + 1}`,
        numeric: present.length > 0 && numericCount >= Math.max(2, present.length * 0.7),
      };
    });
  }, [sheetRows, headerRow]);

  const dataRows = sheetRows.slice(headerRow + 1).filter((row) => row.some((value) => text(value).trim() !== ''));
  const primaryCol = columns.find((column) => String(column.index) === primary);
  const secondaryCol = columns.find((column) => String(column.index) === secondary);
  const thirdCol = columns.find((column) => String(column.index) === third);

  let visual: ReactNode = <EmptyVisual />;
  if (primaryCol) {
    if (visualType === 'histogram' && primaryCol.numeric) visual = <Histogram rows={dataRows} col={primaryCol} />;
    if (visualType === 'beeswarm' && primaryCol.numeric) visual = <Beeswarm rows={dataRows} col={primaryCol} />;
    if (visualType === 'box' && secondaryCol?.numeric) visual = <BoxPlot rows={dataRows} category={primaryCol} measure={secondaryCol} />;
    if (visualType === 'bubble' && primaryCol.numeric && secondaryCol?.numeric && thirdCol?.numeric) visual = <BubbleChart rows={dataRows} xCol={primaryCol} yCol={secondaryCol} sizeCol={thirdCol} />;
    if (visualType === 'funnel' && secondaryCol?.numeric) visual = <Funnel rows={dataRows} category={primaryCol} measure={secondaryCol} />;
    if (visualType === 'slope' && secondaryCol?.numeric && thirdCol?.numeric) visual = <SlopeChart rows={dataRows} category={primaryCol} first={secondaryCol} second={thirdCol} />;
    if (visualType === 'treemap' && secondaryCol?.numeric) visual = <Treemap rows={dataRows} category={primaryCol} measure={secondaryCol} />;
    if (visualType === 'network' && secondaryCol) visual = <ForceNetwork rows={dataRows} source={primaryCol} target={secondaryCol} weight={thirdCol?.numeric ? thirdCol : undefined} />;
    if (visualType === 'sankey' && secondaryCol) visual = <SankeyFlow rows={dataRows} source={primaryCol} target={secondaryCol} weight={thirdCol?.numeric ? thirdCol : undefined} />;
    if (visualType === 'timeline' && secondaryCol) visual = <Timeline rows={dataRows} dateCol={primaryCol} labelCol={secondaryCol} />;
    if (visualType === 'globe' && primaryCol.numeric && secondaryCol?.numeric) visual = <Globe rows={dataRows} latCol={primaryCol} lonCol={secondaryCol} sizeCol={thirdCol?.numeric ? thirdCol : undefined} rotation={rotation} />;
  }

  const families = [...new Set(VISUALS.map((visualDefinition) => visualDefinition.family))];
  const mappingLabels:Record<VisualType,[string,string?,string?]>={histogram:['Value'],box:['Group','Value'],beeswarm:['Value','Group','Size'],bubble:['X axis','Y axis','Bubble size'],funnel:['Stage','Value'],slope:['Category','Start value','End value'],treemap:['Hierarchy / label','Size','Color measure'],network:['Source','Target','Edge weight'],sankey:['Source','Target','Flow weight'],timeline:['Date / start','Event label','Importance'],globe:['Latitude','Longitude','Point weight']};
  const mapping=mappingLabels[visualType];

  return (
    <div className="av-app">
      <aside className="av-sidebar">
        <a href="/vault" className="av-back">← Data Studio</a>
        <h1>Advanced Visual Lab</h1>
        <p>Specialized statistical, relationship, globe and storytelling-adjacent analysis modes from the supplied reference projects.</p>
        {families.map((family) => (
          <section key={family}>
            <h2>{family}</h2>
            {VISUALS.filter((visualDefinition) => visualDefinition.family === family).map((visualDefinition) => (
              <button key={visualDefinition.id} className={visualType === visualDefinition.id ? 'active' : ''} onClick={() => setVisualType(visualDefinition.id)}>
                <strong>{visualDefinition.name}</strong>
                <span>{visualDefinition.note}</span>
              </button>
            ))}
          </section>
        ))}
      </aside>

      <main className="av-main">
        <header>
          <div>
            <span>ADVANCED VISUALIZATION</span>
            <h2>{VISUALS.find((visualDefinition) => visualDefinition.id === visualType)?.name}</h2>
          </div>
          {workbook && <div className="av-file"><strong>{workbook.filename}</strong><span>{dataRows.length.toLocaleString()} rows</span></div>}
        </header>

        {!workbook ? (
          <div className="av-upload">
            <input ref={fileInput} type="file" accept=".xlsx,.csv,.tsv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile(file); }} />
            <h2>Load a workbook</h2>
            <p>The lab uses the same spreadsheet parser as the main Data Studio.</p>
            <button onClick={() => fileInput.current?.click()} disabled={loading}>{loading ? 'Reading…' : 'Choose file'}</button>
            {error && <em>{error}</em>}
          </div>
        ) : (
          <>
            <div className="av-controls">
              <label>Sheet<select value={sheetIndex} onChange={(event) => { setSheetIndex(Number(event.target.value)); setHeaderRow(0); }}>
                {workbook.sheets.map((sheet, index) => <option key={`${sheet.name}-${index}`} value={index}>{sheet.name}</option>)}
              </select></label>
              <label>Header row<select value={headerRow} onChange={(event) => setHeaderRow(Number(event.target.value))}>
                {sheetRows.slice(0, 12).map((_, index) => <option key={index} value={index}>Row {index + 1}</option>)}
              </select></label>
              <label>{mapping[0]}<select value={primary} onChange={(event) => setPrimary(event.target.value)}>
                <option value="">Choose column</option>{columns.map((column) => <option key={column.index} value={column.index}>{column.name}{column.numeric ? ' · #' : ''}</option>)}
              </select></label>
              {mapping[1]&&<label>{mapping[1]}<select value={secondary} onChange={(event) => setSecondary(event.target.value)}>
                <option value="">Choose column</option>{columns.map((column) => <option key={column.index} value={column.index}>{column.name}{column.numeric ? ' · #' : ''}</option>)}
              </select></label>}
              {mapping[2]&&<label>{mapping[2]}<select value={third} onChange={(event) => setThird(event.target.value)}>
                <option value="">Optional</option>{columns.map((column) => <option key={column.index} value={column.index}>{column.name}{column.numeric ? ' · #' : ''}</option>)}
              </select></label>}
              {visualType === 'globe' && <label>Rotate globe<input type="range" min="-180" max="180" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} /></label>}
            </div>
            <section className="av-stage">{visual}</section>
            <footer>
              <button onClick={() => downloadJson('advanced-visual-project.json', {
                type: visualType,
                sheet: workbook.sheets[sheetIndex]?.name,
                headerRow: headerRow + 1,
                columns: { primary: primaryCol?.name, secondary: secondaryCol?.name, third: thirdCol?.name },
              })}>Export visual config</button>
              <a href="/vault">Return to publication editor →</a>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
