import { repairBotDirect } from './botConversations';
import { usableAssistant } from './assistantAvailability';
import { BadRequestError, ForbiddenError, NotFoundError, createOwnerIdentityLookup } from '@visin/backend-core';
import { type Request } from 'express';
import { Assistant } from '../models/Assistant';
import { Message } from '../models/Message';
import { Block } from '../models/Block';
import { Conversation } from '../models/Conversation';
import { ConversationHidden } from '../models/ConversationHidden';
import { appendMessage } from './messages';
import { cancelRuns } from './runService';
import { notify } from './wakeBus';
import {
  accessCache,
  assistantBinding,
  historyFilter,
  liveConversation,
  authorize,
  checkAccess,
  groups,
  peer,
  publicPerson,
  sharedContacts,
  type Project
} from './access';
import { attachmentSummary } from './attachments';
import { actorName } from '../utils/request';
import { id } from '../validation/commonSchemas';
import { defaultAssistantFor } from './assistantService';
import { createSchema } from '../validation/conversationSchemas';
import { parsed } from '../validation/parse';
import { listQuerySchema } from '../validation/conversationSchemas';

/**
 * Hidden chats of this person, less those someone else has written in since: they come back. A bot answering the
 * person's own question is not someone else, and the person's own message brings it back too (see `sendMessage`).
 */
async function hiddenIds(actor: string): Promise<Set<string>> {
  const hidden = await ConversationHidden.find({ userId: actor }).limit(500);
  if (!hidden.length) return new Set();
  const returned = new Set<string>(
    await Message.find({
      kind: 'person',
      senderId: { $ne: actor },
      $or: hidden.map((row) => ({ conversationId: row.conversationId, seq: { $gt: row.seq } }))
    }).distinct('conversationId')
  );
  if (returned.size)
    await ConversationHidden.deleteMany({ userId: actor, conversationId: { $in: [...returned] } });
  return new Set(hidden.map((row) => row.conversationId).filter((conversationId) => !returned.has(conversationId)));
}

export async function listConversations(req: Request, query: unknown = {}) {
  const { hidden: onlyHidden } = parsed(listQuerySchema, query);
  const actor = req.user!.id;
  const memberships = await groups.getMyGroups(actor);
  const hiding = await hiddenIds(actor);
  const candidates = await Conversation.find({
    ...liveConversation,
    ...(onlyHidden ? { _id: { $in: [...hiding] } } : hiding.size ? { _id: { $nin: [...hiding] } } : {}),
    $or: [
      { participants: { $elemMatch: { userId: actor, state: { $in: ['active', 'invited'] } } } },
      { groupId: { $in: memberships.map((g) => g.groupId) }, kind: { $in: ['group', 'project'] } }
    ]
  })
    .sort({ updatedAt: -1 })
    .limit(100);
  // Checked against the documents just loaded, the groups fetched above, and each project once.
  const cache = accessCache(memberships.map((g) => g.groupId));
  const checked = await Promise.all(
    candidates.map(async (c) => {
      try {
        await checkAccess(req, c, false, cache);
        return await repairBotDirect(c, actor);
      } catch (e) {
        if (!(e instanceof NotFoundError || e instanceof ForbiddenError)) throw e;
        return undefined;
      }
    })
  );
  const visible = checked.filter((c) => c !== undefined);
  if (!visible.length) return [];
  const assistants = await Assistant.find({ _id: { $in: visible.map((c) => c.assistantId).filter(Boolean) } }).select(
    'profileUserId'
  );
  const botUsers = new Map(assistants.map((bot) => [bot.id, bot.profileUserId]));
  const profileId = (c: (typeof visible)[number]) =>
    c.kind === 'direct'
      ? c.participants.find((person) => person.userId !== actor)?.userId
      : c.kind === 'assistant' && c.assistantId
        ? botUsers.get(c.assistantId)
        : undefined;
  const [identities, latest] = await Promise.all([
    lookupHeaderIdentity(
      visible.flatMap((c) => {
        const userId = profileId(c);
        return userId ? [{ kind: 'user' as const, id: userId }] : [];
      })
    ),
    Message.aggregate<{ _id: string; body: string; createdAt: Date; files: number; firstKind?: string }>([
      { $match: { $or: visible.map((c) => ({ conversationId: c.id, ...historyFilter(c, actor) })) } },
      { $sort: { conversationId: 1, seq: -1 } },
      {
        $group: {
          _id: '$conversationId',
          body: {
            $first: { $cond: [{ $ifNull: ['$unsentAt', false] }, 'Message unsent', { $substrCP: ['$body', 0, 180] }] }
          },
          createdAt: { $first: '$createdAt' },
          // A message of only files has no text to show: it is described by what it carries.
          files: { $first: { $size: { $ifNull: ['$attachments', []] } } },
          firstKind: { $first: { $arrayElemAt: [{ $ifNull: ['$attachments.kind', []] }, 0] } }
        }
      }
    ])
  ]);
  const previews = new Map(latest.map((message) => [message._id, message]));
  return visible.map((c) => {
    const identity = identities.get(profileId(c) || '');
    const preview = previews.get(c.id);
    return {
      ...c.toObject(),
      ...(identity?.handle ? { profile: identity } : {}),
      ...(preview
        ? {
            latestMessage: {
              body:
                preview.body ||
                attachmentSummary(Array.from({ length: preview.files }, () => ({ kind: preview.firstKind }))),
              createdAt: preview.createdAt
            }
          }
        : {})
    };
  });
}

