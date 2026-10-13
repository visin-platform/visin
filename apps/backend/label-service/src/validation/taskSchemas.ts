import { z } from '@visin/backend-core';
import { OBJECT_SOURCES } from '../models/LabelAnnotation';

/** A frame is never expected to hold more than this many boxes; past it a request is a mistake. */
export const MAX_OBJECTS_PER_FRAME = 2000;

export const nextBodySchema = z.object({
  // Tasks the client already holds leases on (current + prefetched).
  excludeTaskIds: z.array(z.string().regex(/^[0-9a-f]{24}$/i)).max(10).default([])
});

// A path position, so it arrives as a string and needs coercing.
export const taskAtParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/i),
  index: z.coerce.number().int().min(0)
});

const finite = z.number().refine(Number.isFinite, 'must be a finite number');

export const boxObjectSchema = z.object({
  id: z.string().trim().min(1).max(64),
  classKey: z.string().trim().min(1).max(40),
  /** `[x, y, width, height]` in the frame's pixels; clamped to the frame by the server */
  bbox: z.tuple([finite, finite, finite, finite]),
  source: z.enum(OBJECT_SOURCES).default('human'),
  score: z.number().min(0).max(1).optional()
});

export const saveAnnotationBodySchema = z.object({
  objects: z.array(boxObjectSchema).max(MAX_OBJECTS_PER_FRAME),
  elapsedMs: z.number().int().min(0).optional()
});

export type SaveAnnotationBody = z.infer<typeof saveAnnotationBodySchema>;

export const finishBodySchema = z.object({
  elapsedMs: z.number().int().min(0).optional()
});

export type FinishBody = z.infer<typeof finishBodySchema>;
