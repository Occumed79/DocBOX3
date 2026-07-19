'use client';

import type { VaultFile } from './file-model';

export default function FileRail({ files, selectedFile, onSelect, loading }: {
  files: VaultFile[];
  selectedFile: VaultFile | null;
  onSelect: (file: VaultFile) => void;
  loading: boolean;
}) {
  if (loading) {
    return <div className="file-rail loading" aria-label="Loading files">{Array.from({ length: 5 }).map((_, index) => <span key={index} className="rail-skeleton" />)}</div>;
  }

  if (!files.length) return null;

  return (
    <section className="file-rail-shell" aria-label="Files in this view">
      <div className="rail-heading"><span>Files in View</span><strong>{files.length}</strong></div>
      <div className="file-rail">
        {files.map(file => {
          const type = file.file_type.toLowerCase();
          const selected = selectedFile?.id === file.id;
          return (
            <button key={file.id} type="button" className={selected ? 'rail-file active' : 'rail-file'} onClick={() => onSelect(file)} aria-pressed={selected}>
              <span className="rail-file-preview" data-type={type}>
                {['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(type) ? <ImageGlyph /> : <DocumentGlyph />}
                <span className="rail-file-type">{type.toUpperCase()}</span>
              </span>
              <span className="rail-file-copy"><strong title={file.name}>{file.name}</strong><span>{file.folder_name || 'All Files'}</span></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DocumentGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 40 48" fill="none"><path d="M8 2h16l8 8v36H8z" stroke="currentColor" strokeWidth="1.5" /><path d="M24 2v9h8M13 20h14M13 26h14M13 32h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function ImageGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 48 40" fill="none"><rect x="3" y="4" width="42" height="32" rx="4" stroke="currentColor" strokeWidth="1.5" /><circle cx="16" cy="15" r="4" stroke="currentColor" strokeWidth="1.5" /><path d="m7 32 10-9 7 6 7-8 10 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
