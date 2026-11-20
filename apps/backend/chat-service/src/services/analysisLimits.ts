import { MAX_REQUEST_BYTES, MAX_OUTPUT_TOKENS, PAPER_REQUEST_BYTES, TOOL_REQUEST_BYTES } from './providers';
import { IMAGE_TOKENS_PER_ROUND } from './imageInput';
import { MAX_SCREEN_CALLS } from './screen';

export const DEFAULT_TOOL_ROUNDS = 8;
export const MIN_TOOL_ROUNDS = 2;
export const MAX_TOOL_ROUNDS = 16;
export const TOKENS_PER_ROUND = MAX_REQUEST_BYTES + MAX_OUTPUT_TOKENS;
/** What a round of a private chat reserves: it carries the research tools, so its request ceiling is larger. */
export const TOOL_TOKENS_PER_ROUND = TOOL_REQUEST_BYTES + MAX_OUTPUT_TOKENS;
/** What one round may use: the request it sends and the answer it may write. */
const perRound = (requestBytes: number) => requestBytes + MAX_OUTPUT_TOKENS;
/** Rendered frames the analyst may look at in one answer: enough to compare two, few enough to stay affordable. */
export const FRAME_IMAGES = 2;
/**
 * What one frame may cost per round. A frame is an image Visin rendered, so its size is known to be within what a
 * provider bills at most a few thousand tokens for; an uploaded image keeps the far wider IMAGE_TOKENS_PER_ROUND.
 */
export const FRAME_TOKENS_PER_ROUND = 6000;
export const reservationFor = (
  screen: boolean,
  toolRounds = DEFAULT_TOOL_ROUNDS,
  imageCount = 0,
  requestBytes = MAX_REQUEST_BYTES,
  frames = false
) =>
  (toolRounds + (screen ? MAX_SCREEN_CALLS : 0)) *
  (perRound(requestBytes) + imageCount * IMAGE_TOKENS_PER_ROUND + (frames ? FRAME_IMAGES * FRAME_TOKENS_PER_ROUND : 0));
export const RESERVATION = reservationFor(false);
/** The least a private question can run on: its fewest rounds with the research tools. Below it, the day is used. */
export const SMALLEST_PRIVATE_QUESTION = reservationFor(false, MIN_TOOL_ROUNDS, 0, TOOL_REQUEST_BYTES);
/**
 * The request ceiling for a turn, which is also what it reserves against the day: a conversation about a paper reads
 * whole pages, a private chat carries the research tools, and a shared one has neither. `undefined` is the default.
 */
export const requestBytesFor = (paper: boolean, tools: boolean): number | undefined =>
  paper ? PAPER_REQUEST_BYTES : tools ? TOOL_REQUEST_BYTES : undefined;

export interface BudgetPlan {
  /** Whether this turn may move the page; a turn that may reserves MAX_SCREEN_CALLS more rounds. */
  screen: boolean;
  toolRounds: number;
  reserve: number;
  /** Set when the turn may look at rendered frames, which reserves room for FRAME_IMAGES of them. */
  frames?: true;
}
/**
 * The ways a question can run within a daily limit, best first. A page change is a convenience, so a question
 * that cannot also reserve room for it runs without it rather than being refused. A limit saved before the round
 * setting existed (or below what the rounds now need), or a day with less left than a full question reserves
 * (`available`), runs with fewer rounds instead of refusing every question.
 */
export function budgetPlans(
  limit: number,
  toolRounds = DEFAULT_TOOL_ROUNDS,
  screen = false,
  imageCount = 0,
  requestBytes = MAX_REQUEST_BYTES,
  frames = false,
  available = limit
): BudgetPlan[] {
  // The last resort fits what is left of the day, not the whole day: sized against the limit, it asked for as much as
  // a full question, so a day half spent refused every question while half of it was still there.
  const capped = Math.min(
    toolRounds,
    Math.floor(Math.min(limit, available) / (perRound(requestBytes) + imageCount * IMAGE_TOKENS_PER_ROUND))
  );
  const withFrames = (on: boolean): BudgetPlan => ({
    screen: on,
    toolRounds,
    reserve: reservationFor(on, toolRounds, imageCount, requestBytes, true),
    frames: true
  });
  // Looking at frames, like moving the page, is given up before the question is: those plans come first.
  const plans: BudgetPlan[] = [
    ...(frames && screen ? [withFrames(true)] : []),
    ...(frames ? [withFrames(false)] : []),
    ...(screen ? [{ screen: true, toolRounds, reserve: reservationFor(true, toolRounds, imageCount, requestBytes) }] : []),
    { screen: false, toolRounds, reserve: reservationFor(false, toolRounds, imageCount, requestBytes) },
    { screen: false, toolRounds: capped, reserve: reservationFor(false, capped, imageCount, requestBytes) }
  ];
  return plans.filter(
    (plan, index) =>
      plan.reserve <= limit &&
      plan.toolRounds >= MIN_TOOL_ROUNDS &&
      plans.findIndex(
        (other) => other.reserve === plan.reserve && other.screen === plan.screen && other.frames === plan.frames
      ) === index
  );
}
