import { z } from '@visin/backend-core';

export const nextBodySchema = z.object({
  // Tasks the client already holds leases on (current + prefetched).
  excludeTaskIds: z.array(z.string().regex(/^[0-9a-f]{24}$/i)).max(10).default([])
});

// A path position, so it arrives as a string and needs coercing.
export const taskAtParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/i),
  index: z.coerce.number().int().min(0)
});

export const answerBodySchema = z
  .object({
    choiceKey: z.string().trim().min(1).optional(),
    rejectedMaskIds: z.array(z.number().int().min(0)).optional(),
    elapsedMs: z.number().int().min(0).optional()
  })
  .refine((body) => body.choiceKey != null || body.rejectedMaskIds != null, {
    message: 'Provide choiceKey (single_choice) or rejectedMaskIds (mask_toggle)'
  });

export type AnswerBody = z.infer<typeof answerBodySchema>;
