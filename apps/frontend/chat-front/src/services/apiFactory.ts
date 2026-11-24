import { ApiError, createApiClient } from '@visin/frontend-core';

/**
 * The calls one service takes, as the app makes them: GET and POST unwrapped from the `{ data }` envelope, and the
 * few others. Chat and the assistants are two services with two addresses, so each gets its own, made here.
 */
export function createServiceApi(baseUrl: () => string) {
  const client = createApiClient({ baseUrl });

  async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    try {
      const result =
        body === undefined
          ? await client.get<{ data: T }>(path, { signal })
          : await client.post<{ data: T }>(path, body, { signal });
      return result.data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw new Error('Sign in to use chat', { cause: error });
      throw error;
    }
  }

  /** DELETE with a JSON body, which `api` (GET and POST) does not cover. */
  async function apiDelete(path: string, body: unknown, signal?: AbortSignal): Promise<void> {
    await client.delete(path, { body: JSON.stringify(body), signal });
  }

  /** POST where the answer is nothing (a 204): `api` expects a body to unwrap. */
  async function apiSend(path: string, body: unknown, signal?: AbortSignal): Promise<void> {
    await client.post(path, body, { signal });
  }

  /** PUT with a JSON body, unwrapped like `api`. */
  async function apiPut<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return (await client.put<{ data: T }>(path, body, { signal })).data;
  }

  return { api, apiDelete, apiSend, apiPut };
}
