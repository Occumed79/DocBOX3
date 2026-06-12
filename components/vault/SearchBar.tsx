'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { VaultFile } from './FileCard';

const QUICK_SEARCHES = [
  'Florida dental pricing',
  'Q4 contracts',
  'Provider screenshots',
];

interface Props {
  onResults: (results: VaultFile[], query: string) => void;
  onClear: () => void;
}

export default function SearchBar({ onResults, onClear }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
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
    <div className="space-y-2.5">
      <div className={`search-hero flex items-center gap-3 px-5 py-3.5 relative ${focused ? 'ring-2 ring-blue-500/20' : ''}`}>
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
          ref={inputRef}
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder='Search your vault — "Florida dental pricing", "Q4 contracts", "provider screenshots"…'
          style={{ fontSize: 15 }}
        />

        {q ? (
          <button onClick={() => { setQ(''); onClear(); }}
            className="shrink-0 w-6 h-6 rounded-full bg-white/10 hover:bg-white/16 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center text-sm leading-none">
            ×
          </button>
        ) : (
          <div className="shrink-0 hidden sm:flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/6 border border-white/10 text-slate-600 font-mono">⌘K</span>
          </div>
        )}
      </div>

      {/* Quick search chips */}
      {!q && (
        <div className="flex items-center gap-2 px-1 flex-wrap">
          <span className="text-[10px] text-slate-600 hidden sm:inline">Try:</span>
          {QUICK_SEARCHES.map(text => (
            <button
              key={text}
              onClick={() => runQuick(text)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-500 hover:text-blue-300 hover:border-blue-500/25 hover:bg-blue-500/10 transition-all"
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
