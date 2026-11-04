import { usableAssistant } from './assistantAvailability';
import { flushMembershipEvents } from './membershipAudit';
import { BadRequestError, ForbiddenError } from '@visin/backend-core';
import { type Request } from 'express';
import { Assistant } from '../models/Assistant';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { authorize, historyFilter } from './access';
import { appendMessage } from './messages';
import { assistantStatus } from './settings';
import { requireSharedBot, sharedEnabled } from './sharedAssistants';
import { actorName } from '../utils/request';
import { messageCursorSchema, readSequenceSchema, sendSchema } from '../validation/messageSchemas';
import { parsed } from '../validation/parse';

export async function listMessages(req: Request, conversationId: string, beforeValue: unknown) {
  const c = await authorize(req, conversationId);
  await flushMembershipEvents(conversationId);
  const before = beforeValue === undefined ? undefined : parsed(messageCursorSchema, beforeValue);
  const rows = await Message.find({
    conversationId: c.id,
    $and: [historyFilter(c, req.user!.id), ...(before ? [{ seq: { $lt: before } }] : [])]
  })
    .sort({ seq: -1 })
    .limit(50);
  return rows.reverse();
}

export async function sendMessage(req: Request, conversationId: string, body: unknown) {
  const c = await authorize(req, conversationId, true),
    input = parsed(sendSchema, body);
  const existing = await Message.findOne({ conversationId: c.id, clientId: input.clientId, senderId: req.user!.id });
  if (existing) {
    return { message: existing, created: false };
  }
  if (await Message.exists({ conversationId: c.id, clientId: input.clientId }))
    throw new BadRequestError('Message retry identifier already used');
  if (c.kind === 'direct' && c.participants.some((p) => p.state !== 'active')) {
    const claimed = await Conversation.updateOne(
      { _id: c.id, $or: [{ requestSent: false }, { requestClientId: input.clientId }] },
      { $set: { requestSent: true, requestClientId: input.clientId } }
    );
    if (!claimed.matchedCount) throw new ForbiddenError('Wait for the message request to be accepted');
  }
  const reply = input.replyTo
    ? await Message.findOne({ _id: input.replyTo, conversationId: c.id, ...historyFilter(c, req.user!.id) })
    : null;
  if (input.replyTo && !reply) throw new BadRequestError('Reply is not in your visible conversation');
  // A quoted snapshot is newly published content: every current room reader must be able to see its source.
  if (
    reply &&
    c.kind === 'room' &&
    reply.seq <= Math.max(0, ...c.participants.filter((p) => p.state === 'active').map((p) => p.joinedSeq))
  )
    throw new BadRequestError('Reply to a message everyone in this room can see');
  if (input.assistantId && c.kind === 'assistant')
    throw new BadRequestError('This private thread already has its assistant');
  const replied = c.kind !== 'assistant' && !input.assistantId && reply?.kind === 'assistant' ? reply : null;
  const invocation =
    input.assistantId ||
    (replied?.senderId.startsWith('assistant:') ? replied.senderId.slice('assistant:'.length) : undefined);
  const sharedBot = invocation ? await requireSharedBot(c, invocation) : null;
  if (sharedBot && !sharedEnabled(c))
    throw new ForbiddenError('Shared assistants require agreement or administrator enablement');
  if ((c.kind === 'assistant' || sharedBot) && !(await assistantStatus()).ready)
    throw new BadRequestError('The assistant is not configured. Human messaging is available.');
  const selectedAssistant = c.assistantId
    ? await Assistant.findOne({ _id: c.assistantId, ...usableAssistant(req.user!.id) })
    : null;
  if (c.assistantId && !selectedAssistant) throw new BadRequestError('This assistant is paused or removed');
  const { assistantId: _invocation, ...messageInput } = input;
  const message = await appendMessage({
    expectedMembershipVersion: c.membershipVersion,
    conversationId: c.id,
    senderId: req.user!.id,
    senderName: actorName(req),
    kind: 'person',
    ...messageInput,
    ...(reply
      ? {
          quote: { messageId: reply.id, senderName: reply.senderName, body: reply.body.slice(0, 500), kind: reply.kind }
        }
      : {}),
    ...(c.kind === 'assistant' || sharedBot
      ? {
          assistantRequest: {
            userId: req.user!.id,
            email: req.user!.email || '',
            name: actorName(req),
            assistantId: sharedBot?.assistantId || selectedAssistant?.id,
            assistantName: sharedBot?.name || selectedAssistant?.name,
            personality: sharedBot?.personality || selectedAssistant?.personality,
            membershipVersion: c.membershipVersion
          }
        }
      : {})
  });
  const { assistantRequest: _request, assistantCancelled: _cancelled, ...view } = message.toObject();
  return { message: view, created: true };
}

export async function markRead(req: Request, conversationId: string, seqValue: unknown) {
  const c = await authorize(req, conversationId);
  const seq = parsed(readSequenceSchema(c.seq), seqValue);
  if (['group', 'project'].includes(c.kind))
    await Conversation.updateOne(
      { _id: c.id, 'participants.userId': { $ne: req.user!.id } },
      {
        $push: {
          participants: {
            userId: req.user!.id,
            name: actorName(req),
            state: 'active',
            role: 'member',
            joinedAt: new Date(),
            joinedSeq: 0,
            readSeq: 0
          }
        }
      }
    );
  await Conversation.updateOne(
    { _id: c.id, participants: { $elemMatch: { userId: req.user!.id, state: 'active' } } },
    { $max: { 'participants.$.readSeq': seq } }
  );
  return;
}
