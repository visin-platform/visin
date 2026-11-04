import { BadRequestError, ConflictError, ForbiddenError } from '@visin/backend-core';
import { type Request } from 'express';
import { flushMembershipEvents } from './membershipAudit';
import { Block } from '../models/Block';
import { authorize, publicPerson } from './access';
import { Conversation } from '../models/Conversation';
import { actorName } from '../utils/request';
import {
  membershipActionSchema,
  participantHandleSchema,
  participantIdSchema
} from '../validation/conversationSchemas';
import { parsed } from '../validation/parse';

async function saveWithAudit(c: InstanceType<typeof Conversation>, body: string) {
  const previousSeq = c.seq;
  // Concurrent sends must not move the sequence between the join boundary and this audit event.
  c.$where = { seq: previousSeq };
  c.seq += 1;
  c.set('membershipEvents', []);
  c.membershipEvents.push({ clientId: `membership:${c.membershipVersion}`, seq: c.seq, body, at: new Date() });
  try {
    await c.save();
  } catch (error) {
    if (error instanceof Error && ['VersionError', 'DocumentNotFoundError'].includes(error.name))
      throw new ConflictError('Conversation changed; reload before changing membership');
    throw error;
  }
  await flushMembershipEvents(c.id);
  // Hidden recovery metadata is never part of the HTTP response.
  return await Conversation.findById(c.id);
}

export async function updateMembership(req: Request, conversationId: string, actionValue: unknown) {
  const action = parsed(membershipActionSchema, actionValue);
  const c = await authorize(req, conversationId);
  await flushMembershipEvents(conversationId);
  if (c.kind !== 'direct' && c.kind !== 'room') throw new BadRequestError('Manage membership in the owning group');
  const member = c.participants.find((p) => p.userId === req.user!.id)!;
  if (action === 'accept' && member.state === 'active') return c;
  if (action === 'accept' && member.state !== 'invited') throw new BadRequestError('No pending invitation');
  if (action === 'block' && c.kind !== 'direct') throw new BadRequestError('Blocking applies to direct conversations');
  if (action === 'block') {
    const other = c.participants.find((p) => p.userId !== req.user!.id)!;
    await Block.updateOne(
      { userId: req.user!.id, blockedId: other.userId },
      { $setOnInsert: { userId: req.user!.id, blockedId: other.userId } },
      { upsert: true }
    );
  }
  member.state = action === 'accept' ? 'active' : action === 'block' ? 'blocked' : 'left';
  if (action === 'accept') {
    member.name = actorName(req);
    member.joinedAt = new Date();
    member.joinedSeq = c.kind === 'room' ? c.seq : 0;
  }
  c.membershipVersion += 1;
  if (action === 'accept' && !c.participants.some((p) => p.state === 'active' && p.role === 'owner'))
    member.role = 'owner';
  if (member.role === 'owner' && action !== 'accept') {
    const successor = c.participants.find((p) => p.userId !== member.userId && p.state === 'active');
    if (successor) successor.role = 'owner';
  }
  return await saveWithAudit(
    c,
    action === 'accept'
      ? `${actorName(req)} joined the conversation.`
      : action === 'block'
        ? 'This conversation was closed.'
        : `${actorName(req)} left the conversation.`
  );
}

export async function inviteParticipant(req: Request, conversationId: string, handleValue: unknown) {
  const c = await authorize(req, conversationId, true);
  await flushMembershipEvents(conversationId);
  const member = c.participants.find((p) => p.userId === req.user!.id);
  if (c.kind !== 'room' || !member || !['owner', 'admin'].includes(member.role))
    throw new ForbiddenError('Only room administrators invite people');
  const handle = parsed(participantHandleSchema, handleValue);
  const person = await publicPerson(handle);
  if (person.kind === 'assistant') throw new BadRequestError('Add bots through shared assistant settings');
  const previous = c.participants.find((p) => p.userId === person.id);
  // Someone who left or was removed can be invited again; they see history from the new acceptance.
  if (previous?.state === 'invited') return c;
  if (previous && previous.state !== 'left') throw new BadRequestError('This account was already invited');
  if (c.participants.filter((p) => p.state === 'active' || p.state === 'invited').length >= 20)
    throw new BadRequestError('Room participant limit reached');
  if (
    await Block.exists({
      $or: [
        { userId: req.user!.id, blockedId: person.id },
        { userId: person.id, blockedId: req.user!.id }
      ]
    })
  )
    throw new ForbiddenError('Cannot invite this person');
  if (previous) {
    previous.name = person.name;
    previous.state = 'invited';
    previous.role = 'member';
    previous.joinedAt = null;
  } else
    c.participants.push({
      userId: person.id,
      name: person.name,
      state: 'invited',
      role: 'member',
      joinedAt: null,
      readSeq: 0
    });
  c.membershipVersion += 1;
  return await saveWithAudit(c, `${actorName(req)} invited ${person.name}.`);
}

export async function removeParticipant(req: Request, conversationId: string, userIdValue: unknown) {
  const c = await authorize(req, conversationId, true);
  await flushMembershipEvents(conversationId);
  const member = c.participants.find((p) => p.userId === req.user!.id);
  if (c.kind !== 'room' || member?.role !== 'owner')
    throw new ForbiddenError('Only the room owner removes participants');
  const targetId = parsed(participantIdSchema, userIdValue);
  const target = c.participants.find((p) => p.userId === targetId);
  if (!target || target.userId === req.user!.id) throw new BadRequestError('Choose another participant');
  if (target.state === 'left') return c;
  target.state = 'left';
  c.membershipVersion += 1;
  return await saveWithAudit(c, `${actorName(req)} removed ${target.name}.`);
}
