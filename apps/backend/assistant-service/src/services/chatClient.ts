import {
  BadGatewayError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  fetchWithTimeout,
  requireEnv
} from '@visin/backend-core';

/**
 * Everything this service asks of chat, in one place: the only ways it changes chat's data. What it reads of chat's
 * (conversations and messages, who may see them) it reads from the same collections through its own read-only models
 * (models/ChatConversation, models/ChatMessage, services/access). Each function here is one call to chat's internal API
 * (`/api/chat/internal/assistant`), authenticated by the shared internal token and never by a person's session, with
 * the same name and shape the in-process function had before the assistants were their own service.
 */
const TIMEOUT_MS = 10_000;

/** An error chat answered with, as the same kind of error here, so it reaches the person with its own status. */
function refused(status: number, message: string) {
  if (status === 400) return new BadRequestError(message);
  if (status === 403) return new ForbiddenError(message);
  if (status === 404) return new NotFoundError(message);
  if (status === 409) return new ConflictError(message);
  return new BadGatewayError(`chat-service answered ${status}`);
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchWithTimeout(`${requireEnv('CHAT_INTERNAL_URL').replace(/\/$/, '')}/api/chat/internal/assistant${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': requireEnv('INTERNAL_SERVICE_TOKEN') },
    body: JSON.stringify(body),
    timeoutMs: TIMEOUT_MS,
    serviceName: 'chat-service'
  });
  const parsed = (await response.json().catch(() => null)) as { data?: T; message?: string } | null;
  if (!response.ok) throw refused(response.status, parsed?.message ?? 'chat-service refused the request');
  return parsed?.data as T;
}

/** What a message published for an assistant is made of. Chat takes only these. */
export interface AppendedMessage {
  /** The membership version the answer was made against; chat refuses it if the conversation has moved on. */
  expectedMembershipVersion?: number;
  conversationId: string;
  senderId: string;
  senderName: string;
  kind: 'assistant' | 'system';
  body: string;
  /** Makes publishing idempotent: the same one twice is the same message. */
  clientId: string;
  replyTo?: string;
  evidence?: { tool: string; input: unknown; at: Date }[];
  thoughts?: { text: string; at: Date }[];
}

/** Publishes an answer, or a line saying what changed, in a conversation. */
export async function appendMessage(input: AppendedMessage): Promise<{ id: string }> {
  return call('/messages', input);
}

/** A question to an assistant is selected by one of these. */
export type RequestSelector =
  | { messageId: string }
  /** A person's open questions in one conversation (and the named messages, whose runs are still going). */
  | { conversationId: string; senderId: string; messageIds: string[] }
  /** Every pending question for one assistant, when it is paused or removed. */
  | { assistantId: string };

/** Takes a question back before it is answered: its hidden request is removed and it is marked cancelled. */
export async function cancelRequests(selector: RequestSelector): Promise<void> {
  await call('/messages/cancel-requests', selector);
}

/** The worker has made a run of the question, so the hidden request is done with. */
export async function ackRequest(messageId: string): Promise<void> {
  await call(`/messages/${encodeURIComponent(messageId)}/ack`, {});
}

/** An answer was saved as a finding: the message remembers which. */
export async function setMessageFinding(messageId: string, findingId: string): Promise<void> {
  await call(`/messages/${encodeURIComponent(messageId)}/finding`, { findingId });
}

/**
 * The runs an assistant chose to compare, kept with the person's private chat so its page shows them. False when the
 * chat is gone or the person is no longer in it.
 */
export async function setConversationContext(input: {
  conversationId: string;
  userId: string;
  trainingIds: string[];
  trainingLabels: { id: string; name: string }[];
}): Promise<boolean> {
  const { conversationId, ...rest } = input;
  return (await call<{ updated: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/context`, rest)).updated;
}

/** The shared-assistant state a change makes of a conversation: which bots are in it, and its policy and consents. */
export interface SharedAssistantsState {
  botIds: string[];
  policy: {
    enabled: boolean;
    lockedOff: boolean;
    whoCanAdd?: 'everyone' | 'admins';
    consents: { userId: string; audience: string }[];
  };
}

/**
 * Saves a change to a conversation's shared assistants as a new membership version, only when the conversation is
 * still at the version the change was made on; otherwise null, and nothing is written.
 */
export async function saveSharedAssistants(
  input: SharedAssistantsState & {
    conversationId: string;
    expectedVersion: number;
    /** The line telling the members what changed, written by chat with the change. */
    announce?: { senderId: string; senderName: string; body: string };
  }
): Promise<{ membershipVersion: number } | null> {
  const { conversationId, ...rest } = input;
  return (await call<{ saved: { membershipVersion: number } | null }>(
    `/conversations/${encodeURIComponent(conversationId)}/shared-assistants`,
    rest
  )).saved;
}
