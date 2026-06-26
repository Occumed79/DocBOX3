'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import SearchBar from '@/components/vault/SearchBar';
import DropZone from '@/components/vault/DropZone';
import FileCard, { type VaultFile, typeClass, formatSize, formatDate } from '@/components/vault/FileCard';
import FilePreviewModal from '@/components/vault/FilePreviewModal';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
  file_count: number;
}

type NavView = 'all' | 'archive';

function FolderIcon({ color }: { color: string }) {
  return (
    <svg width="13" height="12" viewBox="0 0 20 16" fill="none">
      <path d="M2 3C2 1.9 2.9 1 4 1H7.586a1 1 0 0 1 .707.293L9.414 2.4A1 1 0 0 0 10.121 2.7H16C17.1 2.7 18 3.6 18 4.7V13C18 14.1 17.1 15 16 15H4C2.9 15 2 14.1 2 13V3Z"
        fill={color} fillOpacity="0.45" stroke={color} strokeWidth="1.2" strokeOpacity="0.9" />
    </svg>
  );
}

export default function Home() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [navView, setNavView] = useState<NavView>('all');
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<VaultFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const list = document.querySelector('.file-list-scroll') as HTMLElement | null;
    const scrollEl = list || window;

    const onScroll = () => {
      const y = list ? list.scrollTop : window.scrollY;
      const max = list ? (list.scrollHeight - list.clientHeight) : (document.documentElement.scrollHeight - window.innerHeight);
      const progress = max > 0 ? y / max : 0;
      root.style.setProperty('--scroll-progress', Math.min(progress, 1).toString());
      root.style.setProperty('--scroll-y', String(y));
      document.body.classList.add('is-scrolling');
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => document.body.classList.remove('is-scrolling'), 180);
    };

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('revealed');
      });
    }, { threshold: 0.12, root: document.querySelector('.file-list-scroll') });

    document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [files, searchResults, isSearching, showUpload]);

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/folders');
      const data = await res.json();
      setFolders(Array.isArray(data) ? data : []);
    } catch {
      setFolders([]);
    }
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  const loadFiles = useCallback(async () => {
    if (isSearching) return;
    setLoading(true);
    const archived = navView === 'archive';
    let url = `/api/files?archived=${archived}`;
    if (!archived) url += activeFolder ? `&folder_id=${activeFolder}` : `&folder_id=null`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      setFiles([]);
    }
    setLoading(false);
  }, [isSearching, navView, activeFolder]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const reloadFolderCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/folders');
      const data = await res.json();
      setFolders(Array.isArray(data) ? data : []);
    } catch {
      setFolders([]);
    }
  }, []);

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    await fetch('/api/folders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim() }),
    });
    setNewFolderName('');
    setShowNewFolder(false);
    loadFolders();
  };

  const deleteFolder = async (id: string) => {
    if (!confirm('Delete this folder? Files inside will be moved to root.')) return;
    await fetch('/api/folders', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    if (activeFolder === id) setActiveFolder(null);
    loadFolders();
    loadFiles();
  };

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
  const rootFolders = folders.filter(f => !f.parent_id);
  const sectionTitle = isSearching
    ? `Results for "${searchQuery}"`
    : activeFolder
      ? folders.find(f => f.id === activeFolder)?.name ?? 'Folder'
      : navView === 'archive'
        ? 'Archive'
        : 'All Files';

  return (
    <div className="relative z-10 flex h-screen flex-col overflow-hidden px-4 pb-4">
      <div className="scroll-progress" />

      <header className="relative z-30 shrink-0 px-2 pb-5 pt-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center">
          <div className="floating-command-bar mb-6">
            <div className="shim" />
            <div className="relative z-10 flex items-center gap-2">
              <div className="flex items-center gap-2.5 pl-2 pr-3">
                <div className="logo-mark flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[10px] font-bold text-white">
                  <div className="shim" />
                  <span className="relative z-10">SV</span>
                </div>
                <div className="leading-tight">
                  <p className="text-[13px] font-semibold tracking-tight text-white">Source Vault</p>
                  <p className="text-[10px] text-slate-400/70">File sharing workspace</p>
                </div>
              </div>

              <div className="mx-1 h-5 w-px bg-white/10" />

              {(['all','archive'] as NavView[]).map(v => (
                <button key={v} onClick={() => { setNavView(v); setIsSearching(false); setActiveFolder(null); }}
                  className={`nav-item capitalize ${navView === v && !isSearching ? 'active' : ''}`}>
                  {v === 'all' ? 'All Files' : 'Archive'}
                </button>
              ))}

              <button onClick={() => setShowUpload(!showUpload)}
                className="btn-primary ml-1 flex items-center gap-1.5 px-4 py-2 text-[11px]">
                {showUpload ? 'Close' : (
                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Upload</>
                )}
              </button>
            </div>
          </div>

          <div className="apple-hero-card fade-up">
            <div className="apple-eyebrow">Liquid glass file vault</div>
            <h1 className="apple-title">Files that feel effortless.</h1>
            <p className="apple-subtitle">Upload, preview, search, organize, and share documents from a luminous workspace designed to stay calm even when the file pile gets messy.</p>
          </div>

          <div className="w-full max-w-3xl fade-up stagger-2">
            <SearchBar
              onResults={(results, q) => { setSearchResults(results); setSearchQuery(q); setIsSearching(true); }}
              onClear={() => { setIsSearching(false); setSearchQuery(''); }}
            />
          </div>

          <div className="mt-5 flex max-w-full items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <button onClick={() => { setActiveFolder(null); setNavView('all'); setIsSearching(false); }}
              className={`folder-pill ${!activeFolder && !isSearching && navView === 'all' ? 'active' : ''}`}>
              All
            </button>

            {rootFolders.map(folder => (
              <button key={folder.id}
                onClick={() => { setActiveFolder(folder.id); setNavView('all'); setIsSearching(false); }}
                className={`folder-pill flex items-center gap-1.5 ${activeFolder === folder.id ? 'active' : ''}`}>
                <FolderIcon color={folder.color} />
                {folder.name}
                {folder.file_count > 0 && <span className="ml-0.5 text-[9px] opacity-70">{folder.file_count}</span>}
              </button>
            ))}

            {showNewFolder ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <input autoFocus
                  className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] text-slate-200 outline-none focus:border-sky-300/40"
                  placeholder="Folder name…"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
                />
                <button onClick={createFolder} className="folder-pill active px-2.5 text-[10px]">Create</button>
              </div>
            ) : (
              <button onClick={() => setShowNewFolder(true)} className="folder-pill shrink-0 text-slate-400 hover:text-white">+ New Folder</button>
            )}
          </div>
        </div>
      </header>

      {showUpload && (
        <div className="drawer-enter relative z-20 shrink-0 px-2 pb-4 pt-1">
          <div className="liquid-panel mx-auto max-w-5xl rounded-[30px] px-4 py-4">
            <DropZone folderId={activeFolder} onUploaded={handleUploaded} onClose={() => setShowUpload(false)} />
            {activeFolder && (
              <p className="mt-2 pl-1 text-[10px] text-slate-500">Uploading into: <span className="text-slate-300">{folders.find(f => f.id === activeFolder)?.name}</span></p>
            )}
          </div>
        </div>
      )}

      <div className="content-stage mx-auto flex w-full max-w-7xl flex-1 overflow-hidden">
        <div className={`flex min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300 ${selectedFile ? 'max-w-[56%]' : ''}`}>
          <div className="section-heading flex shrink-0 items-center justify-between px-6 py-4">
            <div>
              <span className="text-sm font-semibold text-white/90">{sectionTitle}</span>
              <span className="ml-2 text-[11px] text-slate-500">{displayFiles.length} {displayFiles.length === 1 ? 'file' : 'files'}</span>
            </div>
            {selectedFile && (
              <button onClick={() => setSelectedFile(null)} className="text-[11px] text-slate-500 transition-colors hover:text-slate-200">Close preview</button>
            )}
          </div>

          <div className="file-list-scroll flex-1 space-y-3 overflow-y-auto px-6 pb-6 pt-2">
            {loading ? (
              [...Array(6)].map((_, i) => <div key={i} className="file-glass-strip h-16 animate-pulse" style={{ opacity: 1 - i * 0.11 }} />)
            ) : displayFiles.length === 0 ? (
              <EmptyState isSearching={isSearching} searchQuery={searchQuery} navView={navView} onUpload={() => setShowUpload(true)} onCreateFolder={() => setShowNewFolder(true)} />
            ) : (
              displayFiles.map((f, i) => (
                <div key={f.id} className={`scroll-reveal stagger-${Math.min((i % 6) + 1, 6)}`}>
                  <FileCard file={f} selected={selectedFile?.id === f.id} onSelect={setSelectedFile} onUpdate={handleUpdate} onDelete={handleDelete} searchMode={isSearching} />
                </div>
              ))
            )}
          </div>
        </div>

        {selectedFile && <PreviewPane file={selectedFile} onClose={() => setSelectedFile(null)} onUpdate={handleUpdate} onDelete={handleDelete} />}
      </div>
    </div>
  );
}

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
    setUrl(null);
    setEditNotes(false);
    setNotes(file.notes || '');
    fetch(`/api/preview?id=${file.id}`).then(r => r.json()).then(d => setUrl(d.url));
  }, [file.id, file.notes]);

  const isImage = ['png','jpg','jpeg'].includes(file.file_type);
  const isPdf = file.file_type === 'pdf';
  const isText = ['txt','csv','html','htm'].includes(file.file_type);

  const saveNotes = async () => {
    const res = await fetch('/api/files', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: file.id, notes }) });
    if (res.ok) {
      const u = await res.json();
      onUpdate({ ...file, notes: u.notes });
    }
    setEditNotes(false);
  };

  const del = async () => {
    if (!confirm(`Permanently delete "${file.name}"?`)) return;
    await fetch('/api/files', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: file.id }) });
    onDelete(file.id);
  };

  return (
    <>
      <div className="preview-pane ml-4 flex flex-col overflow-hidden" style={{ width: '44%', minWidth: 340 }}>
        <div className="shrink-0 border-b border-white/5 px-5 py-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-snug text-white/95">{file.name}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{file.original_name}</p>
            </div>
            <button onClick={onClose} className="btn-ghost flex h-8 w-8 shrink-0 items-center justify-center text-sm">×</button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`tbadge ${typeClass(file.file_type)}`}>{file.file_type.toUpperCase()}</span>
            <span className="text-[10px] text-slate-500">{formatSize(file.size_bytes)}</span>
            <span className="text-[10px] text-slate-500">{formatDate(file.upload_date)}</span>
          </div>

          <div className="flex gap-2">
            {url && <a href={url} download={file.original_name} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-[11px]">Download</a>}
            <button onClick={() => setShowFull(true)} className="btn-ghost px-3 py-1.5 text-[11px]">Full view</button>
            <button onClick={del} className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300 transition-all hover:bg-red-500/20">Delete</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="inspector-card">
            <div className="inspector-card-title">Preview</div>
            {!url ? (
              <div className="flex h-40 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]"><div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" /></div>
            ) : isImage ? (
              <div className="flex items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2">
                <img src={url} alt={file.name} className="max-w-full cursor-zoom-in rounded-xl object-contain shadow-2xl" onClick={() => setShowFull(true)} />
              </div>
            ) : isPdf ? (
              <iframe src={url} className="w-full rounded-2xl" style={{ height: 320, border: 'none', background: '#11131f' }} title={file.name} />
            ) : isText ? (
              <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03]"><InlineText url={url} /></div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-6 py-12 text-center">
                <p className="text-sm text-slate-400">Preview not available for .{file.file_type}</p>
                {url && <a href={url} download={file.original_name} className="btn-primary px-4 py-2 text-sm">Download</a>}
              </div>
            )}
          </div>

          <div className="inspector-card">
            <div className="inspector-card-title">File Details</div>
            <div className="grid grid-cols-2 gap-2">
              <Detail label="Type" value={file.file_type.toUpperCase()} />
              <Detail label="Size" value={formatSize(file.size_bytes)} />
              <Detail label="Uploaded" value={formatDate(file.upload_date)} />
              <Detail label="Folder" value={file.folder_name || 'Root'} />
              <div className="col-span-2"><Detail label="Original name" value={file.original_name} /></div>
            </div>
          </div>

          <div className="inspector-card">
            <div className="inspector-card-title">Tags</div>
            {file.tags?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">{file.tags.map(tag => <span key={tag} className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[10px] text-sky-200">{tag}</span>)}</div>
            ) : <p className="text-xs italic text-slate-500">No tags yet</p>}
          </div>

          <div className="inspector-card">
            <div className="mb-2 flex items-center justify-between">
              <div className="inspector-card-title !mb-0">Notes</div>
              {!editNotes && <button onClick={() => setEditNotes(true)} className="text-[10px] text-slate-500 transition-colors hover:text-sky-300">{file.notes ? 'Edit' : '+ Add'}</button>}
            </div>
            {editNotes ? (
              <div className="space-y-2">
                <textarea autoFocus rows={3} className="w-full resize-none rounded-2xl border border-white/[0.12] bg-white/[0.06] px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-sky-300/40" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes or context for this file…" />
                <div className="flex gap-2"><button onClick={saveNotes} className="btn-primary px-3 py-1.5 text-xs">Save</button><button onClick={() => setEditNotes(false)} className="btn-ghost px-3 py-1.5 text-xs">Cancel</button></div>
              </div>
            ) : (
              <p className="cursor-pointer text-xs leading-relaxed text-slate-500 transition-colors hover:text-slate-300" onClick={() => setEditNotes(true)}>{file.notes || <span className="italic opacity-50">No notes yet. Click to add context.</span>}</p>
            )}
          </div>
        </div>
      </div>
      {showFull && <FilePreviewModal file={file} onClose={() => setShowFull(false)} />}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] px-3 py-2">
      <p className="mb-0.5 text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="truncate text-xs text-slate-300">{value}</p>
    </div>
  );
}

