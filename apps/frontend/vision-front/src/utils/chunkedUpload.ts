/**
 * Chunk size for large archives. Cloudflare caps a proxied request body at
 * 100 MB on our plan, and traffic reaches file-api through the tunnel, so a
 * single PUT of a multi-GB zip is rejected at the edge before file-service
 * sees a byte. 64 MB leaves headroom under that ceiling.
 */
export const CHUNK_BYTES = 64 * 1024 * 1024;

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
 * `upload.onprogress` to drive a progress bar, and fetch does not expose
 * request-body progress at all.
 *
 * Resolves for any HTTP status — the caller decides what is retryable — and
 * rejects only when the request never completed (network drop, abort).
 */
const putChunk = (
  uploadUrl: string,
  body: Blob,
  contentRange: string | null,
  contentType: string,
  onLoaded: (loaded: number) => void
): Promise<ChunkResult> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    if (contentRange) {
      xhr.setRequestHeader('Content-Range', contentRange);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onLoaded(event.loaded);
      }
    };
    xhr.onload = () => resolve({ status: xhr.status, size: parseStoredSize(xhr.responseText) });
    xhr.onerror = () => reject(new Error('Failed to upload dataset file (network)'));
    xhr.onabort = () => reject(new Error('Dataset upload cancelled'));
    xhr.send(body);
  });

/**
 * PUT a file to a file-service signed URL, reporting progress as a 0–1
 * fraction of the whole file.
 *
 * Anything over CHUNK_BYTES goes up as a sequence of `Content-Range` chunks,
 * which is both what gets a multi-GB archive past Cloudflare and what makes the
 * upload resumable: a chunk that dies is re-sent on its own, and if the server
 * turns out to hold a different amount than we assumed (409) the upload picks
 * up from the offset it reports instead of starting the file over.
 *
 * Mirrors label-front's bundle upload against the same server-side protocol
 * (`uploadPublic` in file-service).
 */
export const uploadToSignedUrl = async (
  uploadUrl: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<void> => {
  const contentType = file.type || 'application/octet-stream';
  const report = (fraction: number): void => onProgress?.(Math.min(1, fraction));

  // Small archives stay a single request: fewer round trips, and it exercises
  // the same un-chunked server path that non-browser clients use.
  if (file.size <= CHUNK_BYTES) {
    const { status } = await putChunk(uploadUrl, file, null, contentType, (loaded) =>
      report(file.size === 0 ? 1 : loaded / file.size)
    );
    if (status < 200 || status >= 300) {
      throw new Error(`Failed to upload dataset file (${status})`);
    }
    report(1);
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
        contentType,
        (loaded) => report((chunkStart + loaded) / file.size)
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
        throw new Error('Failed to upload dataset file (could not resynchronise with the server)');
      }
      offset = result.size;
      report(offset / file.size);
      continue;
    }

    if (result.status < 200 || result.status >= 300) {
      attempts += 1;
      // 5xx is worth another try; a 4xx means this request will never be accepted.
      if (result.status < 500 || attempts >= MAX_CHUNK_ATTEMPTS) {
        throw new Error(`Failed to upload dataset file (${result.status})`);
      }
      continue;
    }

    offset = result.size ?? end;
    attempts = 0;
    report(offset / file.size);
  }
};
