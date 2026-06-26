import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';
import { uploadFileThroughFacilitator } from '@/lib/upload-facilitator';
import { extractText } from '@/lib/extract';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'text/html': 'html',
  'application/json': 'json',
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folderId = formData.get('folder_id') as string | null;
    const notes = (formData.get('notes') as string) || '';
    const tagsRaw = (formData.get('tags') as string) || '';

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const mimeType = file.type || 'application/octet-stream';
    const fileType = ALLOWED_TYPES[mimeType] ?? file.name.split('.').pop() ?? 'bin';
    const originalName = file.name;
    const displayName = originalName.replace(/\.[^.]+$/, '');

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extractedText = await extractText(buffer, mimeType, originalName);

    const { url, key } = await uploadFileThroughFacilitator({
      buffer,
      originalName,
      mimeType,
    });

    const tags = tagsRaw ? tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

    const rows = await query(
      `INSERT INTO sv_files
        (folder_id, name, original_name, file_type, mime_type, size_bytes, storage_url, storage_key, extracted_text, notes, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        folderId || null,
        displayName,
        originalName,
        fileType,
        mimeType,
        buffer.length,
        url,
        key,
        extractedText,
        notes,
        tags.length ? `{${tags.map((t: string) => `"${t}"`).join(',')}}` : '{}',
      ]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
