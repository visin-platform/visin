import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ActorKind, ApiKeyScope } from '@visin/backend-core';
import { VisinError } from '../http';
import { ShapeError } from '../schemas';

/**
 * A tool, and what a key must carry before the model is told it exists.
 *
 * Scopes gate *registration*, not execution. A key without `vision:write`
 * should never see `update_training` at all: a tool the model can see is a tool
 * it will eventually try, and a 403 it cannot act on is worse than an absence
 * it can reason about. This is also the seam a new domain hangs off — label
 * tools become a module declaring `label:read` and nothing else changes.
 */
export interface ToolModule {
  /** every one of these must be present on the key */
  scopes: ApiKeyScope[];
  register: (server: McpServer, caller: Caller) => void;
}

/** Who is calling. The token is forwarded verbatim to vision-service. */
export interface Caller {
  token: string;
  /** what the credential is called, for a log line naming the actor */
  label?: string;
  /**
   * Who to attribute a tool call to in the audit trail.
   *
   * Separate from the token because the token is a secret to forward and this
   * is a name to write down. Optional so a test can build a caller without
   * inventing an identity — a call with no actor is timed and logged, just not
   * filed under anyone.
   */
  actor?: {
    kind: ActorKind;
    userId: string;
    /** the key's name or the connected app's, as its owner would recognise it */
    label: string;
    credentialId?: string;
  };
}

/**
 * The most image data one call may carry, in bytes before base64.
 *
 * A cap on transport, not on context: an image's token cost scales with its
 * dimensions, not its file size, so a 300 KB 480x320 overlay is a couple of
 * hundred tokens however heavy the PNG. What this guards against is a single
 * response too large for the transport to carry at all.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** How many frames one call may return before it is doing too much at once. */
export const MAX_IMAGES = 4;

export interface ToolImage {
  /** raw bytes; base64 encoding happens here so callers never think about it */
  data: Buffer;
  mimeType: string;
}

/**
 * A result carrying frames for the model to actually look at.
 *
 * Kept separate from `ok` because the two are capped on different things: text
 * is capped because it crowds out the conversation, images because the
 * transport has a size beyond which nothing arrives. Running images through
 * `ok`'s character ceiling would measure base64 against a budget meant for
 * prose and reject a perfectly cheap picture.
 */
export const okWithImages = (text: string, images: ToolImage[]) => ({
  content: [
    { type: 'text' as const, text },
    ...images.slice(0, MAX_IMAGES).map((image) => ({
      type: 'image' as const,
      data: image.data.toString('base64'),
      mimeType: image.mimeType
    }))
  ]
});

/** Everything the model gets back is text it can act on. */
export const fail = (message: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text: message }]
});

/**
 * The most any one tool result may hand back, in characters.
 *
 * About 5,000 tokens. Generous next to what these tools actually return — the
 * heaviest legitimate answer measured was a fifth of this — and far below the
 * point where one call crowds out the conversation it is part of.
 */
const MAX_RESULT_CHARS = 20_000;

/**
 * Everything a tool answers with goes through here, and nothing may exceed the
 * ceiling.
 *
 * A per-tool cap is the kind of thing an author forgets, and the one that gets
 * forgotten is the one that hurts: `get_test_results` was measured returning
 * 658,000 characters — 164,000 tokens, a whole context window — because an
 * endpoint quietly ignored its `limit`. That specific bug is fixed, but the
 * failure mode is not specific to it, so the ceiling lives at the single funnel
 * every tool already uses rather than in each of them.
 *
 * Truncation stops at a line boundary and says what happened. A result cut
 * mid-number would be worse than a large one: the model cannot tell a truncated
 * figure from a real one, and would quote it.
 */
export const ok = (text: string) => {
  if (text.length <= MAX_RESULT_CHARS) {
    return { content: [{ type: 'text' as const, text }] };
  }

  const clipped = text.slice(0, MAX_RESULT_CHARS);
  const atLineBreak = clipped.slice(0, clipped.lastIndexOf('\n'));

  return {
    content: [
      {
        type: 'text' as const,
        text:
          `${atLineBreak || clipped}\n\n` +
          `[Truncated: this answer was ${count(text.length)} characters, over the ` +
          `${count(MAX_RESULT_CHARS)} a single tool result may return. What you have above is ` +
          'the beginning of it, not a summary. Narrow the request — fewer results, one training, ' +
          'one epoch — rather than treating this as the whole answer.]'
      }
    ]
  };
};

