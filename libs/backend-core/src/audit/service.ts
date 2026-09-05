import { AuditEvent, type ActorKind, type ToolCall } from './AuditEvent';
import { logger } from '../logging/logger';

export interface RecordToolCallInput {
  service: string;
  userId: string;
  actorKind: ActorKind;
  actorLabel: string;
  actorCredentialId?: string;
  tool: ToolCall;
}

/**
 * Write one row, and never let writing it fail the call it describes.
 *
 * Fire-and-forget on purpose: instrumentation that can break the thing it
 * instruments is worse than no instrumentation. The process log carries the
 * same line, so a Mongo outage costs the history rather than the visibility —
 * and a throw here would surface to the model as a failed tool call, which it
 * would then retry, doubling the cost this exists to measure.
 */
export const recordToolCall = (input: RecordToolCallInput): void => {
  logger.info('MCP tool call', {
    tool: input.tool.name,
    ms: input.tool.ms,
    chars: input.tool.chars,
    tokens: input.tool.tokens,
    failed: input.tool.failed === true,
    actor: input.actorLabel
  });

  void AuditEvent.create({ at: new Date(), action: 'call', ...input }).catch((error: Error) => {
    logger.warn('Could not record a tool call', { error: error?.message });
  });
};

export interface ToolCallRow {
  at: string;
  tool: string;
  ms: number;
  tokens: number;
  failed: boolean;
  actorLabel: string;
  actorKind: ActorKind;
}

/** One account's recent tool calls, newest first. */
export const listToolCalls = async (userId: string, limit = 100): Promise<ToolCallRow[]> => {
  const events = await AuditEvent.find({ userId }).sort({ at: -1 }).limit(limit);

  return events.map((event) => ({
    at: event.at.toISOString(),
    tool: event.tool.name,
    ms: event.tool.ms,
    tokens: event.tool.tokens,
    failed: event.tool.failed === true,
    actorLabel: event.actorLabel,
    actorKind: event.actorKind
  }));
};

export interface ToolUsage {
  tool: string;
  calls: number;
  failed: number;
  totalTokens: number;
  /** the number that decides which tool to shrink first */
  avgTokens: number;
  avgMs: number;
  maxTokens: number;
}

/**
 * What each tool has cost, worst first.
 *
 * Ordered by total tokens rather than by call count, because those rank
 * differently and the total is the one that shows up on a bill: a tool called
 * twice that returns a whole epoch series costs more than a hundred cheap
 * lookups.
 */
export const summariseToolUsage = async (userId: string, since?: Date): Promise<ToolUsage[]> => {
  const match: Record<string, unknown> = { userId };
  if (since) match.at = { $gte: since };

  const rows = await AuditEvent.aggregate<{
    _id: string;
    calls: number;
    failed: number;
    totalTokens: number;
    avgTokens: number;
    avgMs: number;
    maxTokens: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: '$tool.name',
        calls: { $sum: 1 },
        failed: { $sum: { $cond: ['$tool.failed', 1, 0] } },
        totalTokens: { $sum: '$tool.tokens' },
        avgTokens: { $avg: '$tool.tokens' },
        avgMs: { $avg: '$tool.ms' },
        maxTokens: { $max: '$tool.tokens' }
      }
    },
    { $sort: { totalTokens: -1 } }
  ]);

  return rows.map((row) => ({
    tool: row._id,
    calls: row.calls,
    failed: row.failed,
    totalTokens: row.totalTokens,
    avgTokens: Math.round(row.avgTokens),
    avgMs: Math.round(row.avgMs),
    maxTokens: row.maxTokens
  }));
};
