'use client';

import { useEffect, useState } from 'react';
import FilePreviewModal from './FilePreviewModal';
import { type VaultFile, formatDate, formatSize, typeClass } from './FileCard';
import { CloseIcon } from './icons';

async function readError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return payload?.error || fallback;
  } catch {
    return fallback;
  }
}

export default function VaultInspector({ file, onClose, onUpdate, onRemove, onError }: {
  file: VaultFile;
  onClose: () => void;
  onUpdate: (file: VaultFile) => void;
  onRemove: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState(file.notes || '');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setUrl(null);
    setPreviewError(null);
    setEditNotes(false);
    setNotes(file.notes || '');

    fetch(`/api/preview?id=${encodeURIComponent(file.id)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await readError(response, 'Preview could not be loaded.'));
        return response.json();
      })
      .then(data => {
        if (!data?.url) throw new Error('Preview could not be loaded.');
        setUrl(data.url);
      })
      .catch(fetchError => {
        if (fetchError?.name !== 'AbortError') setPreviewError(fetchError instanceof Error ? fetchError.message : 'Preview could not be loaded.');
      });

    return () => controller.abort();
  }, [file.id, file.notes]);

  const fileType = file.file_type.toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(fileType);
  const isPdf = fileType === 'pdf';
  const isText = ['txt', 'csv', 'html', 'htm', 'json'].includes(fileType);

  const saveNotes = async () => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch('/api/files', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: file.id, notes }) });
      if (!response.ok) throw new Error(await readError(response, 'Could not save notes.'));
      const updated = await response.json();
      onUpdate({ ...file, notes: updated.notes });
      setEditNotes(false);
    } catch (mutationError) {
      onError(mutationError instanceof Error ? mutationError.message : 'Could not save notes.');
    } finally {
      setPending(false);
    }
  };

  const changeArchiveState = async () => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch('/api/files', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: file.id, is_archived: !file.is_archived }) });
      if (!response.ok) throw new Error(await readError(response, file.is_archived ? 'Could not restore the file.' : 'Could not archive the file.'));
      onRemove(file.id);
    } catch (mutationError) {
      onError(mutationError instanceof Error ? mutationError.message : 'Could not update the file.');
    } finally {
      setPending(false);
    }
  };

  const deleteFile = async () => {
    if (pending || !window.confirm(`Permanently delete “${file.name}”?`)) return;
    setPending(true);
    try {
      const response = await fetch('/api/files', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: file.id }) });
      if (!response.ok) throw new Error(await readError(response, 'Could not delete the file.'));
      onRemove(file.id);
    } catch (mutationError) {
      onError(mutationError instanceof Error ? mutationError.message : 'Could not delete the file.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <aside className="preview-pane control-glass" aria-label={`Inspector for ${file.name}`}>
        <div className="inspector-header">
          <div className="inspector-title"><span className={`type-badge ${typeClass(fileType)}`}>{fileType.toUpperCase()}</span><div><h2 title={file.name}>{file.name}</h2><p title={file.original_name}>{file.original_name}</p></div></div>
          <button type="button" className="icon-action" onClick={onClose} aria-label="Close inspector"><CloseIcon /></button>
        </div>

        <div className="inspector-toolbar" aria-label="File actions">
          {url && <a className="toolbar-action prominent" href={url} download={file.original_name}><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg><span>Download</span></a>}
          <button type="button" className="toolbar-action" onClick={() => setShowFull(true)} disabled={!url}><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></svg><span>Full View</span></button>
          <button type="button" className="toolbar-action" onClick={() => void changeArchiveState()} disabled={pending}>{file.is_archived ? 'Restore' : 'Archive'}</button>
          <button type="button" className="toolbar-action destructive" onClick={() => void deleteFile()} disabled={pending}>Delete</button>
        </div>

        <div className="inspector-scroll">
          <section className="inspector-section">
            <h3>Preview</h3>
            <div className="preview-surface">
              {!url && !previewError ? <div className="preview-loading"><span className="spinner" /><span>Loading preview…</span></div>
                : previewError ? <div className="preview-unavailable"><strong>Preview unavailable</strong><span>{previewError}</span></div>
                : isImage ? <button type="button" className="image-preview-button" onClick={() => setShowFull(true)} aria-label="Open full image preview">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url || ''} alt={file.name} /></button>
                : isPdf ? <iframe src={`${url}#toolbar=0&navpanes=0`} title={file.name} className="document-preview" />
                : isText ? <InlineText url={url || ''} />
                : <div className="preview-unavailable"><strong>No inline preview</strong><span>Download the {fileType.toUpperCase()} file to open it in its native app.</span></div>}
            </div>
          </section>

          <section className="inspector-section">
            <h3>File Details</h3>
            <dl className="detail-grid"><Detail label="Type" value={fileType.toUpperCase()} /><Detail label="Size" value={formatSize(file.size_bytes)} /><Detail label="Uploaded" value={formatDate(file.upload_date)} /><Detail label="Folder" value={file.folder_name || 'All Files'} /><Detail label="Original Name" value={file.original_name} wide /></dl>
          </section>

          <section className="inspector-section">
            <h3>Tags</h3>
            {file.tags?.length ? <div className="tag-list">{file.tags.map(tag => <span key={tag}>{tag}</span>)}</div> : <p className="empty-copy">No tags yet.</p>}
          </section>

          <section className="inspector-section">
            <div className="section-heading-row"><h3>Notes</h3>{!editNotes && <button type="button" onClick={() => setEditNotes(true)}>{file.notes ? 'Edit' : 'Add Note'}</button>}</div>
            {editNotes ? (
              <div className="notes-editor">
                <label className="sr-only" htmlFor={`notes-${file.id}`}>Notes for {file.name}</label>
                <textarea id={`notes-${file.id}`} autoFocus rows={5} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add context for this file…" />
                <div><button type="button" className="compact-action primary" onClick={() => void saveNotes()} disabled={pending}>Save</button><button type="button" className="compact-action" onClick={() => { setNotes(file.notes || ''); setEditNotes(false); }}>Cancel</button></div>
              </div>
            ) : <p className={file.notes ? 'notes-copy' : 'empty-copy'}>{file.notes || 'No notes yet.'}</p>}
          </section>
        </div>
      </aside>
      {showFull && url && <FilePreviewModal file={file} initialUrl={url} onClose={() => setShowFull(false)} />}
    </>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? 'detail-item wide' : 'detail-item'}><dt>{label}</dt><dd title={value}>{value}</dd></div>;
}

function InlineText({ url }: { url: string }) {
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

  if (error) return <div className="preview-unavailable"><strong>Text preview unavailable</strong></div>;
  if (!text) return <div className="preview-loading"><span className="spinner" /><span>Loading text…</span></div>;
  return <pre className="inline-text-preview">{text}</pre>;
}
