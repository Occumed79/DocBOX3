'use client';

import { useMemo, useRef, useState } from 'react';

type CellValue = string | number | boolean | null;
type WorkspaceTab = 'data' | 'visualize' | 'report';
type ColumnType = 'text' | 'number' | 'date' | 'category' | 'boolean';
type Aggregate = 'count' | 'sum' | 'average' | 'min' | 'max';
type PaletteName = 'occu' | 'coral' | 'forest' | 'mono';
type ReportTemplate = 'classic' | 'infographic' | 'process' | 'executive';
type VisualType =
  | 'column'
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'dot'
  | 'scatter'
  | 'dual'
  | 'waterfall'
  | 'ranking'
  | 'kpi'
  | 'table'
  | 'heat-table'
  | 'mini-table'
  | 'locator'
  | 'state-map'
  | 'radial-process';

type ParsedSheet = { name: string; rows: CellValue[][]; rowCount: number; truncated: boolean };
type ParsedWorkbook = { filename: string; sizeBytes: number; sheets: ParsedSheet[]; limits: { rowsPerSheet: number; columns: number } };
type ColumnDef = { id: string; sourceIndex: number; name: string; type: ColumnType; hidden: boolean };
type VisualSpec = {
  id: string;
  title: string;
  description: string;
  type: VisualType;
  dimension: string;
  measure: string;
  measure2: string;
  series: string;
  aggregate: Aggregate;
  topN: number;
  latField: string;
  lonField: string;
  palette: PaletteName;
};
type AggregatedPoint = { category: string; values: Record<string, number>; total: number };

type VisualDefinition = { id: VisualType; group: 'Charts' | 'Maps' | 'Tables' | 'Infographic'; name: string; note: string; glyph: string };

const VISUAL_TYPES: VisualDefinition[] = [
  { id: 'column', group: 'Charts', name: 'Column chart', note: 'Compare categories vertically', glyph: '▥' },
  { id: 'bar', group: 'Charts', name: 'Bar chart', note: 'Rank categories horizontally', glyph: '▤' },
  { id: 'line', group: 'Charts', name: 'Line chart', note: 'Show change over time', glyph: '⌁' },
  { id: 'area', group: 'Charts', name: 'Area chart', note: 'Show trend and volume', glyph: '◢' },
  { id: 'pie', group: 'Charts', name: 'Pie chart', note: 'Simple part-to-whole', glyph: '◔' },
  { id: 'donut', group: 'Charts', name: 'Donut chart', note: 'Composition with center metric', glyph: '◉' },
  { id: 'dot', group: 'Charts', name: 'Dot plot', note: 'Compare values with less ink', glyph: '••' },
  { id: 'scatter', group: 'Charts', name: 'Scatterplot', note: 'Compare two numeric fields', glyph: '⁙' },
  { id: 'dual', group: 'Charts', name: 'Dual-axis chart', note: 'Compare two measures', glyph: '≋' },
  { id: 'waterfall', group: 'Charts', name: 'Waterfall', note: 'Explain cumulative change', glyph: '▟' },
  { id: 'ranking', group: 'Charts', name: 'Ranking', note: 'Top and bottom groups', glyph: '☷' },
  { id: 'locator', group: 'Maps', name: 'Locator map', note: 'Plot latitude / longitude', glyph: '⌖' },
  { id: 'state-map', group: 'Maps', name: 'US state tile map', note: 'Region-based choropleth', glyph: '⬡' },
  { id: 'table', group: 'Tables', name: 'Data table', note: 'Report-ready detail', glyph: '▦' },
  { id: 'heat-table', group: 'Tables', name: 'Heatmap table', note: 'Color numeric cells by intensity', glyph: '▦' },
  { id: 'mini-table', group: 'Tables', name: 'Mini-chart table', note: 'Bars embedded inside rows', glyph: '▥' },
  { id: 'kpi', group: 'Infographic', name: 'Big number', note: 'Single summary metric', glyph: '123' },
  { id: 'radial-process', group: 'Infographic', name: 'Radial process', note: 'Process / share overview', glyph: '◎' },
];

const PALETTES: Record<PaletteName, string[]> = {
  occu: ['#315E9E', '#29A7C8', '#31C48D', '#8B5CF6', '#F59E0B', '#E85D75', '#6172F3', '#F04438'],
  coral: ['#F39A7D', '#F16D7A', '#D85F83', '#9A5B82', '#355F7B', '#62B6A7', '#F0C36E', '#6C7A89'],
  forest: ['#103D31', '#1F6F54', '#38A169', '#7CB342', '#C5A547', '#E07A5F', '#6D597A', '#457B9D'],
  mono: ['#111827', '#374151', '#6B7280', '#9CA3AF', '#4B5563', '#1F2937', '#D1D5DB', '#0F172A'],
};

const STATE_GRID: Record<string, [number, number]> = {
  AK:[0,0], WA:[0,2], ID:[1,2], MT:[2,2], ND:[3,2], MN:[4,2], WI:[5,2], MI:[6,2], VT:[8,2], NH:[9,2], ME:[10,2],
  OR:[0,3], NV:[1,3], WY:[2,3], SD:[3,3], IA:[4,3], IL:[5,3], IN:[6,3], OH:[7,3], NY:[8,3], MA:[9,3],
  CA:[0,4], UT:[1,4], CO:[2,4], NE:[3,4], MO:[4,4], KY:[5,4], WV:[6,4], PA:[7,4], NJ:[8,4], CT:[9,4], RI:[10,4],
  AZ:[0,5], NM:[1,5], KS:[2,5], AR:[3,5], TN:[4,5], VA:[5,5], MD:[6,5], DE:[7,5], DC:[8,5],
  HI:[0,7], TX:[1,6], OK:[2,6], LA:[3,6], MS:[4,6], AL:[5,6], GA:[6,6], SC:[7,6], NC:[8,6],
  FL:[7,7]
};

const STATE_ALIASES: Record<string, string> = {
  alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA', colorado:'CO', connecticut:'CT', delaware:'DE', florida:'FL', georgia:'GA', hawaii:'HI', idaho:'ID', illinois:'IL', indiana:'IN', iowa:'IA', kansas:'KS', kentucky:'KY', louisiana:'LA', maine:'ME', maryland:'MD', massachusetts:'MA', michigan:'MI', minnesota:'MN', mississippi:'MS', missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV', 'new hampshire':'NH', 'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY', 'north carolina':'NC', 'north dakota':'ND', ohio:'OH', oklahoma:'OK', oregon:'OR', pennsylvania:'PA', 'rhode island':'RI', 'south carolina':'SC', 'south dakota':'SD', tennessee:'TN', texas:'TX', utah:'UT', vermont:'VT', virginia:'VA', washington:'WA', 'west virginia':'WV', wisconsin:'WI', wyoming:'WY', 'district of columbia':'DC'
};

