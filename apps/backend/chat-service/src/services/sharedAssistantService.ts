import { usableAssistant } from './assistantAvailability';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import { type Request } from 'express';
import { Assistant } from '../models/Assistant';
import { ConversationAssistant } from '../models/ConversationAssistant';
import { authorize } from './access';
import { appendMessage } from './messages';
import { assistantAdditionPolicy, audienceKey, requireSharedManager, sharedView } from './sharedAssistants';
import { actorName } from '../utils/request';
import { sharedAssistantSchema } from '../validation/assistantSchemas';
import { parsed } from '../validation/parse';

export async function getSharedAssistants(req: Request, conversationId: string) {
  const c = await authorize(req, conversationId, true);
  if (c.kind === 'assistant') throw new BadRequestError('Use your private assistant settings');
  return await sharedView(req, c);
}

export async function updateSharedAssistants(req: Request, conversationId: string, body: unknown) {
  const input = parsed(sharedAssistantSchema, body);
  if (input.whoCanAdd !== undefined && input.action !== 'addition-policy')
    throw new BadRequestError('Use the assistant addition policy action');
  const c = await authorize(req, conversationId, true);
  if (c.kind === 'assistant') throw new BadRequestError('Use your private assistant settings');
  const userId = req.user!.id;
  const unanimous = c.kind === 'direct' || c.kind === 'room';
  let description: string;
  if (!c.sharedAssistants) c.set('sharedAssistants', { enabled: false, lockedOff: false, consents: [] });
  if (input.action === 'consent') {
    if (!unanimous || input.enabled === undefined)
      throw new BadRequestError('Consent requires a direct chat or room and a choice');
    const audience = audienceKey(c);
    const consents = c.sharedAssistants.consents
      .filter((g) => g.userId !== userId)
      .map((g) => ({ userId: g.userId, audience: g.audience }));
    if (input.enabled) consents.push({ userId, audience });
    c.set('sharedAssistants.consents', consents);
    description = input.enabled
      ? 'agreed to shared assistants for this audience'
      : 'withdrew agreement to shared assistants';
  } else {
    if (input.action !== 'add' || assistantAdditionPolicy(c) !== 'everyone') await requireSharedManager(req, c);
    if (input.action === 'addition-policy') {
      if (c.kind === 'direct') throw new BadRequestError('Either person may add assistants in a direct chat');
      if (!input.whoCanAdd) throw new BadRequestError('Choose who may add assistants');
      c.sharedAssistants.whoCanAdd = input.whoCanAdd;
      c.sharedAssistants.enabled = false;
      c.set('sharedAssistants.consents', []);
      description = `allowed ${input.whoCanAdd === 'everyone' ? 'all members' : 'only administrators'} to add assistants; assistants require fresh enablement or agreement`;
    } else if (input.action === 'add' || input.action === 'remove') {
      if (!input.assistantId) throw new BadRequestError('Choose an assistant');
      if (input.action === 'add') {
        if (c.sharedAssistants.lockedOff) throw new ForbiddenError('Assistants are locked off');
        if (c.sharedAssistantIds.length >= 5) throw new BadRequestError('At most five shared assistants');
        const assistant = await Assistant.findOne({
          _id: input.assistantId,
          ...usableAssistant(userId)
        });
        if (!assistant) throw new NotFoundError('Assistant is unavailable');
        const current = await ConversationAssistant.find({ _id: { $in: c.sharedAssistantIds } });
        if (
          current.some((b) => b.assistantId === assistant.id || b.name.toLowerCase() === assistant.name.toLowerCase())
        )
          throw new BadRequestError('That assistant or name is already in this chat');
        const bot = await ConversationAssistant.findOneAndUpdate(
          { conversationId: c.id, assistantId: assistant.id },
          { $set: { name: assistant.name, personality: assistant.personality, addedBy: userId } },
          { upsert: true, returnDocument: 'after' }
        );
        c.sharedAssistantIds.push(bot.id);
        description = `added ${assistant.name}; its shared instructions are visible in Assistants`;
      } else {
        const bot = await ConversationAssistant.findOne({
          _id: { $in: c.sharedAssistantIds },
          assistantId: input.assistantId,
          conversationId: c.id
        });
        if (!bot) throw new NotFoundError('Shared assistant not found');
        c.sharedAssistantIds = c.sharedAssistantIds.filter((value) => value !== bot.id);
        description = `removed ${bot.name}`;
      }
      // Changes to the disclosed assistants require fresh agreement / administrator enablement.
      c.set('sharedAssistants.consents', []);
      c.sharedAssistants.enabled = false;
    } else {
      if (input.enabled === undefined) throw new BadRequestError('Choose on or off');
      if (input.action === 'switch') {
        if (unanimous) throw new BadRequestError('Everyone must agree in this conversation');
        if (c.sharedAssistants.lockedOff && input.enabled) throw new ForbiddenError('Assistants are locked off');
        c.sharedAssistants.enabled = input.enabled;
        description = `turned shared assistants ${input.enabled ? 'on' : 'off'}`;
      } else {
        if (c.kind === 'direct') throw new BadRequestError('Either person can withdraw consent');
        c.sharedAssistants.lockedOff = input.enabled;
        c.sharedAssistants.enabled = false;
        c.set('sharedAssistants.consents', []);
        description = input.enabled ? 'locked shared assistants off' : 'unlocked shared assistants';
      }
    }
  }
  c.membershipVersion += 1;
  try {
    await c.save();
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError')
      throw new ConflictError('Conversation changed; reload and review assistant settings');
    throw error;
  }
  await appendMessage({
    conversationId: c.id,
    senderId: userId,
    senderName: actorName(req),
    kind: 'system',
    body: `${actorName(req)} ${description}. Shared assistants use only this chat, with no project or dataset access.`,
    clientId: `policy:${c.id}:${c.membershipVersion}`
  });
  return await sharedView(req, c);
}
