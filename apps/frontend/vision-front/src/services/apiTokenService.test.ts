import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import { apiTokenService } from './apiTokenService';

const mockedApi = vi.mocked(visionApi);

describe('apiTokenService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTokens fetches tokens for a project', async () => {
    mockedApi.get.mockResolvedValue({ data: { success: true, data: [] } });
    const result = await apiTokenService.getTokens('proj-1');
    expect(mockedApi.get).toHaveBeenCalledWith('/api-tokens/project/proj-1');
    expect(result).toEqual({ success: true, data: [] });
  });

  it('createToken posts token data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { _id: 't1' } } });
    const result = await apiTokenService.createToken({ name: 'token', projectId: 'proj-1', expiresInDays: 30 });
    expect(mockedApi.post).toHaveBeenCalledWith('/api-tokens', { name: 'token', projectId: 'proj-1', expiresInDays: 30 });
    expect(result).toEqual({ success: true, data: { _id: 't1' } });
  });

  it('revokeToken deletes by id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    const result = await apiTokenService.revokeToken('t1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/api-tokens/t1');
    expect(result).toEqual({ success: true });
  });
});
