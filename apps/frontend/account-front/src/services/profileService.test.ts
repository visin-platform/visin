import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'http://auth-api.test' })
}));

import { profileService } from './profileService';

describe('profileService.updateProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() });
  });

  it('PUTs the profile data and returns the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, user: { id: 'u1', firstName: 'A' } }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await profileService.updateProfile({ firstName: 'A' });

    expect(result).toEqual({ success: true, user: { id: 'u1', firstName: 'A' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://auth-api.test/auth/profile');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(init.body).toBe(JSON.stringify({ firstName: 'A' }));
  });

  it('rethrows on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Invalid name' }), { status: 400 })));

    await expect(profileService.updateProfile({ firstName: '' })).rejects.toThrow('Invalid name');
  });
});
