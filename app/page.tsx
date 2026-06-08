'use client';
import { useState, useEffect, useCallback } from 'react';
import SearchBar from '@/components/vault/SearchBar';
import DropZone from '@/components/vault/DropZone';
import FileCard, { type VaultFile } from '@/components/vault/FileCard';
import FilePreviewModal from '@/components/vault/FilePreviewModal';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
  file_count: number;
}

type NavView = 'all' | 'archive';

// ── helpers ────────────────────────────────────────────────────────────────
function FolderIcon({ color }: { color: string }) {
  return (
    <svg width="13" height="12" viewBox="0 0 20 16" fill="none">
      <path d="M2 3C2 1.9 2.9 1 4 1H7.586a1 1 0 0 1 .707.293L9.414 2.4A1 1 0 0 0 10.121 2.7H16C17.1 2.7 18 3.6 18 4.7V13C18 14.1 17.1 15 16 15H4C2.9 15 2 14.1 2 13V3Z"
        fill={color} fillOpacity="0.45" stroke={color} strokeWidth="1.2" strokeOpacity="0.9" />
    </svg>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Home() {
  const [folders, setFolders]       = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [navView, setNavView]       = useState<NavView>('all');
  const [files, setFiles]           = useState<VaultFile[]>([]);
  const [loading, setLoading]       = useState(false);
  const [searchResults, setSearchResults] = useState<VaultFile[]>([]);
  const [searchQuery, setSearchQuery]     = useState('');
  const [isSearching, setIsSearching]     = useState(false);
  const [selectedFile, setSelectedFile]   = useState<VaultFile | null>(null);
  const [showUpload, setShowUpload]       = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // ── Load folders ──────────────────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    const res = await fetch('/api/folders');
    setFolders(Array.isArray(await res.json()) ? await res.clone().json() : []);
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  // ── Load files ────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (isSearching) return;
    setLoading(true);
    const archived = navView === 'archive';
    let url = `/api/files?archived=${archived}`;
    if (!archived) {
      url += activeFolder ? `&folder_id=${activeFolder}` : `&folder_id=null`;
    }
    try {
      const res = await fetch(url);
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch { setFiles([]); }
    setLoading(false);
  }, [isSearching, navView, activeFolder]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // Reload folders after any file-count-changing action
  const reloadFolderCounts = useCallback(async () => {
    const res = await fetch('/api/folders');
    const data = await res.json();
    setFolders(Array.isArray(data) ? data : []);
  }, []);

  // ── Folder ops ────────────────────────────────────────────────────────
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    await fetch('/api/folders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim() }),
    });
    setNewFolderName(''); setShowNewFolder(false);
    loadFolders();
  };

  const deleteFolder = async (id: string) => {
    if (!confirm('Delete this folder? Files inside will be moved to root.')) return;
    await fetch('/api/folders', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    if (activeFolder === id) setActiveFolder(null);
    loadFolders(); loadFiles();
  };

  // ── File ops ──────────────────────────────────────────────────────────
  const handleUploaded = (f: VaultFile) => {
    setFiles(prev => [f, ...prev]);
    reloadFolderCounts();
    setShowUpload(false);
  };

  const handleUpdate = (updated: VaultFile) => {
    setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
    setSearchResults(prev => prev.map(f => f.id === updated.id ? updated : f));
    if (selectedFile?.id === updated.id) setSelectedFile(updated);
  };

  const handleDelete = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setSearchResults(prev => prev.filter(f => f.id !== id));
    if (selectedFile?.id === id) setSelectedFile(null);
    reloadFolderCounts();
  };

  const displayFiles = isSearching ? searchResults : files;

  // ── Root folders only for pills ──────────────────────────────────────
  const rootFolders = folders.filter(f => !f.parent_id);

  return (
    <div className="relative z-10 flex flex-col h-screen overflow-hidden">
      <div className="vault-ambient" />

      {/* ── TOP HEADER ─────────────────────────────────────────────────── */}
      <header className="relative z-20 shrink-0 px-6 pt-5 pb-4"
        style={{ background: 'linear-gradient(180deg, rgba(6,8,15,0.95) 0%, rgba(6,8,15,0.75) 100%)', backdropFilter: 'blur(24px)' }}>

        {/* Logo + top nav */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-[11px] shrink-0 relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(99,102,241,0.85))',
                boxShadow: '0 0 20px rgba(59,130,246,0.40), inset 0 1px 0 rgba(255,255,255,0.22)',
              }}>
              <div className="shim" />
              SV
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white leading-tight tracking-tight">Source Vault</p>
              <p className="text-[10px] text-slate-600">Document Storage & Search</p>
            </div>
          </div>

          {/* Nav + upload */}
          <div className="flex items-center gap-2">
            {(['all','archive'] as NavView[]).map(v => (
              <button key={v} onClick={() => { setNavView(v); setIsSearching(false); setActiveFolder(null); }}
                className={`nav-item capitalize ${navView === v && !isSearching ? 'active' : ''}`}>
                {v === 'all' ? 'All Files' : 'Archive'}
              </button>
            ))}
            <div className="w-px h-5 bg-white/10 mx-1" />
            <button onClick={() => setShowUpload(!showUpload)}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
              {showUpload ? '× Close' : (
                <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>Upload</>
              )}
            </button>
          </div>
        </div>

        {/* ── SEARCH HERO ─────────────────────────────────────────────── */}
        <SearchBar
          onResults={(results, q) => { setSearchResults(results); setSearchQuery(q); setIsSearching(true); }}
          onClear={() => { setIsSearching(false); setSearchQuery(''); }}
        />

        {/* ── FOLDER PILLS ────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {/* "All" pill */}
          <button
            onClick={() => { setActiveFolder(null); setNavView('all'); setIsSearching(false); }}
            className={`folder-pill ${!activeFolder && !isSearching && navView==='all' ? 'active' : ''}`}>
            All
          </button>

          {rootFolders.map(folder => (
            <button key={folder.id}
              onClick={() => { setActiveFolder(folder.id); setNavView('all'); setIsSearching(false); }}
              className={`folder-pill flex items-center gap-1.5 ${activeFolder === folder.id ? 'active' : ''}`}>
              <FolderIcon color={folder.color} />
              {folder.name}
              {folder.file_count > 0 && (
                <span className="text-[9px] opacity-60 ml-0.5">{folder.file_count}</span>
              )}
            </button>
          ))}

          {/* New folder pill */}
          {showNewFolder ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <input autoFocus
                className="bg-white/7 border border-white/15 rounded-full px-3 py-1 text-xs text-slate-200 outline-none focus:border-blue-400/40 w-36"
                placeholder="Folder name…"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter') createFolder(); if (e.key==='Escape') setShowNewFolder(false); }}
              />
              <button onClick={createFolder} className="folder-pill active text-[11px] px-3">✓</button>
            </div>
          ) : (
            <button onClick={() => setShowNewFolder(true)}
              className="folder-pill text-slate-600 hover:text-blue-400 shrink-0">
              + New Folder
            </button>
          )}
        </div>
      </header>

      {/* ── UPLOAD DRAWER ────────────────────────────────────────────────── */}
      {showUpload && (
        <div className="relative z-20 shrink-0 px-6 pb-4 pt-2"
          style={{ background: 'rgba(6,8,15,0.6)', backdropFilter: 'blur(12px)' }}>
          <DropZone folderId={activeFolder} onUploaded={handleUploaded} onClose={() => setShowUpload(false)} />
          {activeFolder && (
            <p className="text-[10px] text-slate-600 mt-2 pl-1">
              Uploading into: <span className="text-slate-400">{folders.find(f=>f.id===activeFolder)?.name}</span>
            </p>
          )}
        </div>
      )}

      {/* ── MAIN CONTENT AREA ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── FILE LIST ───────────────────────────────────────────────── */}
        <div className={`flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-300 ${selectedFile ? 'max-w-[56%]' : ''}`}>

          {/* Section label */}
          <div className="px-6 py-3 shrink-0 flex items-center justify-between border-b border-white/5">
            <div>
              <span className="text-xs font-semibold text-slate-300">
                {isSearching ? `Results for "${searchQuery}"` : activeFolder ? folders.find(f=>f.id===activeFolder)?.name : navView === 'archive' ? 'Archive' : 'All Files'}
              </span>
              <span className="text-[10px] text-slate-600 ml-2">
                {displayFiles.length} {displayFiles.length === 1 ? 'file' : 'files'}
              </span>
            </div>
            {selectedFile && (
              <button onClick={() => setSelectedFile(null)}
                className="text-[10px] text-slate-600 hover:text-slate-300 transition-colors">
                Close preview ×
              </button>
            )}
          </div>

          {/* Files */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5">
            {loading ? (
              [...Array(6)].map((_,i) => (
                <div key={i} className="glass-card h-16 animate-pulse" style={{ opacity: 1 - i*0.15 }} />
              ))
            ) : displayFiles.length === 0 ? (
              <EmptyState isSearching={isSearching} searchQuery={searchQuery} navView={navView}
                onUpload={() => setShowUpload(true)} />
            ) : (
              displayFiles.map(f => (
                <FileCard
                  key={f.id}
                  file={f}
                  selected={selectedFile?.id === f.id}
                  onSelect={setSelectedFile}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  searchMode={isSearching}
                />
              ))
            )}
          </div>
        </div>

        {/* ── PREVIEW PANE ────────────────────────────────────────────── */}
        {selectedFile && (
          <PreviewPane
            file={selectedFile}
            onClose={() => setSelectedFile(null)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ── Preview Pane (right side) ──────────────────────────────────────────────
function PreviewPane({ file, onClose, onUpdate, onDelete }: {
  file: VaultFile;
  onClose: () => void;
  onUpdate: (f: VaultFile) => void;
  onDelete: (id: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState(file.notes || '');

  useEffect(() => {
    setUrl(null); setEditNotes(false); setNotes(file.notes || '');
    fetch(`/api/preview?id=${file.id}`).then(r=>r.json()).then(d=>setUrl(d.url));
  }, [file.id, file.notes]);

  const isImage = ['png','jpg','jpeg'].includes(file.file_type);
  const isPdf   = file.file_type === 'pdf';
  const isText  = ['txt','csv','html','htm'].includes(file.file_type);

  const saveNotes = async () => {
    const res = await fetch('/api/files', { method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: file.id, notes }) });
    if (res.ok) { const u = await res.json(); onUpdate({ ...file, notes: u.notes }); }
    setEditNotes(false);
  };

  const del = async () => {
    if (!confirm(`Permanently delete "${file.name}"?`)) return;
    await fetch('/api/files', { method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: file.id }) });
    onDelete(file.id);
  };

  const { typeClass, formatSize, formatDate } = require('@/components/vault/FileCard');

  return (
    <>
      <div className="preview-pane flex flex-col border-l border-white/7 overflow-hidden" style={{ width: '44%', minWidth: 320 }}>
        {/* Pane header */}
        <div className="px-5 py-4 border-b border-white/7 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate leading-snug">{file.name}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{file.original_name}</p>
            </div>
            <button onClick={onClose} className="btn-ghost w-7 h-7 flex items-center justify-center text-sm shrink-0">×</button>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={`tbadge ${typeClass(file.file_type)}`}>{file.file_type.toUpperCase()}</span>
            <span className="text-[10px] text-slate-600">{formatSize(file.size_bytes)}</span>
            <span className="text-[10px] text-slate-600">{formatDate(file.upload_date)}</span>
          </div>

          {/* Action row */}
          <div className="flex gap-2 mt-3">
            {url && (
              <a href={url} download={file.original_name}
                className="btn-primary text-[11px] px-3 py-1.5 flex items-center gap-1.5">↓ Download</a>
            )}
            <button onClick={() => setShowFull(true)}
              className="btn-ghost text-[11px] px-3 py-1.5">⛶ Full view</button>
            <button onClick={del}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">Delete</button>
          </div>
        </div>

        {/* Document preview */}
        <div className="flex-1 overflow-auto min-h-0 relative">
          {!url ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={file.name}
                className="max-w-full rounded-xl object-contain shadow-2xl cursor-zoom-in"
                onClick={() => setShowFull(true)} />
            </div>
          ) : isPdf ? (
            <iframe src={url} className="w-full h-full" style={{ minHeight: 500, border: 'none', background: '#11131f' }} title={file.name} />
          ) : isText ? (
            <InlineText url={url} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-4 px-6 text-center">
              <div className="text-5xl opacity-30">📄</div>
              <p className="text-slate-400 text-sm">No preview for .{file.file_type}</p>
              {url && (
                <a href={url} download={file.original_name} className="btn-primary text-sm px-4 py-2">Download</a>
              )}
            </div>
          )}
        </div>

        {/* Notes section */}
        <div className="px-5 py-4 border-t border-white/7 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Notes</span>
            {!editNotes && (
              <button onClick={() => setEditNotes(true)}
                className="text-[10px] text-slate-600 hover:text-blue-400 transition-colors">
                {file.notes ? 'Edit' : '+ Add'}
              </button>
            )}
          </div>
          {editNotes ? (
            <div className="space-y-2">
              <textarea
                autoFocus rows={3}
                className="w-full bg-white/6 border border-white/12 rounded-xl px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500/40 resize-none"
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Add context, descriptions, or tags for this file…"
              />
              <div className="flex gap-2">
                <button onClick={saveNotes} className="btn-primary text-xs px-3 py-1.5">Save</button>
                <button onClick={() => setEditNotes(false)} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed cursor-pointer hover:text-slate-300 transition-colors"
              onClick={() => setEditNotes(true)}>
              {file.notes || <span className="italic opacity-50">No notes yet</span>}
            </p>
          )}

          {/* Tags */}
          {file.tags?.length > 0 && (
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {file.tags.map(tag => (
                <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full-screen modal */}
      {showFull && <FilePreviewModal file={file} onClose={() => setShowFull(false)} />}
    </>
  );
}

function InlineText({ url }: { url: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (url.startsWith('data:')) { try { setText(atob(url.split(',')[1])); } catch { setText(''); } }
    else fetch(url).then(r=>r.text()).then(setText).catch(()=>{});
  }, [url]);
  return (
    <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono p-5 overflow-auto h-full">
      {text || <span className="text-slate-600 animate-pulse">Loading…</span>}
    </pre>
  );
}

function EmptyState({ isSearching, searchQuery, navView, onUpload }:
  { isSearching: boolean; searchQuery: string; navView: string; onUpload: () => void }) {
  if (isSearching) return (
    <div className="glass-card text-center py-16 px-8 relative overflow-hidden">
      <div className="shim" />
      <p className="text-slate-300 font-semibold">No results for &ldquo;{searchQuery}&rdquo;</p>
      <p className="text-slate-600 text-sm mt-2">Try different words — search covers filenames, content, notes, and tags.</p>
    </div>
  );
  if (navView === 'archive') return (
    <div className="glass-card text-center py-14 relative overflow-hidden">
      <div className="shim" />
      <p className="text-slate-600 text-sm">Archive is empty.</p>
    </div>
  );
  return (
    <div className="glass-card text-center py-16 px-8 relative overflow-hidden">
      <div className="shim" />
      <div className="w-14 h-14 glass-card mx-auto mb-4 flex items-center justify-center rounded-2xl">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <p className="text-slate-300 font-semibold mb-1.5">No files here yet</p>
      <p className="text-slate-600 text-sm mb-6">Upload your first document to get started.</p>
      <button onClick={onUpload} className="btn-primary text-sm px-6 py-2.5">+ Upload Files</button>
    </div>
  );
}
