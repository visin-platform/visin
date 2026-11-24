import { requireInternalServiceToken } from '@visin/backend-core';
import { Router } from 'express';
import {
  ackRequest,
  cancelRequests,
  saveSharedAssistants,
  setConversationContext,
  setMessageFinding
} from '../services/assistantApi';
import { appendMessage } from '../services/messages';
import {
  appendAssistantMessageSchema,
  cancelRequestsSchema,
  conversationContextSchema,
  findingBodySchema,
  sharedAssistantsSaveSchema
} from '../validation/internalAssistantSchemas';
import { parsed } from '../validation/parse';
import { notify } from '../services/wakeBus';

/**
 * The assistant service changing chat's data: by the shared internal token, never by a person's session, and only these
 * operations. Mounted ahead of the user authentication, so each route carries its own gate. The assistant service has
 * checked the person's access to a conversation by reading it; chat re-checks nothing it is told to carry out, and
 * does only what it would do for itself: a message gets its sequence, wakes the streams and is idempotent by its
 * `clientId`.
 */
export function createAssistantInternalRoutes() {
  const router = Router();
  const base = '/internal/assistant';
  router.post(`${base}/messages`, requireInternalServiceToken, async (req, res) => {
    const input = parsed(appendAssistantMessageSchema, req.body);
    const message = await appendMessage(input);
    res.json({ success: true, data: { id: message.id } });
  });
  router.post(`${base}/messages/cancel-requests`, requireInternalServiceToken, async (req, res) => {
    const selector = parsed(cancelRequestsSchema, req.body);
    await cancelRequests(selector);
    // A person may be watching the question they sent: tell their stream it was taken back.
    if ('conversationId' in selector) notify(`conv:${selector.conversationId}`);
    res.json({ success: true, data: {} });
  });
  router.post(`${base}/messages/:id/ack`, requireInternalServiceToken, async (req, res) => {
    await ackRequest(String(req.params.id));
    res.json({ success: true, data: {} });
  });
  router.post(`${base}/messages/:id/finding`, requireInternalServiceToken, async (req, res) => {
    await setMessageFinding(String(req.params.id), parsed(findingBodySchema, req.body).findingId);
    res.json({ success: true, data: {} });
  });
  router.post(`${base}/conversations/:id/context`, requireInternalServiceToken, async (req, res) => {
    const updated = await setConversationContext({ conversationId: String(req.params.id), ...parsed(conversationContextSchema, req.body) });
    res.json({ success: true, data: { updated } });
  });
  router.post(`${base}/conversations/:id/shared-assistants`, requireInternalServiceToken, async (req, res) => {
    const { expectedVersion, botIds, policy, announce } = parsed(sharedAssistantsSaveSchema, req.body);
    const conversationId = String(req.params.id);
    const saved = await saveSharedAssistants({ conversationId, expectedVersion, botIds, policy });
    // Idempotent by the version the change made, like any message from the assistant service.
    if (saved && announce)
      await appendMessage({
        conversationId,
        ...announce,
        kind: 'system',
        clientId: `policy:${conversationId}:${saved.membershipVersion}`
      });
    res.json({ success: true, data: { saved } });
  });
  return router;
}
