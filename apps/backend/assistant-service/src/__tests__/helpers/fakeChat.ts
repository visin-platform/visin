import { createServer, type Server } from 'node:http';
import mongoose from 'mongoose';
import { HttpError } from '@visin/backend-core';
import { Conversation as ConversationView } from '../../models/ChatConversation';
import { Message as MessageView } from '../../models/ChatMessage';
import { authorize } from '../../services/access';
import { assistantCapabilities } from '../../services/capabilities';
import { prepareQuestion, resolveAssistant } from '../../services/questions';
import { cancelMessageRuns } from '../../services/runService';
import { notify } from '../../services/wakeBus';

/**
 * Chat, as far as the assistant service meets it: the same collections, written the way chat writes them, and the same
 * internal API. This service only reads chat's collections and asks chat to change them, so a test of it needs a chat
 * on the other end. This one is small and does nothing but what chat is asked here (sequence numbers, a message once,
 * a conversation that has moved on refusing an answer made for the old one); what the real chat decides is chat's own
 * tests', and a contract change shows in both.
 */
export const Conversation = mongoose.model('FakeChatConversation', ConversationView.schema, 'chatconversations');
export const Message = mongoose.model('FakeChatMessage', MessageView.schema, 'chatmessages');

type Request = {
  expectedMembershipVersion?: number;
  conversationId: string;
  senderId: string;
  senderName: string;
  kind: 'person' | 'assistant' | 'system';
  body: string;
  clientId: string;
  replyTo?: string;
  attachments?: unknown[];
  assistantRequest?: { screen?: unknown } & Record<string, unknown>;
  context?: Record<string, unknown>;
  evidence?: unknown[];
  thoughts?: unknown[];
};

/** A document as a test reads it back: what chat stored, with the fields a test looks at. */
type Stored = NonNullable<Awaited<ReturnType<typeof Message.findOne>>>;

/** Publishes a message the way chat does: once per client id, in sequence, and only into the conversation it was made for. */
export async function appendMessage(input: Request): Promise<Stored> {
  const existing = await Message.findOne({ conversationId: input.conversationId, clientId: input.clientId });
  if (existing) return existing as unknown as Stored;
  const conversation = await Conversation.findOneAndUpdate(
    {
      _id: input.conversationId,
      deletedAt: null,
      ...(input.expectedMembershipVersion === undefined ? {} : { membershipVersion: input.expectedMembershipVersion })
    },
    { $inc: { seq: 1 } },
    { returnDocument: 'after' }
  );
  if (!conversation) throw Object.assign(new Error('Conversation changed; reload before sending'), { status: 409 });
  const { assistantRequest, ...rest } = input;
  let message: Stored;
  try {
    message = (await Message.create({
      ...rest,
      ...(assistantRequest ? (assistantRequest.screen ? { screenRequest: assistantRequest } : { assistantRequest }) : {}),
      seq: conversation.seq
    } as never)) as unknown as Stored;
  } catch (error) {
    // Two of the same answer at once: the index lets one in, and the other is told which it was.
    if ((error as { code?: number }).code === 11000) {
      const duplicate = await Message.findOne({ conversationId: input.conversationId, clientId: input.clientId });
      if (duplicate) return duplicate as unknown as Stored;
    }
    throw error;
  }
  await Conversation.updateOne({ _id: input.conversationId, lastMessageSeq: { $lt: message.seq } }, { $max: { lastMessageSeq: message.seq } });
  // A worker looks for the question it may carry (in a deployment, Redis carries the signal across).
  if (assistantRequest) notify('worker');
  return message;
}

// ── what chat's own routes do, as far as the tests of this service use them ────────────────────────────────────
interface Reply {
  status: number;
  // oxlint-disable-next-line typescript/no-explicit-any -- a reply carries whatever the route returns; a test names what it reads
  body: { data: any; message?: string };
}
/** A reply as the page receives it: through JSON, so an id is a string and a date is text, as over HTTP. */
const reply = (status: number, data: unknown = {}, message?: string): Reply => ({
  status,
  body: { data: data === undefined ? undefined : JSON.parse(JSON.stringify(data)), ...(message ? { message } : {}) }
});
const refusal = (error: unknown): Reply => {
  if (error instanceof HttpError) return reply(error.statusCode, undefined, error.message);
  if ((error as { status?: number }).status) return reply((error as { status: number }).status, undefined, (error as Error).message);
  throw error;
};
const person = (user: string) => ({ id: user, email: `${user}@test.invalid`, name: user });

