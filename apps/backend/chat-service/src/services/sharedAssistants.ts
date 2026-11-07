import { usableAssistant } from './assistantAvailability';
import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { Assistant } from '../models/Assistant';
import { AssistantRun } from '../models/AssistantRun';
import { Conversation, type ChatConversation } from '../models/Conversation';
import { ConversationAssistant } from '../models/ConversationAssistant';
import { Message } from '../models/Message';
import { groups } from './access';

/** Consent covers the current audience and the exact disclosed assistant memberships. */
export function audienceKey(c: ChatConversation): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        [...c.sharedAssistantIds].sort(),
        c.participants
          .filter((p) => p.state === 'active' || p.state === 'invited')
          .map((p) => [p.userId, p.state, p.joinedAt?.toISOString(), p.joinedSeq])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      ])
    )
    .digest('hex');
}
export function sharedEnabled(c: ChatConversation): boolean {
  if (c.kind === 'assistant' || c.sharedAssistants?.lockedOff || !c.sharedAssistantIds.length) return false;
  if (c.kind === 'group' || c.kind === 'project') return Boolean(c.sharedAssistants?.enabled);
  if (c.kind === 'direct' && c.participants.some((p) => p.state !== 'active')) return false;
  if (c.participants.some((p) => p.state === 'invited' || p.state === 'blocked')) return false;
  const members = c.participants.filter((p) => p.state === 'active');
  const audience = audienceKey(c);
  return (
    members.length > 0 &&
    members.every((p) => c.sharedAssistants?.consents.some((g) => g.userId === p.userId && g.audience === audience))
  );
}
export async function managesShared(req: Request, c: ChatConversation): Promise<boolean> {
  if (c.kind === 'group' || c.kind === 'project') {
    if (!c.groupId) return c.createdBy === req.user!.id;
    const membership = await groups.checkMembership(c.groupId, req.user!.id);
    return membership.member && ['owner', 'admin'].includes(membership.role || '');
  }
  const member = c.participants.find((p) => p.userId === req.user!.id && p.state === 'active');
  return Boolean(member && (c.kind === 'direct' || ['owner', 'admin'].includes(member.role)));
}
/** Missing settings retain the original permission matrix. Direct chats have no unilateral administrator. */
export function assistantAdditionPolicy(c: ChatConversation): 'everyone' | 'admins' {
  return c.kind === 'direct' ? 'everyone' : (c.sharedAssistants?.whoCanAdd ?? 'admins');
}
export async function sharedView(req: Request, c: ChatConversation) {
  const bots = await ConversationAssistant.find({
    _id: { $in: c.sharedAssistantIds },
    conversationId: c._id.toString()
  }).lean();
  const available = await Assistant.find({
    _id: { $in: bots.map((b) => b.assistantId) },
    deletedAt: null,
    paused: false
  }).select('_id');
  const ids = new Set(available.map((b) => b.id));
  const audience = audienceKey(c);
  const canManage = await managesShared(req, c);
  return {
    whoCanAdd: assistantAdditionPolicy(c),
    canAdd: !c.sharedAssistants?.lockedOff && (canManage || assistantAdditionPolicy(c) === 'everyone'),
    canSetAdditionPolicy: c.kind !== 'direct' && canManage,
    enabled: sharedEnabled(c),
    lockedOff: c.sharedAssistants?.lockedOff ?? false,
    policy: c.kind === 'direct' || c.kind === 'room' ? 'unanimous' : 'admins',
    agreed: c.sharedAssistants?.consents.some((g) => g.userId === req.user!.id && g.audience === audience) ?? false,
    canManage,
    canLock: c.kind !== 'direct',
    bots: bots.map((b) => ({
      id: b.assistantId,
      name: b.name,
      personality: b.personality,
      available: ids.has(b.assistantId)
    })),
    pending: c.participants
      .filter(
        (p) =>
          (p.state === 'active' || p.state === 'invited') &&
          !c.sharedAssistants?.consents.some((g) => g.userId === p.userId && g.audience === audience)
      )
      .map((p) => p.name)
  };
}
export async function requireSharedBot(c: ChatConversation, assistantId: string) {
  const membership = await ConversationAssistant.findOne({
    _id: { $in: c.sharedAssistantIds },
    conversationId: c._id.toString(),
    assistantId
  });
  if (!membership || !(await Assistant.exists({ _id: assistantId, deletedAt: null, paused: false })))
    throw new NotFoundError('Shared assistant is unavailable');
  return membership;
}

/** Worker checks use live membership. Shared turns receive no research credentials. */
export async function runAllowed(
  conversationId: string,
  userId: string,
  version: number | null | undefined,
  assistantId?: string | null
) {
  const c = await Conversation.findOne({ _id: conversationId, deletedAt: null, membershipVersion: version });
  if (!c) return false;
  if (c.kind === 'assistant') {
    return (
      c.createdBy === userId &&
      (!assistantId || Boolean(await Assistant.exists({ _id: assistantId, ...usableAssistant(userId) })))
    );
  }
  if (!assistantId || !sharedEnabled(c)) return false;
  if (c.kind === 'group' || c.kind === 'project') {
    if (c.groupId ? !(await groups.checkMembership(c.groupId, userId)).member : c.createdBy !== userId) return false;
  } else if (!c.participants.some((p) => p.userId === userId && p.state === 'active')) return false;
  try {
    await requireSharedBot(c, assistantId);
    return true;
  } catch (error) {
    if (error instanceof NotFoundError) return false;
    throw error;
  }
}
export async function requireSharedManager(req: Request, c: ChatConversation) {
  if (!(await managesShared(req, c)))
    throw new ForbiddenError('Only conversation administrators can manage assistants');
}

/** Pause/removal cancels durable work too: briefly resuming must not revive old questions. */
export async function revokeAssistantWork(assistantId: string) {
  await Message.updateMany(
    { $or: [{ 'assistantRequest.assistantId': assistantId }, { 'screenRequest.assistantId': assistantId }] },
    { $set: { assistantCancelled: true }, $unset: { assistantRequest: 1, screenRequest: 1 } }
  );
  await AssistantRun.updateMany(
    { assistantId, state: { $in: ['queued', 'screen_queued', 'running'] } },
    { $set: { state: 'cancelled', activity: 'Cancelled', finishedAt: new Date() } }
  );
  // Keep completed usage/prices intact while preventing later outbox publication.
  await AssistantRun.updateMany({ assistantId, state: 'completed', published: false }, { $set: { published: true } });
}