function alphaLabel(index: number) {
  let value = index + 1; let output = '';
  while (value > 0) { const remainder = (value - 1) % 26; output = String.fromCharCode(65 + remainder) + output; value = Math.floor((value - 1) / 26); }
  return output;
}
function stringValue(value: CellValue) { return value === null || value === undefined ? '' : String(value); }
function parseNumber(value: CellValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  let text = value.trim(); if (!text) return null;
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/[,$%]/g, '').replace(/[()]/g, '').trim();
  const parsed = Number(text); return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}
function inferType(values: CellValue[]): ColumnType {
  const present = values.filter((v) => stringValue(v).trim() !== '').slice(0, 200); if (!present.length) return 'text';
  if (present.filter((v) => parseNumber(v) !== null).length / present.length >= .8) return 'number';
  if (present.filter((v) => /^(true|false|yes|no|y|n|0|1)$/i.test(stringValue(v).trim())).length / present.length >= .9) return 'boolean';
  const dates = present.filter((v) => { const t = stringValue(v).trim(); return /[-/]|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(t) && Number.isFinite(Date.parse(t)); }).length;
  if (dates / present.length >= .8) return 'date';
  const unique = new Set(present.map((v) => stringValue(v).trim())).size;
  return unique <= Math.max(20, Math.ceil(present.length * .25)) ? 'category' : 'text';
}
function cleanHeader(value: CellValue, index: number, used: Set<string>) {
  const base = stringValue(value).trim() || `Column ${alphaLabel(index)}`; let name = base; let suffix = 2;
  while (used.has(name.toLowerCase())) name = `${base} ${suffix++}`; used.add(name.toLowerCase()); return name;
}
function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000) return new Intl.NumberFormat('en-US', { notation:'compact', maximumFractionDigits:1 }).format(value);
  if (Math.abs(value) >= 1_000) return new Intl.NumberFormat('en-US', { maximumFractionDigits:0 }).format(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits:2 }).format(value);
}
function escapeCsv(value: CellValue) { const text = stringValue(value); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text; }
function downloadText(filename: string, content: string, mime='text/plain;charset=utf-8') {
  const blob = new Blob([content], { type:mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function aggregateValues(values: number[], aggregate: Aggregate) {
  if (aggregate === 'count') return values.length; if (!values.length) return 0;
  if (aggregate === 'sum') return values.reduce((s,v)=>s+v,0); if (aggregate === 'average') return values.reduce((s,v)=>s+v,0)/values.length; if (aggregate === 'min') return Math.min(...values); return Math.max(...values);
}
function paletteFor(spec: VisualSpec) { return PALETTES[spec.palette] || PALETTES.occu; }

function buildAggregation(spec: VisualSpec, dataRows: CellValue[][], columns: ColumnDef[]) {
  const dimension = columns.find((c)=>c.id===spec.dimension); const measure = columns.find((c)=>c.id===spec.measure); const series = columns.find((c)=>c.id===spec.series);
  if (!dimension) return { points:[] as AggregatedPoint[], seriesNames:[] as string[] };
  const bucket = new Map<string, Map<string, number[]>>();
  for (const row of dataRows) {
    const category = stringValue(row[dimension.sourceIndex]).trim() || '(blank)'; const seriesName = series ? stringValue(row[series.sourceIndex]).trim() || '(blank)' : 'Value';
    const numeric = spec.aggregate === 'count' ? 1 : measure ? parseNumber(row[measure.sourceIndex]) : null; if (numeric === null) continue;
    if (!bucket.has(category)) bucket.set(category,new Map()); const bySeries=bucket.get(category)!; if(!bySeries.has(seriesName)) bySeries.set(seriesName,[]); bySeries.get(seriesName)!.push(numeric);
  }
  const seriesNames=[...new Set([...bucket.values()].flatMap((m)=>[...m.keys()]))].slice(0,8);
  let points=[...bucket.entries()].map(([category,bySeries])=>{ const values:Record<string,number>={}; for(const s of seriesNames) values[s]=aggregateValues(bySeries.get(s)||[],spec.aggregate); return {category,values,total:Object.values(values).reduce((a,b)=>a+b,0)}; });
  if (['ranking','bar','dot','pie','donut','radial-process'].includes(spec.type)) points.sort((a,b)=>b.total-a.total); return {points:points.slice(0,spec.topN),seriesNames};
}
function aggregateSecond(spec: VisualSpec, dataRows: CellValue[][], columns: ColumnDef[]) {
  const dimension=columns.find((c)=>c.id===spec.dimension); const measure=columns.find((c)=>c.id===spec.measure2); if(!dimension||!measure) return new Map<string,number>();
  const bucket=new Map<string,number[]>(); for(const row of dataRows){ const key=stringValue(row[dimension.sourceIndex]).trim()||'(blank)'; const n=parseNumber(row[measure.sourceIndex]); if(n===null) continue; if(!bucket.has(key)) bucket.set(key,[]); bucket.get(key)!.push(n); }
  return new Map([...bucket.entries()].map(([k,v])=>[k,aggregateValues(v,spec.aggregate)]));
}

function SvgFrame({children}:{children:React.ReactNode}) { return <svg className="dv-svg" viewBox="0 0 900 460" role="img">{children}</svg>; }
function EmptyChart({message}:{message:string}) { return <div className="dv-chart-empty"><span>▦</span><strong>Choose fields to build this visual</strong><p>{message}</p></div>; }

function ColumnLineArea({spec,dataRows,columns}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[]}) {
  const {points,seriesNames}=useMemo(()=>buildAggregation(spec,dataRows,columns),[spec,dataRows,columns]); if(!points.length) return <EmptyChart message="Choose a category and numeric measure, or use Count."/>;
  const colors=paletteFor(spec), left=78, top=28, width=772, height=344, max=Math.max(1,...points.flatMap((p)=>seriesNames.map((s)=>p.values[s]||0))); const group=width/Math.max(points.length,1); const bw=Math.max(4,Math.min(34,group*.72/Math.max(1,seriesNames.length)));
  const coords=(s:string)=>points.map((p,i)=>({x:left+(points.length===1?width/2:i*width/(points.length-1)),y:top+height-((p.values[s]||0)/max)*height}));
  return <SvgFrame>{[0,.25,.5,.75,1].map(t=><g key={t}><line x1={left} x2={left+width} y1={top+height-height*t} y2={top+height-height*t} className="dv-gridline"/><text x={left-10} y={top+height-height*t+4} textAnchor="end" className="dv-axis">{formatNumber(max*t)}</text></g>)}
    {spec.type==='column' ? points.map((p,i)=>{const center=left+i*group+group/2;return <g key={p.category}>{seriesNames.map((s,si)=>{const v=p.values[s]||0,h=v/max*height,x=center-(seriesNames.length*bw)/2+si*bw;return <rect key={s} x={x} y={top+height-h} width={Math.max(3,bw-3)} height={Math.max(0,h)} rx="3" fill={colors[si%colors.length]}/>})}<text x={center} y={top+height+23} textAnchor="middle" className="dv-axis">{p.category.slice(0,12)}</text></g>}) : seriesNames.map((s,si)=>{const c=coords(s),pt=c.map(v=>`${v.x},${v.y}`).join(' '),area=`${left},${top+height} ${pt} ${left+width},${top+height}`;return <g key={s}>{spec.type==='area'&&<polygon points={area} fill={colors[si%colors.length]} opacity=".16"/>}<polyline points={pt} fill="none" stroke={colors[si%colors.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{c.map((v,i)=><circle key={i} cx={v.x} cy={v.y} r="4" fill={colors[si%colors.length]}/>)}</g>})}
    {spec.type!=='column'&&points.map((p,i)=><text key={p.category} x={left+(points.length===1?width/2:i*width/(points.length-1))} y={top+height+23} textAnchor="middle" className="dv-axis">{p.category.slice(0,12)}</text>)}</SvgFrame>;
}

function HorizontalBars({spec,dataRows,columns,dots=false}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[];dots?:boolean}) {
  const {points}=useMemo(()=>buildAggregation(spec,dataRows,columns),[spec,dataRows,columns]); if(!points.length) return <EmptyChart message="Choose a category and measure."/>; const colors=paletteFor(spec); const max=Math.max(1,...points.map(p=>Math.abs(p.total))); const rowH=Math.min(46,340/Math.max(points.length,1));
  return <SvgFrame>{points.map((p,i)=>{const y=40+i*rowH,w=Math.abs(p.total)/max*590;return <g key={p.category}><text x="18" y={y+15} className="dv-axis">{p.category.slice(0,26)}</text><line x1="220" x2="810" y1={y+7} y2={y+7} className="dv-gridline"/>{dots?<><circle cx={220+w} cy={y+7} r="8" fill={colors[i%colors.length]}/><line x1="220" x2={220+w} y1={y+7} y2={y+7} stroke={colors[i%colors.length]} strokeWidth="2"/></>:<rect x="220" y={y-3} width={w} height={20} rx="5" fill={colors[i%colors.length]}/>}<text x={Math.min(860,235+w)} y={y+13} className="dv-value">{formatNumber(p.total)}</text></g>})}</SvgFrame>;
}

function PieDonut({spec,dataRows,columns}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[]}) {
  const {points}=useMemo(()=>buildAggregation(spec,dataRows,columns),[spec,dataRows,columns]); if(!points.length)return <EmptyChart message="Choose a category and measure."/>; const colors=paletteFor(spec),total=points.reduce((s,p)=>s+Math.max(0,p.total),0)||1,r=120,c=2*Math.PI*r; let offset=0;
  return <SvgFrame><g transform="rotate(-90 290 225)">{points.map((p,i)=>{const f=Math.max(0,p.total)/total,len=c*f,o=-c*offset;offset+=f;return <circle key={p.category} cx="290" cy="225" r={r} fill="none" stroke={colors[i%colors.length]} strokeWidth={spec.type==='donut'?58:120} strokeDasharray={`${len} ${c-len}`} strokeDashoffset={o}/>})}</g>{spec.type==='donut'&&<><circle cx="290" cy="225" r="80" className="dv-hole"/><text x="290" y="220" textAnchor="middle" className="dv-total">{formatNumber(total)}</text><text x="290" y="244" textAnchor="middle" className="dv-sub">TOTAL</text></>}{points.slice(0,8).map((p,i)=><g key={p.category} transform={`translate(510 ${85+i*40})`}><rect width="12" height="12" rx="3" fill={colors[i%colors.length]}/><text x="22" y="11" className="dv-axis">{p.category.slice(0,23)}</text><text x="320" y="11" textAnchor="end" className="dv-value">{formatNumber(p.total)}</text></g>)}</SvgFrame>;
}

function Scatter({spec,dataRows,columns}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[]}) {
  const xC=columns.find(c=>c.id===spec.dimension),yC=columns.find(c=>c.id===spec.measure); if(!xC||!yC)return <EmptyChart message="Choose numeric X and Y fields."/>; const dots=dataRows.flatMap((r,i)=>{const x=parseNumber(r[xC.sourceIndex]),y=parseNumber(r[yC.sourceIndex]);return x===null||y===null?[]:[{x,y,i}]}).slice(0,1500); if(!dots.length)return <EmptyChart message="The selected columns do not contain numeric pairs."/>; const minX=Math.min(...dots.map(d=>d.x)),maxX=Math.max(...dots.map(d=>d.x)),minY=Math.min(...dots.map(d=>d.y)),maxY=Math.max(...dots.map(d=>d.y)),rx=maxX-minX||1,ry=maxY-minY||1,color=paletteFor(spec)[0];
  return <SvgFrame>{[0,.25,.5,.75,1].map(t=><g key={t}><line x1="80" x2="850" y1={372-t*330} y2={372-t*330} className="dv-gridline"/><text x="68" y={376-t*330} textAnchor="end" className="dv-axis">{formatNumber(minY+t*ry)}</text></g>)}{dots.map(d=><circle key={d.i} cx={80+(d.x-minX)/rx*770} cy={372-(d.y-minY)/ry*330} r="5" fill={color} opacity=".62"/>)}<text x="465" y="442" textAnchor="middle" className="dv-axis-title">{xC.name}</text></SvgFrame>;
}

function DualAxis({spec,dataRows,columns}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[]}) {
  const base=buildAggregation(spec,dataRows,columns); const second=aggregateSecond(spec,dataRows,columns); if(!base.points.length||!spec.measure2)return <EmptyChart message="Choose a category and two numeric measures."/>; const colors=paletteFor(spec),vals2=base.points.map(p=>second.get(p.category)||0),max1=Math.max(1,...base.points.map(p=>p.total)),max2=Math.max(1,...vals2.map(Math.abs)),left=78,top=30,w=770,h=340,group=w/Math.max(base.points.length,1); const linePts=base.points.map((p,i)=>`${left+(i+.5)*group},${top+h-(vals2[i]/max2)*h}`).join(' ');
  return <SvgFrame>{base.points.map((p,i)=>{const bh=p.total/max1*h,cx=left+(i+.5)*group;return <g key={p.category}><rect x={cx-Math.min(22,group*.25)} y={top+h-bh} width={Math.min(44,group*.5)} height={bh} rx="3" fill={colors[0]} opacity=".82"/><text x={cx} y={top+h+22} textAnchor="middle" className="dv-axis">{p.category.slice(0,11)}</text></g>})}<polyline points={linePts} fill="none" stroke={colors[3]} strokeWidth="4"/>{base.points.map((p,i)=><circle key={p.category} cx={left+(i+.5)*group} cy={top+h-(vals2[i]/max2)*h} r="5" fill={colors[3]}/>)}</SvgFrame>;
}

