'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import type { VaultFile } from './FileCard';

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
  folderId: string | null;
  onUploaded: (file: VaultFile) => void;
  onClose: () => void;
  onError?: (message: string) => void;
}

export default function DropZone({ folderId, onUploaded, onClose, onError }: Props) {
  const [queued, setQueued] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string[]>([]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) formData.append('folder_id', folderId);

    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    let data: any = null;
    try { data = await response.json(); } catch { /* non-JSON server errors use fallback */ }
    if (!response.ok) throw new Error(data?.error || 'Upload failed.');
    return data as VaultFile;
  }, [folderId]);

  const stageFiles = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setErrors([]);
    setDone([]);
    setQueued(previous => {
      const existing = new Set(previous.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      const additions = acceptedFiles.filter(file => !existing.has(`${file.name}-${file.size}-${file.lastModified}`));
      return [...previous, ...additions];
    });
  }, []);

  const uploadQueued = useCallback(async () => {
    if (!queued.length || uploading.length) return;
    setErrors([]);
    setDone([]);
    setUploading(queued.map(file => file.name));

    const failedMessages: string[] = [];
    const failedFiles: File[] = [];
    const succeeded: string[] = [];

    for (const file of queued) {
      try {
        const result = await uploadFile(file);
        onUploaded(result);
        succeeded.push(file.name);
      } catch (uploadError) {
        failedFiles.push(file);
        failedMessages.push(`${file.name}: ${uploadError instanceof Error ? uploadError.message : 'Upload failed.'}`);
      } finally {
        setUploading(previous => previous.filter(name => name !== file.name));
      }
    }

    setQueued(failedFiles);
    setDone(succeeded);
    setErrors(failedMessages);
    if (failedMessages.length) onError?.(`${failedMessages.length} ${failedMessages.length === 1 ? 'file' : 'files'} could not be uploaded.`);
    if (!failedMessages.length) window.setTimeout(onClose, 850);
  }, [onClose, onError, onUploaded, queued, uploadFile, uploading.length]);

  const handleRejectedFiles = useCallback((rejections: FileRejection[]) => {
    const messages = rejections.map(({ file, errors: rejectionErrors }) => `${file.name}: ${rejectionErrors.map(error => error.message).join(', ')}`);
    setErrors(messages);
    setDone([]);
    onError?.('One or more files use an unsupported format.');
  }, [onError]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDropAccepted: stageFiles,
    onDropRejected: handleRejectedFiles,
    accept: ACCEPTED,
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  const isUploading = uploading.length > 0;

  return (
    <div className="upload-content">
      <div {...getRootProps()} className={isDragActive ? 'drop-zone active' : 'drop-zone'} aria-busy={isUploading}>
        <input {...getInputProps()} />

        {!queued.length && !isUploading ? (
          <div className="staging-empty">
            <span className="drop-zone-icon" aria-hidden="true">
              {done.length ? <CheckIcon /> : <UploadGlyph />}
            </span>
            <div className="drop-zone-copy">
              <h3>{done.length ? `${done.length} ${done.length === 1 ? 'file' : 'files'} uploaded` : isDragActive ? 'Release to stage files' : 'Stage files before uploading'}</h3>
              <p>{done.length ? 'The document stage is updating now.' : 'Preview your selection, remove mistakes, then upload everything together.'}</p>
              {!done.length && <button type="button" className="primary-action" onClick={event => { event.stopPropagation(); open(); }}>Choose Files</button>}
            </div>
          </div>
        ) : (
          <div className="staging-queue">
            <div className="staging-queue-header">
              <div><span>Upload Staging Area</span><strong>{queued.length} {queued.length === 1 ? 'file' : 'files'} ready</strong></div>
              <button type="button" className="stage-action" onClick={event => { event.stopPropagation(); open(); }} disabled={isUploading}>Add More</button>
            </div>

            <div className="staging-file-grid">
              {queued.map((file, index) => (
                <QueuedFile key={`${file.name}-${file.size}-${file.lastModified}`} file={file} uploading={uploading.includes(file.name)} onRemove={() => setQueued(previous => previous.filter((_, itemIndex) => itemIndex !== index))} />
              ))}
            </div>

            <div className="staging-queue-footer">
              <p>{isUploading ? `Uploading ${uploading.length} ${uploading.length === 1 ? 'file' : 'files'}…` : 'Nothing is uploaded until you confirm.'}</p>
              <button type="button" className="stage-primary-button" onClick={event => { event.stopPropagation(); void uploadQueued(); }} disabled={isUploading || !queued.length}>
                {isUploading ? <><span className="spinner" /> Uploading…</> : `Upload ${queued.length === 1 ? 'File' : 'All Files'}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {errors.length > 0 && <div className="upload-errors" role="alert"><strong>Some files were not uploaded</strong>{errors.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}</div>}
    </div>
  );
}

function QueuedFile({ file, uploading, onRemove }: { file: File; uploading: boolean; onRemove: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const isImage = file.type.startsWith('image/');
  const type = (file.name.split('.').pop() || 'file').toUpperCase();

  useEffect(() => {
    if (!isImage) return;
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, isImage]);

  return (
    <article className={uploading ? 'staging-file uploading' : 'staging-file'}>
      <div className="staging-file-preview">
        {preview ? <img src={preview} alt="" /> : <DocumentGlyph />}
        <span>{type}</span>
      </div>
      <div className="staging-file-copy"><strong title={file.name}>{file.name}</strong><span>{formatLocalSize(file.size)}</span></div>
      <button type="button" onClick={event => { event.stopPropagation(); onRemove(); }} disabled={uploading} aria-label={`Remove ${file.name}`}>×</button>
      {uploading && <div className="staging-progress" />}
    </article>
  );
}

function formatLocalSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function UploadGlyph() {
  return <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M4 17v3h16v-3" /></svg>;
}

function CheckIcon() {
  return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>;
}

function DocumentGlyph() {
  return <svg viewBox="0 0 40 48" fill="none"><path d="M8 2h16l8 8v36H8z" stroke="currentColor" strokeWidth="1.5" /><path d="M24 2v9h8M13 20h14M13 26h14M13 32h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}
