import { Router } from 'express';
import * as controller from '../controllers/discoveryController';
import type { ChatRateLimits } from './rateLimits';

export function createDiscoveryRoutes(limits: ChatRateLimits) {
  const router = Router();
  const { inviteLimit } = limits;
  router.get('/capabilities', controller.getCapabilities);
  router.get('/groups', controller.listGroups);
  router.get('/projects', controller.listProjects);
  router.get('/contacts', inviteLimit, controller.listContacts);
  router.get('/people/:handle', inviteLimit, controller.getPerson);
  return router;
}
