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

function PreviewFrame({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'blue' | 'red' | 'green' | 'violet' | 'cyan' | 'slate' }) {
  const tones = {
    blue: 'from-sky-400/25 via-blue-500/10 to-slate-950/75',
    red: 'from-rose-400/25 via-blue-500/10 to-slate-950/75',
    green: 'from-emerald-400/25 via-cyan-500/10 to-slate-950/75',
    violet: 'from-violet-400/25 via-sky-500/10 to-slate-950/75',
    cyan: 'from-cyan-300/25 via-teal-500/10 to-slate-950/75',
    slate: 'from-slate-300/20 via-sky-500/10 to-slate-950/75',
  };

  return (
    <div className={`relative z-10 flex h-40 w-full items-center justify-center overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-br ${tones[tone]} shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_16px_36px_rgba(0,0,0,0.22)]`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_10%,rgba(255,255,255,0.22),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.10),transparent_36%,rgba(255,255,255,0.05)_68%,transparent)]" />
      {children}
    </div>
  );
}

function PreviewLines() {
  return (
    <div className="flex flex-col gap-2">
      <span className="h-1.5 w-[72%] rounded-full bg-slate-700/15" />
      <span className="h-1.5 w-[92%] rounded-full bg-slate-700/15" />
      <span className="h-1.5 w-[84%] rounded-full bg-slate-700/15" />
      <span className="h-1.5 w-[58%] rounded-full bg-slate-700/15" />
    </div>
  );
}

function PreviewArtwork({ file }: { file: VaultFile }) {
  const type = file.file_type.toLowerCase();
  const summary = stripHtml(file.headline) || file.notes || file.original_name;

  if (['png','jpg','jpeg'].includes(type)) {
    return (
      <PreviewFrame tone="cyan">
        <img src={file.storage_url} alt={file.name} className="relative z-10 h-full w-full object-cover" />
      </PreviewFrame>
    );
  }

  if (type === 'pdf') {
    return (
      <PreviewFrame tone="red">
        <div className="relative z-10 h-[78%] w-[68%] rotate-[-2deg] rounded-2xl bg-slate-50/95 p-4 shadow-2xl">
          <div className="mb-3 h-4 w-1/2 rounded-full bg-rose-400/20" />
          <PreviewLines />
          <div className="absolute bottom-3 right-3 rounded-full bg-rose-500/90 px-2.5 py-1 text-[10px] font-black tracking-wider text-white">PDF</div>
        </div>
      </PreviewFrame>
    );
  }

  if (['html','htm'].includes(type)) {
    return (
      <PreviewFrame tone="violet">
        <div className="relative z-10 flex h-full w-full flex-col items-start p-4">
          <div className="mb-4 flex gap-1.5"><span className="h-2 w-2 rounded-full bg-white/25" /><span className="h-2 w-2 rounded-full bg-white/20" /><span className="h-2 w-2 rounded-full bg-white/15" /></div>
          <div className="mb-3 h-10 w-[72%] rounded-2xl bg-gradient-to-r from-cyan-300/45 to-violet-400/30" />
          <div className="mb-2 h-1.5 w-[82%] rounded-full bg-white/15" />
          <div className="mb-3 h-1.5 w-[54%] rounded-full bg-white/12" />
          <p className="line-clamp-2 text-[11px] leading-snug text-slate-200/70">{summary || 'Saved page preview'}</p>
        </div>
      </PreviewFrame>
    );
  }

  if (['xlsx','csv'].includes(type)) {
    return (
      <PreviewFrame tone="green">
        <div className="relative z-10 grid w-[70%] rotate-[-2deg] grid-cols-6 gap-1.5">
          {Array.from({ length: 24 }).map((_, i) => <span key={i} className="h-3.5 rounded bg-white/18 ring-1 ring-white/10" />)}
        </div>
        <div className="absolute bottom-3 right-3 z-10 rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-black tracking-wider text-white/90 ring-1 ring-white/10 backdrop-blur">SHEET</div>
      </PreviewFrame>
    );
  }

  if (['docx','txt','json'].includes(type)) {
    return (
      <PreviewFrame tone={type === 'docx' ? 'blue' : 'violet'}>
        <div className="relative z-10 h-[78%] w-[68%] rotate-[-2deg] rounded-2xl bg-slate-50/95 p-4 shadow-2xl">
          <div className="mb-3 h-4 w-1/2 rounded-full bg-blue-400/20" />
          <PreviewLines />
          {summary && <p className="mt-3 line-clamp-2 text-[10px] leading-snug text-slate-600/70">{summary}</p>}
        </div>
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame tone="slate">
      <span className={`tbadge ${typeClass(type)} relative z-10 scale-125`}>{type.toUpperCase()}</span>
    </PreviewFrame>
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
    <div className={`glass-card relative min-h-[288px] cursor-pointer overflow-hidden rounded-[28px] p-3.5 transition-all duration-300 hover:-translate-y-1 group fade-up ${selected ? 'selected' : ''}`} onClick={() => onSelect(file)}>
      {selected && <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(125,211,252,0.28),0_0_54px_rgba(91,154,255,0.16)]" />}
      <div className="shim" />

      <div className="absolute right-3 top-3 z-20 flex translate-y-[-4px] gap-1 rounded-full border border-white/10 bg-black/30 p-1 opacity-0 backdrop-blur-xl transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100" onClick={event => event.stopPropagation()}>
        <button title="Add note" onClick={() => setEditNotes(!editNotes)} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-slate-100 hover:bg-white/20">Note</button>
        <a title="Download" href={file.storage_url} download={file.original_name} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-slate-100 no-underline hover:bg-white/20">Download</a>
        <button title="Archive" onClick={archive} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-slate-100 hover:bg-white/20">Archive</button>
        <button title="Delete" onClick={removeFile} className="rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-semibold text-red-200 hover:bg-red-500/25">Delete</button>
      </div>

      <PreviewArtwork file={file} />

      <div className="relative z-10 px-0.5 pt-3.5">
        <div className="flex items-start gap-2.5">
          <p className="line-clamp-2 flex-1 text-[14px] font-bold leading-tight text-white/95">{file.name}</p>
          <span className={`tbadge ${typeClass(file.file_type)} shrink-0`}>{file.file_type.toUpperCase()}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-400/80">
          <span>{formatSize(file.size_bytes)}</span>
          <span>{formatDate(file.upload_date)}</span>
          {searchMode && file.folder_name && <span>{file.folder_name}</span>}
        </div>

        {file.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {file.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-full border border-sky-300/15 bg-sky-400/10 px-2 py-0.5 text-[10px] text-sky-100/80">{tag}</span>)}
          </div>
        )}

        {headline && <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-400/80">{headline}</p>}

        {editNotes ? (
          <div className="mt-2 flex gap-2" onClick={event => event.stopPropagation()}>
            <input
              autoFocus
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder="Add a note..."
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-100 outline-none focus:border-sky-300/40"
              onKeyDown={event => {
                if (event.key === 'Enter') saveNotes();
                if (event.key === 'Escape') setEditNotes(false);
              }}
            />
            <button onClick={saveNotes} className="rounded-full bg-blue-500/80 px-3 text-[11px] font-bold text-white">Save</button>
          </div>
        ) : file.notes ? (
          <p className="mt-2 line-clamp-2 cursor-pointer text-[11px] italic leading-relaxed text-slate-400/80 hover:text-slate-200" onClick={event => { event.stopPropagation(); setEditNotes(true); }}>{file.notes}</p>
        ) : null}
      </div>
    </div>
  );
}