function Waterfall({spec,dataRows,columns}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[]}) {
  const {points}=buildAggregation(spec,dataRows,columns); if(!points.length)return <EmptyChart message="Choose a category and measure."/>; const colors=paletteFor(spec); let running=0; const steps=points.map(p=>{const start=running;running+=p.total;return {...p,start,end:running}}); const all=steps.flatMap(s=>[s.start,s.end,0]),min=Math.min(...all),max=Math.max(...all),range=max-min||1,left=72,top=32,w=780,h=340,group=w/Math.max(steps.length,1);
  return <SvgFrame><line x1={left} x2={left+w} y1={top+h-(0-min)/range*h} y2={top+h-(0-min)/range*h} className="dv-gridline"/>{steps.map((s,i)=>{const y1=top+h-(s.start-min)/range*h,y2=top+h-(s.end-min)/range*h,y=Math.min(y1,y2),bh=Math.max(3,Math.abs(y2-y1)),cx=left+(i+.5)*group;return <g key={s.category}><line x1={i?left+(i-.5)*group:cx} x2={cx} y1={y1} y2={y1} className="dv-water-connector"/><rect x={cx-Math.min(28,group*.32)} y={y} width={Math.min(56,group*.64)} height={bh} rx="3" fill={s.total>=0?colors[1]:colors[5]}/><text x={cx} y={top+h+23} textAnchor="middle" className="dv-axis">{s.category.slice(0,10)}</text></g>})}</SvgFrame>;
}

