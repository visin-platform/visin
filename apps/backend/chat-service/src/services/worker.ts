import { recoverMembershipEvents } from './membershipAudit';
import { createApiKey, deleteApiKey, logger } from '@visin/backend-core';
import { AssistantRun } from '../models/AssistantRun';
import { Budget } from '../models/Budget';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { analyze, RESERVATION } from './analyst';
import { resolveProviderKey } from './keys';
import { appendMessage } from './messages';
import { PROVIDERS } from './providers';
import { assistantSettings } from './settings';
import { runAllowed } from './sharedAssistants';
import { priceSnapshot } from './usage';

/**
 * Analyses one process runs at once. A turn can take minutes, so one at a time would
 * leave every other user's question waiting behind it.
 */
const MAX_CONCURRENT_RUNS = 4;
/** Queued runs looked at per claim, so one busy conversation cannot hold up the rest. */
const CLAIM_CANDIDATES = 20;
const LEASE_MS = 300000;

/**
 * The oldest queued run whose conversation is free. A database lock per conversation
 * keeps its turns in order and never overlapping, even with several workers; a
 * conversation whose oldest run cannot be taken is skipped as a whole, never overtaken.
 */
async function claim() {
  const candidates = await AssistantRun.find({ state: 'queued' }).sort({ createdAt: 1 }).limit(CLAIM_CANDIDATES);
  const skipped = new Set<string>();
  for (const next of candidates) {
    if (skipped.has(next.conversationId)) continue;
    skipped.add(next.conversationId);
    const conversation = await Conversation.findOneAndUpdate(
      { _id: next.conversationId, $or: [{ workerUntil: { $lt: new Date() } }, { workerUntil: null }] },
      { $set: { workerUntil: new Date(Date.now() + LEASE_MS), workerRunId: next.id } },
      { returnDocument: 'after' }
    );
    if (!conversation) continue;
    const run = await AssistantRun.findOneAndUpdate(
      { _id: next.id, state: 'queued' },
      { $set: { state: 'running', leaseUntil: new Date(Date.now() + LEASE_MS) }, $inc: { attempt: 1 } },
      { returnDocument: 'after' }
    );
    if (run) return { run, conversation };
    await Conversation.updateOne(
      { _id: conversation.id, workerRunId: next.id },
      { $unset: { workerUntil: 1, workerRunId: 1 } }
    );
  }
  return undefined;
}
type Claimed = NonNullable<Awaited<ReturnType<typeof claim>>>;

