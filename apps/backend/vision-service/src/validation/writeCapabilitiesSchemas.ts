import { z } from '@visin/backend-core';

export const writeCapabilitiesQuerySchema = z.object({
  kind: z.enum(['project', 'training', 'comparison', 'benchmark', 'test-result', 'analysis', 'dataset']),
  ids: z.string().max(2499).transform(value => value.split(',')).pipe(z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).min(1).max(100))
});
