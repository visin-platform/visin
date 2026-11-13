import { ConflictError } from '@visin/backend-core';
import type { Attachment } from './attachments';
import { flushMembershipEvents } from './membershipAudit';
import { Conversation } from '../models/Conversation';
import type { ScreenContext } from './screen';
import { Message } from '../models/Message';

export async function appendMessage(input: {
  expectedMembershipVersion?: number;
  conversationId: string;
  senderId: string;
  senderName: string;
  kind: 'person' | 'assistant' | 'system';
  body: string;
  attachments?: Attachment[];
  clientId: string;
  replyTo?: string;
  quote?: { messageId: string; senderName: string; body: string; kind: 'person' | 'assistant' | 'system' };
  assistantRequest?: {
    email: string;
    userId: string;
    name: string;
    membershipVersion: number;
    assistantId?: string;
    assistantName?: string;
    personality?: string;
    screen?: ScreenContext;
  };
  evidence?: { tool: string; input: unknown; at: Date }[];
  suggestions?: string[];
}) {
  await flushMembershipEvents(input.conversationId);
  const existing = await Message.findOne({ conversationId: input.conversationId, clientId: input.clientId });
  if (existing) {
    await Conversation.updateOne(
      { _id: input.conversationId, lastMessageSeq: { $lt: existing.seq } },
      { $max: { lastMessageSeq: existing.seq } }
    );
    return existing;
  }
  const conversation = await Conversation.findOneAndUpdate(
    {
      _id: input.conversationId,
      deletedAt: null,
      ...(input.expectedMembershipVersion === undefined ? {} : { membershipVersion: input.expectedMembershipVersion })
    },
    { $inc: { seq: 1 } },
    { returnDocument: 'after' }
  );
  if (!conversation) throw new ConflictError('Conversation changed; reload before sending');
  try {
    // Screen-aware work uses its own outbox field so a worker without screen support
    // cannot consume the request and silently discard its context.
    const { assistantRequest, ...messageInput } = input;
    const message = await Message.create({
      ...messageInput,
      ...(assistantRequest
        ? assistantRequest.screen
          ? { screenRequest: assistantRequest }
          : { assistantRequest }
        : {}),
      seq: conversation.seq
    });
    await Conversation.updateOne(
      { _id: input.conversationId, lastMessageSeq: { $lt: message.seq } },
      { $max: { lastMessageSeq: message.seq } }
    );
    return message;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const duplicate = await Message.findOne({ conversationId: input.conversationId, clientId: input.clientId });
      if (duplicate) {
        await Conversation.updateOne(
          { _id: input.conversationId, lastMessageSeq: { $lt: duplicate.seq } },
          { $max: { lastMessageSeq: duplicate.seq } }
        );
        return duplicate;
      }
      // Not a retry of this message: a file in it already belongs to another (the index allows one owner).
      throw new ConflictError('A file in this message was already sent');
    }
    throw error;
  }
}
