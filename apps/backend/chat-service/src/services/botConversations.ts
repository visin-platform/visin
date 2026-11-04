import { NotFoundError } from '@visin/backend-core';
import { Assistant } from '../models/Assistant';
import { Conversation } from '../models/Conversation';

/** Repair old bot DMs after access has been checked. Historical messages are never replayed. */
export async function repairBotDirect(conversation: ReturnType<typeof Conversation.hydrate>, actor: string) {
  if (conversation.kind !== 'direct' || conversation.createdBy !== actor || conversation.participants.length !== 2)
    return conversation;
  const owner = conversation.participants.find((person) => person.userId === actor);
  const recipient = conversation.participants.find((person) => person.userId !== actor);
  if (owner?.state !== 'active' || !recipient || !['active', 'invited'].includes(recipient.state))
    return conversation;
  const bot = await Assistant.findOne({ profileUserId: recipient.userId });
  if (!bot) return conversation;
  const repaired = await Conversation.findOneAndUpdate(
    { _id: conversation._id, kind: 'direct', membershipVersion: conversation.membershipVersion, __v: conversation.__v },
    {
      $set: { kind: 'assistant', assistantId: bot.id, title: bot.name, participants: [owner] },
      $unset: { directKey: 1, requestSent: 1, requestClientId: 1 },
      $inc: { membershipVersion: 1, __v: 1 }
    },
    { returnDocument: 'after' }
  );
  if (repaired) return repaired;
  // Listing and loading messages can repair the same thread concurrently.
  const current = await Conversation.findOne({
    _id: conversation._id, kind: 'assistant', assistantId: bot.id, createdBy: actor, deletedAt: null
  });
  if (current?.participants.length === 1 && current.participants[0].userId === actor && current.participants[0].state === 'active')
    return current;
  throw new NotFoundError('Conversation changed; reopen it');
}
