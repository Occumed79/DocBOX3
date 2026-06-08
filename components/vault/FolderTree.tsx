'use client';
import { useState } from 'react';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
  file_count: number;
}

interface Props {
  folders: Folder[];
  activeFolder: string | null;
  onSelect: (id: string | null) => void;
  onNew: (parentId?: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export default function FolderTree({ folders, activeFolder, onSelect, onNew, onDelete, onRename }: Props) {
  const roots = folders.filter(f => !f.parent_id);
  const children = (id: string) => folders.filter(f => f.parent_id === id);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const FolderRow = ({ folder, depth }: { folder: Folder; depth: number }) => {
    const kids = children(folder.id);
    const open = expanded[folder.id];

    return (
      <div>
        <div
          className={`folder-item flex items-center gap-2 px-2 py-1.5 select-none group ${activeFolder === folder.id ? 'active' : ''}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => onSelect(folder.id)}
        >
          {/* Expand arrow */}
          <button
            className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-slate-300 shrink-0"
            onClick={e => { e.stopPropagation(); toggle(folder.id); }}
          >
            {kids.length > 0 ? (open ? '▾' : '▸') : <span className="w-4" />}
          </button>

          {/* Folder icon */}
          <svg width="14" height="14" viewBox="0 0 20 16" fill="none" className="shrink-0">
            <path d="M2 3C2 1.9 2.9 1 4 1H7.586a1 1 0 0 1 .707.293L9.414 2.4A1 1 0 0 0 10.121 2.7H16C17.1 2.7 18 3.6 18 4.7V13C18 14.1 17.1 15 16 15H4C2.9 15 2 14.1 2 13V3Z"
              fill={folder.color || '#3b82f6'} fillOpacity="0.5"
              stroke={folder.color || '#3b82f6'} strokeWidth="1.2" strokeOpacity="0.8" />
          </svg>

          {/* Name / rename */}
          {renaming === folder.id ? (
            <input
              autoFocus
              className="flex-1 bg-white/10 border border-blue-500/40 rounded px-1.5 py-0.5 text-xs text-white outline-none"
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={() => { onRename(folder.id, renameVal); setRenaming(null); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { onRename(folder.id, renameVal); setRenaming(null); }
                if (e.key === 'Escape') setRenaming(null);
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 text-xs truncate font-medium">{folder.name}</span>
          )}

          {/* Count badge */}
          {folder.file_count > 0 && !renaming && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/8 border border-white/10 text-slate-500 shrink-0">
              {folder.file_count}
            </span>
          )}

          {/* Actions */}
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              title="New subfolder"
              className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-blue-400 text-xs"
              onClick={e => { e.stopPropagation(); onNew(folder.id); }}
            >+</button>
            <button
              title="Rename"
              className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-slate-200 text-xs"
              onClick={e => { e.stopPropagation(); setRenameVal(folder.name); setRenaming(folder.id); }}
            >✎</button>
            <button
              title="Delete folder"
              className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-red-400 text-xs"
              onClick={e => { e.stopPropagation(); if (confirm(`Delete "${folder.name}"?`)) onDelete(folder.id); }}
            >×</button>
          </div>
        </div>

        {/* Children */}
        {open && kids.map(k => <FolderRow key={k.id} folder={k} depth={depth + 1} />)}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-0.5">
      {roots.map(f => <FolderRow key={f.id} folder={f} depth={0} />)}
    </div>
  );
}
