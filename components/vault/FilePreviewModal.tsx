'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VaultFile } from './FileCard';
import { formatDate, formatSize, typeClass } from './FileCard';

interface Props {
  file: VaultFile;
  onClose: () => void;
  initialUrl?: string | null;
}

export default function FilePreviewModal({ file, onClose, initialUrl = null }: Props) {
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setUrl(null);
    setError(null);

    fetch(`/api/preview?id=${encodeURIComponent(file.id)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Preview could not be loaded.');
        return response.json();
      })
      .then(data => {
        if (!data?.url) throw new Error('Preview could not be loaded.');
        setUrl(data.url);
      })
      .catch(fetchError => {
        if (fetchError?.name !== 'AbortError') setError(fetchError instanceof Error ? fetchError.message : 'Preview could not be loaded.');
      });

    return () => controller.abort();
  }, [file.id, initialUrl]);

  if (!mounted) return null;

  const type = file.file_type.toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(type);
  const isPdf = type === 'pdf';
  const isText = ['txt', 'csv', 'html', 'htm', 'json'].includes(type);

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="preview-modal control-glass" role="dialog" aria-modal="true" aria-labelledby="full-preview-title">
        <div className="modal-header">
          <div className="modal-title-group">
            <span className={`type-badge ${typeClass(type)}`}>{type.toUpperCase() || 'FILE'}</span>
            <div>
              <h2 id="full-preview-title">{file.name}</h2>
              <p>{file.original_name} · {formatSize(file.size_bytes)} · {formatDate(file.upload_date)}</p>
            </div>
          </div>
          <div className="modal-actions">
            {url && <a className="toolbar-action prominent" href={url} download={file.original_name}>Download</a>}
            <button type="button" className="icon-action" onClick={onClose} aria-label="Close full preview">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="modal-preview-body">
          {!url && !error ? (
            <div className="preview-loading full"><span className="spinner large" /><span>Loading preview…</span></div>
          ) : error ? (
            <div className="preview-unavailable full"><strong>Preview unavailable</strong><span>{error}</span></div>
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url || ''} alt={file.name} className="full-image-preview" />
          ) : isPdf ? (
            <iframe src={url || ''} className="full-document-preview" title={file.name} />
          ) : isText ? (
            <TextPreview url={url || ''} />
          ) : (
            <div className="preview-unavailable full">
              <strong>No browser preview for {type.toUpperCase()}</strong>
              <span>Download the file to open it in its native application.</span>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setText('');
    setError(false);

    const load = async () => {
      try {
        let value = '';
        if (url.startsWith('data:')) {
          const comma = url.indexOf(',');
          const metadata = url.slice(0, comma);
          const payload = url.slice(comma + 1);
          value = metadata.includes(';base64') ? atob(payload) : decodeURIComponent(payload);
        } else {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Could not load text.');
          value = await response.text();
        }
        if (active) setText(value);
      } catch {
        if (active) setError(true);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [url]);

  if (error) return <div className="preview-unavailable full"><strong>Text preview unavailable</strong></div>;
  if (!text) return <div className="preview-loading full"><span className="spinner large" /><span>Loading text…</span></div>;
  return <pre className="full-text-preview">{text}</pre>;
}
