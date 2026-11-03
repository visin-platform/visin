import { AssistantRun, Pricing } from '../models';
import type { ProviderId } from './providers';

const PRICING_KEY = 'pricing';
const DEFAULT_CURRENCY = 'USD';

export interface PriceEntry {
  provider: ProviderId;
  model: string;
  /** In the deployment's currency, per million tokens. */
  inputPerMillion: number;
  outputPerMillion: number;
  /** Typed by an administrator (which a refresh never overwrites), or fetched from the price list. */
  source: 'manual' | 'fetched';
  /** When a fetched price was fetched. */
  fetchedAt: string | null;
}
export interface PriceTable {
  currency: string;
  entries: PriceEntry[];
}

export async function getPricing(): Promise<PriceTable> {
  const doc = await Pricing.findById(PRICING_KEY).lean();
  return {
    currency: doc?.currency || DEFAULT_CURRENCY,
    entries: (doc?.entries ?? []).map((entry) => ({
      provider: entry.provider as ProviderId,
      model: entry.model,
      inputPerMillion: entry.inputPerMillion,
      outputPerMillion: entry.outputPerMillion,
      source: entry.source === 'fetched' ? 'fetched' : 'manual',
      fetchedAt: entry.fetchedAt ? new Date(entry.fetchedAt).toISOString() : null
    }))
  };
}

/** Replaces the whole table: what the page sends back is what is kept, so a price is removed by leaving it out. */
export async function savePricing(pricing: PriceTable, userId: string): Promise<void> {
  await Pricing.updateOne({ _id: PRICING_KEY }, { $set: { ...pricing, updatedBy: userId } }, { upsert: true });
}

/** Every model that has answered a question, so a price can be looked up for each without waiting to be asked. */
export async function modelsUsed(): Promise<{ provider: string; model: string }[]> {
  const rows = await AssistantRun.aggregate<{ _id: { provider: string | null; model: string | null } }>([
    { $match: { state: 'completed', provider: { $ne: null }, model: { $ne: null } } },
    { $group: { _id: { provider: '$provider', model: '$model' } } }
  ]);
  return rows.map((row) => ({ provider: row._id.provider!, model: row._id.model! }));
}

const priceOf = (entries: PriceEntry[], provider: string, model: string): PriceEntry | undefined =>
  entries.find((entry) => entry.provider === provider && entry.model === model);

/** The price to keep with an answer given now, or null where none is set for its model. */
export async function priceSnapshot(provider: string, model: string) {
  const pricing = await getPricing();
  const entry = priceOf(pricing.entries, provider, model);
  return entry
    ? {
        currency: pricing.currency,
        inputPerMillion: entry.inputPerMillion,
        outputPerMillion: entry.outputPerMillion,
        source: entry.source,
        backfilled: false
      }
    : null;
}

const costOf = (inputPerMillion: number, outputPerMillion: number, inputTokens: number, outputTokens: number): number =>
  (inputTokens * inputPerMillion + outputTokens * outputPerMillion) / 1_000_000;

/**
 * Prices answered questions that were asked before their model had a price, at the price set now. Never done on
 * its own: it is an estimate (the price then may have been different), so it is marked on each question and
 * counted in the report. Questions that already have a price are left exactly as they are.
 */
export async function backfillPrices(): Promise<{ questions: number; models: { model: string; questions: number }[] }> {
  const pricing = await getPricing();
  const models: { model: string; questions: number }[] = [];
  for (const entry of pricing.entries) {
    const result = await AssistantRun.updateMany(
      {
        state: 'completed',
        provider: entry.provider,
        model: entry.model,
        'price.inputPerMillion': { $exists: false }
      },
      {
        $set: {
          price: {
            currency: pricing.currency,
            inputPerMillion: entry.inputPerMillion,
            outputPerMillion: entry.outputPerMillion,
            source: entry.source,
            backfilled: true
          }
        }
      }
    );
    if (result.modifiedCount) models.push({ model: entry.model, questions: result.modifiedCount });
  }
  return { questions: models.reduce((sum, row) => sum + row.questions, 0), models };
}

interface Tally {
  questions: number;
  inputTokens: number;
  outputTokens: number;
  /** Money for the questions that had a price; null while none did. */
  cost: number | null;
  /** Questions with no price, which `cost` leaves out. */
  unpricedQuestions: number;
  /** Tokens of those questions. */
  unpricedTokens: number;
}
const empty = (): Tally => ({
  questions: 0,
  inputTokens: 0,
  outputTokens: 0,
  cost: null,
  unpricedQuestions: 0,
  unpricedTokens: 0
});

interface Row {
  questions: number;
  inputTokens: number;
  outputTokens: number;
  priced: boolean;
  cost: number;
}
function add(tally: Tally, row: Row) {
  tally.questions += row.questions;
  tally.inputTokens += row.inputTokens;
  tally.outputTokens += row.outputTokens;
  if (row.priced) tally.cost = (tally.cost ?? 0) + row.cost;
  else {
    tally.unpricedQuestions += row.questions;
    tally.unpricedTokens += row.inputTokens + row.outputTokens;
  }
}

