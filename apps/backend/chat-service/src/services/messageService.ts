import * as assistants from './assistantClient';
import { verifyAbout } from './analysisContext';
import { flushMembershipEvents } from './membershipAudit';
import { BadRequestError, ForbiddenError, NotFoundError, logger } from '@visin/backend-core';
import { type Request } from 'express';
import { Conversation } from '../models/Conversation';
import { ConversationHidden } from '../models/ConversationHidden';
import { Message } from '../models/Message';
import { redactQuotes } from './quotes';
import { authorize, historyFilter } from './access';
import { id } from '../validation/commonSchemas';
import { attachmentSummary } from './attachments';
import { verifyAttachments } from './attachments';
import { appendMessage } from './messages';
import { notifyNewMessage } from './pushNotify';
import { notify } from './wakeBus';
import { actorName } from '../utils/request';
import {
  messageCursorSchema,
  readSequenceSchema,
  reactionSchema,
  searchQuerySchema,
  sendSchema
} from '../validation/messageSchemas';
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

/** Messages shown per search, newest first; the person asks for more by passing the oldest `seq` as `before`. */
const SEARCH_PAGE = 30;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Messages in one conversation whose text contains the term, in any case, newest first. A plain substring match,
 * since people type the start of a word. Only what the person may already read: the same filter as the history, and
 * never an unsent message. Bounded in time as well as in size, so a long thread cannot hold the database.
 */
export async function searchMessages(req: Request, conversationId: string, query: unknown) {
  const c = await authorize(req, conversationId);
  await flushMembershipEvents(conversationId);
  const { q, before } = parsed(searchQuerySchema, query);
  const rows = await Message.find({
    conversationId: c.id,
    unsentAt: null,
    kind: { $ne: 'system' },
    body: { $regex: escapeRegex(q), $options: 'i' },
    $and: [historyFilter(c, req.user!.id), ...(before ? [{ seq: { $lt: before } }] : [])]
  })
    .sort({ seq: -1 })
    .limit(SEARCH_PAGE)
    .maxTimeMS(3000)
    .catch((error: unknown) => {
      // MaxTimeMSExpired: a long thread and a common term. Said as something the person can act on, not a 500.
      if ((error as { code?: number }).code === 50)
        throw new BadRequestError('That search took too long. Try a longer or more specific phrase.');
      throw error;
    });
  await redactQuotes(rows);
  return rows;
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
  // A question to an assistant: whether Vivi may take it, which assistant, and the hidden request to save it with.
  // A quote never invokes a bot in a conversation between people.
  const invocation = input.assistantId;
  const { assistantId: _invocation, screen, attachments: refs, context: asked, ...messageInput } = input;
  const questionTo = async (assistantId: string | null | undefined) =>
    assistants.prepare({
      person: { id: req.user!.id, email: req.user!.email || '', name: actorName(req) },
      conversationId: c.id,
      assistantId,
      invocation,
      membershipVersion: c.membershipVersion,
      screen
    });
  let question = c.kind === 'assistant' || invocation ? await questionTo(c.assistantId) : undefined;
  // The conditional write pins a default once, so a later preference change cannot silently replace this thread's bot.
  if (question?.bindAssistantId && c.kind === 'assistant') {
    const bound = await Conversation.findOneAndUpdate(
      { _id: c.id, assistantId: null, deletedAt: null },
      { $set: { assistantId: question.bindAssistantId } },
      { returnDocument: 'after' }
    ).select('assistantId');
    c.assistantId = (bound ?? (await Conversation.findById(c.id).select('assistantId')))?.assistantId;
    // Someone bound another assistant first: this question belongs to that one.
    if (c.assistantId !== question.bindAssistantId) question = await questionTo(c.assistantId);
  }
  // What the question is about is checked as the asker, now: a project or paper they cannot read refuses the send.
  const about = asked && (asked.projectId || asked.paperId) ? await verifyAbout(req, asked) : undefined;
  if (about && c.kind !== 'assistant') throw new BadRequestError('Only a question to an assistant is about something');
  // Described from what file-service holds, not from what the browser said.
  const attachments = await verifyAttachments(c.id, c.kind, refs ?? []);
  const message = await appendMessage({
    expectedMembershipVersion: c.membershipVersion,
    conversationId: c.id,
    senderId: req.user!.id,
    senderName: actorName(req),
    kind: 'person',
    ...messageInput,
    ...(about ? { context: about } : {}),
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
    ...(question ? { assistantRequest: question.request } : {})
  });
  // Writing in a chat that was put away brings it back.
  await ConversationHidden.deleteOne({ userId: req.user!.id, conversationId: c.id });
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
      // A person's message takes reactions. An assistant's answer does not: there is no one to react to.
      kind: { $nin: ['system', 'assistant'] },
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
  notify(`conv:${conversation.id}`);
  await redactQuotes([updated]);
  return updated;
}

/**
 * Takes a person's message back: its text and files go, a question not yet answered is cancelled, and whatever quoted
 * it says it was unsent. `extra` is what a caller adds to the message (an edit says what replaced it).
 */