function InlineText({ url }: { url: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (url.startsWith('data:')) {
      try { setText(atob(url.split(',')[1])); } catch { setText(''); }
    } else fetch(url).then(r => r.text()).then(setText).catch(() => {});
  }, [url]);
  return <pre className="h-full overflow-auto whitespace-pre-wrap p-5 font-mono text-xs leading-relaxed text-slate-300">{text || <span className="animate-pulse text-slate-600">Loading…</span>}</pre>;
}

function EmptyState({ isSearching, searchQuery, navView, onUpload, onCreateFolder }:
  { isSearching: boolean; searchQuery: string; navView: string; onUpload: () => void; onCreateFolder: () => void }) {
  if (isSearching) return (
    <div className="empty-hero px-6 py-12 text-center">
      <div className="shim" />
      <p className="relative z-10 text-sm font-semibold text-slate-200">No results for &ldquo;{searchQuery}&rdquo;</p>
      <p className="relative z-10 mt-2 text-xs text-slate-500">Try different words — search covers filenames, content, notes, and tags.</p>
    </div>
  );
  if (navView === 'archive') return <div className="empty-hero px-6 py-12 text-center"><p className="text-xs text-slate-500">Archive is empty.</p></div>;

  return (
    <div className="fade-up">
      <div className="empty-hero scroll-reveal revealed mb-8 px-6 py-16 text-center">
        <div className="shim" />
        <div className="relative z-10 mx-auto max-w-lg">
          <div className="upload-orb mx-auto mb-7 flex h-24 w-24 items-center justify-center rounded-[28px]">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="rgba(191,219,254,0.92)" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h2 className="luminous-text mb-3 text-2xl font-semibold tracking-tight">Your files, organized and ready to share</h2>
          <p className="mx-auto mb-7 max-w-sm text-[13px] leading-relaxed text-slate-400">Upload, preview, search, and share documents from one secure vault.</p>
          <div className="flex items-center justify-center gap-2.5"><button onClick={onUpload} className="btn-primary px-5 py-2 text-xs">Upload Files</button><button onClick={onCreateFolder} className="glass-button px-4 py-2 text-xs">Create Folder</button></div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OnboardingCard title="Upload files" text="Drag and drop PDFs, images, spreadsheets, documents, and text files." icon="upload" delay="stagger-1" />
        <OnboardingCard title="Organize folders" text="Group files into shared folders so everything stays easy to find." icon="folder" delay="stagger-2" />
        <OnboardingCard title="Search and preview" text="Find files instantly by name, content, tags, and notes, then preview in place." icon="search" delay="stagger-3" />
        <OnboardingCard title="Share securely" text="Share files with secure links and keep your team documents in one place." icon="share" delay="stagger-4" />
      </div>
    </div>
  );
}

function OnboardingCard({ title, text, icon, delay }: { title: string; text: string; icon: 'upload' | 'folder' | 'search' | 'share'; delay: string }) {
  const path = icon === 'folder'
    ? <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    : icon === 'search'
      ? <><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></>
      : icon === 'share'
        ? <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></>
        : <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>;

  return (
    <div className={`onboarding-card scroll-reveal ${delay}`}>
      <div className="card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(191,219,254,0.88)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{path}</svg></div>
      <h3 className="mb-1 text-sm font-semibold text-slate-100">{title}</h3>
      <p className="text-[11px] leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}
