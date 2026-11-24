import { z } from 'zod';

/**
 * What the assistant service sends to chat's internal API (`/internal/assistant`). Chat takes only these: an assistant
 * publishes an answer or a line, takes a question's request back, and records what it did, and nothing else of chat's
 * is its to change.
 */
const id = z.string().min(1).max(120);

export const appendAssistantMessageSchema = z.strictObject({
  expectedMembershipVersion: z.number().int().min(0).optional(),
  conversationId: id,
  senderId: id,
  senderName: z.string().min(1).max(200),
  kind: z.enum(['assistant', 'system']),
  body: z.string().max(20000),
  clientId: z.string().min(1).max(200),
  replyTo: id.optional(),
  // No count limit on these: an answer records one entry per lookup it made, however many that was, and the
  // assistant service is the only caller. A limit here would make a long answer unpublishable, for good.
  evidence: z.array(z.strictObject({ tool: z.string().max(200), input: z.unknown(), at: z.coerce.date() })).optional(),
  thoughts: z.array(z.strictObject({ text: z.string().max(20000), at: z.coerce.date() })).optional()
});

export const cancelRequestsSchema = z.union([
  z.strictObject({ messageId: id }),
  z.strictObject({ conversationId: id, senderId: id, messageIds: z.array(id).max(500) }),
  z.strictObject({ assistantId: id })
]);

export const findingBodySchema = z.strictObject({ findingId: id });

export const conversationContextSchema = z.strictObject({
  userId: id,
  trainingIds: z.array(id).max(20),
  // A run's name is whatever vision-service holds, which sets no length.
  trainingLabels: z.array(z.strictObject({ id, name: z.string() })).max(20)
});

export const sharedAssistantsSaveSchema = z.strictObject({
  expectedVersion: z.number().int().min(0),
  botIds: z.array(id).max(5),
  policy: z.strictObject({
    enabled: z.boolean(),
    lockedOff: z.boolean(),
    whoCanAdd: z.enum(['everyone', 'admins']).optional(),
    consents: z.array(z.strictObject({ userId: id, audience: z.string().max(200) })).max(200)
  }),
  // The line that tells the members what changed, written with the change in the same request: a change saved
  // without it would leave the members unaware, and a retry would be refused as a stale one.
  announce: z.strictObject({ senderId: id, senderName: z.string().min(1).max(200), body: z.string().min(1).max(2000) }).optional()
});
