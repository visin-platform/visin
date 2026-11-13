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
    unsentAt: { type: Date, default: null },
    revision: { type: Number, default: 0 },
    reactions: {
      type: [
        new Schema(
          { userId: { type: String, required: true }, emoji: { type: String, required: true } },
          { _id: false }
        )
      ],
      default: []
    },
    // A message may be only files, so text is required only when there are none.
    body: {
      type: String,
      required: function (this: { attachments?: unknown[]; unsentAt?: Date }) {
        return !this.unsentAt && !this.attachments?.length;
      },
      default: '',
      maxlength: 20000
    },
    // Files in the message: references to file-service, never the bytes. Written once, when the message is.
    attachments: {
      type: [
        new Schema(
          {
            fileId: { type: String, required: true },
            name: { type: String, required: true, maxlength: 200 },
            mime: { type: String, required: true, maxlength: 100 },
            size: { type: Number, required: true },
            kind: { type: String, enum: ['image', 'video', 'audio', 'file'], required: true }
          },
          { _id: false }
        )
      ],
      default: undefined
    },
    clientId: { type: String, required: true },
    seq: { type: Number, required: true },
    replyTo: String,
    quote: {
      type: new Schema(
        {
          messageId: { type: String, required: true },
          senderName: { type: String, required: true },
          body: { type: String, required: true, maxlength: 500 },
          kind: { type: String, enum: ['person', 'assistant', 'system'], required: true },
          unsent: Boolean
        },
        { _id: false }
      )
    },
    evidence: { type: [{ tool: String, input: Schema.Types.Mixed, at: Date }], default: [] },
    /** Next questions the analyst offered after this answer: shown as one-click suggestions, never run on their own. */
    suggestions: { type: [{ type: String, maxlength: 120 }], default: undefined },
    assistantCancelled: { type: Boolean, default: false, select: false },
    assistantRequest: { type: assistantRequestSchema, select: false },
    // Kept outside the legacy outbox so workers without screen support cannot consume it.
    screenRequest: { type: assistantRequestSchema, select: false },
    findingId: String
  },
  { timestamps: true }
);
messageSchema.index({ conversationId: 1, revision: 1 });
messageSchema.index({ conversationId: 1, clientId: 1 }, { unique: true });
messageSchema.index({ conversationId: 1, seq: -1 }, { unique: true });
messageSchema.index({ createdAt: 1, _id: 1 }, { partialFilterExpression: { screenRequest: { $exists: true } } });
messageSchema.index({ createdAt: 1 }, { partialFilterExpression: { assistantRequest: { $exists: true } } });
// A file belongs to one message: sending it twice would let a second message read what the first one shared.
messageSchema.index(
  { 'attachments.fileId': 1 },
  { unique: true, partialFilterExpression: { 'attachments.fileId': { $exists: true } } }
);
export const Message = model('ChatMessage', messageSchema);
