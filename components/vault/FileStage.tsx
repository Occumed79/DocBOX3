'use client';

import { useEffect, useState } from 'react';
import type { VaultFile } from './FileCard';
import { formatDate, formatSize } from './FileCard';
import FilePreviewModal from './FilePreviewModal';
import { UploadIcon } from './icons';

type StageFile = VaultFile & { extracted_text?: string | null };

async function readError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return payload?.error || fallback;
  } catch {
    return fallback;
  }
}

export default function FileStage({ file, onUpload }: {
  file: StageFile | null;
  onUpload: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      setPreviewError(null);
      return;
    }

    const controller = new AbortController();
    setUrl(null);
    setPreviewError(null);

    fetch(`/api/preview?id=${encodeURIComponent(file.id)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await readError(response, 'Preview could not be loaded.'));
        return response.json();
      })
      .then(data => {
        if (!data?.url) throw new Error('Preview could not be loaded.');
        setUrl(data.url);
      })
      .catch(error => {
        if (error?.name !== 'AbortError') setPreviewError(error instanceof Error ? error.message : 'Preview could not be loaded.');
      });

    return () => controller.abort();
  }, [file]);

  const type = file?.file_type.toLowerCase() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(type);
  const isPdf = type === 'pdf';
  const isText = ['txt', 'csv', 'html', 'htm', 'json'].includes(type);
  const extractedText = file?.extracted_text?.trim() || '';

  return (
    <section className={file ? 'document-stage has-file' : 'document-stage empty'} aria-label={file ? `Preview of ${file.name}` : 'Document stage'}>
      <div className="stage-light-sweep" aria-hidden="true" />
      <header className="stage-header">
        <div>
          <p className="stage-kicker">Document Stage</p>
          <h1>{file ? file.name : 'Select or upload a file'}</h1>
          <p>{file ? `${type.toUpperCase()} · ${formatSize(file.size_bytes)} · ${formatDate(file.upload_date)}` : 'Files open here without leaving the main workspace.'}</p>
        </div>
        <div className="stage-actions">
          {file && url && <a href={url} download={file.original_name} className="stage-action">Download</a>}
          {file && <button type="button" className="stage-action prominent" onClick={() => setShowFull(true)} disabled={!url}>Expand</button>}
          {!file && <button type="button" className="stage-action prominent" onClick={onUpload}><UploadIcon /> Upload</button>}
        </div>
      </header>

      <div className="stage-aperture">
        <div className="stage-aperture-glow" aria-hidden="true" />
        {!file ? (
          <div className="stage-empty-copy">
            <div className="stage-document-glyph" aria-hidden="true"><span /><span /><span /></div>
            <strong>Your document will appear here</strong>
            <p>Preview PDFs, images, text, spreadsheets, Word files, HTML, JSON, and more from one central stage.</p>
            <button type="button" className="stage-primary-button" onClick={onUpload}><UploadIcon /> Choose Files</button>
          </div>
        ) : !url && !previewError ? (
          <div className="stage-loading"><span className="spinner large" /><span>Preparing preview…</span></div>
        ) : previewError ? (
          <div className="stage-unavailable"><strong>Preview unavailable</strong><span>{previewError}</span>{extractedText && <ExtractedDocument text={extractedText} />}</div>
        ) : isImage ? (
          <button type="button" className="stage-image-button" onClick={() => setShowFull(true)} aria-label="Open full image preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url || ''} alt={file.name} />
          </button>
        ) : isPdf ? (
          <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={file.name} className="stage-document-frame" />
        ) : isText ? (
          <StageTextPreview url={url || ''} />
        ) : extractedText ? (
          <ExtractedDocument text={extractedText} />
        ) : (
          <div className="stage-unavailable"><strong>Inline preview is not available</strong><span>Download this {type.toUpperCase()} file to open it in its native application.</span></div>
        )}
      </div>

      {file && showFull && url && <FilePreviewModal file={file} initialUrl={url} onClose={() => setShowFull(false)} />}
    </section>
  );
}

function ExtractedDocument({ text }: { text: string }) {
  return <div className="stage-extracted-document"><div className="paper-page"><pre>{text}</pre></div></div>;
}

function StageTextPreview({ url }: { url: string }) {
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
          if (!response.ok) throw new Error('Text preview failed.');
          value = await response.text();
        }
        if (active) setText(value);
      } catch {
        if (active) setError(true);
      }
    };

    void load();
    return () => { active = false; };
  }, [url]);

  if (error) return <div className="stage-unavailable"><strong>Text preview unavailable</strong></div>;
  if (!text) return <div className="stage-loading"><span className="spinner" /><span>Loading text…</span></div>;
  return <div className="stage-extracted-document"><div className="paper-page"><pre>{text}</pre></div></div>;
}
