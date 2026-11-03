import { vi } from 'vitest';
const { mockVerifyIdToken } = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();
  return { mockVerifyIdToken };
});

vi.mock('google-auth-library', async () => {
  const module = await (() => ({
    OAuth2Client: vi.fn().mockImplementation(function () {
      return {
        verifyIdToken: mockVerifyIdToken
      };
    })
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('@visin/backend-core', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  }))();
  return Object.assign({ default: module }, module);
});

import { verifyGoogleToken } from '../../services/googleAuthService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyGoogleToken', () => {
  it('returns the ticket payload for a valid token', async () => {
    const payload = { email: 'test@example.com', name: 'Test User' };
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => payload });

    await expect(verifyGoogleToken('valid-token')).resolves.toEqual(payload);
    expect(mockVerifyIdToken).toHaveBeenCalledWith(expect.objectContaining({ idToken: 'valid-token' }));
  });

  it('wraps verification failures in an Invalid token error', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('expired'));

    await expect(verifyGoogleToken('bad-token')).rejects.toMatchObject({ statusCode: 401, message: 'Invalid token' });
  });
});
