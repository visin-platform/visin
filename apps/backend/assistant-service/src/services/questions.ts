import { BadRequestError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import { Assistant } from '../models/Assistant';
import { Conversation } from '../models/ChatConversation';
import { parsed } from '../validation/parse';
import { usableAssistant } from './assistantAvailability';
import { defaultAssistantFor } from './assistantService';
import { screenContextSchema } from './screen';
import { assistantStatus } from './settings';
import { requireSharedBot, sharedEnabled } from './sharedAssistants';

/**
 * What chat asks of Vivi when a person sends a question to an assistant. Chat stores the message; whether it may be
 * put to an assistant, and which one, is Vivi's to say, since it holds the assistants, their settings and the
 * deployment's state. Plain data in and out, because this is one internal call when Vivi is its own service.
 */
export interface QuestionInput {
  person: { id: string; email: string; name: string };
  conversationId: string;
  /** The assistant this private thread is bound to, if it already is. */
  assistantId?: string | null;
  /** The assistant a person named in a conversation between people. */
  invocation?: string;
  membershipVersion: number;
  /** What the person's chat panel says about its page; checked here, never stored on the message. */
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
    screen?: ReturnType<typeof screenContextSchema.parse>;
  };
}

export async function prepareQuestion(input: QuestionInput): Promise<PreparedQuestion> {
  const c = await Conversation.findOne({ _id: input.conversationId, deletedAt: null });
  if (!c) throw new NotFoundError('Conversation not found');
  // A quote never invokes a bot in a conversation between people.
  const sharedBot = input.invocation ? await requireSharedBot(c, input.invocation) : null;
  if (sharedBot && !sharedEnabled(c))
    throw new ForbiddenError('Shared assistants require agreement or administrator enablement');
  if ((c.kind === 'assistant' || sharedBot) && !(await assistantStatus()).ready)
    throw new BadRequestError('The assistant is not configured. Human messaging is available.');
  // Older generic analysis threads adopt the effective default on their next question.
  let assistantId = input.assistantId ?? undefined;
  let bindAssistantId: string | undefined;
  if (c.kind === 'assistant' && !assistantId) {
    const preferred = await defaultAssistantFor(input.person.id);
    if (preferred) assistantId = bindAssistantId = preferred.id;
  }
  const selected = assistantId ? await Assistant.findOne({ _id: assistantId, ...usableAssistant(input.person.id) }) : null;
  if (assistantId && !selected) throw new BadRequestError('This assistant is paused or removed');
  // Only a private thread has a page to move; a shared conversation never gets the screen tool.
  const screen = c.kind === 'assistant' && input.screen ? parsed(screenContextSchema, input.screen) : undefined;
  return {
    ...(bindAssistantId ? { bindAssistantId } : {}),
    request: {
      userId: input.person.id,
      email: input.person.email,
      name: input.person.name,
      assistantId: sharedBot?.assistantId || selected?.id,
      assistantName: sharedBot?.name || selected?.name,
      personality: sharedBot?.personality || selected?.personality,
      membershipVersion: input.membershipVersion,
      ...(screen ? { screen } : {})
    }
  };
}

/**
 * The assistant a person means: the one named if they may use it, otherwise the one they made their default (or the
 * platform's). Null when there is none, or the one named is paused, removed or not theirs to use.
 */
export async function resolveAssistant(input: {
  userId: string;
  assistantId?: string;
}): Promise<{ id: string; name: string } | null> {
  if (input.assistantId) {
    const bot = await Assistant.findOne({ _id: input.assistantId, ...usableAssistant(input.userId) }).select('name');
    return bot ? { id: bot.id, name: bot.name } : null;
  }
  const preferred = await defaultAssistantFor(input.userId);
  return preferred ? { id: preferred.id, name: preferred.name } : null;
}
