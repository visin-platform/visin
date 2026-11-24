import { requireInternalServiceToken } from '@visin/backend-core';
import { Router } from 'express';
import { parsed } from '../validation/parse';
import {
  cancelMessageRunsSchema,
  cancelRunsSchema,
  capabilitiesQuerySchema,
  prepareQuestionSchema,
  resolveAssistantSchema
} from '../validation/internalSchemas';
import { assistantCapabilities } from '../services/capabilities';
import { prepareQuestion, resolveAssistant } from '../services/questions';
import { cancelMessageRuns, cancelRunsFor } from '../services/runService';

/**
 * What chat asks of Vivi, by the shared internal token and never by a person's session: whether a message may be put
 * to an assistant, which assistant a person means, and cancelling questions. Mounted ahead of the user authentication,
 * so each route carries its own gate. Chat has already authorized the person for the conversation it names.
 */
export function createInternalRoutes() {
  const router = Router();
  router.post('/internal/questions/prepare', requireInternalServiceToken, async (req, res) => {
    res.json({ success: true, data: await prepareQuestion(parsed(prepareQuestionSchema, req.body)) });
  });
  router.post('/internal/assistants/resolve', requireInternalServiceToken, async (req, res) => {
    res.json({ success: true, data: await resolveAssistant(parsed(resolveAssistantSchema, req.body)) });
  });
  router.post('/internal/runs/cancel', requireInternalServiceToken, async (req, res) => {
    await cancelRunsFor(parsed(cancelRunsSchema, req.body));
    res.json({ success: true, data: {} });
  });
  router.post('/internal/runs/cancel-message', requireInternalServiceToken, async (req, res) => {
    await cancelMessageRuns(parsed(cancelMessageRunsSchema, req.body));
    res.json({ success: true, data: {} });
  });
  router.get('/internal/capabilities', requireInternalServiceToken, async (req, res) => {
    const { userId } = parsed(capabilitiesQuerySchema, req.query);
    res.json({ success: true, data: await assistantCapabilities(userId) });
  });
  return router;
}
