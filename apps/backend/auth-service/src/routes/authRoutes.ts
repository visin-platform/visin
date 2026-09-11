import { Router } from 'express';
import {
  validateToken,
  getSetupStatus,
  setupFirstUser,
  register,
  login,
  logout,
  verifyAuth,
  refreshToken,
  invalidateUserTokens,
  listUsers
} from '../controllers/authController';
import { getProfile, updateProfile, changePassword } from '../controllers/profileController';
import { linkGoogle } from '../controllers/googleLinkController';
import { createKey, listKeys, revealKey, revokeKey, removeKey } from '../controllers/apiKeyController';
import { getToolCalls, getToolUsage } from '../controllers/auditController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { requireInternalServiceToken } from '../middleware/internalServiceAuth';
import { createRateLimiter, validateRequest } from '@visin/backend-core';
import {
  validateTokenBodySchema,
  linkGoogleBodySchema,
  invalidateUserTokensBodySchema,
  updateProfileBodySchema,
  changePasswordBodySchema,
  setupBodySchema,
  registerBodySchema,
  loginBodySchema,
  createApiKeyBodySchema
} from '../validation/authSchemas';

const router = Router();

/**
 * A budget of its own for minting and revealing credentials.
 *
 * Deliberately not the shared `strictRateLimiter`: that export is a single
 * instance, so every route using it draws on one counter, and someone hammering
 * the login endpoint would lock an unrelated user out of their API keys. These
 * two things have nothing to do with each other.
 */
const keyLimiter = createRateLimiter({ max: 30 });

// Login route (public) – must remain public so user can obtain token
router.post('/validate', validateRequest({ body: validateTokenBodySchema }), validateToken);

// Password strategy (public). /setup-status tells the sign-in page whether this
// instance has any users yet, and /setup is self-closing once one exists.
router.get('/setup-status', getSetupStatus);
router.post('/setup', validateRequest({ body: setupBodySchema }), setupFirstUser);
router.post('/register', validateRequest({ body: registerBodySchema }), register);
router.post('/login', validateRequest({ body: loginBodySchema }), login);

// Refresh token route (protected)
router.post('/refresh', authenticateToken, refreshToken);

// Protected logout
router.post('/logout', authenticateToken, logout);

// Protected routes
router.get('/profile', authenticateToken, getProfile);
router.post('/profile/google', authenticateToken, validateRequest({ body: linkGoogleBodySchema }), linkGoogle);
router.put('/profile', authenticateToken, validateRequest({ body: updateProfileBodySchema }), updateProfile);
router.post(
  '/profile/password',
  authenticateToken,
  validateRequest({ body: changePasswordBodySchema }),
  changePassword
);

// Verify route now fully protected
router.get('/verify', authenticateToken, verifyAuth);

/**
 * API keys — the credential a non-browser client acts with.
 *
 * Every route is the caller's own keys: the owner is taken from the session and
 * used to scope the query, never read from the path, so there is no route here
 * that can reach someone else's key.
 *
 * `authenticateToken` is auth-service's own, which re-checks `tokenVersion`
 * against the database — so a session invalidated by a password change cannot
 * still be used to mint a long-lived credential.
 *
 * Deliberately not reachable with an API key. `apiKeyAuth` is not mounted in
 * this service at all, so a key cannot be used to issue, reveal or revoke
 * another: escalating one credential into a fresh one with wider scopes would
 * make every scope on every key advisory.
 */
router.post(
  '/api-keys',
  keyLimiter,
  authenticateToken,
  validateRequest({ body: createApiKeyBodySchema }),
  createKey
);
router.get('/api-keys', authenticateToken, listKeys);
// POST, not GET: it mutates (reveals are counted), and a URL that returns a
// live credential ends up in browser history, referrer headers and access logs.
router.post('/api-keys/:id/reveal', keyLimiter, authenticateToken, revealKey);
router.post('/api-keys/:id/revoke', authenticateToken, revokeKey);
router.delete('/api-keys/:id', authenticateToken, removeKey);

// Internal service endpoints for token management
router.post(
  '/internal/invalidate-tokens',
  requireInternalServiceToken,
  validateRequest({ body: invalidateUserTokensBodySchema }),
  invalidateUserTokens
);

// What a connected assistant has done, and what it cost. Session-scoped, like
// the keys and connections it sits beside.
router.get('/tool-usage', authenticateToken, getToolUsage);
router.get('/tool-calls', authenticateToken, getToolCalls);

// List users (admin)
router.get('/admin/users', authenticateToken, requireRole('admin'), listUsers);

export default router;
