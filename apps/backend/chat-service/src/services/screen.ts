import { NotFoundError } from '@visin/backend-core';
import { z } from 'zod';
import { ScreenCall } from '../models/ScreenCall';
import { parsed } from '../validation/parse';
import type { Request } from 'express';
import { authorize } from './access';

/** How long the analyst waits for the page to answer before it carries on with words. */
export const SCREEN_WAIT_MS = 20000;
const POLL_MS = 250;
/** A call this old has no one waiting for it any more (its worker is gone). */
const STALE_MS = SCREEN_WAIT_MS + 10000;
/** Screen calls one turn may make, apart from its rounds of reading results. */
export const MAX_SCREEN_CALLS = 3;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const uuid = z.string().regex(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i);
/** Visin ids are Mongo ids or uuids; anything else is not an address. */
export const entityId = z.union([objectId, uuid]);
const slug = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/i);
const version = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,39}$/i);
/** Mirrors vision-front's TRAINING_TABS; a test in shell-front keeps the two together. */
export const TRAINING_TABS = [
  'overview',
  'epochs',
  'evaluations',
  'visualizations',
  'models',
  'system-info',
  'config',
  'benchmarks',
  'analysis'
] as const;
export const COMPARE_TABS = ['tests', 'benchmarks'] as const;
/** Mirrors vision-front's PROJECT_TAB_KEYS, for reading which tab of a project page is open. */
export const PROJECT_TABS = [
  'overview',
  'trainings',
  'evaluations',
  'visualizations',
  'benchmarks',
  'comparisons',
  'analysis',
  'models',
  'settings'
] as const;

const bare = <T extends string>(place: T) => z.strictObject({ place: z.literal(place) });
export const screenRequestSchema = z.discriminatedUnion('place', [
  z.strictObject({ place: z.literal('action'), action: z.literal('open_frame'), id: entityId }),
  bare('projects'),
  z.strictObject({ place: z.literal('project'), id: entityId }),
  z.strictObject({ place: z.literal('trainings'), project: entityId.optional() }),
  z.strictObject({
    place: z.literal('training'),
    id: entityId,
    tab: z.enum(TRAINING_TABS).optional(),
    model: entityId.optional()
  }),
  z.strictObject({
    place: z.literal('compare'),
    ids: z.array(entityId).min(2).max(8),
    tab: z.enum(COMPARE_TABS).optional()
  }),
  bare('datasets'),
  z.strictObject({ place: z.literal('dataset'), id: entityId }),
  bare('models'),
  bare('benchmarks'),
  z.strictObject({ place: z.literal('evaluation'), id: entityId }),
  z.strictObject({ place: z.literal('suite'), slug, version }),
  z.strictObject({ place: z.literal('visualizations'), ids: z.array(entityId).min(2).max(8) }),
  z.strictObject({ place: z.literal('paper'), id: entityId })
]);
export type ScreenRequest = z.infer<typeof screenRequestSchema>;

/** Where the panel sits, as the asking tab reports it with a message. */
export const screenContextSchema = z.strictObject({
  tabId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  path: z.string().max(500).startsWith('/'),
  allowActions: z.boolean().optional(),
  actions: z
    .array(
      z.strictObject({
        name: z.literal('open_frame'),
        ids: z.array(entityId).max(100),
        labels: z.array(z.string().max(200)).max(100).optional()
      })
    )
    .max(1)
    .optional()
});
export type ScreenContext = z.infer<typeof screenContextSchema>;

export const screenResultSchema = z.strictObject({
  ok: z.boolean(),
  summary: z.string().trim().max(200).default('')
});

/**
 * The tool the model sees: plain JSON Schema, kept short because it is input tokens on every turn.
 * Ids are named by what the other tools returned. It offers only what NavigationPolicy can allow: evaluations,
 * suites, papers and model outputs stay in screenRequestSchema for the shell, but no tool result names them yet.
 */
export const SCREEN_TOOL = {
  name: 'show_on_screen',
  description:
    'Change the page beside the chat when the person asks to see or open something. Never use it to answer a question. Navigation ids from tool results; action ids from advertised frames.',
  schema: {
    type: 'object',
    properties: {
      place: {
        type: 'string',
        enum: [
          'action',
          'projects',
          'project',
          'trainings',
          'training',
          'compare',
          'datasets',
          'dataset',
          'models',
          'benchmarks',
          'visualizations'
        ]
      },
      action: {
        type: 'string',
        enum: ['open_frame'],
        description: 'action: open a frame advertised by the current page'
      },
      id: { type: 'string', description: 'project, training or dataset id' },
      ids: { type: 'array', items: { type: 'string' }, description: '2 to 8 training ids, for compare/visualizations' },
      tab: {
        type: 'string',
        description: `training: ${TRAINING_TABS.join(', ')}; compare: ${COMPARE_TABS.join(', ')} (omit for training runs)`
      },
      project: { type: 'string', description: 'trainings: limit to this project id' }
    },
    required: ['place'],
    additionalProperties: false
  }
};

