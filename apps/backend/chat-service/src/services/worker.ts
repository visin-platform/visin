import { assertViviUser } from './adminPolicy';
import { redactQuotes } from './messageService';
import { recoverMembershipEvents } from './membershipAudit';
import { createApiKey, deleteApiKey, logger } from '@visin/backend-core';
import { AssistantRun } from '../models/AssistantRun';
import { Budget } from '../models/Budget';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { analyze, type AnalysisSpend } from './analyst';
import { IMAGE_ONLY_QUESTION, MAX_ANALYSIS_IMAGES, type ImageRef } from './imageInput';
import { budgetPlans, FRAME_IMAGES, reservationFor } from './analysisLimits';
import { createDraftWriter } from './draft';
import { resolveProviderKey } from './keys';
import { appendMessage } from './messages';
import { PAPER_REQUEST_BYTES, PROVIDERS, PROVIDER_REPLAY_VERSION, ProviderRequestError } from './providers';
import { assistantSettings, modelFor } from './settings';
import { runAllowed } from './sharedAssistants';
import { expireScreenCalls, screenContextSchema } from './screen';
import { steerScreen } from './screenSteering';
import { priceSnapshot } from './usage';
import { listen, notify, pollDelay } from './wakeBus';

/**
 * What an earlier question was about, told to the model beside it: in one long chat the person asks about different
 * projects, and an answer must not be read as being about the project of the next question. Data, like the rest.
 */
function aboutOf(question: { context?: { projectName?: string | null; trainingLabels?: { name?: string | null }[]; paperTitle?: string | null; projectId?: string | null; paperId?: string | null } | null }) {
  const about = question.context;
  if (!about || (!about.projectId && !about.paperId)) return {};
  return {
    about: {
      ...(about.projectId ? { project: about.projectName || about.projectId } : {}),
      ...(about.trainingLabels?.length ? { runs: about.trainingLabels.map((run) => run.name).filter(Boolean) } : {}),
      ...(about.paperId ? { paper: about.paperTitle || about.paperId } : {})
    }
  };
}

/** How often a running question re-reads its account's state and Vivi policy. */
const VIVI_CHECK_MS = 5000;

/**
 * Analyses one process runs at once. A turn can take minutes, so one at a time would
 * leave every other user's question waiting behind it.
 */
const MAX_CONCURRENT_RUNS = 4;
/** Queued runs looked at per claim, so one busy conversation cannot hold up the rest. */
const CLAIM_CANDIDATES = 20;
const LEASE_MS = 300000;
/** How often the worker looks for work, and how often it does while wake signals reach this replica. */
const TICK_MS = 1000;
const SIGNALLED_TICK_MS = 5000;

/**
 * The oldest queued run whose conversation is free. A database lock per conversation
 * keeps its turns in order and never overlapping, even with several workers; a
 * conversation whose oldest run cannot be taken is skipped as a whole, never overtaken.
 */