async function create(user: string, input: { kind: string; title?: string; handles?: string[]; assistantId?: string }) {
  if (input.kind === 'assistant') {
    const wanted = await resolveAssistant({ userId: user, ...(input.assistantId ? { assistantId: input.assistantId } : {}) });
    if (input.assistantId && !wanted) return reply(404, undefined, 'Assistant is unavailable');
    const bindingKey = `assistant:${wanted?.id || 'default'}:${user}`;
    const existing = await Conversation.findOne({ bindingKey, deletedAt: null });
    if (existing) return reply(201, existing.toObject());
    const created = await Conversation.create({
      kind: 'assistant',
      title: wanted?.name ?? input.title ?? 'Vivi',
      createdBy: user,
      assistantId: wanted?.id,
      bindingKey,
      participants: [{ userId: user, name: user, state: 'active', role: 'owner', joinedAt: new Date() }]
    });
    return reply(201, created.toObject());
  }
  if (input.assistantId) return reply(400, undefined, 'Assistants are only available in private analysis');
  const created = (await Conversation.create({
    kind: input.kind,
    title: input.title ?? 'Research',
    createdBy: user,
    participants: [
      { userId: user, name: user, state: 'active', role: 'owner', joinedAt: new Date() },
      ...(input.handles ?? []).map((handle) => ({ userId: handle, name: handle, state: 'invited', role: 'member' }))
    ]
  } as never)) as unknown as { toObject(): Record<string, unknown> };
  return reply(201, created.toObject());
}

async function membership(user: string, id: string, action: string) {
  const c = await Conversation.findById(id);
  const me = c?.participants.find((p) => p.userId === user);
  if (!c || !me) return reply(404, undefined, 'Conversation not found');
  const state = { accept: 'active', leave: 'left', block: 'blocked' }[action];
  if (!state) return reply(400, undefined, 'Unknown action');
  await Conversation.updateOne(
    { _id: id, 'participants.userId': user },
    {
      $set: {
        'participants.$.state': state,
        ...(action === 'accept' ? { 'participants.$.joinedAt': new Date(), 'participants.$.joinedSeq': c.seq } : {})
      },
      $inc: { membershipVersion: 1 }
    }
  );
  return reply(200, (await Conversation.findById(id))!.toObject());
}

// oxlint-disable-next-line typescript/no-explicit-any -- the body is what a test chose to send; chat checks it, this only carries it
async function send(user: string, id: string, input: Record<string, any>) {
  // eslint-disable-line -- the body is a person's, checked by chat; here it is what a test chose to send
  let c;
  try {
    // Who may write in a conversation is chat's rule, which this service keeps a copy of for its own routes.
    c = await authorize({ user: { id: user }, headers: {} } as never, id, true);
  } catch (error) {
    return refusal(error);
  }
  const existing = await Message.findOne({ conversationId: id, clientId: input.clientId, senderId: user });
  if (existing) return reply(200, existing.toObject());
  if (input.assistantId && c.kind === 'assistant') return reply(400, undefined, 'This private thread already has its assistant');
  const { assistantId: invocation, screen, context, ...rest } = input;
  const source = rest.replyTo ? await Message.findOne({ _id: rest.replyTo, conversationId: id }) : null;
  if (rest.replyTo && !source) return reply(400, undefined, 'Reply is not in your visible conversation');
  const quote = source
    ? { messageId: source.id, senderName: source.senderName, body: (source.body || 'Message').slice(0, 500), kind: source.kind }
    : undefined;
  let question;
  try {
    const prepare = (assistantId: string | null | undefined) =>
      prepareQuestion({ person: person(user), conversationId: id, assistantId, invocation, membershipVersion: c.membershipVersion, screen });
    question = c.kind === 'assistant' || invocation ? await prepare(c.assistantId) : undefined;
    if (question?.bindAssistantId && c.kind === 'assistant') {
      const bound = await Conversation.findOneAndUpdate(
        { _id: id, assistantId: null, deletedAt: null },
        { $set: { assistantId: question.bindAssistantId } },
        { returnDocument: 'after' }
      );
      c.assistantId = (bound ?? (await Conversation.findById(id)))?.assistantId;
      if (c.assistantId !== question.bindAssistantId) question = await prepare(c.assistantId);
    }
  } catch (error) {
    return refusal(error);
  }
  try {
    const message = await appendMessage({
      expectedMembershipVersion: c.membershipVersion,
      conversationId: id,
      senderId: user,
      senderName: user,
      kind: 'person',
      body: rest.body ?? '',
      clientId: rest.clientId,
      ...(quote ? { replyTo: rest.replyTo, quote } : {}),
      ...(context ? { context } : {}),
      ...(question ? { assistantRequest: question.request } : {})
    });
    const { assistantRequest: _a, screenRequest: _s, assistantCancelled: _c, ...view } = message.toObject();
    return reply(201, view);
  } catch (error) {
    return refusal(error);
  }
}

