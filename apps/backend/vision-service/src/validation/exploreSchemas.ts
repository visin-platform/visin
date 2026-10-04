import { z } from '@visin/backend-core';

/** What the public project catalogue can be asked: newest changes or newest projects, a search, a page. */
export const publicProjectsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  /** `updated`: the project was last edited. `created`: the project was made. */
  sort: z.enum(['updated', 'created']).default('updated'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12)
});
export type PublicProjectsQuery = z.infer<typeof publicProjectsQuerySchema>;

/** The latest findings in public projects: how many. */
export const publicFindingsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5)
});
export type PublicFindingsQuery = z.infer<typeof publicFindingsQuerySchema>;
