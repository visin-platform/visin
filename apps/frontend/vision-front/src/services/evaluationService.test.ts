import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { evaluationService, publicLeaderboardService, suiteService } from './evaluationService';

const api = vi.mocked(visionApi);
const reply = (data: unknown) => ({ data: { success: true, data } });

describe('evaluationService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requests recorded rankings and sets verification through the shared API', async () => {
    api.get.mockResolvedValue(reply({ entries: [], verification: 'unverified' }));
    expect(await evaluationService.leaderboard({ verification: 'unverified', metric: 'score', page: 2 })).toEqual({ entries: [], verification: 'unverified' });
    expect(api.get).toHaveBeenLastCalledWith('/evaluations/leaderboard', { params: { verification: 'unverified', metric: 'score', page: 2 } });
    api.post.mockResolvedValue(reply({ verified: true, verifiedAt: '2026-10-04T10:00:00Z', verifiedBy: 'manager' }));
    expect(await evaluationService.verify('e1', true)).toMatchObject({ verified: true, verifiedBy: 'manager' });
    expect(api.post).toHaveBeenLastCalledWith('/evaluations/e1/verification', { verified: true });
  });

  it('lists with its filters and returns the page', async () => {
    api.get.mockResolvedValue(reply({ evaluations: [], pagination: { page: 2 } }));
    const page = await evaluationService.list({
      projectId: 'p1',
      suite: 'road-test@1',
      state: 'eligible',
      page: 2,
      limit: 10
    });
    expect(api.get).toHaveBeenCalledWith('/evaluations', {
      params: { projectId: 'p1', suite: 'road-test@1', state: 'eligible', page: 2, limit: 10 }
    });
    expect(page).toEqual({ evaluations: [], pagination: { page: 2 } });
  });

  it('reads one, trashes it and restores it by id', async () => {
    api.get.mockResolvedValue(reply({ _id: 'e1' }));
    api.delete.mockResolvedValue(reply({ _id: 'e1' }));
    api.post.mockResolvedValue(reply({ _id: 'e1' }));
    expect(await evaluationService.get('e1')).toEqual({ _id: 'e1' });
    expect(api.get).toHaveBeenCalledWith('/evaluations/e1');
    await evaluationService.trash('e1');
    expect(api.delete).toHaveBeenCalledWith('/evaluations/e1');
    await evaluationService.restore('e1');
    expect(api.post).toHaveBeenCalledWith('/evaluations/e1/restore');
  });

  it('promotes a test result with the checkpoint and counts it was given', async () => {
    api.post.mockResolvedValue(reply({ _id: 'e2' }));
    const body = {
      evaluationId: 'tr1',
      suite: 'road-test@1',
      checkpoint: { kind: 'local' as const, sha256: 'a'.repeat(64), label: 'x' },
      sampleCounts: { day: 1 }
    };
    expect(await evaluationService.promote(body)).toEqual({ _id: 'e2' });
    expect(api.post).toHaveBeenCalledWith('/evaluations/promote', body);
  });
});

describe('suiteService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists suites, sending archived ones only when asked', async () => {
    api.get.mockResolvedValue(reply({ suites: [] }));
    await suiteService.list();
    expect(api.get).toHaveBeenLastCalledWith('/suites', { params: { includeArchived: undefined } });
    await suiteService.list({ slug: 'road-test', includeArchived: true, limit: 100 });
    expect(api.get).toHaveBeenLastCalledWith('/suites', {
      params: { slug: 'road-test', includeArchived: 'true', limit: 100 }
    });
  });

  it('reads a suite and its leaderboard by name and version', async () => {
    api.get.mockResolvedValueOnce(reply({ slug: 'road-test' })).mockResolvedValueOnce(reply({ entries: [] }));
    expect(await suiteService.get('road-test', 'latest')).toEqual({ slug: 'road-test' });
    expect(api.get).toHaveBeenCalledWith('/suites/road-test/latest');
    expect(await suiteService.leaderboard('road-test', '1')).toEqual({ entries: [] });
    expect(api.get).toHaveBeenCalledWith('/suites/road-test/1/leaderboard');
  });
});

describe('evaluationService publication', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publishes and withdraws by id', async () => {
    api.post.mockResolvedValue(reply({ _id: 'e1' }));
    expect(await evaluationService.publish('e1')).toEqual({ _id: 'e1' });
    expect(api.post).toHaveBeenLastCalledWith('/evaluations/e1/publish');
    await evaluationService.withdraw('e1');
    expect(api.post).toHaveBeenLastCalledWith('/evaluations/e1/withdraw');
  });
});

describe('publicLeaderboardService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the anonymous endpoints', async () => {
    api.get
      .mockResolvedValueOnce(reply({ leaderboards: [{ slug: 'road-test' }] }))
      .mockResolvedValueOnce(reply({ entries: [] }))
      .mockResolvedValueOnce(reply({ evaluationId: 'e1' }));
    expect(await publicLeaderboardService.list()).toEqual([{ slug: 'road-test' }]);
    expect(api.get).toHaveBeenLastCalledWith('/public/leaderboards');
    expect(await publicLeaderboardService.get('road-test', '1')).toEqual({ entries: [] });
    expect(api.get).toHaveBeenLastCalledWith('/public/leaderboards/road-test/1');
    expect(await publicLeaderboardService.evaluation('e1')).toEqual({ evaluationId: 'e1' });
    expect(api.get).toHaveBeenLastCalledWith('/public/evaluations/e1');
  });
});

describe('leaderboard pagination', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends pages and limits to the suite, public discovery and public ranking endpoints', async () => {
    api.get.mockResolvedValue(reply({ entries: [], leaderboards: [], pagination: { page: 2 } }));
    await suiteService.leaderboard('road-test', '1', { page: 2, limit: 10, unrankedPage: 3 });
    expect(api.get).toHaveBeenLastCalledWith('/suites/road-test/1/leaderboard', {
      params: { page: 2, limit: 10, unrankedPage: 3 }
    });
    const discovery = await publicLeaderboardService.listPage({ page: 2, limit: 10 });
    expect(discovery.pagination.page).toBe(2);
    expect(api.get).toHaveBeenLastCalledWith('/public/leaderboards', { params: { page: 2, limit: 10 } });
    await publicLeaderboardService.get('road-test', '1', { page: 2, limit: 10 });
    expect(api.get).toHaveBeenLastCalledWith('/public/leaderboards/road-test/1', { params: { page: 2, limit: 10 } });
  });
});
