import { Schema, model } from 'mongoose';

/**
 * The one turn at a time a conversation has. A worker holds it while it answers, so a conversation's turns stay in
 * order and never overlap, across workers. It is Vivi's own collection: chat's Conversation document does not carry
 * it, because chat does not run turns.
 */
const lockSchema = new Schema({
  _id: { type: String, required: true },
  /** The conversation is free again at this time, if its worker has not released it before. */
  until: { type: Date, required: true },
  runId: { type: String, required: true }
});

export const AssistantLock = model('ChatAssistantLock', lockSchema);

/** Takes a conversation's lock when it is free or has expired. */
export async function takeLock(conversationId: string, runId: string, ms: number): Promise<boolean> {
  const until = new Date(Date.now() + ms);
  const expired = await AssistantLock.findOneAndUpdate(
    { _id: conversationId, until: { $lt: new Date() } },
    { $set: { until, runId } }
  );
  if (expired) return true;
  try {
    await AssistantLock.create({ _id: conversationId, until, runId });
    return true;
  } catch (error) {
    // Someone else holds it, or took it first.
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

/** Gives the lock back, if this run still holds it. */
export async function releaseLock(conversationId: string, runId: string): Promise<void> {
  await AssistantLock.deleteOne({ _id: conversationId, runId });
}

export const holdsLock = async (conversationId: string, runId: string): Promise<boolean> =>
  Boolean(await AssistantLock.exists({ _id: conversationId, runId, until: { $gt: new Date() } }));
