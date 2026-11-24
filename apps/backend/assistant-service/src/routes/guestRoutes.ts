import { Router, type Request } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  BadRequestError,
  ForbiddenError,
  ServiceUnavailableError,
  createRateLimiter,
  fetchWithTimeout
} from '@visin/backend-core';
import { effectivePolicy } from '../services/adminPolicy';
import {
  guestBotCheckRequired,
  guestConfigured,
  guestDenialReason,
  guestHash,
  nextGuestReset,
  networkPrefix,
  reserveGuest,
  type GuestDenial
} from '../services/guestAdmission';
import { GuestRun } from '../models/GuestRun';
import { searchPublicProjects } from '../services/guestCatalogue';
import { publicProject } from '../services/guestContext';
import { platformAssistantPublic } from '../services/assistantProfiles';
import { GUEST_FRAMES, linkedPage } from '../services/guestRun';
import { assertPublicPaper, guestRequestBytes, guestRequests, guestToolLimits } from '../services/guestTools';
import {
  GUEST_INTERRUPTED,
  GUEST_PATIENCE_MS,
  gatherGuest,
  guestOutputTokens,
  guestSystemFor,
  runProjects,
  type GuestPlan
} from '../services/guestTurn';
import { FRAME_TOKENS_PER_ROUND } from '../services/analysisLimits';
import { resolveProviderKey } from '../services/keys';
import { assistantSettings, modelFor } from '../services/settings';
import { priceSnapshot } from '../services/usage';
import { notify } from '../services/wakeBus';
import { parsed } from '../validation/parse';
const COOKIE = 'visin_guest';
const signed = (raw: string) => `${raw}.${guestHash(`cookie:${raw}`)}`;
function session(req: Request): string | null {
  const value = req.cookies?.[COOKIE];
  if (typeof value !== 'string' || !/^[a-f\d]{64}\.\d{13}\.[a-f\d]{64}$/.test(value)) return null;
  const [nonce, issued] = value.split('.');
  const issuedAt = Number(issued);
  if (issuedAt > Date.now() + 60000 || issuedAt < Date.now() - 86400000) return null;
  const raw = `${nonce}.${issued}`;
  const expected = signed(raw);
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected)) ? guestHash(`session:${raw}`) : null;
}
function origin(req: Request) {
  const value = req.get('origin');
  if (
    !value ||
    !(process.env.CORS_ORIGIN || '')
      .split(',')
      .map((s) => s.trim())
      .includes(value)
  )
    throw new ForbiddenError('Guest requests require an allowed browser origin');
  if (!req.is('application/json')) throw new BadRequestError('Use application/json');
}
async function challenge(token: string, hostname: string) {
  const response = await fetchWithTimeout('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token }),
    serviceName: 'Turnstile'
  });
  // A reply that is not a verdict is Turnstile failing, not the visitor: say so rather than blame them, or a 500.
  const result = response.ok
    ? ((await response.json().catch(() => null)) as { success?: boolean; hostname?: string; action?: string } | null)
    : null;
  if (!result) throw new ServiceUnavailableError('Guest verification is unavailable right now; try again shortly');
  if (!result.success || result.hostname !== hostname || result.action !== 'vivi-guest')
    throw new ForbiddenError('Complete the guest verification again');
}
export function createGuestRoutes() {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60000, max: 120 }));
  const sessionLimit = createRateLimiter({ windowMs: 60000, max: 20 });
  const questionLimit = createRateLimiter({ windowMs: 60000, max: 20 });
  const projectSearchLimit = createRateLimiter({ windowMs: 60000, max: 60 });
  router.get('/capabilities', async (_req, res) => {
    const [policy, assistant] = await Promise.all([effectivePolicy(), platformAssistantPublic()]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        enabled: policy.enabled && policy.guestEnabled && guestConfigured(),
        botCheckRequired: guestBotCheckRequired(),
        siteKey: guestBotCheckRequired() ? process.env.TURNSTILE_SITE_KEY || '' : '',
        sessionDailyLimit: policy.guestSessionRequests,
        greeting: policy.guestGreeting,
        examples: policy.guestExamples,
        // Who a visitor is talking to: the platform assistant's name and picture, and its page where that is public.
        ...(assistant ? { assistant } : {})
      }
    });
  });
  // Which public projects a visitor can ask about, by name: the public catalogue of vision-service, asked with no
  // credential, so only what anyone could see on Explore is offered. A short list is enough to pick from.
  router.get('/projects', projectSearchLimit, async (req, res) => {
    const policy = await effectivePolicy();
    if (!policy.enabled || !policy.guestEnabled || !guestConfigured())
      throw new ServiceUnavailableError('Guest Vivi is not available');
    const { q } = parsed(z.object({ q: z.string().trim().max(100).default('') }), req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { projects: await searchPublicProjects(q) } });
  });
  router.post('/session', sessionLimit, async (req, res) => {
    origin(req);
    const policy = await effectivePolicy();
    if (!policy.enabled || !policy.guestEnabled || !guestConfigured())
      throw new ServiceUnavailableError('Guest Vivi is not available');
    if (!session(req))
      res.cookie(COOKIE, signed(`${randomBytes(32).toString('hex')}.${Date.now()}`), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/assistant/guest',
        maxAge: 86400000
      });
    res.json({ success: true, data: { ready: true } });
  });
  router.get('/runs/:id', async (req, res) => {
    const id = session(req);
    if (!id || typeof req.params.id !== 'string' || !/^[a-f\d]{64}$/.test(req.params.id))
      throw new ForbiddenError('Guest session required');
    const run = await GuestRun.findOne({ _id: req.params.id, sessionId: id, expiresAt: { $gt: new Date() } })
      .select('state answer draft error createdAt queuedAt finishedAt projectId projectIds paperIds')
      .lean();
    if (!run) {
      res.status(404).json({ success: false, message: 'Guest question not found' });
      return;
    }
    // The page's patience runs from when the question was queued, as the worker's does (it never starts a turn that
    // could not finish inside it).
    const since = run.queuedAt ?? run.createdAt;
    if (['admitting', 'running'].includes(run.state) && since && since.getTime() < Date.now() - GUEST_PATIENCE_MS) {
      await GuestRun.updateOne(
        { _id: req.params.id, state: { $in: ['admitting', 'running'] } },
        {
          $set: {
            state: 'failed',
            error: GUEST_INTERRUPTED,
            finishedAt: new Date()
          }
        }
      );
      run.state = 'failed';
      run.error = GUEST_INTERRUPTED;
    }
    // An answer is shown only while every project it was drawn from is still public.
    if (run.state === 'completed') {
      const signal = AbortSignal.timeout(5000);
      await Promise.all([
        ...runProjects(run).map((projectId) => publicProject(projectId, signal)),
        ...(run.paperIds ?? []).map((paperId) => assertPublicPaper(paperId, signal))
      ]);
    }
    // A preview is of a run still being written; what a finished run shows is its answer.
    const { projectIds: _ids, paperIds: _papers, draft, ...rest } = run;
    const shown = { ...rest, ...(run.state === 'running' && draft ? { draft } : {}) };
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: shown });
  });
  router.post('/questions', questionLimit, async (req, res) => {
    origin(req);
    const policy = await effectivePolicy();
    const settings = await assistantSettings();
    if (!policy.enabled || !policy.guestEnabled || !settings.enabled || !settings.model || !guestConfigured())
      throw new ServiceUnavailableError('Guest Vivi is not available');
    const input = parsed(
      z
        .object({
          question: z.string().trim().min(1).max(2000),
          // The project on the visitor's page, or the one they asked about; without one, public projects are searched.
          projectId: z
            .string()
            .regex(/^[a-z0-9][a-z0-9-]{0,119}$/i)
            .optional(),
          // The run on the visitor's page: answered from only when it belongs to that public project.
          trainingId: z
            .string()
            .regex(/^[a-f\d]{24}$/i)
            .optional(),
          idempotencyKey: z.string().min(16).max(100),
          challengeToken: z.string().max(2048).optional()
        })
        .strict(),
      req.body
    );
    const sessionId = session(req);
    if (!sessionId) throw new ForbiddenError('Start a guest session first');
    const runId = guestHash(`request:${sessionId}:${input.idempotencyKey}`);
    const existing = await GuestRun.findById(runId).lean();
    if (existing) {
      res.status(202).json({ success: true, data: { runId, state: existing.state } });
      return;
    }
    if (guestBotCheckRequired()) {
      if (!input.challengeToken) throw new ForbiddenError('Complete the guest verification again');
      await challenge(input.challengeToken, new URL(req.get('origin')!).hostname);
    }
    const guestModel = modelFor(settings, 'guest');
    const price = await priceSnapshot(settings.provider, guestModel);
    if (!price || price.currency !== 'USD')
      throw new ServiceUnavailableError('Guest model requires configured USD pricing');
    // A token per request byte is the worst case, so the reservation bounds what the question can cost.
    // Each round of lookups is another request, with everything so far sent again, so the worst case is every request
    // at the most one may carry, each with a full-length answer.
    const lookups = guestToolLimits(policy);
    const requests = guestRequests(lookups);
    const reserveMicros = Math.ceil(
      requests *
        ((guestRequestBytes(lookups, guestOutputTokens(policy.guestAnswerWords)) +
          // Frames a run page's question may attach are billed as input too, and travel with every request.
          (input.trainingId || linkedPage(input.question).trainingId ? GUEST_FRAMES * FRAME_TOKENS_PER_ROUND : 0)) *
          Math.max(
            price.inputPerMillion,
            price.cacheReadPerMillion ?? price.inputPerMillion,
            price.cacheWritePerMillion ?? price.inputPerMillion * 2
          ) +
          guestOutputTokens(policy.guestAnswerWords) * price.outputPerMillion)
    );
    if (!Number.isSafeInteger(reserveMicros) || reserveMicros <= 0)
      throw new ServiceUnavailableError('Guest model cost cannot be bounded');
    const key = await resolveProviderKey(settings.provider);
    if (!key) throw new ServiceUnavailableError('Guest model is not configured');
    // What the worker will answer with: the shape the reservation above bounds, kept with the question.
    const plan: GuestPlan = {
      provider: settings.provider,
      model: guestModel,
      rounds: lookups.rounds,
      words: policy.guestAnswerWords,
      resultBytes: lookups.resultBytes
    };
    const page = { projectId: input.projectId, trainingId: input.trainingId };
    // The question is checked here as the worker will read it (a private page, a context too large are refused now,
    // before anything is reserved), without the frames. The answer is the worker's, a moment later.
    const gathered = await gatherGuest({
      sessionId,
      question: input.question,
      page,
      system: await guestSystemFor(plan),
      signal: AbortSignal.timeout(30000 + policy.guestToolRounds * 10000),
      images: false
    });
    const projectIds = gathered.projects.map((project) => project.id);
    try {
      await GuestRun.create({
        _id: runId,
        sessionId,
        question: input.question,
        projectIds,
        expiresAt: new Date(Date.now() + 86400000)
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        res.status(202).json({ success: true, data: { runId } });
        return;
      }
      throw error;
    }
    const network = networkPrefix(req.ip || '');
    const admission = await reserveGuest({ runId, sessionId, network, reserveMicros, caps: policy });
    if (!admission) {
      await GuestRun.updateOne(
        { _id: runId },
        {
          $set: {
            state: 'failed',
            error: 'Guest allowance or shared capacity is currently unavailable',
            finishedAt: new Date()
          }
        }
      );
      const reason = await guestDenialReason({ sessionId, network, reserveMicros, caps: policy }).catch(
        (): GuestDenial => 'shared'
      );
      const resetAt = nextGuestReset();
      // A quick retry helps only for a burst or a busy moment; a daily allowance returns at the UTC reset.
      const retryAfter =
        reason === 'burst' || reason === 'capacity'
          ? 60
          : Math.max(60, Math.min(3600, Math.ceil((resetAt.getTime() - Date.now()) / 1000)));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        message: 'Guest allowance or shared capacity is currently unavailable. Sign in or try again later.',
        reason,
        resetAt: resetAt.toISOString()
      });
      return;
    }
    // Admitted: the worker takes it from here. It is found by its next look, or at once when told (Redis connects the
    // processes; without it the worker's poll is the only thing that wakes it, and is enough).
    await GuestRun.updateOne(
      { _id: runId },
      { $set: { month: admission.month, queuedAt: new Date(), plan, page } }
    );
    notify('worker');
    res
      .status(202)
      .json({ success: true, data: { runId, remaining: admission.remaining, resetAt: admission.resetAt } });
  });
  return router;
}
