import { fitProviderContext } from './providerContext';
import { fetchWithTimeout } from '@visin/backend-core';

/**
 * The assistant providers an administrator can choose between. Each speaks its own request and
 * answer format; everything above this file (the analyst loop, the settings) sees the one shape below.
 * A provider's key is saved by an administrator in the page and kept encrypted (services/keys.ts); it is never
 * read from the environment.
 */
export const PROVIDERS = {
  anthropic: { name: 'Anthropic' },
  openai: { name: 'OpenAI' }
} as const;
export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as [ProviderId, ...ProviderId[]];
export const isProviderId = (value: unknown): value is ProviderId => typeof value === 'string' && value in PROVIDERS;

const ANTHROPIC_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2026-10-21';
const OPENAI_URL = 'https://api.openai.com/v1';

// One turn is at most ROUNDS requests. Each request's UTF-8 bytes bound its input tokens from above,
// so ROUNDS * (MAX_REQUEST_BYTES + MAX_OUTPUT_TOKENS) stays within the analyst's token reservation.
export const MAX_REQUEST_BYTES = 34000;
// Reasoning counts toward the limit on current models, so a small cap leaves little room for the answer.
export const MAX_OUTPUT_TOKENS = 6000;

export interface ToolSpec {
  name: string;
  description?: string;
  schema: unknown;
}
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ToolOutput {
  id: string;
  content: string;
  isError: boolean;
}
export interface Turn {
  text: string;
  calls: ToolCall[];
  /** Why the model stopped: an answer, a request for tools, the output limit, or a refusal. */
  stop: 'done' | 'length' | 'refused';
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** The model's own message, to be sent back as it was when tool results follow. */
  assistant: unknown;
}
/** A plain-language choice for people who do not know model names: the newest of each kind a provider offers. */
export type ModelTier = 'best' | 'balanced' | 'fast';

export interface ProviderModel {
  id: string;
  name: string;
  /** Set on the one model that stands for its kind; the rest are only in the full list. */
  tier?: ModelTier;
}

/**
 * How each provider's families map to the plain choices. Lists come newest first, so the first match of each
 * kind is the current one. Dated snapshots and previews never stand for a kind: they are pinned or unfinished.
 */
const TIERS: Record<ProviderId, { tier: ModelTier; match: RegExp }[]> = {
  anthropic: [
    { tier: 'best', match: /opus/ },
    { tier: 'balanced', match: /sonnet/ },
    { tier: 'fast', match: /haiku/ }
  ],
  openai: [
    // The flagship (gpt-5.1, gpt-4o), and its small sibling; reasoning (o-series) models stay in the full list.
    { tier: 'best', match: /^gpt-[\d.]+o?$/ },
    { tier: 'fast', match: /^gpt-[\d.]+o?-mini$/ }
  ]
};
const PINNED = /-\d{4}-?\d{2}-?\d{2}$|-\d{8}$|preview/;
/** What a newcomer should start with: balanced where a provider has it, else its best. */
const RECOMMENDED_ORDER: ModelTier[] = ['balanced', 'best', 'fast'];

/** The list with the model standing for each kind marked, and which of them to start with. */
export function withTiers(
  provider: ProviderId,
  list: ProviderModel[]
): { models: ProviderModel[]; recommended: string | null } {
  const chosen = new Map<ModelTier, string>();
  for (const { tier, match } of TIERS[provider]) {
    const model = list.find((candidate) => match.test(candidate.id) && !PINNED.test(candidate.id));
    if (model) chosen.set(tier, model.id);
  }
  const tierOf = new Map([...chosen].map(([tier, id]) => [id, tier] as const));
  const recommendedTier = RECOMMENDED_ORDER.find((tier) => chosen.has(tier));
  return {
    models: list.map((model) => {
      const tier = tierOf.get(model.id);
      return tier ? { ...model, tier } : { id: model.id, name: model.name };
    }),
    recommended: recommendedTier ? chosen.get(recommendedTier)! : null
  };
}

