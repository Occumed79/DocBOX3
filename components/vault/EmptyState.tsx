import { ArchiveIcon, FilesIcon, PlusIcon, UploadIcon } from './icons';

export type NavView = 'all' | 'archive';

export default function EmptyState({ isSearching, searchQuery, navView, activeFolderName, onUpload, onCreateFolder }: {
  isSearching: boolean;
  searchQuery: string;
  navView: NavView;
  activeFolderName: string | null | undefined;
  onUpload: () => void;
  onCreateFolder: () => void;
}) {
  if (isSearching) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg></span>
        <h2>No results for “{searchQuery}”</h2>
        <p>Try a different filename, phrase, tag, or note.</p>
      </div>
    );
  }

  if (navView === 'archive') {
    return <div className="empty-state"><span className="empty-state-icon" aria-hidden="true"><ArchiveIcon /></span><h2>Archive is empty</h2><p>Archived files will appear here and can be restored at any time.</p></div>;
  }

  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true"><FilesIcon /></span>
      <h2>{activeFolderName ? `${activeFolderName} is empty` : 'Your vault is ready'}</h2>
      <p>Upload files or create a folder to start organizing this workspace.</p>
      <div className="empty-state-actions">
        <button type="button" className="primary-action" onClick={onUpload}><UploadIcon /><span>Upload Files</span></button>
        <button type="button" className="compact-action" onClick={onCreateFolder}><PlusIcon /><span>Create Folder</span></button>
      </div>
    </div>
  );
}
