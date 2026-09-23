import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Header a request id travels in, inbound from a caller and outbound to a peer. */
export const REQUEST_ID_HEADER = 'x-request-id';

// Accepted from a caller as-is only when it looks like an id: it is written
// into every log line, so free text there would let a client forge log output.
const ACCEPTABLE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** The caller's id when it is a plausible one, else a fresh one. */
export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && ACCEPTABLE_ID.test(incoming) ? incoming : randomUUID();
}

/** Runs `fn` with `requestId` as the current request's id. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** The id of the request being handled, if any. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
