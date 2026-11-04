export interface Tally {
  questions: number;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  unpricedQuestions: number;
  unpricedTokens: number;
}
export interface UsageBody {
  days: number;
  currency: string;
  totals: Tally;
  failedQuestions: number;
  backfilledQuestions: number;
  byDay: (Tally & { day: string })[];
  byModel: (Tally & { provider: string; model: string; price: object | null; pricesInPeriod: number })[];
  byPerson: (Tally & { userId: string; name: string })[];
  prices: { currency: string; entries: object[] };
}
