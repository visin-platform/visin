import { epochService } from '../services/epochService';
import { testResultService } from '../services/testResultService';

export interface UploadResult {
  successful: Array<{ name: string; operation: string }>;
  failed: Array<{ name: string; error: string }>;
}

export const processEpochFiles = async (
  files: FileList,
  trainingId: string
): Promise<UploadResult> => {
  const successfulFiles: Array<{ name: string; operation: string }> = [];
  const failedFiles: Array<{ name: string; error: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!file.name.endsWith('.json')) {
      const error = 'Invalid file type (must be .json)';
      failedFiles.push({ name: file.name, error });
      continue;
    }

    try {
      const content = await file.text();
      const epochData = JSON.parse(content);

      // Check if epoch has an ID (_id or epoch_uuid)
      const epochId = epochData._id || epochData.epoch_uuid;
      let operation = 'created';

      if (epochId) {
        // Try to update existing epoch
        try {
          await epochService.updateEpoch(epochId, {
            ...epochData,
            trainingId
          });
          operation = 'updated';
        } catch {
          // If update fails, try to create new epoch
          await epochService.uploadEpoch(
            { ...epochData, trainingId },
            trainingId
          );
          operation = 'created';
        }
      } else {
        // No ID provided, create new epoch
        await epochService.uploadEpoch(
          { ...epochData, trainingId },
          trainingId
        );
        operation = 'created';
      }

      successfulFiles.push({ name: file.name, operation });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      failedFiles.push({ name: file.name, error: message });
    }
  }

  return { successful: successfulFiles, failed: failedFiles };
};

export const processTestResultFiles = async (
  files: FileList
): Promise<UploadResult> => {
  const successfulFiles: Array<{ name: string; operation: string }> = [];
  const failedFiles: Array<{ name: string; error: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!file.name.endsWith('.json')) {
      const error = 'Invalid file type (must be .json)';
      failedFiles.push({ name: file.name, error });
      continue;
    }

    try {
      const content = await file.text();
      const testResultData = JSON.parse(content);

      // Upload test result
      await testResultService.uploadTestResult(testResultData);

      successfulFiles.push({ name: file.name, operation: 'uploaded' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      failedFiles.push({ name: file.name, error: message });
    }
  }

  return { successful: successfulFiles, failed: failedFiles };
};
