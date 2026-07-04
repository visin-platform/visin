import { Router } from 'express';
import {
  validateToken,
  logout,
  verifyAuth,
  refreshToken,
  invalidateUserTokens,
  approveUser,
  listUsers
} from '../controllers/authController';
import { getProfile, updateProfile } from '../controllers/profileController';
import { authenticateToken, requireRole, requireApproved } from '../middleware/authMiddleware';
import { requireInternalServiceToken } from '../middleware/internalServiceAuth';
import { validateRequest } from '@visin/backend-core';
import {
  validateTokenBodySchema,
  invalidateUserTokensBodySchema,
  approveUserBodySchema,
  updateProfileBodySchema
} from '../validation/authSchemas';

const router = Router();

// Login route (public) – must remain public so user can obtain token
router.post('/validate', validateRequest({ body: validateTokenBodySchema }), validateToken);

// Refresh token route (protected)
router.post('/refresh', authenticateToken, requireApproved, refreshToken);

// Protected logout
router.post('/logout', authenticateToken, requireApproved, logout);

// Protected routes
router.get('/profile', authenticateToken, requireApproved, getProfile);
router.put('/profile', authenticateToken, requireApproved, validateRequest({ body: updateProfileBodySchema }), updateProfile);

// Verify route now fully protected
router.get('/verify', authenticateToken, requireApproved, verifyAuth);

// Internal service endpoints for token management
router.post(
  '/internal/invalidate-tokens',
  requireInternalServiceToken,
  validateRequest({ body: invalidateUserTokensBodySchema }),
  invalidateUserTokens
);

// Admin utilities (manual authorization): mark user approved
router.post(
  '/admin/approve',
  authenticateToken,
  requireApproved,
  requireRole('admin'),
  validateRequest({ body: approveUserBodySchema }),
  approveUser
);

// List users (admin)
router.get('/admin/users', authenticateToken, requireApproved, requireRole('admin'), listUsers);

export default router;
