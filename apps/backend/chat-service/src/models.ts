import { Schema, model, InferSchemaType } from 'mongoose';

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
    evidence: { type: [{ tool: String, input: Schema.Types.Mixed, at: Date }], default: [] },
    assistantCancelled: { type: Boolean, default: false, select: false },
    assistantRequest: {
      type: new Schema({ email: String, userId: String, name: String, membershipVersion: Number }, { _id: false }),
      select: false
    },
    findingId: String
  },
  { timestamps: true }
);
messageSchema.index({ conversationId: 1, clientId: 1 }, { unique: true });
messageSchema.index({ conversationId: 1, seq: -1 }, { unique: true });
messageSchema.index({ createdAt: 1 }, { partialFilterExpression: { assistantRequest: { $exists: true } } });
export const Message = model('ChatMessage', messageSchema);

const runSchema = new Schema(
  {
    conversationId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    state: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'cancelled'], default: 'queued' },
    result: String,
    evidence: { type: [{ tool: String, input: Schema.Types.Mixed, at: Date }], default: [] },
    published: { type: Boolean, default: false },
    activity: { type: String, default: 'Waiting' },
    error: String,
    leaseUntil: Date,
    keyId: String,
    provider: String,
    model: String,
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    attempt: { type: Number, default: 0 },
    membershipVersion: Number,
    // What the provider charged per million tokens when this answer was given, so a price that changes later
    // never rewrites what this question cost. Absent where no price was set then (see backfillPrices).
    price: {
      type: new Schema(
        {
          currency: { type: String, required: true },
          inputPerMillion: { type: Number, required: true },
          outputPerMillion: { type: Number, required: true },
          source: { type: String, enum: ['manual', 'fetched'], default: 'manual' },
          // Set afterwards by an administrator at the price then current, not at the time of the answer.
          backfilled: { type: Boolean, default: false }
        },
        { _id: false }
      )
    },
    finishedAt: Date
  },
  { timestamps: true }
);
runSchema.index({ state: 1, createdAt: 1 });
// Every open event stream reads a conversation's runs every two seconds.
runSchema.index({ conversationId: 1, userId: 1, createdAt: -1 });
// The publishing outbox, polled every second: completed runs only grow, unpublished ones stay few.
runSchema.index({ createdAt: 1 }, { partialFilterExpression: { state: 'completed', published: false } });
// The usage report reads answered questions by when they finished.
runSchema.index({ finishedAt: -1 }, { partialFilterExpression: { state: 'completed' } });
export const AssistantRun = model('ChatAssistantRun', runSchema);

const budgetSchema = new Schema({
  userId: { type: String, required: true },
  day: { type: String, required: true },
  reserved: { type: Number, default: 0 }
});
budgetSchema.index({ userId: 1, day: 1 }, { unique: true });
export const Budget = model('ChatBudget', budgetSchema);

/** A provider key an administrator saved in the page, encrypted: never returned, only its last characters. */
const providerKeySchema = new Schema(
  {
    // 'deployment' for the key everyone uses; a user's own key would be owned by that user.
    owner: { type: String, required: true },
    provider: { type: String, enum: ['anthropic', 'openai'], required: true },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    hint: { type: String, default: '' },
    updatedBy: String
  },
  { timestamps: true }
);
providerKeySchema.index({ owner: 1, provider: 1 }, { unique: true });
export const ProviderKey = model('ChatProviderKey', providerKeySchema);

/**
 * What the provider charges, entered by an administrator, so the usage page can turn tokens into money: one
 * currency, and a price per million input and output tokens for each model. Providers return no price with an
 * answer, and prices change, so nothing here is built in.
 */
const pricingSchema = new Schema(
  {
    _id: { type: String, required: true },
    currency: { type: String, default: 'USD' },
    entries: {
      type: [
        new Schema(
          {
            provider: { type: String, enum: ['anthropic', 'openai'], required: true },
            model: { type: String, required: true },
            inputPerMillion: { type: Number, required: true, min: 0 },
            outputPerMillion: { type: Number, required: true, min: 0 },
            // Typed by an administrator, or fetched from the price list when they asked for a refresh.
            source: { type: String, enum: ['manual', 'fetched'], default: 'manual' },
            fetchedAt: { type: Date, default: null }
          },
          { _id: false }
        )
      ],
      default: []
    },
    updatedBy: String
  },
  { timestamps: true }
);
export const Pricing = model('ChatPricing', pricingSchema);

/** Deployment-wide settings an administrator changes from the page, one document each. */
const settingsSchema = new Schema(
  {
    _id: { type: String, required: true },
    enabled: { type: Boolean, required: true },
    provider: { type: String, enum: ['anthropic', 'openai'], default: 'anthropic' },
    model: { type: String, default: '' },
    // Absent on settings saved before there was one: the default applies.
    dailyTokenLimit: Number,
    updatedBy: String
  },
  { timestamps: true }
);
export const Settings = model('ChatSettings', settingsSchema);

const blockSchema = new Schema({
  userId: { type: String, required: true },
  blockedId: { type: String, required: true }
});
blockSchema.index({ userId: 1, blockedId: 1 }, { unique: true });
export const Block = model('ChatBlock', blockSchema);
