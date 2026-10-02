import Training from '../models/Training';
import Project from '../models/Project';
import { assertResourceWrite } from './writeAccessService';

/** Server receipt time, never a replay's historical timestamp. Terminal runs stay terminal. */
export async function touchTraining(trainingId: string) {
  const now = new Date();
  await Training.updateOne({ _id: trainingId, deletedAt: null }, { $set: { lastSeenAt: now } });
  await Training.updateOne({ _id: trainingId, deletedAt: null, status: 'stalled' }, { $set: { status: 'running' } });
  return now;
}

/** A cheap, idempotent heartbeat, with the same contribution rules as an epoch write. */
export async function heartbeatTraining(trainingId: string, userId?: string) {
  const training = await Training.findOne({ _id: trainingId, deletedAt: null });
  await assertResourceWrite(training, userId);
  return { lastSeenAt: await touchTraining(trainingId) };
}

/** Mark silent running jobs, rechecking receipt time atomically against concurrent heartbeats. */
export async function stallSilentTrainings(now = new Date()) {
  const projects = await Project.find({ trashedAt: null }).select('stallAfterMinutes');
  let stalled = 0;
  for (const project of projects) {
    const cutoff = new Date(now.getTime() - (project.stallAfterMinutes ?? 30) * 60_000);
    const result = await Training.updateMany({
      projectId: project._id.toString(), deletedAt: null, status: 'running',
      $or: [
        { lastSeenAt: { $lt: cutoff } },
        { lastSeenAt: null, updatedAt: { $lt: cutoff } }
      ]
    }, { $set: { status: 'stalled' } });
    stalled += result.modifiedCount;
  }
  return stalled;
}
