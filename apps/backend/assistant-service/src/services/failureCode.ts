import { ProviderRequestError } from './providers';

/**
 * Why a question failed, as a short code the page can act on: a message is for reading, a code is for choosing what to
 * offer (when the allowance resets, who can turn Vivi on, Try again). The text stays the run's `error`.
 */
export const FAILURE_CODES = [
  'limit_reached',
  'busy',
  'assistant_off',
  'access_changed',
  'no_access',
  'too_large',
  'image',
  'timeout',
  'interrupted',
  'provider_error',
  'stopped',
  'other'
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

/** What the worker says when the day's tokens are held by the asker's other questions still running, not spent. */
export const BUSY_MESSAGE =
  'Your other questions to Vivi are still running and hold what is left of today’s allowance. Try again when they finish.';
/** What the worker says when a run outlived its lease: the worker stopped (a restart, a deploy) before it finished. */
export const INTERRUPTED_MESSAGE = 'Analysis was interrupted. Send your question again to retry.';

// The specific sentences first: the broad patterns below would otherwise take them for something they are not.
const RULES: [RegExp, FailureCode][] = [
  [/still running and hold/i, 'busy'],
  // The day's allowance, not one question's own budget: that one is "too large" and asks for a narrower question.
  [/daily (vivi question allowance|assistant token budget) is used/i, 'limit_reached'],
  [/analysis was interrupted/i, 'interrupted'],
  [/image is too large|image .*could not be read|choose an image/i, 'image'],
  [/no longer accessible|access changed during analysis/i, 'no_access'],
  // Vivi switched off, or its terms changed, while it answered: nothing about the question itself.
  [/access or agreement changed|analysis cancelled/i, 'access_changed'],
  [/no assistant model is configured|key is configured|access is disabled|account is not active/i, 'assistant_off'],
  [/token limit reached|tool-round limit|too large|too many tool calls|exceeded its output limit/i, 'too_large'],
  [/timed out|timeout/i, 'timeout'],
  [/stopped/i, 'stopped'],
  [/assistant (provider|sent|returned|declined)|unreadable|try again/i, 'provider_error']
];

export function failureCodeOf(error: unknown): FailureCode {
  if (error instanceof ProviderRequestError) return 'provider_error';
  if (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError') &&
    /timeout|timed out/i.test(error.message + error.name)
  )
    return 'timeout';
  const text = error instanceof Error ? error.message : '';
  return RULES.find(([pattern]) => pattern.test(text))?.[1] ?? 'other';
}
