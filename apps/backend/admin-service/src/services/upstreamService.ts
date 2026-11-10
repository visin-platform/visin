import type { Request } from 'express';
import { BadGatewayError, fetchWithTimeout, GatewayTimeoutError } from '@visin/backend-core';

/**
 * The services that own what Admin changes. Admin holds no copy of their data: it checks the caller is a platform
 * administrator, records the write, and forwards the caller's own credential, which each owner checks again.
 */
export const UPSTREAMS = {
  auth: { serviceName: 'auth-service', urlEnv: 'AUTH_SERVICE_URL', path: (p: string) => `/auth/admin/control${p}` },
  group: { serviceName: 'group-service', urlEnv: 'GROUP_SERVICE_URL', path: (p: string) => `/api/groups/admin${p}` },
  vivi: {
    serviceName: 'chat-service',
    urlEnv: 'CHAT_SERVICE_URL',
    path: (p: string) => `/api/chat${p.replace(/^\/vivi(?=\/)/, '')}`
  }
} as const;
export type UpstreamName = keyof typeof UPSTREAMS;

/** Long enough for a provider price refresh; anything slower is reported as unconfirmed. */
export const UPSTREAM_TIMEOUT_MS = 30_000;

export interface UpstreamReply {
  status: number;
  contentType: string;
  body: string;
  retryAfter?: string;
}

/**
 * The owner's URL for this request: its path is the matched admin route's, and only the incoming query string is
 * carried over, never a client-supplied host. Read per call, so a misconfigured owner fails one area, not startup.
 */
export function upstreamUrl(name: UpstreamName, req: Request): URL {
  const { urlEnv, path, serviceName } = UPSTREAMS[name];
  const base = process.env[urlEnv];
  if (!base) throw new BadGatewayError(`${serviceName} is not configured for administration`);
  const url = new URL(path(req.path), base);
  url.search = new URL(req.originalUrl, 'http://localhost').search;
  return url;
}

/** Forwards the caller's own credential and origin, and the JSON body of a write. */
export async function callUpstream(name: UpstreamName, url: URL, req: Request): Promise<UpstreamReply> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (req.headers.cookie) headers.Cookie = req.headers.cookie;
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  const origin = req.get('origin');
  if (origin) headers.Origin = origin;
  const response = await fetchWithTimeout(url, {
    method: req.method,
    headers,
    ...(isWrite(req.method) ? { body: JSON.stringify(req.body ?? {}) } : {}),
    redirect: 'error',
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    serviceName: UPSTREAMS[name].serviceName
  });
  const retryAfter = response.headers.get('retry-after') ?? undefined;
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || 'application/json',
    body: await response.text(),
    ...(retryAfter ? { retryAfter } : {})
  };
}

/** A failed call to an owner, phrased so the administrator checks before repeating a write. */
export function unconfirmed(error: unknown, write: boolean): Error {
  const message = write
    ? 'Administrator operation could not be confirmed; refresh before retrying'
    : 'The owning service is unavailable; try again shortly';
  return error instanceof GatewayTimeoutError ? new GatewayTimeoutError(message) : new BadGatewayError(message);
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const isWrite = (method: string): boolean => !READ_METHODS.has(method);
