import { Schema, model } from 'mongoose';

/** A conversation one person has put away. Per person: nobody else's list changes. */
const hiddenSchema = new Schema(
  {
    userId: { type: String, required: true },
    conversationId: { type: String, required: true },
    /** The newest message when it was hidden: a later message from someone else brings the chat back. */
    seq: { type: Number, default: 0 }
  },
  { timestamps: true }
);
hiddenSchema.index({ userId: 1, conversationId: 1 }, { unique: true });
export const ConversationHidden = model('ChatConversationHidden', hiddenSchema);
