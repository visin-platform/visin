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
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { requireInternalServiceToken } from '../middleware/internalServiceAuth';
import { validateRequest } from '@visin/backend-core';
import {
  validateTokenBodySchema,
  invalidateUserTokensBodySchema,
  updateProfileBodySchema,
  changePasswordBodySchema,
  setupBodySchema,
  registerBodySchema,
  loginBodySchema
} from '../validation/authSchemas';

const router = Router();

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
router.put('/profile', authenticateToken, validateRequest({ body: updateProfileBodySchema }), updateProfile);
router.post(
  '/profile/password',
  authenticateToken,
  validateRequest({ body: changePasswordBodySchema }),
  changePassword
);

// Verify route now fully protected
router.get('/verify', authenticateToken, verifyAuth);

// Internal service endpoints for token management
router.post(
  '/internal/invalidate-tokens',
  requireInternalServiceToken,
  validateRequest({ body: invalidateUserTokensBodySchema }),
  invalidateUserTokens
);

// List users (admin)
router.get('/admin/users', authenticateToken, requireRole('admin'), listUsers);

export default router;
