'use client';

import { useMemo, useRef, useState } from 'react';

type CellValue = string | number | boolean | null;
type WorkspaceTab = 'data' | 'visualize' | 'report';
type ColumnType = 'text' | 'number' | 'date' | 'category' | 'boolean';
type VisualType = 'bar' | 'line' | 'area' | 'scatter' | 'donut' | 'ranking' | 'kpi' | 'table';
type Aggregate = 'count' | 'sum' | 'average' | 'min' | 'max';

type ParsedSheet = {
  name: string;
  rows: CellValue[][];
  rowCount: number;
  truncated: boolean;
};

type ParsedWorkbook = {
  filename: string;
  sizeBytes: number;
  sheets: ParsedSheet[];
  limits: { rowsPerSheet: number; columns: number };
};

type ColumnDef = {
  id: string;
  sourceIndex: number;
  name: string;
  type: ColumnType;
  hidden: boolean;
};

type VisualSpec = {
  id: string;
  title: string;
  description: string;
  type: VisualType;
  dimension: string;
  measure: string;
  series: string;
  aggregate: Aggregate;
  topN: number;
};

type AggregatedPoint = {
  category: string;
  values: Record<string, number>;
  total: number;
};

const VISUAL_TYPES: Array<{ id: VisualType; name: string; note: string; glyph: string }> = [
  { id: 'bar', name: 'Bar chart', note: 'Compare categories', glyph: '▥' },
  { id: 'line', name: 'Line chart', note: 'Show ordered trends', glyph: '⌁' },
  { id: 'area', name: 'Area chart', note: 'Emphasize volume over time', glyph: '◢' },
  { id: 'scatter', name: 'Scatter plot', note: 'Compare two numeric fields', glyph: '⁙' },
  { id: 'donut', name: 'Donut', note: 'Show composition', glyph: '◉' },
  { id: 'ranking', name: 'Ranking', note: 'Show top or bottom groups', glyph: '☷' },
  { id: 'kpi', name: 'Big number', note: 'Single summary metric', glyph: '123' },
  { id: 'table', name: 'Table', note: 'Report-ready detail', glyph: '▦' },
];

const PALETTE = ['#465fff', '#12b76a', '#f79009', '#7a5af8', '#06aed4', '#ee46bc', '#6172f3', '#f04438'];

function alphaLabel(index: number) {
  let value = index + 1;
  let output = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function stringValue(value: CellValue) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function parseNumber(value: CellValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/[,$%]/g, '').replace(/[()]/g, '').trim();
  const parsed = Number(text);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

function inferType(values: CellValue[]): ColumnType {
  const present = values.filter((value) => stringValue(value).trim() !== '').slice(0, 200);
  if (!present.length) return 'text';
  const numeric = present.filter((value) => parseNumber(value) !== null).length;
  if (numeric / present.length >= 0.8) return 'number';
  const booleanValues = present.filter((value) => /^(true|false|yes|no|y|n|0|1)$/i.test(stringValue(value).trim())).length;
  if (booleanValues / present.length >= 0.9) return 'boolean';
  const dateValues = present.filter((value) => {
    const text = stringValue(value).trim();
    return /[-/]|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text) && Number.isFinite(Date.parse(text));
  }).length;
  if (dateValues / present.length >= 0.8) return 'date';
  const unique = new Set(present.map((value) => stringValue(value).trim())).size;
  if (unique <= Math.max(20, Math.ceil(present.length * 0.25))) return 'category';
  return 'text';
}

