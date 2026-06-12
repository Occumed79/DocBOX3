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
          <div className="section-bar px-6 py-3 shrink-0 flex items-center justify-between">
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
                onUpload={() => setShowUpload(true)} onCreateFolder={() => setShowNewFolder(true)} />
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
        {/* Document Review header */}
        <div className="px-5 py-3.5 border-b border-white/7 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(147,197,253,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300/80">Document Review</span>
          </div>
          <button onClick={onClose} className="btn-ghost w-7 h-7 flex items-center justify-center text-sm shrink-0">×</button>
        </div>

        {/* Pane header */}
        <div className="px-5 py-4 border-b border-white/7 shrink-0">
          <div className="min-w-0 mb-2">
            <p className="text-sm font-semibold text-slate-100 truncate leading-snug">{file.name}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{file.original_name}</p>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap">
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

        {/* Scrollable review content */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 p-4">
          {/* Document preview */}
          <div className="relative">
            {!url ? (
              <div className="flex items-center justify-center h-40 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : isImage ? (
              <div className="flex items-center justify-center p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={file.name}
                  className="max-w-full rounded-lg object-contain shadow-xl cursor-zoom-in"
                  onClick={() => setShowFull(true)} />
              </div>
            ) : isPdf ? (
              <iframe src={url} className="w-full rounded-xl" style={{ height: 320, border: 'none', background: '#11131f' }} title={file.name} />
            ) : isText ? (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                <InlineText url={url} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-4 px-6 text-center rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="text-4xl opacity-30">📄</div>
                <p className="text-slate-400 text-sm">No preview for .{file.file_type}</p>
                {url && (
                  <a href={url} download={file.original_name} className="btn-primary text-sm px-4 py-2">Download</a>
                )}
              </div>
            )}
          </div>

          {/* AI Summary placeholder */}
          <div className="review-section">
            <div className="review-section-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.5 12"/><path d="M12 12V2.5"/>
              </svg>
              AI Summary
            </div>
            <div className="review-placeholder">
              <p className="review-placeholder-text">AI-generated summaries will appear here once backend extraction is enabled.</p>
            </div>
          </div>

          {/* Extracted Text placeholder */}
          <div className="review-section">
            <div className="review-section-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
              </svg>
              Extracted Text
            </div>
            <div className="review-placeholder">
              <p className="review-placeholder-text">Full-text extraction from PDFs and images will be searchable here.</p>
            </div>
          </div>

          {/* Tags */}
          <div className="review-section">
            <div className="review-section-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
              Tags
            </div>
            {file.tags?.length > 0 ? (
              <div className="flex gap-1.5 flex-wrap">
                {file.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">No tags yet</p>
            )}
          </div>

          {/* Metadata */}
          <div className="review-section">
            <div className="review-section-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
              Metadata
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Type</p>
                <p className="text-xs text-slate-300">{file.file_type.toUpperCase()}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Size</p>
                <p className="text-xs text-slate-300">{formatSize(file.size_bytes)}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Uploaded</p>
                <p className="text-xs text-slate-300">{formatDate(file.upload_date)}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Source</p>
                <p className="text-xs text-slate-300 truncate">{file.original_name}</p>
              </div>
            </div>
          </div>

          {/* Source Notes */}
          <div className="review-section">
            <div className="flex items-center justify-between mb-2">
              <div className="review-section-title !mb-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Source Notes
              </div>
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
                  placeholder="Add context, descriptions, or source notes for this file…"
                />
                <div className="flex gap-2">
                  <button onClick={saveNotes} className="btn-primary text-xs px-3 py-1.5">Save</button>
                  <button onClick={() => setEditNotes(false)} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => setEditNotes(true)}>
                {file.notes || <span className="italic opacity-50">No source notes yet. Click to add research context.</span>}
              </p>
            )}
          </div>
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

function EmptyState({ isSearching, searchQuery, navView, onUpload, onCreateFolder }:
  { isSearching: boolean; searchQuery: string; navView: string; onUpload: () => void; onCreateFolder: () => void }) {
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
    <div className="fade-up">
      {/* Hero empty state */}
      <div className="empty-hero text-center py-12 px-8 mb-6">
        <div className="shim" />
        <div className="relative z-10 max-w-lg mx-auto">
          <div className="w-16 h-16 mx-auto mb-5 flex items-center justify-center rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(99,102,241,0.14))',
              border: '1px solid rgba(96,165,250,0.25)',
              boxShadow: '0 0 24px rgba(59,130,246,0.15)'
            }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(147,197,253,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2 tracking-tight">Build your searchable source vault</h2>
          <p className="text-sm text-slate-500 leading-relaxed mb-6 max-w-md mx-auto">
            Upload PDFs, screenshots, notes, fee schedules, contracts, and research files. Source Vault will organize them for fast search and review.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={onUpload} className="btn-primary text-sm px-6 py-2.5">Upload Files</button>
            <button onClick={onCreateFolder}
              className="text-sm px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/8 hover:border-white/15 transition-all">
              Create Folder
            </button>
          </div>
        </div>
      </div>

      {/* Onboarding cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="onboarding-card">
          <div className="card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(147,197,253,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Upload documents</h3>
          <p className="text-xs text-slate-500 leading-relaxed">Drag and drop PDFs, images, spreadsheets, and text files into organized folders.</p>
        </div>

        <div className="onboarding-card">
          <div className="card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(147,197,253,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/>
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Extract searchable content</h3>
          <p className="text-xs text-slate-500 leading-relaxed">Search inside documents by content, filename, tags, and your own source notes.</p>
        </div>

        <div className="onboarding-card">
          <div className="card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(147,197,253,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Review summaries, tags, and source notes</h3>
          <p className="text-xs text-slate-500 leading-relaxed">Add context, labels, and metadata so your research stays organized and reusable.</p>
        </div>
      </div>
    </div>
  );
}
