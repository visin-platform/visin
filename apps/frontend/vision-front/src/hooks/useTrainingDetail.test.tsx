import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../services/trainingService', () => ({
  trainingService: { getTrainingWithEpochs: vi.fn() }
}));
vi.mock('../services/configService', () => ({
  configService: { getConfigById: vi.fn() }
}));
vi.mock('../services/testResultService', () => ({
  testResultService: { getTestResults: vi.fn() }
}));

import { trainingService } from '../services/trainingService';
import { configService } from '../services/configService';
import { testResultService } from '../services/testResultService';
import { useTrainingDetail } from './useTrainingDetail';

const mockedTraining = vi.mocked(trainingService);
const mockedConfig = vi.mocked(configService);
const mockedTestResult = vi.mocked(testResultService);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useTrainingDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedTestResult.getTestResults.mockResolvedValue({
      success: true,
      data: { testResults: [], pagination: {} as any }
    });
  });

  it('does not query when id is undefined', () => {
    renderHook(() => useTrainingDetail(undefined), { wrapper: makeWrapper() });
    expect(mockedTraining.getTrainingWithEpochs).not.toHaveBeenCalled();
  });

  it('loads training + epochs and skips config fetch when there is no configId', async () => {
    mockedTraining.getTrainingWithEpochs.mockResolvedValue({
      success: true,
      data: { training: { _id: 't1', uuid: 'uuid-1' } as any, epochs: [{ epoch: 1 }] as any }
    });

    const { result } = renderHook(() => useTrainingDetail('t1'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.training?._id).toBe('t1');
    expect(result.current.epochs).toHaveLength(1);
    expect(mockedConfig.getConfigById).not.toHaveBeenCalled();
    expect(result.current.config).toBeNull();
  });

  it('fetches the config when the training has a configId', async () => {
    mockedTraining.getTrainingWithEpochs.mockResolvedValue({
      success: true,
      data: { training: { _id: 't1', uuid: 'uuid-1', configId: 'c1' } as any, epochs: [] }
    });
    mockedConfig.getConfigById.mockResolvedValue({ success: true, data: { _id: 'c1' } as any });

    const { result } = renderHook(() => useTrainingDetail('t1'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.training?._id).toBe('t1'));
    await waitFor(() => expect(mockedConfig.getConfigById).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(result.current.config).toEqual({ _id: 'c1' }));
  });

  it('groups test results by epoch and auto-selects the first available epoch', async () => {
    mockedTraining.getTrainingWithEpochs.mockResolvedValue({
      success: true,
      data: { training: { _id: 't1', uuid: 'uuid-1' } as any, epochs: [] }
    });
    mockedTestResult.getTestResults.mockResolvedValue({
      success: true,
      data: {
        testResults: [
          { _id: 'tr1', epoch: 2 },
          { _id: 'tr2', epoch: 1 },
          { _id: 'tr3', epoch: 1 }
        ] as any,
        pagination: {} as any
      }
    });

    const { result } = renderHook(() => useTrainingDetail('t1'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.training?._id).toBe('t1'));
    await waitFor(() => expect(result.current.availableTestEpochs).toEqual([1, 2]));

    expect(result.current.selectedTestEpoch).toBe(1);
    expect(result.current.testResults).toHaveLength(2);
    expect(result.current.allTestResults).toHaveLength(3);
  });

  it('updates displayed testResults when selectedTestEpoch changes', async () => {
    mockedTraining.getTrainingWithEpochs.mockResolvedValue({
      success: true,
      data: { training: { _id: 't1', uuid: 'uuid-1' } as any, epochs: [] }
    });
    mockedTestResult.getTestResults.mockResolvedValue({
      success: true,
      data: {
        testResults: [
          { _id: 'tr1', epoch: 2 },
          { _id: 'tr2', epoch: 1 }
        ] as any,
        pagination: {} as any
      }
    });

    const { result } = renderHook(() => useTrainingDetail('t1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.training?._id).toBe('t1'));
    await waitFor(() => expect(result.current.selectedTestEpoch).toBe(1));

    act(() => {
      result.current.setSelectedTestEpoch(2);
    });

    await waitFor(() => expect(result.current.testResults[0]?._id).toBe('tr1'));
  });

  it('resets state when the test results fetch fails', async () => {
    mockedTraining.getTrainingWithEpochs.mockResolvedValue({
      success: true,
      data: { training: { _id: 't1', uuid: 'uuid-1' } as any, epochs: [] }
    });
    mockedTestResult.getTestResults.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useTrainingDetail('t1'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.training?._id).toBe('t1'));
    await waitFor(() => expect(mockedTestResult.getTestResults).toHaveBeenCalled());
    await waitFor(() => expect(result.current.testResultsLoading).toBe(false));
    expect(result.current.testResults).toEqual([]);
    expect(result.current.availableTestEpochs).toEqual([]);
    expect(result.current.selectedTestEpoch).toBeNull();
  });
});
