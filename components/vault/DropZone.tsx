'use client';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt'],
  'text/html': ['.html', '.htm'],
};

interface Props {
  folderId: string | null;
  onUploaded: (file: any) => void;
  onClose: () => void;
}

export default function DropZone({ folderId, onUploaded, onClose }: Props) {
  const [uploading, setUploading] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string[]>([]);

  const uploadFile = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    if (folderId) fd.append('folder_id', folderId);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  };

  const onDrop = useCallback(async (accepted: File[]) => {
    setErrors([]); setDone([]);
    setUploading(accepted.map(f => f.name));
    const errs: string[] = [];
    const succeeded: string[] = [];
    for (const file of accepted) {
      try {
        const result = await uploadFile(file);
        onUploaded(result);
        succeeded.push(file.name);
      } catch (e: any) {
        errs.push(`${file.name}: ${e.message}`);
      }
      setUploading(prev => prev.filter(n => n !== file.name));
    }
    setDone(succeeded);
    setErrors(errs);
    if (!errs.length) setTimeout(onClose, 1200);
  }, [folderId, onUploaded, onClose]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: ACCEPTED, multiple: true });

  return (
    <div className="relative glass rounded-2xl overflow-hidden" style={{ padding: '2px' }}>
      <div className="shim" />
      <div
        {...getRootProps()}
        className={`drop-zone p-10 text-center ${isDragActive ? 'active' : ''}`}
      >
        <input {...getInputProps()} />

        {uploading.length > 0 ? (
          <div className="space-y-3">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-300 font-medium">Uploading {uploading.length} file{uploading.length > 1 ? 's' : ''}…</p>
            <div className="space-y-1 text-xs text-slate-600">
              {uploading.map(n => <div key={n} className="truncate">{n}</div>)}
            </div>
          </div>
        ) : done.length > 0 ? (
          <div className="space-y-2">
            <div className="text-2xl">✓</div>
            <p className="text-sm text-emerald-400 font-medium">{done.length} file{done.length > 1 ? 's' : ''} uploaded</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto glass-card flex items-center justify-center rounded-2xl">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.7)" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">{isDragActive ? 'Release to upload' : 'Drop files here'}</p>
              <p className="text-xs text-slate-600 mt-1">PDF · PNG · JPG · DOCX · XLSX · CSV · TXT · HTML</p>
            </div>
          </div>
        )}
      </div>
      {errors.length > 0 && (
        <div className="px-4 pb-4 space-y-1">
          {errors.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
        </div>
      )}
    </div>
  );
}
