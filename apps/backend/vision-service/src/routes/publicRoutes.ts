import express from 'express';
import { createRateLimiter, validateRequest } from '@visin/backend-core';
import {
  getPublicBadge,
  getPublicEvaluation,
  getPublicLeaderboard,
  getPublicLeaderboards
} from '../controllers/publicLeaderboardController';
import { getPublicActivity } from '../controllers/publicActivityController';
import { activityQuerySchema } from '../validation/activitySchemas';
import { publicBadgeParamsSchema, publicBadgeQuerySchema, publicLeaderboardParamsSchema, leaderboardPageQuerySchema, leaderboardQuerySchema } from '../validation/evaluationSchemas';

const router = express.Router();

// A badge is embedded in READMEs and model cards, and fetched for every view by a few shared proxies, so it has a limit
// of its own, well above the pages', and may be kept for a minute by whoever fetches it (see the controller). What a
// withdrawal leaves behind is bounded by that minute; the pages below are never kept.
router.get(
  '/badges/:slug/:version/:checkpointKey.svg',
  createRateLimiter({ windowMs: 60_000, max: 1200 }),
  validateRequest({ params: publicBadgeParamsSchema, query: publicBadgeQuerySchema }),
  getPublicBadge
);

// Anonymous, so rate limited by client address; and never cached by anyone, so a withdrawal is not left standing in a
// browser, a proxy or a CDN. The server remembers what it computed (`publicCache.ts`) and forgets it on every change.
router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get('/leaderboards', validateRequest({ query: leaderboardPageQuerySchema }), getPublicLeaderboards);
router.get(
  '/leaderboards/:slug/:version',
  validateRequest({ params: publicLeaderboardParamsSchema, query: leaderboardQuerySchema }),
  getPublicLeaderboard
);
router.get('/evaluations/:id', getPublicEvaluation);
// What a person or a group has been doing in public, derived on each request (so never stale, and a project made
// private is gone from it at once). See the service.
router.get('/activity', validateRequest({ query: activityQuerySchema }), getPublicActivity);

export default router;
