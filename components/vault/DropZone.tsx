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
}

export default function DropZone({ folderId, onUploaded }: Props) {
  const [uploading, setUploading] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

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
    setErrors([]);
    const names = accepted.map(f => f.name);
    setUploading(names);

    const errs: string[] = [];
    for (const file of accepted) {
      try {
        const result = await uploadFile(file);
        onUploaded(result);
      } catch (e: any) {
        errs.push(`${file.name}: ${e.message}`);
      }
    }

    setUploading([]);
    setErrors(errs);
  }, [folderId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    multiple: true,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`gc relative border-dashed border-2 cursor-pointer transition-all
          ${isDragActive ? 'drop-active' : 'border-white/12 hover:border-white/22 hover:bg-white/4'}`}
        style={{ padding: '32px 24px', textAlign: 'center' }}
      >
        <div className="shimmer-top" />
        <input {...getInputProps()} />

        {uploading.length > 0 ? (
          <div className="space-y-2">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-400">Uploading {uploading.length} file{uploading.length > 1 ? 's' : ''}…</p>
            <div className="text-xs text-slate-600 space-y-0.5">
              {uploading.map(n => <div key={n}>{n}</div>)}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl gc-sm flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.7)" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300">
                {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
              </p>
              <p className="text-xs text-slate-600 mt-1">or click to browse — PDF, PNG, JPG, DOCX, XLSX, CSV, TXT, HTML</p>
            </div>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="gc-sm px-3 py-2.5 border-red-500/20 bg-red-500/10">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-400">{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}
