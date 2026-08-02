import { GatewayTimeoutError } from '../errors/HttpError';

/**
 * Deadline for a control-plane inter-service call (signed-URL minting,
 * metadata lookups, membership checks): small JSON in, small JSON out, so
 * anything past a few seconds means the peer is degraded, not busy.
 *
 * Node's undici default is no timeout at all beyond its ~5 minute headers
 * timeout, which is long enough that a stalled peer exhausts the *caller's*
 * capacity while it waits. Every outbound `fetch` in a service-to-service
 * client should go through `fetchWithTimeout` rather than bare `fetch`.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Deadline for a data-plane call that moves file bytes (uploading a buffer,
 * reading a bundle zip). Deliberately far larger than the control-plane
 * default: the request is legitimately slow in proportion to payload size,
 * so a 10s cap would abort healthy transfers.
 */
export const TRANSFER_FETCH_TIMEOUT_MS = 120_000;

export interface FetchWithTimeoutInit extends RequestInit {
  /** Abort deadline in ms. Defaults to {@link DEFAULT_FETCH_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Peer name used in the timeout message, e.g. `'file-service'`. */
  serviceName?: string;
  /**
   * Stop the clock once response headers arrive, instead of letting it run
   * while the body is read.
   *
   * For a body the caller consumes at its own pace — ingest reads a bundle zip
   * entry by entry, thumbnailing as it goes — a whole-response deadline is
   * measuring the *consumer*, not the peer. It fires mid-read on a perfectly
   * healthy transfer, and the abort lands as an `'error'` on the body stream.
   * Only set this where a stalled read is caught some other way (ingest has a
   * heartbeat that goes stale).
   */
  streamBody?: boolean;
}

/**
 * `fetch` with a mandatory abort deadline, translating an expired one into a
 * `GatewayTimeoutError` so the shared `errorHandler` reports it as a 504
 * upstream failure instead of an opaque 500 server bug.
 *
 * A caller-supplied `signal` still works — it's combined with the deadline,
 * so whichever fires first aborts the request.
 */
export async function fetchWithTimeout(input: string | URL, init: FetchWithTimeoutInit = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, serviceName, streamBody, signal, ...rest } = init;

  // `AbortSignal.timeout` can't be cancelled, so a streaming read needs a
  // controller whose timer we can clear once the headers are in.
  const controller = streamBody ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const deadline = controller ? controller.signal : AbortSignal.timeout(timeoutMs);

  try {
    return await fetch(input, { ...rest, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
  } catch (error) {
    // Only the deadline firing is a timeout: a caller-supplied signal aborting
    // (shutdown, client disconnect) is not this peer's fault and stays as-is.
    if (deadline.aborted) {
      const peer = serviceName || String(input);
      throw new GatewayTimeoutError(`${peer} did not respond within ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    // Headers are in (or the request failed) — the body is the caller's problem now.
    clearTimeout(timer);
  }
}
