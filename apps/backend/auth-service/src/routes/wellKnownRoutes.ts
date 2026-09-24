import express from 'express';
import { authorizationServerMetadata } from '../controllers/oauthController';

const router = express.Router();

// RFC 8414. Served at the issuer root, not under /oauth, because that is where
// a client looks for it — it is the first thing read in the flow and it is
// unauthenticated by design, revealing only which endpoints exist.
router.get('/oauth-authorization-server', authorizationServerMetadata);

export default router;
