import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@visin/frontend-core', () => ({ createApiClient: () => client }));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'https://auth.example.test' }) }));

import { apiKeyService, PIPELINE_SCOPES } from './apiKeyService';

describe('apiKeyService', () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only the caller's keys limited to the project", async () => {
    client.get.mockResolvedValue({
      data: [
        { id: 'k1', project: { id: 'p1', name: 'A' } },
        { id: 'k2', project: { id: 'p2', name: 'B' } },
        { id: 'k3', project: null }
      ]
    });

    expect((await apiKeyService.listForProject('p1')).map((key) => key.id)).toEqual(['k1']);
    expect(client.get).toHaveBeenCalledWith('/auth/api-keys');
  });

  it('creates a key limited to the project with only what a pipeline needs', async () => {
    client.post.mockResolvedValue({ data: { key: { id: 'k1' }, token: 'vsn_live_x' } });

    expect(await apiKeyService.createPipelineKey('p1', 'nightly', 90)).toEqual({ key: { id: 'k1' }, token: 'vsn_live_x' });
    expect(client.post).toHaveBeenCalledWith('/auth/api-keys', { name: 'nightly', scopes: PIPELINE_SCOPES, projectId: 'p1', expiresInDays: 90 });

    await apiKeyService.createPipelineKey('p1', 'forever');
    expect(client.post).toHaveBeenLastCalledWith('/auth/api-keys', { name: 'forever', scopes: PIPELINE_SCOPES, projectId: 'p1' });
  });

  it('revokes by id', async () => {
    client.post.mockResolvedValue({});
    await apiKeyService.revoke('k1');
    expect(client.post).toHaveBeenCalledWith('/auth/api-keys/k1/revoke', {});
  });
});
