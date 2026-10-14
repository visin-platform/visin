import type { ILabelJob } from '../models/LabelJob';

/** Null matches the missing generation on jobs/tasks from before staging. */
export const taskSet = (job: Pick<ILabelJob, '_id' | 'taskGeneration'>) => ({
  jobId: job._id, generation: job.taskGeneration ?? null
});