export async function createConversation(req: Request, body: unknown) {
  const input = parsed(createSchema, body),
    actor = req.user!.id;
  let directPerson: Awaited<ReturnType<typeof publicPerson>> | undefined;
  if (input.kind === 'direct' && input.handles.length === 1 && !input.userIds.length) {
    const person = (directPerson = await publicPerson(input.handles[0]));
    if (person.kind === 'assistant') {
      if (!person.assistantId) throw new NotFoundError('Bot is unavailable');
      input.kind = 'assistant';
      input.assistantId = person.assistantId;
      input.handles = [];
      input.title = person.name;
    }
  }
  // A private analysis with no assistant named starts with the one this person made their default, if they did.
  if (input.kind === 'assistant' && !input.assistantId) {
    const preferred = await defaultAssistantFor(actor);
    if (preferred) input.assistantId = preferred.id;
  }
  if (input.assistantId) {
    if (input.kind !== 'assistant') throw new BadRequestError('Assistants are only available in private analysis');
    const bot = await Assistant.findOne({ _id: input.assistantId, ...usableAssistant(actor) }).select('name');
    if (!bot) throw new NotFoundError('Assistant is unavailable');
    // The one chat with an assistant is named for it, as a conversation with a person is.
    input.title = bot.name.slice(0, 120);
  }
  if (input.kind === 'assistant' && (input.projectId || input.paperId || input.trainingIds.length))
    throw new BadRequestError('Say what a question is about when you send it, not when the chat is opened');
  if (input.paperId) throw new BadRequestError('A paper is asked about in a private chat with an assistant');
  if (input.groupId && input.kind !== 'group') throw new BadRequestError('A group binding is only for group channels');
  if (input.kind === 'group' && (input.projectId || input.trainingIds.length))
    throw new BadRequestError('Use a project discussion to attach training context');
  if (input.handles.length + input.userIds.length > 19) throw new BadRequestError('A room supports at most 20 people');
  const participants: {
    userId: string;
    name: string;
    state: 'active' | 'invited';
    role: 'owner' | 'member';
    joinedAt: Date | null;
  }[] = [{ userId: actor, name: actorName(req), state: 'active', role: 'owner', joinedAt: new Date() }];
  if (input.kind === 'assistant' && (input.handles.length || input.userIds.length))
    throw new BadRequestError('Assistant chats are private');
  if (input.kind === 'direct' && input.handles.length + input.userIds.length !== 1)
    throw new BadRequestError('Choose one person');
  if (input.kind === 'room' && input.handles.length + input.userIds.length === 0)
    throw new BadRequestError('Invite at least one person');
  if (!['direct', 'room'].includes(input.kind) && (input.handles.length || input.userIds.length))
    throw new BadRequestError('This channel uses its group membership');
  for (const handle of input.handles) {
    const person = directPerson || (await publicPerson(handle));
    if (person.kind === 'assistant') throw new BadRequestError('Add bots through shared assistant settings');
    if (participants.some((p) => p.userId === person.id)) throw new BadRequestError('Choose different people');
    if (
      await Block.exists({
        $or: [
          { userId: actor, blockedId: person.id },
          { userId: person.id, blockedId: actor }
        ]
      })
    )
      throw new ForbiddenError('Cannot contact this person');
    participants.push({ userId: person.id, name: person.name, state: 'invited', role: 'member', joinedAt: null });
  }
  if (input.userIds.length) {
    const contacts = await sharedContacts(req);
    for (const userId of input.userIds) {
      const person = contacts.find((contact) => contact.id === userId);
      if (!person) throw new NotFoundError('This contact is no longer in a shared group');
      if (participants.some((p) => p.userId === person.id)) throw new BadRequestError('Choose different people');
      if (
        await Block.exists({
          $or: [
            { userId: actor, blockedId: person.id },
            { userId: person.id, blockedId: actor }
          ]
        })
      )
        throw new ForbiddenError('Cannot contact this person');
      participants.push({
        userId: person.id,
        name: `Invited colleague ${person.id.slice(-6)}`,
        state: 'invited',
        role: 'member',
        joinedAt: null
      });
    }
  }
  let projectName: string | undefined;
  const trainingLabels: { id: string; name: string }[] = [];
  let groupId: string | undefined, projectId: string | undefined;
  if (input.kind === 'group') {
    if (!input.groupId) throw new BadRequestError('Choose a group');
    const membership = await groups.checkMembership(input.groupId, actor);
    if (!membership.member || !['owner', 'admin'].includes(membership.role!))
      throw new ForbiddenError('A group administrator creates channels');
    groupId = input.groupId;
  } else if (input.kind === 'project') {
    if (!input.projectId) throw new BadRequestError('Choose a project');
    const project = await peer<Project>('VISION', `/api/projects/${input.projectId}`, req);
    projectId = project._id;
    projectName = project.name;
    if (project.owner.kind === 'group') {
      if (!(await groups.checkMembership(project.owner.id, actor)).member)
        throw new ForbiddenError('Project discussion is for its owning group');
      groupId = project.owner.id;
    } else if (project.owner.id !== actor) throw new ForbiddenError('Project discussion is private');
    for (const training of input.trainingIds) {
      const run = await peer<{ projectId: string; name: string }>('VISION', `/api/trainings/${training}`, req);
      if (String(run.projectId) !== projectId)
        throw new BadRequestError('Selected runs must belong to the selected project');
      trainingLabels.push({ id: training, name: run.name });
    }
  } else if (input.kind !== 'assistant' && (input.projectId || input.groupId || input.trainingIds.length))
    throw new BadRequestError('Attach protected results through a project analysis chat');
  const directKey =
    input.kind === 'direct'
      ? participants
          .map((p) => p.userId)
          .sort()
          .join(':')
      : undefined;
  const bindingKey =
    input.kind === 'project'
      ? `project:${projectId}:${groupId || actor}`
      : input.kind === 'group'
        ? `group:${groupId}:${input.title.toLowerCase()}`
        : // One private chat per person and assistant, so asking again opens it instead of starting another.
          input.kind === 'assistant'
          ? assistantBinding(input.assistantId, actor)
          : undefined;
  let conversation;
  try {
    conversation = await Conversation.create({
      ...input,
      participants,
      createdBy: actor,
      groupId,
      projectId,
      projectName,
      trainingLabels,
      directKey,
      bindingKey
    });
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    conversation = await Conversation.findOne(directKey ? { directKey } : { bindingKey });
    if (!conversation) throw e;
    // Whoever left or declined a direct conversation can start it again. The other
    // side's own decision stands, so a declined request cannot be repeated this way.
    const own = conversation.kind === 'direct' && conversation.participants.find((p) => p.userId === actor);
    if (own && own.state === 'left') {
      own.state = 'active';
      own.joinedAt = new Date();
      conversation.membershipVersion += 1;
      await conversation.save();
    }
    conversation = await authorize(req, conversation.id);
  }
  // Asking an assistant again puts its chat back where it was, if the person had put it away.
  if (conversation.kind === 'assistant') await ConversationHidden.deleteOne({ userId: actor, conversationId: conversation.id });
  return conversation;
}

