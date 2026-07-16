import { z } from '@visin/backend-core';

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
