/**
 * Storage abstraction.
 * Supports: Cloudflare R2 / AWS S3 (via S3_* env vars) OR
 *           Base44 public upload fallback (no env vars needed).
 */
import { v4 as uuidv4 } from 'uuid';

export interface StorageResult {
  url: string;
  key: string;
}

export async function uploadToStorage(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<StorageResult> {
  const ext = originalName.split('.').pop() ?? 'bin';
  const key = `vault/${uuidv4()}.${ext}`;

  // S3 / R2 path
  if (process.env.S3_BUCKET && process.env.S3_ENDPOINT) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: process.env.S3_REGION ?? 'auto',
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
    await client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }));
    const url = process.env.S3_PUBLIC_URL
      ? `${process.env.S3_PUBLIC_URL}/${key}`
      : `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}`;
    return { url, key };
  }

  // Fallback: store as base64 data URL in DB (files up to ~4MB)
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  return { url: dataUrl, key };
}

export async function getSignedUrl(key: string): Promise<string> {
  if (!process.env.S3_BUCKET || !process.env.S3_ENDPOINT) return key;
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
  }), { expiresIn: 3600 });
}