export async function openGroupChannel(req: Request, groupIdValue: unknown) {
  const groupId = parsed(id, groupIdValue),
    actor = req.user!.id;
  const group = (await groups.getMyGroups(actor)).find((g) => g.groupId === groupId);
  if (!group) throw new NotFoundError('Only members of this group can message it');
  const bindingKey = `group:${groupId}:general`;
  let conversation = await Conversation.findOne({ bindingKey, deletedAt: null });
  if (!conversation) {
    try {
      conversation = await Conversation.create({
        kind: 'group',
        title: (group.name || 'Group').slice(0, 120),
        groupId,
        bindingKey,
        createdBy: actor,
        participants: [{ userId: actor, name: actorName(req), state: 'active', role: 'member', joinedAt: new Date() }]
      });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
      conversation = await Conversation.findOne({ bindingKey, deletedAt: null });
      if (!conversation) throw e;
    }
  }
  return conversation;
}

const lookupHeaderIdentity = createOwnerIdentityLookup('chat-service');

export async function getConversation(req: Request, conversationId: string) {
  const conversation = await authorize(req, conversationId);
  let userId =
    conversation.kind === 'direct'
      ? conversation.participants.find((person) => person.userId !== req.user!.id)?.userId
      : undefined;
  if (conversation.kind === 'assistant' && conversation.assistantId) {
    const assistant = await Assistant.findById(conversation.assistantId).select('profileUserId');
    userId = assistant?.profileUserId ?? undefined;
  }
  const identity = userId ? (await lookupHeaderIdentity([{ kind: 'user', id: userId }])).get(userId) : undefined;
  return { ...conversation.toObject(), ...(identity?.handle ? { profile: identity } : {}) };
}

