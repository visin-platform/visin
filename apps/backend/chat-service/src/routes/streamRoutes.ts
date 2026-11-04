import { Router } from 'express';
import { createStreamController } from '../controllers/streamController';
export function createStreamRoutes() {
  const router = Router();
  router.get('/conversations/:id/events', createStreamController());
  return router;
}
