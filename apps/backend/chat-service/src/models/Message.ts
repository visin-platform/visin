import { Schema, model } from 'mongoose';

const assistantRequestSchema = new Schema(
  {
    email: String,
    userId: String,
    name: String,
    membershipVersion: Number,
    assistantId: String,
    assistantName: String,
    personality: String,
    screen: {
      type: new Schema(
        {
          tabId: String,
          allowActions: Boolean,
          path: String,
          actions: {
            type: [
              new Schema(
                { name: String, ids: [String], labels: { type: [String], default: undefined } },
                { _id: false }
              )
            ],
            default: undefined
          }
        },
        { _id: false }
      )
    }
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversationId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    kind: { type: String, enum: ['person', 'assistant', 'system'], required: true },
    body: { type: String, required: true, maxlength: 20000 },
    clientId: { type: String, required: true },
    seq: { type: Number, required: true },
    replyTo: String,
    quote: {
      type: new Schema(
        {
          messageId: { type: String, required: true },
          senderName: { type: String, required: true },
          body: { type: String, required: true, maxlength: 500 },
          kind: { type: String, enum: ['person', 'assistant', 'system'], required: true }
        },
        { _id: false }
      )
    },
    evidence: { type: [{ tool: String, input: Schema.Types.Mixed, at: Date }], default: [] },
    assistantCancelled: { type: Boolean, default: false, select: false },
    assistantRequest: { type: assistantRequestSchema, select: false },
    // Kept outside the legacy outbox so workers without screen support cannot consume it.
    screenRequest: { type: assistantRequestSchema, select: false },
    findingId: String
  },
  { timestamps: true }
);
messageSchema.index({ conversationId: 1, clientId: 1 }, { unique: true });
messageSchema.index({ conversationId: 1, seq: -1 }, { unique: true });
messageSchema.index({ createdAt: 1, _id: 1 }, { partialFilterExpression: { screenRequest: { $exists: true } } });
messageSchema.index({ createdAt: 1 }, { partialFilterExpression: { assistantRequest: { $exists: true } } });
export const Message = model('ChatMessage', messageSchema);
