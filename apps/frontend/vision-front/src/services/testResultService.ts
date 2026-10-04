import { visionApi } from '../config/visionApi';
import { TestResult, CreateTestResultData, ApiResponse, TestResultsPaginatedResponse } from '../types';
import type { Evaluation } from '../types/evaluation';

/**
 * A test result is an evaluation a run reported: its results, the run and epoch it came from, and no ranking unless it
 * was scored on a suite. These calls read and write the evaluations API and present each evaluation in the shape the
 * run and project pages were built for, so that a test and a ranked result are one record to the server and one list
 * to the person looking.
 */

/** What the list endpoint adds to an evaluation that came from a run. */
type RunEvaluation = Evaluation & {
  run?: { _id: string; name: string; uuid: string; status: string };
  epochInfo?: { epoch: number; epoch_time?: number };
};

const asTestResult = (evaluation: RunEvaluation): TestResult => ({
  _id: evaluation._id,
  test_uuid: evaluation.uuid,
  epoch: evaluation.source?.epoch ?? evaluation.epochInfo?.epoch ?? 0,
  epoch_uuid: evaluation.source?.epochUuid ?? '',
  timestamp: evaluation.executedAt ?? evaluation.receivedAt,
  test_results: (evaluation.results ?? {}) as TestResult['test_results'],
  createdAt: evaluation.createdAt,
  updatedAt: evaluation.createdAt,
  ...(evaluation.run ? { training: evaluation.run } : {}),
  ...(evaluation.epochInfo ? { epoch_info: { epoch: evaluation.epochInfo.epoch, epoch_time: evaluation.epochInfo.epoch_time ?? 0 } } : {})
});

export const testResultService = {
  /** What runs reported, newest first; a run's own with `training_uuid`, a project's with `projectId`. */
  async getTestResults(params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: 'asc' | 'desc';
    epoch?: number;
    epoch_uuids?: string;
    training_uuid?: string;
    projectId?: string;
  }): Promise<TestResultsPaginatedResponse> {
    const { training_uuid, epoch_uuids, sortBy, ...rest } = params ?? {};
    const response = await visionApi.get('/evaluations', {
      params: {
        ...rest,
        ...(training_uuid ? { trainingUuid: training_uuid } : {}),
        ...(epoch_uuids ? { epochUuids: epoch_uuids } : {}),
        // Only the orders an evaluation list knows: when it was stored, when it ran, or its epoch.
        ...(sortBy === 'epoch' ? { sortBy: 'epoch' } : sortBy === 'timestamp' ? { sortBy: 'executedAt' } : {}),
        include: 'results'
      }
    });
    const { data } = response.data as ApiResponse<{ evaluations: RunEvaluation[]; pagination: { page: number; limit: number; total: number; pages: number } }>;
    return { success: true, data: { testResults: data.evaluations.map(asTestResult), pagination: data.pagination } } as TestResultsPaginatedResponse;
  },

  /** A result file a run wrote (`epoch`, `epoch_uuid`, `test_uuid`, `timestamp`, `test_results`), recorded as an evaluation of that epoch. */
  async uploadTestResult(testResultData: CreateTestResultData): Promise<ApiResponse<Evaluation>> {
    const response = await visionApi.post('/evaluations', {
      ...(testResultData.test_uuid ? { uuid: testResultData.test_uuid } : {}),
      results: testResultData.test_results,
      source: { epochUuid: testResultData.epoch_uuid, epoch: testResultData.epoch },
      ...(testResultData.timestamp ? { executedAt: testResultData.timestamp } : {})
    });
    return response.data as ApiResponse<Evaluation>;
  },

  /** Into the trash, with the rest of what the run recorded when the run goes. */
  async deleteTestResult(id: string): Promise<ApiResponse<Evaluation>> {
    const response = await visionApi.delete(`/evaluations/${id}`);
    return response.data as ApiResponse<Evaluation>;
  }
};
