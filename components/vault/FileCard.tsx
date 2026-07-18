'use client';

import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface VaultFile {
  id: string;
  name: string;
  original_name: string;
  file_type: string;
  mime_type: string;
  size_bytes: number;
  storage_url: string;
  folder_id: string | null;
  folder_name?: string | null;
  notes: string;
  tags: string[];
  upload_date: string;
  is_archived: boolean;
  headline?: string;
}

export function typeClass(type: string) {
  const normalized = type.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(normalized)) return 'type-image';
  const classes: Record<string, string> = {
    pdf: 'type-pdf',
    docx: 'type-document',
    xlsx: 'type-sheet',
    csv: 'type-sheet',
    txt: 'type-text',
    json: 'type-code',
    html: 'type-code',
    htm: 'type-code',
  };
  return classes[normalized] || 'type-other';
}

export function formatSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  file: VaultFile;
  selected?: boolean;
  onSelect: (file: VaultFile) => void;
  onUpdate: (file: VaultFile) => void;
  onRemove: (id: string) => void;
  onError?: (message: string) => void;
  searchMode?: boolean;
  archivedView?: boolean;
}

function stripHtml(value?: string) {
  return (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function responseError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return payload?.error || fallback;
  } catch {
    return fallback;
  }
}

function IconButton({ label, children, onClick, className = '', disabled = false }: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`card-icon-action ${className}`}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function FileArtwork({ file }: { file: VaultFile }) {
  const type = file.file_type.toLowerCase();
  const summary = stripHtml(file.headline) || file.notes || file.original_name;

  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(type)) {
    return (
      <div className="file-artwork artwork-image" aria-hidden="true">
        <div className="artwork-sun" />
        <div className="artwork-mountain mountain-back" />
        <div className="artwork-mountain mountain-front" />
        <span className="artwork-label">IMAGE</span>
      </div>
    );
  }

  if (type === 'pdf') {
    return (
      <div className="file-artwork artwork-pdf" aria-hidden="true">
        <div className="paper-sheet">
          <span className="paper-heading" />
          <span className="paper-line wide" />
          <span className="paper-line" />
          <span className="paper-line medium" />
          <span className="paper-line wide" />
          <strong>PDF</strong>
        </div>
      </div>
    );
  }

  if (['xlsx', 'csv'].includes(type)) {
    return (
      <div className="file-artwork artwork-sheet" aria-hidden="true">
        <div className="sheet-grid">
          {Array.from({ length: 30 }).map((_, index) => <span key={index} className={index < 6 ? 'heading-cell' : ''} />)}
        </div>
        <span className="artwork-label">SHEET</span>
      </div>
    );
  }

  if (['html', 'htm', 'json'].includes(type)) {
    return (
      <div className="file-artwork artwork-code" aria-hidden="true">
        <div className="browser-chrome"><span /><span /><span /></div>
        <div className="code-lines">
          <span className="code-purple" /><span className="code-blue" /><span className="code-cyan" /><span className="code-purple short" /><span className="code-blue medium" />
        </div>
        <span className="artwork-label">{type === 'json' ? 'JSON' : 'WEB'}</span>
      </div>
    );
  }

  return (
    <div className="file-artwork artwork-document" aria-hidden="true">
      <div className="document-sheet">
        <span className="document-heading" />
        <span className="document-line wide" />
        <span className="document-line" />
        <span className="document-line medium" />
        {summary && <span className="document-summary">{summary.slice(0, 92)}</span>}
      </div>
      <span className="artwork-label">{type.toUpperCase() || 'FILE'}</span>
    </div>
  );
}

