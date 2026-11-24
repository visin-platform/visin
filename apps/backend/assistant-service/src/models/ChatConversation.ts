import { Schema, model, type InferSchemaType } from 'mongoose';
import type { ReadOnlyModel } from './ReadOnlyModel';

const participant = new Schema(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    state: { type: String, enum: ['invited', 'active', 'left', 'blocked'], required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: null },
    joinedSeq: { type: Number, default: 0 },
    readSeq: { type: Number, default: 0 },
    /** The seq of this person's latest "new topic" in a private assistant chat: the assistant forgets what came before. */
    topicSeq: { type: Number, default: 0 }
  },
  { _id: false }
);
const conversationSchema = new Schema(
  {
    kind: { type: String, enum: ['assistant', 'direct', 'room', 'group', 'project'], required: true },
    title: { type: String, required: true, maxlength: 120 },
    createdBy: { type: String, required: true },
    participants: { type: [participant], required: true },
    assistantId: String,
    sharedAssistantIds: { type: [String], default: [] },
    sharedAssistants: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: false },
          lockedOff: { type: Boolean, default: false },
          whoCanAdd: { type: String, enum: ['everyone', 'admins'] },
          consents: { type: [new Schema({ userId: String, audience: String }, { _id: false })], default: [] }
        },
        { _id: false }
      ),
      default: () => ({ enabled: false, lockedOff: false, consents: [] })
    },
    membershipEvents: {
      type: [
        new Schema(
          {
            clientId: { type: String, required: true },
            seq: { type: Number, required: true },
            body: { type: String, required: true },
            at: { type: Date, required: true }
          },
          { _id: false }
        )
      ],
      default: [],
      select: false
    },
    directKey: { type: String },
    bindingKey: { type: String },
    /** A deleted chat's old `bindingKey`, moved aside so the person's next chat can take it. */
    deletedBindingKey: { type: String },
    groupId: String,
    projectId: String,
    /** a research paper this private analysis is about; its text is read through the paper tools */
    paperId: String,
    paperTitle: String,
    trainingIds: { type: [String], default: [] },
    projectName: String,
    trainingLabels: { type: [{ id: String, name: String }], default: [] },
    requestSent: { type: Boolean, default: false },
    requestClientId: String,
    seq: { type: Number, default: 0 },
    messageVersion: { type: Number, default: 0 },
    lastMessageSeq: { type: Number, default: 0 },
    membershipVersion: { type: Number, default: 1 },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true, optimisticConcurrency: true }
);
conversationSchema.set('autoIndex', false);
conversationSchema.set('autoCreate', false);
const model_ = model('AssistantChatConversationView', conversationSchema, 'chatconversations');
/** Chat's conversations. Reading only: what Vivi changes there it asks chat to (see chatPort). */
export const Conversation: ReadOnlyModel<typeof model_> = model_;
export type ChatConversation = InferSchemaType<typeof conversationSchema> & { _id: { toString(): string } };
