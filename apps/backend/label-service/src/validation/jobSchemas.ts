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
  taskType: z.enum(TASK_TYPES),
  question: z.object({
    prompt: z.string().trim().min(1, 'prompt required').max(500),
    choices: z.array(choiceSchema).min(2).optional()
  }),
  redundancy: z.number().int().min(1).max(10).default(1)
});

export type CreateJobBody = z.infer<typeof createJobBodySchema>;
