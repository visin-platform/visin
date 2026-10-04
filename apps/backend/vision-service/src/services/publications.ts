import { logger } from '@visin/backend-core';
import Evaluation from '../models/Evaluation';
import { invalidatePublic } from './publicCache';

/**
 * Take results off public leaderboards for good: their publication is cleared, so making a project or suite public
 * again does not bring back what a manager published under other circumstances. Publishing is a decision about one
 * result at one time; going private ends it, and a restore, like a trashed result's, never publishes by itself.
 */
export async function clearPublications(where: { projectId: string } | { 'suite.id': string }, why: string): Promise<number> {
  const cleared = await Evaluation.updateMany(
    { ...where, publishedAt: { $ne: null } },
    { $unset: { publishedAt: 1, publishedBy: 1 } }
  );
  invalidatePublic();
  if (cleared.modifiedCount > 0) logger.info('Withdrew published results', { ...where, why, count: cleared.modifiedCount });
  return cleared.modifiedCount;
}
