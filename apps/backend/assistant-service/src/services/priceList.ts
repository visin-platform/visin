import { BadGatewayError, BadRequestError, fetchWithTimeout, logger } from '@visin/backend-core';
import { PROVIDER_IDS, type ProviderId } from './providers';
import { getPricing, modelsUsed, savePricing, type PriceEntry } from './usage';

/**
 * Where prices come from when an administrator asks for a refresh: LiteLLM's community-kept price list, the one
 * public source covering both providers, since neither provider's API returns a price. The address is fixed here,
 * not configurable.
 */
const PRICE_LIST_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
/** The list is a few MB; anything past this is not it. */
const MAX_BYTES = 20 * 1024 * 1024;
/** Its prices are in dollars. */
const LIST_CURRENCY = 'USD';
/** No real price per million tokens reaches this, so a value past it is a mistake in the list, not a price. */
const MAX_PER_MILLION = 100000;

interface ListEntry {
  litellm_provider?: unknown;
  input_cost_per_token?: unknown;
  output_cost_per_token?: unknown;
}

const perMillion = (perToken: unknown): number | null => {
  if (typeof perToken !== 'number' || !Number.isFinite(perToken) || perToken < 0) return null;
  // 1e-07 * 1e6 is 0.09999999999999999: ten digits is far past any price and clears that.
  const value = Number((perToken * 1_000_000).toPrecision(10));
  return value <= MAX_PER_MILLION ? value : null;
};

export interface RefreshResult {
  currency: string;
  entries: PriceEntry[];
  refresh: {
    /** Models whose fetched price was set or updated. */
    updated: string[];
    /** Models the list has no usable price for. */
    notFound: string[];
    /** Models left alone because an administrator typed their price. */
    keptManual: string[];
    fetchedAt: string;
  };
}

/** The list's price for a model of this provider, or null when it is absent, of another provider, or not a price. */
function lookup(list: Record<string, ListEntry>, provider: ProviderId, model: string) {
  for (const key of [model, `${provider}/${model}`]) {
    const entry = list[key];
    if (!entry || typeof entry !== 'object' || entry.litellm_provider !== provider) continue;
    const input = perMillion(entry.input_cost_per_token);
    const output = perMillion(entry.output_cost_per_token);
    if (input !== null && output !== null) return { input, output };
  }
  return null;
}

/**
 * Fetches the price list and sets a fetched price for every model that has answered a question, and every model
 * already in the table as fetched. A price an administrator typed is never touched. Nothing is changed unless the
 * list was read in full, so a failed fetch leaves the last prices as they were.
 */
export async function refreshPrices(userId: string): Promise<RefreshResult> {
  const pricing = await getPricing();
  if (pricing.currency !== LIST_CURRENCY)
    throw new BadRequestError(
      `The price list is in ${LIST_CURRENCY}, and prices here are in ${pricing.currency}. Switch the currency to ${LIST_CURRENCY}, or enter prices by hand.`
    );

  let list: Record<string, ListEntry>;
  try {
    const response = await fetchWithTimeout(PRICE_LIST_URL, { timeoutMs: 30000, serviceName: 'price-list' });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('too large');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not a price list');
    list = body as Record<string, ListEntry>;
  } catch (error) {
    logger.warn('Could not fetch the price list', { error: error instanceof Error ? error.message : 'Unknown' });
    throw new BadGatewayError('The price list could not be fetched. The prices are as they were. Try again later.');
  }

  const fetchedAt = new Date().toISOString();
  const entries = [...pricing.entries];
  const wanted = new Map<string, { provider: ProviderId; model: string }>();
  for (const { provider, model } of await modelsUsed()) {
    if ((PROVIDER_IDS as string[]).includes(provider))
      wanted.set(`${provider}:${model}`, { provider: provider as ProviderId, model });
  }
  for (const entry of entries)
    wanted.set(`${entry.provider}:${entry.model}`, { provider: entry.provider, model: entry.model });

  const refresh: RefreshResult['refresh'] = { updated: [], notFound: [], keptManual: [], fetchedAt };
  for (const { provider, model } of wanted.values()) {
    const index = entries.findIndex((entry) => entry.provider === provider && entry.model === model);
    if (index >= 0 && entries[index].source === 'manual') {
      refresh.keptManual.push(model);
      continue;
    }
    const found = lookup(list, provider, model);
    if (!found) {
      refresh.notFound.push(model);
      continue;
    }
    const entry: PriceEntry = {
      provider,
      model,
      inputPerMillion: found.input,
      outputPerMillion: found.output,
      source: 'fetched',
      fetchedAt
    };
    if (index >= 0) entries[index] = entry;
    else entries.push(entry);
    refresh.updated.push(model);
  }

  await savePricing({ currency: pricing.currency, entries }, userId);
  logger.info('Assistant prices refreshed', { by: userId, updated: refresh.updated.length });
  return { currency: pricing.currency, entries, refresh };
}