function Kpi({spec,dataRows,columns}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[]}) { const m=columns.find(c=>c.id===spec.measure); if(spec.aggregate!=='count'&&!m)return <EmptyChart message="Choose a numeric field."/>; const values=spec.aggregate==='count'?dataRows.map(()=>1):dataRows.flatMap(r=>{const n=m?parseNumber(r[m.sourceIndex]):null;return n===null?[]:[n]}); return <div className="dv-kpi"><span>{spec.aggregate.toUpperCase()}</span><strong>{formatNumber(aggregateValues(values,spec.aggregate))}</strong><p>{m?.name||'Rows in dataset'}</p></div>; }

function DataTable({spec,dataRows,columns,heat=false,mini=false}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[];heat?:boolean;mini?:boolean}) {
  const visible=columns.filter(c=>!c.hidden).slice(0,mini?5:8); if(!visible.length)return <EmptyChart message="Unhide at least one column."/>; const rows=dataRows.slice(0,Math.max(5,Math.min(spec.topN,25))); const numeric=visible.filter(c=>c.type==='number'); const maxima=new Map(numeric.map(c=>[c.id,Math.max(1,...rows.map(r=>Math.abs(parseNumber(r[c.sourceIndex])||0)))])); const color=paletteFor(spec)[0];
  return <div className="dv-table-wrap"><table className="dv-table"><thead><tr>{visible.map(c=><th key={c.id}>{c.name}</th>)}</tr></thead><tbody>{rows.map((r,ri)=><tr key={ri}>{visible.map(c=>{const n=parseNumber(r[c.sourceIndex]); const ratio=n===null?0:Math.min(1,Math.abs(n)/(maxima.get(c.id)||1)); return <td key={c.id} style={heat&&n!==null?{background:`color-mix(in srgb, ${color} ${Math.round(12+ratio*70)}%, white)`}:undefined}>{mini&&n!==null?<div className="dv-mini-cell"><span>{formatNumber(n)}</span><i style={{width:`${Math.max(3,ratio*100)}%`,background:color}}/></div>:stringValue(r[c.sourceIndex])}</td>})}</tr>)}</tbody></table></div>;
}

function LocatorMap({spec,dataRows,columns}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[]}) {
  const lat=columns.find(c=>c.id===spec.latField),lon=columns.find(c=>c.id===spec.lonField),label=columns.find(c=>c.id===spec.dimension); if(!lat||!lon)return <EmptyChart message="Choose latitude and longitude columns."/>; const pts=dataRows.flatMap((r,i)=>{const la=parseNumber(r[lat.sourceIndex]),lo=parseNumber(r[lon.sourceIndex]);return la===null||lo===null||la<-90||la>90||lo<-180||lo>180?[]:[{la,lo,label:label?stringValue(r[label.sourceIndex]):`Point ${i+1}`,i}]}).slice(0,1200); if(!pts.length)return <EmptyChart message="No valid latitude / longitude pairs found."/>; const color=paletteFor(spec)[0];
  return <SvgFrame><rect x="30" y="25" width="840" height="390" rx="18" className="dv-map-bg"/>{[-120,-60,0,60,120].map(lo=><line key={lo} x1={450+lo/180*400} x2={450+lo/180*400} y1="45" y2="395" className="dv-map-grid"/>)}{[-60,-30,0,30,60].map(la=><line key={la} x1="50" x2="850" y1={220-la/90*175} y2={220-la/90*175} className="dv-map-grid"/>)}<text x="62" y="62" className="dv-map-caption">LAT / LON LOCATOR MAP</text>{pts.map(p=>{const x=450+p.lo/180*400,y=220-p.la/90*175;return <g key={p.i}><circle cx={x} cy={y} r="6" fill={color} opacity=".72"/><circle cx={x} cy={y} r="11" fill="none" stroke={color} opacity=".2"/></g>})}</SvgFrame>;
}

