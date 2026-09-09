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
const DatasetContext = createContext<DatasetContextValue | null>(null);

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
