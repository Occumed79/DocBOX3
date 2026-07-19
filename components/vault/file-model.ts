export interface VaultFile {
  id: string;
  name: string;
  original_name: string;
  file_type: string;
  mime_type: string;
  size_bytes: number;
  storage_url: string;
  storage_key?: string;
  folder_id: string | null;
  folder_name?: string | null;
  extracted_text?: string | null;
  notes: string;
  tags: string[];
  upload_date: string;
  updated_at?: string;
  is_archived: boolean;
  headline?: string;
}

export function typeClass(type: string) {
  const normalized = type.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(normalized)) return 'type-image';

  const classes: Record<string, string> = {
    pdf: 'type-pdf',
    docx: 'type-document',
    xlsx: 'type-sheet',
    csv: 'type-sheet',
    txt: 'type-text',
    json: 'type-code',
    html: 'type-code',
    htm: 'type-code',
  };

  return classes[normalized] || 'type-other';
}

export function formatSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
