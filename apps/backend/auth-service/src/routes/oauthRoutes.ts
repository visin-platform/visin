import express, { Router } from 'express';
import { createRateLimiter } from '@visin/backend-core';
import {
  authorize,
  authorizeDecision,
  getConnections,
  registerOAuthClient,
  revokeConnection,
  token
} from '../controllers/oauthController';
import { authenticateToken, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

/**
 * A budget of its own rather than the shared `strictRateLimiter`.
 *
 * That export is a single instance, so every route using it draws on one
 * counter: someone hammering the login endpoint would lock an unrelated caller
 * out of client registration, and the two have nothing to do with each other.
 */
const registrationLimiter = createRateLimiter({ max: 20 });

/**
 * OAuth 2.1, for assistants connecting over MCP.
 *
 * `/authorize` uses `optionalAuth` rather than `authenticateToken`: an
 * unauthenticated visitor is not an error here, it is someone who needs to sign
 * in first, and the handler bounces them through the ordinary login.
 */
router.get('/authorize', optionalAuth, authorize);

// The consent form posts back as an ordinary HTML form, not JSON — so it needs
// urlencoded parsing, which the service does not mount globally. Unlike the GET
// there is no anonymous path here: anyone submitting a decision has already
// been through login, so this requires a real session.
router.post(
  '/authorize',
  express.urlencoded({ extended: false }),
  authenticateToken,
  authorizeDecision
);

// Both unauthenticated by design: registration grants nothing on its own, and
// the token endpoint authenticates by the code or refresh token it carries.
router.post('/register', registrationLimiter, registerOAuthClient);
router.post('/token', express.urlencoded({ extended: false }), token);

// Managing what you have connected. Session-only, like the API key routes —
// a connected app must not be able to enumerate or cut its siblings.
router.get('/connections', authenticateToken, getConnections);
router.delete('/connections/:clientId', authenticateToken, revokeConnection);

export default router;
