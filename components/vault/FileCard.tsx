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
  if (['txt','html','htm'].includes(t)) return 'ft-txt';
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

export default function FileCard({ file, selected, onSelect, onUpdate, onDelete, searchMode }: Props) {
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState(file.notes || '');

  const isImage = ['png','jpg','jpeg'].includes(file.file_type);

  const saveNotes = async () => {
    const res = await fetch('/api/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: file.id, notes }),
    });
    if (res.ok) { const u = await res.json(); onUpdate({ ...file, notes: u.notes }); }
    setEditNotes(false);
  };

  const archive = async () => {
    if (!confirm(`Archive "${file.name}"?`)) return;
    await fetch('/api/files', { method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: file.id, is_archived: true }) });
    onDelete(file.id);
  };

  const del = async () => {
    if (!confirm(`Permanently delete "${file.name}"?`)) return;
    await fetch('/api/files', { method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: file.id }) });
    onDelete(file.id);
  };

  return (
    <div
      className={`glass-card relative overflow-hidden cursor-pointer group fade-up ${selected ? 'selected' : ''}`}
      style={{ padding: '10px 12px' }}
      onClick={() => onSelect(file)}
    >
      {/* Selected left accent */}
      {selected && (
        <div className="absolute left-0 top-2 bottom-2 w-[1.5px] rounded-full"
          style={{ background: 'linear-gradient(180deg, rgba(96,165,250,0.6), rgba(99,102,241,0.5))' }} />
      )}
      <div className="shim" />
      <div className="flex items-start gap-2.5">

        {/* Thumbnail */}
        <div className={`file-type-glow w-10 h-10 shrink-0 ${typeGlowClass(file.file_type)}`}
          onClick={e => { e.stopPropagation(); onSelect(file); }}>
          {isImage && file.storage_url.startsWith('data:') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.storage_url} alt={file.name} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <span className={`tbadge ${typeClass(file.file_type)}`}>{file.file_type.toUpperCase()}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="text-sm font-semibold text-slate-100 leading-tight truncate flex-1">{file.name}</p>
            <span className={`tbadge ${typeClass(file.file_type)} shrink-0 mt-0.5`}>{file.file_type.toUpperCase()}</span>
          </div>

          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-slate-600">{formatSize(file.size_bytes)}</span>
            <span className="text-[10px] text-slate-700">·</span>
            <span className="text-[10px] text-slate-600">{formatDate(file.upload_date)}</span>
            {searchMode && file.folder_name && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/8 text-slate-500">
                {file.folder_name}
              </span>
            )}
          </div>

          {file.tags?.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {file.tags.map(tag => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Search headline */}
          {file.headline && (
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2"
              dangerouslySetInnerHTML={{ __html: file.headline }} />
          )}

          {/* Notes */}
          {editNotes ? (
            <div className="mt-1.5 flex gap-2" onClick={e => e.stopPropagation()}>
              <input autoFocus
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/40"
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Add a note…"
                onKeyDown={e => { if (e.key==='Enter') saveNotes(); if(e.key==='Escape') setEditNotes(false); }}
              />
              <button onClick={saveNotes} className="btn-primary text-[11px] px-2.5 py-1">Save</button>
            </div>
          ) : file.notes ? (
            <p className="text-[11px] text-slate-500 mt-1 italic cursor-pointer hover:text-slate-300 transition-colors"
              onClick={e => { e.stopPropagation(); setEditNotes(true); }}>
              {file.notes}
            </p>
          ) : null}
        </div>

        {/* Action buttons — visible on hover */}
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={e => e.stopPropagation()}>
          <button title="Add note" onClick={() => setEditNotes(!editNotes)}
            className="btn-ghost w-6 h-6 flex items-center justify-center text-xs rounded-lg">✎</button>
          <button title="Download"
            onClick={() => { const a=document.createElement('a'); a.href=file.storage_url; a.download=file.original_name; a.click(); }}
            className="btn-ghost w-6 h-6 flex items-center justify-center text-xs rounded-lg">↓</button>
          <button title="Archive" onClick={archive}
            className="btn-ghost w-6 h-6 flex items-center justify-center text-xs rounded-lg">▣</button>
          <button title="Delete" onClick={del}
            className="w-6 h-6 flex items-center justify-center text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">×</button>
        </div>
      </div>
    </div>
  );
}
