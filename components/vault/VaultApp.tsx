'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SearchBar from './SearchBar';
import type { VaultFile } from './file-model';
import VaultInspector from './VaultInspector';
import FileGallery from './FileGallery';
import LuminousBackdrop from './LuminousBackdrop';
import { ArchiveIcon, CloseIcon, FilesIcon, FolderIcon, PlusIcon, UploadIcon } from './icons';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
  file_count: number;
}

type NavView = 'all' | 'archive';

async function readError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return payload?.error || fallback;
  } catch {
    return fallback;
  }
}

export default function VaultApp() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [navView, setNavView] = useState<NavView>('all');
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<VaultFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [stagingActive, setStagingActive] = useState(false);
  const [uploadOpenRequest, setUploadOpenRequest] = useState(0);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderMutation, setFolderMutation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback((message: string) => setError(message), []);

  const loadFolders = useCallback(async () => {
    try {
      const response = await fetch('/api/folders', { cache: 'no-store' });
      if (!response.ok) throw new Error(await readError(response, 'Could not load folders.'));
      const data = await response.json();
      setFolders(Array.isArray(data) ? data : []);
    } catch (loadError) {
      reportError(loadError instanceof Error ? loadError.message : 'Could not load folders.');
    }
  }, [reportError]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const archived = navView === 'archive';
    let url = `/api/files?archived=${archived}`;
    if (!archived) url += activeFolder ? `&folder_id=${encodeURIComponent(activeFolder)}` : '&folder_id=null';

    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(await readError(response, 'Could not load files.'));
      const data = await response.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setFiles([]);
      reportError(loadError instanceof Error ? loadError.message : 'Could not load files.');
    } finally {
      setLoading(false);
    }
  }, [activeFolder, navView, reportError]);

  useEffect(() => { void loadFolders(); }, [loadFolders]);
  useEffect(() => { if (!isSearching) void loadFiles(); }, [isSearching, loadFiles]);

  const displayFiles = isSearching ? searchResults : files;

  const navigateTo = useCallback((view: NavView, folderId: string | null = null) => {
    setNavView(view);
    setActiveFolder(view === 'archive' ? null : folderId);
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedFile(null);
    setError(null);
  }, []);

  const handleSearchResults = useCallback((results: VaultFile[], query: string) => {
    setSearchResults(results);
    setSearchQuery(query);
    setIsSearching(true);
    setSelectedFile(null);
    setError(null);
  }, []);

  const handleSearchClear = useCallback(() => {
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedFile(null);
  }, []);

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || folderMutation) return;
    setFolderMutation(true);
    setError(null);
    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not create the folder.'));
      setNewFolderName('');
      setShowNewFolder(false);
      await loadFolders();
    } catch (mutationError) {
      reportError(mutationError instanceof Error ? mutationError.message : 'Could not create the folder.');
    } finally {
      setFolderMutation(false);
    }
  }, [folderMutation, loadFolders, newFolderName, reportError]);

  const deleteFolder = useCallback(async (folder: Folder) => {
    if (folderMutation || !window.confirm(`Delete “${folder.name}”? Files in this folder will move to All Files.`)) return;
    setFolderMutation(true);
    setError(null);
    try {
      const response = await fetch('/api/folders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: folder.id }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not delete the folder.'));
      if (activeFolder === folder.id) navigateTo('all');
      await Promise.all([loadFolders(), loadFiles()]);
    } catch (mutationError) {
      reportError(mutationError instanceof Error ? mutationError.message : 'Could not delete the folder.');
    } finally {
      setFolderMutation(false);
    }
  }, [activeFolder, folderMutation, loadFiles, loadFolders, navigateTo, reportError]);

  const openUpload = useCallback(() => {
    if (navView === 'archive') navigateTo('all');
    setUploadOpenRequest(request => request + 1);
  }, [navView, navigateTo]);

  const handleUploaded = useCallback((uploaded: VaultFile) => {
    setNavView('all');
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    setFiles(previous => (uploaded.folder_id || null) === activeFolder
      ? [uploaded, ...previous.filter(file => file.id !== uploaded.id)]
      : previous);
    setSelectedFile(null);
    void loadFolders();
  }, [activeFolder, loadFolders]);

  const handleUpdate = useCallback((updated: VaultFile) => {
    setFiles(previous => previous.map(file => file.id === updated.id ? updated : file));
    setSearchResults(previous => previous.map(file => file.id === updated.id ? updated : file));
    setSelectedFile(previous => previous?.id === updated.id ? updated : previous);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setFiles(previous => previous.filter(file => file.id !== id));
    setSearchResults(previous => previous.filter(file => file.id !== id));
    setSelectedFile(previous => previous?.id === id ? null : previous);
    void loadFolders();
  }, [loadFolders]);

  const rootFolders = useMemo(() => folders.filter(folder => !folder.parent_id), [folders]);
  const activeFolderName = activeFolder ? folders.find(folder => folder.id === activeFolder)?.name : null;
  const viewTitle = isSearching ? `Results for “${searchQuery}”` : activeFolderName || (navView === 'archive' ? 'Archive' : 'All Files');

  return (
    <div className="cosmic-vault-shell abyssal-vault-shell">
      <LuminousBackdrop />

      <div className="cosmic-vault-ui">
        <header className="cosmic-command-stack">
          <div className="cosmic-command-bar">
            <button type="button" className="cosmic-brand" onClick={() => navigateTo('all')} aria-label="Open All Files">
              <span className="cosmic-brand-mark" aria-hidden="true"><span>SV</span></span>
              <span><strong>Source Vault</strong><small>Visual file workspace</small></span>
            </button>
            <div className="cosmic-search"><SearchBar onResults={handleSearchResults} onClear={handleSearchClear} onError={reportError} /></div>
            <button type="button" className="cosmic-upload-button" onClick={openUpload}><UploadIcon /><span>Add Files</span></button>
          </div>

          <div className="cosmic-folder-dock" aria-label="Vault locations">
            <div className="cosmic-folder-scroll">
              <button type="button" className={navView === 'all' && !isSearching && !activeFolder ? 'cosmic-location-pill active' : 'cosmic-location-pill'} onClick={() => navigateTo('all')}><FilesIcon /><span>All Files</span><small>{navView === 'all' && !activeFolder ? displayFiles.length : ''}</small></button>
              <button type="button" className={navView === 'archive' && !isSearching ? 'cosmic-location-pill active' : 'cosmic-location-pill'} onClick={() => navigateTo('archive')}><ArchiveIcon /><span>Archive</span></button>

              {rootFolders.map(folder => (
                <div key={folder.id} className={activeFolder === folder.id && !isSearching ? 'cosmic-folder-pill active' : 'cosmic-folder-pill'}>
                  <button type="button" onClick={() => navigateTo('all', folder.id)}><FolderIcon color="currentColor" /><span>{folder.name}</span><small>{folder.file_count}</small></button>
                  <button type="button" className="cosmic-folder-delete" onClick={() => void deleteFolder(folder)} aria-label={`Delete ${folder.name}`}><CloseIcon /></button>
                </div>
              ))}
            </div>

            <div className="cosmic-folder-create">
              {showNewFolder ? (
                <div className="cosmic-folder-form">
                  <input autoFocus value={newFolderName} onChange={event => setNewFolderName(event.target.value)} onKeyDown={event => {
                    if (event.key === 'Enter') void createFolder();
                    if (event.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
                  }} placeholder="Folder name" disabled={folderMutation} />
                  <button type="button" onClick={() => void createFolder()} disabled={folderMutation || !newFolderName.trim()}>Create</button>
                  <button type="button" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} aria-label="Cancel"><CloseIcon /></button>
                </div>
              ) : (
                <button type="button" className="cosmic-new-folder-button" onClick={() => setShowNewFolder(true)}><PlusIcon /><span>New Folder</span></button>
              )}
            </div>
          </div>
        </header>

        {error && <div className="cosmic-status-banner" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><CloseIcon /></button></div>}

        <main className={selectedFile && !stagingActive ? 'gallery-workspace has-inspector' : 'gallery-workspace'}>
          <section className="gallery-main-column" aria-labelledby="current-view-title">
            <div className="view-heading"><div><p>Current View</p><h1 id="current-view-title">{viewTitle}</h1></div><span>{displayFiles.length} {displayFiles.length === 1 ? 'file' : 'files'}</span></div>
            <FileGallery
              files={displayFiles}
              loading={loading}
              folderId={activeFolder}
              folderName={activeFolderName}
              openRequest={uploadOpenRequest}
              onUploaded={handleUploaded}
              onDetails={setSelectedFile}
              onError={reportError}
              onStagingChange={setStagingActive}
            />
          </section>

          {selectedFile && !stagingActive && <VaultInspector file={selectedFile} onClose={() => setSelectedFile(null)} onUpdate={handleUpdate} onRemove={handleRemove} onError={reportError} />}
        </main>
      </div>
    </div>
  );
}
