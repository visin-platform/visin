import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockedApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('../config/visionApi', () => ({ visionApi: mockedApi }));

import { findingService } from './findingService';

const finding = { _id: 'f1', title: 'T', body: 'B', trainingIds: [] };

beforeEach(() => vi.clearAllMocks());

describe('findingService', () => {
  it('lists for a project, unwrapping the envelope every controller sends', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [finding] } });

    await expect(findingService.list({ project: 'clftv2' })).resolves.toEqual([finding]);
    expect(mockedApi.get).toHaveBeenCalledWith('/findings', { params: { project: 'clftv2' } });
  });

  it('lists for a run', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });

    await findingService.list({ training: 't1' });

    expect(mockedApi.get).toHaveBeenCalledWith('/findings', { params: { training: 't1' } });
  });

  it('creates one and returns the stored record', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: finding } });

    await expect(
      findingService.create({ project: 'p1', title: 'T', body: 'B' })
    ).resolves.toEqual(finding);
    expect(mockedApi.post).toHaveBeenCalledWith('/findings', { project: 'p1', title: 'T', body: 'B' });
  });

  it('deletes by id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });

    await findingService.remove('f1');

    expect(mockedApi.delete).toHaveBeenCalledWith('/findings/f1');
  });
});

it('passes pagination alongside the existing filters', async () => {
  mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
  const params = { project: 'p1', training: 't1', limit: 50, before: '2026-09-01T00:00:00.000Z_507f1f77bcf86cd799439011' };
  await findingService.list(params);
  expect(mockedApi.get).toHaveBeenCalledWith('/findings', { params });
});
