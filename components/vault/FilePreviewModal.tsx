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
      style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(16px)' }}
      onClick={e => { if (e.target===e.currentTarget) onClose(); }}>

      <div className="glass relative w-full max-w-5xl flex flex-col overflow-hidden"
        style={{ borderRadius: 20, maxHeight: '92vh' }}>
        <div className="shim" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-3">
            <span className={`tbadge ${typeClass(file.file_type)}`}>{file.file_type.toUpperCase()}</span>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 leading-tight">{file.name}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">{file.original_name} · {formatSize(file.size_bytes)} · {formatDate(file.upload_date)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {url && (
              <a href={url} download={file.original_name} className="btn-ghost text-xs px-3 py-2 flex items-center gap-1.5">
                <span>↓</span><span>Download</span>
              </a>
            )}
            <button onClick={onClose} className="btn-ghost text-xs px-3 py-2">Close</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto min-h-0" style={{ maxHeight: '80vh' }}>
          {!url ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center p-6 min-h-[400px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={file.name} className="max-w-full max-h-[75vh] rounded-xl object-contain shadow-2xl" />
            </div>
          ) : isPdf ? (
            <iframe src={url} className="w-full" style={{ height: '78vh', border: 'none', background: '#1a1a2e' }} title={file.name} />
          ) : isText ? (
            <TextPreview url={url} />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <p className="text-slate-400 text-sm">Preview not available for .{file.file_type} files.</p>
              <a href={url} download={file.original_name} className="btn-primary text-sm px-5 py-2.5">
                Download {file.original_name}
              </a>
            </div>
          )}
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
    <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono p-6 overflow-auto" style={{ maxHeight: '78vh' }}>
      {text || <span className="text-slate-600 animate-pulse">Loading…</span>}
    </pre>
  );
}
