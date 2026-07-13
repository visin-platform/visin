import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../services/epochService', () => ({
  epochService: { deleteEpoch: vi.fn() }
}));
vi.mock('../services/trainingService', () => ({
  trainingService: { deleteTraining: vi.fn() }
}));
vi.mock('../services/testResultService', () => ({
  testResultService: { deleteTestResult: vi.fn() }
}));
vi.mock('../utils/fileUploadHelpers', () => ({
  processEpochFiles: vi.fn(),
  processTestResultFiles: vi.fn()
}));
vi.mock('../utils/latexGenerator', () => ({
  generateLatexCode: vi.fn(() => '\\latex')
}));

import { epochService } from '../services/epochService';
import { trainingService } from '../services/trainingService';
import { testResultService } from '../services/testResultService';
import { processEpochFiles, processTestResultFiles } from '../utils/fileUploadHelpers';
import { useTrainingActions } from './useTrainingActions';

const mockedEpoch = vi.mocked(epochService);
const mockedTraining = vi.mocked(trainingService);
const mockedTestResult = vi.mocked(testResultService);
const mockedProcessEpoch = vi.mocked(processEpochFiles);
const mockedProcessTestResult = vi.mocked(processTestResultFiles);

const makeFileList = (names: string[]): FileList => {
  const files = names.map((n) => new File(['x'], n));
  return {
    ...files,
    length: files.length,
    item: (i: number) => files[i],
    [Symbol.iterator]: function* () {
      yield* files;
    }
  } as unknown as FileList;
};

describe('useTrainingActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when there are no files or no trainingId', async () => {
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingActions({ trainingId: undefined, refetch, onTrainingDeleted: vi.fn() }));

    await act(async () => {
      await result.current.handleFileUpload(makeFileList(['a.json']), 'epoch');
    });

    expect(mockedProcessEpoch).not.toHaveBeenCalled();
  });

  it('uploads epoch files and reports success + refetches', async () => {
    mockedProcessEpoch.mockResolvedValue({ successful: [{ name: 'a.json', operation: 'created' }], failed: [] });
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingActions({ trainingId: 't1', refetch, onTrainingDeleted: vi.fn() }));

    await act(async () => {
      await result.current.handleFileUpload(makeFileList(['a.json']), 'epoch');
    });

    expect(mockedProcessEpoch).toHaveBeenCalledWith(expect.anything(), 't1');
    expect(refetch).toHaveBeenCalled();
    expect(result.current.uploadSuccess).toBe('1 file(s) processed successfully');
  });

  it('uploads test result files via processTestResultFiles', async () => {
    mockedProcessTestResult.mockResolvedValue({ successful: [], failed: [{ name: 'b.json', error: 'bad json' }] });
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingActions({ trainingId: 't1', refetch, onTrainingDeleted: vi.fn() }));

    await act(async () => {
      await result.current.handleFileUpload(makeFileList(['b.json']), 'testResult');
    });

    expect(mockedProcessTestResult).toHaveBeenCalled();
    expect(result.current.uploadError).toBe('Failed to process 1 file(s)');
    expect(refetch).not.toHaveBeenCalled();
  });

  it('clears upload success/error messages after 5 seconds', async () => {
    mockedProcessEpoch.mockResolvedValue({ successful: [{ name: 'a.json', operation: 'created' }], failed: [] });
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingActions({ trainingId: 't1', refetch, onTrainingDeleted: vi.fn() }));

    await act(async () => {
      await result.current.handleFileUpload(makeFileList(['a.json']), 'epoch');
    });
    expect(result.current.uploadSuccess).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.uploadSuccess).toBeNull();
  });

  it('handleDeleteClick opens the delete dialog with the target epoch', () => {
    const { result } = renderHook(() => useTrainingActions({ trainingId: 't1', refetch: vi.fn(), onTrainingDeleted: vi.fn() }));
    const epoch = { _id: 'e1' } as any;

    act(() => {
      result.current.handleDeleteClick(epoch);
    });

    expect(result.current.deleteOpen).toBe(true);
    expect(result.current.deleteTarget).toBe(epoch);
  });

  it('handleConfirmDelete deletes the epoch and refetches', async () => {
    mockedEpoch.deleteEpoch.mockResolvedValue({ success: true } as any);
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingActions({ trainingId: 't1', refetch, onTrainingDeleted: vi.fn() }));

    act(() => {
      result.current.handleDeleteClick({ _id: 'e1' } as any);
    });

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(mockedEpoch.deleteEpoch).toHaveBeenCalledWith('e1');
    expect(refetch).toHaveBeenCalled();
    expect(result.current.deleteOpen).toBe(false);
    expect(result.current.uploadSuccess).toBe('Epoch deleted successfully');
  });

  it('handleConfirmDelete surfaces an error message on failure', async () => {
    mockedEpoch.deleteEpoch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTrainingActions({ trainingId: 't1', refetch: vi.fn(), onTrainingDeleted: vi.fn() }));

    act(() => {
      result.current.handleDeleteClick({ _id: 'e1' } as any);
    });

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(result.current.uploadError).toBe('boom');
  });

  it('handleConfirmDeleteTraining deletes the training and calls onTrainingDeleted', async () => {
    mockedTraining.deleteTraining.mockResolvedValue({ success: true } as any);
    const onTrainingDeleted = vi.fn();
    const { result } = renderHook(() => useTrainingActions({ trainingId: 't1', refetch: vi.fn(), onTrainingDeleted }));

    await act(async () => {
      await result.current.handleConfirmDeleteTraining();
    });

    expect(mockedTraining.deleteTraining).toHaveBeenCalledWith('t1');
    expect(onTrainingDeleted).toHaveBeenCalled();
  });

  it('handleDeleteTestResult deletes the test result and refetches', async () => {
    mockedTestResult.deleteTestResult.mockResolvedValue({ success: true } as any);
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingActions({ trainingId: 't1', refetch, onTrainingDeleted: vi.fn() }));

    await act(async () => {
      await result.current.handleDeleteTestResult('tr1');
    });

    expect(mockedTestResult.deleteTestResult).toHaveBeenCalledWith('tr1');
    expect(refetch).toHaveBeenCalled();
    expect(result.current.uploadSuccess).toBe('Test result deleted successfully');
  });

  it('handleLatexExport generates latex code and opens the modal', () => {
    const { result } = renderHook(() => useTrainingActions({ trainingId: 't1', refetch: vi.fn(), onTrainingDeleted: vi.fn() }));

    act(() => {
      result.current.handleLatexExport({ _id: 'tr1' } as any);
    });

    expect(result.current.latexCode).toBe('\\latex');
    expect(result.current.latexModalOpen).toBe(true);
  });
});
