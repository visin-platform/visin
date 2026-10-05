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
  listUsers,
  searchUsers
} from '../controllers/authController';
import { getProfile, updateProfile, changePassword } from '../controllers/profileController';
import {
  getPublicUser,
  getSitemap,
  listPublicUsers,
  getUserShare,
  lookupPublicUsers,
  searchPublicUsers
} from '../controllers/publicUserController';
import { linkGoogle } from '../controllers/googleLinkController';
import { listSessions, revokeSession, revokeOtherSessions } from '../controllers/sessionController';
import { createKey, listKeys, revealKey, revokeKey, removeKey } from '../controllers/apiKeyController';
import { getToolCalls, getToolUsage } from '../controllers/auditController';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { requireInternalServiceToken } from '../middleware/internalServiceAuth';
import { createRateLimiter, validateRequest } from '@visin/backend-core';
import {
  validateTokenBodySchema,
  linkGoogleBodySchema,
  invalidateUserTokensBodySchema,
  searchUsersQuerySchema,
  handleParamsSchema,
  directoryQuerySchema,
  peopleSearchQuerySchema,
  publicUsersBodySchema,
  updateProfileBodySchema,
  changePasswordBodySchema,
  setupBodySchema,
  registerBodySchema,
  loginBodySchema,
  createApiKeyBodySchema,
  sessionIdParamsSchema
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

/** Public pages are read by anyone, so a crawler gets a budget of its own rather than the shared one. */
const publicLimiter = createRateLimiter({ max: 120 });

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
 * Signed-in devices: the caller's own browser sessions. Session-only, like the
 * API-key routes below — `apiKeyAuth` is not mounted here.
 */
router.get('/sessions', authenticateToken, listSessions);
router.post('/sessions/revoke-others', authenticateToken, revokeOtherSessions);
router.delete('/sessions/:id', authenticateToken, validateRequest({ params: sessionIdParamsSchema }), revokeSession);

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

// Finding people for the app's search. Public, like the pages it finds.
router.get('/users', publicLimiter, validateRequest({ query: peopleSearchQuerySchema }), searchPublicUsers);

// Everyone with a public page, a page at a time: the app's People directory.
router.get('/directory', publicLimiter, validateRequest({ query: directoryQuerySchema }), listPublicUsers);

// The public pages' addresses, which the app's robots.txt points search engines at.
router.get('/sitemap.xml', publicLimiter, getSitemap);

// What a chat or a feed unfurls for a link to a person's page.
router.get('/share/users/:handle', publicLimiter, validateRequest({ params: handleParamsSchema }), getUserShare);

// A person's public page. No sign-in: it is what a visitor opens from a project's owner.
router.get('/users/:handle', publicLimiter, validateRequest({ params: handleParamsSchema }), getPublicUser);

// Internal: names and avatars for the owners of what vision- and dataset-service list.
router.post(
  '/internal/users/public',
  requireInternalServiceToken,
  validateRequest({ body: publicUsersBodySchema }),
  lookupPublicUsers
);

// Internal: group-service's "Add member" search.
router.get('/internal/users/search', requireInternalServiceToken, validateRequest({ query: searchUsersQuerySchema }), searchUsers);

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
