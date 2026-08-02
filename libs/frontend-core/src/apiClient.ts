export interface ApiClientOptions {
  /** Read fresh at call time (app config may not be resolved yet at module load). */
  baseUrl: () => string;
  /** Called on a 401 response, e.g. to redirect to the login page. */
  onUnauthorized?: () => void;
}

export interface ApiRequestOptions extends RequestInit {
  /** Skip the onUnauthorized callback for this call (e.g. an auth-check that expects 401 as a normal "not logged in" result, not a hard redirect). */
  skipAuthRedirect?: boolean;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Generic authenticated JSON fetch wrapper — base URL handling, structured
 * errors, and an opt-in 401 → redirect-to-auth hook.
 *
 * Auth rides the shared `access_token` httpOnly cookie (COOKIE_DOMAIN is a
 * shared parent domain across every Visin subdomain), so every request
 * defaults to `credentials: 'include'` — callers can still override via
 * `init.credentials` for the rare request that shouldn't send it.
 */
export function createApiClient(options: ApiClientOptions) {
  async function request<T = unknown>(path: string, init: ApiRequestOptions = {}): Promise<T> {
    const { skipAuthRedirect, headers, ...rest } = init;
    const url = `${options.baseUrl()}${path}`;

    const response = await fetch(url, {
      credentials: 'include',
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });

    if (response.status === 401 && !skipAuthRedirect) {
      options.onUnauthorized?.();
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        // response wasn't JSON — leave body undefined
      }
      const message = (body as { message?: string } | undefined)?.message ?? `HTTP error! status: ${response.status}`;
      throw new ApiError(response.status, message, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return await response.json();
    } catch {
      // Almost always a misconfigured base URL: the request fell through to the
      // app's own origin and a dev server or nginx answered with index.html, so
      // the raw `JSON.parse: unexpected character` gave no hint where to look.
      const contentType = response.headers.get('content-type') ?? 'unknown';
      throw new ApiError(
        response.status,
        `Expected JSON from ${url} but received ${contentType}. Check the service base URL is configured.`
      );
    }
  }

  return {
    request,
    get: <T = unknown>(path: string, init?: ApiRequestOptions) => request<T>(path, { ...init, method: 'GET' }),
    post: <T = unknown>(path: string, body?: unknown, init?: ApiRequestOptions) =>
      request<T>(path, { ...init, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
    put: <T = unknown>(path: string, body?: unknown, init?: ApiRequestOptions) =>
      request<T>(path, { ...init, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
    patch: <T = unknown>(path: string, body?: unknown, init?: ApiRequestOptions) =>
      request<T>(path, { ...init, method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
    delete: <T = unknown>(path: string, init?: ApiRequestOptions) => request<T>(path, { ...init, method: 'DELETE' })
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