/**
 * Turn any failure into a sentence.
 *
 * A model cannot recover from a stack trace, and a bare 403 tells it nothing
 * about what to do differently. The scope and contract failures are worth
 * naming precisely because neither is fixed by retrying, and a model that is
 * not told so will retry until it gives up.
 */
export function explain(error: unknown): ReturnType<typeof fail> {
  if (error instanceof ShapeError) return fail(error.message);

  if (error instanceof VisinError) {
    if (error.status === 403) {
      return fail(
        `${error.message} Either this API key does not carry the necessary scope, or the ` +
          'project is private and not the caller\'s. Do not retry — the user needs to issue a ' +
          'new key with the right scope in Visin account settings, or ask the project owner.'
      );
    }
    if (error.status === 401) {
      return fail('The API key was rejected. Do not retry; the user needs to check or reissue it.');
    }
    if (error.status === 404) {
      return fail(
        `${error.message} Note that a private project reads as "not found" to someone who ` +
          'cannot see it, so this may be a permissions answer rather than a missing record.'
      );
    }
    return fail(error.message);
  }

  return fail(error instanceof Error ? error.message : 'Unknown error');
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Why there is a formatting section here at all.
 *
 * A tool result is not a page someone closes: it stays in the conversation and
 * is sent again with every message that follows, so one bloated answer is paid
 * for on every later turn. Handing back the raw JSON these endpoints return
 * would spend thousands of tokens on mongo ids, `deletedAt: null` and `__v`
 * before reaching the two numbers the question was about. Everything below
 * exists to answer in prose instead.
 */

/** A Mongo ObjectId is 24 hex characters; a UUID is 8-4-4-4-12. Unambiguous. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turn whatever identifier the model has into the one the endpoint wants.
 *
 * `list_trainings` hands out `_id` and every tool takes that, but the results,
 * benchmark and visualization endpoints key on the run's `uuid` instead.
 * Passing the id there filtered nothing at all — zod drops an unknown query key
 * silently, so the call succeeded and answered about every run. One extra
 * lookup is worth not answering the wrong question.
 */
export async function resolveTrainingUuid(
  fetchTraining: (id: string) => Promise<{ uuid?: string }>,
  training: string
): Promise<string> {
  if (UUID.test(training)) return training;

  const run = await fetchTraining(training);
  if (!run.uuid) {
    // Deliberately not a VisinError: `explain` would dress a 404 up with a note
    // about private projects, and this is neither missing nor forbidden.
    throw new Error(`Training ${training} has no uuid recorded, so it cannot be scoped to.`);
  }
  return run.uuid;
}

/** A count with separators: "7484 epochs" is a number to decode, not to read. */
export const count = (value: number): string => value.toLocaleString('en-US');

/** A metric, to a sane number of places. Training metrics are rarely meaningful past four. */
export const metric = (value: number): string =>
  Number.isInteger(value) ? String(value) : Number(value.toFixed(4)).toString();

/**
 * A duration in words.
 *
 * Epoch times arrive in seconds, and a run's total is routinely five figures of
 * them — a number nobody reads as "about nine hours" without doing arithmetic
 * the model should not be spending its attention on.
 */
export const duration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 1) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes >= 1) return `${minutes}m ${Math.round(seconds % 60)}s`;
  return `${Math.round(seconds)}s`;
};

/** A date without the time, which is never the part anyone asked about. */
export const day = (value: string | undefined): string => (value ? value.slice(0, 10) : 'unknown');

/**
 * Subtrees that are machine telemetry rather than anything the model trained.
 *
 * `system_info` carries CPU percent, memory and GPU load. Real data, wrong
 * question: nobody reads a loss curve to find out what the fans were doing.
 */
const NOT_METRICS = new Set(['system_info']);

interface Leaf {
  path: string;
  value: number;
  depth: number;
}

