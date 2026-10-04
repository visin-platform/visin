import { visionApi } from '../config/visionApi';
import type { ApiResponse } from '../types';
import type {
  RecordedLeaderboardPage,
  RecordedLeaderboardQuery,
  Evaluation,
  EvaluationPage,
  EvaluationQuery,
  Leaderboard,
  LeaderboardPageQuery,
  PublicLeaderboardListPage,
  PromoteRequest,
  PublicEvaluation,
  PublicLeaderboard,
  PublicLeaderboardListItem,
  Suite,
  SubmissionPolicy,
  SuitePage,
  SuiteSubmissions
} from '../types/evaluation';

export const evaluationService = {
  async leaderboard(params: RecordedLeaderboardQuery): Promise<RecordedLeaderboardPage> {
    const response = await visionApi.get('/evaluations/leaderboard', { params: { ...params } });
    return (response.data as ApiResponse<RecordedLeaderboardPage>).data;
  },

  /** Managers and their automated jobs use the same verification action. */
  async verify(id: string, verified: boolean): Promise<{ verified: boolean; verifiedAt?: string; verifiedBy?: string }> {
    const response = await visionApi.post(`/evaluations/${id}/verification`, { verified });
    return (response.data as ApiResponse<{ verified: boolean; verifiedAt?: string; verifiedBy?: string }>).data;
  },

  async list(params: EvaluationQuery): Promise<EvaluationPage> {
    const response = await visionApi.get('/evaluations', { params: { ...params } });
    return (response.data as ApiResponse<EvaluationPage>).data;
  },

  async get(id: string): Promise<Evaluation> {
    const response = await visionApi.get(`/evaluations/${id}`);
    return (response.data as ApiResponse<Evaluation>).data;
  },

  async trash(id: string): Promise<Evaluation> {
    const response = await visionApi.delete(`/evaluations/${id}`);
    return (response.data as ApiResponse<Evaluation>).data;
  },

  async restore(id: string): Promise<Evaluation> {
    const response = await visionApi.post(`/evaluations/${id}/restore`);
    return (response.data as ApiResponse<Evaluation>).data;
  },

  /** Put a ranked result on its suite's public leaderboard. Needs manage on the project. */
  async publish(id: string): Promise<Evaluation> {
    const response = await visionApi.post(`/evaluations/${id}/publish`);
    return (response.data as ApiResponse<Evaluation>).data;
  },

  async withdraw(id: string): Promise<Evaluation> {
    const response = await visionApi.post(`/evaluations/${id}/withdraw`);
    return (response.data as ApiResponse<Evaluation>).data;
  },

  /** A manager of a suite shows another project's pending submission. */
  async approve(id: string): Promise<void> {
    await visionApi.post(`/evaluations/${id}/approve`);
  },

  /** A manager of a suite takes a published result off its leaderboard, with a reason. */
  async hide(id: string, reason: string): Promise<void> {
    await visionApi.post(`/evaluations/${id}/hide`, { reason });
  },

  async unhide(id: string): Promise<void> {
    await visionApi.post(`/evaluations/${id}/unhide`);
  },

  /** Copy a legacy test result into an evaluation so it can be ranked. */
  async promote(body: PromoteRequest): Promise<Evaluation> {
    const response = await visionApi.post('/evaluations/promote', body);
    return (response.data as ApiResponse<Evaluation>).data;
  }
};

export const suiteService = {
  async list(params: { slug?: string; projectId?: string; includeArchived?: boolean; page?: number; limit?: number } = {}): Promise<SuitePage> {
    const response = await visionApi.get('/suites', { params: { ...params, includeArchived: params.includeArchived ? 'true' : undefined } });
    return (response.data as ApiResponse<SuitePage>).data;
  },

  async get(slug: string, version: string): Promise<Suite> {
    const response = await visionApi.get(`/suites/${slug}/${version}`);
    return (response.data as ApiResponse<Suite>).data;
  },

  async update(slug: string, version: string, body: { submissions?: SubmissionPolicy; archived?: boolean; visibility?: 'private' | 'public' }): Promise<Suite> {
    const response = await visionApi.patch(`/suites/${slug}/${version}`, body);
    return (response.data as ApiResponse<Suite>).data;
  },

  /** What waits for approval on a suite and what was hidden from it; only a manager of the suite's project may ask. */
  async submissions(slug: string, version: string): Promise<SuiteSubmissions> {
    const response = await visionApi.get(`/suites/${slug}/${version}/submissions`);
    return (response.data as ApiResponse<SuiteSubmissions>).data;
  },

  async leaderboard(slug: string, version: string, params?: LeaderboardPageQuery): Promise<Leaderboard> {
    const response = await visionApi.get(`/suites/${slug}/${version}/leaderboard`, ...(params ? [{ params: { ...params } }] : []));
    return (response.data as ApiResponse<Leaderboard>).data;
  }
};

/** The anonymous rankings: the same answer whoever asks, and never cached. */
export const publicLeaderboardService = {
  async listPage(params: LeaderboardPageQuery): Promise<PublicLeaderboardListPage> {
    const response = await visionApi.get('/public/leaderboards', { params: { ...params } });
    return (response.data as ApiResponse<PublicLeaderboardListPage>).data;
  },

  async list(): Promise<PublicLeaderboardListItem[]> {
    const response = await visionApi.get('/public/leaderboards');
    return (response.data as ApiResponse<{ leaderboards: PublicLeaderboardListItem[] }>).data.leaderboards;
  },

  async get(slug: string, version: string, params?: LeaderboardPageQuery): Promise<PublicLeaderboard> {
    const response = await visionApi.get(`/public/leaderboards/${slug}/${version}`, ...(params ? [{ params: { ...params } }] : []));
    return (response.data as ApiResponse<PublicLeaderboard>).data;
  },

  async evaluation(id: string): Promise<PublicEvaluation> {
    const response = await visionApi.get(`/public/evaluations/${id}`);
    return (response.data as ApiResponse<PublicEvaluation>).data;
  }
};
