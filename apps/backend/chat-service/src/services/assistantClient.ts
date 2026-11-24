import {
  BadGatewayError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  fetchWithTimeout,
  logger,
  requireEnv
} from '@visin/backend-core';

/**
 * How chat reaches the assistants, which are their own service (assistant-service). Every way is one call to its
 * internal API (`/api/assistant/internal`), authenticated by the shared internal token and never by a person's
 * session, and this is the only module that makes one: the rest of chat never imports or calls Vivi. What it merely
 * reads of Vivi's (names, runs, page calls) it reads from the collections themselves, through models/Assistant,
 * models/AssistantRun and models/ScreenCall.
 *
 * A refusal from the assistant service reaches the person as the same kind of error with its own message ("This
 * assistant is paused or removed"), so what a person is told does not depend on which service decided.
 */
const TIMEOUT_MS = 10_000;

const endpoint = () => requireEnv('ASSISTANT_INTERNAL_URL').replace(/\/$/, '');

function refused(status: number, message: string) {
  if (status === 400) return new BadRequestError(message);
  if (status === 403) return new ForbiddenError(message);
  if (status === 404) return new NotFoundError(message);
  if (status === 409) return new ConflictError(message);
  return new BadGatewayError(`assistant-service answered ${status}`);
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetchWithTimeout(`${endpoint()}/api/assistant/internal${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': requireEnv('INTERNAL_SERVICE_TOKEN') },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    timeoutMs: TIMEOUT_MS,
    serviceName: 'assistant-service'
  });
  const parsed = (await response.json().catch(() => null)) as { data?: T; message?: string } | null;
  if (!response.ok) throw refused(response.status, parsed?.message ?? 'The assistant service refused the request');
  return parsed?.data as T;
}

/** What a question to an assistant needs to be put to one: who asks, in which conversation, and what they said about their page. */
export interface QuestionInput {
  person: { id: string; email: string; name: string };
  conversationId: string;
  /** The assistant this private thread is bound to, if it already is. */
  assistantId?: string | null;
  /** The assistant a person named in a conversation between people. */
  invocation?: string;
  membershipVersion: number;
  /** What the person's chat panel says about its page; checked by the assistant service, never stored on the message. */
  screen?: unknown;
}

export interface PreparedQuestion {
  /** A private thread that had no assistant is to be bound to this one: chat does it, being the one to write the thread. */
  bindAssistantId?: string;
  /** The hidden request the message is saved with, for the worker to make a run of. */
  request: {
    userId: string;
    email: string;
    name: string;
    assistantId?: string;
    assistantName?: string;
    personality?: string;
    membershipVersion: number;
    screen?: Record<string, unknown>;
  };
}

/** Whether a message may be put to an assistant, which one, and the hidden request to save it with. Throws if not. */
export const prepare = (input: QuestionInput): Promise<PreparedQuestion> =>
  call('POST', '/questions/prepare', input);

/** The assistant a person means, or null: the named one if they may use it, else their default. */
export const resolve = (input: { userId: string; assistantId?: string }): Promise<{ id: string; name: string } | null> =>
  call('POST', '/assistants/resolve', input);

/** A person's open questions in a conversation are cancelled (it is being put away). */
export const cancelRuns = (input: { conversationId: string; userId: string }): Promise<void> =>
  call('POST', '/runs/cancel', input);

/** One question was unsent: whatever was made of it, and not yet published, is withdrawn. */
export const cancelMessageRuns = (input: { conversationId: string; messageId: string }): Promise<void> =>
  call('POST', '/runs/cancel-message', input);

export interface AssistantCapabilities {
  assistant: boolean;
  assistantModel: { provider: string; model: string; ready: boolean };
  canConfigure: boolean;
}

/** What the assistant service adds to the page's capabilities. Without it the page is told Vivi is not available. */
export async function capabilities(userId: string): Promise<AssistantCapabilities> {
  try {
    return await call('GET', `/capabilities?userId=${encodeURIComponent(userId)}`);
  } catch (error) {
    logger.warn('Could not read the assistant capabilities', {
      error: error instanceof Error ? error.message : 'unknown'
    });
    return { assistant: false, assistantModel: { provider: '', model: '', ready: false }, canConfigure: false };
  }
}
