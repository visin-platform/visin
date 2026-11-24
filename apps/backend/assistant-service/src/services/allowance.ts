import { Types } from 'mongoose';
import { AssistantRun } from '../models/AssistantRun';
import { Budget } from '../models/Budget';
import { SMALLEST_PRIVATE_QUESTION } from './analysisLimits';
import { assertViviUser } from './adminPolicy';
import { assistantSettings } from './settings';

/** The UTC day a budget is kept for, as the worker keys it. */
const today = () => new Date().toISOString().slice(0, 10);
const nextMidnightUtc = () => {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
};

/**
 * The tokens one person's questions still under way hold against `day`. They are reserved for the worst case and
 * mostly given back when each finishes, so they are not spent: a refusal or a notice counts them apart.
 */
export async function tokensHeld(userId: string, day: string, exceptRunId?: string): Promise<number> {
  const [held] = await AssistantRun.aggregate<{ tokens: number }>([
    {
      $match: {
        userId,
        state: 'running',
        'reservation.day': day,
        ...(exceptRunId ? { _id: { $ne: new Types.ObjectId(exceptRunId) } } : {})
      }
    },
    { $group: { _id: null, tokens: { $sum: '$reservation.tokens' } } }
  ]);
  return Math.max(0, held?.tokens ?? 0);
}

/**
 * What is left of one person's day with Vivi: questions, and the tokens a question reserves. So the page can say so
 * before a question is refused, rather than after. It reads the same budget the worker charges and changes nothing.
 */
export async function myAllowance(userId: string) {
  const [configured, policy] = await Promise.all([assistantSettings(), assertViviUser(userId)]);
  const day = today();
  const [budget, held] = await Promise.all([Budget.findOne({ userId, day }).lean(), tokensHeld(userId, day)]);
  const requestLimit = policy.dailyRequestLimit;
  const tokenLimit = Math.min(configured.dailyTokenLimit, policy.dailyTokenLimit);
  const requestsUsed = Math.max(0, budget?.requests ?? 0);
  // Spent, not held: a question still running holds its worst case, which is mostly given back when it finishes.
  const tokensUsed = Math.max(0, (budget?.reserved ?? 0) - held);
  const requestsLeft = Math.max(0, requestLimit - requestsUsed);
  const tokensLeft = Math.max(0, tokenLimit - tokensUsed);
  // Less than the fewest rounds a question can run on is no question at all: the worker refuses it as "used", so the
  // page says the same rather than "a little left".
  const tokensUsable = tokensLeft >= Math.min(SMALLEST_PRIVATE_QUESTION, tokenLimit) ? tokensLeft : 0;
  return {
    requests: { used: requestsUsed, limit: requestLimit, remaining: requestsLeft },
    tokens: { used: tokensUsed, limit: tokenLimit, remaining: tokensLeft },
    // The smaller share of the two that is left: the one that will run out first.
    remainingShare: Math.min(requestLimit > 0 ? requestsLeft / requestLimit : 0, tokenLimit > 0 ? tokensUsable / tokenLimit : 0),
    resetsAt: nextMidnightUtc()
  };
}
