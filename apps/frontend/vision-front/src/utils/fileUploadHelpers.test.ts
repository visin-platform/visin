import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEpochFiles, processTestResultFiles } from './fileUploadHelpers';

vi.mock('../services/epochService', () => ({
  epochService: {
    updateEpoch: vi.fn(),
    uploadEpoch: vi.fn()
  }
}));

vi.mock('../services/testResultService', () => ({
  testResultService: {
    uploadTestResult: vi.fn()
  }
}));

import { epochService } from '../services/epochService';
import { testResultService } from '../services/testResultService';

const makeFile = (name: string, content: string): File =>
  new File([content], name, { type: 'application/json' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processEpochFiles', () => {
  it('rejects non-.json files without calling the service', async () => {
    const files = [makeFile('epoch.txt', '{}')] as unknown as FileList;

    const result = await processEpochFiles(files, 'training-1');

    expect(result.failed).toEqual([{ name: 'epoch.txt', error: 'Invalid file type (must be .json)' }]);
    expect(epochService.uploadEpoch).not.toHaveBeenCalled();
    expect(epochService.updateEpoch).not.toHaveBeenCalled();
  });

  it('creates a new epoch when the file has no _id or epoch_uuid', async () => {
    (epochService.uploadEpoch as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const files = [makeFile('epoch.json', JSON.stringify({ epoch: 1 }))] as unknown as FileList;

    const result = await processEpochFiles(files, 'training-1');

    expect(epochService.uploadEpoch).toHaveBeenCalledWith({ epoch: 1, trainingId: 'training-1' }, 'training-1');
    expect(result.successful).toEqual([{ name: 'epoch.json', operation: 'created' }]);
  });

  it('updates an existing epoch when epoch_uuid is present and the update succeeds', async () => {
    (epochService.updateEpoch as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const files = [makeFile('epoch.json', JSON.stringify({ epoch_uuid: 'u1' }))] as unknown as FileList;

    const result = await processEpochFiles(files, 'training-1');

    expect(epochService.updateEpoch).toHaveBeenCalledWith('u1', { epoch_uuid: 'u1', trainingId: 'training-1' });
    expect(epochService.uploadEpoch).not.toHaveBeenCalled();
    expect(result.successful).toEqual([{ name: 'epoch.json', operation: 'updated' }]);
  });

  it('falls back to creating the epoch when the update call fails', async () => {
    (epochService.updateEpoch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not found'));
    (epochService.uploadEpoch as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const files = [makeFile('epoch.json', JSON.stringify({ epoch_uuid: 'u1' }))] as unknown as FileList;

    const result = await processEpochFiles(files, 'training-1');

    expect(epochService.uploadEpoch).toHaveBeenCalled();
    expect(result.successful).toEqual([{ name: 'epoch.json', operation: 'created' }]);
  });

  it('records a failure with the parse error message for invalid JSON', async () => {
    const files = [makeFile('epoch.json', 'not json')] as unknown as FileList;

    const result = await processEpochFiles(files, 'training-1');

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].name).toBe('epoch.json');
    expect(result.successful).toEqual([]);
  });

  it('processes multiple files independently, collecting both successes and failures', async () => {
    (epochService.uploadEpoch as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const files = [
      makeFile('good.json', JSON.stringify({ epoch: 1 })),
      makeFile('bad.txt', '{}')
    ] as unknown as FileList;

    const result = await processEpochFiles(files, 'training-1');

    expect(result.successful).toEqual([{ name: 'good.json', operation: 'created' }]);
    expect(result.failed).toEqual([{ name: 'bad.txt', error: 'Invalid file type (must be .json)' }]);
  });
});

describe('processTestResultFiles', () => {
  it('uploads a valid test result file', async () => {
    (testResultService.uploadTestResult as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const files = [makeFile('result.json', JSON.stringify({ test_uuid: 't1' }))] as unknown as FileList;

    const result = await processTestResultFiles(files);

    expect(testResultService.uploadTestResult).toHaveBeenCalledWith({ test_uuid: 't1' });
    expect(result.successful).toEqual([{ name: 'result.json', operation: 'uploaded' }]);
  });

  it('rejects non-.json files', async () => {
    const files = [makeFile('result.csv', 'a,b')] as unknown as FileList;

    const result = await processTestResultFiles(files);

    expect(result.failed).toEqual([{ name: 'result.csv', error: 'Invalid file type (must be .json)' }]);
    expect(testResultService.uploadTestResult).not.toHaveBeenCalled();
  });

  it('records the service error message when the upload rejects', async () => {
    (testResultService.uploadTestResult as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('server exploded'));
    const files = [makeFile('result.json', JSON.stringify({ test_uuid: 't1' }))] as unknown as FileList;

    const result = await processTestResultFiles(files);

    expect(result.failed).toEqual([{ name: 'result.json', error: 'server exploded' }]);
  });
});
