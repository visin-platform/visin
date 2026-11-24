import { Schema, model } from 'mongoose';
import type { ReadOnlyModel } from './ReadOnlyModel';

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

/** What a question to the analyst is about: a project and some of its runs, or a paper. Checked when it is sent. */
const askedAboutSchema = new Schema(
  {
    projectId: String,
    projectName: { type: String, maxlength: 200 },
    trainingIds: { type: [String], default: [] },
    trainingLabels: { type: [new Schema({ id: String, name: String }, { _id: false })], default: [] },
    paperId: String,
    paperTitle: { type: String, maxlength: 200 }
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
      // Chat's rule (a body, or files, unless unsent) is chat's to enforce when it writes; a view never validates.
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
    /** What this question is about; only on a person's question in a private analysis chat. */
    context: { type: askedAboutSchema },
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
    /** What the analyst wrote before each round of reading: its thinking, shown folded with the answer. */
    thoughts: { type: [{ text: { type: String, maxlength: 600 }, at: Date }], default: undefined },
    assistantCancelled: { type: Boolean, default: false, select: false },
    // A question edited into a new one, and the answer it had: retired, not deleted, so clients hide them and the
    // run keeps its history.
    supersededAt: { type: Date, default: null },
    // Who is editing this question right now, so two edits of it cannot both send a replacement. Expires, so a request
    // that died after claiming it does not lock the question.
    editClaim: { type: new Schema({ by: String, at: Date }, { _id: false }), select: false },
    assistantRequest: { type: assistantRequestSchema, select: false },
    // Kept outside the legacy outbox so workers without screen support cannot consume it.
    screenRequest: { type: assistantRequestSchema, select: false },
    findingId: String
  },
  { timestamps: true }
);
messageSchema.set('autoIndex', false);
messageSchema.set('autoCreate', false);
const model_ = model('AssistantChatMessageView', messageSchema, 'chatmessages');
/** Chat's messages. Reading only: what Vivi changes there it asks chat to (see chatPort). */
export const Message: ReadOnlyModel<typeof model_> = model_;
