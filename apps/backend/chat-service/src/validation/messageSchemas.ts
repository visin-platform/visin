import { z } from 'zod';
import { id } from './commonSchemas';

export const sendSchema = z
  .object({
    body: z.string().trim().min(1).max(8000),
    clientId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
    replyTo: id.optional(),
    assistantId: id.optional()
  })
  .strict();

export const saveFindingSchema = z
  .object({
    messageId: id,
    title: z.string().trim().min(1).max(200),
    body: z.string().min(1).max(20000),
    recommendations: z.string().max(5000).optional()
  })
  .strict();

export const messageCursorSchema = z.coerce.number().int().positive();
export const streamCursorSchema = z.coerce.number().int().min(0);
export const readSequenceSchema = (maxSeq: number) => z.number().int().min(0).max(maxSeq);