function cleanHeader(value: CellValue, index: number, used: Set<string>) {
  const base = stringValue(value).trim() || `Column ${alphaLabel(index)}`;
  let name = base;
  let suffix = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base} ${suffix}`;
    suffix += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000) return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  if (Math.abs(value) >= 1_000) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function escapeCsv(value: CellValue) {
  const text = stringValue(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function aggregateValues(values: number[], aggregate: Aggregate) {
  if (aggregate === 'count') return values.length;
  if (!values.length) return 0;
  if (aggregate === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (aggregate === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregate === 'min') return Math.min(...values);
  return Math.max(...values);
}

function buildAggregation(spec: VisualSpec, dataRows: CellValue[][], columns: ColumnDef[]) {
  const dimension = columns.find((column) => column.id === spec.dimension);
  const measure = columns.find((column) => column.id === spec.measure);
  const series = columns.find((column) => column.id === spec.series);
  if (!dimension) return { points: [] as AggregatedPoint[], seriesNames: [] as string[] };

  const bucket = new Map<string, Map<string, number[]>>();
  for (const row of dataRows) {
    const category = stringValue(row[dimension.sourceIndex]).trim() || '(blank)';
    const seriesName = series ? stringValue(row[series.sourceIndex]).trim() || '(blank)' : 'Value';
    const numeric = spec.aggregate === 'count' ? 1 : measure ? parseNumber(row[measure.sourceIndex]) : null;
    if (numeric === null) continue;
    if (!bucket.has(category)) bucket.set(category, new Map());
    const bySeries = bucket.get(category)!;
    if (!bySeries.has(seriesName)) bySeries.set(seriesName, []);
    bySeries.get(seriesName)!.push(numeric);
  }

  const seriesNames = [...new Set([...bucket.values()].flatMap((map) => [...map.keys()]))].slice(0, 8);
  let points = [...bucket.entries()].map(([category, bySeries]) => {
    const values: Record<string, number> = {};
    for (const seriesName of seriesNames) values[seriesName] = aggregateValues(bySeries.get(seriesName) || [], spec.aggregate);
    const total = Object.values(values).reduce((sum, value) => sum + value, 0);
    return { category, values, total };
  });

  if (spec.type === 'ranking' || spec.type === 'bar' || spec.type === 'donut') points.sort((a, b) => b.total - a.total);
  points = points.slice(0, spec.topN);
  return { points, seriesNames };
}

function SvgFrame({ children }: { children: React.ReactNode }) {
  return <svg className="ds-svg" viewBox="0 0 900 460" role="img">{children}</svg>;
}

function EmptyChart({ message }: { message: string }) {
  return <div className="ds-chart-empty"><span>▦</span><strong>Choose fields to build this visual</strong><p>{message}</p></div>;
}

function AggregatedChart({ spec, dataRows, columns }: { spec: VisualSpec; dataRows: CellValue[][]; columns: ColumnDef[] }) {
  const { points, seriesNames } = useMemo(() => buildAggregation(spec, dataRows, columns), [spec, dataRows, columns]);
  if (!points.length) return <EmptyChart message="Select a category field and a numeric measure, or use Count as the aggregation." />;

  const left = 82;
  const top = 32;
  const width = 770;
  const height = 340;
  const maxValue = Math.max(1, ...points.flatMap((point) => seriesNames.map((series) => point.values[series] || 0)));

  if (spec.type === 'ranking') {
    const rowHeight = Math.min(42, 300 / Math.max(1, points.length));
    return (
      <SvgFrame>
        {points.map((point, index) => {
          const value = point.total;
          const y = 44 + index * rowHeight;
          const barWidth = (Math.max(0, value) / Math.max(1, points[0].total)) * 570;
          return <g key={point.category}>
            <text x="12" y={y + 15} className="ds-axis-label">{point.category.slice(0, 24)}</text>
            <rect x="220" y={y} width={barWidth} height={Math.max(12, rowHeight - 10)} rx="5" fill={PALETTE[index % PALETTE.length]} />
            <text x={Math.min(835, 230 + barWidth)} y={y + 15} className="ds-value-label">{formatNumber(value)}</text>
          </g>;
        })}
      </SvgFrame>
    );
  }

  if (spec.type === 'donut') {
    const total = points.reduce((sum, point) => sum + Math.max(0, point.total), 0) || 1;
    let offset = 0;
    const radius = 118;
    const circumference = 2 * Math.PI * radius;
    return (
      <SvgFrame>
        <g transform="rotate(-90 290 225)">
          {points.map((point, index) => {
            const fraction = Math.max(0, point.total) / total;
            const length = circumference * fraction;
            const dashOffset = -circumference * offset;
            offset += fraction;
            return <circle key={point.category} cx="290" cy="225" r={radius} fill="none" stroke={PALETTE[index % PALETTE.length]} strokeWidth="58" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={dashOffset} />;
          })}
        </g>
        <circle cx="290" cy="225" r="82" className="ds-donut-hole" />
        <text x="290" y="220" textAnchor="middle" className="ds-donut-total">{formatNumber(total)}</text>
        <text x="290" y="246" textAnchor="middle" className="ds-donut-sub">TOTAL</text>
        {points.slice(0, 8).map((point, index) => <g key={point.category} transform={`translate(505 ${95 + index * 38})`}>
          <rect width="12" height="12" rx="3" fill={PALETTE[index % PALETTE.length]} />
          <text x="22" y="11" className="ds-legend-label">{point.category.slice(0, 24)}</text>
          <text x="315" y="11" textAnchor="end" className="ds-legend-value">{formatNumber(point.total)}</text>
        </g>)}
      </SvgFrame>
    );
  }

  const groupWidth = width / Math.max(1, points.length);
  const barWidth = Math.max(5, Math.min(34, groupWidth * 0.68 / Math.max(1, seriesNames.length)));

  if (spec.type === 'bar') {
    return (
      <SvgFrame>
        {[0, .25, .5, .75, 1].map((tick) => <g key={tick}>
          <line x1={left} x2={left + width} y1={top + height - height * tick} y2={top + height - height * tick} className="ds-gridline" />
          <text x={left - 12} y={top + height - height * tick + 4} textAnchor="end" className="ds-axis-label">{formatNumber(maxValue * tick)}</text>
        </g>)}
        {points.map((point, index) => {
          const center = left + index * groupWidth + groupWidth / 2;
          return <g key={point.category}>
            {seriesNames.map((seriesName, seriesIndex) => {
              const value = point.values[seriesName] || 0;
              const h = Math.max(0, value / maxValue) * height;
              const x = center - (seriesNames.length * barWidth) / 2 + seriesIndex * barWidth;
              return <rect key={seriesName} x={x} y={top + height - h} width={Math.max(3, barWidth - 3)} height={h} rx="4" fill={PALETTE[seriesIndex % PALETTE.length]} />;
            })}
            <text x={center} y={top + height + 24} textAnchor="middle" className="ds-axis-label">{point.category.slice(0, 12)}</text>
          </g>;
        })}
        {seriesNames.length > 1 && seriesNames.map((seriesName, index) => <g key={seriesName} transform={`translate(${left + index * 150} 430)`}>
          <rect width="10" height="10" rx="2" fill={PALETTE[index % PALETTE.length]} /><text x="16" y="10" className="ds-axis-label">{seriesName.slice(0, 18)}</text>
        </g>)}
      </SvgFrame>
    );
  }

  const lineSeries = seriesNames.map((seriesName, seriesIndex) => {
    const coordinates = points.map((point, index) => {
      const x = left + (points.length === 1 ? width / 2 : index * (width / (points.length - 1)));
      const value = point.values[seriesName] || 0;
      const y = top + height - (value / maxValue) * height;
      return { x, y, value };
    });
    return { seriesName, seriesIndex, coordinates };
  });

  return (
    <SvgFrame>
      {[0, .25, .5, .75, 1].map((tick) => <g key={tick}>
        <line x1={left} x2={left + width} y1={top + height - height * tick} y2={top + height - height * tick} className="ds-gridline" />
        <text x={left - 12} y={top + height - height * tick + 4} textAnchor="end" className="ds-axis-label">{formatNumber(maxValue * tick)}</text>
      </g>)}
      {lineSeries.map(({ seriesName, seriesIndex, coordinates }) => {
        const pointsText = coordinates.map(({ x, y }) => `${x},${y}`).join(' ');
        const areaPoints = `${left},${top + height} ${pointsText} ${left + width},${top + height}`;
        return <g key={seriesName}>
          {spec.type === 'area' && <polygon points={areaPoints} fill={PALETTE[seriesIndex % PALETTE.length]} opacity="0.16" />}
          <polyline points={pointsText} fill="none" stroke={PALETTE[seriesIndex % PALETTE.length]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {coordinates.map((coordinate, index) => <circle key={index} cx={coordinate.x} cy={coordinate.y} r="4.5" fill={PALETTE[seriesIndex % PALETTE.length]} />)}
        </g>;
      })}
      {points.map((point, index) => {
        const x = left + (points.length === 1 ? width / 2 : index * (width / (points.length - 1)));
        return <text key={point.category} x={x} y={top + height + 24} textAnchor="middle" className="ds-axis-label">{point.category.slice(0, 12)}</text>;
      })}
    </SvgFrame>
  );
}

function ScatterChart({ spec, dataRows, columns }: { spec: VisualSpec; dataRows: CellValue[][]; columns: ColumnDef[] }) {
  const xColumn = columns.find((column) => column.id === spec.dimension);
  const yColumn = columns.find((column) => column.id === spec.measure);
  if (!xColumn || !yColumn) return <EmptyChart message="Choose numeric fields for both the X and Y axes." />;
  const dots = dataRows.flatMap((row, index) => {
    const x = parseNumber(row[xColumn.sourceIndex]);
    const y = parseNumber(row[yColumn.sourceIndex]);
    return x === null || y === null ? [] : [{ x, y, index }];
  }).slice(0, 1000);
  if (!dots.length) return <EmptyChart message="The chosen columns do not contain usable numeric pairs." />;
  const minX = Math.min(...dots.map((dot) => dot.x));
  const maxX = Math.max(...dots.map((dot) => dot.x));
  const minY = Math.min(...dots.map((dot) => dot.y));
  const maxY = Math.max(...dots.map((dot) => dot.y));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  return <SvgFrame>
    {[0, .25, .5, .75, 1].map((tick) => <g key={tick}>
      <line x1="80" x2="850" y1={372 - tick * 330} y2={372 - tick * 330} className="ds-gridline" />
      <text x="68" y={376 - tick * 330} textAnchor="end" className="ds-axis-label">{formatNumber(minY + tick * rangeY)}</text>
    </g>)}
    {dots.map((dot) => {
      const x = 80 + ((dot.x - minX) / rangeX) * 770;
      const y = 372 - ((dot.y - minY) / rangeY) * 330;
      return <circle key={dot.index} cx={x} cy={y} r="5" fill="#465fff" opacity="0.62" />;
    })}
    <text x="80" y="410" className="ds-axis-label">{formatNumber(minX)}</text>
    <text x="850" y="410" textAnchor="end" className="ds-axis-label">{formatNumber(maxX)}</text>
    <text x="465" y="442" textAnchor="middle" className="ds-axis-title">{xColumn.name}</text>
  </SvgFrame>;
}

function KpiChart({ spec, dataRows, columns }: { spec: VisualSpec; dataRows: CellValue[][]; columns: ColumnDef[] }) {
  const measure = columns.find((column) => column.id === spec.measure);
  if (spec.aggregate !== 'count' && !measure) return <EmptyChart message="Choose the numeric field you want to summarize." />;
  const values = spec.aggregate === 'count'
    ? dataRows.map(() => 1)
    : dataRows.flatMap((row) => {
      const value = measure ? parseNumber(row[measure.sourceIndex]) : null;
      return value === null ? [] : [value];
    });
  const value = aggregateValues(values, spec.aggregate);
  return <div className="ds-kpi-preview"><span>{spec.aggregate.toUpperCase()}</span><strong>{formatNumber(value)}</strong><p>{measure?.name || 'Rows in dataset'}</p></div>;
}

function DataTableVisual({ spec, dataRows, columns }: { spec: VisualSpec; dataRows: CellValue[][]; columns: ColumnDef[] }) {
  const visible = columns.filter((column) => !column.hidden).slice(0, 8);
  if (!visible.length) return <EmptyChart message="Unhide at least one column to create a report table." />;
  return <div className="ds-report-table-wrap"><table className="ds-report-table"><thead><tr>{visible.map((column) => <th key={column.id}>{column.name}</th>)}</tr></thead><tbody>{dataRows.slice(0, Math.max(5, Math.min(spec.topN, 25))).map((row, index) => <tr key={index}>{visible.map((column) => <td key={column.id}>{stringValue(row[column.sourceIndex])}</td>)}</tr>)}</tbody></table></div>;
}

function ChartPreview({ spec, dataRows, columns }: { spec: VisualSpec; dataRows: CellValue[][]; columns: ColumnDef[] }) {
  if (spec.type === 'scatter') return <ScatterChart spec={spec} dataRows={dataRows} columns={columns} />;
  if (spec.type === 'kpi') return <KpiChart spec={spec} dataRows={dataRows} columns={columns} />;
  if (spec.type === 'table') return <DataTableVisual spec={spec} dataRows={dataRows} columns={columns} />;
  return <AggregatedChart spec={spec} dataRows={dataRows} columns={columns} />;
}

function makeDefaultSpec(columns: ColumnDef[]): VisualSpec {
  const visible = columns.filter((column) => !column.hidden);
  const numeric = visible.find((column) => column.type === 'number');
  const categorical = visible.find((column) => column.type === 'category' || column.type === 'text' || column.type === 'date');
  return {
    id: `visual-${Date.now()}`,
    title: 'Untitled visualization',
    description: '',
    type: 'bar',
    dimension: categorical?.id || visible[0]?.id || '',
    measure: numeric?.id || visible[1]?.id || '',
    series: '',
    aggregate: numeric ? 'sum' : 'count',
    topN: 10,
  };
}

export default function DataStudio() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<WorkspaceTab>('data');
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [grid, setGrid] = useState<CellValue[][]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [builder, setBuilder] = useState<VisualSpec>(() => makeDefaultSpec([]));
  const [visuals, setVisuals] = useState<VisualSpec[]>([]);
  const [reportVisuals, setReportVisuals] = useState<string[]>([]);
  const [reportTitle, setReportTitle] = useState('Data Analysis Report');
  const [reportSubtitle, setReportSubtitle] = useState('Prepared from uploaded spreadsheet data');
  const [reportSummary, setReportSummary] = useState('');

  const initializeSheet = (sheetIndex: number, nextHeaderRow = 0, sourceWorkbook = workbook) => {
    if (!sourceWorkbook) return;
    const sheet = sourceWorkbook.sheets[sheetIndex];
    const nextGrid = sheet.rows.map((row) => [...row]);
    const maxColumns = Math.min(sourceWorkbook.limits.columns, Math.max(0, ...nextGrid.slice(0, 500).map((row) => row.length)));
    const used = new Set<string>();
    const nextColumns = Array.from({ length: maxColumns }, (_, sourceIndex) => {
      const sample = nextGrid.slice(nextHeaderRow + 1, nextHeaderRow + 201).map((row) => row[sourceIndex]);
      return {
        id: `c-${sourceIndex}-${Date.now()}`,
        sourceIndex,
        name: cleanHeader(nextGrid[nextHeaderRow]?.[sourceIndex], sourceIndex, used),
        type: inferType(sample),
        hidden: false,
      } satisfies ColumnDef;
    });
    setActiveSheet(sheetIndex);
    setHeaderRow(nextHeaderRow);
    setGrid(nextGrid);
    setColumns(nextColumns);
    setBuilder(makeDefaultSpec(nextColumns));
    setVisuals([]);
    setReportVisuals([]);
  };

  async function loadFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/data/parse', { method: 'POST', body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Could not read this spreadsheet.');
      const parsed = payload as ParsedWorkbook;
      setWorkbook(parsed);
      initializeSheet(0, 0, parsed);
      setTab('data');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read this spreadsheet.');
    } finally {
      setLoading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const dataRows = useMemo(() => grid.slice(headerRow + 1).filter((row) => row.some((value) => stringValue(value).trim() !== '')), [grid, headerRow]);
  const visibleColumns = columns.filter((column) => !column.hidden);
  const numericColumns = columns.filter((column) => !column.hidden && column.type === 'number');
  const categoryColumns = columns.filter((column) => !column.hidden && column.type !== 'number');
  const activeSheetInfo = workbook?.sheets[activeSheet];

  function changeHeaderRow(next: number) {
    initializeSheet(activeSheet, next);
  }

  function renameColumn(id: string, name: string) {
    setColumns((current) => current.map((column) => column.id === id ? { ...column, name } : column));
  }

  function updateColumn(id: string, patch: Partial<ColumnDef>) {
    setColumns((current) => current.map((column) => column.id === id ? { ...column, ...patch } : column));
  }

  function removeColumn(id: string) {
    setColumns((current) => current.filter((column) => column.id !== id));
    setBuilder((current) => ({
      ...current,
      dimension: current.dimension === id ? '' : current.dimension,
      measure: current.measure === id ? '' : current.measure,
      series: current.series === id ? '' : current.series,
    }));
  }

  function moveColumn(id: string, direction: -1 | 1) {
    setColumns((current) => {
      const index = current.findIndex((column) => column.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  function editCell(dataIndex: number, sourceIndex: number, value: string) {
    const absoluteIndex = headerRow + 1 + dataIndex;
    setGrid((current) => current.map((row, index) => {
      if (index !== absoluteIndex) return row;
      const copy = [...row];
      copy[sourceIndex] = value;
      return copy;
    }));
  }

  function exportCleanCsv() {
    const header = visibleColumns.map((column) => escapeCsv(column.name)).join(',');
    const rows = dataRows.map((row) => visibleColumns.map((column) => escapeCsv(row[column.sourceIndex])).join(','));
    const base = (workbook?.filename || 'dataset').replace(/\.[^.]+$/, '');
    downloadText(`${base}-cleaned.csv`, [header, ...rows].join('\n'), 'text/csv;charset=utf-8');
  }

  function saveVisual(addToReport = false) {
    const id = `visual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const saved = { ...builder, id, title: builder.title.trim() || VISUAL_TYPES.find((type) => type.id === builder.type)?.name || 'Visualization' };
    setVisuals((current) => [...current, saved]);
    if (addToReport) setReportVisuals((current) => [...current, id]);
    setBuilder({ ...saved, id: `visual-${Date.now() + 1}` });
  }

  function exportProject() {
    const payload = {
      version: 1,
      dataset: workbook?.filename,
      sheet: activeSheetInfo?.name,
      headerRow: headerRow + 1,
      columns: columns.map(({ id, ...column }) => column),
      visuals,
      report: { title: reportTitle, subtitle: reportSubtitle, summary: reportSummary, visualIds: reportVisuals },
    };
    downloadText(`${(workbook?.filename || 'project').replace(/\.[^.]+$/, '')}-visual-project.json`, JSON.stringify(payload, null, 2), 'application/json');
  }

  function resetWorkspace() {
    setWorkbook(null);
    setGrid([]);
    setColumns([]);
    setVisuals([]);
    setReportVisuals([]);
    setError(null);
    setTab('data');
  }

  const reportSpecs = reportVisuals.flatMap((id) => {
    const match = visuals.find((visual) => visual.id === id);
    return match ? [match] : [];
  });

  return (
    <div className="ds-app">
      <aside className="ds-sidebar">
        <div className="ds-brand"><div className="ds-brandmark">OM</div><div><strong>Data Studio</strong><span>Occu-Med Analytics</span></div></div>
        <div className="ds-sidebar-label">WORKSPACE</div>
        <nav>
          <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}><span>▦</span><b>Data</b><small>Upload & clean</small></button>
          <button className={tab === 'visualize' ? 'active' : ''} onClick={() => workbook && setTab('visualize')} disabled={!workbook}><span>◫</span><b>Visualize</b><small>{visuals.length} saved</small></button>
          <button className={tab === 'report' ? 'active' : ''} onClick={() => workbook && setTab('report')} disabled={!workbook}><span>▤</span><b>Report</b><small>{reportVisuals.length} visuals</small></button>
        </nav>
        {workbook && <div className="ds-file-card"><span>ACTIVE DATASET</span><strong>{workbook.filename}</strong><small>{dataRows.length.toLocaleString()} rows · {columns.length} columns</small><button onClick={resetWorkspace}>Replace dataset</button></div>}
        <div className="ds-sidebar-footer"><span>Template shell</span><strong>TailAdmin OSS</strong></div>
      </aside>

      <main className="ds-main">
        <header className="ds-topbar">
          <div><h1>{tab === 'data' ? 'Data workspace' : tab === 'visualize' ? 'Visualization builder' : 'Report builder'}</h1><p>{tab === 'data' ? 'Shape the spreadsheet before you analyze it.' : tab === 'visualize' ? 'Create multiple views from the same cleaned dataset.' : 'Assemble saved visuals into a printable analyst report.'}</p></div>
          {workbook && <div className="ds-top-actions"><button className="secondary" onClick={exportCleanCsv}>Export cleaned CSV</button><button className="secondary" onClick={exportProject}>Save project spec</button>{tab === 'report' && <button className="primary" onClick={() => window.print()}>Print / Save PDF</button>}</div>}
        </header>

        {error && <div className="ds-error"><strong>Could not open that file.</strong><span>{error}</span></div>}

        {!workbook ? (
          <section className="ds-upload-page">
            <div className="ds-upload-copy"><span>SPREADSHEET → VISUAL STORY</span><h2>Turn raw operational data into analysis people can actually use.</h2><p>Upload an Excel workbook or CSV. Choose the real header row, rename and reorder columns, fix data types, create multiple visualizations, and build a report from the same source file.</p><div className="ds-feature-row"><span>Excel + CSV</span><span>Editable schema</span><span>8 visual formats</span><span>Report output</span></div></div>
            <div className={`ds-dropzone ${dragActive ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); const file = event.dataTransfer.files?.[0]; if (file) loadFile(file); }}>
              <input ref={fileInput} type="file" accept=".xlsx,.csv,.tsv" onChange={(event) => { const file = event.target.files?.[0]; if (file) loadFile(file); }} />
              <div className="ds-upload-icon">⇧</div><h3>{loading ? 'Reading workbook…' : 'Drop a spreadsheet here'}</h3><p>.xlsx, .csv, or .tsv · up to 30 MB</p><button className="primary" disabled={loading} onClick={() => fileInput.current?.click()}>{loading ? 'Parsing…' : 'Choose file'}</button>
            </div>
          </section>
        ) : tab === 'data' ? (
          <section className="ds-data-workspace">
            <div className="ds-data-toolbar">
              <label><span>Sheet</span><select value={activeSheet} onChange={(event) => initializeSheet(Number(event.target.value), 0)}>{workbook.sheets.map((sheet, index) => <option key={`${sheet.name}-${index}`} value={index}>{sheet.name}</option>)}</select></label>
              <label><span>Use row as headers</span><select value={headerRow} onChange={(event) => changeHeaderRow(Number(event.target.value))}>{grid.slice(0, Math.min(15, grid.length)).map((_, index) => <option key={index} value={index}>Row {index + 1}</option>)}</select></label>
              <div className="ds-data-stat"><span>Rows</span><strong>{dataRows.length.toLocaleString()}</strong></div>
              <div className="ds-data-stat"><span>Columns</span><strong>{columns.length}</strong></div>
              {activeSheetInfo?.truncated && <div className="ds-warning">Preview capped at {workbook.limits.rowsPerSheet.toLocaleString()} rows.</div>}
            </div>

            <div className="ds-schema-grid">
              <aside className="ds-schema-panel"><div className="ds-panel-head"><div><span>SCHEMA</span><h3>Columns</h3></div><small>Edit names, order and types</small></div>
                <div className="ds-column-list">{columns.map((column, index) => <div className={`ds-column-card ${column.hidden ? 'muted' : ''}`} key={column.id}>
                  <div className="ds-column-index">{alphaLabel(column.sourceIndex)}</div>
                  <div className="ds-column-fields"><input value={column.name} onChange={(event) => renameColumn(column.id, event.target.value)} /><select value={column.type} onChange={(event) => updateColumn(column.id, { type: event.target.value as ColumnType })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="category">Category</option><option value="boolean">Boolean</option></select></div>
                  <div className="ds-column-actions"><button title="Move up" disabled={index === 0} onClick={() => moveColumn(column.id, -1)}>↑</button><button title="Move down" disabled={index === columns.length - 1} onClick={() => moveColumn(column.id, 1)}>↓</button><button title={column.hidden ? 'Show column' : 'Hide column'} onClick={() => updateColumn(column.id, { hidden: !column.hidden })}>{column.hidden ? '◉' : '○'}</button><button title="Delete column" onClick={() => removeColumn(column.id)}>×</button></div>
                </div>)}</div>
              </aside>

              <div className="ds-sheet-panel"><div className="ds-panel-head"><div><span>DATA PREVIEW</span><h3>{activeSheetInfo?.name}</h3></div><small>Cells are editable · first 250 rows shown</small></div>
                <div className="ds-table-scroll"><table className="ds-data-table"><thead><tr><th className="row-num">#</th>{visibleColumns.map((column) => <th key={column.id}><span>{column.name}</span><small>{column.type}</small></th>)}</tr></thead><tbody>{dataRows.slice(0, 250).map((row, rowIndex) => <tr key={rowIndex}><th className="row-num">{rowIndex + headerRow + 2}</th>{visibleColumns.map((column) => <td key={column.id}><input value={stringValue(row[column.sourceIndex])} onChange={(event) => editCell(rowIndex, column.sourceIndex, event.target.value)} /></td>)}</tr>)}</tbody></table></div>
              </div>
            </div>
            <div className="ds-next-step"><div><strong>Schema looks right?</strong><span>Your renamed, reordered and hidden columns carry directly into every visualization.</span></div><button className="primary" onClick={() => setTab('visualize')}>Build visualizations →</button></div>
          </section>
        ) : tab === 'visualize' ? (
          <section className="ds-visual-workspace">
            <div className="ds-visual-gallery"><div className="ds-panel-head"><div><span>VISUAL TYPES</span><h3>Choose a format</h3></div></div>{VISUAL_TYPES.map((type) => <button key={type.id} className={builder.type === type.id ? 'active' : ''} onClick={() => setBuilder((current) => ({ ...current, type: type.id }))}><i>{type.glyph}</i><span><strong>{type.name}</strong><small>{type.note}</small></span></button>)}</div>

            <div className="ds-visual-canvas"><div className="ds-canvas-head"><div><input className="ds-title-input" value={builder.title} onChange={(event) => setBuilder((current) => ({ ...current, title: event.target.value }))} /><input className="ds-desc-input" value={builder.description} onChange={(event) => setBuilder((current) => ({ ...current, description: event.target.value }))} placeholder="Optional subtitle or analyst note" /></div><span>LIVE PREVIEW</span></div><div className="ds-chart-stage"><ChartPreview spec={builder} dataRows={dataRows} columns={columns} /></div></div>

            <aside className="ds-config-panel"><div className="ds-panel-head"><div><span>SETTINGS</span><h3>Map data</h3></div></div>
              {builder.type !== 'kpi' && builder.type !== 'table' && <label><span>{builder.type === 'scatter' ? 'X axis' : 'Category / X axis'}</span><select value={builder.dimension} onChange={(event) => setBuilder((current) => ({ ...current, dimension: event.target.value }))}><option value="">Choose column</option>{columns.filter((column) => !column.hidden).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>}
              {builder.type !== 'table' && <label><span>{builder.type === 'scatter' ? 'Y axis' : 'Measure'}</span><select value={builder.measure} onChange={(event) => setBuilder((current) => ({ ...current, measure: event.target.value }))}><option value="">{builder.aggregate === 'count' ? 'Not required for count' : 'Choose numeric column'}</option>{numericColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>}
              {!['scatter', 'table'].includes(builder.type) && <label><span>Aggregation</span><select value={builder.aggregate} onChange={(event) => setBuilder((current) => ({ ...current, aggregate: event.target.value as Aggregate }))}><option value="count">Count</option><option value="sum">Sum</option><option value="average">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label>}
              {['bar', 'line', 'area'].includes(builder.type) && <label><span>Optional series</span><select value={builder.series} onChange={(event) => setBuilder((current) => ({ ...current, series: event.target.value }))}><option value="">Single series</option>{categoryColumns.filter((column) => column.id !== builder.dimension).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>}
              {!['scatter', 'kpi'].includes(builder.type) && <label><span>{builder.type === 'table' ? 'Rows shown' : 'Categories shown'}</span><select value={builder.topN} onChange={(event) => setBuilder((current) => ({ ...current, topN: Number(event.target.value) }))}>{[5, 10, 15, 25, 50].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
              <div className="ds-config-actions"><button className="secondary" onClick={() => saveVisual(false)}>Save visual</button><button className="primary" onClick={() => saveVisual(true)}>Save + add to report</button></div>
            </aside>

            <div className="ds-saved-visuals"><div className="ds-section-title"><div><span>PROJECT</span><h3>Saved visualizations</h3></div><strong>{visuals.length}</strong></div>{!visuals.length ? <div className="ds-saved-empty">Save different views of the dataset here, then choose which ones belong in the report.</div> : <div className="ds-visual-card-grid">{visuals.map((visual) => <article key={visual.id}><div className="ds-mini-preview"><ChartPreview spec={visual} dataRows={dataRows} columns={columns} /></div><div><strong>{visual.title}</strong><span>{VISUAL_TYPES.find((type) => type.id === visual.type)?.name}</span></div><footer><button onClick={() => setBuilder({ ...visual, id: `visual-${Date.now()}` })}>Edit as new</button><button onClick={() => setReportVisuals((current) => current.includes(visual.id) ? current : [...current, visual.id])}>{reportVisuals.includes(visual.id) ? 'In report ✓' : 'Add to report'}</button><button className="danger" onClick={() => { setVisuals((current) => current.filter((item) => item.id !== visual.id)); setReportVisuals((current) => current.filter((id) => id !== visual.id)); }}>Delete</button></footer></article>)}</div>}</div>
          </section>
        ) : (
          <section className="ds-report-workspace">
            <aside className="ds-report-settings"><div className="ds-panel-head"><div><span>REPORT</span><h3>Document settings</h3></div></div><label><span>Title</span><input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} /></label><label><span>Subtitle</span><input value={reportSubtitle} onChange={(event) => setReportSubtitle(event.target.value)} /></label><label><span>Executive summary</span><textarea rows={8} value={reportSummary} onChange={(event) => setReportSummary(event.target.value)} placeholder="Add the key findings, caveats, or analyst interpretation." /></label><div className="ds-report-list"><span>VISUAL ORDER</span>{reportSpecs.map((visual, index) => <div key={visual.id}><strong>{visual.title}</strong><span><button disabled={index === 0} onClick={() => setReportVisuals((current) => { const copy = [...current]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; return copy; })}>↑</button><button disabled={index === reportSpecs.length - 1} onClick={() => setReportVisuals((current) => { const copy = [...current]; [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]]; return copy; })}>↓</button><button onClick={() => setReportVisuals((current) => current.filter((id) => id !== visual.id))}>×</button></span></div>)}</div><button className="secondary full" onClick={() => setTab('visualize')}>+ Add more visualizations</button></aside>

            <article className="ds-report-page" id="analyst-report"><header><span>OCCU-MED · DATA ANALYSIS</span><h2>{reportTitle}</h2><p>{reportSubtitle}</p><div><strong>Dataset</strong><span>{workbook.filename}</span><strong>Sheet</strong><span>{activeSheetInfo?.name}</span><strong>Records analyzed</strong><span>{dataRows.length.toLocaleString()}</span></div></header>{reportSummary && <section className="ds-report-summary"><h3>Executive summary</h3><p>{reportSummary}</p></section>}{!reportSpecs.length ? <div className="ds-report-empty"><strong>No visualizations added yet.</strong><p>Go to Visualize and save one or more charts to the report.</p></div> : reportSpecs.map((visual, index) => <section className="ds-report-block" key={visual.id}><div className="ds-report-block-head"><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{visual.title}</h3>{visual.description && <p>{visual.description}</p>}</div></div><div className="ds-report-chart"><ChartPreview spec={visual} dataRows={dataRows} columns={columns} /></div></section>)}<footer><span>Generated in Occu-Med Data Studio</span><span>{new Date().toLocaleDateString()}</span></footer></article>
          </section>
        )}
      </main>
    </div>
  );
}
