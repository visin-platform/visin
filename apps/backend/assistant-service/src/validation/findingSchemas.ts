import { z } from 'zod';
import { id } from './commonSchemas';

export const saveFindingSchema = z
  .object({
    messageId: id,
    title: z.string().trim().min(1).max(200),
    body: z.string().min(1).max(20000),
    recommendations: z.string().max(5000).optional()
  })
  .strict();