/** Every numeric leaf in an epoch's results, with the path that reached it. */
function numericLeaves(results: Record<string, unknown>, prefix = '', depth = 1): Leaf[] {
  return Object.entries(results).flatMap(([key, value]) => {
    if (depth === 1 && NOT_METRICS.has(key)) return [];

    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'number') return [{ path, value, depth }];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return numericLeaves(value as Record<string, unknown>, path, depth + 1);
    }
    return [];
  });
}

/** No curve should hand back more numbers than a person would read per point. */
const MAX_METRICS_PER_EPOCH = 12;

/**
 * The metrics of one epoch, in a stable order.
 *
 * What a run records is its own business, and the shapes differ: some write
 * `{ loss, mAP }` flat, others nest `{ train: { loss, mean_iou, vehicle: {...} } }`.
 * Reading only the top level meant a run of the second kind reported "no
 * metrics recorded" for every single epoch — the curve tool returned nothing at
 * all, and said so confidently.
 *
 * So the tree is walked, and then only the *shallowest* leaves are kept. That
 * is what separates a summary from a breakdown without knowing either schema:
 * `train.loss` sits above `train.vehicle.iou`, and it is the one a curve is
 * asking about. The per-class detail is what `get_test_results` is for.
 */
export const numericResults = (results: Record<string, unknown>): Array<[string, number]> => {
  const leaves = numericLeaves(results);
  if (leaves.length === 0) return [];

  const shallowest = Math.min(...leaves.map((leaf) => leaf.depth));

  return leaves
    .filter((leaf) => leaf.depth === shallowest)
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, MAX_METRICS_PER_EPOCH)
    .map((leaf): [string, number] => [leaf.path, leaf.value]);
};

/**
 * The span one metric covered over a run, and where each end happened.
 *
 * Reported without judging direction, because this server cannot know it: a run
 * records whatever it chose to, and guessing "loss is minimised, mAP maximised"
 * from the name would be wrong on exactly the custom metrics whoever defined
 * them cares most about. Both ends are given and the reading is left to the
 * model.
 */
export interface MetricRange {
  key: string;
  low: number;
  lowEpoch: number;
  high: number;
  highEpoch: number;
}

/**
 * What each metric ranged over, across every epoch of a run.
 *
 * Worth having because the last epoch is routinely not the run's result. A
 * measured example from this platform: a run's `val.loss` reads 1.0479 at its
 * final epoch and 0.2402 at epoch 13 — a four-fold difference between what it
 * ended at and what it achieved. A comparison quoting only the final epoch says
 * that run is far worse than it is, which is the wrong answer to the only
 * question anyone asks a comparison.
 */
export function metricRanges(epochs: Array<{ epoch: number; results: Record<string, unknown> }>): MetricRange[] {
  const seen = new Map<string, MetricRange>();

  for (const epoch of epochs) {
    for (const [key, value] of numericResults(epoch.results)) {
      const current = seen.get(key);
      if (!current) {
        seen.set(key, { key, low: value, lowEpoch: epoch.epoch, high: value, highEpoch: epoch.epoch });
        continue;
      }
      if (value < current.low) {
        current.low = value;
        current.lowEpoch = epoch.epoch;
      }
      if (value > current.high) {
        current.high = value;
        current.highEpoch = epoch.epoch;
      }
    }
  }

  return [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Take about `n` evenly spaced items, always keeping the first and last.
 *
 * The reason `get_training_curve` exists in this shape. A 300-epoch run with a
 * dozen metrics each is thousands of tokens, re-sent on every subsequent turn,
 * to answer a question — "is the loss still coming down?" — that a dozen points
 * answer just as well. The ends are kept because they are the two the question
 * is usually actually about.
 */
export function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n || n < 2) return items.slice(0, Math.max(n, items.length <= n ? items.length : n));
  const step = (items.length - 1) / (n - 1);
  const picked: T[] = [];
  for (let i = 0; i < n; i += 1) picked.push(items[Math.round(i * step)]);
  return picked;
}

/** Cap a list, saying what was left out rather than truncating in silence. */
export function capped<T>(items: T[], limit: number, noun: string): { shown: T[]; note: string } {
  if (items.length <= limit) return { shown: items, note: '' };
  return {
    shown: items.slice(0, limit),
    note: `\n\n(Showing the first ${limit} of ${count(items.length)} ${noun}. Narrow the search to see others.)`
  };
}
