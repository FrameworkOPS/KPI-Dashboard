// Object storage wrapper — S3-compatible (works with AWS S3, Cloudflare R2,
// Backblaze B2, DigitalOcean Spaces, MinIO, etc.).
//
// Env vars:
//   S3_BUCKET             — required, bucket name
//   S3_REGION             — required, region (e.g. us-east-1; R2 uses "auto")
//   S3_ENDPOINT           — optional, custom endpoint for R2/B2/Spaces/MinIO
//   S3_ACCESS_KEY_ID      — required
//   S3_SECRET_ACCESS_KEY  — required
//   S3_PUBLIC_BASE_URL    — optional, public CDN URL prefix (skips presigning)
//   S3_FORCE_PATH_STYLE   — optional, "true" for MinIO/legacy endpoints
//
// If any of the required vars are missing, every call throws a clear error
// so the upload route can surface it as a 503.

import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL;
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!S3_BUCKET || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Object storage not configured: set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY env vars.',
    );
  }
  _client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: S3_FORCE_PATH_STYLE,
  });
  return _client;
}

export function isStorageConfigured(): boolean {
  return !!(S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

// Random, URL-safe storage key under the given prefix.
export function makeStorageKey(prefix: string, fileName: string): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
  const id = crypto.randomBytes(8).toString('hex');
  const ts = Date.now();
  return `${prefix.replace(/^\/+|\/+$/g, '')}/${ts}-${id}-${safeName}`;
}

export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getClient().send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

// Returns either the public CDN URL (if S3_PUBLIC_BASE_URL is set) or a
// short-lived presigned URL. `expiresInSec` only applies to presigned URLs.
export async function getDownloadUrl(key: string, expiresInSec = 3600): Promise<string> {
  if (S3_PUBLIC_BASE_URL) {
    return `${S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    { expiresIn: expiresInSec },
  );
}
