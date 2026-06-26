'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { VaultFile } from './FileCard';

const QUICK_SEARCHES = [
  'signed agreement',
  'invoice package',
  'training materials',
  'employee forms',
  'shared packet',
  'reference documents',
];

interface Props {
  onResults: (results: VaultFile[], query: string) => void;
  onClear: () => void;
}

export default function SearchBar({ onResults, onClear }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) { onClear(); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      onResults(Array.isArray(data) ? data : [], query);
    } catch { /* silent */ }
    setLoading(false);
  }, [onResults, onClear]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { onClear(); return; }
    debounceRef.current = setTimeout(() => search(q), 380);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, search, onClear]);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const runQuick = (text: string) => {
    setQ(text);
    search(text);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-3">
      <div className="search-hero flex items-center gap-3.5 px-5 py-3 relative shimmer-surface">
        <div className="shim" />
        {/* Icon */}
        <div className="shrink-0">
          {loading ? (
            <div className="w-4 h-4 border-2 border-blue-400/60 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.55)" strokeWidth="1.8">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder='Search shared files — "signed agreement", "invoice package", "training materials"…'
          style={{ fontSize: 15 }}
        />

        {q ? (
          <button onClick={() => { setQ(''); onClear(); }}
            className="shrink-0 w-5 h-5 rounded-full bg-white/8 hover:bg-white/12 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center text-sm leading-none">
            ×
          </button>
        ) : (
          <div className="shrink-0 hidden sm:flex items-center gap-1">
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8 text-slate-600 font-mono">⌘K</span>
          </div>
        )}
      </div>

      {/* Quick search chips */}
      {!q && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {QUICK_SEARCHES.map(text => (
            <button
              key={text}
              onClick={() => runQuick(text)}
              className="quick-chip text-[10px] px-2.5 py-1 rounded-full"
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