export interface ProviderAdapter {
  /** Provider-native tool data, kept below application instructions. */
  context(content: string): unknown[];
  send(request: {
    /** The provider's key, resolved when the run started. */
    apiKey: string;
    model: string;
    system: string;
    messages: unknown[];
    tools: ToolSpec[];
    signal: AbortSignal;
  }): Promise<Turn>;
  /** The messages that carry tool results back, after the model's own message. */
  toolResults(outputs: ToolOutput[]): unknown[];
  /** The chat models the key can use, newest first. Null where they cannot be listed. */
  listModels(key: string): Promise<ProviderModel[] | null>;
}

function withinLimit(payload: string): string {
  payload = fitProviderContext(payload, MAX_REQUEST_BYTES);
  // UTF-8 bytes bound token input conservatively, including schemas and system text.
  if (Buffer.byteLength(payload, 'utf8') > MAX_REQUEST_BYTES)
    throw new Error('The results needed are too large for one answer. Ask a narrower question.');
  return payload;
}
/** Only the status: the body of a refusal can echo what was sent, or a key. */
function unavailable(status: number): Error {
  return new Error(`Assistant provider unavailable (${status}). Try again later.`);
}

/** Missing/invalid usage cannot become a free completed answer in the budget or spend report. */
function tokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('The assistant provider did not report valid token usage');
  return value;
}

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

const anthropic: ProviderAdapter = {
  context(content) {
    return [
      { role: 'user', content: 'Read the application context for the next question.' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'visin_context', name: 'get_screen_context', input: {} }]
      },
      ...this.toolResults([{ id: 'visin_context', content, isError: false }])
    ];
  },
  async send({ apiKey, model, system, messages, tools, signal }) {
    const payload = withinLimit(
      JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: '5m' } }],
        messages,
        ...(tools.length
          ? {
              tools: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.schema
              }))
            }
          : {})
      })
    );
    const response = await fetchWithTimeout(`${ANTHROPIC_URL}/messages`, {
      method: 'POST',
      serviceName: 'assistant-provider',
      timeoutMs: 60000,
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: payload
    });
    if (!response.ok) throw unavailable(response.status);
    const result = (await response.json()) as {
      content: AnthropicBlock[];
      stop_reason: string;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };
    return {
      text: result.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text || '')
        .join('\n')
        .trim(),
      calls: result.content
        .filter((block) => block.type === 'tool_use')
        .map((block) => ({ id: block.id || '', name: block.name || '', input: block.input || {} })),
      stop: result.stop_reason === 'refusal' ? 'refused' : result.stop_reason === 'max_tokens' ? 'length' : 'done',
      inputTokens:
        tokenCount(result.usage.input_tokens) +
        tokenCount(result.usage.cache_read_input_tokens ?? 0) +
        tokenCount(result.usage.cache_creation_input_tokens ?? 0),
      cacheReadTokens: tokenCount(result.usage.cache_read_input_tokens ?? 0),
      cacheWriteTokens: tokenCount(result.usage.cache_creation_input_tokens ?? 0),
      outputTokens: tokenCount(result.usage.output_tokens),
      assistant: { role: 'assistant', content: result.content }
    };
  },
  toolResults: (outputs) => [
    {
      role: 'user',
      content: outputs.map((output) => ({
        type: 'tool_result',
        tool_use_id: output.id,
        content: output.content,
        is_error: output.isError
      }))
    }
  ],
  async listModels(key) {
    const response = await fetchWithTimeout(`${ANTHROPIC_URL}/models?limit=1000`, {
      timeoutMs: 10000,
      serviceName: 'assistant-provider',
      headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION }
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { id?: unknown; display_name?: unknown }[] };
    // The list is newest first already.
    return (body.data ?? [])
      .filter((model): model is { id: string; display_name?: unknown } => typeof model.id === 'string')
      .filter((model) => model.id.startsWith('claude-'))
      .map((model) => ({ id: model.id, name: typeof model.display_name === 'string' ? model.display_name : model.id }));
  }
};

