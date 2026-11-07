import { MAX_REQUEST_BYTES, MAX_OUTPUT_TOKENS } from './providers';
import { MAX_SCREEN_CALLS } from './screen';

export const DEFAULT_TOOL_ROUNDS = 8;
export const MIN_TOOL_ROUNDS = 2;
export const MAX_TOOL_ROUNDS = 16;
export const TOKENS_PER_ROUND = MAX_REQUEST_BYTES + MAX_OUTPUT_TOKENS;
export const reservationFor = (screen: boolean, toolRounds = DEFAULT_TOOL_ROUNDS) =>
  (toolRounds + (screen ? MAX_SCREEN_CALLS : 0)) * TOKENS_PER_ROUND;
export const RESERVATION = reservationFor(false);

export interface BudgetPlan {
  /** Whether this turn may move the page; a turn that may reserves MAX_SCREEN_CALLS more rounds. */
  screen: boolean;
  toolRounds: number;
  reserve: number;
}
/**
 * The ways a question can run within a daily limit, best first. A page change is a convenience, so a question
 * that cannot also reserve room for it runs without it rather than being refused. A limit saved before the round
 * setting existed (or below what the rounds now need) runs with fewer rounds instead of refusing every question.
 */
export function budgetPlans(limit: number, toolRounds = DEFAULT_TOOL_ROUNDS, screen = false): BudgetPlan[] {
  const capped = Math.min(toolRounds, Math.floor(limit / TOKENS_PER_ROUND));
  const plans: BudgetPlan[] = [
    ...(screen ? [{ screen: true, toolRounds, reserve: reservationFor(true, toolRounds) }] : []),
    { screen: false, toolRounds, reserve: reservationFor(false, toolRounds) },
    { screen: false, toolRounds: capped, reserve: reservationFor(false, capped) }
  ];
  return plans.filter(
    (plan, index) =>
      plan.reserve <= limit &&
      plan.toolRounds >= MIN_TOOL_ROUNDS &&
      plans.findIndex((other) => other.reserve === plan.reserve && other.screen === plan.screen) === index
  );
}
