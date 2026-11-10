import { Router } from 'express';
import * as controller from '../controllers/callController';
import { createUserStreamController } from '../controllers/userStreamController';
import type { ChatRateLimits } from './rateLimits';

export function createCallRoutes(limits: ChatRateLimits) {
  const router = Router();
  const { callStartLimit, signalLimit } = limits;
  router.get('/calls/config', controller.config);
  router.get('/calls/ice-servers', controller.requireCallsEnabled, controller.iceServers);
  router.get('/calls/current', controller.requireCallsEnabled, controller.current);
  router.post('/conversations/:id/calls', controller.requireCallsEnabled, callStartLimit, controller.start);
  router.post('/calls/:callId/accept', controller.requireCallsEnabled, controller.accept);
  router.post('/calls/:callId/decline', controller.requireCallsEnabled, controller.decline);
  router.post('/calls/:callId/end', controller.requireCallsEnabled, controller.end);
  router.post('/calls/:callId/signal', controller.requireCallsEnabled, signalLimit, controller.signal);
  router.get('/events', createUserStreamController());
  return router;
}
