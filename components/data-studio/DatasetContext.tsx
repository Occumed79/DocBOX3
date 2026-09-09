'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type DatasetCell = string | number | boolean | null;
export type DatasetColumnType = 'text' | 'number' | 'date' | 'category' | 'boolean';
export type DatasetSheet = { name: string; rows: DatasetCell[][]; rowCount: number; truncated: boolean };
export type DatasetWorkbook = {
  filename: string;
  sizeBytes?: number;
  sheets: DatasetSheet[];
  limits?: { rowsPerSheet: number; columns: number };
};
export type DatasetColumn = {
  id: string;
  sourceIndex: number;
  name: string;
  type: DatasetColumnType;
  hidden: boolean;
};

export type DatasetSnapshot = {
  workbook: DatasetWorkbook;
  activeSheet: number;
  headerRow: number;
  grid: DatasetCell[][];
  columns: DatasetColumn[];
  updatedAt: number;
};

type DatasetContextValue = {
  dataset: DatasetSnapshot | null;
  setDataset: React.Dispatch<React.SetStateAction<DatasetSnapshot | null>>;
  clearDataset: () => void;
  hasDataset: boolean;
};

const STORAGE_KEY = 'docbox3-current-dataset-v1';
const SHARED_MIME = 'application/x-docbox3-shared+csv';
const DatasetContext = createContext<DatasetContextValue | null>(null);

const cellText = (value: DatasetCell) => value == null ? '' : String(value);
const numberValue = (value: DatasetCell) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(cellText(value).replace(/[,$%]/g, '').replace(/[()]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

function inferColumnType(values: DatasetCell[]): DatasetColumnType {
  const sample = values.filter((value) => cellText(value).trim() !== '').slice(0, 200);
  if (!sample.length) return 'text';
  if (sample.filter((value) => numberValue(value) !== null).length / sample.length >= .8) return 'number';
  if (sample.filter((value) => /^(true|false|yes|no|y|n|0|1)$/i.test(cellText(value).trim())).length / sample.length >= .9) return 'boolean';
  const dateCount = sample.filter((value) => {
    const text = cellText(value).trim();
    return /[-/]|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text) && Number.isFinite(Date.parse(text));
  }).length;
  if (dateCount / sample.length >= .8) return 'date';
  const unique = new Set(sample.map((value) => cellText(value).trim())).size;
  return unique <= Math.max(20, Math.ceil(sample.length * .25)) ? 'category' : 'text';
}

function snapshotFromWorkbook(workbook: DatasetWorkbook): DatasetSnapshot | null {
  const sheet = workbook.sheets?.[0];
  if (!sheet) return null;
  const grid = sheet.rows.map((row) => [...row]);
  const maxColumns = Math.max(0, ...grid.slice(0, 500).map((row) => row.length));
  const used = new Set<string>();
  const columns: DatasetColumn[] = Array.from({ length: maxColumns }, (_, sourceIndex) => {
    const raw = cellText(grid[0]?.[sourceIndex]).trim() || `Column ${sourceIndex + 1}`;
    let name = raw;
    let suffix = 2;
    while (used.has(name.toLowerCase())) name = `${raw} ${suffix++}`;
    used.add(name.toLowerCase());
    return {
      id: `shared-${sourceIndex}`,
      sourceIndex,
      name,
      type: inferColumnType(grid.slice(1, 201).map((row) => row[sourceIndex] ?? null)),
      hidden: false,
    };
  });
  return { workbook, activeSheet: 0, headerRow: 0, grid, columns, updatedAt: Date.now() };
}

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDataset] = useState<DatasetSnapshot | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DatasetSnapshot;
        if (parsed?.workbook?.sheets?.length && Array.isArray(parsed.grid) && Array.isArray(parsed.columns)) setDataset(parsed);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (dataset) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // The in-memory dataset still works if browser storage is unavailable or full.
    }
  }, [dataset, hydrated]);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof window.fetch>) => {
      const body = args[1]?.body;
      const uploaded = body instanceof FormData ? body.get('file') : null;
      const sharedBootstrap = uploaded instanceof File && uploaded.type === SHARED_MIME;
      const response = await nativeFetch(...args);
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (!sharedBootstrap && response.ok && /\/api\/data\/parse(?:\?|$)/.test(url)) {
          const payload = await response.clone().json() as DatasetWorkbook;
          const snapshot = snapshotFromWorkbook(payload);
          if (snapshot) setDataset(snapshot);
        }
      } catch {
        // Parsing the clone is best-effort and must never affect the caller's response.
      }
      return response;
    };
    return () => { window.fetch = nativeFetch; };
  }, []);

  const value = useMemo<DatasetContextValue>(() => ({
    dataset,
    setDataset,
    clearDataset: () => setDataset(null),
    hasDataset: Boolean(dataset?.workbook?.sheets?.length),
  }), [dataset]);

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset() {
  const value = useContext(DatasetContext);
  if (!value) throw new Error('useDataset must be used inside DatasetProvider');
  return value;
}
