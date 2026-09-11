import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'http://auth-api.test' })
}));

import * as authApi from './authApi';

const stubFetch = (body: unknown, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue(
    status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('linkGoogle', () => {
  it('sends both proofs with the session cookie', async () => {
    const fetchMock = stubFetch({ success: true });
    await authApi.linkGoogle('current-password', 'google-token');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://auth-api.test/auth/profile/google');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ currentPassword: 'current-password', idToken: 'google-token' });
  });
  it('surfaces controlled linking failures', async () => {
    stubFetch({ message: 'Already linked' }, 409);
    await expect(authApi.linkGoogle('pw', 'token')).rejects.toThrow('Already linked');
  });
  it('handles a transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(authApi.linkGoogle('pw', 'token')).rejects.toThrow('Could not link Google');
  });
});

describe('getSetupStatus', () => {
  it('reads both flags from the server', async () => {
    const fetchMock = stubFetch({ success: true, needsSetup: true, googleEnabled: false });

    await expect(authApi.getSetupStatus()).resolves.toEqual({ needsSetup: true, googleEnabled: false });
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth-api.test/auth/setup-status');
  });

  it('coerces missing flags to false rather than undefined', async () => {
    stubFetch({ success: true });

    await expect(authApi.getSetupStatus()).resolves.toEqual({ needsSetup: false, googleEnabled: false });
  });

  it('propagates a transport failure so the caller can fall back', async () => {
    stubFetch({ message: 'boom' }, 500);

    await expect(authApi.getSetupStatus()).rejects.toThrow();
  });
});

describe('setupFirstUser', () => {
  it('posts the credentials to /auth/setup', async () => {
    const fetchMock = stubFetch({ success: true }, 201);

    await authApi.setupFirstUser({ email: 'owner@example.com', password: 'a-strong-password' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://auth-api.test/auth/setup');
    expect(init.method).toBe('POST');
    // The session cookie has to come back on this response.
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ email: 'owner@example.com', password: 'a-strong-password' });
  });

  it('surfaces the server message', async () => {
    stubFetch({ message: 'Setup has already been completed' }, 409);

    await expect(
      authApi.setupFirstUser({ email: 'owner@example.com', password: 'a-strong-password' })
    ).rejects.toThrow('Setup has already been completed');
  });

  it('falls back to a generic message for a non-API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    await expect(
      authApi.setupFirstUser({ email: 'owner@example.com', password: 'a-strong-password' })
    ).rejects.toThrow('Could not create the account');
  });
});

describe('register', () => {
  it('posts the credentials and expects a session back', async () => {
    const fetchMock = stubFetch({ success: true, token: 'jwt' }, 201);

    await expect(
      authApi.register({ email: 'new@example.com', password: 'a-strong-password' })
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://auth-api.test/auth/register');
    // The session cookie arrives on this response — registration signs you in.
    expect(init.credentials).toBe('include');
  });

  it('surfaces a duplicate-email rejection', async () => {
    stubFetch({ message: 'An account with that email already exists' }, 409);

    await expect(
      authApi.register({ email: 'taken@example.com', password: 'a-strong-password' })
    ).rejects.toThrow('An account with that email already exists');
  });

  it('falls back to a generic message for a non-API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    await expect(authApi.register({ email: 'new@example.com', password: 'pw' })).rejects.toThrow(
      'Could not create the account'
    );
  });
});

describe('login', () => {
  it('posts the credentials to /auth/login', async () => {
    const fetchMock = stubFetch({ success: true });

    await authApi.login('ada@example.com', 'a-strong-password');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://auth-api.test/auth/login');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ email: 'ada@example.com', password: 'a-strong-password' });
  });

  it('surfaces the server message for bad credentials', async () => {
    stubFetch({ message: 'Incorrect email or password' }, 401);

    await expect(authApi.login('ada@example.com', 'wrong')).rejects.toThrow('Incorrect email or password');
  });

  it('surfaces the pending-approval message', async () => {
    stubFetch({ message: 'Your account is awaiting administrator approval' }, 403);

    await expect(authApi.login('new@example.com', 'a-strong-password')).rejects.toThrow(
      'awaiting administrator approval'
    );
  });

  it('falls back to a generic message for a non-API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    await expect(authApi.login('ada@example.com', 'pw')).rejects.toThrow('Could not sign in');
  });
});
