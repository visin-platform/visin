import { logger } from '@visin/backend-core';
import { PushPreference } from '../models/PushPreference';
import { sendToUsers } from './pushService';

export interface FinishedRun {
  userId: string;
  trainingId: string;
  name: string;
  status: 'completed' | 'failed';
  projectName?: string;
}

/** Whether this person wants to hear about their runs. Yes until they say otherwise. */
export async function wantsRunAlerts(userId: string): Promise<boolean> {
  return (await PushPreference.findOne({ userId }).select('runs').lean())?.runs !== false;
}

export async function setRunAlerts(userId: string, runs: boolean): Promise<void> {
  await PushPreference.updateOne({ userId }, { $set: { runs } }, { upsert: true });
}

/**
 * Tells a run's owner that it finished or failed, on the devices they turned notifications on for. One notification per
 * run (its tag and topic), so a status written twice is one line. Like every push here it never throws: the run's
 * status is already saved.
 */
export async function notifyRunFinished(run: FinishedRun): Promise<number> {
  try {
    if (!(await wantsRunAlerts(run.userId))) return 0;
    const failed = run.status === 'failed';
    return await sendToUsers(
      [run.userId],
      {
        title: failed ? 'Run failed' : 'Run finished',
        body: run.projectName ? `${run.name} · ${run.projectName}` : run.name,
        tag: `run:${run.trainingId}`,
        url: `/trainings/${run.trainingId}`
      },
      { topic: run.trainingId, ttlSeconds: 6 * 60 * 60 }
    );
  } catch (error) {
    logger.warn('Run notification failed', { error: error instanceof Error ? error.message : 'unknown' });
    return 0;
  }
}
