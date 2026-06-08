'use client';
import { useEffect, useState } from 'react';
import type { VaultFile } from './FileCard';

export default function FilePreviewModal({ file, onClose }: { file: VaultFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // Close on Escape
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    fetch(`/api/preview?id=${file.id}`)
      .then(r => r.json())
      .then(d => setUrl(d.url));
  }, [file.id]);

  const isImage = ['png','jpg','jpeg'].includes(file.file_type);
  const isPdf = file.file_type === 'pdf';
  const isText = ['txt','csv','html','htm'].includes(file.file_type);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="gc w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" style={{ position: 'relative' }}>
        <div className="shimmer-top" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{file.name}</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">{file.original_name} · {file.file_type.toUpperCase()}</p>
          </div>
          <div className="flex gap-2">
            {url && (
              <a
                href={url}
                download={file.original_name}
                className="btn-ghost text-xs px-3 py-1.5"
              >
                Download
              </a>
            )}
            <button onClick={onClose} className="btn-ghost text-xs px-3 py-1.5">Close ×</button>
          </div>
        </div>

        {/* Preview body */}
        <div className="flex-1 overflow-auto p-4 min-h-0" style={{ maxHeight: '75vh' }}>
          {!url ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="max-w-full max-h-full mx-auto rounded-lg object-contain" />
          ) : isPdf ? (
            <iframe
              src={url}
              className="w-full rounded-lg"
              style={{ height: '70vh', border: 'none', background: '#fff' }}
              title={file.name}
            />
          ) : isText ? (
            <TextPreview url={url} />
          ) : (
            <div className="text-center py-16">
              <p className="text-slate-400 text-sm mb-3">Preview not available for this file type.</p>
              <a href={url} download={file.original_name} className="btn-primary text-sm px-4 py-2 inline-block">
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
      // decode base64 data URL
      const b64 = url.split(',')[1];
      setText(atob(b64));
    } else {
      fetch(url).then(r => r.text()).then(setText);
    }
  }, [url]);

  return (
    <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono p-4 gc-sm rounded-xl overflow-auto" style={{ maxHeight: '65vh' }}>
      {text || <span className="text-slate-600">Loading…</span>}
    </pre>
  );
}
