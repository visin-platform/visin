/**
 * A conversation that still exists for people. A private analysis chat is one per person and assistant, held by its
 * `bindingKey`; one without it is from before that and is no longer shown or read. Nothing is removed from the database.
 */
export const liveConversation = { deletedAt: null, $nor: [{ kind: 'assistant' as const, bindingKey: null }] };
export const assistantBinding = (assistantId: string | undefined | null, userId: string) =>
  `assistant:${assistantId || 'default'}:${userId}`;