export interface ScreenOutcome {
  ok: boolean;
  text: string;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
    };
    const aborted = () => {
      done();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      done();
      resolve();
    }, ms);
    signal.addEventListener('abort', aborted, { once: true });
  });

/** What the page said about a call, once it has said anything. */
async function answer(callId: string): Promise<ScreenOutcome | undefined> {
  const current = await ScreenCall.findById(callId).select('state summary');
  if (current?.state === 'done') return { ok: true, text: current.summary || 'Shown.' };
  if (current?.state === 'failed') return { ok: false, text: current.summary || 'The screen could not show that.' };
  return undefined;
}

/**
 * Asks the asker's tab to show a place and waits for its answer. Nothing here throws for a refusal
 * or a silent page: the analyst is told, and carries on with words.
 */
export async function requestScreen(
  run: {
    id: string;
    conversationId: string;
    userId: string;
    screen?: { tabId?: string | null; allowActions?: boolean | null } | null;
  },
  input: unknown,
  signal: AbortSignal,
  wait = SCREEN_WAIT_MS
): Promise<ScreenOutcome> {
  signal.throwIfAborted();
  const tabId = run.screen?.tabId;
  if (!tabId) return { ok: false, text: 'There is no screen beside this chat.' };
  if (run.screen?.allowActions !== true)
    return { ok: false, text: 'Page changes were not authorized for this message.' };
  const checked = screenRequestSchema.safeParse(input);
  if (!checked.success)
    return { ok: false, text: `That place was not valid: ${checked.error.issues.map((i) => i.message).join('; ')}` };
  const { place, ...params } = checked.data;
  const call = await ScreenCall.create({
    runId: run.id,
    conversationId: run.conversationId,
    userId: run.userId,
    tabId,
    place,
    params
  });
  const deadline = Date.now() + wait;
  try {
    for (;;) {
      const answered = await answer(call.id);
      if (answered) return answered;
      if (Date.now() >= deadline) break;
      await sleep(Math.min(POLL_MS, deadline - Date.now()), signal);
    }
  } catch (error) {
    // A cancelled run leaves nothing for the page to act on.
    await ScreenCall.updateOne({ _id: call.id, state: 'pending' }, { $set: { state: 'expired' } });
    throw error;
  }
  await ScreenCall.updateOne({ _id: call.id, state: 'pending' }, { $set: { state: 'expired' } });
  // The page may have answered, either way, between the last look and the expiry.
  const late = await answer(call.id);
  if (late) return late;
  return { ok: false, text: 'The screen did not answer, so nothing was opened. Say what you found in words instead.' };
}

/** The one answer a call takes: from its own user, while it is still pending. */
export async function answerScreen(userId: string, callId: string, body: unknown) {
  const result = parsed(screenResultSchema, body);
  if (!/^[a-f\d]{24}$/i.test(callId)) throw new NotFoundError('Screen call not found');
  const updated = await ScreenCall.updateOne(
    { _id: callId, userId, state: 'pending' },
    { $set: { state: result.ok ? 'done' : 'failed', summary: result.summary } }
  );
  if (!updated.matchedCount) throw new NotFoundError('Screen call not found');
}

/** Calls whose worker went away without expiring them. */
export async function expireScreenCalls() {
  await ScreenCall.updateMany(
    { state: 'pending', createdAt: { $lt: new Date(Date.now() - STALE_MS) } },
    { $set: { state: 'expired' } }
  );
}

/** The pending calls one tab should act on, oldest first. */
export async function pendingScreenCalls(userId: string, tabId: string, conversationId: string) {
  const calls = await ScreenCall.find({ userId, tabId, conversationId, state: 'pending' })
    .sort({ createdAt: 1 })
    .limit(MAX_SCREEN_CALLS)
    .lean();
  return calls.map((c) => ({ id: c._id.toString(), place: c.place, params: c.params ?? {} }));
}

/** HTTP fallback for tabs whose event stream is unavailable or buffered. Same audience filter as SSE. */
export async function screenCallsFor(req: Request, conversationId: string, tab: unknown) {
  const tabId = parsed(screenContextSchema.shape.tabId, tab);
  const conversation = await authorize(req, conversationId);
  if (conversation.kind !== 'assistant') return [];
  return pendingScreenCalls(req.user!.id, tabId, conversationId);
}
