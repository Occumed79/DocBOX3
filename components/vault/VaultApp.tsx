'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SearchBar from './SearchBar';
import FileCard, { type VaultFile } from './FileCard';
import EmptyState, { type NavView } from './EmptyState';
import UploadSheet from './UploadSheet';
import VaultInspector from './VaultInspector';
import { ArchiveIcon, CloseIcon, FilesIcon, FolderIcon, PlusIcon, UploadIcon } from './icons';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
  file_count: number;
}

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
  const [showUpload, setShowUpload] = useState(false);
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
  useEffect(() => {
    if (!showUpload) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [showUpload]);

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
      const response = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
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
      const response = await fetch('/api/folders', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: folder.id }) });
      if (!response.ok) throw new Error(await readError(response, 'Could not delete the folder.'));
      if (activeFolder === folder.id) {
        navigateTo('all');
        await loadFolders();
      } else {
        await Promise.all([loadFolders(), loadFiles()]);
      }
    } catch (mutationError) {
      reportError(mutationError instanceof Error ? mutationError.message : 'Could not delete the folder.');
    } finally {
      setFolderMutation(false);
    }
  }, [activeFolder, folderMutation, loadFiles, loadFolders, navigateTo, reportError]);

  const openUpload = useCallback(() => {
    if (navView === 'archive') navigateTo('all');
    setSelectedFile(null);
    setShowUpload(true);
  }, [navView, navigateTo]);

  const handleUploaded = useCallback((uploaded: VaultFile) => {
    setNavView('all');
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedFile(null);
    setFiles(previous => (uploaded.folder_id || null) === activeFolder ? [uploaded, ...previous.filter(file => file.id !== uploaded.id)] : previous);
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

  const displayFiles = isSearching ? searchResults : files;
  const rootFolders = useMemo(() => folders.filter(folder => !folder.parent_id), [folders]);
  const activeFolderName = activeFolder ? folders.find(folder => folder.id === activeFolder)?.name : null;
  const sectionTitle = isSearching ? `Search results for “${searchQuery}”` : activeFolderName || (navView === 'archive' ? 'Archive' : 'All Files');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="command-bar control-glass">
          <button className="brand-lockup" type="button" onClick={() => navigateTo('all')} aria-label="Open All Files">
            <span className="brand-mark" aria-hidden="true"><span className="brand-mark-layer brand-mark-layer-back" /><span className="brand-mark-layer brand-mark-layer-front" /><span className="brand-mark-glyph">SV</span></span>
            <span className="brand-copy"><strong>Source Vault</strong><span>Shared file workspace</span></span>
          </button>

          <nav className="primary-nav" aria-label="Primary navigation">
            <button type="button" className={navView === 'all' && !isSearching ? 'nav-control active' : 'nav-control'} onClick={() => navigateTo('all')} aria-current={navView === 'all' && !isSearching ? 'page' : undefined}><FilesIcon /><span>All Files</span></button>
            <button type="button" className={navView === 'archive' && !isSearching ? 'nav-control active' : 'nav-control'} onClick={() => navigateTo('archive')} aria-current={navView === 'archive' && !isSearching ? 'page' : undefined}><ArchiveIcon /><span>Archive</span></button>
          </nav>

          <div className="command-actions"><button type="button" className="primary-action" onClick={openUpload}><UploadIcon /><span>Upload</span></button></div>
        </div>

        <div className="search-region"><SearchBar onResults={handleSearchResults} onClear={handleSearchClear} onError={reportError} /></div>

        <div className="folder-toolbar control-glass" aria-label="Folders">
          <div className="folder-scroll">
            <button type="button" onClick={() => navigateTo('all')} className={!activeFolder && !isSearching && navView === 'all' ? 'folder-pill active' : 'folder-pill'} aria-current={!activeFolder && !isSearching && navView === 'all' ? 'page' : undefined}>All</button>
            {rootFolders.map(folder => (
              <div key={folder.id} className={activeFolder === folder.id && !isSearching ? 'folder-group active' : 'folder-group'}>
                <button type="button" onClick={() => navigateTo('all', folder.id)} className="folder-pill folder-select" aria-current={activeFolder === folder.id && !isSearching ? 'page' : undefined}><FolderIcon color={folder.color} /><span>{folder.name}</span><span className="folder-count" aria-label={`${folder.file_count} files`}>{folder.file_count}</span></button>
                <button type="button" className="folder-remove" onClick={() => void deleteFolder(folder)} aria-label={`Delete ${folder.name} folder`} title={`Delete ${folder.name}`}><CloseIcon /></button>
              </div>
            ))}
          </div>

          <div className="folder-create-area">
            {showNewFolder ? (
              <div className="folder-create-form">
                <label className="sr-only" htmlFor="new-folder-name">Folder name</label>
                <input id="new-folder-name" autoFocus value={newFolderName} onChange={event => setNewFolderName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createFolder(); if (event.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }} placeholder="Folder name" disabled={folderMutation} />
                <button type="button" className="compact-action primary" onClick={() => void createFolder()} disabled={folderMutation || !newFolderName.trim()}>Create</button>
                <button type="button" className="icon-action" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} aria-label="Cancel creating folder"><CloseIcon /></button>
              </div>
            ) : <button type="button" className="compact-action" onClick={() => setShowNewFolder(true)}><PlusIcon /><span>New Folder</span></button>}
          </div>
        </div>
      </header>

      <main className={selectedFile ? 'workspace with-inspector' : 'workspace'}>
        <section className="library-panel" aria-labelledby="library-heading">
          <div className="content-toolbar">
            <div><p className="content-eyebrow">File Library</p><div className="content-title-row"><h1 id="library-heading">{sectionTitle}</h1><span className="file-count-label">{displayFiles.length} {displayFiles.length === 1 ? 'file' : 'files'}</span></div></div>
            <div className="content-actions">{selectedFile && <button type="button" className="compact-action" onClick={() => setSelectedFile(null)}>Close Inspector</button>}<button type="button" className="compact-action primary" onClick={openUpload}><UploadIcon /><span>Upload</span></button></div>
          </div>

          {error && <div className="status-banner error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><CloseIcon /></button></div>}

          <div className="file-list-scroll">
            {loading ? (
              <div className="file-grid" aria-label="Loading files" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="file-card-skeleton" />)}</div>
            ) : displayFiles.length === 0 ? (
              <EmptyState isSearching={isSearching} searchQuery={searchQuery} navView={navView} activeFolderName={activeFolderName} onUpload={openUpload} onCreateFolder={() => setShowNewFolder(true)} />
            ) : (
              <div className="file-grid">{displayFiles.map(file => <FileCard key={file.id} file={file} selected={selectedFile?.id === file.id} onSelect={setSelectedFile} onUpdate={handleUpdate} onRemove={handleRemove} onError={reportError} searchMode={isSearching} archivedView={navView === 'archive'} />)}</div>
            )}
          </div>
        </section>

        {selectedFile && <VaultInspector file={selectedFile} onClose={() => setSelectedFile(null)} onUpdate={handleUpdate} onRemove={handleRemove} onError={reportError} />}
      </main>

      {showUpload && <UploadSheet folderId={activeFolder} folderName={activeFolderName} onUploaded={handleUploaded} onClose={() => setShowUpload(false)} onError={reportError} />}
    </div>
  );
}
