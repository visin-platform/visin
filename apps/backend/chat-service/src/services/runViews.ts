import { Message } from '../models/Message';
import { AssistantRun } from '../models/AssistantRun';
import { ScreenCall } from '../models/ScreenCall';
import { type ChatConversation } from '../models/Conversation';
import { authorize, historyFilter } from './access';
import type { Request } from 'express';

/** Screen calls one tab is sent at a time. */
const MAX_SCREEN_CALLS = 3;

/**
 * What a conversation's readers may see of the assistants' runs in it. Chat decides this, from the runs Vivi keeps
 * (read-only here): its streams ask on every tick, so it is a read of the database and not a call to another service.
 */

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
    .select('_id messageId userId assistantId assistantName state activity error failureCode')
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
      ...(run.failureCode && run.userId === userId ? { failureCode: run.failureCode } : {}),
      canCancel: run.userId === userId && ['queued', 'screen_queued', 'running'].includes(run.state),
      canRetry: run.userId === userId && run.state === 'failed'
    }));
}


/** The pending calls one tab should act on, oldest first. */
export async function pendingScreenCalls(userId: string, tabId: string, conversationId: string) {
  const calls = await ScreenCall.find({ userId, tabId, conversationId, state: 'pending' })
    .sort({ createdAt: 1 })
    .limit(MAX_SCREEN_CALLS)
    .lean();
  return calls.map((c) => ({ id: c._id.toString(), place: c.place, params: c.params ?? {} }));
}

