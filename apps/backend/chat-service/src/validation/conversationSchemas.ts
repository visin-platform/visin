import { z } from 'zod';
import { id } from './commonSchemas';

export const createSchema = z
  .object({
    kind: z.enum(['assistant', 'direct', 'room', 'group', 'project']),
    title: z.string().trim().min(1).max(120),
    handles: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    userIds: z.array(id).max(20).default([]),
    assistantId: id.optional(),
    groupId: id.optional(),
    projectId: id.optional(),
    /** a research paper to analyse in a private chat */
    paperId: id.optional(),
    trainingIds: z.array(id).max(20).default([])
  })
  .strict();

export const membershipActionSchema = z.enum(['accept', 'decline', 'leave', 'block']);
export const participantHandleSchema = z.string().trim().min(1).max(80);
export const participantIdSchema = z.string().min(1).max(80);
