import { Router } from 'express';
import * as controller from '../controllers/runController';

/** Where a conversation's runs stand, for a page that polls. Vivi keeps the runs; chat decides who sees what of them. */
export function createRunRoutes() {
  const router = Router();
  router.get('/conversations/:id/runs', controller.listRuns);
  return router;
}
