import { defaultAssistantFor } from './assistantService';
import { usableAssistant } from './assistantAvailability';
import { flushMembershipEvents } from './membershipAudit';
import { BadRequestError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import { type Request } from 'express';
import { Assistant } from '../models/Assistant';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { authorize, historyFilter } from './access';
import { AssistantRun } from '../models/AssistantRun';
import { id } from '../validation/commonSchemas';
import { attachmentSummary } from './attachments';
import { verifyAttachments } from './attachments';
import { appendMessage } from './messages';
import { notifyNewMessage } from './pushNotify';
import { assistantStatus } from './settings';
import { requireSharedBot, sharedEnabled } from './sharedAssistants';
import { actorName } from '../utils/request';
import { messageCursorSchema, readSequenceSchema, sendSchema, reactionSchema } from '../validation/messageSchemas';
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
  await redactQuotes(rows);
  return rows.reverse();
}

export async function sendMessage(req: Request, conversationId: string, body: unknown) {
  const c = await authorize(req, conversationId, true),
    input = parsed(sendSchema, body);
  const existing = await Message.findOne({ conversationId: c.id, clientId: input.clientId, senderId: req.user!.id });
  if (existing) {
    await redactQuotes([existing]);
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
    ? await Message.findOne({
        _id: input.replyTo,
        conversationId: c.id,
        unsentAt: null,
        ...historyFilter(c, req.user!.id)
      })
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
  // A quote never invokes a bot in a conversation between people.
  const invocation = input.assistantId;
  const sharedBot = invocation ? await requireSharedBot(c, invocation) : null;
  if (sharedBot && !sharedEnabled(c))
    throw new ForbiddenError('Shared assistants require agreement or administrator enablement');
  if ((c.kind === 'assistant' || sharedBot) && !(await assistantStatus()).ready)
    throw new BadRequestError('The assistant is not configured. Human messaging is available.');
  // Older generic analysis threads adopt the effective default on their next question.
  // The conditional write pins it once, so a later preference change cannot silently replace this thread's bot.
  if (c.kind === 'assistant' && !c.assistantId) {
    const preferred = await defaultAssistantFor(req.user!.id);
    if (preferred) {
      const bound = await Conversation.findOneAndUpdate(
        { _id: c.id, assistantId: null, deletedAt: null },
        { $set: { assistantId: preferred.id } },
        { returnDocument: 'after' }
      ).select('assistantId');
      c.assistantId = (bound ?? (await Conversation.findById(c.id).select('assistantId')))?.assistantId;
    }
  }
  const selectedAssistant = c.assistantId
    ? await Assistant.findOne({ _id: c.assistantId, ...usableAssistant(req.user!.id) })
    : null;
  if (c.assistantId && !selectedAssistant) throw new BadRequestError('This assistant is paused or removed');
  const { assistantId: _invocation, screen, attachments: refs, ...messageInput } = input;
  // Described from what file-service holds, not from what the browser said.
  const attachments = await verifyAttachments(c.id, c.kind, refs ?? []);
  const message = await appendMessage({
    expectedMembershipVersion: c.membershipVersion,
    conversationId: c.id,
    senderId: req.user!.id,
    senderName: actorName(req),
    kind: 'person',
    ...messageInput,
    ...(attachments.length ? { attachments } : {}),
    ...(reply
      ? {
          quote: {
            messageId: reply.id,
            senderName: reply.senderName,
            body: (reply.body || attachmentSummary(reply.attachments ?? []) || 'Message').slice(0, 500),
            kind: reply.kind
          }
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
            membershipVersion: c.membershipVersion,
            // Only a private thread has a page to move; a shared conversation never gets the screen tool.
            ...(c.kind === 'assistant' && screen ? { screen } : {})
          }
        }
      : {})
  });
  const {
    assistantRequest: _request,
    screenRequest: _screenRequest,
    assistantCancelled: _cancelled,
    ...view
  } = message.toObject();
  // Not awaited: the message is stored, and a notification must never slow or fail the send.
  void notifyNewMessage(c, {
    conversationId: c.id,
    senderId: req.user!.id,
    senderName: actorName(req),
    body: message.body,
    attachments: message.attachments ?? [],
    seq: message.seq,
    createdAt: message.createdAt
  });
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

/** Redact quoted snapshots at read time too, including replies racing an unsend. */
export async function redactQuotes(
  rows: { conversationId: string; quote?: { messageId: string; body: string; unsent?: boolean | null } | null }[]
) {
  const ids = [...new Set(rows.flatMap((row) => (row.quote ? [row.quote.messageId] : [])))];
  if (!ids.length) return;
  const removed = new Set(
    (
      await Message.find({ conversationId: rows[0].conversationId, _id: { $in: ids }, unsentAt: { $ne: null } })
        .select('_id')
        .lean()
    ).map((row) => String(row._id))
  );
  for (const row of rows)
    if (row.quote && removed.has(row.quote.messageId)) {
      row.quote.body = 'Message unsent';
      row.quote.unsent = true;
    }
}

async function visibleMessage(req: Request, conversationId: string, messageId: unknown) {
  const conversation = await authorize(req, conversationId, true);
  const message = await Message.findOne({
    _id: parsed(id, messageId),
    conversationId: conversation.id,
    ...historyFilter(conversation, req.user!.id)
  });
  if (!message) throw new NotFoundError('Message not found');
  return { conversation, message };
}

export async function react(req: Request, conversationId: string, messageId: unknown, body: unknown) {
  const { emoji } = parsed(reactionSchema, body);
  const { conversation, message } = await visibleMessage(req, conversationId, messageId);
  const others = {
    $filter: {
      input: { $ifNull: ['$reactions', []] },
      as: 'reaction',
      cond: { $ne: ['$$reaction.userId', req.user!.id] }
    }
  };
  const updated = await Message.findOneAndUpdate(
    {
      _id: message._id,
      unsentAt: null,
      kind: { $ne: 'system' },
      ...(emoji ? { $expr: { $lt: [{ $size: others }, 200] } } : {})
    },
    [
      {
        $set: {
          reactions: { $concatArrays: [others, emoji ? [{ userId: req.user!.id, emoji }] : []] },
          revision: { $add: [{ $ifNull: ['$revision', 0] }, 1] }
        }
      }
    ],
    { returnDocument: 'after', updatePipeline: true }
  );
  if (!updated) throw new BadRequestError('This message cannot receive that reaction');
  await Conversation.updateOne({ _id: conversation._id }, { $inc: { messageVersion: 1 } });
  await redactQuotes([updated]);
  return updated;
}

export async function unsend(req: Request, conversationId: string, messageId: unknown) {
  const { conversation, message } = await visibleMessage(req, conversationId, messageId);
  if (message.kind !== 'person' || message.senderId !== req.user!.id)
    throw new ForbiddenError('You can only unsend your own messages');
  await Message.updateOne(
    { _id: message._id, unsentAt: null },
    {
      $set: { unsentAt: new Date(), body: '', reactions: [], evidence: [], suggestions: [], assistantCancelled: true },
      $unset: { attachments: 1, quote: 1, assistantRequest: 1, screenRequest: 1 },
      $inc: { revision: 1 }
    }
  );
  await AssistantRun.updateMany(
    {
      conversationId: conversation.id,
      messageId: message.id,
      state: { $in: ['queued', 'screen_queued', 'running', 'completed'] },
      published: { $ne: true }
    },
    {
      $set: { state: 'cancelled', finishedAt: new Date(), activity: 'Question unsent' },
      $unset: { draft: 1, result: 1 }
    }
  );
  await Message.updateMany(
    { conversationId: conversation.id, 'quote.messageId': message.id, 'quote.unsent': { $ne: true } },
    {
      $set: { 'quote.body': 'Message unsent', 'quote.unsent': true },
      $inc: { revision: 1 }
    }
  );
  await Conversation.updateOne({ _id: conversation._id }, { $inc: { messageVersion: 1 } });
  return await Message.findById(message._id);
}
