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
    debounceRef.current = setTimeout(() => search(q), 420);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, search, onClear]);

  return (
    <div className="relative flex items-center gap-3">
      {/* Icon */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
        {loading ? (
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        )}
      </div>

      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder='Search your vault — e.g. "Florida dental pricing PDF"'
        className="vault-input w-full pl-11 pr-10 py-3 text-sm"
        style={{ borderRadius: 14, fontSize: 14 }}
      />

      {q && (
        <button
          onClick={() => { setQ(''); onClear(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 text-lg leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}
