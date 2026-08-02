import { z } from '@visin/backend-core';
import { TASK_TYPES } from '../models/LabelJob';

const choiceSchema = z.object({
  key: z.string().trim().min(1, 'key required'),
  label: z.string().trim().min(1, 'label required'),
  hotkey: z.string().trim().length(1).optional()
});

export const createJobBodySchema = z.object({
  name: z.string().trim().min(1, 'name required').max(120),
  description: z.string().trim().max(1000).optional(),
  groupId: z.string().trim().min(1, 'groupId required'),
  bundleId: z.string().trim().min(1).optional(),
  taskType: z.enum(TASK_TYPES),
  question: z.object({
    prompt: z.string().trim().min(1, 'prompt required').max(500),
    choices: z.array(choiceSchema).min(2).optional()
  }),
  annotationSets: z.array(z.string().trim().min(1)).default([]),
  redundancy: z.number().int().min(1).max(10).default(1)
});

export type CreateJobBody = z.infer<typeof createJobBodySchema>;

export const listJobsQuerySchema = z.object({
  role: z.enum(['worker', 'admin']).default('worker')
});

/**
 * Narrows a mask_toggle job to a subset of the masks in its annotation set, so
 * one full-corpus bundle can serve many jobs. `perValue` caps each distinct
 * value of `field` across the whole bundle, not per frame — the point is to hit
 * a target count for a rare group whose members are scattered one per frame.
 * Frames left with no selected mask get no task.
 */
const maskSelectorSchema = z.object({
  field: z.string().trim().min(1), // key in the mask's masks.json entry, e.g. "stratum"
  include: z.array(z.string()).nonempty().optional(), // absent → every value
  perValue: z.number().int().positive().optional(), // absent → no cap
  seed: z.number().int().optional()
});

export const materializeBodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('manifest'),
    content: z.string().min(1).optional(), // absent → use the manifest from the bundle zip
    format: z.enum(['csv', 'jsonl']).optional(),
    masks: maskSelectorSchema.optional()
  }),
  z.object({
    kind: z.literal('filter'),
    sampleN: z.number().int().positive().optional(), // absent → all frames
    seed: z.number().int().optional(),
    masks: maskSelectorSchema.optional()
  })
]);

export type MaskSelector = z.infer<typeof maskSelectorSchema>;

export type MaterializeBody = z.infer<typeof materializeBodySchema>;
