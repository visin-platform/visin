import { Router } from 'express';
import { createRateLimiter, validateRequest } from '@visin/backend-core';
import { getPublic, getShare, getPicture, getSitemap, listPublic, searchPublic } from '../controllers/publicGroupController';
import { directoryQuerySchema, groupsSearchQuerySchema, handleParamsSchema } from '../validation/groupSchemas';

const router = Router();

/** Read by anyone, so a crawler gets a budget of its own rather than the shared one. */
const publicLimiter = createRateLimiter({ max: 120 });

router.get('/directory', publicLimiter, validateRequest({ query: directoryQuerySchema }), listPublic);
// What a public page's `<img>` loads: anyone, so a budget of its own like the other public reads.
router.get('/avatars/:groupId', createRateLimiter({ max: 600 }), getPicture);
router.get('/sitemap.xml', publicLimiter, getSitemap);
router.get('/groups', publicLimiter, validateRequest({ query: groupsSearchQuerySchema }), searchPublic);
router.get('/share/groups/:handle', publicLimiter, validateRequest({ params: handleParamsSchema }), getShare);
router.get('/groups/:handle', publicLimiter, validateRequest({ params: handleParamsSchema }), getPublic);

export default router;
