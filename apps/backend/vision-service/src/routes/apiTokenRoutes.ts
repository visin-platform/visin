import express from 'express';
import { createToken, getTokens, revokeToken } from '../controllers/apiTokenController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require authentication (JWT)
router.use(authMiddleware);

router.post('/', createToken);
router.get('/project/:projectId', getTokens);
router.delete('/:id', revokeToken);

export default router;