function StateTileMap({spec,dataRows,columns}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[]}) {
  const dim=columns.find(c=>c.id===spec.dimension),measure=columns.find(c=>c.id===spec.measure); if(!dim)return <EmptyChart message="Choose a state name or two-letter code column."/>; const bucket=new Map<string,number[]>(); for(const r of dataRows){const raw=stringValue(r[dim.sourceIndex]).trim(),code=raw.length===2?raw.toUpperCase():STATE_ALIASES[raw.toLowerCase()]; if(!code||!STATE_GRID[code])continue; const n=spec.aggregate==='count'?1:measure?parseNumber(r[measure.sourceIndex]):null;if(n===null)continue;if(!bucket.has(code))bucket.set(code,[]);bucket.get(code)!.push(n);} const values=new Map([...bucket.entries()].map(([k,v])=>[k,aggregateValues(v,spec.aggregate)])); if(!values.size)return <EmptyChart message="No recognizable US states found in the selected column."/>; const max=Math.max(1,...values.values()),colors=paletteFor(spec),cell=58,ox=90,oy=34;
  return <SvgFrame>{Object.entries(STATE_GRID).map(([code,[gx,gy]])=>{const v=values.get(code),ratio=v===undefined?0:Math.max(0,Math.min(1,v/max)),fill=v===undefined?'#EEF2F6':colors[Math.min(colors.length-1,Math.floor(ratio*(colors.length-1)))];return <g key={code} transform={`translate(${ox+gx*cell} ${oy+gy*cell})`}><rect width="48" height="42" rx="8" fill={fill} stroke="#fff"/><text x="24" y="19" textAnchor="middle" className="dv-state-code">{code}</text>{v!==undefined&&<text x="24" y="34" textAnchor="middle" className="dv-state-value">{formatNumber(v)}</text>}</g>})}</SvgFrame>;
}

function RadialProcess({spec,dataRows,columns}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[]}) { const {points}=buildAggregation(spec,dataRows,columns); if(!points.length)return <EmptyChart message="Choose a process/category field and measure."/>; const colors=paletteFor(spec),max=Math.max(1,...points.map(p=>Math.abs(p.total))),cx=430,cy=225,r=145; return <SvgFrame><circle cx={cx} cy={cy} r="78" className="dv-radial-center"/><text x={cx} y={cy-5} textAnchor="middle" className="dv-radial-title">{points.length}</text><text x={cx} y={cy+20} textAnchor="middle" className="dv-sub">SEGMENTS</text>{points.slice(0,10).map((p,i)=>{const a=-Math.PI/2+i*(Math.PI*2/Math.min(points.length,10)),x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r,size=24+Math.abs(p.total)/max*34;return <g key={p.category}><line x1={cx+Math.cos(a)*80} y1={cy+Math.sin(a)*80} x2={x} y2={y} stroke={colors[i%colors.length]} strokeWidth="8" opacity=".28"/><circle cx={x} cy={y} r={size} fill={colors[i%colors.length]} opacity=".9"/><text x={x} y={y-2} textAnchor="middle" className="dv-radial-number">{String(i+1).padStart(2,'0')}</text><text x={x} y={y+15} textAnchor="middle" className="dv-radial-value">{formatNumber(p.total)}</text><text x={x} y={y+size+17} textAnchor="middle" className="dv-axis">{p.category.slice(0,16)}</text></g>})}</SvgFrame>; }

function ChartPreview({spec,dataRows,columns}:{spec:VisualSpec;dataRows:CellValue[][];columns:ColumnDef[]}) {
  if(['column','line','area'].includes(spec.type))return <ColumnLineArea spec={spec} dataRows={dataRows} columns={columns}/>;
  if(spec.type==='bar'||spec.type==='ranking')return <HorizontalBars spec={spec} dataRows={dataRows} columns={columns}/>;
  if(spec.type==='dot')return <HorizontalBars spec={spec} dataRows={dataRows} columns={columns} dots/>;
  if(spec.type==='pie'||spec.type==='donut')return <PieDonut spec={spec} dataRows={dataRows} columns={columns}/>;
  if(spec.type==='scatter')return <Scatter spec={spec} dataRows={dataRows} columns={columns}/>;
  if(spec.type==='dual')return <DualAxis spec={spec} dataRows={dataRows} columns={columns}/>;
  if(spec.type==='waterfall')return <Waterfall spec={spec} dataRows={dataRows} columns={columns}/>;
  if(spec.type==='kpi')return <Kpi spec={spec} dataRows={dataRows} columns={columns}/>;
  if(spec.type==='table')return <DataTable spec={spec} dataRows={dataRows} columns={columns}/>;
  if(spec.type==='heat-table')return <DataTable spec={spec} dataRows={dataRows} columns={columns} heat/>;
  if(spec.type==='mini-table')return <DataTable spec={spec} dataRows={dataRows} columns={columns} mini/>;
  if(spec.type==='locator')return <LocatorMap spec={spec} dataRows={dataRows} columns={columns}/>;
  if(spec.type==='state-map')return <StateTileMap spec={spec} dataRows={dataRows} columns={columns}/>;
  return <RadialProcess spec={spec} dataRows={dataRows} columns={columns}/>;
}

function makeDefaultSpec(columns:ColumnDef[]):VisualSpec { const visible=columns.filter(c=>!c.hidden),numeric=visible.find(c=>c.type==='number'),categorical=visible.find(c=>c.type!=='number'); return {id:`visual-${Date.now()}`,title:'Untitled visualization',description:'',type:'column',dimension:categorical?.id||visible[0]?.id||'',measure:numeric?.id||'',measure2:'',series:'',aggregate:numeric?'sum':'count',topN:10,latField:'',lonField:'',palette:'occu'}; }

const REPORT_TEMPLATES: Array<{id:ReportTemplate;name:string;note:string}> = [
  {id:'classic',name:'Analyst report',note:'Sequential evidence-first pages'},
  {id:'infographic',name:'Infographic board',note:'Dense visual tiles and summary cards'},
  {id:'process',name:'Process page',note:'Hero visual with supporting callouts'},
  {id:'executive',name:'Executive brief',note:'Compact two-column leadership layout'},
];

