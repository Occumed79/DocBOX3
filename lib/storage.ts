import { randomUUID } from 'node:crypto';

export interface StorageResult {
  url: string;
  key: string;
}

function requireS3Credentials() {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when S3 storage is configured.');
  }

  return { accessKeyId, secretAccessKey };
}

export async function uploadToStorage(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<StorageResult> {
  const extension = originalName.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
  const key = `vault/${randomUUID()}.${extension}`;
  const bucket = process.env.S3_BUCKET?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();

  if (bucket && endpoint) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: process.env.S3_REGION?.trim() || 'auto',
      endpoint,
      credentials: requireS3Credentials(),
    });

    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }));

    const publicBase = process.env.S3_PUBLIC_URL?.trim()?.replace(/\/+$/, '');
    const url = publicBase
      ? `${publicBase}/${key}`
      : `${endpoint.replace(/\/+$/, '')}/${bucket}/${key}`;

    return { url, key };
  }

  // Development/small-file fallback. Production should configure S3-compatible storage.
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  return { url: dataUrl, key };
}
