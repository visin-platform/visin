import { ConflictError } from '@visin/backend-core';
import Suite from '../models/Suite';
import SuiteSlug from '../models/SuiteSlug';

/** Claim a name before inserting any version. Claims survive failed inserts and project purges. */
export async function reserveSuiteSlug(slug: string, projectId: string): Promise<void> {
  // Bootstrap suites published before reservations existed without letting a new project take their name.
  const owners = await Suite.distinct('projectId', { slug });
  if (owners.length > 1) {
    throw new ConflictError(`The suite name "${slug}" has conflicting historical ownership; resolve it before publishing or purging`);
  }
  const taken = () => new ConflictError(`The suite name "${slug}" belongs to another project; choose another`);
  if (owners.length === 1 && owners[0] !== projectId) throw taken();

  try {
    await SuiteSlug.create({ _id: slug, projectId });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const winner = await SuiteSlug.findById(slug);
    if (!winner) throw error;
    if (winner.projectId !== projectId) throw taken();
  }
}
