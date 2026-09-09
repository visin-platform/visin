import { logger } from '@visin/backend-core';
import Project from '../models/Project';
import { ResolvedCosting, TrainingCost, costOf, resolveCosting } from '../models/costing';

export type { ResolvedCosting, TrainingCost };
export { costOf, resolveCosting };

/**
 * Rates for a set of trainings, keyed by project id. Projects that have not priced
 * their hardware are simply absent from the map.
 *
 * Costs are summed across trainings that may belong to different projects — and a
 * training need not belong to one at all — so rates are resolved per row rather
 * than once for the whole query. One indexed query covers the whole page.
 */
export const costingByProject = async (
  projectIds: Array<string | undefined>
): Promise<Map<string, ResolvedCosting>> => {
  const ids = Array.from(new Set(projectIds.filter((id): id is string => Boolean(id))));
  const byProject = new Map<string, ResolvedCosting>();
  if (ids.length === 0) {
    return byProject;
  }

  // `Training.projectId` is a free string, so a malformed one makes Mongoose throw
  // a CastError on the whole `$in`. Costs are advisory, so a bad id degrades to
  // "unpriced" rather than failing the caller's list request.
  try {
    const projects = await Project.find({ _id: { $in: ids } }, 'costing');
    projects.forEach(project => {
      const costing = resolveCosting(project.costing);
      if (costing) {
        byProject.set(project._id.toString(), costing);
      }
    });
  } catch (error) {
    logger.warn('Could not load project cost rates; costs will be omitted', {
      error: (error as Error).message
    });
  }
  return byProject;
};

/** The rate card for one project id, or null when it has none. */
export const costingFor = (
  byProject: Map<string, ResolvedCosting>,
  projectId?: string
): ResolvedCosting | null => (projectId && byProject.get(projectId)) || null;
