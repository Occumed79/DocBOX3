'use client';

import { useEffect } from 'react';
import DropZone from './DropZone';
import type { VaultFile } from './FileCard';
import { CloseIcon } from './icons';

export default function UploadSheet({ folderId, folderName, onUploaded, onClose, onError }: {
  folderId: string | null;
  folderName: string | null | undefined;
  onUploaded: (file: VaultFile) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="upload-sheet control-glass" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div><p className="content-eyebrow">Add to Source Vault</p><h2 id="upload-title">Upload Files</h2><p>{folderName ? `Files will be added to ${folderName}.` : 'Files will be added to All Files.'}</p></div>
          <button type="button" className="icon-action" onClick={onClose} aria-label="Close upload"><CloseIcon /></button>
        </div>
        <DropZone folderId={folderId} onUploaded={onUploaded} onClose={onClose} onError={onError} />
      </section>
    </div>
  );
}