async function claim() {
  const candidates = await AssistantRun.find({ state: { $in: ['queued', 'screen_queued'] } })
    .sort({ createdAt: 1 })
    .limit(CLAIM_CANDIDATES);
  const skipped = new Set<string>();
  for (const next of candidates) {
    if (skipped.has(next.conversationId)) continue;
    skipped.add(next.conversationId);
    const conversation = await Conversation.findOneAndUpdate(
      { _id: next.conversationId, deletedAt: null, $or: [{ workerUntil: { $lt: new Date() } }, { workerUntil: null }] },
      { $set: { workerUntil: new Date(Date.now() + LEASE_MS), workerRunId: next.id } },
      { returnDocument: 'after' }
    );
    if (!conversation) continue;
    const run = await AssistantRun.findOneAndUpdate(
      { _id: next.id, state: next.state },
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
    await expireScreenCalls();
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
        !(await Message.exists({ _id: job.messageId, unsentAt: { $ne: null } })) &&
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
          evidence: job.evidence.map((e) => ({ tool: e.tool || '', input: e.input, at: e.at || new Date() })),
          ...(job.thoughts?.length
            ? { thoughts: job.thoughts.map((t) => ({ text: t.text || '', at: t.at || new Date() })) }
            : {})
        });
      await AssistantRun.updateOne({ _id: job.id }, { $set: { published: true }, $unset: { draft: 1 } });
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
          },
          $unset: { draft: 1 }
        }
      );
      // The run is over, so its conversation need not wait out the rest of the lock.
      await Conversation.updateOne(
        { _id: run.conversationId, workerRunId: run.id },
        { $unset: { workerUntil: 1, workerRunId: 1 } }
      );
    }
    // Message-level outbox: saving a question is sufficient to recover queue creation.
    const pending = await Message.find({
      $or: [{ assistantRequest: { $exists: true } }, { screenRequest: { $exists: true } }],
      assistantCancelled: false
    })
      .select('+assistantRequest +screenRequest')
      .sort({ createdAt: 1 })
      .limit(200);
    const configured = pending.length ? await assistantSettings() : undefined;
    for (const message of pending) {
      const request = message.screenRequest ?? message.assistantRequest;
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
            ...(request.screen?.tabId ? { screen: request.screen } : {}),
            conversationId: message.conversationId,
            messageId: message.id,
            provider: configured?.provider,
            model: configured?.model,
            state: request.screen?.tabId ? 'screen_queued' : 'queued'
          }
        },
        { upsert: true }
      );
      await Message.updateOne({ _id: message.id }, { $unset: { assistantRequest: 1, screenRequest: 1 } });
    }
  };

  const execute = async ({ run, conversation: c }: Claimed) => {
    let key: Awaited<ReturnType<typeof createApiKey>> | undefined;
    // What this run holds of the day's budget, until it is settled one way or the other.
    let held: { day: string; reserve: number; oneRound: number } | undefined;
    const spent: AnalysisSpend = { inputTokens: 0, outputTokens: 0, requests: 0, inFlight: false };
    // Only a private thread shows the answer as it is written: shared replies are not exposed before they are final.
    const drafts = c.kind === 'assistant' ? createDraftWriter(run.id) : undefined;
    const controller = new AbortController();
    controllers.set(run.id, controller);
    // The account's state and Vivi policy, read at most every few seconds: the watch below runs every second, and a
    // suspension or a policy turned off needs to stop the run soon, not within the second. A refusal is remembered
    // for the same few seconds, so it keeps stopping the run.
    let viviChecked: { at: number; check: Promise<unknown> } | undefined;
    const viviAllowed = () => {
      if (!viviChecked || Date.now() - viviChecked.at >= VIVI_CHECK_MS) {
        const check = assertViviUser(run.userId);
        check.catch(() => undefined);
        viviChecked = { at: Date.now(), check };
      }
      return viviChecked.check;
    };
    const assistantAvailable = async () => {
      await viviAllowed();
      return runAllowed(run.conversationId, run.userId, run.membershipVersion, run.assistantId);
    };
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
      const configured = await assistantSettings();
      const { provider, dailyTokenLimit, toolRounds } = configured;
      // A reply in a shared conversation uses no research tools, so it can run on a cheaper model.
      const model = modelFor(configured, c.kind === 'assistant' ? 'analyst' : 'shared');
      const policy = await assertViviUser(run.userId);
      const limit = Math.min(dailyTokenLimit, policy.dailyTokenLimit);
      if (!model) throw new Error('No assistant model is configured');
      const resolved = await resolveProviderKey(provider);
      if (!resolved) throw new Error(`No ${PROVIDERS[provider].name} key is configured`);
      const checkedScreen = screenContextSchema.safeParse(
        run.screen
          ? {
              tabId: run.screen.tabId,
              allowActions: run.screen.allowActions ?? undefined,
              path: run.screen.path,
              actions: run.screen.actions?.map((action) => ({
                name: action.name,
                ids: [...action.ids],
                labels: action.labels ? [...action.labels] : undefined
              }))
            }
          : undefined
      );
      const screen = c.kind === 'assistant' && checkedScreen.success ? checkedScreen.data : undefined;
      // What the question is about travels with it: the chat is the same wherever the person asked from.
      const asked = c.kind === 'assistant' ? (trigger.context ?? undefined) : undefined;
      const historyAfter =
        c.kind === 'room'
          ? Math.max(0, ...c.participants.filter((p) => p.state === 'active').map((p) => p.joinedSeq))
          : // A "new topic" in a private chat: what came before it is no longer part of what the assistant is told.
            c.kind === 'assistant'
            ? (c.participants.find((p) => p.userId === run.userId)?.topicSeq ?? 0)
            : 0;
      const questions = await Message.find({
        conversationId: c.id,
        kind: 'person',
        unsentAt: null,
        seq: { $gt: historyAfter, $lte: trigger.seq }
      })
        .sort({ seq: -1 })
        .limit(10);
      await redactQuotes(questions);
      // The newest five images remain available for follow-ups. Shared conversations send only images in the
      // explicit ask, never an earlier participant's attachment outside that ask.
      const imageRefs = new Map<string, ImageRef[]>();
      let imageCount = 0;
      for (const question of c.kind === 'assistant' ? questions : [trigger]) {
        const selected = (question.attachments ?? [])
          .filter((file) => file.kind === 'image')
          .slice(0, MAX_ANALYSIS_IMAGES - imageCount);
        imageRefs.set(question.id, selected);
        imageCount += selected.length;
      }
      const day = new Date().toISOString().slice(0, 10);
      await Budget.updateOne({ userId: run.userId, day }, { $setOnInsert: { reserved: 0 } }, { upsert: true });
      // One question per admission against the account's daily allowance, before any tokens are reserved.
      const admitted = await Budget.findOneAndUpdate(
        { userId: run.userId, day, $expr: { $lt: [{ $ifNull: ['$requests', 0] }, policy.dailyRequestLimit] } },
        { $inc: { requests: 1 } }
      );
      if (!admitted) throw new Error('Your daily Vivi question allowance is used. It resets at midnight UTC.');
      // The best plan the day's budget still holds: page changes need more room, and are given up before the question.
      let plan: ReturnType<typeof budgetPlans>[number] | undefined;
      for (const candidate of budgetPlans(
        limit,
        toolRounds,
        screen?.allowActions === true,
        imageCount,
        asked?.paperId ? PAPER_REQUEST_BYTES : undefined,
        // Frames belong to a project's runs, and share the provider's per-request image limit with uploads.
        Boolean(asked?.projectId) && imageCount + FRAME_IMAGES <= MAX_ANALYSIS_IMAGES
      )) {
        const budget = await Budget.findOneAndUpdate(
          { userId: run.userId, day, reserved: { $lte: limit - candidate.reserve } },
          { $inc: { reserved: candidate.reserve } }
        );
        if (budget) {
          plan = candidate;
          break;
        }
      }
      if (!plan) {
        // Nothing was sent, so the question does not count against the day's allowance.
        await Budget.updateOne({ userId: run.userId, day }, { $inc: { requests: -1 } });
        throw new Error('Your daily assistant token budget is used. It resets at midnight UTC.');
      }
      const reserve = plan.reserve;
      const requestBytes = asked?.paperId ? PAPER_REQUEST_BYTES : undefined;
      held = {
        day,
        reserve,
        oneRound: reservationFor(false, 1, imageCount, requestBytes, plan.frames === true)
      };
      const steering = plan.screen;
      // Reserve the full worst-case turn budget. Failures retain their reservation because a
      // provider may have consumed tokens even if the connection did not return usage.
      if (c.kind === 'assistant' && (asked?.projectId || asked?.paperId || steering))
        key = await createApiKey({
          userId: run.userId,
          userEmail: run.email,
          userName: run.name,
          name: 'Visin analyst',
          scopes: ['vision:read', 'analysis:read'],
          expiresAt: new Date(Date.now() + LEASE_MS),
          ...(asked?.projectId ? { project: { id: asked.projectId, name: asked.projectName || c.title } } : {})
        });
      if (key) await AssistantRun.updateOne({ _id: run.id }, { $set: { keyId: key.summary.id } });
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
            imageRefs: imageRefs.get(question.id),
            content: question.attachments?.length
              ? JSON.stringify({
                  ...aboutOf(question),
                  question:
                    question.body ||
                    ((imageRefs.get(question.id)?.length ?? 0) > 0
                      ? IMAGE_ONLY_QUESTION
                      : 'What can you tell me about these attachments?'),
                  ...(question.quote ? { quote: question.quote } : {}),
                  attachments: question.attachments.map(({ fileId, name, mime, size }) => ({
                    name,
                    mime,
                    size,
                    contentAvailable: imageRefs.get(question.id)?.some((file) => file.fileId === fileId) ?? false
                  }))
                })
              : question.quote
                ? JSON.stringify({ ...aboutOf(question), quote: question.quote, question: question.body })
                : question.context?.projectId || question.context?.paperId
                  ? JSON.stringify({ ...aboutOf(question), question: question.body })
                  : question.body
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
          question: trigger.body || (imageCount ? IMAGE_ONLY_QUESTION : ''),
          ...(trigger.attachments?.length
            ? {
                attachments: trigger.attachments.map(({ name, mime }) => ({
                  name,
                  mime,
                  contentAvailable: mime.startsWith('image/')
                }))
              }
            : {}),
          ...(trigger.quote ? { quote: trigger.quote } : {})
        });
      while (transcript.length && sharedText().length > 11000) transcript.shift();
      const history =
        c.kind === 'assistant'
          ? privateHistory
          : [{ role: 'user' as const, content: sharedText(), imageRefs: imageRefs.get(trigger.id) }];
      await AssistantRun.updateOne(
        { _id: run.id },
        { $set: { provider, model, providerReplayVersion: PROVIDER_REPLAY_VERSION } }
      );
      const result = await analyze({
        runId: run.id,
        usageUserId: run.userId,
        toolRounds: plan.toolRounds,
        frames: plan.frames === true,
        conversationId: c.id,
        provider,
        model,
        apiKey: resolved.key,
        token: key?.token || '',
        projectId: asked?.projectId ?? undefined,
        paperId: asked?.paperId ?? undefined,
        paperTitle: asked?.paperTitle ?? undefined,
        trainingIds: asked?.trainingIds ? [...asked.trainingIds] : [],
        shared: c.kind !== 'assistant',
        guard,
        spent,
        screenContext: screen,
        screen: steering
          ? (request, signal) =>
              steerScreen(
                { id: run.id, conversationId: run.conversationId, userId: run.userId, screen },
                asked?.projectId ?? undefined,
                key?.token || '',
                request,
                signal,
                guard
              )
          : undefined,
        personality: run.personality ?? undefined,
        history,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(260000)]),
        activity: async (activity) => {
          await AssistantRun.updateOne({ _id: run.id, state: 'running' }, { $set: { activity } });
        },
        onText: drafts?.write,
        // Only a private thread shows its steps: in a shared one nobody but the asker's reply is seen.
        step:
          c.kind === 'assistant'
            ? {
                start: async (tool) => {
                  await AssistantRun.updateOne(
                    { _id: run.id, state: 'running' },
                    { $push: { steps: { tool, startedAt: new Date() } } }
                  );
                },
                end: async (tool) => {
                  await AssistantRun.updateOne(
                    { _id: run.id, state: 'running', steps: { $elemMatch: { tool, endedAt: { $exists: false } } } },
                    { $set: { 'steps.$.endedAt': new Date() } }
                  );
                },
                thought: async (thought) => {
                  const at = new Date();
                  await AssistantRun.updateOne(
                    { _id: run.id, state: 'running' },
                    { $push: { steps: { thought, startedAt: at, endedAt: at } } }
                  );
                }
              }
            : undefined
      });
      drafts?.stop();
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
            // The whole answer, so the preview is complete until the published message replaces it.
            ...(drafts ? { draft: result.text } : {}),
            evidence: result.evidence,
            ...(result.thoughts?.length ? { thoughts: result.thoughts } : {}),
            activity: 'Completed',
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cacheReadTokens: result.cacheReadTokens ?? 0,
            cacheWriteTokens: result.cacheWriteTokens ?? 0,
            providerRequests: result.providerRequests ?? 0,
            toolCalls: result.toolCalls ?? 0,
            durationMs: result.durationMs ?? 0,
            finishedAt: new Date()
          }
        }
      );
      if (!finished.modifiedCount) throw new Error('Analysis cancelled');
      held = undefined;
      await Budget.updateOne(
        { userId: run.userId, day },
        { $inc: { reserved: -(reserve - result.inputTokens - result.outputTokens) } }
      );
    } catch (error) {
      drafts?.stop();
      // A failed run gives back what it reserved beyond what its completed requests used. A request still out may
      // have been billed without reporting usage, so one round stays held; a run that sent nothing gives back all.
      if (held) {
        const refund = held.reserve - spent.inputTokens - spent.outputTokens - (spent.inFlight ? held.oneRound : 0);
        if (refund > 0)
          await Budget.updateOne({ userId: run.userId, day: held.day }, { $inc: { reserved: -refund } }).catch(
            (failure: unknown) =>
              logger.warn('Could not return an unused reservation', {
                error: failure instanceof Error ? failure.message : 'unknown'
              })
          );
        held = undefined;
      }
      await AssistantRun.updateOne(
        { _id: run.id, state: 'running' },
        {
          $set: {
            state: 'failed',
            activity: 'Failed',
            error: error instanceof Error ? error.message : 'Analysis failed',
            ...(error instanceof ProviderRequestError ? { providerFailure: error.diagnostic } : {}),
            finishedAt: new Date()
          },
          $unset: { draft: 1 }
        }
      );
    } finally {
      drafts?.stop();
      clearInterval(watch);
      controllers.delete(run.id);
      if (key) await deleteApiKey(run.userId, key.summary.id);
      await Conversation.updateOne({ _id: c.id, workerRunId: run.id }, { $unset: { workerUntil: 1, workerRunId: 1 } });
      // The answer is published, and this conversation's next queued question claimed, by the next look.
      notify('worker');
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
    // Before the runs are awaited, which can take minutes: the next look must not wait for them.
    schedule(woken ? 0 : active.size > 0 ? TICK_MS : pollDelay(TICK_MS, SIGNALLED_TICK_MS));
    woken = false;
    await Promise.all(started);
  };
  // The next look is a timeout, not an interval, so a signal can bring it forward. A signal means a question may
  // be waiting (or an answer to publish); the poll is what finds work when a signal never arrived.
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const schedule = (delay: number) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void tick(), delay);
  };
  // A signal that arrives during a look is remembered: that look ends by scheduling the next one straight away.
  let woken = false;
  const unwatch = listen('worker', () => {
    if (busy) woken = true;
    else schedule(0);
  });
  schedule(TICK_MS);
  return Object.assign(
    () => {
      stopped = true;
      clearTimeout(timer);
      unwatch();
      controllers.forEach((c) => c.abort());
    },
    { tick }
  );
}