async function unsend(user: string, id: string, messageId: string) {
  const message = await Message.findOne({ _id: messageId, conversationId: id, senderId: user });
  if (!message) return reply(404, undefined, 'Message not found');
  await Message.updateOne(
    { _id: messageId },
    { $set: { unsentAt: new Date(), body: '', assistantCancelled: true }, $unset: { attachments: 1, quote: 1, assistantRequest: 1, screenRequest: 1 }, $inc: { revision: 1 } }
  );
  await cancelMessageRuns({ conversationId: id, messageId });
  return reply(200, (await Message.findById(messageId))!.toObject());
}


async function topic(user: string, id: string) {
  let c;
  try {
    c = await authorize({ user: { id: user }, headers: {} } as never, id, true);
  } catch (error) {
    return refusal(error);
  }
  if (c.kind !== 'assistant') return reply(400, undefined, 'Only a chat with an assistant has topics');
  // Asking twice in a row is one new topic, not two lines saying so.
  const last = await Message.findOne({ conversationId: id }).sort({ seq: -1 });
  if (last?.kind === 'system' && last.clientId.startsWith('topic-')) return reply(201, last.toObject());
  const marker = await appendMessage({
    conversationId: id,
    senderId: 'system:topic',
    senderName: 'System',
    kind: 'system',
    body: 'New topic: earlier messages are no longer used',
    clientId: `topic-${Math.random().toString(36).slice(2)}`
  });
  await Conversation.updateOne(
    { _id: id, participants: { $elemMatch: { userId: user, state: 'active' } } },
    { $max: { 'participants.$.topicSeq': marker.seq } }
  );
  return reply(201, marker.toObject());
}

async function readMessages(user: string, id: string) {
  try {
    await authorize({ user: { id: user }, headers: {} } as never, id);
  } catch (error) {
    return refusal(error);
  }
  return reply(200, (await Message.find({ conversationId: id }).sort({ seq: 1 })).map((message) => message.toObject()));
}

/** The chat routes a test of this service uses, answered as chat answers them. Anything else is not chat's to answer here. */
// oxlint-disable-next-line typescript/no-explicit-any -- the body is what a test chose to send
export async function chatRequest(path: string, user: string, body: any, method: string): Promise<Reply | undefined> {
  const route = path.split('?')[0];
  let m: RegExpMatchArray | null;
  if (method === 'POST' && route === '/conversations') return create(user, body);
  if (method === 'GET' && route === '/capabilities')
    return reply(200, { ...(await assistantCapabilities(user)), sharedAssistant: true, attachments: false });
  if (method === 'POST' && (m = route.match(/^\/conversations\/([^/]+)\/messages$/))) return send(user, m[1], body);
  if (method === 'GET' && (m = route.match(/^\/conversations\/([^/]+)\/messages$/))) return readMessages(user, m[1]);
  if (method === 'POST' && (m = route.match(/^\/conversations\/([^/]+)\/topic$/))) return topic(user, m[1]);
  if (method === 'GET' && (m = route.match(/^\/conversations\/([^/]+)$/))) {
    try {
      return reply(200, (await authorize({ user: { id: user }, headers: {} } as never, m[1])).toObject());
    } catch (error) {
      return refusal(error);
    }
  }
  if (method === 'POST' && (m = route.match(/^\/conversations\/([^/]+)\/membership$/))) return membership(user, m[1], body.action);
  if (method === 'POST' && (m = route.match(/^\/conversations\/([^/]+)\/messages\/([^/]+)\/unsend$/))) return unsend(user, m[1], m[2]);
  if (method === 'POST' && (m = route.match(/^\/conversations\/([^/]+)\/participants$/))) {
    await Conversation.updateOne(
      { _id: m[1] },
      { $push: { participants: { userId: body.handle, name: body.handle, state: 'invited', role: 'member' } }, $inc: { membershipVersion: 1 } }
    );
    return reply(200);
  }
  if (method === 'POST' && (m = route.match(/^\/conversations\/([^/]+)\/remove-participant$/))) {
    await Conversation.updateOne(
      { _id: m[1], 'participants.userId': body.userId },
      { $set: { 'participants.$.state': 'left' }, $inc: { membershipVersion: 1 } }
    );
    return reply(200);
  }
  return undefined;
}

