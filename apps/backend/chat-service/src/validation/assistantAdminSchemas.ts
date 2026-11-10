import { MIN_TOOL_ROUNDS, MAX_TOOL_ROUNDS } from '../services/analysisLimits';
import { z } from 'zod';
import { PROVIDER_IDS } from '../services/providers';
import { MAX_DAILY_TOKEN_LIMIT } from '../services/settings';

export const settingsSchema = z
  .object({
    enabled: z.boolean(),
    revision: z.number().int().min(0).optional(),
    toolRounds: z.number().int().min(MIN_TOOL_ROUNDS).max(MAX_TOOL_ROUNDS).optional(),
    provider: z.enum(PROVIDER_IDS),
    // Chosen from the provider's own list, which is checked below; empty only while turning it off.
    model: z.string().trim().max(120),
    // Tokens a person may use a day. Left out, it stays as it is; its lower bound is checked below.
    dailyTokenLimit: z.number().int().max(MAX_DAILY_TOKEN_LIMIT, 'That limit is too large').optional()
  })
  .strict();

export const keySchema = z
  .object({
    // Not echoed back in any error: the messages are fixed.
    key: z
      .string()
      .trim()
      .min(8, 'That does not look like an API key')
      .max(500, 'That does not look like an API key')
      .regex(/^\S+$/, 'That does not look like an API key')
  })
  .strict();

export const usageQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export const pricesSchema = z
  .object({
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, such as USD'),
    entries: z
      .array(
        z
          .object({
            provider: z.enum(PROVIDER_IDS),
            model: z.string().trim().min(1).max(120),
            // Per million tokens: a ceiling that no real price reaches, so a slipped decimal point is caught.
            inputPerMillion: z.number().min(0).max(100000),
            outputPerMillion: z.number().min(0).max(100000),
            cacheReadPerMillion: z.number().min(0).max(100000).optional(),
            cacheWritePerMillion: z.number().min(0).max(100000).optional(),
            // Sent back as received, so a fetched price stays marked as fetched until it is edited by hand.
            source: z.enum(['manual', 'fetched']).default('manual'),
            fetchedAt: z.string().datetime().nullable().default(null)
          })
          .strict()
      )
      .max(200)
  })
  .strict();

export const keyParamsSchema = z.object({ provider: z.enum(PROVIDER_IDS) });

export const modelsQuerySchema = z.object({ provider: z.enum(PROVIDER_IDS).optional() });
