import { Readable } from 'stream';
import { requireEnv } from '@visin/backend-core';

export interface SignedUrl {
  url: string;
  fileId: string;
  expiresMs: number;
}

const baseUrl = (): string => (process.env.FILE_SERVICE_URL || 'http://localhost:5002').replace(/\/$/, '');

const apiKeyHeaders = (): Record<string, string> => ({
  'x-internal-api-key': requireEnv('FILE_SERVICE_API_KEY')
});

const signedUrl = async (
  kind: 'upload' | 'download',
  fileId: string,
  expiresInMinutes: number,
  mimetype?: string
): Promise<SignedUrl> => {
  const response = await fetch(`${baseUrl()}/internal/${kind}-url`, {
    method: 'POST',
    headers: { ...apiKeyHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, expiresInMinutes, ...(mimetype ? { mimetype } : {}) })
  });
  if (!response.ok) {
    throw new Error(`file-service ${kind}-url failed (${response.status})`);
  }
  const body = (await response.json()) as { data: { uploadUrl?: string; downloadUrl?: string; expiresMs: number } };
  return { url: (body.data.uploadUrl || body.data.downloadUrl)!, fileId, expiresMs: body.data.expiresMs };
};

/** Signed browser-direct PUT URL (bundle zip upload). */
export const getUploadUrl = (fileId: string, expiresInMinutes = 240, mimetype = 'application/zip'): Promise<SignedUrl> =>
  signedUrl('upload', fileId, expiresInMinutes, mimetype);

/** Signed browser-direct GET URL (workbench image display). */
export const getDownloadUrl = (fileId: string, expiresInMinutes = 60): Promise<SignedUrl> =>
  signedUrl('download', fileId, expiresInMinutes);

/** Server-to-server store of one file (ingest). */
export const putFile = async (fileId: string, data: Buffer): Promise<void> => {
  const response = await fetch(`${baseUrl()}/internal/files/${fileId}`, {
    method: 'PUT',
    headers: { ...apiKeyHeaders(), 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(data)
  });
  if (!response.ok) {
    throw new Error(`file-service put failed for ${fileId} (${response.status})`);
  }
};

/** Server-to-server streaming read (ingest reads the uploaded zip). */
export const getFileStream = async (fileId: string): Promise<Readable> => {
  const response = await fetch(`${baseUrl()}/internal/files/${fileId}`, { headers: apiKeyHeaders() });
  if (!response.ok || !response.body) {
    throw new Error(`file-service get failed for ${fileId} (${response.status})`);
  }
  return Readable.fromWeb(response.body as import('stream/web').ReadableStream);
};

/** Whether a file already exists (idempotent re-import checks). */
export const fileExists = async (fileId: string): Promise<boolean> => {
  const response = await fetch(`${baseUrl()}/internal/files/${fileId}`, {
    method: 'HEAD',
    headers: apiKeyHeaders()
  });
  return response.ok;
};

/** Delete every stored file under a prefix (bundle deletion). */
export const deleteFolder = async (prefix: string): Promise<void> => {
  const response = await fetch(`${baseUrl()}/internal/files/folder`, {
    method: 'DELETE',
    headers: { ...apiKeyHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix })
  });
  if (!response.ok) {
    throw new Error(`file-service folder delete failed for ${prefix} (${response.status})`);
  }
};
