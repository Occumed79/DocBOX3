import { NextRequest, NextResponse } from 'next/server';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_ROWS_PER_SHEET = 100_000;
const MAX_COLUMNS = 250;

type CellValue = string | number | boolean | null;

type ParsedSheet = {
  name: string;
  rows: CellValue[][];
  rowCount: number;
  truncated: boolean;
};

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function xmlAttr(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}=["']([^"']*)["']`, 'i'));
  return match ? decodeXml(match[1]) : undefined;
}

function unzipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let eocd = -1;
  const min = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This does not appear to be a valid .xlsx ZIP container.');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== 0x02014b50) {
      throw new Error('The workbook ZIP directory is malformed.');
    }
    const compression = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const filenameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const filename = buffer.subarray(pointer + 46, pointer + 46 + filenameLength).toString('utf8');

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Workbook entry ${filename} has an invalid local header.`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (compression === 0) data = Buffer.from(compressed);
    else if (compression === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported XLSX compression method ${compression}.`);

    entries.set(filename.replace(/\\/g, '/'), data);
    pointer += 46 + filenameLength + extraLength + commentLength;
  }

  return entries;
}

function getXml(entries: Map<string, Buffer>, filename: string) {
  const data = entries.get(filename.replace(/^\//, ''));
  if (!data) throw new Error(`Workbook is missing ${filename}.`);
  return data.toString('utf8');
}

function parseSharedStrings(entries: Map<string, Buffer>) {
  const data = entries.get('xl/sharedStrings.xml');
  if (!data) return [] as string[];
  const xml = data.toString('utf8');
  const strings: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)) {
    const parts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((part) => decodeXml(part[1]));
    strings.push(parts.join(''));
  }
  return strings;
}

function columnIndex(reference: string) {
  const letters = (reference.match(/[A-Z]+/i)?.[0] || '').toUpperCase();
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function cellText(body: string) {
  const inline = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) => decodeXml(match[1])).join('');
  if (inline) return inline;
  const value = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1];
  return value === undefined ? '' : decodeXml(value);
}

function parseWorksheet(xml: string, shared: string[]): ParsedSheet['rows'] {
  const rows: CellValue[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    if (rows.length >= MAX_ROWS_PER_SHEET) break;
    const row: CellValue[] = [];
    let sequentialColumn = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi)) {
      const attrs = cellMatch[1] || '';
      const body = cellMatch[2] || '';
      const ref = xmlAttr(attrs, 'r');
      const index = ref ? columnIndex(ref) : sequentialColumn;
      sequentialColumn = index + 1;
      if (index >= MAX_COLUMNS) continue;
      const type = xmlAttr(attrs, 't');
      const raw = cellText(body);
      let value: CellValue = raw;
      if (type === 's') value = shared[Number(raw)] ?? raw;
      else if (type === 'b') value = raw === '1';
      else if (!type || type === 'n') {
        const numeric = Number(raw);
        value = raw !== '' && Number.isFinite(numeric) ? numeric : raw;
      }
      row[index] = value;
    }
    while (row.length && (row[row.length - 1] === undefined || row[row.length - 1] === '')) row.pop();
    rows.push(row.map((value) => value ?? ''));
  }
  return rows;
}

function parseXlsx(buffer: Buffer) {
  const entries = unzipEntries(buffer);
  const workbook = getXml(entries, 'xl/workbook.xml');
  const rels = getXml(entries, 'xl/_rels/workbook.xml.rels');
  const shared = parseSharedStrings(entries);

  const relationshipMap = new Map<string, string>();
  for (const match of rels.matchAll(/<Relationship\b([^>]*?)\/?>(?:<\/Relationship>)?/gi)) {
    const id = xmlAttr(match[1], 'Id');
    const target = xmlAttr(match[1], 'Target');
    if (!id || !target) continue;
    const normalized = target.startsWith('/')
      ? target.slice(1)
      : path.posix.normalize(path.posix.join('xl', target));
    relationshipMap.set(id, normalized);
  }

  const sheets: ParsedSheet[] = [];
  for (const match of workbook.matchAll(/<sheet\b([^>]*?)\/?>(?:<\/sheet>)?/gi)) {
    const name = xmlAttr(match[1], 'name') || `Sheet ${sheets.length + 1}`;
    const relId = xmlAttr(match[1], 'r:id');
    if (!relId) continue;
    const target = relationshipMap.get(relId);
    if (!target || !entries.has(target)) continue;
    const xml = getXml(entries, target);
    const totalRows = [...xml.matchAll(/<row\b/gi)].length;
    const rows = parseWorksheet(xml, shared);
    sheets.push({ name, rows, rowCount: totalRows, truncated: totalRows > rows.length });
  }

  if (!sheets.length) throw new Error('No readable worksheets were found in this workbook.');
  return sheets;
}

function detectDelimiter(text: string) {
  const firstLines = text.split(/\r?\n/).slice(0, 8);
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestScore = -1;
  for (const delimiter of candidates) {
    const score = firstLines.reduce((sum, line) => sum + line.split(delimiter).length - 1, 0);
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row.slice(0, MAX_COLUMNS));
      row = [];
      field = '';
      if (rows.length >= MAX_ROWS_PER_SHEET) break;
    } else field += char;
  }
  if (rows.length < MAX_ROWS_PER_SHEET && (field.length || row.length)) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row.slice(0, MAX_COLUMNS));
  }
  return rows;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a CSV or XLSX file.' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'File is larger than the 30 MB workspace limit.' }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const lower = file.name.toLowerCase();
    let sheets: ParsedSheet[];

    if (lower.endsWith('.xlsx') || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      sheets = parseXlsx(buffer);
    } else if (lower.endsWith('.csv') || lower.endsWith('.tsv') || file.type.startsWith('text/')) {
      const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
      const delimiter = lower.endsWith('.tsv') ? '\t' : detectDelimiter(text);
      const rows = parseDelimited(text, delimiter);
      sheets = [{ name: 'Data', rows, rowCount: rows.length, truncated: rows.length >= MAX_ROWS_PER_SHEET }];
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Upload .xlsx, .csv, or .tsv.' }, { status: 415 });
    }

    return NextResponse.json({
      filename: file.name,
      sizeBytes: file.size,
      sheets,
      limits: { rowsPerSheet: MAX_ROWS_PER_SHEET, columns: MAX_COLUMNS },
    });
  } catch (error) {
    console.error('Data parse error', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not parse this dataset.' }, { status: 400 });
  }
}
