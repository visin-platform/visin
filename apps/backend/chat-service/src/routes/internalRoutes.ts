import { requireInternalServiceToken } from '@visin/backend-core';
import { Router } from 'express';
import { notifyRunFinished } from '../services/runAlerts';
import { runFinishedSchema } from '../validation/runAlertSchemas';
import { parsed } from '../validation/parse';

/**
 * Calls from other Visin services, by the shared internal token and never by a person's session. Mounted ahead of
 * the user authentication, so each route here carries its own gate.
 */
export function createInternalRoutes() {
  const router = Router();
  router.post('/internal/run-finished', requireInternalServiceToken, async (req, res) => {
    const delivered = await notifyRunFinished(parsed(runFinishedSchema, req.body));
    res.json({ success: true, data: { delivered } });
  });
  return router;
}
