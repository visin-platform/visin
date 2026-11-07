import { BadGatewayError, BadRequestError, isEncryptionConfigured, logger } from '@visin/backend-core';
import { reservationFor, TOKENS_PER_ROUND, MIN_TOOL_ROUNDS, MAX_TOOL_ROUNDS } from './analysisLimits';
import { removeProviderKey, saveProviderKey } from './keys';
import { refreshPrices } from './priceList';
import { ADAPTERS, PROVIDERS } from './providers';
import {
  assistantSettings,
  assistantStatus,
  forgetProviderModels,
  providerCatalog,
  providerModelChoices,
  providerModels,
  saveAssistantSettings
} from './settings';
import { backfillPrices, getPricing, savePricing, usageReport } from './usage';
import { parsed } from '../validation/parse';

import {
  keyParamsSchema,
  keySchema,
  modelsQuerySchema,
  pricesSchema,
  settingsSchema,
  usageQuerySchema
} from '../validation/assistantAdminSchemas';

const settingsView = async () => {
  const { settings, missing, ready } = await assistantStatus();
  return {
    enabled: settings.enabled,
    provider: settings.provider,
    model: settings.model,
    dailyTokenLimit: settings.dailyTokenLimit,
    // What one question reserves of that limit until its answer is in, so the page can say how far it goes.
    toolRounds: settings.toolRounds,
    minToolRounds: MIN_TOOL_ROUNDS,
    maxToolRounds: MAX_TOOL_ROUNDS,
    tokensPerRound: TOKENS_PER_ROUND,
    tokenReservation: reservationFor(true, settings.toolRounds),
    source: settings.source,
    ready,
    missing,
    providers: await providerCatalog()
  };
};
export async function getSettings() {
  return await settingsView();
}

export async function listModels(query: unknown) {
  const { provider = (await assistantSettings()).provider } = parsed(modelsQuerySchema, query);
  const choices = await providerModelChoices(provider);
  return {
    provider,
    models: choices?.models ?? [],
    recommended: choices?.recommended ?? null,
    reachable: choices !== null
  };
}

export async function updateSettings(userId: string, body: unknown) {
  const input = parsed(settingsSchema, body);
  if (input.enabled && !input.model) throw new BadRequestError('Choose a model before turning the analyst on');
  // Only what is being turned on is held to the provider's list: switching off must always work, whatever
  // an earlier choice was and whether the provider is reachable.
  if (input.enabled) {
    const { name } = PROVIDERS[input.provider];
    const offered = await providerModels(input.provider);
    if (!offered) throw new BadRequestError(`${name}'s models could not be listed. Add a valid ${name} key first.`);
    if (!offered.some((model) => model.id === input.model))
      throw new BadRequestError(`${name} does not offer ${input.model}`);
  }
  const current = await assistantSettings();
  const dailyTokenLimit = input.dailyTokenLimit ?? current.dailyTokenLimit;
  const toolRounds = input.toolRounds ?? current.toolRounds;
  const reservation = reservationFor(true, toolRounds);
  // A question reserves its worst case up front, so a limit below one question would refuse every one.
  if (dailyTokenLimit < reservation)
    throw new BadRequestError(
      `The daily limit must be at least ${reservation.toLocaleString('en-US')} tokens: one question reserves that much`
    );
  await saveAssistantSettings({ ...input, dailyTokenLimit, toolRounds }, userId);
  logger.info('Assistant settings changed', { by: userId, ...input, dailyTokenLimit });
  return await settingsView();
}

export async function getUsage(query: unknown) {
  const { days } = parsed(usageQuerySchema, query);
  return await usageReport(days);
}

export async function updatePrices(userId: string, body: unknown) {
  const prices = parsed(pricesSchema, body);
  const seen = new Set<string>();
  for (const entry of prices.entries) {
    const key = `${entry.provider}:${entry.model}`;
    if (seen.has(key)) throw new BadRequestError(`${entry.model} is priced twice`);
    seen.add(key);
  }
  await savePricing(prices, userId);
  logger.info('Assistant prices changed', {
    by: userId,
    currency: prices.currency,
    models: prices.entries.length
  });
  return await getPricing();
}

export async function backfillQuestionPrices(userId: string) {
  const result = await backfillPrices();
  logger.info('Assistant questions priced afterwards', { by: userId, questions: result.questions });
  return result;
}

export async function refreshModelPrices(userId: string) {
  return await refreshPrices(userId);
}

export async function saveKey(userId: string, params: unknown, body: unknown) {
  const { provider } = parsed(keyParamsSchema, params);
  const { key } = parsed(keySchema, body);
  const { name } = PROVIDERS[provider];
  if (!isEncryptionConfigured())
    throw new BadRequestError('API_KEY_ENCRYPTION_SECRET must be set on the server before keys can be saved here');
  // A key is only kept once the provider has accepted it: listing models is a free request that needs it.
  let offered;
  try {
    offered = await ADAPTERS[provider].listModels(key);
  } catch {
    throw new BadGatewayError(`Could not reach ${name} to check the key. Try again.`);
  }
  if (!offered) throw new BadRequestError(`${name} did not accept this key`);
  await saveProviderKey(provider, key, userId);
  forgetProviderModels(provider);
  // Who and which provider, never the key.
  logger.info('Assistant key saved', { by: userId, provider });
  return await settingsView();
}

export async function deleteKey(userId: string, params: unknown) {
  const { provider } = parsed(keyParamsSchema, params);
  await removeProviderKey(provider);
  forgetProviderModels(provider);
  logger.info('Assistant key removed', { by: userId, provider });
  return await settingsView();
}
