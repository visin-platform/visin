import { Router, Request, Response } from 'express';
import { validateToken, logout, verifyAuth, refreshToken, invalidateUserTokens } from '../controllers/authController';
import { getProfile, updateProfile } from '../controllers/profileController';
import { authenticateToken, requireRole, requireApproved } from '../middleware/authMiddleware';
import { User } from '../models/User';

const router = Router();

// Login route (public) – must remain public so user can obtain token
router.post('/validate', validateToken);

// Refresh token route (protected)
router.post('/refresh', authenticateToken, requireApproved, refreshToken);

// Protected logout
router.post('/logout', authenticateToken, requireApproved, logout);

// Protected routes
router.get('/profile', authenticateToken, requireApproved, getProfile);
router.put('/profile', authenticateToken, requireApproved, updateProfile);

// Verify route now fully protected
router.get('/verify', authenticateToken, requireApproved, verifyAuth);

// Internal service endpoints for token management
router.post('/internal/invalidate-tokens', invalidateUserTokens);

// Admin utilities (manual authorization): mark user approved
router.post('/admin/approve', authenticateToken, requireApproved, requireRole('admin'), (req: Request, res: Response): void => {
	(async () => {
		const { email } = req.body;
		if (!email) {
			res.status(400).json({ success: false, message: 'email required' });
			return;
		}
		const user = await User.findOneAndUpdate(
			{ email: email.toLowerCase() },
			{ $set: { isApproved: true } },
			{ new: true }
		);
		if (!user) {
			res.status(404).json({ success: false, message: 'User not found' });
			return;
		}
		res.json({ success: true, user });
	})().catch((err) => {
		console.error('approve error', err);
		res.status(500).json({ success: false, message: 'internal error' });
	});
});

// List users (admin)
router.get('/admin/users', authenticateToken, requireApproved, requireRole('admin'), (_req: Request, res: Response): void => {
	(async () => {
		const users = await User.find().sort({ createdAt: -1 }).limit(200);
		res.json({ success: true, users });
	})().catch((err) => {
		console.error('list users error', err);
		res.status(500).json({ success: false, message: 'internal error' });
	});
});

export default router;