export interface UsageReport {
  /** The window, in whole UTC days counting today. */
  days: number;
  since: string;
  /** The currency of the prices the questions were asked at, or MIXED where they differ and no total is possible. */
  currency: string;
  totals: Tally;
  /** Answers that failed or were interrupted: they may have used tokens the provider did not report. */
  failedQuestions: number;
  /** Questions priced afterwards at the price then current, not at the time they were asked. */
  backfilledQuestions: number;
  byDay: (Tally & { day: string })[];
  byModel: (Tally & {
    provider: string;
    model: string;
    /** The price a question asked now would be costed at; the one entered in the table. */
    price: PriceEntry | null;
    /** How many different prices the questions in the period were asked at. */
    pricesInPeriod: number;
  })[];
  byPerson: (Tally & { userId: string; name: string })[];
  /** Every price entered, including for models not used in the window, so the editor can send them back. */
  prices: PriceTable;
}

/**
 * What answered questions used in the last `days` UTC days, and what that cost. Each question is costed at the
 * price it was asked at, which was kept with it: a price that changes later changes what later questions cost,
 * never what these did. Only completed answers count, since only they report their tokens, and the cost is an
 * estimate from those counts and that price, not an invoice.
 */
export async function usageReport(days: number, now = new Date()): Promise<UsageReport> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const [rows, failedQuestions, prices] = await Promise.all([
    AssistantRun.aggregate<{
      _id: {
        day: string;
        userId: string;
        provider: string | null;
        model: string | null;
        currency?: string;
        inputPerMillion?: number;
        outputPerMillion?: number;
        backfilled?: boolean;
      };
      name: string;
      questions: number;
      inputTokens: number;
      outputTokens: number;
    }>([
      { $match: { state: 'completed', finishedAt: { $gte: since } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$finishedAt', timezone: 'UTC' } },
            userId: '$userId',
            provider: '$provider',
            model: '$model',
            currency: '$price.currency',
            inputPerMillion: '$price.inputPerMillion',
            outputPerMillion: '$price.outputPerMillion',
            backfilled: '$price.backfilled'
          },
          name: { $last: '$name' },
          questions: { $sum: 1 },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' }
        }
      }
    ]),
    AssistantRun.countDocuments({ state: 'failed', finishedAt: { $gte: since } }),
    getPricing()
  ]);

  // Prices in more than one currency cannot be added together, so then there is no money total at all.
  const currencies = new Set(rows.flatMap((row) => (row._id.currency ? [row._id.currency] : [])));
  const mixed = currencies.size > 1;
  const currency = mixed ? 'MIXED' : ([...currencies][0] ?? prices.currency);

  const totals = empty();
  let backfilledQuestions = 0;
  const byDay = new Map<string, Tally>();
  const byModel = new Map<string, Tally & { provider: string; model: string; seen: Set<string> }>();
  const byPerson = new Map<string, Tally & { name: string }>();
  for (const row of rows) {
    const provider = row._id.provider ?? 'unknown';
    const model = row._id.model ?? 'unknown';
    // A question with no price has no such fields at all, which a grouping leaves out rather than nulls.
    const asked = typeof row._id.inputPerMillion === 'number' && typeof row._id.outputPerMillion === 'number' && !mixed;
    const entry: Row = {
      questions: row.questions,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      priced: asked,
      cost: asked ? costOf(row._id.inputPerMillion!, row._id.outputPerMillion!, row.inputTokens, row.outputTokens) : 0
    };
    if (row._id.backfilled) backfilledQuestions += row.questions;
    add(totals, entry);
    add(byDay.get(row._id.day) ?? byDay.set(row._id.day, empty()).get(row._id.day)!, entry);
    const modelKey = `${provider}:${model}`;
    const modelTally =
      byModel.get(modelKey) ?? byModel.set(modelKey, { ...empty(), provider, model, seen: new Set() }).get(modelKey)!;
    add(modelTally, entry);
    if (typeof row._id.inputPerMillion === 'number')
      modelTally.seen.add(`${row._id.inputPerMillion}/${row._id.outputPerMillion}`);
    const person =
      byPerson.get(row._id.userId) ?? byPerson.set(row._id.userId, { ...empty(), name: row.name }).get(row._id.userId)!;
    person.name = row.name || person.name;
    add(person, entry);
  }

  const byCostThenUse = (a: Tally, b: Tally) =>
    (b.cost ?? 0) - (a.cost ?? 0) || b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);
  return {
    days,
    since: since.toISOString().slice(0, 10),
    currency,
    totals,
    failedQuestions,
    backfilledQuestions,
    // Oldest first, so a chart or list reads left to right.
    byDay: [...byDay].map(([day, tally]) => ({ day, ...tally })).sort((a, b) => a.day.localeCompare(b.day)),
    byModel: [...byModel.values()]
      .map(({ seen, ...tally }) => ({
        ...tally,
        price: priceOf(prices.entries, tally.provider, tally.model) ?? null,
        pricesInPeriod: seen.size
      }))
      .sort(byCostThenUse),
    byPerson: [...byPerson]
      .map(([userId, tally]) => ({ userId, ...tally }))
      .sort(byCostThenUse)
      .slice(0, 50),
    prices
  };
}
