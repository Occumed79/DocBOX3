'use client';
import { useState, useEffect, useCallback } from 'react';
import FolderTree, { type Folder } from '@/components/vault/FolderTree';
import DropZone from '@/components/vault/DropZone';
import FileCard, { type VaultFile } from '@/components/vault/FileCard';
import SearchBar from '@/components/vault/SearchBar';

type View = 'vault' | 'search' | 'archive';

export default function Home() {
  const [folders, setFolders]         = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [files, setFiles]             = useState<VaultFile[]>([]);
  const [view, setView]               = useState<View>('vault');
  const [searchResults, setSearchResults] = useState<VaultFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading]         = useState(false);
  const [showDrop, setShowDrop]       = useState(false);
  const [newFolderParent, setNewFolderParent] = useState<string | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  // ── Load folders ────────────────────────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    const res = await fetch('/api/folders');
    const data = await res.json();
    setFolders(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  // ── Load files ──────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (view === 'search') return;
    setLoading(true);
    const archived = view === 'archive';
    let url = `/api/files?archived=${archived}`;
    if (!archived) {
      if (activeFolder) url += `&folder_id=${activeFolder}`;
      else if (view === 'vault') url += `&folder_id=null`;
    }
    const res = await fetch(url);
    const data = await res.json();
    setFiles(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [view, activeFolder]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // ── Folder ops ──────────────────────────────────────────────────────────────
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim(), parent_id: newFolderParent }),
    });
    if (res.ok) {
      setNewFolderName('');
      setShowNewFolder(false);
      await loadFolders();
    }
  };

  const deleteFolder = async (id: string) => {
    await fetch('/api/folders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (activeFolder === id) setActiveFolder(null);
    await loadFolders();
    loadFiles();
  };

  const renameFolder = async (id: string, name: string) => {
    if (!name.trim()) return;
    await fetch('/api/folders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    });
    await loadFolders();
  };

  // ── File ops ─────────────────────────────────────────────────────────────────
  const handleUploaded = (f: VaultFile) => {
    setFiles(prev => [f, ...prev]);
    loadFolders(); // refresh counts
  };

  const handleUpdate = (updated: VaultFile) => {
    setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
    if (view === 'search') {
      setSearchResults(prev => prev.map(f => f.id === updated.id ? updated : f));
    }
  };

  const handleDelete = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setSearchResults(prev => prev.filter(f => f.id !== id));
    loadFolders();
  };

  // ── Derived label ─────────────────────────────────────────────────────────────
  const activeLabel =
    view === 'archive' ? 'Archive'
    : view === 'search' ? `Search: "${searchQuery}"`
    : activeFolder ? (folders.find(f => f.id === activeFolder)?.name ?? 'Folder')
    : 'All Files (Root)';

  const displayFiles = view === 'search' ? searchResults : files;

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="sidebar w-[220px] shrink-0 flex flex-col h-full overflow-y-auto">

        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/7">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.85), rgba(99,102,241,0.80))',
                boxShadow: '0 0 16px rgba(59,130,246,0.3), inset 0 1px 0 rgba(255,255,255,0.18)',
              }}>
              SV
            </div>
            <div>
              <p className="text-[12px] font-semibold text-slate-100 leading-tight">Source Vault</p>
              <p className="text-[10px] text-slate-500">Document Storage</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="px-3 py-3 border-b border-white/7 space-y-0.5">
          {[
            { key: 'vault', label: 'All Files' },
            { key: 'archive', label: 'Archive' },
          ].map(item => (
            <button key={item.key}
              onClick={() => { setView(item.key as View); setActiveFolder(null); }}
              className={`folder-item w-full text-left text-xs px-3 py-2 ${view === item.key && !activeFolder ? 'active' : ''}`}>
              {item.label}
            </button>
          ))}
        </div>

        {/* Folders */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Folders</span>
            <button
              onClick={() => { setNewFolderParent(undefined); setShowNewFolder(true); }}
              className="text-[10px] text-slate-500 hover:text-blue-400 transition-colors px-1.5 py-0.5 rounded"
            >+ New</button>
          </div>

          {showNewFolder && (
            <div className="mb-2 flex gap-1.5">
              <input
                autoFocus
                className="vault-input flex-1 text-xs px-2.5 py-1.5"
                placeholder="Folder name…"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createFolder();
                  if (e.key === 'Escape') setShowNewFolder(false);
                }}
              />
              <button onClick={createFolder} className="btn-primary text-[10px] px-2.5 py-1.5">✓</button>
            </div>
          )}

          <FolderTree
            folders={folders}
            activeFolder={activeFolder}
            onSelect={(id) => { setView('vault'); setActiveFolder(id); }}
            onNew={(parentId) => { setNewFolderParent(parentId); setShowNewFolder(true); }}
            onDelete={deleteFolder}
            onRename={renameFolder}
          />

          {folders.length === 0 && (
            <p className="text-[10px] text-slate-700 text-center py-4">No folders yet</p>
          )}
        </div>

        {/* Stats */}
        <div className="px-4 py-3 border-t border-white/7">
          <p className="text-[10px] text-slate-700">{folders.length} folders · {files.length} files shown</p>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">

        {/* Top bar */}
        <div className="px-6 py-4 border-b border-white/7 flex items-center gap-4 shrink-0"
          style={{ background: 'rgba(5,9,20,0.60)', backdropFilter: 'blur(20px)' }}>
          <div className="flex-1">
            <SearchBar
              onResults={(results, q) => {
                setSearchResults(results);
                setSearchQuery(q);
                setView('search');
              }}
              onClear={() => {
                setView('vault');
                setSearchQuery('');
              }}
            />
          </div>
          <button
            onClick={() => setShowDrop(!showDrop)}
            className="btn-primary text-sm px-4 py-2.5 shrink-0 whitespace-nowrap"
          >
            {showDrop ? '× Close' : '+ Upload Files'}
          </button>
        </div>

        {/* Upload drop zone */}
        {showDrop && (
          <div className="px-6 py-4 border-b border-white/7 shrink-0"
            style={{ background: 'rgba(5,9,20,0.40)' }}>
            <DropZone
              folderId={activeFolder}
              onUploaded={(f) => { handleUploaded(f); setShowDrop(false); }}
            />
            {activeFolder && (
              <p className="text-[10px] text-slate-600 mt-2">
                Uploading to: <span className="text-slate-400">{folders.find(f => f.id === activeFolder)?.name}</span>
              </p>
            )}
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">{activeLabel}</h2>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {view === 'search'
                  ? `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`
                  : `${files.length} file${files.length !== 1 ? 's' : ''}`
                }
              </p>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="gc-sm h-16 animate-pulse" style={{ opacity: 1 - i * 0.18 }} />
              ))}
            </div>
          ) : displayFiles.length === 0 ? (
            <EmptyState view={view} searchQuery={searchQuery} onUpload={() => setShowDrop(true)} />
          ) : (
            <div className="space-y-2.5">
              {displayFiles.map(f => (
                <FileCard
                  key={f.id}
                  file={f}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  searchMode={view === 'search'}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ view, searchQuery, onUpload }: { view: View; searchQuery: string; onUpload: () => void }) {
  if (view === 'search') {
    return (
      <div className="gc text-center py-14 px-8 relative overflow-hidden">
        <div className="shimmer-top" />
        <p className="text-slate-300 font-semibold mb-1">No results for &ldquo;{searchQuery}&rdquo;</p>
        <p className="text-slate-600 text-sm mt-1">
          Try different words, or check the filename, notes, or folder name.
        </p>
      </div>
    );
  }
  if (view === 'archive') {
    return (
      <div className="gc text-center py-14 px-8 relative overflow-hidden">
        <div className="shimmer-top" />
        <p className="text-slate-500 text-sm">Archive is empty.</p>
      </div>
    );
  }
  return (
    <div className="gc text-center py-14 px-8 relative overflow-hidden">
      <div className="shimmer-top" />
      <p className="text-slate-300 font-semibold mb-1.5">No files here yet</p>
      <p className="text-slate-600 text-sm mb-5">Drop files here or click Upload to add your first document.</p>
      <button onClick={onUpload} className="btn-primary text-sm px-5 py-2.5">
        + Upload Files
      </button>
    </div>
  );
}
