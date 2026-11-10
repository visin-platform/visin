import { budgetPlans, reservationFor, TOKENS_PER_ROUND } from '../../services/analysisLimits';

it('prefers page changes, then the full rounds without them, then fewer rounds', () => {
  expect(budgetPlans(10_000_000, 8, true)).toEqual([
    { screen: true, toolRounds: 8, reserve: reservationFor(true, 8) },
    { screen: false, toolRounds: 8, reserve: reservationFor(false, 8) }
  ]);
});
it('offers no page changes to a question that did not come from the side panel', () => {
  expect(budgetPlans(10_000_000, 8, false).every((plan) => !plan.screen)).toBe(true);
});
it('runs a question with fewer rounds under a limit saved before the rounds grew', () => {
  // 300k was enough for one question at 4 rounds; 8 rounds now reserve 320k.
  expect(budgetPlans(300_000, 8, true)).toEqual([{ screen: false, toolRounds: 7, reserve: 7 * TOKENS_PER_ROUND }]);
});
it('has no plan for a limit below the fewest rounds', () => {
  expect(budgetPlans(TOKENS_PER_ROUND, 8, true)).toEqual([]);
});

it('reserves image tokens on every possible provider round and reduces rounds to fit the daily budget', () => {
  expect(reservationFor(false, 2, 1)).toBe(2 * (TOKENS_PER_ROUND + 32768));
  const plans = budgetPlans(300000, 8, false, 1);
  expect(plans).toEqual([{ screen: false, toolRounds: 4, reserve: reservationFor(false, 4, 1) }]);
});
