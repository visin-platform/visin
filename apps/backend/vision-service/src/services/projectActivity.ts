import Project from '../models/Project';

/** A project written to more often than this is not rewritten: a training posting an epoch a second would be a write a second. */
const MIN_INTERVAL_MS = 60_000;

/**
 * Notes that something happened in a project (a run started or posted an epoch, a finding or a result was recorded,
 * its settings changed), so "recently active" means what it says rather than "its settings were last edited".
 *
 * One conditional write, no read: it is skipped by the database when the project was already marked within the last
 * minute. Never fails the change that caused it, and costs nothing for a project that no longer exists.
 */
export async function touchProjectActivity(projectId: string | undefined, now = new Date()): Promise<void> {
  if (!projectId) return;
  try {
    await Project.updateOne(
      {
        _id: projectId,
        $or: [{ lastActivityAt: { $exists: false } }, { lastActivityAt: { $lt: new Date(now.getTime() - MIN_INTERVAL_MS) } }]
      },
      { $set: { lastActivityAt: now } },
      { timestamps: false }
    );
  } catch {
    // The caller's change stands either way; the next one marks it.
  }
}
