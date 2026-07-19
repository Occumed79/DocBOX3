'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { formatDate, formatSize, type VaultFile } from './file-model';
import FilePreviewModal from './FilePreviewModal';
import { UploadIcon } from './icons';

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt'],
  'text/html': ['.html', '.htm'],
  'application/json': ['.json'],
};

interface Props {
  file: VaultFile | null;
  folderId: string | null;
  folderName?: string | null;
  openRequest: number;
  onUploaded: (file: VaultFile) => void;
  onError: (message: string) => void;
  onStagingChange?: (active: boolean) => void;
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return payload?.error || fallback;
  } catch {
    return fallback;
  }
}

function extension(name: string) {
  return (name.split('.').pop() || 'file').toLowerCase();
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension(file.name));
}

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || extension(file.name) === 'pdf';
}

function isTextFile(file: File) {
  return file.type.startsWith('text/') || ['txt', 'csv', 'json', 'html', 'htm'].includes(extension(file.name));
}

export default function FileStage({ file, folderId, folderName, openRequest, onUploaded, onError, onStagingChange }: Props) {
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [savedPreviewError, setSavedPreviewError] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [queued, setQueued] = useState<File[]>([]);
  const [activeQueuedIndex, setActiveQueuedIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [localText, setLocalText] = useState('');
  const [localPreviewError, setLocalPreviewError] = useState<string | null>(null);
  const handledOpenRequest = useRef(openRequest);

  const activeQueuedFile = queued[activeQueuedIndex] || null;
  const stagingActive = queued.length > 0;

  const stageFiles = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setUploadErrors([]);
    setActiveQueuedIndex(0);
    setQueued(previous => {
      const existing = new Set(previous.map(item => `${item.name}-${item.size}-${item.lastModified}`));
      const additions = acceptedFiles.filter(item => !existing.has(`${item.name}-${item.size}-${item.lastModified}`));
      return [...previous, ...additions];
    });
  }, []);

  const handleRejected = useCallback((rejections: FileRejection[]) => {
    const messages = rejections.map(({ file: rejected, errors }) => `${rejected.name}: ${errors.map(error => error.message).join(', ')}`);
    setUploadErrors(messages);
    onError('One or more files use an unsupported format.');
  }, [onError]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDropAccepted: stageFiles,
    onDropRejected: handleRejected,
    accept: ACCEPTED,
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  useEffect(() => {
    if (openRequest <= handledOpenRequest.current) return;
    handledOpenRequest.current = openRequest;
    open();
  }, [open, openRequest]);

  useEffect(() => {
    onStagingChange?.(stagingActive);
  }, [onStagingChange, stagingActive]);

  useEffect(() => {
    if (!activeQueuedFile) {
      setLocalUrl(null);
      setLocalText('');
      setLocalPreviewError(null);
      return;
    }

    let objectUrl: string | null = null;
    let active = true;
    setLocalUrl(null);
    setLocalText('');
    setLocalPreviewError(null);

    if (isImageFile(activeQueuedFile) || isPdfFile(activeQueuedFile)) {
      objectUrl = URL.createObjectURL(activeQueuedFile);
      setLocalUrl(objectUrl);
    } else if (isTextFile(activeQueuedFile)) {
      activeQueuedFile.text()
        .then(value => { if (active) setLocalText(value); })
        .catch(() => { if (active) setLocalPreviewError('This local file could not be previewed.'); });
    }

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeQueuedFile]);

  useEffect(() => {
    if (stagingActive || !file) {
      setSavedUrl(null);
      setSavedPreviewError(null);
      return;
    }

    const controller = new AbortController();
    setSavedUrl(null);
    setSavedPreviewError(null);

    fetch(`/api/preview?id=${encodeURIComponent(file.id)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await readError(response, 'Preview could not be loaded.'));
        return response.json();
      })
      .then(data => {
        if (!data?.url) throw new Error('Preview could not be loaded.');
        setSavedUrl(data.url);
      })
      .catch(error => {
        if (error?.name !== 'AbortError') setSavedPreviewError(error instanceof Error ? error.message : 'Preview could not be loaded.');
      });

    return () => controller.abort();
  }, [file?.id, stagingActive]);

  const removeQueuedFile = useCallback((index: number) => {
    setQueued(previous => {
      const next = previous.filter((_, itemIndex) => itemIndex !== index);
      setActiveQueuedIndex(current => Math.max(0, Math.min(current, next.length - 1)));
      return next;
    });
    setUploadErrors([]);
  }, []);

  const clearQueue = useCallback(() => {
    if (uploading) return;
    setQueued([]);
    setActiveQueuedIndex(0);
    setUploadErrors([]);
  }, [uploading]);

  const uploadQueued = useCallback(async () => {
    if (!queued.length || uploading) return;
    setUploading(true);
    setUploadErrors([]);

    const failedFiles: File[] = [];
    const errors: string[] = [];

    for (const queuedFile of queued) {
      const formData = new FormData();
      formData.append('file', queuedFile);
      if (folderId) formData.append('folder_id', folderId);

      try {
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(await readError(response, 'Upload failed.'));
        const uploaded = await response.json() as VaultFile;
        onUploaded(uploaded);
      } catch (error) {
        failedFiles.push(queuedFile);
        errors.push(`${queuedFile.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`);
      }
    }

    setUploading(false);
    setQueued(failedFiles);
    setActiveQueuedIndex(0);
    setUploadErrors(errors);
    if (errors.length) onError(`${errors.length} ${errors.length === 1 ? 'file' : 'files'} could not be uploaded.`);
  }, [folderId, onError, onUploaded, queued, uploading]);

  const savedType = file?.file_type.toLowerCase() || '';
  const savedIsImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(savedType);
  const savedIsPdf = savedType === 'pdf';
  const savedIsText = ['txt', 'csv', 'html', 'htm', 'json'].includes(savedType);
  const extractedText = file?.extracted_text?.trim() || '';
  const stagedType = activeQueuedFile ? extension(activeQueuedFile.name).toUpperCase() : '';

  const stageTitle = stagingActive
    ? activeQueuedFile?.name || 'Stage files'
    : file?.name || 'Select or upload a file';

  const stageSubtitle = stagingActive
    ? `${stagedType} · ${activeQueuedFile ? formatSize(activeQueuedFile.size) : ''} · Staged for ${folderName || 'All Files'}`
    : file
      ? `${savedType.toUpperCase()} · ${formatSize(file.size_bytes)} · ${formatDate(file.upload_date)}`
      : 'Files appear here immediately before and after upload.';

  return (
    <section
      {...getRootProps()}
      className={`${stagingActive ? 'document-stage staging-active' : file ? 'document-stage has-file' : 'document-stage empty'}${isDragActive ? ' drag-active' : ''}`}
      aria-label={stagingActive ? 'Upload staging area' : file ? `Preview of ${file.name}` : 'Document stage'}
    >
      <input {...getInputProps()} id="stage-file-input" />
      <div className="stage-light-sweep" aria-hidden="true" />

      {isDragActive && <div className="stage-drop-overlay"><strong>Release to stage files</strong><span>Nothing uploads until you confirm.</span></div>}

      <header className="stage-header">
        <div>
          <p className="stage-kicker">{stagingActive ? 'Upload Staging' : 'Document Stage'}</p>
          <h1>{stageTitle}</h1>
          <p>{stageSubtitle}</p>
        </div>

        <div className="stage-actions">
          {stagingActive ? (
            <>
              <button type="button" className="stage-action" onClick={event => { event.stopPropagation(); open(); }} disabled={uploading}>Add Files</button>
              <button type="button" className="stage-action" onClick={event => { event.stopPropagation(); removeQueuedFile(activeQueuedIndex); }} disabled={uploading || !activeQueuedFile}>Remove</button>
              <button type="button" className="stage-action" onClick={event => { event.stopPropagation(); clearQueue(); }} disabled={uploading}>Cancel</button>
              <button type="button" className="stage-action prominent" onClick={event => { event.stopPropagation(); void uploadQueued(); }} disabled={uploading || !queued.length}>
                {uploading ? <><span className="spinner" /> Uploading…</> : `Upload ${queued.length === 1 ? 'File' : `${queued.length} Files`}`}
              </button>
            </>
          ) : (
            <>
              {file && savedUrl && <a href={savedUrl} download={file.original_name} className="stage-action">Download</a>}
              {file && <button type="button" className="stage-action" onClick={event => { event.stopPropagation(); setShowFull(true); }} disabled={!savedUrl}>Expand</button>}
              <button type="button" className="stage-action prominent" onClick={event => { event.stopPropagation(); open(); }}><UploadIcon /> Add Files</button>
            </>
          )}
        </div>
      </header>

      <div className="stage-aperture">
        <div className="stage-aperture-glow" aria-hidden="true" />

        {stagingActive && activeQueuedFile ? (
          <LocalFilePreview file={activeQueuedFile} url={localUrl} text={localText} error={localPreviewError} />
        ) : !file ? (
          <div className="stage-empty-copy">
            <div className="stage-document-glyph" aria-hidden="true"><span /><span /><span /></div>
            <strong>Your document will appear here</strong>
            <p>Choose or drag files into this stage to preview them before upload.</p>
            <button type="button" className="stage-primary-button" onClick={event => { event.stopPropagation(); open(); }}><UploadIcon /> Choose Files</button>
          </div>
        ) : !savedUrl && !savedPreviewError ? (
          <div className="stage-loading"><span className="spinner large" /><span>Preparing preview…</span></div>
        ) : savedPreviewError ? (
          <div className="stage-unavailable"><strong>Preview unavailable</strong><span>{savedPreviewError}</span>{extractedText && <ExtractedDocument text={extractedText} />}</div>
        ) : savedIsImage ? (
          <button type="button" className="stage-image-button" onClick={() => setShowFull(true)} aria-label="Open full image preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={savedUrl || ''} alt={file.name} />
          </button>
        ) : savedIsPdf ? (
          <iframe src={`${savedUrl}#toolbar=0&navpanes=0&view=FitH`} title={file.name} className="stage-document-frame" />
        ) : savedIsText ? (
          <StageTextPreview url={savedUrl || ''} />
        ) : extractedText ? (
          <ExtractedDocument text={extractedText} />
        ) : (
          <div className="stage-unavailable"><strong>Inline preview is not available</strong><span>Download this {savedType.toUpperCase()} file to open it in its native application.</span></div>
        )}
      </div>

      {stagingActive && (
        <div className="stage-queue-rail" aria-label="Staged files">
          {queued.map((queuedFile, index) => (
            <button
              type="button"
              key={`${queuedFile.name}-${queuedFile.size}-${queuedFile.lastModified}`}
              className={index === activeQueuedIndex ? 'stage-queue-item active' : 'stage-queue-item'}
              onClick={event => { event.stopPropagation(); setActiveQueuedIndex(index); }}
              disabled={uploading}
              title={queuedFile.name}
            >
              <LocalThumb file={queuedFile} />
              <span><strong>{queuedFile.name}</strong><small>{formatSize(queuedFile.size)}</small></span>
            </button>
          ))}
          <button type="button" className="stage-queue-add" onClick={event => { event.stopPropagation(); open(); }} disabled={uploading}><span>+</span><small>Add more</small></button>
        </div>
      )}

      {uploadErrors.length > 0 && <div className="stage-upload-errors" role="alert"><strong>Some files were not uploaded</strong>{uploadErrors.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}</div>}

      {file && !stagingActive && showFull && savedUrl && <FilePreviewModal file={file} initialUrl={savedUrl} onClose={() => setShowFull(false)} />}
    </section>
  );
}

function LocalFilePreview({ file, url, text, error }: { file: File; url: string | null; text: string; error: string | null }) {
  if (error) return <div className="stage-unavailable"><strong>Preview unavailable</strong><span>{error}</span></div>;

  if (isImageFile(file)) {
    return url ? <div className="stage-local-image">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt={file.name} /></div> : <div className="stage-loading"><span className="spinner" /><span>Preparing image…</span></div>;
  }

  if (isPdfFile(file)) {
    return url ? <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={file.name} className="stage-document-frame" /> : <div className="stage-loading"><span className="spinner" /><span>Preparing PDF…</span></div>;
  }

  if (isTextFile(file)) {
    return text ? <div className="stage-extracted-document"><div className="paper-page"><pre>{text}</pre></div></div> : <div className="stage-loading"><span className="spinner" /><span>Reading file…</span></div>;
  }

  return <div className="stage-local-document"><div className="stage-local-document-icon">{extension(file.name).toUpperCase()}</div><strong>{file.name}</strong><span>Ready to upload. Browser preview is not available for this file type.</span></div>;
}

function LocalThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  const image = isImageFile(file);

  useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, image]);

  if (url) return <span className="stage-queue-thumb image">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" /></span>;
  return <span className="stage-queue-thumb">{extension(file.name).toUpperCase()}</span>;
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