async function retireMessage(
  conversation: { id: string },
  message: { _id: unknown; id: string },
  extra: Record<string, unknown> = {}
) {
  await Message.updateOne(
    { _id: message._id, unsentAt: null },
    {
      $set: {
        unsentAt: new Date(),
        body: '',
        reactions: [],
        evidence: [],
        thoughts: [],
        assistantCancelled: true,
        ...extra
      },
      $unset: { attachments: 1, quote: 1, assistantRequest: 1, screenRequest: 1 },
      $inc: { revision: 1 }
    }
  );
  // Best effort: people's messages must not depend on the assistant service. The message is already marked cancelled
  // and unsent, which the worker checks before it starts a run and before it publishes an answer, so a call that does
  // not get through only lets an answer already being written finish unseen.
  await assistants.cancelMessageRuns({ conversationId: conversation.id, messageId: message.id }).catch((error) =>
    logger.warn('Could not withdraw the runs of an unsent message', {
      messageId: message.id,
      error: error instanceof Error ? error.message : 'unknown'
    })
  );
  await Message.updateMany(
    { conversationId: conversation.id, 'quote.messageId': message.id, 'quote.unsent': { $ne: true } },
    {
      $set: { 'quote.body': 'Message unsent', 'quote.unsent': true },
      $inc: { revision: 1 }
    }
  );
}

export async function unsend(req: Request, conversationId: string, messageId: unknown) {
  const { conversation, message } = await visibleMessage(req, conversationId, messageId);
  if (message.kind !== 'person' || message.senderId !== req.user!.id)
    throw new ForbiddenError('You can only unsend your own messages');
  await retireMessage(conversation, message);
  await Conversation.updateOne({ _id: conversation._id }, { $inc: { messageVersion: 1 } });
  notify(`conv:${conversation.id}`);
  return await Message.findById(message._id);
}

/**
 * Asks the assistant again with other words: the edited text is sent as a new question, and the old question and its
 * answer are retired (hidden, kept in the run's history). A run belongs to one question and an answer to one run, so
 * "replace in place" is not possible; this reads the same to the person. Only the latest question, in a private chat
 * with an assistant, and only text: a question with files is sent again, not edited.
 *
 * The new question is sent first, so a refused one (the assistant off, the text too long) leaves the old question and
 * its answer as they were. Repeating the request with the same `clientId` finishes what it did not reach.
 */
/** How long a claim on a question being edited holds, if its request never finishes. */
const EDIT_CLAIM_MS = 30_000;

export async function editQuestion(req: Request, conversationId: string, messageId: unknown, body: unknown) {
  const { conversation, message } = await visibleMessage(req, conversationId, messageId);
  const input = parsed(sendSchema, body);
  if (conversation.kind !== 'assistant') throw new BadRequestError('Only a question to your assistant can be edited');
  if (message.kind !== 'person' || message.senderId !== req.user!.id)
    throw new ForbiddenError('You can only edit your own questions');
  // The replacement, when this request is a repeat of one that got as far as storing it. An id used by this question
  // or an earlier one is not an edit.
  const replacement = await Message.findOne({
    conversationId: conversation.id,
    senderId: req.user!.id,
    clientId: input.clientId
  }).select('seq');
  if (replacement && replacement.seq <= message.seq) throw new BadRequestError('Message retry identifier already used');
  let claimed = false;
  if (!replacement) {
    if (message.unsentAt) throw new BadRequestError('This question was unsent');
    if (message.attachments?.length) throw new BadRequestError('A question with files cannot be edited; send it again');
    if (input.attachments?.length) throw new BadRequestError('An edited question is text only');
    const latest = await Message.findOne({ conversationId: conversation.id, kind: 'person', unsentAt: null })
      .sort({ seq: -1 })
      .select('_id');
    if (latest?.id !== message.id) throw new BadRequestError('Only your latest question can be edited');
    // Claimed before anything is sent: two edits of one question (two tabs) cannot both pass the check above.
    const taken = await Message.findOneAndUpdate(
      {
        _id: message._id,
        unsentAt: null,
        $or: [
          { editClaim: null },
          { 'editClaim.by': input.clientId },
          { 'editClaim.at': { $lt: new Date(Date.now() - EDIT_CLAIM_MS) } }
        ]
      },
      { $set: { editClaim: { by: input.clientId, at: new Date() } } }
    ).select('_id');
    if (!taken) throw new BadRequestError('This question is already being edited');
    claimed = true;
  }
  let sent: Awaited<ReturnType<typeof sendMessage>>;
  try {
    sent = await sendMessage(req, conversationId, body);
  } catch (error) {
    // A refused edit leaves the question as it was, and free to be edited again.
    if (claimed) await Message.updateOne({ _id: message._id, 'editClaim.by': input.clientId }, { $unset: { editClaim: 1 } });
    throw error;
  }
  // Every step is conditional, so a repeat finishes what the first request did not reach and changes nothing else.
  const at = new Date();
  await retireMessage(conversation, message, { supersededAt: at });
  // The answer it had (or has by the time this runs) goes with it, and never into a later question's history.
  await Message.updateMany(
    { conversationId: conversation.id, kind: 'assistant', replyTo: message.id, unsentAt: null },
    {
      $set: { unsentAt: at, supersededAt: at, body: '', evidence: [], thoughts: [], reactions: [] },
      $inc: { revision: 1 }
    }
  );
  await Conversation.updateOne({ _id: conversation._id }, { $inc: { messageVersion: 1 } });
  notify(`conv:${conversation.id}`);
  return sent;
}
