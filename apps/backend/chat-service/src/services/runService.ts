import { type Request } from 'express';
import { AssistantRun } from '../models/AssistantRun';
import { Message } from '../models/Message';
import { authorize, historyFilter } from './access';
import type { ChatConversation } from '../models/Conversation';

export async function listRuns(req: Request, conversationId: string) {
  const c = await authorize(req, conversationId);
  return visibleRuns(c, req.user!.id);
}

/** A single audience projection for HTTP polling and SSE; shared readers never receive provider/job internals. */
export async function visibleRuns(c: ChatConversation, userId: string) {
  if (c.kind === 'assistant') {
    const runs = await AssistantRun.find({ conversationId: c._id.toString(), userId })
      // The screen context holds the page's frame list: the worker's business, and too large for every poll.
      .select('-email -keyId -result -evidence -personality -screen -draft')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return runs.map((run) => ({
      ...run,
      state: run.state === 'screen_queued' ? 'queued' : run.state,
      canCancel: ['queued', 'screen_queued', 'running'].includes(run.state),
      canRetry: run.state === 'failed'
    }));
  }
  if (['direct', 'room'].includes(c.kind) && !c.participants.some((p) => p.userId === userId && p.state === 'active'))
    return [];
  const runs = await AssistantRun.find({ conversationId: c._id.toString() })
    .select('_id messageId userId assistantId assistantName state activity error')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  const messages = await Message.find({
    conversationId: c._id.toString(),
    _id: { $in: runs.map((run) => run.messageId).filter((id) => /^[a-f\d]{24}$/i.test(id)) },
    ...historyFilter(c, userId)
  })
    .select('_id')
    .lean();
  const visible = new Set(messages.map((message) => message._id.toString()));
  return runs
    .filter((run) => visible.has(run.messageId))
    .map((run) => ({
      _id: run._id,
      messageId: run.messageId,
      userId: run.userId,
      assistantId: run.assistantId,
      assistantName: run.assistantName,
      state: run.state,
      activity: run.activity,
      ...(run.error
        ? { error: run.userId === userId ? run.error : 'The assistant could not complete this reply.' }
        : {}),
      canCancel: run.userId === userId && ['queued', 'screen_queued', 'running'].includes(run.state),
      canRetry: run.userId === userId && run.state === 'failed'
    }));
}

export async function cancelRuns(req: Request, conversationId: string) {
  const c = await authorize(req, conversationId, true);
  // Only the questions still waiting or being answered, not every message the thread ever had.
  const open = await AssistantRun.find({
    conversationId: c.id,
    userId: req.user!.id,
    state: { $in: ['queued', 'screen_queued', 'running'] }
  }).select('messageId');
  await Message.updateMany(
    {
      conversationId: c.id,
      senderId: req.user!.id,
      $or: [
        { assistantRequest: { $exists: true } },
        { screenRequest: { $exists: true } },
        { _id: { $in: open.map((run) => run.messageId) } }
      ]
    },
    { $unset: { assistantRequest: 1, screenRequest: 1 }, $set: { assistantCancelled: true } }
  );
  await AssistantRun.updateMany(
    { conversationId: c.id, userId: req.user!.id, state: { $in: ['queued', 'screen_queued', 'running'] } },
    { $set: { state: 'cancelled', finishedAt: new Date(), activity: 'Cancelled' }, $unset: { draft: 1 } }
  );
  return;
}
