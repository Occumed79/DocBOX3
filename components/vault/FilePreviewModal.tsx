'use client';
import { useEffect, useState } from 'react';
import type { VaultFile } from './FileCard';
import { typeClass, formatSize, formatDate } from './FileCard';

export default function FilePreviewModal({ file, onClose }: { file: VaultFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    fetch(`/api/preview?id=${file.id}`).then(r=>r.json()).then(d=>setUrl(d.url));
  }, [file.id]);

  const isImage = ['png','jpg','jpeg'].includes(file.file_type);
  const isPdf = file.file_type === 'pdf';
  const isText = ['txt','csv','html','htm','json'].includes(file.file_type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(20px)' }}
      onClick={e => { if (e.target===e.currentTarget) onClose(); }}>

      <div className="inspector-panel relative w-full max-w-4xl flex flex-col overflow-hidden"
        style={{ borderRadius: 18, maxHeight: '90vh' }}>
        <div className="shim" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className={`tbadge ${typeClass(file.file_type)}`}>{file.file_type.toUpperCase()}</span>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 leading-tight">{file.name}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">{file.original_name} · {formatSize(file.size_bytes)} · {formatDate(file.upload_date)}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {url && (
              <a href={url} download={file.original_name} className="btn-ghost text-[11px] px-2.5 py-1.5 flex items-center gap-1">
                <span>↓</span><span>Download</span>
              </a>
            )}
            <button onClick={onClose} className="btn-ghost text-[11px] px-2.5 py-1.5">Close</button>
          </div>
        </div>

        {/* Body - Inspector style with layered cards */}
        <div className="flex-1 overflow-auto min-h-0 p-4">
          <div className="space-y-3">
            {/* Preview Card */}
            <div className="inspector-card">
              <div className="inspector-card-title">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                Preview
              </div>
              {!url ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : isImage ? (
                <div className="flex items-center justify-center p-2 min-h-[200px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={file.name} className="max-w-full max-h-[60vh] rounded-lg object-contain" />
                </div>
              ) : isPdf ? (
                <iframe src={url} className="w-full rounded-lg" style={{ height: '50vh', border: 'none', background: '#1a1a2e' }} title={file.name} />
              ) : isText ? (
                <TextPreview url={url} />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <p className="text-slate-500 text-xs">Preview not available</p>
                  <a href={url} download={file.original_name} className="btn-primary text-[11px] px-3 py-1.5">
                    Download
                  </a>
                </div>
              )}
            </div>

            {/* File Details Card */}
            <div className="inspector-card">
              <div className="inspector-card-title">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                </svg>
                File Details
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="text-slate-600 mb-0.5">Name</p>
                  <p className="text-slate-200 truncate">{file.original_name}</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-0.5">Size</p>
                  <p className="text-slate-200">{formatSize(file.size_bytes)}</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-0.5">Type</p>
                  <p className="text-slate-200">{file.mime_type}</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-0.5">Uploaded</p>
                  <p className="text-slate-200">{formatDate(file.upload_date)}</p>
                </div>
              </div>
            </div>

            {/* Tags Card */}
            <div className="inspector-card">
              <div className="inspector-card-title">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                Tags
              </div>
              {file.tags?.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {file.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-600 italic">No tags</p>
              )}
            </div>

            {/* Notes Card */}
            <div className="inspector-card">
              <div className="inspector-card-title">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Notes
              </div>
              {file.notes ? (
                <p className="text-[11px] text-slate-300 leading-relaxed">{file.notes}</p>
              ) : (
                <p className="text-[11px] text-slate-600 italic">No notes</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (url.startsWith('data:')) {
      try { setText(atob(url.split(',')[1])); } catch { setText(url); }
    } else {
      fetch(url).then(r=>r.text()).then(setText).catch(() => setText('Could not load file.'));
    }
  }, [url]);
  return (
    <pre className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed font-mono p-3 overflow-auto rounded-lg bg-white/[0.02]" style={{ maxHeight: '40vh' }}>
      {text || <span className="text-slate-600 animate-pulse">Loading…</span>}
    </pre>
  );
}
