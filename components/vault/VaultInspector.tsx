'use client';

import { useEffect, useState } from 'react';
import { type VaultFile, formatDate, formatSize } from './file-model';
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
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState(file.notes || '');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setEditNotes(false);
    setNotes(file.notes || '');
  }, [file.id, file.notes]);

  const saveNotes = async () => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch('/api/files', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: file.id, notes }) });
      if (!response.ok) throw new Error(await readError(response, 'Could not save notes.'));
      const updated = await response.json();
      onUpdate({ ...file, notes: updated.notes });
      setEditNotes(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not save notes.');
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
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not update the file.');
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
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not delete the file.');
    } finally {
      setPending(false);
    }
  };

  const type = file.file_type.toUpperCase();

  return (
    <aside className="stage-inspector" aria-label={`Details for ${file.name}`}>
      <header className="stage-inspector-header">
        <div><p>Inspector</p><h2 title={file.name}>{file.name}</h2><span>{file.original_name}</span></div>
        <button type="button" className="stage-icon-button" onClick={onClose} aria-label="Close inspector"><CloseIcon /></button>
      </header>

      <div className="stage-inspector-scroll">
        <section className="stage-inspector-section">
          <h3>File Details</h3>
          <dl className="stage-detail-list">
            <Detail label="Format" value={type} />
            <Detail label="Size" value={formatSize(file.size_bytes)} />
            <Detail label="Uploaded" value={formatDate(file.upload_date)} />
            <Detail label="Folder" value={file.folder_name || 'All Files'} />
          </dl>
        </section>

        <section className="stage-inspector-section">
          <h3>Tags</h3>
          {file.tags?.length ? <div className="stage-tag-list">{file.tags.map(tag => <span key={tag}>{tag}</span>)}</div> : <p className="stage-muted-copy">No tags yet.</p>}
        </section>

        <section className="stage-inspector-section">
          <div className="stage-section-heading"><h3>Notes</h3>{!editNotes && <button type="button" onClick={() => setEditNotes(true)}>{file.notes ? 'Edit' : 'Add'}</button>}</div>
          {editNotes ? (
            <div className="stage-notes-editor">
              <textarea autoFocus rows={6} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add context for this file…" />
              <div><button type="button" className="stage-action prominent" onClick={() => void saveNotes()} disabled={pending}>Save</button><button type="button" className="stage-action" onClick={() => { setNotes(file.notes || ''); setEditNotes(false); }}>Cancel</button></div>
            </div>
          ) : <p className={file.notes ? 'stage-notes-copy' : 'stage-muted-copy'}>{file.notes || 'No notes yet.'}</p>}
        </section>
      </div>

      <footer className="stage-inspector-footer">
        <button type="button" className="stage-action" onClick={() => void changeArchiveState()} disabled={pending}>{file.is_archived ? 'Restore File' : 'Archive File'}</button>
        <button type="button" className="stage-action destructive" onClick={() => void deleteFile()} disabled={pending}>Delete</button>
      </footer>
    </aside>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>;
}
