import { v4 as uuidv4 } from 'uuid';
import { uploadToStorage, type StorageResult } from './storage';

export type UploadProvider = 'source-vault' | 'filestack';

interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface FacilitatedUploadResult extends StorageResult {
  provider: UploadProvider;
}

function selectedProvider(): UploadProvider {
  return process.env.FILE_UPLOAD_PROVIDER?.toLowerCase() === 'filestack'
    ? 'filestack'
    : 'source-vault';
}

export async function uploadFileThroughFacilitator({
  buffer,
  originalName,
  mimeType,
}: UploadInput): Promise<FacilitatedUploadResult> {
  const provider = selectedProvider();

  if (provider === 'filestack') {
    return uploadWithFilestack(buffer, originalName, mimeType);
  }

  const result = await uploadToStorage(buffer, originalName, mimeType);
  return { ...result, provider: 'source-vault' };
}

async function uploadWithFilestack(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<FacilitatedUploadResult> {
  const apiKey = process.env.FILESTACK_API_KEY;
  if (!apiKey) {
    throw new Error('FILESTACK_API_KEY is required when FILE_UPLOAD_PROVIDER=filestack');
  }

  const storeProvider = process.env.FILESTACK_STORE_PROVIDER || 'S3';
  const filename = originalName || `source-vault-${uuidv4()}`;
  const safePrefix = (process.env.FILESTACK_PATH_PREFIX || 'source-vault')
    .replace(/^\/+|\/+$/g, '')
    .trim();

  const params = new URLSearchParams({
    key: apiKey,
    filename,
    mimetype: mimeType || 'application/octet-stream',
  });

  if (safePrefix) {
    params.set('path', `${safePrefix}/${uuidv4()}-${filename}`);
  }

  const endpoint = `https://www.filestackapi.com/api/store/${encodeURIComponent(storeProvider)}?${params.toString()}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: new Blob([new Uint8Array(buffer)], { type: mimeType || 'application/octet-stream' }),
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.error || data?.message || text || response.statusText;
    throw new Error(`Filestack upload failed: ${detail}`);
  }

  if (!data?.url) {
    throw new Error('Filestack upload response did not include a file URL');
  }

  return {
    url: data.url,
    key: data.key || data.handle || data.url,
    provider: 'filestack',
  };
}
