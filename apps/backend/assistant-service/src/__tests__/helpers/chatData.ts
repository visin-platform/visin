import mongoose from 'mongoose';
import { Conversation } from '../../models/ChatConversation';
import { Message } from '../../models/ChatMessage';

/**
 * Chat's collections, writable, for a test to put in them what chat would have. The service itself only reads them
 * (models/ChatConversation, models/ChatMessage) and asks chat to change anything.
 */
export const chatConversations = mongoose.model('TestChatConversation', Conversation.schema, 'chatconversations');
export const chatMessages = mongoose.model('TestChatMessage', Message.schema, 'chatmessages');

/** A person's private chat with an assistant, as chat saves one. */
export async function seedAssistantChat(userId = 'alice', assistantId?: string) {
  return chatConversations.create({
    kind: 'assistant',
    title: 'Research',
    createdBy: userId,
    participants: [{ userId, name: userId, state: 'active', role: 'owner', joinedAt: new Date() }],
    bindingKey: `assistant:${assistantId || 'default'}:${userId}`,
    ...(assistantId ? { assistantId } : {})
  });
}

/** A room of people, as chat saves one. */
export async function seedRoom(people: string[] = ['alice', 'bob']) {
  return chatConversations.create({
    kind: 'room',
    title: 'Room',
    createdBy: people[0],
    participants: people.map((userId, index) => ({
      userId,
      name: userId,
      state: 'active',
      role: index === 0 ? 'owner' : 'member',
      joinedAt: new Date()
    }))
  });
}
