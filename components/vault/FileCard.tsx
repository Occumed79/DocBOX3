'use client';
import { useState } from 'react';
import FilePreviewModal from './FilePreviewModal';

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

function typeClass(t: string) {
  if (['png','jpg','jpeg'].includes(t)) return 'type-png';
  return `type-${t}` || 'type-other';
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

interface Props {
  file: VaultFile;
  onUpdate: (f: VaultFile) => void;
  onDelete: (id: string) => void;
  searchMode?: boolean;
}

export default function FileCard({ file, onUpdate, onDelete, searchMode }: Props) {
  const [showPreview, setShowPreview] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState(file.notes || '');
  const [saving, setSaving] = useState(false);

  const isImage = ['png','jpg','jpeg'].includes(file.file_type);

  const saveNotes = async () => {
    setSaving(true);
    const res = await fetch('/api/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: file.id, notes }),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdate({ ...file, notes: updated.notes });
    }
    setSaving(false);
    setEditNotes(false);
  };

  const archive = async () => {
    if (!confirm(`Archive "${file.name}"?`)) return;
    await fetch('/api/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: file.id, is_archived: true }),
    });
    onDelete(file.id);
  };

  const del = async () => {
    if (!confirm(`Permanently delete "${file.name}"? This cannot be undone.`)) return;
    await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: file.id }),
    });
    onDelete(file.id);
  };

  return (
    <>
      <div className="gc-sm relative overflow-hidden group transition-all hover:border-white/16 hover:shadow-lg" style={{ padding: '14px 16px' }}>
        <div className="shimmer-top" />

        <div className="flex items-start gap-3">
          {/* Thumbnail or type icon */}
          <div
            className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center overflow-hidden cursor-pointer bg-white/5 border border-white/8"
            onClick={() => setShowPreview(true)}
          >
            {isImage && file.storage_url.startsWith('data:') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.storage_url} alt={file.name} className="w-full h-full object-cover" />
            ) : (
              <span className={`type-badge ${typeClass(file.file_type)}`}>{file.file_type.toUpperCase()}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowPreview(true)}
                className="text-sm font-medium text-slate-100 hover:text-white truncate max-w-[280px] text-left"
              >
                {file.name}
              </button>
              <span className={`type-badge ${typeClass(file.file_type)}`}>{file.file_type.toUpperCase()}</span>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-[10px] text-slate-600">{formatSize(file.size_bytes)}</span>
              <span className="text-[10px] text-slate-600">{formatDate(file.upload_date)}</span>
              {searchMode && file.folder_name && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/6 border border-white/8 text-slate-500">
                  📁 {file.folder_name}
                </span>
              )}
              {file.tags?.length > 0 && file.tags.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  {tag}
                </span>
              ))}
            </div>

            {/* Search headline */}
            {file.headline && (
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed line-clamp-2"
                dangerouslySetInnerHTML={{ __html: file.headline }} />
            )}

            {/* Notes */}
            {editNotes ? (
              <div className="mt-2 flex gap-2">
                <input
                  autoFocus
                  className="vault-input flex-1 text-xs px-2.5 py-1.5"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add a note…"
                  onKeyDown={e => { if (e.key === 'Enter') saveNotes(); if (e.key === 'Escape') setEditNotes(false); }}
                />
                <button onClick={saveNotes} disabled={saving} className="btn-primary text-xs px-3 py-1.5">
                  {saving ? '…' : 'Save'}
                </button>
                <button onClick={() => setEditNotes(false)} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
              </div>
            ) : file.notes ? (
              <p
                className="text-[11px] text-slate-500 mt-1.5 italic cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => setEditNotes(true)}
              >
                {file.notes}
              </p>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button title="Preview" onClick={() => setShowPreview(true)}
              className="w-7 h-7 rounded-lg btn-ghost flex items-center justify-center text-xs">
              👁
            </button>
            <button title="Add/edit note" onClick={() => setEditNotes(!editNotes)}
              className="w-7 h-7 rounded-lg btn-ghost flex items-center justify-center text-xs">
              ✎
            </button>
            <button title="Download"
              onClick={() => {
                const a = document.createElement('a');
                a.href = file.storage_url;
                a.download = file.original_name;
                a.click();
              }}
              className="w-7 h-7 rounded-lg btn-ghost flex items-center justify-center text-xs">
              ↓
            </button>
            <button title="Archive" onClick={archive}
              className="w-7 h-7 rounded-lg btn-ghost flex items-center justify-center text-xs">
              ▣
            </button>
            <button title="Delete" onClick={del}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
              ×
            </button>
          </div>
        </div>
      </div>

      {showPreview && (
        <FilePreviewModal file={file} onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}
