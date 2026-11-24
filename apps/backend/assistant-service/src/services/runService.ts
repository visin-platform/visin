import { type Request } from 'express';
import { notify } from './wakeBus';
import { AssistantRun } from '../models/AssistantRun';
import { cancelRequests } from './chatClient';
import { authorize } from './access';

/** The person cancels their open questions in a conversation they may write in. */
export async function cancelRuns(req: Request, conversationId: string) {
  const c = await authorize(req, conversationId, true);
  await cancelRunsFor({ conversationId: c.id, userId: req.user!.id });
}

/**
 * Cancels a person's open questions in a conversation: the questions still waiting or being answered, not every message
 * the thread ever had. The caller has already checked the person may do this (chat, when a conversation is put away).
 */
export async function cancelRunsFor(input: { conversationId: string; userId: string }) {
  const open = await AssistantRun.find({
    conversationId: input.conversationId,
    userId: input.userId,
    state: { $in: ['queued', 'screen_queued', 'running'] }
  }).select('messageId');
  await cancelRequests({
    conversationId: input.conversationId,
    senderId: input.userId,
    messageIds: open.map((run) => run.messageId)
  });
  await AssistantRun.updateMany(
    {
      conversationId: input.conversationId,
      userId: input.userId,
      state: { $in: ['queued', 'screen_queued', 'running'] }
    },
    { $set: { state: 'cancelled', finishedAt: new Date(), activity: 'Cancelled' }, $unset: { draft: 1 } }
  );
  notify(`conv:${input.conversationId}`);
}

/** A question was unsent: whatever was made of it, and not yet published, is withdrawn. */
export async function cancelMessageRuns(input: { conversationId: string; messageId: string }) {
  await AssistantRun.updateMany(
    {
      conversationId: input.conversationId,
      messageId: input.messageId,
      state: { $in: ['queued', 'screen_queued', 'running', 'completed'] },
      published: { $ne: true }
    },
    {
      $set: { state: 'cancelled', finishedAt: new Date(), activity: 'Question unsent' },
      $unset: { draft: 1, result: 1 }
    }
  );
}
