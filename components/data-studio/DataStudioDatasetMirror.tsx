'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { type DatasetColumn, type DatasetColumnType, useDataset } from './DatasetContext';

function alphaIndex(label: string) {
  let value = 0;
  for (const char of label.trim().toUpperCase()) {
    if (char < 'A' || char > 'Z') continue;
    value = value * 26 + char.charCodeAt(0) - 64;
  }
  return Math.max(0, value - 1);
}

export default function DataStudioDatasetMirror() {
  const pathname = usePathname();
  const { dataset, setDataset } = useDataset();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!pathname.startsWith('/vault/studio') || !dataset) return;

    const sync = () => {
      const app = document.querySelector('.dp-app');
      const toolbar = app?.querySelector('.dp-data-toolbar');
      if (!app || !toolbar) return;

      const selects = toolbar.querySelectorAll<HTMLSelectElement>('select');
      const activeSheet = Number(selects[0]?.value ?? dataset.activeSheet);
      const headerRow = Number(selects[1]?.value ?? dataset.headerRow);
      const sheet = dataset.workbook.sheets[activeSheet];
      if (!sheet) return;

      const schemaRows = Array.from(app.querySelectorAll<HTMLElement>('.dp-columns > div'));
      const currentBySource = new Map(dataset.columns.map((column) => [column.sourceIndex, column]));
      const columns: DatasetColumn[] = schemaRows.map((row) => {
        const sourceIndex = alphaIndex(row.querySelector('b')?.textContent ?? '');
        const name = row.querySelector<HTMLInputElement>('input')?.value?.trim() || `Column ${sourceIndex + 1}`;
        const type = (row.querySelector<HTMLSelectElement>('select')?.value || 'text') as DatasetColumnType;
        return {
          id: currentBySource.get(sourceIndex)?.id ?? `shared-${sourceIndex}`,
          sourceIndex,
          name,
          type,
          hidden: row.classList.contains('muted'),
        };
      });

      const sameSheet = activeSheet === dataset.activeSheet && headerRow === dataset.headerRow;
      const grid = (sameSheet ? dataset.grid : sheet.rows).map((row) => [...row]);
      if (!grid[headerRow]) grid[headerRow] = [];
      for (const column of columns) grid[headerRow][column.sourceIndex] = column.name;

      const visibleColumns = columns.filter((column) => !column.hidden);
      const tableRows = Array.from(app.querySelectorAll<HTMLTableRowElement>('.dp-sheet tbody tr'));
      tableRows.forEach((row, rowIndex) => {
        const absolute = headerRow + 1 + rowIndex;
        if (!grid[absolute]) grid[absolute] = [];
        const inputs = Array.from(row.querySelectorAll<HTMLInputElement>('td input'));
        inputs.forEach((input, visibleIndex) => {
          const column = visibleColumns[visibleIndex];
          if (column) grid[absolute][column.sourceIndex] = input.value;
        });
      });

      const workbook = {
        ...dataset.workbook,
        sheets: dataset.workbook.sheets.map((item, index) => index === activeSheet ? { ...item, rows: grid, rowCount: Math.max(0, grid.length - headerRow - 1) } : item),
      };

      setDataset({ workbook, activeSheet, headerRow, grid, columns, updatedAt: Date.now() });
    };

    const schedule = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.dp-app')) return;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(sync, 140);
    };

    document.addEventListener('input', schedule, true);
    document.addEventListener('change', schedule, true);
    document.addEventListener('click', schedule, true);
    return () => {
      document.removeEventListener('input', schedule, true);
      document.removeEventListener('change', schedule, true);
      document.removeEventListener('click', schedule, true);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [dataset, pathname, setDataset]);

  return null;
}
