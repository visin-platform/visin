import { authMiddleware, optionalAuthMiddleware } from '../../middleware/authMiddleware';
import { authenticateToken, optionalAuth } from '@visin/backend-core';

describe('authMiddleware aliases', () => {
  it('re-exports the shared backend-core middleware unchanged', () => {
    expect(authMiddleware).toBe(authenticateToken);
    expect(optionalAuthMiddleware).toBe(optionalAuth);
  });
});
