import { Schema, model } from 'mongoose';

/** Shared configuration is a disclosed snapshot; private edits cannot silently change it. */
const conversationAssistantSchema = new Schema(
  {
    conversationId: { type: String, required: true },
    assistantId: { type: String, required: true },
    addedBy: { type: String, required: true },
    name: { type: String, required: true },
    personality: { type: String, default: '' }
  },
  { timestamps: true }
);
conversationAssistantSchema.index({ conversationId: 1, assistantId: 1 }, { unique: true });
export const ConversationAssistant = model('ChatConversationAssistant', conversationAssistantSchema);