// One worker per service process. A database lease protects claims across replicas.
// Expired work fails visibly rather than automatically repeating a potentially billed provider call.
export function startWorker() {
  let busy = false;
  const controllers = new Map<string, AbortController>();
  const active = new Set<string>();

  const housekeeping = async () => {
    await recoverMembershipEvents();
    // A completed result is an outbox too: retries publish the same message ID after a crash.
    const completed = await AssistantRun.find({ state: 'completed', published: false }).limit(50);
    for (const job of completed) {
      const target = await Conversation.findOne({
        _id: job.conversationId,
        deletedAt: null,
        membershipVersion: job.membershipVersion
      });
      const available =
        (await assistantSettings()).enabled &&
        (await runAllowed(job.conversationId, job.userId, job.membershipVersion, job.assistantId));
      if (target && available && job.result)
        await appendMessage({
          expectedMembershipVersion: job.membershipVersion ?? undefined,
          conversationId: job.conversationId,
          senderId: job.assistantId ? `assistant:${job.assistantId}` : 'assistant:analyst',
          senderName: job.assistantName || 'Visin analyst',
          kind: 'assistant',
          body: job.result,
          clientId: `assistant:${job.messageId}`,
          replyTo: job.messageId,
          evidence: job.evidence.map((e) => ({ tool: e.tool || '', input: e.input, at: e.at || new Date() }))
        });
      await AssistantRun.updateOne({ _id: job.id }, { $set: { published: true } });
    }
    const expired = await AssistantRun.find({ state: 'running', leaseUntil: { $lt: new Date() } });
    for (const run of expired) {
      if (run.keyId) await deleteApiKey(run.userId, run.keyId);
      await AssistantRun.updateOne(
        { _id: run.id, state: 'running', leaseUntil: { $lt: new Date() } },
        {
          $set: {
            state: 'failed',
            error: 'Analysis was interrupted. Send your question again to retry.',
            finishedAt: new Date()
          }
        }
      );
      // The run is over, so its conversation need not wait out the rest of the lock.
      await Conversation.updateOne(
        { _id: run.conversationId, workerRunId: run.id },
        { $unset: { workerUntil: 1, workerRunId: 1 } }
      );
    }
    // Message-level outbox: saving a question is sufficient to recover queue creation.
    const pending = await Message.find({ assistantRequest: { $exists: true }, assistantCancelled: false })
      .select('+assistantRequest')
      .sort({ createdAt: 1 })
      .limit(200);
    const configured = pending.length ? await assistantSettings() : undefined;
    for (const message of pending) {
      const request = message.assistantRequest;
      if (!request?.userId || !request.email || !request.name) continue;
      await AssistantRun.updateOne(
        { messageId: message.id },
        {
          $setOnInsert: {
            userId: request.userId,
            email: request.email,
            name: request.name,
            assistantId: request.assistantId,
            assistantName: request.assistantName,
            personality: request.personality,
            membershipVersion: request.membershipVersion,
            conversationId: message.conversationId,
            messageId: message.id,
            provider: configured?.provider,
            model: configured?.model,
            state: 'queued'
          }
        },
        { upsert: true }
      );
      await Message.updateOne({ _id: message.id }, { $unset: { assistantRequest: 1 } });
    }
  };

  const execute = async ({ run, conversation: c }: Claimed) => {
    let key: Awaited<ReturnType<typeof createApiKey>> | undefined;
    const controller = new AbortController();
    controllers.set(run.id, controller);
    const assistantAvailable = () => runAllowed(run.conversationId, run.userId, run.membershipVersion, run.assistantId);
    const guard = async () => {
      controller.signal.throwIfAborted();
      if (
        !(await assistantSettings()).enabled ||
        !(await assistantAvailable()) ||
        !(await AssistantRun.exists({ _id: run.id, state: 'running' }))
      )
        throw new Error('Assistant access or agreement changed');
    };
    const watch = setInterval(() => {
      // Turning the analyst off in the settings stops a run that is under way, within a second.
      void Promise.all([AssistantRun.findById(run.id), assistantSettings(), assistantAvailable()])
        .then(([r, settings, available]) => {
          if (!r || r.state !== 'running' || !settings.enabled || !available) controller.abort();
        })
        .catch(() => controller.abort());
    }, 1000);
    try {
      await guard();
      const trigger = await Message.findById(run.messageId).select('+assistantCancelled');
      if (!trigger || trigger.assistantCancelled) {
        await AssistantRun.updateOne(
          { _id: run.id, state: 'running' },
          { $set: { state: 'cancelled', activity: 'Cancelled', finishedAt: new Date() } }
        );
        throw new Error('Analysis cancelled');
      }
      // The provider, model and limit are read as the run starts, so a change in the settings applies to the next
      // question. A run that cannot happen is refused before it is charged anything.
      const { provider, model, dailyTokenLimit: limit } = await assistantSettings();
      if (!model) throw new Error('No assistant model is configured');
      const resolved = await resolveProviderKey(provider);
      if (!resolved) throw new Error(`No ${PROVIDERS[provider].name} key is configured`);
      const day = new Date().toISOString().slice(0, 10);
      await Budget.updateOne({ userId: run.userId, day }, { $setOnInsert: { reserved: 0 } }, { upsert: true });
      const budget = await Budget.findOneAndUpdate(
        { userId: run.userId, day, reserved: { $lte: limit - RESERVATION } },
        { $inc: { reserved: RESERVATION } }
      );
      if (!budget) throw new Error('Your daily assistant token budget is used. Try again tomorrow.');
      // Reserve the full worst-case turn budget. Failures retain their reservation because a
      // provider may have consumed tokens even if the connection did not return usage.
      if (c.kind === 'assistant' && c.projectId)
        key = await createApiKey({
          userId: run.userId,
          userEmail: run.email,
          userName: run.name,
          name: 'Visin analyst',
          scopes: ['vision:read', 'analysis:read'],
          expiresAt: new Date(Date.now() + LEASE_MS),
          project: { id: c.projectId, name: c.projectName || c.title }
        });
      if (key) await AssistantRun.updateOne({ _id: run.id }, { $set: { keyId: key.summary.id } });
      const historyAfter =
        c.kind === 'room'
          ? Math.max(0, ...c.participants.filter((p) => p.state === 'active').map((p) => p.joinedSeq))
          : 0;
      const questions = await Message.find({
        conversationId: c.id,
        kind: 'person',
        seq: { $gt: historyAfter, $lte: trigger.seq }
      })
        .sort({ seq: -1 })
        .limit(10);
      const replies = await Message.find({
        conversationId: c.id,
        kind: 'assistant',
        replyTo: { $in: questions.map((q) => q.id) }
      });
      // A question posted while a previous answer is running still sees that answer
      // when its own turn starts, even though the answer's sequence is newer.
      const privateHistory = questions.reverse().flatMap((question) => {
        const reply = replies.find((r) => r.replyTo === question.id);
        return [
          {
            role: 'user' as const,
            content: question.quote ? JSON.stringify({ quote: question.quote, question: question.body }) : question.body
          },
          ...(reply ? [{ role: 'assistant' as const, content: reply.body }] : [])
        ];
      });
      // Shared history is data, labelled by author; only the triggering person invokes the assistant.
      const transcript = questions
        .filter((q) => q.id !== trigger.id)
        .flatMap((q) => [
          { speaker: q.senderName, kind: q.kind, body: q.body },
          ...replies
            .filter((reply) => reply.replyTo === q.id && reply.seq > historyAfter)
            .map((reply) => ({ speaker: reply.senderName, kind: reply.kind, body: reply.body }))
        ]);
      const sharedText = () =>
        JSON.stringify({
          transcript,
          asker: run.name,
          question: trigger.body,
          ...(trigger.quote ? { quote: trigger.quote } : {})
        });
      while (transcript.length && sharedText().length > 11000) transcript.shift();
      const history = c.kind === 'assistant' ? privateHistory : [{ role: 'user' as const, content: sharedText() }];
      await AssistantRun.updateOne({ _id: run.id }, { $set: { provider, model } });
      const result = await analyze({
        provider,
        model,
        apiKey: resolved.key,
        token: key?.token || '',
        projectId: c.kind === 'assistant' ? (c.projectId ?? undefined) : undefined,
        trainingIds: c.kind === 'assistant' ? c.trainingIds : [],
        shared: c.kind !== 'assistant',
        guard,
        personality: run.personality ?? undefined,
        history,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(260000)]),
        activity: async (activity) => {
          await AssistantRun.updateOne({ _id: run.id, state: 'running' }, { $set: { activity } });
        }
      });
      await guard();
      const current = await AssistantRun.findById(run.id);
      const currentConversation = await Conversation.findById(c.id);
      if (
        !(await assistantAvailable()) ||
        controller.signal.aborted ||
        current?.state !== 'running' ||
        currentConversation?.membershipVersion !== c.membershipVersion ||
        currentConversation?.deletedAt
      )
        throw new Error('Analysis cancelled');
      // The price in effect now is the one this answer cost: kept with it, since prices change.
      const price = await priceSnapshot(provider, model);
      const finished = await AssistantRun.updateOne(
        { _id: run.id, state: 'running' },
        {
          $set: {
            ...(price ? { price } : {}),
            state: 'completed',
            result: result.text,
            evidence: result.evidence,
            activity: 'Completed',
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            finishedAt: new Date()
          }
        }
      );
      if (!finished.modifiedCount) throw new Error('Analysis cancelled');
      await Budget.updateOne(
        { userId: run.userId, day },
        { $inc: { reserved: -(RESERVATION - result.inputTokens - result.outputTokens) } }
      );
    } catch (error) {
      await AssistantRun.updateOne(
        { _id: run.id, state: 'running' },
        {
          $set: {
            state: 'failed',
            activity: 'Failed',
            error: error instanceof Error ? error.message : 'Analysis failed',
            finishedAt: new Date()
          }
        }
      );
    } finally {
      clearInterval(watch);
      controllers.delete(run.id);
      if (key) await deleteApiKey(run.userId, key.summary.id);
      await Conversation.updateOne({ _id: c.id, workerRunId: run.id }, { $unset: { workerUntil: 1, workerRunId: 1 } });
    }
  };

  /**
   * Housekeeping, then claims runs up to the concurrency limit. Resolves once the runs it
   * started have finished, but the next tick does not wait for them: a long analysis
   * never holds up publishing, lease expiry or other users' questions.
   */
  const tick = async () => {
    if (busy) return;
    busy = true;
    const started: Promise<void>[] = [];
    try {
      await housekeeping();
      if ((await assistantSettings()).enabled) {
        while (active.size < MAX_CONCURRENT_RUNS) {
          const claimed = await claim();
          if (!claimed) break;
          const id = claimed.run.id;
          active.add(id);
          started.push(
            execute(claimed)
              .catch((error: unknown) => {
                logger.error('Chat analysis failed', {
                  error: error instanceof Error ? error.message : 'Unknown failure'
                });
              })
              .finally(() => active.delete(id))
          );
        }
      }
    } catch (error) {
      logger.error('Chat worker failed', { error: error instanceof Error ? error.message : 'Unknown failure' });
    } finally {
      busy = false;
    }
    await Promise.all(started);
  };
  const timer = setInterval(() => {
    void tick();
  }, 1000);
  return Object.assign(
    () => {
      clearInterval(timer);
      controllers.forEach((c) => c.abort());
    },
    { tick }
  );
}
