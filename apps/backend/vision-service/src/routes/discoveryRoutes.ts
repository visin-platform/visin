import { Router } from 'express';
import { getDiscovery } from '../controllers/discoveryController';
import { optionalAuthMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Open to anyone, like the rest of the public reads: a client has to learn where the other
// services are before it can sign in to them. A credential only adds what it says about itself.
router.get('/visin', optionalAuthMiddleware, getDiscovery);

export default router;
