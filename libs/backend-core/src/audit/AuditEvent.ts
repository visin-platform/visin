import mongoose, { Document, Schema } from 'mongoose';

/**
 * What one MCP tool call cost.
 *
 * Worth recording because a tool result is not a page someone closes: it stays
 * in the conversation and is sent again with every message that follows, so one
 * large answer is paid for on every later turn. Nothing else in the stack can
 * see that — vision-service logs "read some trainings" whether the reply was
 * four numbers or four hundred epochs.
 */
export interface ToolCall {
  /** the tool as the model called it — 'get_training_curve', 'list_projects' */
  name: string;
  /** how long the handler took end to end, including the calls it made */
  ms: number;
  /** characters of text handed back to the model */
  chars: number;
  /**
   * Roughly what those characters cost, at four to a token.
   *
   * An estimate on purpose: the real count needs a tokeniser this service has
   * no reason to carry, and the decision it informs — which tool is the
   * expensive one — is never close enough for the difference to matter.
   */
  tokens: number;
  /** the call came back as an error, so the size is a message rather than data */
  failed?: boolean;
}

export type ActorKind = 'api_key' | 'oauth';

export interface IAuditEvent extends Document {
  at: Date;
  /** which service handled it; only mcp-service writes today */
  service: string;
  /** left open so this collection can grow past tool calls without a migration */
  action: 'call';
  actorKind: ActorKind;
  /** the account acted for — every listing is scoped to this */
  userId: string;
  /** the key's name or the connected app's, as its owner would recognise it */
  actorLabel: string;
  /**
   * Which credential, stably.
   *
   * A key's document id or an OAuth client id — never an access token's `jti`,
   * which rotates hourly and would make one connection look like a new actor
   * every time it refreshed.
   */
  actorCredentialId?: string;
  tool: ToolCall;
  createdAt: Date;
}

const ToolCallSchema = new Schema<ToolCall>(
  {
    name: { type: String, required: true },
    ms: { type: Number, required: true },
    chars: { type: Number, required: true },
    tokens: { type: Number, required: true },
    failed: { type: Boolean }
  },
  { _id: false }
);

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    at: { type: Date, required: true, default: Date.now },
    service: { type: String, required: true },
    action: { type: String, required: true, enum: ['call'] },
    actorKind: { type: String, required: true, enum: ['api_key', 'oauth'] },
    // No `index: true` here — the compound below already covers a userId-only
    // lookup, and declaring both builds a second index nothing ever uses.
    userId: { type: String, required: true },
    actorLabel: { type: String, required: true },
    actorCredentialId: { type: String },
    tool: { type: ToolCallSchema, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_events' }
);

// Every listing is one account's trail, newest first.
AuditEventSchema.index({ userId: 1, at: -1 });
// "Which tool is the expensive one" is the other question these rows answer.
AuditEventSchema.index({ 'tool.name': 1, at: -1 });

/**
 * Rows expire on their own after a year.
 *
 * Deliberately no arguments and no result text is stored — only the tool's
 * name and the size of what came back — so this is not a shadow copy of
 * anything a project contains, and a long retention costs nothing but a few
 * hundred bytes a call. A year is enough to see a trend and short enough that
 * the collection cannot grow without bound.
 */
const RETENTION_DAYS = 365;
AuditEventSchema.index({ at: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

export const AuditEvent = mongoose.models.AuditEvent
  ? (mongoose.models.AuditEvent as mongoose.Model<IAuditEvent>)
  : mongoose.model<IAuditEvent>('AuditEvent', AuditEventSchema);