// ── chat's internal API, for the assistant service to call ────────────────────────────────────────────────────
const CANCELLED = { $unset: { assistantRequest: 1, screenRequest: 1 }, $set: { assistantCancelled: true } };

// oxlint-disable-next-line typescript/no-explicit-any -- what the assistant service sent; chat's own routes check it
async function internal(path: string, body: any): Promise<{ status: number; data: unknown; message?: string }> {
  let m: RegExpMatchArray | null;
  try {
    if (path === '/messages') {
      const message = await appendMessage({ ...body, evidence: body.evidence?.map((e: { at: string }) => ({ ...e, at: new Date(e.at) })), thoughts: body.thoughts?.map((t: { at: string }) => ({ ...t, at: new Date(t.at) })) });
      return { status: 200, data: { id: message.id } };
    }
    if (path === '/messages/cancel-requests') {
      if (body.messageId) await Message.updateOne({ _id: body.messageId }, CANCELLED);
      else if (body.assistantId)
        await Message.updateMany({ $or: [{ 'assistantRequest.assistantId': body.assistantId }, { 'screenRequest.assistantId': body.assistantId }] }, CANCELLED);
      else
        await Message.updateMany(
          { conversationId: body.conversationId, senderId: body.senderId, $or: [{ assistantRequest: { $exists: true } }, { screenRequest: { $exists: true } }, { _id: { $in: body.messageIds } }] },
          CANCELLED
        );
      return { status: 200, data: {} };
    }
    if ((m = path.match(/^\/messages\/([^/]+)\/ack$/))) {
      await Message.updateOne({ _id: m[1] }, { $unset: { assistantRequest: 1, screenRequest: 1 } });
      return { status: 200, data: {} };
    }
    if ((m = path.match(/^\/messages\/([^/]+)\/finding$/))) {
      await Message.updateOne({ _id: m[1] }, { $set: { findingId: body.findingId } });
      return { status: 200, data: {} };
    }
    if ((m = path.match(/^\/conversations\/([^/]+)\/context$/))) {
      const updated = await Conversation.updateOne(
        { _id: m[1], kind: 'assistant', deletedAt: null, participants: { $elemMatch: { userId: body.userId, state: 'active' } } },
        { $set: { trainingIds: body.trainingIds, trainingLabels: body.trainingLabels } }
      );
      return { status: 200, data: { updated: updated.matchedCount > 0 } };
    }
    if ((m = path.match(/^\/conversations\/([^/]+)\/shared-assistants$/))) {
      const saved = await Conversation.findOneAndUpdate(
        { _id: m[1], __v: body.expectedVersion, deletedAt: null },
        { $set: { sharedAssistantIds: body.botIds, sharedAssistants: body.policy }, $inc: { membershipVersion: 1, __v: 1 } },
        { returnDocument: 'after' }
      );
      if (saved && body.announce)
        await appendMessage({
          conversationId: m[1],
          ...body.announce,
          kind: 'system',
          clientId: `policy:${m[1]}:${saved.membershipVersion}`
        });
      return { status: 200, data: { saved: saved ? { membershipVersion: saved.membershipVersion } : null } };
    }
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return { status, data: undefined, message: (error as Error).message };
  }
  return { status: 404, data: undefined, message: 'Not found' };
}

/** The indexes chat keeps on its messages, which are what make a message once: a client id once, a sequence number once. */
export async function createChatIndexes() {
  await Message.collection.createIndex({ conversationId: 1, clientId: 1 }, { unique: true });
  await Message.collection.createIndex({ conversationId: 1, seq: -1 }, { unique: true });
}

/** Chat's internal API on a port of its own; the assistant service is pointed at it by `CHAT_INTERNAL_URL`. */
export async function startFakeChat(): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', async () => {
      const prefix = '/api/chat/internal/assistant';
      const authorized = req.headers['x-internal-token'] === process.env.INTERNAL_SERVICE_TOKEN;
      const result = authorized && req.url?.startsWith(prefix) ? await internal(req.url.slice(prefix.length), raw ? JSON.parse(raw) : {}) : { status: 401, data: undefined, message: 'Unauthorized' };
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: result.status < 400, data: result.data, message: result.message }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}
