import { z } from 'zod';

/** What chat sends to the internal API. Plain data, checked here as chat's own requests are checked there. */
const id = z.string().min(1).max(120);

export const prepareQuestionSchema = z.strictObject({
  person: z.strictObject({ id, email: z.string().max(320), name: z.string().min(1).max(200) }),
  conversationId: id,
  assistantId: id.nullish(),
  invocation: id.optional(),
  membershipVersion: z.number().int().min(0),
  // The page's context; its shape is checked when the question is prepared, as it was when it was Vivi's own schema.
  screen: z.unknown().optional()
});

export const resolveAssistantSchema = z.strictObject({ userId: id, assistantId: id.optional() });
export const cancelRunsSchema = z.strictObject({ conversationId: id, userId: id });
export const cancelMessageRunsSchema = z.strictObject({ conversationId: id, messageId: id });
export const capabilitiesQuerySchema = z.strictObject({ userId: id });
