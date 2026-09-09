'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useDataset } from './DatasetContext';

const SHARED_MIME = 'application/x-docbox3-shared+csv';

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function makeSharedCsv(dataset: NonNullable<ReturnType<typeof useDataset>['dataset']>) {
  const columns = dataset.columns.filter((column) => !column.hidden);
  const header = columns.map((column) => csvCell(column.name)).join(',');
  const rows = dataset.grid
    .slice(dataset.headerRow + 1)
    .filter((row) => row.some((value) => String(value ?? '').trim() !== ''))
    .map((row) => columns.map((column) => csvCell(row[column.sourceIndex])).join(','));
  return [header, ...rows].join('\n');
}

export default function SharedDatasetBootstrap() {
  const pathname = usePathname();
  const { dataset } = useDataset();

  useEffect(() => {
    if (!dataset || pathname === '/vault') return;
    const marker = `${dataset.updatedAt}:${pathname}`;

    const timer = window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.vault-stage input[type="file"]');
      if (!input || input.dataset.sharedDatasetMarker === marker) return;
      const currentFile = input.files?.[0];
      if (currentFile && currentFile.type !== SHARED_MIME) return;
      try {
        const csv = makeSharedCsv(dataset);
        const safeBase = dataset.workbook.filename.replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-');
        const file = new File([csv], `${safeBase}.csv`, { type: SHARED_MIME });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dataset.sharedDatasetMarker = marker;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {
        // A workspace can still use its normal upload flow if browser File APIs are restricted.
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [dataset, pathname]);

  return null;
}
