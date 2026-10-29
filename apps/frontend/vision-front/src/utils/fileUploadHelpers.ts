import { epochService, type UploadEpochData } from '../services/epochService';
import { runEvaluationService } from '../services/runEvaluationService';

export interface UploadResult {
  successful: Array<{ name: string; operation: string }>;
  failed: Array<{ name: string; error: string }>;
}

/**
 * Reads each file as JSON and hands it to `handle`, which uploads it and returns what it did.
 * One bad file is reported in `failed` and does not stop the rest.
 */
const processJsonFiles = async <T>(
  files: FileList,
  handle: (data: T) => Promise<string>
): Promise<UploadResult> => {
  const successfulFiles: UploadResult['successful'] = [];
  const failedFiles: UploadResult['failed'] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!file.name.endsWith('.json')) {
      failedFiles.push({ name: file.name, error: 'Invalid file type (must be .json)' });
      continue;
    }

    try {
      const operation = await handle(JSON.parse(await file.text()));
      successfulFiles.push({ name: file.name, operation });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      failedFiles.push({ name: file.name, error: message });
    }
  }

  return { successful: successfulFiles, failed: failedFiles };
};

export const processEpochFiles = (files: FileList, trainingId: string): Promise<UploadResult> =>
  processJsonFiles(files, async (epochData: UploadEpochData) => {
    const epoch = { ...epochData, trainingId };
    // An epoch that carries an id updates that epoch; if there is none to update, it is created.
    const epochId = epochData._id || epochData.epoch_uuid;
    if (epochId) {
      try {
        await epochService.updateEpoch(epochId, epoch);
        return 'updated';
      } catch {
        // fall through to create
      }
    }
    await epochService.uploadEpoch(epoch, trainingId);
    return 'created';
  });

export const processEvaluationFiles = (files: FileList): Promise<UploadResult> =>
  processJsonFiles(files, async (evaluationData: Parameters<typeof runEvaluationService.upload>[0]) => {
    await runEvaluationService.upload(evaluationData);
    return 'uploaded';
  });
