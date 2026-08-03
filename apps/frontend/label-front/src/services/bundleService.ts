import { labelApi } from './labelApiClient';
import {
  ApiResponse,
  BundleUpload,
  ImportJob,
  ImportMapping,
  LabelBundle,
  MaskField,
  ZipPreview
} from '../types';

export const listBundles = async (): Promise<LabelBundle[]> =>
  (await labelApi.get<ApiResponse<LabelBundle[]>>('/bundles')).data;

export const getBundle = async (bundleId: string): Promise<LabelBundle> =>
  (await labelApi.get<ApiResponse<LabelBundle>>(`/bundles/${bundleId}`)).data;

export const getMaskFields = async (bundleId: string, set: string): Promise<MaskField[]> =>
  (
    await labelApi.get<ApiResponse<MaskField[]>>(
      `/bundles/${bundleId}/mask-fields?set=${encodeURIComponent(set)}`
    )
  ).data;

export const createBundle = async (input: {
  name: string;
  groupId: string;
  description?: string;
}): Promise<LabelBundle> => (await labelApi.post<ApiResponse<LabelBundle>>('/bundles', input)).data;

/** Metadata only — a bundle's images are immutable once imported. */
export const updateBundle = async (
  bundleId: string,
  input: { name?: string; description?: string }
): Promise<LabelBundle> => (await labelApi.patch<ApiResponse<LabelBundle>>(`/bundles/${bundleId}`, input)).data;

export const deleteBundle = async (bundleId: string): Promise<void> => {
  await labelApi.delete(`/bundles/${bundleId}`);
};

export const getUploadUrl = async (
  bundleId: string
): Promise<{ uploadUrl: string; zipFileId: string; expiresMs: number }> =>
  (await labelApi.post<ApiResponse<{ uploadUrl: string; zipFileId: string; expiresMs: number }>>(
    `/bundles/${bundleId}/upload-url`
  )).data;

/** Zips already uploaded for this bundle, newest first. */
export const listUploads = async (bundleId: string): Promise<BundleUpload[]> =>
  (await labelApi.get<ApiResponse<BundleUpload[]>>(`/bundles/${bundleId}/uploads`)).data;

/** Zip shape + suggested mapping — the input to the mapping step. */
export const previewImport = async (bundleId: string, zipFileId: string): Promise<ZipPreview> =>
  (await labelApi.post<ApiResponse<ZipPreview>>(`/bundles/${bundleId}/import/preview`, { zipFileId })).data;

export const startImport = async (
  bundleId: string,
  zipFileId: string,
  mapping?: ImportMapping
): Promise<ImportJob> =>
  (await labelApi.post<ApiResponse<ImportJob>>(`/bundles/${bundleId}/import`, {
    zipFileId,
    ...(mapping ? { mapping } : {})
  })).data;

export const getImport = async (bundleId: string, importId: string): Promise<ImportJob> =>
  (await labelApi.get<ApiResponse<ImportJob>>(`/bundles/${bundleId}/import/${importId}`)).data;

/**
 * Chunk size for large zips. Cloudflare caps a proxied request body at 100 MB
 * on our plan, and traffic reaches file-api through the tunnel, so a single PUT
 * of a multi-GB zip is rejected at the edge before file-service sees a byte.
 * 64 MB leaves headroom under that ceiling.
 */
const CHUNK_BYTES = 64 * 1024 * 1024;

/**
 * Consecutive failures tolerated on one chunk before the upload gives up.
 * Reset by any chunk that lands, so a flaky link costs retries, not the upload.
 */
const MAX_CHUNK_ATTEMPTS = 4;

interface ChunkResult {
  status: number;
  /** Bytes file-service reports holding — the offset to continue from. */
  size: number | null;
}

/** Bytes stored, per file-service's JSON reply. Absent on any unexpected body. */
const parseStoredSize = (responseText: string): number | null => {
  try {
    const body = JSON.parse(responseText) as { size?: unknown };
    return typeof body.size === 'number' ? body.size : null;
  } catch {
    return null;
  }
};

/**
 * One PUT to the signed URL. XMLHttpRequest, not fetch: multi-GB uploads need
 * upload.onprogress, which fetch doesn't expose.
 *
 * Resolves for any HTTP status — the caller decides what is retryable — and
 * rejects only when the request never completed (network drop, abort).
 */
const putChunk = (
  uploadUrl: string,
  body: Blob,
  contentRange: string | null,
  onLoaded: (loaded: number) => void
): Promise<ChunkResult> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    if (contentRange) {
      xhr.setRequestHeader('Content-Range', contentRange);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onLoaded(event.loaded);
      }
    };
    xhr.onload = () => resolve({ status: xhr.status, size: parseStoredSize(xhr.responseText) });
    xhr.onerror = () => reject(new Error('Zip upload failed (network)'));
    xhr.onabort = () => reject(new Error('Zip upload cancelled'));
    xhr.send(body);
  });

/**
 * PUT the zip straight to file-service via the signed URL.
 *
 * Anything over CHUNK_BYTES goes up as a sequence of `Content-Range` chunks,
 * which is both what gets a multi-GB zip past Cloudflare and what makes the
 * upload resumable: a chunk that dies is re-sent on its own, and if the server
 * turns out to hold a different amount than we assumed (409) the upload picks
 * up from the offset it reports instead of starting the file over.
 */
export const uploadZip = async (
  uploadUrl: string,
  file: File,
  onProgress: (fraction: number) => void
): Promise<void> => {
  // Small zips stay a single request: fewer round trips, and it exercises the
  // same un-chunked server path that non-browser clients use.
  if (file.size <= CHUNK_BYTES) {
    const { status } = await putChunk(uploadUrl, file, null, (loaded) => onProgress(loaded / file.size));
    if (status < 200 || status >= 300) {
      throw new Error(`Zip upload failed (${status})`);
    }
    onProgress(1);
    return;
  }

  let offset = 0;
  let attempts = 0;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_BYTES, file.size);
    const chunkStart = offset;
    let result: ChunkResult;

    try {
      result = await putChunk(
        uploadUrl,
        file.slice(chunkStart, end),
        `bytes ${chunkStart}-${end - 1}/${file.size}`,
        (loaded) => onProgress((chunkStart + loaded) / file.size)
      );
    } catch (err) {
      // Dropped mid-chunk. Re-sending the same range is safe: it either lands,
      // or answers 409 with how far the server actually got.
      attempts += 1;
      if (attempts >= MAX_CHUNK_ATTEMPTS) {
        throw err;
      }
      continue;
    }

    if (result.status === 409 && result.size !== null) {
      attempts += 1;
      if (attempts >= MAX_CHUNK_ATTEMPTS) {
        throw new Error('Zip upload failed (could not resynchronise with the server)');
      }
      offset = result.size;
      continue;
    }

    if (result.status < 200 || result.status >= 300) {
      attempts += 1;
      // 5xx is worth another try; a 4xx means this request will never be accepted.
      if (result.status < 500 || attempts >= MAX_CHUNK_ATTEMPTS) {
        throw new Error(`Zip upload failed (${result.status})`);
      }
      continue;
    }

    offset = result.size ?? end;
    attempts = 0;
  }

  onProgress(1);
};
