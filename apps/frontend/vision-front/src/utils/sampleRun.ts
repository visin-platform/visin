import { visionApi } from '../config/visionApi';

/** Marks a run as the onboarding sample, so "has this person sent a real run yet?" can leave it out. */
export const SAMPLE_TAG = 'visin-sample';
export const SAMPLE_EPOCHS = 20;

export interface SampleResults {
  train: { loss: number };
  val: { loss: number; mean_iou: number };
}

/**
 * The quickstart's made-up numbers for one epoch (docs `quickstart.mdx`,
 * `train_one_epoch`), so the button, the snippets and the docs all produce the
 * same run. Aggregate metrics only: a class name here would be a literal the
 * charts are not allowed to know about.
 */
export function sampleEpoch(epoch: number, noise: () => number = Math.random): SampleResults {
  const trainLoss = 1.2 * Math.exp(-epoch / 6) + 0.1 + noise() * 0.02;
  return {
    train: { loss: trainLoss },
    val: { loss: trainLoss + 0.05 + 0.002 * epoch, mean_iou: 0.3 + 0.35 * (1 - Math.exp(-epoch / 5)) }
  };
}

/** How far a sample run got: enough to carry on from there after a failure. */
export interface SampleRunProgress {
  runUuid: string;
  trainingId?: string;
  /** epochs stored so far */
  sent: number;
}

export const startSampleRun = (): SampleRunProgress => ({ runUuid: crypto.randomUUID(), sent: 0 });

/** `visionApi` keeps the HTTP status on the errors it throws. */
const isConflict = (error: unknown): boolean => (error as { status?: number } | null)?.status === 409;

/**
 * Send the sample run into `projectId` with the signed-in session, reporting
 * after each step. Safe to call again with the last progress after a failure:
 * each epoch has a fixed uuid, so one that was stored before the failure
 * answers 409 and is counted rather than duplicated.
 */
export async function sendSampleRun(
  projectId: string,
  progress: SampleRunProgress,
  onProgress: (progress: SampleRunProgress) => void
): Promise<SampleRunProgress> {
  let current = { ...progress };

  if (!current.trainingId) {
    try {
      const created = await visionApi.post('/trainings', {
        uuid: current.runUuid,
        name: 'Sample run',
        status: 'running',
        tags: [SAMPLE_TAG],
        projectId
      });
      current = { ...current, trainingId: (created.data as { data: { _id: string } }).data._id };
    } catch (error) {
      if (!isConflict(error)) throw error;
      // Created by the attempt that failed on its way back.
      const found = await visionApi.get(`/trainings/uuid/${current.runUuid}`);
      current = { ...current, trainingId: (found.data as { data: { _id: string } }).data._id };
    }
    onProgress(current);
  }

  for (let epoch = current.sent + 1; epoch <= SAMPLE_EPOCHS; epoch += 1) {
    try {
      await visionApi.post('/epochs/upload', {
        training_uuid: current.runUuid,
        epoch_uuid: `${current.runUuid}-epoch-${epoch}`,
        epoch,
        results: sampleEpoch(epoch)
      });
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
    current = { ...current, sent: epoch };
    onProgress(current);
  }

  await visionApi.put(`/trainings/${current.trainingId}`, { status: 'completed' });
  return current;
}