interface OpenAiToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

/** The model's arguments arrive as text and are its own to get wrong. */
function parseArguments(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = text.trim() ? JSON.parse(text) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Falls through to the same error.
  }
  throw new Error('The assistant sent unreadable tool arguments. Try the question again.');
}

/**
 * OpenAI's list has every model it serves: embeddings, speech, images, moderation. It does not say which
 * answer chat requests, so the others are recognised by name; one that slips through fails with the
 * provider's own message when a question is asked.
 */
const OPENAI_CHAT = /^(gpt-|chatgpt-|o\d)/;
const OPENAI_OTHER = /(audio|realtime|transcribe|tts|image|embedding|moderation|search|instruct|codex|davinci|babbage)/;

const openai: ProviderAdapter = {
  context(content) {
    return [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'visin_context', type: 'function', function: { name: 'get_screen_context', arguments: '{}' } }
        ]
      },
      ...this.toolResults([{ id: 'visin_context', content, isError: false }])
    ];
  },
  async send({ apiKey, model, system, messages, tools, signal }) {
    const payload = withinLimit(
      JSON.stringify({
        model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'system', content: system }, ...messages],
        ...(tools.length
          ? {
              tools: tools.map((tool) => ({
                type: 'function',
                function: { name: tool.name, description: tool.description, parameters: tool.schema }
              }))
            }
          : {})
      })
    );
    const response = await fetchWithTimeout(`${OPENAI_URL}/chat/completions`, {
      method: 'POST',
      serviceName: 'assistant-provider',
      timeoutMs: 60000,
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: payload
    });
    if (!response.ok) throw unavailable(response.status);
    const result = (await response.json()) as {
      choices?: {
        finish_reason?: string;
        message?: { content?: string | null; refusal?: string | null; tool_calls?: OpenAiToolCall[] };
      }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
      };
    };
    const choice = result.choices?.[0];
    const message = choice?.message;
    if (!message) throw new Error('The assistant returned no answer');
    const toolCalls = (message.tool_calls ?? []).filter((call) => call.type === 'function');
    return {
      text: (message.content ?? '').trim(),
      calls: toolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        input: parseArguments(call.function.arguments)
      })),
      stop:
        message.refusal || choice?.finish_reason === 'content_filter'
          ? 'refused'
          : choice?.finish_reason === 'length'
            ? 'length'
            : 'done',
      inputTokens: tokenCount(result.usage?.prompt_tokens),
      cacheReadTokens: tokenCount(result.usage?.prompt_tokens_details?.cached_tokens ?? 0),
      cacheWriteTokens: tokenCount(result.usage?.prompt_tokens_details?.cache_write_tokens ?? 0),
      outputTokens: tokenCount(result.usage?.completion_tokens),
      assistant: {
        role: 'assistant',
        content: message.content ?? null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {})
      }
    };
  },
  // The API has no error flag on a tool's answer, so a failure says so in its text.
  toolResults: (outputs) =>
    outputs.map((output) => ({
      role: 'tool',
      tool_call_id: output.id,
      content: output.isError ? `Error: ${output.content}` : output.content
    })),
  async listModels(key) {
    const response = await fetchWithTimeout(`${OPENAI_URL}/models`, {
      timeoutMs: 10000,
      serviceName: 'assistant-provider',
      headers: { authorization: `Bearer ${key}` }
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { id?: unknown; created?: unknown }[] };
    return (body.data ?? [])
      .filter((model): model is { id: string; created?: unknown } => typeof model.id === 'string')
      .filter((model) => OPENAI_CHAT.test(model.id) && !OPENAI_OTHER.test(model.id))
      .sort((a, b) => (Number(b.created) || 0) - (Number(a.created) || 0))
      .map((model) => ({ id: model.id, name: model.id }));
  }
};

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = { anthropic, openai };
