/** Fixed queue policy shared by delivery, recovery, and Redis connections. */
export const QUEUE_TIMEOUT_MS = 10_000;
export const IMPORT_ATTEMPTS = 3;
export const IMPORT_BACKOFF_MS = 5000;
// Each import already extracts several images in parallel on the API's event loop.
export const IMPORT_WORKERS = 1;
export const IMPORT_MAX_STALLED = 2;
export const IMPORT_STALE_MS = 10 * 60_000;
