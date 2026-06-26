'use client';
import { useState } from 'react';

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

export function typeClass(t: string) {
  if (['png','jpg','jpeg'].includes(t)) return 't-img';
  const map: Record<string,string> = { pdf:'t-pdf', docx:'t-docx', xlsx:'t-xlsx', csv:'t-csv', txt:'t-txt', html:'t-html', htm:'t-html' };
  return map[t] || 't-other';
}

function typeGlowClass(t: string): string {
  if (['png','jpg','jpeg'].includes(t)) return 'ft-img';
  if (t === 'pdf') return 'ft-pdf';
  if (t === 'docx') return 'ft-docx';
  if (['txt','html','htm','json'].includes(t)) return 'ft-txt';
  if (['xlsx','csv'].includes(t)) return 'ft-xlsx';
  return 'ft-other';
}

export function formatSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

export function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

interface Props {
  file: VaultFile;
  selected?: boolean;
  onSelect: (f: VaultFile) => void;
  onUpdate: (f: VaultFile) => void;
  onDelete: (id: string) => void;
  searchMode?: boolean;
}

function stripHtml(value?: string) {
  return (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function PreviewArtwork({ file }: { file: VaultFile }) {
  const type = file.file_type.toLowerCase();
  const isImage = ['png','jpg','jpeg'].includes(type);
  const isPdf = type === 'pdf';
  const isWeb = ['html','htm'].includes(type);
  const isText = ['txt','csv','json'].includes(type);
  const isSheet = ['xlsx','csv'].includes(type);
  const isDoc = ['docx','txt'].includes(type);
  const summary = stripHtml(file.headline) || file.notes || file.original_name;

  if (isImage) {
    return (
      <div className="file-preview-art file-preview-image">
        <img src={file.storage_url} alt={file.name} />
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className="file-preview-art file-preview-pdf">
        <div className="preview-page">
          <div className="preview-page-top" />
          <div className="preview-lines">
            <span style={{ width: '72%' }} />
            <span style={{ width: '92%' }} />
            <span style={{ width: '84%' }} />
            <span style={{ width: '58%' }} />
          </div>
          <div className="preview-pdf-stamp">PDF</div>
        </div>
      </div>
    );
  }

  if (isWeb) {
    return (
      <div className="file-preview-art file-preview-web">
        <div className="browser-dots"><span /><span /><span /></div>
        <div className="web-hero" />
        <div className="web-lines">
          <span style={{ width: '78%' }} />
          <span style={{ width: '54%' }} />
        </div>
        <p>{summary || 'Saved page preview'}</p>
      </div>
    );
  }

  if (isSheet) {
    return (
      <div className="file-preview-art file-preview-sheet">
        <div className="sheet-grid">
          {Array.from({ length: 24 }).map((_, i) => <span key={i} />)}
        </div>
        <div className="sheet-badge">SHEET</div>
      </div>
    );
  }

  if (isText || isDoc) {
    return (
      <div className="file-preview-art file-preview-doc">
        <div className="doc-page">
          <div className="doc-title" />
          <div className="preview-lines">
            <span style={{ width: '88%' }} />
            <span style={{ width: '76%' }} />
            <span style={{ width: '94%' }} />
            <span style={{ width: '62%' }} />
          </div>
          <p>{summary}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`file-preview-art ${typeGlowClass(type)}`}>
      <span className={`tbadge ${typeClass(type)}`}>{type.toUpperCase()}</span>
    </div>
  );
}

export default function FileCard({ file, selected, onSelect, onUpdate, onDelete, searchMode }: Props) {
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState(file.notes || '');

  const saveNotes = async () => {
    const res = await fetch('/api/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: file.id, notes }),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdate({ ...file, notes: updated.notes });
    }
    setEditNotes(false);
  };

  const archive = async () => {
    if (!confirm(`Archive "${file.name}"?`)) return;
    await fetch('/api/files', {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: file.id, is_archived: true }),
    });
    onDelete(file.id);
  };

  const removeFile = async () => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    await fetch('/api/files', {
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: file.id }),
    });
    onDelete(file.id);
  };

  const headline = stripHtml(file.headline);

  return (
    <div className={`glass-card file-preview-card relative cursor-pointer group fade-up ${selected ? 'selected' : ''}`} onClick={() => onSelect(file)}>
      {selected && <div className="file-selected-glow" />}
      <div className="shim" />

      <div className="file-card-actions" onClick={event => event.stopPropagation()}>
        <button title="Add note" onClick={() => setEditNotes(!editNotes)}>Note</button>
        <a title="Download" href={file.storage_url} download={file.original_name}>Download</a>
        <button title="Archive" onClick={archive}>Archive</button>
        <button title="Delete" onClick={removeFile}>Delete</button>
      </div>

      <PreviewArtwork file={file} />

      <div className="file-card-body">
        <div className="file-card-title-row">
          <p className="file-card-title">{file.name}</p>
          <span className={`tbadge ${typeClass(file.file_type)}`}>{file.file_type.toUpperCase()}</span>
        </div>

        <div className="file-card-meta">
          <span>{formatSize(file.size_bytes)}</span>
          <span>{formatDate(file.upload_date)}</span>
          {searchMode && file.folder_name && <span>{file.folder_name}</span>}
        </div>

        {file.tags?.length > 0 && (
          <div className="file-card-tags">
            {file.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}
          </div>
        )}

        {headline && <p className="file-card-summary">{headline}</p>}

        {editNotes ? (
          <div className="file-note-editor" onClick={event => event.stopPropagation()}>
            <input
              autoFocus
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder="Add a note..."
              onKeyDown={event => {
                if (event.key === 'Enter') saveNotes();
                if (event.key === 'Escape') setEditNotes(false);
              }}
            />
            <button onClick={saveNotes}>Save</button>
          </div>
        ) : file.notes ? (
          <p className="file-card-notes" onClick={event => { event.stopPropagation(); setEditNotes(true); }}>{file.notes}</p>
        ) : null}
      </div>
    </div>
  );
}
