'use client';

import { useCallback, useState } from 'react';
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
  const [uploading, setUploading] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string[]>([]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) formData.append('folder_id', folderId);

    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // The fallback below covers non-JSON server failures.
    }
    if (!response.ok) throw new Error(data?.error || 'Upload failed.');
    return data as VaultFile;
  }, [folderId]);

  const handleAcceptedFiles = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;

    setErrors([]);
    setDone([]);
    setUploading(acceptedFiles.map(file => file.name));

    const failed: string[] = [];
    const succeeded: string[] = [];

    for (const file of acceptedFiles) {
      try {
        const result = await uploadFile(file);
        onUploaded(result);
        succeeded.push(file.name);
      } catch (uploadError) {
        const message = `${file.name}: ${uploadError instanceof Error ? uploadError.message : 'Upload failed.'}`;
        failed.push(message);
      } finally {
        setUploading(previous => previous.filter(name => name !== file.name));
      }
    }

    setDone(succeeded);
    setErrors(failed);
    if (failed.length) onError?.(`${failed.length} ${failed.length === 1 ? 'file' : 'files'} could not be uploaded.`);
    if (!failed.length) window.setTimeout(onClose, 900);
  }, [onClose, onError, onUploaded, uploadFile]);

  const handleRejectedFiles = useCallback((rejections: FileRejection[]) => {
    const messages = rejections.map(({ file, errors: rejectionErrors }) => {
      const reason = rejectionErrors.map(error => error.message).join(', ');
      return `${file.name}: ${reason}`;
    });
    setErrors(messages);
    setDone([]);
    onError?.('One or more files use an unsupported format.');
  }, [onError]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDropAccepted: handleAcceptedFiles,
    onDropRejected: handleRejectedFiles,
    accept: ACCEPTED,
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  const isUploading = uploading.length > 0;

  return (
    <div className="upload-content">
      <div
        {...getRootProps()}
        className={isDragActive ? 'drop-zone active' : 'drop-zone'}
        aria-busy={isUploading}
      >
        <input {...getInputProps()} />
        <span className="drop-zone-icon" aria-hidden="true">
          {isUploading ? (
            <span className="spinner large" />
          ) : done.length > 0 ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 4 4L19 6" />
            </svg>
          ) : (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M4 17v3h16v-3" />
            </svg>
          )}
        </span>

        {isUploading ? (
          <div className="drop-zone-copy">
            <h3>Uploading {uploading.length} {uploading.length === 1 ? 'file' : 'files'}…</h3>
            <p>Please keep this window open until the upload finishes.</p>
            <div className="upload-file-list">{uploading.map(name => <span key={name}>{name}</span>)}</div>
          </div>
        ) : done.length > 0 && !errors.length ? (
          <div className="drop-zone-copy success">
            <h3>{done.length} {done.length === 1 ? 'file' : 'files'} uploaded</h3>
            <p>The vault is updating now.</p>
          </div>
        ) : (
          <div className="drop-zone-copy">
            <h3>{isDragActive ? 'Release to upload' : 'Drag files into this area'}</h3>
            <p>PDF, image, Word, spreadsheet, CSV, text, HTML, and JSON files are supported.</p>
            <button type="button" className="primary-action" onClick={event => {
              event.stopPropagation();
              open();
            }}>
              Choose Files
            </button>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="upload-errors" role="alert">
          <strong>Some files were not uploaded</strong>
          {errors.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}
        </div>
      )}
    </div>
  );
}
