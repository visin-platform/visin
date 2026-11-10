import mongoose from 'mongoose';
import { NotFoundError } from '@visin/backend-core';
import { AssistantRun } from '../models/AssistantRun';
import { Message } from '../models/Message';
import { ProviderUsage } from '../models/ProviderUsage';
import { parsed } from '../validation/parse';
import { runIdSchema, runsQuerySchema } from '../validation/adminControlSchemas';
import { effectivePolicy } from './adminPolicy';
import { guestBudgetSnapshot } from './guestAdmission';

const ACTIVE = ['queued', 'screen_queued', 'running'] as const;

/** One row per account, provider, model, currency and kind (user or guest). */
const usageByAccountAndModel = (match: Record<string, unknown>) =>
  ProviderUsage.aggregate([
    { $match: match },
    {
      $group: {
        _id: { userId: '$userId', provider: '$provider', model: '$model', currency: '$price.currency', kind: '$kind' },
        calls: { $sum: 1 },
        inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
        outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
        // Pending and uncertain calls may have cost something: they are counted, never shown as zero.
        uncertain: { $sum: { $cond: [{ $ne: ['$state', 'completed'] }, 1, 0] } },
        unpriced: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$state', 'completed'] }, { $eq: [{ $ifNull: ['$estimatedCost', null] }, null] }] },
              1,
              0
            ]
          }
        },
        estimatedCost: { $sum: '$estimatedCost' }
      }
    },
    { $sort: { inputTokens: -1 } },
    { $limit: 500 }
  ]);

/** The latest questions, provider-call usage and today's shared guest budget for one period. */
export async function runsReport(rawQuery: unknown) {
  const query = parsed(runsQuerySchema, rawQuery);
  const since = new Date(Date.now() - query.days * 86400000);
  const match = { ...(query.userId ? { userId: query.userId } : {}), createdAt: { $gte: since } };
  const [runs, usage, budget, policy] = await Promise.all([
    AssistantRun.find(match)
      .select('_id userId name provider model state activity createdAt finishedAt inputTokens outputTokens')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    usageByAccountAndModel(match),
    guestBudgetSnapshot(),
    effectivePolicy()
  ]);
  return {
    runs,
    usage,
    since,
    guestBudget: {
      ...budget,
      dailyCeilingMicros: policy.guestDailyBudgetMicros,
      monthlyCeilingMicros: policy.guestMonthlyBudgetMicros,
      currency: 'USD'
    },
    note: 'Provider-call measurement starts with this deployment. Pending/uncertain calls are not zero usage. Costs are estimates grouped by currency.'
  };
}

/**
 * Stops a queued or running question the way its asker's own cancel does: the run is cancelled (a running worker
 * notices within a second and aborts) and its message no longer waits for an answer.
 */
export async function cancelRun(rawId: unknown): Promise<void> {
  const id = parsed(runIdSchema, rawId);
  const run = await AssistantRun.findOneAndUpdate(
    { _id: id, state: { $in: [...ACTIVE] } },
    { $set: { state: 'cancelled', activity: 'Cancelled by administrator', finishedAt: new Date() }, $unset: { draft: 1 } }
  );
  if (!run) throw new NotFoundError('Active run not found');
  if (mongoose.isValidObjectId(run.messageId))
    await Message.updateOne(
      { _id: run.messageId },
      { $unset: { assistantRequest: 1, screenRequest: 1 }, $set: { assistantCancelled: true } }
    );
}
