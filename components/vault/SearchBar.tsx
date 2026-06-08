'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { VaultFile } from './FileCard';

interface Props {
  onResults: (results: VaultFile[], query: string) => void;
  onClear: () => void;
}

export default function SearchBar({ onResults, onClear }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="search-hero flex items-center gap-3 px-5 py-3.5 relative">
      <div className="shim" />
      {/* Icon */}
      <div className="shrink-0">
        {loading ? (
          <div className="w-5 h-5 border-2 border-blue-400/70 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.6)" strokeWidth="1.8">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        )}
      </div>

      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder='Search your vault — "Florida dental pricing", "Q4 contracts", "provider screenshots"…'
        style={{ fontSize: 15 }}
      />

      {q && (
        <button onClick={() => { setQ(''); onClear(); }}
          className="shrink-0 w-6 h-6 rounded-full bg-white/10 hover:bg-white/16 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center text-sm leading-none">
          ×
        </button>
      )}

      {/* Keyboard hint */}
      {!q && (
        <div className="shrink-0 hidden sm:flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/6 border border-white/10 text-slate-600 font-mono">⌘K</span>
        </div>
      )}
    </div>
  );
}
