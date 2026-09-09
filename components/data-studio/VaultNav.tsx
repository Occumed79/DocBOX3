'use client';

import { usePathname } from 'next/navigation';
import { useDataset } from './DatasetContext';

const links = [
  { href: '/vault', label: 'Workspace', exact: true },
  { href: '/vault/studio', label: 'Data Studio' },
  { href: '/vault/grid', label: 'Grid & Pivot' },
  { href: '/vault/advanced', label: 'Advanced' },
  { href: '/vault/spatial', label: 'Spatial' },
  { href: '/vault/story', label: 'Story' },
];

function Mark() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M6 4.5h11.5L22 9v14.5H6z" />
      <path d="M17.5 4.5V9H22M9.5 13h9M9.5 17h6.5" />
    </svg>
  );
}

export default function VaultNav() {
  const pathname = usePathname();
  const { dataset, clearDataset } = useDataset();
  const activeSheet = dataset?.workbook.sheets[dataset.activeSheet];
  const rowCount = dataset ? dataset.grid.slice(dataset.headerRow + 1).filter((row) => row.some((value) => String(value ?? '').trim() !== '')).length : 0;

  return (
    <header className="vault-rail">
      <a className="vault-rail-brand" href="/vault" aria-label="DocBOX3 workspace home">
        <span><Mark /></span>
        <strong>DocBOX<sup>3</sup></strong>
        <small>Data workbench</small>
      </a>
      <nav aria-label="DocBOX3 workspaces">
        {links.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return <a key={link.href} className={active ? 'active' : ''} href={link.href}>{link.label}</a>;
        })}
      </nav>
      {dataset && (
        <a className="vault-current-dataset" href="/vault/studio" title={`${dataset.workbook.filename} · ${activeSheet?.name ?? 'Sheet'} · ${rowCount.toLocaleString()} rows`}>
          <span>DATASET</span>
          <strong>{dataset.workbook.filename}</strong>
          <small>{activeSheet?.name ?? 'Sheet'} · {rowCount.toLocaleString()} rows</small>
        </a>
      )}
      <div className="vault-rail-actions">
        <a href="/">DocBOX</a>
        <a className="primary" href="/vault/studio" onClick={() => clearDataset()}>New dataset</a>
      </div>
    </header>
  );
}
