import { Conversation, Message } from '../models';

export async function appendMessage(input: {
  conversationId: string;
  senderId: string;
  senderName: string;
  kind: 'person' | 'assistant' | 'system';
  body: string;
  clientId: string;
  replyTo?: string;
  assistantRequest?: { email: string; userId: string; name: string; membershipVersion: number };
  evidence?: { tool: string; input: unknown; at: Date }[];
}) {
  const existing = await Message.findOne({ conversationId: input.conversationId, clientId: input.clientId });
  if (existing) {
    await Conversation.updateOne(
      { _id: input.conversationId, lastMessageSeq: { $lt: existing.seq } },
      { $max: { lastMessageSeq: existing.seq } }
    );
    return existing;
  }
  const conversation = await Conversation.findOneAndUpdate(
    { _id: input.conversationId, deletedAt: null },
    { $inc: { seq: 1 } },
    { returnDocument: 'after' }
  );
  if (!conversation) throw new Error('Conversation removed');
  try {
    const message = await Message.create({ ...input, seq: conversation.seq });
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
    }
    throw error;
  }
}
