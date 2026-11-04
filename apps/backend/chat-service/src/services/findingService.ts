import {
  BadGatewayError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  createApiKey,
  deleteApiKey,
  fetchWithTimeout,
  logger
} from '@visin/backend-core';
import { type Request } from 'express';
import { Message } from '../models/Message';
import { authorize, endpoint } from './access';
import { actorName } from '../utils/request';
import { saveFindingSchema } from '../validation/messageSchemas';
import { parsed } from '../validation/parse';

export async function saveFinding(req: Request, conversationId: string, body: unknown) {
  const c = await authorize(req, conversationId, true);
  const input = parsed(saveFindingSchema, body);
  if (c.kind !== 'assistant' || !c.projectId) throw new BadRequestError('Save findings from a project analysis');
  const message = await Message.findOne({ _id: input.messageId, conversationId: c.id, kind: 'assistant' });
  if (!message) throw new NotFoundError('Assistant answer not found');
  if (message.findingId) {
    return { _id: message.findingId };
  }
  // The write credential exists only for this deliberate save, never in the model's tool surface.
  const key = await createApiKey({
    userId: req.user!.id,
    userEmail: req.user!.email || '',
    userName: actorName(req),
    name: 'Visin analyst',
    scopes: ['analysis:write'],
    project: { id: c.projectId, name: c.projectName || c.title },
    expiresAt: new Date(Date.now() + 60000)
  });
  try {
    const response = await fetchWithTimeout(`${endpoint('VISION')}/api/findings`, {
      method: 'POST',
      timeoutMs: 10000,
      serviceName: 'vision-service',
      headers: { authorization: `Bearer ${key.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        project: c.projectId,
        title: input.title,
        body: input.body,
        recommendations: input.recommendations,
        trainingIds: [
          ...new Set([
            ...c.trainingIds,
            ...message.evidence.flatMap((e) => {
              const args = e.input as Record<string, unknown> | undefined;
              return [args?.training, ...(Array.isArray(args?.trainings) ? args.trainings : [])].filter(
                (id): id is string => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)
              );
            })
          ])
        ],
        sourceId: `chat:${message.id}`
      })
    });
    if (response.status === 403) throw new ForbiddenError('Project edit permission is required to save a finding');
    if (!response.ok) {
      // A refusal says why (a removed run, a title too long); an outage is the peer's, not the request's.
      const detail = ((await response.json().catch(() => ({}))) as { message?: unknown }).message;
      if (response.status >= 500 || typeof detail !== 'string') throw new BadGatewayError('Could not save finding');
      throw new BadRequestError(detail);
    }
    const finding = ((await response.json()) as { data: { _id: string } }).data;
    await Message.updateOne({ _id: message.id }, { $set: { findingId: finding._id } });
    return finding;
  } finally {
    // It expires within a minute anyway; a failed cleanup must not hide the save's own outcome.
    await deleteApiKey(req.user!.id, key.summary.id).catch((error: unknown) =>
      logger.warn('Could not delete temporary finding key', {
        error: error instanceof Error ? error.message : 'Unknown failure'
      })
    );
  }
}
