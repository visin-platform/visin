import { Schema, model, type InferSchemaType } from 'mongoose';

const participant = new Schema(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    state: { type: String, enum: ['invited', 'active', 'left', 'blocked'], required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: null },
    joinedSeq: { type: Number, default: 0 },
    readSeq: { type: Number, default: 0 }
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
    groupId: String,
    projectId: String,
    trainingIds: { type: [String], default: [] },
    projectName: String,
    trainingLabels: { type: [{ id: String, name: String }], default: [] },
    requestSent: { type: Boolean, default: false },
    requestClientId: String,
    seq: { type: Number, default: 0 },
    lastMessageSeq: { type: Number, default: 0 },
    membershipVersion: { type: Number, default: 1 },
    workerUntil: Date,
    workerRunId: String,
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true, optimisticConcurrency: true }
);
conversationSchema.index({ directKey: 1 }, { unique: true, sparse: true });
conversationSchema.index({ bindingKey: 1 }, { unique: true, sparse: true });
conversationSchema.index({ 'participants.userId': 1, updatedAt: -1 });
// The other half of the conversation list: channels of the caller's groups.
conversationSchema.index({ groupId: 1, updatedAt: -1 });
export const Conversation = model('ChatConversation', conversationSchema);
export type ChatConversation = InferSchemaType<typeof conversationSchema> & { _id: { toString(): string } };
