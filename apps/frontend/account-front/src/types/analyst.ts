export type AnalystProviderId = 'anthropic' | 'openai';

/**
 * A provider the analyst can use. Its key is saved here by an administrator; only whether there is one, and its
 * last characters, are ever returned.
 */
export interface AnalystProvider {
  id: AnalystProviderId;
  name: string;
  keyConfigured: boolean;
  keyHint: string | null;
}

export interface AnalystSettings {
  enabled: boolean;
  provider: AnalystProviderId;
  /** The provider's model id; empty until one is chosen. */
  model: string;
  /** Tokens one person may use a day, counting every question's reservation until its answer is in. */
  dailyTokenLimit: number;
  toolRounds: number;
  /** What one question reserves of that limit until its answer is in. The limit cannot be lower. */
  tokenReservation: number;
  tokensPerRound: number;
  minToolRounds: number;
  maxToolRounds: number;
  /** An administrator's saved choice, or the defaults until one is saved. */
  source: 'admin' | 'default';
  /** On, with a model, a key, and everything the server needs. */
  ready: boolean;
  /** Names of the server settings still missing that only its operator can add, never their values. */
  missing: string[];
  providers: AnalystProvider[];
}

/** A plain choice for people who do not know model names: the newest of each kind the provider offers. */
export type AnalystModelTier = 'best' | 'balanced' | 'fast';

export interface AnalystModel {
  id: string;
  name: string;
  /** Set on the model standing for its kind; the rest are only in the full list. */
  tier?: AnalystModelTier;
}

export interface AnalystModels {
  provider: AnalystProviderId;
  models: AnalystModel[];
  /** The model to start with, or null where the provider offers none of the usual kinds. */
  recommended: string | null;
  /** False when the provider's list could not be read, for instance because it has no key yet. */
  reachable: boolean;
}

export interface AnalystCapabilities {
  /** The analyst is on and ready to answer. */
  assistant: boolean;
  /** The viewer is a platform administrator and may change its settings. */
  canConfigure: boolean;
}

export interface AnalystSettingsUpdate {
  enabled: boolean;
  provider: AnalystProviderId;
  model: string;
  dailyTokenLimit: number;
  toolRounds: number;
}

/** What the provider charges for one model, in the deployment's currency, per million tokens. */
export interface AnalystPrice {
  provider: AnalystProviderId;
  model: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
  /** Typed by an administrator, which a refresh never overwrites, or fetched from the price list. */
  source: 'manual' | 'fetched';
  /** When a fetched price was fetched. */
  fetchedAt: string | null;
}

export interface AnalystPriceTable {
  /** A three-letter code, one for the whole deployment. */
  currency: string;
  entries: AnalystPrice[];
}

/** What a refresh did: which models it priced, and why it left any out. */
export interface AnalystPriceRefresh {
  updated: string[];
  /** The price list has no usable price for these. */
  notFound: string[];
  /** Typed by an administrator, so left alone. */
  keptManual: string[];
  fetchedAt: string;
}

export interface AnalystPriceRefreshResult extends AnalystPriceTable {
  refresh: AnalystPriceRefresh;
}

/** One slice of usage: tokens, and the money for those that have a price. */
export interface AnalystUsageTally {
  questions: number;
  inputTokens: number;
  outputTokens: number;
  /** Null while no question in the slice had a price. */
  cost: number | null;
  /** Questions with no price, which `cost` leaves out. */
  unpricedQuestions: number;
  /** Tokens of those questions. */
  unpricedTokens: number;
}

export interface AnalystUsage {
  performance?: {
    measuredQuestions: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    providerRequests: number;
    toolCalls: number;
    durationMs: number;
  };
  /** The window, in whole UTC days counting today. */
  days: number;
  /** Its first day, as YYYY-MM-DD. */
  since: string;
  /** The currency the questions were priced in, or MIXED where it differs, in which case there is no money total. */
  currency: string;
  totals: AnalystUsageTally;
  /** Answers that failed or were interrupted: they may have used tokens nobody reported, so they are not in the totals. */
  failedQuestions: number;
  /** Questions priced afterwards, at the price then current rather than when they were asked. */
  backfilledQuestions: number;
  byDay: (AnalystUsageTally & { day: string })[];
  byModel: (AnalystUsageTally & {
    provider: string;
    model: string;
    /** What a question asked now is costed at; the price in the table. */
    price: AnalystPrice | null;
    /** How many different prices the questions of this model in the period were asked at. */
    pricesInPeriod: number;
  })[];
  byPerson: (AnalystUsageTally & { userId: string; name: string })[];
  /** Every price entered, including for models not used in the window. */
  prices: AnalystPriceTable;
}

/** What pricing earlier questions did. */
export interface AnalystBackfillResult {
  questions: number;
  models: { model: string; questions: number }[];
}