export default function FileCard({ file, selected, onSelect, onUpdate, onRemove, onError, searchMode, archivedView }: Props) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(file.notes || '');
  const [pending, setPending] = useState(false);
  const fileType = file.file_type.toLowerCase();
  const headline = stripHtml(file.headline);

  useEffect(() => {
    setNotes(file.notes || '');
  }, [file.id, file.notes]);

  const saveNotes = async () => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch('/api/files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: file.id, notes }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not save notes.'));
      const updated = await response.json();
      onUpdate({ ...file, notes: updated.notes });
      setEditingNotes(false);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Could not save notes.');
    } finally {
      setPending(false);
    }
  };

  const changeArchiveState = async () => {
    if (pending) return;
    setPending(true);
    try {
      const nextArchived = !file.is_archived;
      const response = await fetch('/api/files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: file.id, is_archived: nextArchived }),
      });
      if (!response.ok) throw new Error(await responseError(response, nextArchived ? 'Could not archive the file.' : 'Could not restore the file.'));
      onRemove(file.id);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Could not update the file.');
    } finally {
      setPending(false);
    }
  };

  const deleteFile = async () => {
    if (pending || !window.confirm(`Permanently delete “${file.name}”?`)) return;
    setPending(true);
    try {
      const response = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: file.id }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not delete the file.'));
      onRemove(file.id);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Could not delete the file.');
    } finally {
      setPending(false);
    }
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (editingNotes) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(file);
    }
  };

  return (
    <article
      className={selected ? 'file-card selected' : 'file-card'}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Open inspector for ${file.name}`}
      onClick={() => onSelect(file)}
      onKeyDown={handleKeyboard}
    >
      <div className="card-action-group" onClick={event => event.stopPropagation()}>
        <IconButton label={file.notes ? 'Edit note' : 'Add note'} onClick={() => setEditingNotes(previous => !previous)} disabled={pending}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
          </svg>
        </IconButton>
        <a
          className="card-icon-action"
          href={file.storage_url}
          download={file.original_name}
          aria-label={`Download ${file.name}`}
          title="Download"
          onClick={event => event.stopPropagation()}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
          </svg>
        </a>
        <IconButton label={file.is_archived || archivedView ? 'Restore file' : 'Archive file'} onClick={() => void changeArchiveState()} disabled={pending}>
          {file.is_archived || archivedView ? (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M5 6v14h14V6" /><path d="M9 10h6" /><path d="M4 3h16v3H4z" />
            </svg>
          )}
        </IconButton>
        <IconButton label="Delete file" className="destructive" onClick={() => void deleteFile()} disabled={pending}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 15h10l1-15" /><path d="M10 11v6M14 11v6" />
          </svg>
        </IconButton>
      </div>

      <FileArtwork file={file} />

      <div className="file-card-body">
        <div className="file-title-row">
          <h2 title={file.name}>{file.name}</h2>
          <span className={`type-badge ${typeClass(fileType)}`}>{fileType.toUpperCase() || 'FILE'}</span>
        </div>

        <div className="file-metadata">
          <span>{formatSize(file.size_bytes)}</span>
          <span>{formatDate(file.upload_date)}</span>
          {searchMode && file.folder_name && <span>{file.folder_name}</span>}
        </div>

        {file.tags?.length > 0 && (
          <div className="file-tags">
            {file.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}
            {file.tags.length > 3 && <span>+{file.tags.length - 3}</span>}
          </div>
        )}

        {headline && <p className="file-headline">{headline}</p>}

        {editingNotes ? (
          <div className="card-note-editor" onClick={event => event.stopPropagation()}>
            <label className="sr-only" htmlFor={`card-note-${file.id}`}>Note for {file.name}</label>
            <input
              id={`card-note-${file.id}`}
              autoFocus
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder="Add a note…"
              onKeyDown={event => {
                event.stopPropagation();
                if (event.key === 'Enter') void saveNotes();
                if (event.key === 'Escape') {
                  setNotes(file.notes || '');
                  setEditingNotes(false);
                }
              }}
            />
            <button type="button" onClick={event => {
              event.stopPropagation();
              void saveNotes();
            }} disabled={pending}>Save</button>
          </div>
        ) : file.notes ? (
          <p className="file-note" onClick={event => {
            event.stopPropagation();
            setEditingNotes(true);
          }}>{file.notes}</p>
        ) : null}
      </div>
    </article>
  );
}