/** Puts a conversation away from this person's list. Only theirs: nobody else's list changes. */
export async function hideConversation(req: Request, conversationId: string) {
  const c = await authorize(req, conversationId);
  await ConversationHidden.updateOne(
    { userId: req.user!.id, conversationId: c.id },
    { $set: { seq: c.lastMessageSeq } },
    { upsert: true }
  );
}

export async function unhideConversation(req: Request, conversationId: string) {
  const c = await authorize(req, conversationId);
  await ConversationHidden.deleteOne({ userId: req.user!.id, conversationId: c.id });
}

/**
 * Deletes a person's own private chat with an assistant. Nobody else is in it, so it is the one kind that can go; for
 * any other, "hide" or "leave" is the way out. A soft delete: the chat is marked deleted and its binding is moved
 * aside so the next question starts an empty one; messages, runs and files stay where they are but are no longer
 * reachable, because every read goes through `authorize`.
 */
export async function deleteConversation(req: Request, conversationId: string) {
  const actor = req.user!.id;
  const c = await authorize(req, conversationId);
  if (c.kind !== 'assistant' || c.createdBy !== actor)
    throw new ForbiddenError('Only your own chat with an assistant can be deleted. Hide it instead.');
  // An answer being written stops with it: the worker gives up on a run that is no longer running.
  await cancelRuns(req, c.id);
  const deleted = await Conversation.updateOne(
    { _id: c.id, deletedAt: null },
    {
      $set: { deletedAt: new Date(), ...(c.bindingKey ? { deletedBindingKey: c.bindingKey } : {}) },
      $unset: { bindingKey: 1 }
    }
  );
  if (!deleted.matchedCount) throw new NotFoundError('Conversation not found');
  await ConversationHidden.deleteMany({ conversationId: c.id });
  notify(`conv:${c.id}`);
}

/**
 * A new topic in a private chat with an assistant: it forgets the earlier questions from here on. They stay in the
 * chat, above a line saying so, which is a message like any other.
 */
export async function startNewTopic(req: Request, conversationId: string) {
  const actor = req.user!.id;
  const c = await authorize(req, conversationId, true);
  if (c.kind !== 'assistant') throw new BadRequestError('Only a chat with an assistant has topics');
  // Asking twice in a row is one new topic, not two lines saying so.
  const last = await Message.findOne({ conversationId: c.id }).sort({ seq: -1 });
  if (last?.kind === 'system' && last.clientId.startsWith('topic-')) return last;
  const marker = await appendMessage({
    conversationId: c.id,
    senderId: actor,
    senderName: actorName(req),
    kind: 'system',
    body: 'New topic: earlier messages are no longer used',
    clientId: `topic-${crypto.randomUUID()}`
  });
  await Conversation.updateOne(
    { _id: c.id, participants: { $elemMatch: { userId: actor, state: 'active' } } },
    { $max: { 'participants.$.topicSeq': marker.seq } }
  );
  return marker;
}
