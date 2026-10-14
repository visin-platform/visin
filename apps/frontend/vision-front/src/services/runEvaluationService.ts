import { visionApi } from '../config/visionApi';
import { RunEvaluation, CreateRunEvaluationData, ApiResponse, RunEvaluationsResponse } from '../types';
import type { Evaluation } from '../types/evaluation';

/**
 * A test result is an evaluation a run reported: its results, the run and epoch it came from, and no ranking unless it
 * was scored on a suite. These calls read and write the evaluations API and present each evaluation in the shape the
 * run and project pages were built for, so that a test and a ranked result are one record to the server and one list
 * to the person looking.
 */

/** What the list endpoint adds to an evaluation that came from a run. */
type ListedEvaluation = Evaluation & {
  run?: { _id: string; name: string; uuid: string; status: string };
  epochInfo?: { epoch: number; epoch_time?: number };
};

const asRunEvaluation = (evaluation: ListedEvaluation): RunEvaluation => ({
  _id: evaluation._id,
  test_uuid: evaluation.uuid,
  epoch: evaluation.source?.epoch ?? evaluation.epochInfo?.epoch ?? 0,
  epoch_uuid: evaluation.source?.epochUuid ?? '',
  timestamp: evaluation.executedAt ?? evaluation.receivedAt,
  test_results: (evaluation.results ?? {}) as RunEvaluation['test_results'],
  createdAt: evaluation.createdAt,
  updatedAt: evaluation.createdAt,
  ...(evaluation.run ? { training: evaluation.run } : {}),
  ...(evaluation.suite ? { suite: { id: evaluation.suite.id, slug: evaluation.suite.slug, version: evaluation.suite.version } } : {}),
  ...(evaluation.validation ? { validation: evaluation.validation } : {}),
  ...(evaluation.publishedAt ? { publishedAt: evaluation.publishedAt } : {}),
  ...(evaluation.checkpoint ? { checkpoint: evaluation.checkpoint } : {}),
  ...(evaluation.epochInfo ? { epoch_info: { epoch: evaluation.epochInfo.epoch, epoch_time: evaluation.epochInfo.epoch_time ?? 0 } } : {})
});

export const runEvaluationService = {
  /** What runs reported, newest first; a run's own with `training_uuid`, a project's with `projectId`. */
  async list(params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: 'asc' | 'desc';
    epoch?: number;
    epoch_uuids?: string;
    training_uuid?: string;
    projectId?: string;
  }): Promise<RunEvaluationsResponse> {
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
    const { data } = response.data as ApiResponse<{ evaluations: ListedEvaluation[]; pagination: { page: number; limit: number; total: number; pages: number } }>;
    return { success: true, data: { evaluations: data.evaluations.map(asRunEvaluation), pagination: data.pagination } } as RunEvaluationsResponse;
  },

  /** A result file a run wrote (`epoch`, `epoch_uuid`, `test_uuid`, `timestamp`, `test_results`), recorded as an evaluation of that epoch. */
  async upload(evaluationData: CreateRunEvaluationData): Promise<ApiResponse<Evaluation>> {
    const response = await visionApi.post('/evaluations', {
      ...(evaluationData.test_uuid ? { uuid: evaluationData.test_uuid } : {}),
      results: evaluationData.test_results,
      source: { epochUuid: evaluationData.epoch_uuid, epoch: evaluationData.epoch },
      ...(evaluationData.timestamp ? { executedAt: evaluationData.timestamp } : {})
    });
    return response.data as ApiResponse<Evaluation>;
  },

  /** Into the trash, with the rest of what the run recorded when the run goes. */
  async trash(id: string): Promise<ApiResponse<Evaluation>> {
    const response = await visionApi.delete(`/evaluations/${id}`);
    return response.data as ApiResponse<Evaluation>;
  }
};
