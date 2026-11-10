import { z } from 'zod';
import { id } from './commonSchemas';

export const assistantInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    personality: z.string().trim().max(1500).default(''),
    paused: z.boolean().default(false),
    /** Make this the analyst new private analyses start with (true), or stop being so (false). Absent leaves it as it is. */
    default: z.boolean().optional()
  })
  .strict();

export const sharedAssistantSchema = z
  .object({
    action: z.enum(['add', 'remove', 'consent', 'switch', 'lock', 'addition-policy']),
    assistantId: id.optional(),
    whoCanAdd: z.enum(['everyone', 'admins']).optional(),
    enabled: z.boolean().optional()
  })
  .strict();