export default function DataStudioV2(){
  const fileInput=useRef<HTMLInputElement>(null); const [tab,setTab]=useState<WorkspaceTab>('data'); const [workbook,setWorkbook]=useState<ParsedWorkbook|null>(null); const [activeSheet,setActiveSheet]=useState(0); const [headerRow,setHeaderRow]=useState(0); const [grid,setGrid]=useState<CellValue[][]>([]); const [columns,setColumns]=useState<ColumnDef[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState<string|null>(null); const [dragActive,setDragActive]=useState(false); const [builder,setBuilder]=useState<VisualSpec>(()=>makeDefaultSpec([])); const [visuals,setVisuals]=useState<VisualSpec[]>([]); const [reportVisuals,setReportVisuals]=useState<string[]>([]); const [reportTitle,setReportTitle]=useState('Data Analysis Report'); const [reportSubtitle,setReportSubtitle]=useState('Prepared from uploaded spreadsheet data'); const [reportSummary,setReportSummary]=useState(''); const [reportTemplate,setReportTemplate]=useState<ReportTemplate>('classic');

  const initializeSheet=(sheetIndex:number,nextHeaderRow=0,sourceWorkbook=workbook)=>{if(!sourceWorkbook)return;const sheet=sourceWorkbook.sheets[sheetIndex],nextGrid=sheet.rows.map(r=>[...r]),maxColumns=Math.min(sourceWorkbook.limits.columns,Math.max(0,...nextGrid.slice(0,500).map(r=>r.length))),used=new Set<string>();const nextColumns=Array.from({length:maxColumns},(_,sourceIndex)=>{const sample=nextGrid.slice(nextHeaderRow+1,nextHeaderRow+201).map(r=>r[sourceIndex]);return {id:`c-${sourceIndex}-${Date.now()}`,sourceIndex,name:cleanHeader(nextGrid[nextHeaderRow]?.[sourceIndex],sourceIndex,used),type:inferType(sample),hidden:false} satisfies ColumnDef});setActiveSheet(sheetIndex);setHeaderRow(nextHeaderRow);setGrid(nextGrid);setColumns(nextColumns);setBuilder(makeDefaultSpec(nextColumns));setVisuals([]);setReportVisuals([]);};
  async function loadFile(file:File){setLoading(true);setError(null);try{const form=new FormData();form.append('file',file);const response=await fetch('/api/data/parse',{method:'POST',body:form});const payload=await response.json();if(!response.ok)throw new Error(payload?.error||'Could not read this spreadsheet.');const parsed=payload as ParsedWorkbook;setWorkbook(parsed);initializeSheet(0,0,parsed);setTab('data');}catch(reason){setError(reason instanceof Error?reason.message:'Could not read this spreadsheet.');}finally{setLoading(false);if(fileInput.current)fileInput.current.value='';}}
  const dataRows=useMemo(()=>grid.slice(headerRow+1).filter(r=>r.some(v=>stringValue(v).trim()!=='')),[grid,headerRow]); const visibleColumns=columns.filter(c=>!c.hidden),numericColumns=columns.filter(c=>!c.hidden&&c.type==='number'),categoryColumns=columns.filter(c=>!c.hidden&&c.type!=='number'),activeSheetInfo=workbook?.sheets[activeSheet];
  function renameColumn(id:string,name:string){setColumns(c=>c.map(x=>x.id===id?{...x,name}:x));} function updateColumn(id:string,patch:Partial<ColumnDef>){setColumns(c=>c.map(x=>x.id===id?{...x,...patch}:x));} function removeColumn(id:string){setColumns(c=>c.filter(x=>x.id!==id));setBuilder(b=>({...b,dimension:b.dimension===id?'':b.dimension,measure:b.measure===id?'':b.measure,measure2:b.measure2===id?'':b.measure2,series:b.series===id?'':b.series,latField:b.latField===id?'':b.latField,lonField:b.lonField===id?'':b.lonField}));} function moveColumn(id:string,direction:-1|1){setColumns(c=>{const i=c.findIndex(x=>x.id===id),t=i+direction;if(i<0||t<0||t>=c.length)return c;const copy=[...c];[copy[i],copy[t]]=[copy[t],copy[i]];return copy;});} function editCell(dataIndex:number,sourceIndex:number,value:string){const ai=headerRow+1+dataIndex;setGrid(c=>c.map((r,i)=>{if(i!==ai)return r;const copy=[...r];copy[sourceIndex]=value;return copy;}));}
  function exportCleanCsv(){const header=visibleColumns.map(c=>escapeCsv(c.name)).join(','),rows=dataRows.map(r=>visibleColumns.map(c=>escapeCsv(r[c.sourceIndex])).join(',')),base=(workbook?.filename||'dataset').replace(/\.[^.]+$/,'');downloadText(`${base}-cleaned.csv`,[header,...rows].join('\n'),'text/csv;charset=utf-8');}
  function saveVisual(addToReport=false){const id=`visual-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,saved={...builder,id,title:builder.title.trim()||VISUAL_TYPES.find(t=>t.id===builder.type)?.name||'Visualization'};setVisuals(c=>[...c,saved]);if(addToReport)setReportVisuals(c=>[...c,id]);setBuilder({...saved,id:`visual-${Date.now()+1}`});}
  function exportProject(){const payload={version:2,dataset:workbook?.filename,sheet:activeSheetInfo?.name,headerRow:headerRow+1,columns:columns.map(({id,...c})=>c),visuals,report:{title:reportTitle,subtitle:reportSubtitle,summary:reportSummary,template:reportTemplate,visualIds:reportVisuals}};downloadText(`${(workbook?.filename||'project').replace(/\.[^.]+$/,'')}-visual-project.json`,JSON.stringify(payload,null,2),'application/json');}
  function resetWorkspace(){setWorkbook(null);setGrid([]);setColumns([]);setVisuals([]);setReportVisuals([]);setError(null);setTab('data');}
  const reportSpecs=reportVisuals.flatMap(id=>{const m=visuals.find(v=>v.id===id);return m?[m]:[]}); const groups=['Charts','Maps','Tables','Infographic'] as const;

  return <div className="dv-app"><aside className="dv-sidebar"><div className="dv-brand"><div className="dv-brandmark">OM</div><div><strong>Data Studio</strong><span>Occu-Med Analytics</span></div></div><div className="dv-side-label">WORKSPACE</div><nav><button className={tab==='data'?'active':''} onClick={()=>setTab('data')}><span>▦</span><b>Data</b><small>Upload & clean</small></button><button className={tab==='visualize'?'active':''} disabled={!workbook} onClick={()=>workbook&&setTab('visualize')}><span>◫</span><b>Visualize</b><small>{visuals.length} saved</small></button><button className={tab==='report'?'active':''} disabled={!workbook} onClick={()=>workbook&&setTab('report')}><span>▤</span><b>Report</b><small>{reportVisuals.length} visuals</small></button></nav>{workbook&&<div className="dv-file-card"><span>ACTIVE DATASET</span><strong>{workbook.filename}</strong><small>{dataRows.length.toLocaleString()} rows · {columns.length} columns</small><button onClick={resetWorkspace}>Replace dataset</button></div>}<div className="dv-side-footer"><span>Visual references</span><strong>Datawrapper + infographic templates</strong></div></aside>
  <main className="dv-main"><header className="dv-topbar"><div><h1>{tab==='data'?'Data workspace':tab==='visualize'?'Visualization library':'Report designer'}</h1><p>{tab==='data'?'Shape the spreadsheet before analysis.':tab==='visualize'?'Choose the visual that answers the question — charts, maps, tables, or infographic blocks.':'Turn saved visuals into a designed report page, not a stack of charts.'}</p></div>{workbook&&<div className="dv-top-actions"><button className="secondary" onClick={exportCleanCsv}>Export CSV</button><button className="secondary" onClick={exportProject}>Save project</button>{tab==='report'&&<button className="primary" onClick={()=>window.print()}>Print / Save PDF</button>}</div>}</header>{error&&<div className="dv-error"><strong>Could not open that file.</strong><span>{error}</span></div>}

  {!workbook?<section className="dv-upload-page"><div className="dv-upload-copy"><span>SPREADSHEET → VISUAL STORY</span><h2>Build charts, maps, visual tables and report pages from the same workbook.</h2><p>Upload Excel, CSV or TSV. Edit the schema first, then choose from a Datawrapper-style visual catalog and assemble the strongest views into a report.</p><div className="dv-feature-row"><span>Excel + CSV</span><span>Editable headers</span><span>18 visual formats</span><span>4 report templates</span></div></div><div className={`dv-dropzone ${dragActive?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragActive(true)}} onDragLeave={()=>setDragActive(false)} onDrop={e=>{e.preventDefault();setDragActive(false);const f=e.dataTransfer.files?.[0];if(f)loadFile(f)}}><input ref={fileInput} type="file" accept=".xlsx,.csv,.tsv" onChange={e=>{const f=e.target.files?.[0];if(f)loadFile(f)}}/><div className="dv-upload-icon">⇧</div><h3>{loading?'Reading workbook…':'Drop a spreadsheet here'}</h3><p>.xlsx, .csv, or .tsv · up to 30 MB</p><button className="primary" disabled={loading} onClick={()=>fileInput.current?.click()}>{loading?'Parsing…':'Choose file'}</button></div></section>
  :tab==='data'?<section className="dv-data-workspace"><div className="dv-data-toolbar"><label><span>Sheet</span><select value={activeSheet} onChange={e=>initializeSheet(Number(e.target.value),0)}>{workbook.sheets.map((s,i)=><option key={`${s.name}-${i}`} value={i}>{s.name}</option>)}</select></label><label><span>Use row as headers</span><select value={headerRow} onChange={e=>initializeSheet(activeSheet,Number(e.target.value))}>{grid.slice(0,Math.min(15,grid.length)).map((_,i)=><option key={i} value={i}>Row {i+1}</option>)}</select></label><div className="dv-stat"><span>Rows</span><strong>{dataRows.length.toLocaleString()}</strong></div><div className="dv-stat"><span>Columns</span><strong>{columns.length}</strong></div>{activeSheetInfo?.truncated&&<div className="dv-warning">Preview capped at {workbook.limits.rowsPerSheet.toLocaleString()} rows.</div>}</div><div className="dv-schema-grid"><aside className="dv-schema-panel"><div className="dv-panel-head"><div><span>SCHEMA</span><h3>Columns</h3></div><small>Edit names, order and types</small></div><div className="dv-column-list">{columns.map((c,i)=><div className={`dv-column-card ${c.hidden?'muted':''}`} key={c.id}><div className="dv-column-index">{alphaLabel(c.sourceIndex)}</div><div className="dv-column-fields"><input value={c.name} onChange={e=>renameColumn(c.id,e.target.value)}/><select value={c.type} onChange={e=>updateColumn(c.id,{type:e.target.value as ColumnType})}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="category">Category</option><option value="boolean">Boolean</option></select></div><div className="dv-column-actions"><button disabled={i===0} onClick={()=>moveColumn(c.id,-1)}>↑</button><button disabled={i===columns.length-1} onClick={()=>moveColumn(c.id,1)}>↓</button><button onClick={()=>updateColumn(c.id,{hidden:!c.hidden})}>{c.hidden?'◉':'○'}</button><button onClick={()=>removeColumn(c.id)}>×</button></div></div>)}</div></aside><div className="dv-sheet-panel"><div className="dv-panel-head"><div><span>DATA PREVIEW</span><h3>{activeSheetInfo?.name}</h3></div><small>Cells editable · first 250 rows</small></div><div className="dv-table-scroll"><table className="dv-data-table"><thead><tr><th>#</th>{visibleColumns.map(c=><th key={c.id}><span>{c.name}</span><small>{c.type}</small></th>)}</tr></thead><tbody>{dataRows.slice(0,250).map((r,ri)=><tr key={ri}><th>{ri+headerRow+2}</th>{visibleColumns.map(c=><td key={c.id}><input value={stringValue(r[c.sourceIndex])} onChange={e=>editCell(ri,c.sourceIndex,e.target.value)}/></td>)}</tr>)}</tbody></table></div></div></div><div className="dv-next"><div><strong>Schema looks right?</strong><span>These edited fields feed every chart, map, table and report block.</span></div><button className="primary" onClick={()=>setTab('visualize')}>Open visual library →</button></div></section>
  :tab==='visualize'?<section className="dv-visual-workspace"><div className="dv-visual-gallery"><div className="dv-panel-head"><div><span>VISUAL LIBRARY</span><h3>Choose a format</h3></div><small>Based on Datawrapper-style families</small></div>{groups.map(g=><div className="dv-visual-group" key={g}><h4>{g}</h4>{VISUAL_TYPES.filter(v=>v.group===g).map(v=><button key={v.id} className={builder.type===v.id?'active':''} onClick={()=>setBuilder(b=>({...b,type:v.id}))}><i>{v.glyph}</i><span><strong>{v.name}</strong><small>{v.note}</small></span></button>)}</div>)}</div><div className="dv-visual-canvas"><div className="dv-canvas-head"><div><input className="dv-title-input" value={builder.title} onChange={e=>setBuilder(b=>({...b,title:e.target.value}))}/><input className="dv-desc-input" value={builder.description} onChange={e=>setBuilder(b=>({...b,description:e.target.value}))} placeholder="Optional analyst note"/></div><span>LIVE PREVIEW</span></div><div className="dv-chart-stage"><ChartPreview spec={builder} dataRows={dataRows} columns={columns}/></div></div><aside className="dv-config"><div className="dv-panel-head"><div><span>SETTINGS</span><h3>Map data</h3></div></div>
  {!['kpi','table','heat-table','mini-table','locator'].includes(builder.type)&&<label><span>{builder.type==='scatter'?'X axis':builder.type==='state-map'?'State / region':'Category / X axis'}</span><select value={builder.dimension} onChange={e=>setBuilder(b=>({...b,dimension:e.target.value}))}><option value="">Choose column</option>{visibleColumns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  {builder.type==='locator'&&<><label><span>Latitude</span><select value={builder.latField} onChange={e=>setBuilder(b=>({...b,latField:e.target.value}))}><option value="">Choose numeric column</option>{numericColumns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>Longitude</span><select value={builder.lonField} onChange={e=>setBuilder(b=>({...b,lonField:e.target.value}))}><option value="">Choose numeric column</option>{numericColumns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>Optional label</span><select value={builder.dimension} onChange={e=>setBuilder(b=>({...b,dimension:e.target.value}))}><option value="">No label field</option>{visibleColumns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}
  {!['table','heat-table','mini-table','locator','scatter'].includes(builder.type)&&<label><span>Measure</span><select value={builder.measure} onChange={e=>setBuilder(b=>({...b,measure:e.target.value}))}><option value="">{builder.aggregate==='count'?'Not required for count':'Choose numeric column'}</option>{numericColumns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  {builder.type==='scatter'&&<label><span>Y axis</span><select value={builder.measure} onChange={e=>setBuilder(b=>({...b,measure:e.target.value}))}><option value="">Choose numeric column</option>{numericColumns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  {builder.type==='dual'&&<label><span>Second measure</span><select value={builder.measure2} onChange={e=>setBuilder(b=>({...b,measure2:e.target.value}))}><option value="">Choose numeric column</option>{numericColumns.filter(c=>c.id!==builder.measure).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  {!['scatter','table','heat-table','mini-table','locator'].includes(builder.type)&&<label><span>Aggregation</span><select value={builder.aggregate} onChange={e=>setBuilder(b=>({...b,aggregate:e.target.value as Aggregate}))}><option value="count">Count</option><option value="sum">Sum</option><option value="average">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label>}
  {['column','line','area'].includes(builder.type)&&<label><span>Optional series</span><select value={builder.series} onChange={e=>setBuilder(b=>({...b,series:e.target.value}))}><option value="">Single series</option>{categoryColumns.filter(c=>c.id!==builder.dimension).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  {!['scatter','kpi','locator'].includes(builder.type)&&<label><span>{['table','heat-table','mini-table'].includes(builder.type)?'Rows shown':'Categories shown'}</span><select value={builder.topN} onChange={e=>setBuilder(b=>({...b,topN:Number(e.target.value)}))}>{[5,10,15,25,50].map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
  <label><span>Color system</span><select value={builder.palette} onChange={e=>setBuilder(b=>({...b,palette:e.target.value as PaletteName}))}><option value="occu">Occu-Med blue</option><option value="coral">Infographic coral</option><option value="forest">Forest</option><option value="mono">Monochrome</option></select></label><div className="dv-config-actions"><button className="secondary" onClick={()=>saveVisual(false)}>Save visual</button><button className="primary" onClick={()=>saveVisual(true)}>Save + add to report</button></div></aside><div className="dv-saved"><div className="dv-section-title"><div><span>PROJECT</span><h3>Saved visualizations</h3></div><strong>{visuals.length}</strong></div>{!visuals.length?<div className="dv-empty-save">Save different views here, then select the best ones for the report.</div>:<div className="dv-card-grid">{visuals.map(v=><article key={v.id}><div className="dv-mini-preview"><ChartPreview spec={v} dataRows={dataRows} columns={columns}/></div><div><strong>{v.title}</strong><span>{VISUAL_TYPES.find(t=>t.id===v.type)?.name}</span></div><footer><button onClick={()=>setBuilder({...v,id:`visual-${Date.now()}`})}>Edit as new</button><button onClick={()=>setReportVisuals(c=>c.includes(v.id)?c:[...c,v.id])}>{reportVisuals.includes(v.id)?'In report ✓':'Add to report'}</button><button className="danger" onClick={()=>{setVisuals(c=>c.filter(x=>x.id!==v.id));setReportVisuals(c=>c.filter(id=>id!==v.id))}}>Delete</button></footer></article>)}</div>}</div></section>
  :<section className="dv-report-workspace"><aside className="dv-report-settings"><div className="dv-panel-head"><div><span>REPORT</span><h3>Page design</h3></div></div><div className="dv-template-grid">{REPORT_TEMPLATES.map(t=><button key={t.id} className={reportTemplate===t.id?'active':''} onClick={()=>setReportTemplate(t.id)}><strong>{t.name}</strong><span>{t.note}</span></button>)}</div><label><span>Title</span><input value={reportTitle} onChange={e=>setReportTitle(e.target.value)}/></label><label><span>Subtitle</span><input value={reportSubtitle} onChange={e=>setReportSubtitle(e.target.value)}/></label><label><span>Executive summary</span><textarea rows={7} value={reportSummary} onChange={e=>setReportSummary(e.target.value)} placeholder="Key findings, caveats, interpretation."/></label><div className="dv-report-list"><span>VISUAL ORDER</span>{reportSpecs.map((v,i)=><div key={v.id}><strong>{v.title}</strong><span><button disabled={i===0} onClick={()=>setReportVisuals(c=>{const x=[...c];[x[i-1],x[i]]=[x[i],x[i-1]];return x})}>↑</button><button disabled={i===reportSpecs.length-1} onClick={()=>setReportVisuals(c=>{const x=[...c];[x[i+1],x[i]]=[x[i],x[i+1]];return x})}>↓</button><button onClick={()=>setReportVisuals(c=>c.filter(id=>id!==v.id))}>×</button></span></div>)}</div><button className="secondary full" onClick={()=>setTab('visualize')}>+ Add more visualizations</button></aside><article className={`dv-report-page template-${reportTemplate}`} id="analyst-report"><header><span>OCCU-MED · DATA ANALYSIS</span><h2>{reportTitle}</h2><p>{reportSubtitle}</p><div><strong>Dataset</strong><span>{workbook.filename}</span><strong>Sheet</strong><span>{activeSheetInfo?.name}</span><strong>Records</strong><span>{dataRows.length.toLocaleString()}</span></div></header>{reportSummary&&<section className="dv-report-summary"><h3>Executive summary</h3><p>{reportSummary}</p></section>} {!reportSpecs.length?<div className="dv-report-empty"><strong>No visualizations added yet.</strong><p>Go to Visualize and save one or more views.</p></div>:<div className="dv-report-blocks">{reportSpecs.map((v,i)=><section className="dv-report-block" key={v.id}><div className="dv-report-block-head"><span>{String(i+1).padStart(2,'0')}</span><div><h3>{v.title}</h3>{v.description&&<p>{v.description}</p>}</div></div><div className="dv-report-chart"><ChartPreview spec={v} dataRows={dataRows} columns={columns}/></div></section>)}</div>}<footer><span>Generated in Occu-Med Data Studio</span><span>{new Date().toLocaleDateString()}</span></footer></article></section>}
  </main></div>;
}
