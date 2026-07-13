const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { verifyGoogleToken } from '../../services/googleAuthService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('verifyGoogleToken', () => {
  it('returns the ticket payload for a valid token', async () => {
    const payload = { email: 'test@example.com', name: 'Test User' };
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => payload });

    await expect(verifyGoogleToken('valid-token')).resolves.toEqual(payload);
    expect(mockVerifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: 'valid-token' })
    );
  });

  it('wraps verification failures in an Invalid token error', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('expired'));

    await expect(verifyGoogleToken('bad-token')).rejects.toThrow('Invalid token');
  });
});
