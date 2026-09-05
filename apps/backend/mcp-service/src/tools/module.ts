import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiKeyScope } from '@visin/backend-core';
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
}

/** Everything the model gets back is text it can act on. */
export const fail = (message: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text: message }]
});

export const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });

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
 * The numeric entries of an epoch's `results`, in a stable order.
 *
 * What a run records per epoch depends on the model and the config, so nothing
 * here names a metric. Non-numeric values are dropped: they are almost always
 * nested diagnostics, and rendering one costs far more than it explains.
 */
export const numericResults = (results: Record<string, unknown>): Array<[string, number]> =>
  Object.entries(results)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort(([a], [b]) => a.localeCompare(b));

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
